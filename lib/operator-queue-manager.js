import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import RetryUtility from './retry-utility.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Operator Queue Manager
 * Handles automatic conversation cleanup in ChatGPT Operator
 */
class OperatorQueueManager {
    constructor(options = {}) {
        this.options = {
            autoCleanupThreshold: 10,
            preserveLatest: 2,
            cleanupInterval: 5,
            enableAutoCleanup: true,
            dryRun: false,
            debug: false,
            // Enhanced error handling options
            maxRetries: 3,
            retryDelay: 1000,
            enableCircuitBreaker: true,
            circuitBreakerThreshold: 5,
            // Health monitoring options
            enableHealthCheck: true,
            healthCheckInterval: 30000,
            // Validation options
            validateAfterCleanup: true,
            backupBeforeCleanup: false,
            ...options
        };
        
        // Load the queue cleaner script with error handling
        try {
            this.cleanerScript = readFileSync(
                join(__dirname, '../scripts/operator-queue-cleaner.js'), 
                'utf8'
            );
        } catch (error) {
            throw new Error(`Failed to load queue cleaner script: ${error.message}`);
        }
        
        this.stats = {
            conversationCount: 0,
            cleanupCount: 0,
            totalDeleted: 0,
            lastCleanup: null,
            errors: [],
            successRate: 1.0,
            averageCleanupTime: 0,
            healthScore: 100
        };
        
        // Circuit breaker state
        this.circuitBreaker = {
            failures: 0,
            lastFailure: null,
            isOpen: false
        };
        
        // Initialize retry utility
        this.retryUtility = new RetryUtility({
            maxRetries: this.options.maxRetries,
            baseDelay: this.options.retryDelay
        });
        
        this.logger = options.logger || console.log;
        this.isInitialized = false;
    }
    
    /**
     * Inject the queue cleaner script into the Operator page with retry logic
     */
    async injectScript(page) {
        return await this.retryUtility.executeWithRetry(async () => {
            // Validate page is accessible
            await this.validatePageAccess(page);
            
            // Inject the core cleaner script
            await page.evaluate(this.cleanerScript);
            
            // Add enhanced monitoring and management functions
            await page.evaluate(() => {
                window.OperatorQueueManagement = {
                    getConversationCount: () => {
                        try {
                            return document.querySelectorAll('.group.relative > button').length;
                        } catch (error) {
                            console.error('Error getting conversation count:', error);
                            return 0;
                        }
                    },
                    getConversationDetails: () => {
                        try {
                            const buttons = document.querySelectorAll('.group.relative > button');
                            return Array.from(buttons).map((btn, index) => ({
                                index,
                                text: btn.textContent || '',
                                hasMenu: !!btn.getAttribute('aria-controls'),
                                isVisible: btn.offsetParent !== null,
                                timestamp: Date.now()
                            }));
                        } catch (error) {
                            console.error('Error getting conversation details:', error);
                            return [];
                        }
                    },
                    validateConversationStructure: () => {
                        const expectedSelectors = [
                            '.group.relative > button',
                            '[role="button"]'
                        ];
                        return expectedSelectors.some(selector => 
                            document.querySelectorAll(selector).length > 0
                        );
                    },
                    getLastCleanup: () => window.__lastCleanupTime || null,
                    setLastCleanup: (time) => window.__lastCleanupTime = time,
                    getHealthStatus: () => ({
                        scriptLoaded: typeof window.OperatorQueueCleaner !== 'undefined',
                        conversationsDetected: document.querySelectorAll('.group.relative > button').length > 0,
                        pageResponsive: document.readyState === 'complete',
                        timestamp: Date.now()
                    })
                };
            });
            
            // Validate injection was successful
            const validationResult = await page.evaluate(() => {
                return {
                    cleanerLoaded: typeof window.OperatorQueueCleaner !== 'undefined',
                    managementLoaded: typeof window.OperatorQueueManagement !== 'undefined',
                    structureValid: window.OperatorQueueManagement?.validateConversationStructure()
                };
            });
            
            if (!validationResult.cleanerLoaded || !validationResult.managementLoaded) {
                throw new Error('Script injection validation failed');
            }
            
            this.isInitialized = true;
            this.log('Queue manager script injected and validated successfully');
            return true;
        }, 'script injection').catch(error => {
            this.log(`Error injecting script: ${error.message}`, 'error');
            this.handleError('injection', error);
            return false;
        });
    }
    
    /**
     * Check conversation count and trigger cleanup if needed
     */
    async checkAndCleanup(page) {
        // Check circuit breaker
        if (!this.isCircuitBreakerClosed()) {
            this.log('Circuit breaker is open, skipping cleanup check', 'warn');
            return { cleaned: false, reason: 'circuit_breaker_open' };
        }

        // Ensure initialization
        if (!this.isInitialized) {
            const injected = await this.injectScript(page);
            if (!injected) {
                return { cleaned: false, error: 'Script injection failed' };
            }
        }

        try {
            // Get health status first
            const healthStatus = await page.evaluate(() => 
                window.OperatorQueueManagement.getHealthStatus()
            );
            
            if (!healthStatus.scriptLoaded || !healthStatus.pageResponsive) {
                throw new Error('Page or script not ready for cleanup operations');
            }

            const count = await page.evaluate(() => 
                window.OperatorQueueManagement.getConversationCount()
            );
            
            this.stats.conversationCount = count;
            this.log(`Current conversation count: ${count}`);
            
            if (count >= this.options.autoCleanupThreshold && this.options.enableAutoCleanup) {
                this.log(`Threshold reached (${count}/${this.options.autoCleanupThreshold}), starting cleanup...`);
                const result = await this.executeCleanup(page);
                
                if (result.success) {
                    this.updateSuccessRate(true);
                }
                
                return result;
            }
            
            return { cleaned: false, count, healthy: true };
        } catch (error) {
            this.log(`Error checking conversations: ${error.message}`, 'error');
            this.handleError('check', error);
            return { cleaned: false, error: error.message };
        }
    }
    
    /**
     * Execute conversation cleanup with enhanced validation and error handling
     */
    async executeCleanup(page, options = {}) {
        const startTime = Date.now();
        const preserveLatest = options.preserveLatest !== undefined 
            ? options.preserveLatest 
            : this.options.preserveLatest;
        
        try {
            // Pre-cleanup validation
            const preCount = await page.evaluate(() => 
                window.OperatorQueueManagement.getConversationCount()
            );
            
            if (preCount <= preserveLatest) {
                return {
                    success: false,
                    reason: 'Not enough conversations to clean',
                    count: preCount,
                    preserveLatest
                };
            }
            
            if (this.options.dryRun) {
                const toDelete = Math.max(0, preCount - preserveLatest);
                this.log(`[DRY RUN] Would delete ${toDelete} conversations`);
                return { 
                    success: true, 
                    deleted: 0, 
                    wouldDelete: toDelete,
                    dryRun: true 
                };
            }
            
            // Backup conversations if enabled
            let conversationBackup = null;
            if (this.options.backupBeforeCleanup) {
                conversationBackup = await page.evaluate(() => 
                    window.OperatorQueueManagement.getConversationDetails()
                );
                this.log(`Backed up ${conversationBackup.length} conversation details`);
            }
            
            // Execute cleanup with retry
            const result = await this.retryUtility.executeWithRetry(async () => {
                return await page.evaluate(async (preserve) => {
                    const options = { preserveLatest: preserve };
                    const result = await window.OperatorQueueCleaner.processButtons(options);
                    window.OperatorQueueManagement.setLastCleanup(Date.now());
                    return result;
                }, preserveLatest);
            }, 'cleanup execution');
            
            const duration = Date.now() - startTime;
            
            // Post-cleanup validation
            const expectedRemaining = preserveLatest;
            const validationPassed = await this.validateCleanupResults(page, expectedRemaining);
            
            // Update statistics
            this.stats.cleanupCount++;
            this.stats.totalDeleted += result.successCount;
            this.stats.lastCleanup = new Date().toISOString();
            
            // Update average cleanup time
            this.stats.averageCleanupTime = this.stats.averageCleanupTime === 0 
                ? duration 
                : (this.stats.averageCleanupTime + duration) / 2;
            
            const cleanupResult = {
                success: result.successCount > 0,
                deleted: result.successCount,
                failed: result.failCount,
                remaining: preCount - result.successCount,
                duration,
                timestamp: new Date().toISOString(),
                validationPassed,
                backup: conversationBackup ? conversationBackup.length : 0
            };
            
            if (!validationPassed) {
                cleanupResult.warning = 'Post-cleanup validation failed';
            }
            
            this.log(`Cleanup complete: ${JSON.stringify(cleanupResult)}`);
            
            // Update health score
            this.updateHealthScore();
            
            return cleanupResult;
        } catch (error) {
            this.log(`Cleanup failed: ${error.message}`, 'error');
            this.handleError('cleanup', error);
            
            return {
                success: false,
                error: error.message,
                duration: Date.now() - startTime,
                timestamp: new Date().toISOString()
            };
        }
    }
    
    /**
     * Get conversation details for advanced cleanup strategies
     */
    async getConversationDetails(page) {
        try {
            return await page.evaluate(() => 
                window.OperatorQueueManagement.getConversationDetails()
            );
        } catch (error) {
            this.log(`Error getting conversation details: ${error.message}`, 'error');
            return [];
        }
    }
    
    /**
     * Smart cleanup based on conversation patterns
     */
    async smartCleanup(page, options = {}) {
        const details = await this.getConversationDetails(page);
        
        // Implement smart cleanup logic
        const toDelete = details.filter((conv, index) => {
            // Don't delete if we need to preserve
            if (options.preserveLatest && index >= details.length - options.preserveLatest) {
                return false;
            }
            
            // Don't delete if it matches preserve patterns
            if (options.preservePatterns) {
                for (const pattern of options.preservePatterns) {
                    if (conv.text.toLowerCase().includes(pattern.toLowerCase())) {
                        return false;
                    }
                }
            }
            
            // Delete if it matches delete patterns
            if (options.deletePatterns) {
                for (const pattern of options.deletePatterns) {
                    if (conv.text.toLowerCase().includes(pattern.toLowerCase())) {
                        return true;
                    }
                }
            }
            
            return true;
        });
        
        this.log(`Smart cleanup: Found ${toDelete.length} conversations to delete`);
        
        // Execute targeted deletion
        // This would require a more sophisticated deletion mechanism
        return await this.executeCleanup(page, { 
            preserveLatest: details.length - toDelete.length 
        });
    }
    
    /**
     * Get current statistics
     */
    getStats() {
        return {
            ...this.stats,
            uptime: this.stats.lastCleanup 
                ? Date.now() - new Date(this.stats.lastCleanup).getTime() 
                : null
        };
    }
    
    /**
     * Reset statistics
     */
    resetStats() {
        this.stats = {
            conversationCount: 0,
            cleanupCount: 0,
            totalDeleted: 0,
            lastCleanup: null,
            errors: []
        };
    }
    
    /**
     * Validate page access and readiness
     */
    async validatePageAccess(page) {
        try {
            await page.evaluate(() => {
                if (document.readyState !== 'complete') {
                    throw new Error('Page not fully loaded');
                }
                if (!document.body) {
                    throw new Error('Document body not available');
                }
                return true;
            });
        } catch (error) {
            throw new Error(`Page validation failed: ${error.message}`);
        }
    }

    /**
     * Handle errors and update circuit breaker state
     */
    handleError(type, error) {
        const errorRecord = {
            type,
            error: error.message,
            timestamp: Date.now(),
            stack: error.stack
        };
        
        this.stats.errors.push(errorRecord);
        
        // Update circuit breaker
        if (this.options.enableCircuitBreaker) {
            this.circuitBreaker.failures++;
            this.circuitBreaker.lastFailure = Date.now();
            
            if (this.circuitBreaker.failures >= this.options.circuitBreakerThreshold) {
                this.circuitBreaker.isOpen = true;
                this.log(`Circuit breaker opened after ${this.circuitBreaker.failures} failures`, 'error');
            }
        }
        
        // Update success rate
        this.updateSuccessRate(false);
        
        // Update health score
        this.updateHealthScore();
    }

    /**
     * Update success rate based on operation result
     */
    updateSuccessRate(success) {
        const totalOperations = this.stats.cleanupCount + this.stats.errors.length;
        if (totalOperations > 0) {
            const successfulOperations = this.stats.cleanupCount - this.stats.errors.filter(e => e.type === 'cleanup').length;
            this.stats.successRate = successfulOperations / totalOperations;
        }
    }

    /**
     * Update health score based on recent performance
     */
    updateHealthScore() {
        let score = 100;
        
        // Penalize for recent errors
        const recentErrors = this.stats.errors.filter(
            e => Date.now() - e.timestamp < 300000 // Last 5 minutes
        );
        score -= recentErrors.length * 10;
        
        // Penalize for low success rate
        if (this.stats.successRate < 0.8) {
            score -= (0.8 - this.stats.successRate) * 50;
        }
        
        // Penalize for circuit breaker state
        if (this.circuitBreaker.isOpen) {
            score -= 30;
        }
        
        this.stats.healthScore = Math.max(0, Math.min(100, score));
    }

    /**
     * Check if circuit breaker allows operation
     */
    isCircuitBreakerClosed() {
        if (!this.options.enableCircuitBreaker) return true;
        
        if (!this.circuitBreaker.isOpen) return true;
        
        // Check if enough time has passed to try again
        const timeSinceLastFailure = Date.now() - this.circuitBreaker.lastFailure;
        if (timeSinceLastFailure > 60000) { // 1 minute cooldown
            this.circuitBreaker.isOpen = false;
            this.circuitBreaker.failures = 0;
            this.log('Circuit breaker reset after cooldown');
            return true;
        }
        
        return false;
    }

    /**
     * Validate cleanup results
     */
    async validateCleanupResults(page, expectedCount) {
        if (!this.options.validateAfterCleanup) return true;
        
        try {
            const actualCount = await page.evaluate(() => 
                window.OperatorQueueManagement.getConversationCount()
            );
            
            const isValid = actualCount === expectedCount;
            if (!isValid) {
                this.log(`Cleanup validation failed: expected ${expectedCount}, got ${actualCount}`, 'error');
            }
            
            return isValid;
        } catch (error) {
            this.log(`Cleanup validation error: ${error.message}`, 'error');
            return false;
        }
    }

    /**
     * Internal logging method
     */
    log(message, level = 'info') {
        if (this.options.debug || level === 'error') {
            const prefix = `[Queue Manager]`;
            const timestamp = new Date().toISOString();
            this.logger(`${timestamp} ${prefix} ${message}`);
        }
    }
}

export default OperatorQueueManager;
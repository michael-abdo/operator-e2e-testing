import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

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
            ...options
        };
        
        // Load the queue cleaner script
        this.cleanerScript = readFileSync(
            join(__dirname, '../scripts/operator-queue-cleaner.js'), 
            'utf8'
        );
        
        this.stats = {
            conversationCount: 0,
            cleanupCount: 0,
            totalDeleted: 0,
            lastCleanup: null,
            errors: []
        };
        
        this.logger = options.logger || console.log;
    }
    
    /**
     * Inject the queue cleaner script into the Operator page
     */
    async injectScript(page) {
        try {
            await page.evaluate(this.cleanerScript);
            
            // Add monitoring and management functions
            await page.evaluate(() => {
                window.OperatorQueueManagement = {
                    getConversationCount: () => {
                        return document.querySelectorAll('.group.relative > button').length;
                    },
                    getConversationDetails: () => {
                        const buttons = document.querySelectorAll('.group.relative > button');
                        return Array.from(buttons).map((btn, index) => ({
                            index,
                            text: btn.textContent || '',
                            hasMenu: !!btn.getAttribute('aria-controls')
                        }));
                    },
                    getLastCleanup: () => window.__lastCleanupTime || null,
                    setLastCleanup: (time) => window.__lastCleanupTime = time
                };
            });
            
            this.log('Queue manager script injected successfully');
            return true;
        } catch (error) {
            this.log(`Error injecting script: ${error.message}`, 'error');
            this.stats.errors.push({ type: 'injection', error: error.message, timestamp: Date.now() });
            return false;
        }
    }
    
    /**
     * Check conversation count and trigger cleanup if needed
     */
    async checkAndCleanup(page) {
        try {
            const count = await page.evaluate(() => 
                window.OperatorQueueManagement.getConversationCount()
            );
            
            this.stats.conversationCount = count;
            this.log(`Current conversation count: ${count}`);
            
            if (count >= this.options.autoCleanupThreshold && this.options.enableAutoCleanup) {
                this.log(`Threshold reached (${count}/${this.options.autoCleanupThreshold}), starting cleanup...`);
                return await this.executeCleanup(page);
            }
            
            return { cleaned: false, count };
        } catch (error) {
            this.log(`Error checking conversations: ${error.message}`, 'error');
            this.stats.errors.push({ type: 'check', error: error.message, timestamp: Date.now() });
            return { cleaned: false, error: error.message };
        }
    }
    
    /**
     * Execute conversation cleanup
     */
    async executeCleanup(page, options = {}) {
        const startTime = Date.now();
        const preserveLatest = options.preserveLatest !== undefined 
            ? options.preserveLatest 
            : this.options.preserveLatest;
        
        try {
            if (this.options.dryRun) {
                const count = await page.evaluate(() => 
                    window.OperatorQueueManagement.getConversationCount()
                );
                const toDelete = Math.max(0, count - preserveLatest);
                this.log(`[DRY RUN] Would delete ${toDelete} conversations`);
                return { 
                    success: true, 
                    deleted: 0, 
                    wouldDelete: toDelete,
                    dryRun: true 
                };
            }
            
            const result = await page.evaluate(async (preserve) => {
                const options = { preserveLatest: preserve };
                const result = await window.OperatorQueueCleaner.processButtons(options);
                window.OperatorQueueManagement.setLastCleanup(Date.now());
                return result;
            }, preserveLatest);
            
            const duration = Date.now() - startTime;
            
            // Update statistics
            this.stats.cleanupCount++;
            this.stats.totalDeleted += result.successCount;
            this.stats.lastCleanup = new Date().toISOString();
            
            const cleanupResult = {
                success: true,
                deleted: result.successCount,
                failed: result.failCount,
                remaining: this.stats.conversationCount - result.successCount,
                duration,
                timestamp: new Date().toISOString()
            };
            
            this.log(`Cleanup complete: ${JSON.stringify(cleanupResult)}`);
            
            return cleanupResult;
        } catch (error) {
            this.log(`Cleanup failed: ${error.message}`, 'error');
            this.stats.errors.push({ 
                type: 'cleanup', 
                error: error.message, 
                timestamp: Date.now() 
            });
            
            return {
                success: false,
                error: error.message,
                duration: Date.now() - startTime
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
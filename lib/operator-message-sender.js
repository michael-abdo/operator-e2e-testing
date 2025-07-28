/**
 * Operator Message Sender with Queue Management Integration
 * Handles sending messages to ChatGPT Operator with automatic queue management
 */

import OperatorQueueManager from './operator-queue-manager.js';
import QueueMetrics from './queue-metrics.js';
import CleanupStrategies from './cleanup-strategies.js';
import RetryUtility from './retry-utility.js';
import HealthQueueMonitor from './health-queue-monitor.js';

export class OperatorMessageSenderWithResponse {
    constructor(options = {}) {
        this.options = {
            port: options.port || 9222,
            session: options.session || null,
            logger: options.logger || console.log,
            // Queue management options
            enableQueueManagement: options.enableQueueManagement !== false,
            queueCleanupThreshold: options.queueCleanupThreshold || 10,
            preserveLatestConversations: options.preserveLatestConversations || 2,
            enableQueueAutoCleanup: options.enableQueueAutoCleanup !== false,
            cleanupStrategy: options.cleanupStrategy || 'smart',
            // Connection options
            maxRetries: options.maxRetries || 3,
            timeout: options.timeout || 30000,
            // Monitoring options
            enableMetrics: options.enableMetrics !== false,
            metricsDir: options.metricsDir || './logs/metrics',
            ...options
        };
        
        // Initialize queue manager
        if (this.options.enableQueueManagement) {
            this.queueManager = new OperatorQueueManager({
                autoCleanupThreshold: this.options.queueCleanupThreshold,
                preserveLatest: this.options.preserveLatestConversations,
                enableAutoCleanup: this.options.enableQueueAutoCleanup,
                logger: this.options.logger,
                debug: this.options.debug || false
            });
        }
        
        // Initialize metrics
        if (this.options.enableMetrics) {
            this.metrics = new QueueMetrics({
                metricsDir: this.options.metricsDir,
                logger: this.options.logger
            });
        }
        
        // Initialize health monitoring
        if (this.options.enableHealthMonitoring !== false) {
            this.healthMonitor = new HealthQueueMonitor({
                checkInterval: this.options.healthCheckInterval || 30000,
                enableAutoTriggers: this.options.enableHealthTriggers !== false,
                enableMemoryTriggers: this.options.enableMemoryTriggers !== false,
                memoryThresholdMB: this.options.memoryThresholdMB || 500,
                queueSizeThreshold: this.options.queueSizeThreshold || 25,
                logger: this.options.logger,
                chromePort: this.options.port
            });
        }
        
        // Initialize retry utility
        this.retryUtility = new RetryUtility({
            maxRetries: this.options.maxRetries,
            baseDelay: this.options.retryDelay || 1000
        });
        
        // State tracking
        this.isConnected = false;
        this.page = null;
        this.browser = null;
        this.messageCount = 0;
        this.lastQueueCheck = 0;
        
        this.log = this.options.logger || console.log;
    }
    
    /**
     * Initialize connection to Chrome and Operator page
     */
    async init() {
        try {
            await this.retryUtility.executeWithRetry(async () => {
                await this.connectToChrome();
                await this.navigateToOperator();
                await this.setupQueueManagement();
            }, 'initialization');
            
            this.isConnected = true;
            this.log('[Operator Sender] Initialized successfully with queue management');
            
            return true;
        } catch (error) {
            this.log(`[Operator Sender] Initialization failed: ${error.message}`, 'error');
            throw error;
        }
    }
    
    /**
     * Connect to Chrome via CDP
     */
    async connectToChrome() {
        try {
            // Dynamic import for puppeteer-core
            const puppeteer = await import('puppeteer-core');
            
            this.browser = await puppeteer.default.connect({
                browserURL: `http://localhost:${this.options.port}`,
                defaultViewport: null
            });
            
            const pages = await this.browser.pages();
            
            // Find existing Operator page or create new one
            this.page = pages.find(page => 
                page.url().includes('operator.chatgpt.com')
            );
            
            if (!this.page) {
                this.page = await this.browser.newPage();
                await this.page.goto('https://operator.chatgpt.com');
                await this.page.waitForLoadState('networkidle');
            }
            
            this.log('[Operator Sender] Connected to Chrome and Operator page');
        } catch (error) {
            throw new Error(`Chrome connection failed: ${error.message}`);
        }
    }
    
    /**
     * Navigate to Operator page if not already there
     */
    async navigateToOperator() {
        if (!this.page.url().includes('operator.chatgpt.com')) {
            await this.page.goto('https://operator.chatgpt.com');
            await this.page.waitForLoadState('networkidle');
        }
        
        // Wait for page to be ready
        await this.page.waitForSelector('textarea', { timeout: this.options.timeout });
    }
    
    /**
     * Setup queue management integration
     */
    async setupQueueManagement() {
        if (!this.options.enableQueueManagement || !this.queueManager) {
            return;
        }
        
        try {
            // Inject queue management scripts
            const injectionSuccess = await this.queueManager.injectScript(this.page);
            if (!injectionSuccess) {
                throw new Error('Queue management script injection failed');
            }
            
            // Initial queue size recording
            const initialQueueSize = await this.page.evaluate(() => 
                window.OperatorQueueManagement?.getConversationCount() || 0
            );
            
            if (this.metrics) {
                this.metrics.recordQueueSize(initialQueueSize, { context: 'initialization' });
            }
            
            // Initialize health monitoring
            if (this.healthMonitor) {
                this.healthMonitor.initialize(this.queueManager, this.page);
                this.log(`[Health Monitor] Integrated with queue management`);
            }
            
            this.log(`[Queue Manager] Setup complete, initial queue size: ${initialQueueSize}`);
        } catch (error) {
            this.log(`[Queue Manager] Setup failed: ${error.message}`, 'error');
            // Continue without queue management if setup fails
            this.options.enableQueueManagement = false;
        }
    }
    
    /**
     * Send message to Operator and wait for response
     */
    async sendMessage(message, options = {}) {
        const messageOptions = {
            timeout: this.options.timeout,
            waitForResponse: true,
            triggerQueueCheck: true,
            ...options
        };
        
        try {
            // Pre-message queue management
            if (messageOptions.triggerQueueCheck && this.shouldCheckQueue()) {
                await this.performQueueCheck();
            }
            
            this.log(`[Operator Sender] Sending message: ${message.substring(0, 100)}...`);
            
            // Send the actual message
            const result = await this.retryUtility.executeWithRetry(async () => {
                return await this.executeMessageSend(message, messageOptions);
            }, 'message send');
            
            this.messageCount++;
            this.lastQueueCheck = Date.now();
            
            // Post-message queue management
            if (this.options.enableQueueManagement && this.messageCount % 5 === 0) {
                // Check queue every 5 messages
                setTimeout(() => this.performQueueCheck(), 1000);
            }
            
            return result;
            
        } catch (error) {
            this.log(`[Operator Sender] Message send failed: ${error.message}`, 'error');
            
            if (this.metrics) {
                this.metrics.recordError(error, { 
                    type: 'message_send', 
                    messageLength: message.length 
                });
            }
            
            throw error;
        }
    }
    
    /**
     * Execute the actual message sending
     */
    async executeMessageSend(message, options) {
        // Find and fill the textarea
        const textArea = await this.page.waitForSelector('textarea', { timeout: options.timeout });
        
        await textArea.clear();
        await textArea.fill(message);
        
        // Find and click send button
        const sendButton = await this.page.waitForSelector(
            'button[data-testid="send-button"], button:has-text("Send")', 
            { timeout: options.timeout }
        );
        
        await sendButton.click();
        
        if (options.waitForResponse) {
            // Wait for response to appear
            const response = await this.waitForOperatorResponse(options.timeout);
            return response;
        }
        
        return { success: true, timestamp: Date.now() };
    }
    
    /**
     * Wait for Operator to respond
     */
    async waitForOperatorResponse(timeout = 60000) {
        const startTime = Date.now();
        
        while (Date.now() - startTime < timeout) {
            try {
                // Look for response indicators
                const responseFound = await this.page.evaluate(() => {
                    // Look for common response patterns
                    const indicators = [
                        'TASK_FINISHED',
                        '[TASK_FINISHED]',
                        'task completed',
                        'analysis complete'
                    ];
                    
                    const pageText = document.body.innerText.toLowerCase();
                    return indicators.some(indicator => 
                        pageText.includes(indicator.toLowerCase())
                    );
                });
                
                if (responseFound) {
                    const response = await this.extractResponse();
                    return response;
                }
                
                await new Promise(resolve => setTimeout(resolve, 1000));
            } catch (error) {
                this.log(`[Operator Sender] Error waiting for response: ${error.message}`);
            }
        }
        
        throw new Error('Timeout waiting for Operator response');
    }
    
    /**
     * Extract response from Operator page
     */
    async extractResponse() {
        try {
            const response = await this.page.evaluate(() => {
                // Extract the latest message content
                const messages = document.querySelectorAll('[data-message-role="assistant"]');
                if (messages.length > 0) {
                    const latestMessage = messages[messages.length - 1];
                    return {
                        content: latestMessage.innerText || latestMessage.textContent,
                        timestamp: Date.now(),
                        messageCount: messages.length
                    };
                }
                
                // Fallback to general page content
                return {
                    content: document.body.innerText,
                    timestamp: Date.now(),
                    fallback: true
                };
            });
            
            this.log(`[Operator Sender] Response extracted, length: ${response.content.length}`);
            return response;
            
        } catch (error) {
            throw new Error(`Response extraction failed: ${error.message}`);
        }
    }
    
    /**
     * Check if queue management should be performed
     */
    shouldCheckQueue() {
        if (!this.options.enableQueueManagement) {
            return false;
        }
        
        const timeSinceLastCheck = Date.now() - this.lastQueueCheck;
        const checkInterval = 30000; // 30 seconds
        
        return timeSinceLastCheck > checkInterval || this.messageCount % 3 === 0;
    }
    
    /**
     * Perform queue check and cleanup if needed
     */
    async performQueueCheck() {
        if (!this.queueManager || !this.page) {
            return;
        }
        
        try {
            this.log('[Queue Manager] Performing queue check...');
            
            const result = await this.queueManager.checkAndCleanup(this.page);
            
            if (result.cleaned) {
                this.log(`[Queue Manager] Cleanup performed: ${JSON.stringify(result)}`);
                
                if (this.metrics) {
                    this.metrics.recordCleanup(
                        result, 
                        this.options.cleanupStrategy,
                        'automatic'
                    );
                }
            } else if (result.count !== undefined) {
                this.log(`[Queue Manager] Queue size: ${result.count}, no cleanup needed`);
                
                if (this.metrics) {
                    this.metrics.recordQueueSize(result.count, { context: 'periodic_check' });
                }
            }
            
            this.lastQueueCheck = Date.now();
            
        } catch (error) {
            this.log(`[Queue Manager] Queue check failed: ${error.message}`, 'error');
            
            if (this.metrics) {
                this.metrics.recordError(error, { type: 'queue_check' });
            }
        }
    }
    
    /**
     * Perform manual cleanup with specific strategy
     */
    async performManualCleanup(strategy = 'smart', options = {}) {
        if (!this.queueManager || !this.page) {
            throw new Error('Queue manager not available');
        }
        
        try {
            this.log(`[Queue Manager] Performing manual cleanup with strategy: ${strategy}`);
            
            let result;
            
            switch (strategy) {
                case 'smart':
                    result = await CleanupStrategies.smartCleanup(this.page, options);
                    break;
                case 'age':
                    result = await CleanupStrategies.deleteByAge(this.page, options.maxAge || 30, options);
                    break;
                case 'pattern':
                    result = await CleanupStrategies.deleteByPattern(this.page, options.patterns || ['completed'], options);
                    break;
                case 'emergency':
                    result = await CleanupStrategies.emergencyCleanup(this.page, options);
                    break;
                default:
                    result = await this.queueManager.executeCleanup(this.page, options);
            }
            
            if (this.metrics) {
                this.metrics.recordCleanup(result, strategy, 'manual');
            }
            
            this.log(`[Queue Manager] Manual cleanup complete: ${JSON.stringify(result)}`);
            return result;
            
        } catch (error) {
            this.log(`[Queue Manager] Manual cleanup failed: ${error.message}`, 'error');
            
            if (this.metrics) {
                this.metrics.recordError(error, { type: 'manual_cleanup', strategy });
            }
            
            throw error;
        }
    }
    
    /**
     * Get queue status and metrics
     */
    async getQueueStatus() {
        if (!this.queueManager || !this.page) {
            return { available: false };
        }
        
        try {
            const queueSize = await this.page.evaluate(() => 
                window.OperatorQueueManagement?.getConversationCount() || 0
            );
            
            const healthStatus = await this.page.evaluate(() => 
                window.OperatorQueueManagement?.getHealthStatus() || {}
            );
            
            const queueStats = this.queueManager.getStats();
            const metricsReport = this.metrics ? this.metrics.generateReport() : null;
            
            return {
                available: true,
                currentSize: queueSize,
                health: healthStatus,
                stats: queueStats,
                metrics: metricsReport?.summary,
                lastCheck: this.lastQueueCheck,
                messagesSent: this.messageCount
            };
            
        } catch (error) {
            this.log(`[Queue Manager] Status check failed: ${error.message}`, 'error');
            return { available: false, error: error.message };
        }
    }
    
    /**
     * Export queue metrics
     */
    async exportMetrics(format = 'json', filepath = null) {
        if (!this.metrics) {
            throw new Error('Metrics not enabled');
        }
        
        return await this.metrics.exportMetrics(format, filepath);
    }
    
    /**
     * Get health monitoring status
     */
    getHealthStatus() {
        if (!this.healthMonitor) {
            return { available: false, reason: 'Health monitoring not enabled' };
        }
        
        return {
            available: true,
            stats: this.healthMonitor.getMonitoringStats(),
            isMonitoring: this.healthMonitor.isMonitoring
        };
    }
    
    /**
     * Manual health-based cleanup trigger
     */
    async triggerHealthBasedCleanup(strategy = 'smart', options = {}) {
        if (!this.healthMonitor) {
            throw new Error('Health monitoring not available');
        }
        
        return await this.healthMonitor.manualHealthTrigger(strategy, options);
    }
    
    /**
     * Update health monitoring configuration
     */
    updateHealthConfig(newConfig) {
        if (!this.healthMonitor) {
            throw new Error('Health monitoring not available');
        }
        
        this.healthMonitor.updateConfig(newConfig);
        this.log('[Health Monitor] Configuration updated');
    }
    
    /**
     * Close connection and cleanup
     */
    async close() {
        try {
            if (this.healthMonitor) {
                this.healthMonitor.shutdown();
            }
            
            if (this.metrics) {
                this.metrics.shutdown();
            }
            
            if (this.browser) {
                await this.browser.disconnect();
            }
            
            this.isConnected = false;
            this.log('[Operator Sender] Connection closed');
            
        } catch (error) {
            this.log(`[Operator Sender] Error during close: ${error.message}`, 'error');
        }
    }
    
    /**
     * Health check for the connection
     */
    async healthCheck() {
        try {
            if (!this.isConnected || !this.page) {
                return { healthy: false, reason: 'Not connected' };
            }
            
            // Check if page is still accessible
            const pageTitle = await this.page.title();
            const isOperatorPage = pageTitle.toLowerCase().includes('operator') || 
                                 this.page.url().includes('operator.chatgpt.com');
            
            if (!isOperatorPage) {
                return { healthy: false, reason: 'Not on Operator page' };
            }
            
            // Check queue management health
            let queueHealth = { healthy: true };
            if (this.queueManager) {
                queueHealth = await this.page.evaluate(() => 
                    window.OperatorQueueManagement?.getHealthStatus() || { healthy: false }
                );
            }
            
            // Get health monitoring status
            let healthMonitoringStatus = { available: false };
            if (this.healthMonitor) {
                healthMonitoringStatus = this.getHealthStatus();
            }
            
            return {
                healthy: queueHealth.healthy && healthMonitoringStatus.available,
                connection: true,
                page: isOperatorPage,
                queue: queueHealth,
                healthMonitoring: healthMonitoringStatus,
                messagesSent: this.messageCount,
                lastActivity: this.lastQueueCheck
            };
            
        } catch (error) {
            return { 
                healthy: false, 
                reason: error.message,
                timestamp: Date.now()
            };
        }
    }
}

export default OperatorMessageSenderWithResponse;
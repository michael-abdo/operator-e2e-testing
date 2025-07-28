/**
 * Health-Based Queue Monitor
 * Extends health monitoring to trigger queue cleanup based on system health conditions
 */

import HealthCheckSystem from './health-check.js';
import CleanupStrategies from './cleanup-strategies.js';

export class HealthQueueMonitor {
    constructor(options = {}) {
        this.options = {
            // Health monitoring options
            checkInterval: options.checkInterval || 30000, // 30 seconds
            enableAutoTriggers: options.enableAutoTriggers !== false,
            enableMemoryTriggers: options.enableMemoryTriggers !== false,
            enablePerformanceTriggers: options.enablePerformanceTriggers !== false,
            
            // Health thresholds for triggering cleanup
            memoryThresholdMB: options.memoryThresholdMB || 500,
            cpuThresholdPercent: options.cpuThresholdPercent || 80,
            queueSizeThreshold: options.queueSizeThreshold || 25,
            errorRateThreshold: options.errorRateThreshold || 0.3,
            
            // Cleanup strategy selection based on health conditions
            strategies: {
                memoryPressure: options.memoryPressureStrategy || 'emergency',
                highCpu: options.highCpuStrategy || 'age',
                highErrorRate: options.highErrorRateStrategy || 'smart',
                systemUnhealthy: options.systemUnhealthyStrategy || 'emergency'
            },
            
            // Cooldown periods to prevent too frequent cleanups
            cleanupCooldown: options.cleanupCooldown || 60000, // 1 minute
            emergencyCooldown: options.emergencyCooldown || 30000, // 30 seconds
            
            ...options
        };
        
        // Initialize health check system
        this.healthCheck = new HealthCheckSystem(options);
        
        // State tracking
        this.isMonitoring = false;
        this.lastCleanupTime = 0;
        this.lastEmergencyCleanup = 0;
        this.healthHistory = [];
        this.triggerCount = {
            memory: 0,
            cpu: 0,
            errorRate: 0,
            system: 0,
            manual: 0
        };
        
        // Queue manager reference (will be set by parent)
        this.queueManager = null;
        this.page = null;
        
        this.logger = options.logger || console.log;
    }
    
    /**
     * Initialize monitoring with queue manager reference
     */
    initialize(queueManager, page) {
        this.queueManager = queueManager;
        this.page = page;
        
        if (this.options.enableAutoTriggers) {
            this.startMonitoring();
        }
        
        this.logger('[Health Monitor] Initialized with queue management integration');
    }
    
    /**
     * Start continuous health monitoring
     */
    startMonitoring() {
        if (this.isMonitoring) {
            this.logger('[Health Monitor] Already monitoring');
            return;
        }
        
        this.isMonitoring = true;
        this.monitoringInterval = setInterval(() => {
            this.performHealthBasedCleanupCheck();
        }, this.options.checkInterval);
        
        this.logger(`[Health Monitor] Started monitoring (interval: ${this.options.checkInterval}ms)`);
    }
    
    /**
     * Stop monitoring
     */
    stopMonitoring() {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }
        
        this.isMonitoring = false;
        this.logger('[Health Monitor] Stopped monitoring');
    }
    
    /**
     * Perform health check and trigger cleanup if needed
     */
    async performHealthBasedCleanupCheck() {
        if (!this.queueManager || !this.page) {
            return;
        }
        
        try {
            // Get current health status
            const healthResult = await this.healthCheck.performHealthCheck();
            this.recordHealthResult(healthResult);
            
            // Get current queue status
            const queueSize = await this.page.evaluate(() => 
                window.OperatorQueueManagement?.getConversationCount() || 0
            );
            
            // Analyze health conditions and trigger cleanup if needed
            const triggerAnalysis = this.analyzeTriggerConditions(healthResult, queueSize);
            
            if (triggerAnalysis.shouldTrigger) {
                await this.triggerHealthBasedCleanup(triggerAnalysis);
            }
            
        } catch (error) {
            this.logger(`[Health Monitor] Error during health check: ${error.message}`, 'error');
        }
    }
    
    /**
     * Record health result in history
     */
    recordHealthResult(healthResult) {
        this.healthHistory.push({
            timestamp: Date.now(),
            healthy: healthResult.healthy,
            checks: healthResult.checks
        });
        
        // Keep only last 100 results
        if (this.healthHistory.length > 100) {
            this.healthHistory = this.healthHistory.slice(-100);
        }
    }
    
    /**
     * Analyze current conditions to determine if cleanup should be triggered
     */
    analyzeTriggerConditions(healthResult, queueSize) {
        const now = Date.now();
        const analysis = {
            shouldTrigger: false,
            reasons: [],
            strategy: 'smart',
            priority: 'normal',
            cooldownRespected: true
        };
        
        // Check cooldown periods
        const timeSinceLastCleanup = now - this.lastCleanupTime;
        const timeSinceEmergency = now - this.lastEmergencyCleanup;
        
        // Memory pressure trigger
        if (this.options.enableMemoryTriggers && healthResult.checks.system) {
            const memoryUsage = this.extractMemoryUsage(healthResult.checks.system);
            if (memoryUsage && memoryUsage > this.options.memoryThresholdMB) {
                if (timeSinceEmergency > this.options.emergencyCooldown) {
                    analysis.shouldTrigger = true;
                    analysis.reasons.push(`High memory usage: ${memoryUsage}MB`);
                    analysis.strategy = this.options.strategies.memoryPressure;
                    analysis.priority = 'high';
                } else {
                    analysis.cooldownRespected = false;
                }
            }
        }
        
        // CPU pressure trigger
        if (this.options.enablePerformanceTriggers && healthResult.checks.system) {
            const cpuUsage = this.extractCpuUsage(healthResult.checks.system);
            if (cpuUsage && cpuUsage > this.options.cpuThresholdPercent) {
                if (timeSinceLastCleanup > this.options.cleanupCooldown) {
                    analysis.shouldTrigger = true;
                    analysis.reasons.push(`High CPU usage: ${cpuUsage}%`);
                    analysis.strategy = this.options.strategies.highCpu;
                    analysis.priority = 'medium';
                }
            }
        }
        
        // Queue size trigger
        if (queueSize > this.options.queueSizeThreshold) {
            if (timeSinceLastCleanup > this.options.cleanupCooldown) {
                analysis.shouldTrigger = true;
                analysis.reasons.push(`Large queue size: ${queueSize}`);
                analysis.strategy = 'smart';
                analysis.priority = 'medium';
            }
        }
        
        // Error rate trigger
        const recentErrorRate = this.calculateRecentErrorRate();
        if (recentErrorRate > this.options.errorRateThreshold) {
            if (timeSinceLastCleanup > this.options.cleanupCooldown) {
                analysis.shouldTrigger = true;
                analysis.reasons.push(`High error rate: ${Math.round(recentErrorRate * 100)}%`);
                analysis.strategy = this.options.strategies.highErrorRate;
                analysis.priority = 'medium';
            }
        }
        
        // Overall system health trigger
        if (!healthResult.healthy && analysis.priority !== 'high') {
            if (timeSinceLastCleanup > this.options.cleanupCooldown) {
                analysis.shouldTrigger = true;
                analysis.reasons.push('System unhealthy');
                analysis.strategy = this.options.strategies.systemUnhealthy;
                analysis.priority = 'medium';
            }
        }
        
        return analysis;
    }
    
    /**
     * Trigger health-based cleanup
     */
    async triggerHealthBasedCleanup(analysis) {
        try {
            this.logger(`[Health Monitor] Triggering ${analysis.priority} priority cleanup: ${analysis.reasons.join(', ')}`);
            
            // Select cleanup options based on strategy and priority
            const cleanupOptions = this.getCleanupOptions(analysis.strategy, analysis.priority);
            
            // Execute cleanup
            let result;
            switch (analysis.strategy) {
                case 'emergency':
                    result = await CleanupStrategies.emergencyCleanup(this.page, cleanupOptions);
                    this.lastEmergencyCleanup = Date.now();
                    this.triggerCount.system++;
                    break;
                    
                case 'age':
                    result = await CleanupStrategies.deleteByAge(this.page, 30, cleanupOptions);
                    this.triggerCount.cpu++;
                    break;
                    
                case 'smart':
                default:
                    result = await CleanupStrategies.smartCleanup(this.page, cleanupOptions);
                    this.triggerCount.memory++;
                    break;
            }
            
            this.lastCleanupTime = Date.now();
            
            // Log results
            if (result.success || result.wouldDelete > 0) {
                this.logger(`[Health Monitor] Cleanup completed: ${JSON.stringify(result)}`);
            } else {
                this.logger(`[Health Monitor] Cleanup had no effect: ${JSON.stringify(result)}`);
            }
            
            return result;
            
        } catch (error) {
            this.logger(`[Health Monitor] Cleanup failed: ${error.message}`, 'error');
            throw error;
        }
    }
    
    /**
     * Get cleanup options based on strategy and priority
     */
    getCleanupOptions(strategy, priority) {
        const baseOptions = {
            dryRun: false
        };
        
        switch (priority) {
            case 'high':
                return {
                    ...baseOptions,
                    preserveLatest: 1,
                    targetReduction: 0.8,
                    forceCleanup: true
                };
                
            case 'medium':
                return {
                    ...baseOptions,
                    preserveLatest: 3,
                    preserveErrors: true,
                    maxAge: 30
                };
                
            case 'low':
            default:
                return {
                    ...baseOptions,
                    preserveLatest: 5,
                    preserveErrors: true,
                    preservePatterns: ['error', 'investigating'],
                    maxAge: 60
                };
        }
    }
    
    /**
     * Extract memory usage from system health check
     */
    extractMemoryUsage(systemCheck) {
        try {
            if (systemCheck.details && systemCheck.details.memory) {
                return systemCheck.details.memory.usedMB || null;
            }
            // Try to parse from message
            const memMatch = systemCheck.message?.match(/(\d+)MB/);
            return memMatch ? parseInt(memMatch[1]) : null;
        } catch (error) {
            return null;
        }
    }
    
    /**
     * Extract CPU usage from system health check
     */
    extractCpuUsage(systemCheck) {
        try {
            if (systemCheck.details && systemCheck.details.cpu) {
                return systemCheck.details.cpu.usage || null;
            }
            // Try to parse from message
            const cpuMatch = systemCheck.message?.match(/(\d+)%/);
            return cpuMatch ? parseInt(cpuMatch[1]) : null;
        } catch (error) {
            return null;
        }
    }
    
    /**
     * Calculate recent error rate from health history
     */
    calculateRecentErrorRate() {
        const recentHistory = this.healthHistory.slice(-10); // Last 10 checks
        if (recentHistory.length === 0) return 0;
        
        const unhealthyCount = recentHistory.filter(h => !h.healthy).length;
        return unhealthyCount / recentHistory.length;
    }
    
    /**
     * Get monitoring statistics
     */
    getMonitoringStats() {
        const recentHistory = this.healthHistory.slice(-20);
        const healthyCount = recentHistory.filter(h => h.healthy).length;
        
        return {
            isMonitoring: this.isMonitoring,
            checkInterval: this.options.checkInterval,
            totalChecks: this.healthHistory.length,
            recentHealthRate: recentHistory.length > 0 ? healthyCount / recentHistory.length : 1,
            triggerCounts: { ...this.triggerCount },
            lastCleanup: this.lastCleanupTime,
            lastEmergency: this.lastEmergencyCleanup,
            cooldownStatus: {
                cleanup: Date.now() - this.lastCleanupTime > this.options.cleanupCooldown,
                emergency: Date.now() - this.lastEmergencyCleanup > this.options.emergencyCooldown
            }
        };
    }
    
    /**
     * Manual health-based cleanup trigger
     */
    async manualHealthTrigger(strategy = 'smart', options = {}) {
        this.logger(`[Health Monitor] Manual health trigger: ${strategy}`);
        
        try {
            // Get current health status
            const healthResult = await this.healthCheck.performHealthCheck();
            
            // Force trigger with manual strategy
            const analysis = {
                shouldTrigger: true,
                reasons: ['Manual trigger'],
                strategy,
                priority: options.priority || 'medium',
                cooldownRespected: true
            };
            
            this.triggerCount.manual++;
            
            return await this.triggerHealthBasedCleanup(analysis);
            
        } catch (error) {
            this.logger(`[Health Monitor] Manual trigger failed: ${error.message}`, 'error');
            throw error;
        }
    }
    
    /**
     * Update monitoring configuration
     */
    updateConfig(newOptions) {
        Object.assign(this.options, newOptions);
        this.logger('[Health Monitor] Configuration updated');
        
        // Restart monitoring if interval changed
        if (this.isMonitoring && newOptions.checkInterval) {
            this.stopMonitoring();
            this.startMonitoring();
        }
    }
    
    /**
     * Export health history for analysis
     */
    exportHealthHistory() {
        return {
            history: this.healthHistory,
            stats: this.getMonitoringStats(),
            config: this.options,
            exportedAt: new Date().toISOString()
        };
    }
    
    /**
     * Cleanup and shutdown
     */
    shutdown() {
        this.stopMonitoring();
        this.logger('[Health Monitor] Shutdown complete');
    }
}

export default HealthQueueMonitor;
/**
 * Queue Metrics Collection and Reporting System
 * Provides comprehensive metrics collection, analysis, and reporting for queue management
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

export class QueueMetrics {
    constructor(options = {}) {
        this.options = {
            enablePersistence: true,
            metricsDir: options.metricsDir || './logs/metrics',
            maxHistorySize: 1000,
            enableRealTimeUpdates: true,
            exportFormats: ['json', 'csv'],
            ...options
        };
        
        this.metrics = {
            // Core metrics
            totalConversations: 0,
            totalDeletions: 0,
            totalCleanups: 0,
            
            // Performance metrics
            averageQueueSize: 0,
            peakQueueSize: 0,
            averageCleanupTime: 0,
            fastestCleanup: Infinity,
            slowestCleanup: 0,
            
            // Success metrics
            successfulCleanups: 0,
            failedCleanups: 0,
            successRate: 1.0,
            
            // Timing metrics
            sessionStartTime: Date.now(),
            totalUptime: 0,
            lastActivity: Date.now(),
            
            // Detailed event history
            cleanupEvents: [],
            errorEvents: [],
            queueSizeHistory: [],
            
            // Strategy usage
            strategyUsage: {},
            
            // Threshold metrics
            thresholdTriggers: 0,
            manualTriggers: 0,
            emergencyTriggers: 0
        };
        
        this.currentSession = {
            id: this.generateSessionId(),
            startTime: Date.now(),
            cleanups: 0,
            errors: 0
        };
        
        // Initialize persistence
        if (this.options.enablePersistence) {
            this.initializePersistence();
        }
        
        // Setup real-time updates
        if (this.options.enableRealTimeUpdates) {
            this.setupRealTimeUpdates();
        }
    }
    
    /**
     * Generate unique session ID
     */
    generateSessionId() {
        return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    /**
     * Initialize persistence system
     */
    initializePersistence() {
        try {
            if (!existsSync(this.options.metricsDir)) {
                mkdirSync(this.options.metricsDir, { recursive: true });
            }
            
            // Load existing metrics if available
            const metricsFile = join(this.options.metricsDir, 'queue-metrics.json');
            if (existsSync(metricsFile)) {
                const existingMetrics = JSON.parse(readFileSync(metricsFile, 'utf8'));
                this.mergeHistoricalMetrics(existingMetrics);
            }
        } catch (error) {
            console.warn(`Failed to initialize metrics persistence: ${error.message}`);
        }
    }
    
    /**
     * Merge historical metrics with current session
     */
    mergeHistoricalMetrics(historical) {
        // Keep historical aggregates but reset session-specific data
        this.metrics.totalDeletions += historical.totalDeletions || 0;
        this.metrics.totalCleanups += historical.totalCleanups || 0;
        this.metrics.successfulCleanups += historical.successfulCleanups || 0;
        this.metrics.failedCleanups += historical.failedCleanups || 0;
        
        // Merge strategy usage
        Object.keys(historical.strategyUsage || {}).forEach(strategy => {
            this.metrics.strategyUsage[strategy] = 
                (this.metrics.strategyUsage[strategy] || 0) + historical.strategyUsage[strategy];
        });
        
        // Keep recent events (last 100)
        if (historical.cleanupEvents) {
            this.metrics.cleanupEvents = historical.cleanupEvents.slice(-100);
        }
        if (historical.errorEvents) {
            this.metrics.errorEvents = historical.errorEvents.slice(-100);
        }
    }
    
    /**
     * Setup real-time metric updates
     */
    setupRealTimeUpdates() {
        // Update metrics every 30 seconds
        this.updateInterval = setInterval(() => {
            this.updateRuntimeMetrics();
            if (this.options.enablePersistence) {
                this.persistMetrics();
            }
        }, 30000);
    }
    
    /**
     * Record a cleanup event
     */
    recordCleanup(result, strategy = 'unknown', triggerType = 'threshold') {
        const event = {
            timestamp: Date.now(),
            sessionId: this.currentSession.id,
            strategy,
            triggerType,
            deleted: result.deleted || 0,
            failed: result.failed || 0,
            duration: result.duration || 0,
            success: result.success || false,
            remaining: result.remaining || 0,
            validationPassed: result.validationPassed !== false,
            error: result.error || null
        };
        
        // Update core metrics
        this.metrics.totalCleanups++;
        this.metrics.totalDeletions += event.deleted;
        this.currentSession.cleanups++;
        
        if (event.success) {
            this.metrics.successfulCleanups++;
        } else {
            this.metrics.failedCleanups++;
            this.currentSession.errors++;
        }
        
        // Update performance metrics
        this.updatePerformanceMetrics(event);
        
        // Update strategy usage
        this.metrics.strategyUsage[strategy] = (this.metrics.strategyUsage[strategy] || 0) + 1;
        
        // Update trigger type metrics
        if (triggerType === 'threshold') {
            this.metrics.thresholdTriggers++;
        } else if (triggerType === 'manual') {
            this.metrics.manualTriggers++;
        } else if (triggerType === 'emergency') {
            this.metrics.emergencyTriggers++;
        }
        
        // Add to event history
        this.metrics.cleanupEvents.push(event);
        this.trimHistory('cleanupEvents');
        
        // Update success rate
        this.updateSuccessRate();
        
        // Update last activity
        this.metrics.lastActivity = Date.now();
        
        return event;
    }
    
    /**
     * Record an error event
     */
    recordError(error, context = {}) {
        const event = {
            timestamp: Date.now(),
            sessionId: this.currentSession.id,
            type: context.type || 'unknown',
            message: error.message || String(error),
            stack: error.stack || null,
            context,
            severity: this.categorizeErrorSeverity(error, context)
        };
        
        this.metrics.errorEvents.push(event);
        this.trimHistory('errorEvents');
        this.currentSession.errors++;
        
        return event;
    }
    
    /**
     * Record queue size observation
     */
    recordQueueSize(size, context = {}) {
        const observation = {
            timestamp: Date.now(),
            size,
            context
        };
        
        this.metrics.queueSizeHistory.push(observation);
        this.trimHistory('queueSizeHistory');
        
        // Update peak and average
        if (size > this.metrics.peakQueueSize) {
            this.metrics.peakQueueSize = size;
        }
        
        this.updateAverageQueueSize();
        this.metrics.totalConversations = Math.max(this.metrics.totalConversations, size);
    }
    
    /**
     * Update performance metrics based on cleanup event
     */
    updatePerformanceMetrics(event) {
        if (event.duration > 0) {
            // Update cleanup time metrics
            if (event.duration < this.metrics.fastestCleanup) {
                this.metrics.fastestCleanup = event.duration;
            }
            if (event.duration > this.metrics.slowestCleanup) {
                this.metrics.slowestCleanup = event.duration;
            }
            
            // Update average cleanup time
            const totalCleanups = this.metrics.totalCleanups;
            this.metrics.averageCleanupTime = totalCleanups === 1 
                ? event.duration
                : ((this.metrics.averageCleanupTime * (totalCleanups - 1)) + event.duration) / totalCleanups;
        }
    }
    
    /**
     * Update success rate
     */
    updateSuccessRate() {
        const total = this.metrics.successfulCleanups + this.metrics.failedCleanups;
        this.metrics.successRate = total > 0 ? this.metrics.successfulCleanups / total : 1.0;
    }
    
    /**
     * Update average queue size
     */
    updateAverageQueueSize() {
        if (this.metrics.queueSizeHistory.length > 0) {
            const sum = this.metrics.queueSizeHistory.reduce((acc, obs) => acc + obs.size, 0);
            this.metrics.averageQueueSize = sum / this.metrics.queueSizeHistory.length;
        }
    }
    
    /**
     * Update runtime metrics
     */
    updateRuntimeMetrics() {
        const now = Date.now();
        this.metrics.totalUptime = now - this.metrics.sessionStartTime;
        this.currentSession.duration = now - this.currentSession.startTime;
    }
    
    /**
     * Categorize error severity
     */
    categorizeErrorSeverity(error, context) {
        const message = error.message?.toLowerCase() || '';
        
        if (message.includes('circuit breaker') || message.includes('emergency')) {
            return 'critical';
        } else if (message.includes('cleanup failed') || message.includes('injection failed')) {
            return 'high';
        } else if (message.includes('validation failed') || message.includes('timeout')) {
            return 'medium';
        } else {
            return 'low';
        }
    }
    
    /**
     * Trim history arrays to prevent memory growth
     */
    trimHistory(arrayName) {
        if (this.metrics[arrayName].length > this.options.maxHistorySize) {
            this.metrics[arrayName] = this.metrics[arrayName].slice(-this.options.maxHistorySize);
        }
    }
    
    /**
     * Generate comprehensive report
     */
    generateReport(options = {}) {
        const reportOptions = {
            includeHistory: true,
            includeRecommendations: true,
            includeTrends: true,
            timeRange: '24h', // 1h, 24h, 7d, 30d
            ...options
        };
        
        const report = {
            metadata: {
                generatedAt: new Date().toISOString(),
                sessionId: this.currentSession.id,
                reportVersion: '1.0.0',
                timeRange: reportOptions.timeRange
            },
            
            summary: this.generateSummary(),
            performance: this.generatePerformanceReport(),
            reliability: this.generateReliabilityReport(),
            usage: this.generateUsageReport()
        };
        
        if (reportOptions.includeHistory) {
            report.history = this.generateHistoryReport(reportOptions.timeRange);
        }
        
        if (reportOptions.includeTrends) {
            report.trends = this.generateTrendAnalysis();
        }
        
        if (reportOptions.includeRecommendations) {
            report.recommendations = this.generateRecommendations();
        }
        
        return report;
    }
    
    /**
     * Generate summary section
     */
    generateSummary() {
        return {
            totalCleanups: this.metrics.totalCleanups,
            totalDeleted: this.metrics.totalDeletions,
            successRate: Math.round(this.metrics.successRate * 100) / 100,
            peakQueueSize: this.metrics.peakQueueSize,
            averageQueueSize: Math.round(this.metrics.averageQueueSize * 100) / 100,
            sessionUptime: this.formatDuration(this.currentSession.duration || 0),
            totalUptime: this.formatDuration(this.metrics.totalUptime),
            currentSession: {
                cleanups: this.currentSession.cleanups,
                errors: this.currentSession.errors,
                duration: this.formatDuration(this.currentSession.duration || 0)
            }
        };
    }
    
    /**
     * Generate performance report
     */
    generatePerformanceReport() {
        return {
            averageCleanupTime: Math.round(this.metrics.averageCleanupTime),
            fastestCleanup: this.metrics.fastestCleanup === Infinity ? 0 : this.metrics.fastestCleanup,
            slowestCleanup: this.metrics.slowestCleanup,
            cleanupFrequency: this.calculateCleanupFrequency(),
            efficiencyScore: this.calculateEfficiencyScore()
        };
    }
    
    /**
     * Generate reliability report
     */
    generateReliabilityReport() {
        const recentErrors = this.metrics.errorEvents.filter(
            e => Date.now() - e.timestamp < 3600000 // Last hour
        );
        
        return {
            successRate: this.metrics.successRate,
            successfulCleanups: this.metrics.successfulCleanups,
            failedCleanups: this.metrics.failedCleanups,
            recentErrors: recentErrors.length,
            errorRate: this.metrics.errorEvents.length / Math.max(1, this.metrics.totalCleanups),
            criticalErrors: this.metrics.errorEvents.filter(e => e.severity === 'critical').length,
            uptime: this.calculateUptimePercentage()
        };
    }
    
    /**
     * Generate usage report
     */
    generateUsageReport() {
        const totalTriggers = this.metrics.thresholdTriggers + 
                            this.metrics.manualTriggers + 
                            this.metrics.emergencyTriggers;
        
        return {
            strategyUsage: this.metrics.strategyUsage,
            triggerTypes: {
                threshold: this.metrics.thresholdTriggers,
                manual: this.metrics.manualTriggers,
                emergency: this.metrics.emergencyTriggers,
                total: totalTriggers
            },
            mostUsedStrategy: this.getMostUsedStrategy(),
            triggerDistribution: totalTriggers > 0 ? {
                threshold: Math.round((this.metrics.thresholdTriggers / totalTriggers) * 100),
                manual: Math.round((this.metrics.manualTriggers / totalTriggers) * 100),
                emergency: Math.round((this.metrics.emergencyTriggers / totalTriggers) * 100)
            } : null
        };
    }
    
    /**
     * Generate trend analysis
     */
    generateTrendAnalysis() {
        const recentEvents = this.metrics.cleanupEvents.slice(-20); // Last 20 cleanups
        
        if (recentEvents.length < 2) {
            return { insufficient_data: true };
        }
        
        return {
            queueSizeTrend: this.calculateTrend(recentEvents.map(e => e.remaining)),
            cleanupTimeTrend: this.calculateTrend(recentEvents.map(e => e.duration)),
            successRateTrend: this.calculateSuccessRateTrend(recentEvents),
            deletionRateTrend: this.calculateTrend(recentEvents.map(e => e.deleted))
        };
    }
    
    /**
     * Generate recommendations
     */
    generateRecommendations() {
        const recommendations = [];
        
        // Performance recommendations
        if (this.metrics.averageCleanupTime > 5000) {
            recommendations.push({
                category: 'performance',
                priority: 'medium',
                issue: 'Slow cleanup times detected',
                recommendation: 'Consider adjusting cleanup strategy or reducing conversation count threshold'
            });
        }
        
        if (this.metrics.peakQueueSize > 50) {
            recommendations.push({
                category: 'performance',
                priority: 'high',
                issue: 'Very high peak queue size',
                recommendation: 'Lower cleanup threshold or enable more aggressive cleanup strategies'
            });
        }
        
        // Reliability recommendations
        if (this.metrics.successRate < 0.9) {
            recommendations.push({
                category: 'reliability',
                priority: 'high',
                issue: 'Low cleanup success rate',
                recommendation: 'Review error logs and consider enabling retry mechanisms'
            });
        }
        
        const recentErrors = this.metrics.errorEvents.filter(
            e => Date.now() - e.timestamp < 3600000
        );
        if (recentErrors.length > 5) {
            recommendations.push({
                category: 'reliability',
                priority: 'critical',
                issue: 'High error rate in recent period',
                recommendation: 'Investigate system health and consider circuit breaker activation'
            });
        }
        
        // Usage recommendations
        const emergencyRatio = this.metrics.emergencyTriggers / 
                             Math.max(1, this.metrics.totalCleanups);
        if (emergencyRatio > 0.1) {
            recommendations.push({
                category: 'usage',
                priority: 'medium',
                issue: 'Frequent emergency cleanups',
                recommendation: 'Consider lowering normal cleanup thresholds to prevent emergency situations'
            });
        }
        
        return recommendations;
    }
    
    /**
     * Calculate cleanup frequency (cleanups per hour)
     */
    calculateCleanupFrequency() {
        const uptimeHours = this.metrics.totalUptime / (1000 * 60 * 60);
        return uptimeHours > 0 ? this.metrics.totalCleanups / uptimeHours : 0;
    }
    
    /**
     * Calculate efficiency score (0-100)
     */
    calculateEfficiencyScore() {
        let score = 100;
        
        // Penalize for failures
        score -= (1 - this.metrics.successRate) * 40;
        
        // Penalize for slow cleanups
        if (this.metrics.averageCleanupTime > 3000) {
            score -= Math.min(30, (this.metrics.averageCleanupTime - 3000) / 100);
        }
        
        // Penalize for emergency cleanups
        const emergencyRatio = this.metrics.emergencyTriggers / Math.max(1, this.metrics.totalCleanups);
        score -= emergencyRatio * 20;
        
        return Math.max(0, Math.min(100, Math.round(score)));
    }
    
    /**
     * Calculate uptime percentage
     */
    calculateUptimePercentage() {
        const totalTime = this.metrics.totalUptime;
        const errorTime = this.metrics.errorEvents.length * 30000; // Assume 30s per error
        return totalTime > 0 ? Math.max(0, (totalTime - errorTime) / totalTime) : 1.0;
    }
    
    /**
     * Get most used strategy
     */
    getMostUsedStrategy() {
        if (Object.keys(this.metrics.strategyUsage).length === 0) {
            return null;
        }
        
        return Object.entries(this.metrics.strategyUsage)
            .sort(([,a], [,b]) => b - a)[0][0];
    }
    
    /**
     * Calculate trend for numeric array
     */
    calculateTrend(values) {
        if (values.length < 2) return 'insufficient_data';
        
        const recentHalf = values.slice(-Math.ceil(values.length / 2));
        const earlierHalf = values.slice(0, Math.floor(values.length / 2));
        
        const recentAvg = recentHalf.reduce((a, b) => a + b, 0) / recentHalf.length;
        const earlierAvg = earlierHalf.reduce((a, b) => a + b, 0) / earlierHalf.length;
        
        const changePercent = ((recentAvg - earlierAvg) / earlierAvg) * 100;
        
        if (Math.abs(changePercent) < 5) return 'stable';
        return changePercent > 0 ? 'increasing' : 'decreasing';
    }
    
    /**
     * Calculate success rate trend
     */
    calculateSuccessRateTrend(events) {
        if (events.length < 4) return 'insufficient_data';
        
        const recentSuccess = events.slice(-Math.ceil(events.length / 2))
            .filter(e => e.success).length;
        const earlierSuccess = events.slice(0, Math.floor(events.length / 2))
            .filter(e => e.success).length;
        
        const recentRate = recentSuccess / Math.ceil(events.length / 2);
        const earlierRate = earlierSuccess / Math.floor(events.length / 2);
        
        const diff = recentRate - earlierRate;
        
        if (Math.abs(diff) < 0.1) return 'stable';
        return diff > 0 ? 'improving' : 'declining';
    }
    
    /**
     * Format duration in milliseconds to human readable
     */
    formatDuration(ms) {
        if (ms < 1000) return `${ms}ms`;
        if (ms < 60000) return `${Math.round(ms / 1000)}s`;
        if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
        return `${Math.round(ms / 3600000)}h`;
    }
    
    /**
     * Export metrics to file
     */
    async exportMetrics(format = 'json', filepath = null) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const defaultPath = join(this.options.metricsDir, `queue-metrics-${timestamp}.${format}`);
        const outputPath = filepath || defaultPath;
        
        try {
            let content;
            
            switch (format.toLowerCase()) {
                case 'json':
                    content = JSON.stringify(this.generateReport(), null, 2);
                    break;
                case 'csv':
                    content = this.generateCSVReport();
                    break;
                case 'prometheus':
                    content = this.generatePrometheusReport();
                    break;
                default:
                    throw new Error(`Unsupported export format: ${format}`);
            }
            
            writeFileSync(outputPath, content, 'utf8');
            return outputPath;
        } catch (error) {
            throw new Error(`Failed to export metrics: ${error.message}`);
        }
    }
    
    /**
     * Generate CSV report
     */
    generateCSVReport() {
        const events = this.metrics.cleanupEvents;
        if (events.length === 0) return 'timestamp,strategy,deleted,duration,success\n';
        
        const header = 'timestamp,strategy,deleted,failed,duration,success,remaining\n';
        const rows = events.map(event => 
            `${new Date(event.timestamp).toISOString()},${event.strategy},${event.deleted},${event.failed},${event.duration},${event.success},${event.remaining}`
        ).join('\n');
        
        return header + rows;
    }
    
    /**
     * Generate Prometheus format metrics
     */
    generatePrometheusReport() {
        const timestamp = Date.now();
        
        return `# HELP queue_total_cleanups Total number of cleanups performed
# TYPE queue_total_cleanups counter
queue_total_cleanups ${this.metrics.totalCleanups} ${timestamp}

# HELP queue_total_deletions Total number of conversations deleted
# TYPE queue_total_deletions counter
queue_total_deletions ${this.metrics.totalDeletions} ${timestamp}

# HELP queue_success_rate Success rate of cleanup operations
# TYPE queue_success_rate gauge
queue_success_rate ${this.metrics.successRate} ${timestamp}

# HELP queue_average_size Average queue size
# TYPE queue_average_size gauge
queue_average_size ${this.metrics.averageQueueSize} ${timestamp}

# HELP queue_peak_size Peak queue size observed
# TYPE queue_peak_size gauge
queue_peak_size ${this.metrics.peakQueueSize} ${timestamp}

# HELP queue_average_cleanup_time Average cleanup time in milliseconds
# TYPE queue_average_cleanup_time gauge
queue_average_cleanup_time ${this.metrics.averageCleanupTime} ${timestamp}`;
    }
    
    /**
     * Persist metrics to disk
     */
    persistMetrics() {
        if (!this.options.enablePersistence) return;
        
        try {
            const metricsFile = join(this.options.metricsDir, 'queue-metrics.json');
            writeFileSync(metricsFile, JSON.stringify(this.metrics, null, 2), 'utf8');
        } catch (error) {
            console.warn(`Failed to persist metrics: ${error.message}`);
        }
    }
    
    /**
     * Cleanup and shutdown
     */
    shutdown() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }
        
        if (this.options.enablePersistence) {
            this.persistMetrics();
        }
    }
}

export default QueueMetrics;
import { EventEmitter } from 'events';
import fs from 'fs/promises';
import path from 'path';

class MonitoringAlertsSystem extends EventEmitter {
    constructor(options = {}) {
        super();
        this.metricsFile = options.metricsFile || path.join(process.cwd(), 'e2e-metrics.json');
        this.alertsFile = options.alertsFile || path.join(process.cwd(), 'e2e-alerts.log');
        this.logger = options.logger || console.log;
        
        // Alert thresholds
        this.thresholds = {
            maxPhaseTimeRatio: options.maxPhaseTimeRatio || 3, // Max 3x expected duration
            minSuccessRate: options.minSuccessRate || 0.8, // 80% success rate
            maxConsecutiveFailures: options.maxConsecutiveFailures || 2,
            maxMemoryUsageMB: options.maxMemoryUsageMB || 2048,
            maxCpuUsagePercent: options.maxCpuUsagePercent || 80
        };
        
        // Metrics storage
        this.metrics = {
            iterations: [],
            phases: {
                operator: [],
                claude: []
            },
            errors: [],
            systemHealth: [],
            codeChanges: []
        };
        
        // Alert state
        this.consecutiveFailures = 0;
        this.activeAlerts = new Set();
    }

    // Record iteration metrics
    async recordIteration(iterationData) {
        const metric = {
            iteration: iterationData.iteration,
            timestamp: new Date().toISOString(),
            duration: iterationData.duration,
            success: iterationData.success,
            failedTasks: iterationData.failedTasks,
            resolvedTasks: iterationData.resolvedTasks,
            errors: iterationData.errors || []
        };
        
        this.metrics.iterations.push(metric);
        
        // Check for alerts
        await this.checkIterationAlerts(metric);
        
        // Persist metrics
        await this.saveMetrics();
    }

    // Record phase metrics
    async recordPhase(phaseData) {
        const metric = {
            phase: phaseData.phaseName,
            iteration: phaseData.iteration,
            timestamp: new Date().toISOString(),
            duration: phaseData.duration,
            quality: phaseData.quality,
            events: phaseData.events || []
        };
        
        if (this.metrics.phases[phaseData.phaseName]) {
            this.metrics.phases[phaseData.phaseName].push(metric);
        }
        
        // Check for phase-specific alerts
        await this.checkPhaseAlerts(metric);
    }

    // Record system health metrics
    async recordSystemHealth(healthData) {
        const metric = {
            timestamp: new Date().toISOString(),
            healthy: healthData.healthy,
            checks: healthData.checks,
            memoryUsageMB: this.getMemoryUsage(),
            cpuUsagePercent: await this.getCpuUsage()
        };
        
        this.metrics.systemHealth.push(metric);
        
        // Check for system health alerts
        await this.checkSystemHealthAlerts(metric);
    }

    // Record code change metrics
    async recordCodeChanges(changeData) {
        const metric = {
            iteration: changeData.iteration,
            timestamp: new Date().toISOString(),
            verified: changeData.verified,
            filesChanged: changeData.filesChanged,
            linesChanged: changeData.linesChanged,
            deploymentStatus: changeData.deploymentStatus
        };
        
        this.metrics.codeChanges.push(metric);
    }

    // Check for iteration-level alerts
    async checkIterationAlerts(metric) {
        // Check consecutive failures
        if (!metric.success) {
            this.consecutiveFailures++;
            
            if (this.consecutiveFailures >= this.thresholds.maxConsecutiveFailures) {
                await this.raiseAlert('CONSECUTIVE_FAILURES', {
                    level: 'critical',
                    message: `${this.consecutiveFailures} consecutive iteration failures`,
                    iteration: metric.iteration,
                    recommendation: 'Check system health and consider manual intervention'
                });
            }
        } else {
            this.consecutiveFailures = 0;
        }
        
        // Check success rate
        const recentIterations = this.metrics.iterations.slice(-10);
        const successRate = recentIterations.filter(i => i.success).length / recentIterations.length;
        
        if (successRate < this.thresholds.minSuccessRate && recentIterations.length >= 5) {
            await this.raiseAlert('LOW_SUCCESS_RATE', {
                level: 'warning',
                message: `Success rate ${(successRate * 100).toFixed(1)}% below threshold`,
                threshold: `${this.thresholds.minSuccessRate * 100}%`,
                recommendation: 'Review error patterns and system configuration'
            });
        }
    }

    // Check for phase-specific alerts
    async checkPhaseAlerts(metric) {
        const expectedDuration = metric.phase === 'operator' ? 60000 : 120000;
        const durationRatio = metric.duration / expectedDuration;
        
        if (durationRatio > this.thresholds.maxPhaseTimeRatio) {
            await this.raiseAlert('PHASE_DURATION_EXCEEDED', {
                level: 'warning',
                phase: metric.phase,
                message: `${metric.phase} phase took ${durationRatio.toFixed(1)}x expected time`,
                duration: `${Math.round(metric.duration / 1000)}s`,
                expected: `${Math.round(expectedDuration / 1000)}s`,
                iteration: metric.iteration
            });
        }
        
        // Check phase quality
        if (metric.quality && metric.quality.score < 40) {
            await this.raiseAlert('LOW_PHASE_QUALITY', {
                level: 'warning',
                phase: metric.phase,
                message: `${metric.phase} phase quality score: ${metric.quality.score}/100`,
                iteration: metric.iteration,
                factors: metric.quality.factors
            });
        }
    }

    // Check system health alerts
    async checkSystemHealthAlerts(metric) {
        if (!metric.healthy) {
            const unhealthyServices = Object.entries(metric.checks)
                .filter(([_, check]) => !check.healthy)
                .map(([service, check]) => ({
                    service,
                    message: check.message,
                    recovery: check.recovery
                }));
            
            await this.raiseAlert('SYSTEM_UNHEALTHY', {
                level: 'critical',
                message: 'System health check failed',
                services: unhealthyServices,
                recommendation: 'Address health issues before continuing'
            });
        }
        
        // Check resource usage
        if (metric.memoryUsageMB > this.thresholds.maxMemoryUsageMB) {
            await this.raiseAlert('HIGH_MEMORY_USAGE', {
                level: 'warning',
                message: `Memory usage ${metric.memoryUsageMB}MB exceeds threshold`,
                threshold: `${this.thresholds.maxMemoryUsageMB}MB`,
                recommendation: 'Consider restarting services or increasing memory limits'
            });
        }
        
        if (metric.cpuUsagePercent > this.thresholds.maxCpuUsagePercent) {
            await this.raiseAlert('HIGH_CPU_USAGE', {
                level: 'warning',
                message: `CPU usage ${metric.cpuUsagePercent}% exceeds threshold`,
                threshold: `${this.thresholds.maxCpuUsagePercent}%`,
                recommendation: 'Check for resource-intensive operations'
            });
        }
    }

    // Raise an alert
    async raiseAlert(type, data) {
        const alert = {
            type,
            timestamp: new Date().toISOString(),
            ...data
        };
        
        // Deduplicate alerts
        const alertKey = `${type}_${JSON.stringify(data.message)}`;
        if (this.activeAlerts.has(alertKey)) {
            return; // Alert already raised
        }
        
        this.activeAlerts.add(alertKey);
        
        // Log alert
        this.logger(`🚨 ALERT [${data.level.toUpperCase()}]: ${type}`);
        this.logger(`   ${data.message}`);
        if (data.recommendation) {
            this.logger(`   Recommendation: ${data.recommendation}`);
        }
        
        // Persist alert
        await this.saveAlert(alert);
        
        // Emit alert event
        this.emit('alert', alert);
        
        // Auto-clear after 5 minutes
        setTimeout(() => {
            this.activeAlerts.delete(alertKey);
        }, 300000);
    }

    // Save metrics to file
    async saveMetrics() {
        try {
            await fs.writeFile(
                this.metricsFile,
                JSON.stringify(this.metrics, null, 2)
            );
        } catch (error) {
            this.logger(`Failed to save metrics: ${error.message}`);
        }
    }

    // Save alert to file
    async saveAlert(alert) {
        try {
            const alertLine = `${JSON.stringify(alert)}\n`;
            await fs.appendFile(this.alertsFile, alertLine);
        } catch (error) {
            this.logger(`Failed to save alert: ${error.message}`);
        }
    }

    // Get memory usage
    getMemoryUsage() {
        const usage = process.memoryUsage();
        return Math.round(usage.heapUsed / 1024 / 1024);
    }

    // Get CPU usage (simplified)
    async getCpuUsage() {
        // This is a simplified implementation
        // In production, you might want to use a more sophisticated approach
        const startUsage = process.cpuUsage();
        await new Promise(resolve => setTimeout(resolve, 100));
        const endUsage = process.cpuUsage(startUsage);
        
        const totalUsage = (endUsage.user + endUsage.system) / 1000;
        return Math.min(Math.round(totalUsage), 100);
    }

    // Generate summary report
    async generateReport() {
        const report = {
            timestamp: new Date().toISOString(),
            summary: {
                totalIterations: this.metrics.iterations.length,
                successfulIterations: this.metrics.iterations.filter(i => i.success).length,
                failedIterations: this.metrics.iterations.filter(i => !i.success).length,
                successRate: this.calculateSuccessRate(),
                averageIterationTime: this.calculateAverageTime(this.metrics.iterations),
                averageOperatorTime: this.calculateAverageTime(this.metrics.phases.operator),
                averageClaudeTime: this.calculateAverageTime(this.metrics.phases.claude),
                totalErrors: this.metrics.errors.length,
                activeAlerts: this.activeAlerts.size
            },
            recentAlerts: await this.getRecentAlerts(5),
            recommendations: this.generateRecommendations()
        };
        
        return report;
    }

    // Calculate success rate
    calculateSuccessRate() {
        if (this.metrics.iterations.length === 0) return 0;
        const successful = this.metrics.iterations.filter(i => i.success).length;
        return (successful / this.metrics.iterations.length * 100).toFixed(1);
    }

    // Calculate average time
    calculateAverageTime(items) {
        if (items.length === 0) return 0;
        const total = items.reduce((sum, item) => sum + (item.duration || 0), 0);
        return Math.round(total / items.length / 1000); // Convert to seconds
    }

    // Get recent alerts
    async getRecentAlerts(count) {
        try {
            const content = await fs.readFile(this.alertsFile, 'utf-8');
            const lines = content.trim().split('\n');
            return lines.slice(-count).map(line => JSON.parse(line));
        } catch (error) {
            return [];
        }
    }

    // Generate recommendations based on metrics
    generateRecommendations() {
        const recommendations = [];
        
        // Check for timeout pattern
        const timeoutErrors = this.metrics.errors.filter(e => e.includes('timeout'));
        if (timeoutErrors.length > 3) {
            recommendations.push('Consider increasing timeout values or adding delays between iterations');
        }
        
        // Check for slow phases
        const slowOperator = this.metrics.phases.operator.filter(p => p.duration > 180000);
        if (slowOperator.length > 2) {
            recommendations.push('Operator responses are slow - check network connectivity or API limits');
        }
        
        // Check for low code change verification
        const unverifiedChanges = this.metrics.codeChanges.filter(c => !c.verified);
        if (unverifiedChanges.length > this.metrics.codeChanges.length * 0.3) {
            recommendations.push('Many iterations complete without code changes - review task requirements');
        }
        
        return recommendations;
    }
}

export default MonitoringAlertsSystem;
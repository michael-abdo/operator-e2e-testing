import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import RetryUtility from '../lib/retry-utility.js';
import HealthCheckSystem from '../lib/health-check.js';
import CodeChangeVerifier from '../lib/code-change-verifier.js';
import SessionRecovery from '../lib/session-recovery.js';
import PhaseDurationEnforcer from '../lib/phase-duration-enforcer.js';
import MonitoringAlertsSystem from '../lib/monitoring-alerts.js';

describe('E2E Reliability Integration Tests', () => {
    
    describe('RetryUtility', () => {
        let retryUtil;
        
        beforeEach(() => {
            retryUtil = new RetryUtility({
                maxRetries: 3,
                initialDelay: 100,
                maxDelay: 1000,
                backoffMultiplier: 2
            });
        });
        
        it('should retry failed operations with exponential backoff', async () => {
            let attempts = 0;
            const failingFn = jest.fn(async () => {
                attempts++;
                if (attempts < 3) {
                    throw new Error('timeout');
                }
                return { success: true };
            });
            
            const result = await retryUtil.execute(failingFn);
            
            expect(result.success).toBe(true);
            expect(failingFn).toHaveBeenCalledTimes(3);
        });
        
        it('should stop retrying after max attempts', async () => {
            const alwaysFailFn = jest.fn(async () => {
                throw new Error('timeout');
            });
            
            await expect(retryUtil.execute(alwaysFailFn))
                .rejects.toThrow('timeout');
            
            expect(alwaysFailFn).toHaveBeenCalledTimes(3);
        });
        
        it('should not retry non-retryable errors', async () => {
            const fatalErrorFn = jest.fn(async () => {
                throw new Error('Fatal error');
            });
            
            await expect(retryUtil.execute(fatalErrorFn))
                .rejects.toThrow('Fatal error');
            
            expect(fatalErrorFn).toHaveBeenCalledTimes(1);
        });
    });
    
    describe('HealthCheckSystem', () => {
        let healthCheck;
        
        beforeEach(() => {
            healthCheck = new HealthCheckSystem({
                chromePort: 9222,
                tmuxSession: 'test-session',
                logger: jest.fn()
            });
        });
        
        it('should perform comprehensive health checks', async () => {
            // Mock Chrome check
            jest.spyOn(healthCheck, 'checkChromeHealth').mockResolvedValue({
                healthy: true,
                message: 'Chrome available'
            });
            
            // Mock other checks
            jest.spyOn(healthCheck, 'checkOperatorHealth').mockResolvedValue({
                healthy: true,
                message: 'Operator active'
            });
            
            jest.spyOn(healthCheck, 'checkClaudeHealth').mockResolvedValue({
                healthy: true,
                message: 'Claude session active'
            });
            
            jest.spyOn(healthCheck, 'checkSystemHealth').mockResolvedValue({
                healthy: true,
                message: 'System resources adequate'
            });
            
            const result = await healthCheck.performHealthCheck(1);
            
            expect(result.healthy).toBe(true);
            expect(result.checks).toHaveProperty('chrome');
            expect(result.checks).toHaveProperty('operator');
            expect(result.checks).toHaveProperty('claude');
            expect(result.checks).toHaveProperty('system');
        });
        
        it('should detect unhealthy states', async () => {
            jest.spyOn(healthCheck, 'checkChromeHealth').mockResolvedValue({
                healthy: false,
                message: 'Chrome not running',
                recovery: 'Start Chrome with debugging port'
            });
            
            const result = await healthCheck.performHealthCheck(1);
            
            expect(result.healthy).toBe(false);
            expect(result.checks.chrome.healthy).toBe(false);
        });
    });
    
    describe('CodeChangeVerifier', () => {
        let verifier;
        
        beforeEach(() => {
            verifier = new CodeChangeVerifier({
                logger: jest.fn(),
                minChangedFiles: 1,
                minChangedLines: 5
            });
        });
        
        it('should detect code changes between states', () => {
            const beforeState = {
                hash: 'abc123',
                stats: { filesChanged: 0, additions: 0, deletions: 0, totalChanges: 0 }
            };
            
            const afterState = {
                hash: 'def456',
                stats: { filesChanged: 2, additions: 10, deletions: 5, totalChanges: 15 }
            };
            
            const result = verifier.verifyChanges(beforeState, afterState);
            
            expect(result.verified).toBe(true);
            expect(result.changes.filesModified).toBe(2);
            expect(result.changes.totalChanges).toBe(15);
        });
        
        it('should fail verification for insufficient changes', () => {
            const beforeState = {
                hash: 'abc123',
                stats: { filesChanged: 0, additions: 0, deletions: 0, totalChanges: 0 }
            };
            
            const afterState = {
                hash: 'def456',
                stats: { filesChanged: 1, additions: 2, deletions: 0, totalChanges: 2 }
            };
            
            const result = verifier.verifyChanges(beforeState, afterState);
            
            expect(result.verified).toBe(false);
            expect(result.reason).toContain('lines changed');
        });
    });
    
    describe('PhaseDurationEnforcer', () => {
        let enforcer;
        let mockSleep;
        
        beforeEach(() => {
            enforcer = new PhaseDurationEnforcer({
                logger: jest.fn(),
                minOperatorDuration: 1000,
                minClaudeDuration: 2000
            });
            
            // Mock sleep to speed up tests
            mockSleep = jest.spyOn(enforcer, 'sleep').mockResolvedValue();
        });
        
        afterEach(() => {
            mockSleep.mockRestore();
        });
        
        it('should enforce minimum phase duration', async () => {
            const phase = enforcer.startPhase('operator', 1);
            
            // Complete immediately (too fast)
            const result = await enforcer.completePhase(phase.phaseKey);
            
            expect(result.allowed).toBe(true);
            expect(mockSleep).toHaveBeenCalled();
        });
        
        it('should track phase quality', async () => {
            const phase = enforcer.startPhase('claude', 1);
            
            // Add quality checks
            phase.addQualityCheck({
                type: 'code_changes',
                verified: true
            });
            
            phase.logEvent('File modified');
            phase.logEvent('Deployment started');
            
            // Mock elapsed time
            jest.spyOn(Date, 'now')
                .mockReturnValueOnce(0) // Start time
                .mockReturnValueOnce(2500); // End time (2.5 seconds)
            
            const result = await enforcer.completePhase(phase.phaseKey);
            
            expect(result.quality.score).toBeGreaterThan(50);
        });
    });
    
    describe('MonitoringAlertsSystem', () => {
        let monitoring;
        
        beforeEach(() => {
            monitoring = new MonitoringAlertsSystem({
                logger: jest.fn(),
                metricsFile: '/tmp/test-metrics.json',
                alertsFile: '/tmp/test-alerts.log'
            });
        });
        
        it('should track iteration metrics', async () => {
            await monitoring.recordIteration({
                iteration: 1,
                duration: 60000,
                success: true,
                failedTasks: 2,
                resolvedTasks: 1
            });
            
            expect(monitoring.metrics.iterations).toHaveLength(1);
            expect(monitoring.metrics.iterations[0].success).toBe(true);
        });
        
        it('should raise alerts for consecutive failures', async () => {
            const alertSpy = jest.fn();
            monitoring.on('alert', alertSpy);
            
            // Record 3 consecutive failures
            for (let i = 1; i <= 3; i++) {
                await monitoring.recordIteration({
                    iteration: i,
                    duration: 60000,
                    success: false,
                    failedTasks: 3,
                    resolvedTasks: 0
                });
            }
            
            expect(alertSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'CONSECUTIVE_FAILURES',
                    level: 'critical'
                })
            );
        });
        
        it('should generate comprehensive reports', async () => {
            // Add some test data
            await monitoring.recordIteration({
                iteration: 1,
                duration: 60000,
                success: true,
                failedTasks: 1,
                resolvedTasks: 2
            });
            
            await monitoring.recordPhase({
                phaseName: 'operator',
                iteration: 1,
                duration: 45000,
                quality: { score: 85 }
            });
            
            const report = await monitoring.generateReport();
            
            expect(report.summary.totalIterations).toBe(1);
            expect(report.summary.successRate).toBe('100.0');
            expect(report.summary.averageOperatorTime).toBeGreaterThan(0);
        });
    });
    
    describe('SessionRecovery', () => {
        let recovery;
        
        beforeEach(() => {
            recovery = new SessionRecovery({
                chromePort: 9222,
                logger: jest.fn()
            });
        });
        
        it('should attempt to recover Operator session', async () => {
            // Mock Chrome connection
            jest.spyOn(recovery, 'findOrCreateOperatorTab').mockResolvedValue({
                id: 'tab-123',
                url: 'https://operator.chatgpt.com'
            });
            
            jest.spyOn(recovery, 'getCurrentUrl').mockResolvedValue('https://operator.chatgpt.com');
            jest.spyOn(recovery, 'checkForSessionErrors').mockResolvedValue({ hasError: false });
            jest.spyOn(recovery, 'verifyPageInteraction').mockResolvedValue(true);
            
            const result = await recovery.recoverOperatorSession({
                targetId: 'old-tab',
                conversationUrl: 'https://operator.chatgpt.com/c/123',
                iteration: 3
            });
            
            expect(result.success).toBe(true);
            expect(result.recovered).toBe(true);
        });
        
        it('should detect and handle session errors', async () => {
            const errors = await recovery.checkForSessionErrors({
                evaluate: jest.fn().mockResolvedValue({
                    result: {
                        value: {
                            hasError: true,
                            type: 'rate_limit',
                            message: 'Rate limit detected'
                        }
                    }
                })
            });
            
            expect(errors.hasError).toBe(true);
            expect(errors.type).toBe('rate_limit');
        });
    });
});

describe('Integration: Full E2E Reliability Flow', () => {
    it('should handle a complete failure and recovery scenario', async () => {
        // This test simulates a full E2E execution with failures and recovery
        const healthCheck = new HealthCheckSystem({ logger: jest.fn() });
        const sessionRecovery = new SessionRecovery({ logger: jest.fn() });
        const retryUtil = RetryUtility.forOperatorCommunication(jest.fn());
        const monitoring = new MonitoringAlertsSystem({ logger: jest.fn() });
        
        // Simulate unhealthy system
        jest.spyOn(healthCheck, 'ensureHealthyBeforeIteration')
            .mockResolvedValueOnce(false) // First check fails
            .mockResolvedValueOnce(true); // After recovery succeeds
        
        // Simulate successful recovery
        jest.spyOn(sessionRecovery, 'performFullRecovery').mockResolvedValue({
            success: true,
            results: {
                'Chrome Health': { success: true },
                'Operator Session': { success: true },
                'Claude Session': { success: true }
            }
        });
        
        // Test the flow
        let healthOk = await healthCheck.ensureHealthyBeforeIteration(1);
        expect(healthOk).toBe(false);
        
        // Perform recovery
        const recovery = await sessionRecovery.performFullRecovery({});
        expect(recovery.success).toBe(true);
        
        // Health check should pass after recovery
        healthOk = await healthCheck.ensureHealthyBeforeIteration(1);
        expect(healthOk).toBe(true);
        
        // Record successful iteration
        await monitoring.recordIteration({
            iteration: 1,
            duration: 120000,
            success: true,
            failedTasks: 0,
            resolvedTasks: 3
        });
        
        const report = await monitoring.generateReport();
        expect(report.summary.successRate).toBe('100.0');
    });
});
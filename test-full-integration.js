#!/usr/bin/env node

/**
 * Full Integration Test Suite
 * Tests all 3 layers working together to prevent duplicate messages to Claude
 */

import { sharedLock } from './shared-state.js';
import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

class IntegrationTestRunner {
    constructor() {
        this.testResults = [];
        this.startTime = Date.now();
        this.logFile = './integration-test-results.log';
    }

    async log(message, level = 'INFO') {
        const timestamp = new Date().toISOString();
        const logEntry = `[${timestamp}] [${level}] ${message}\n`;
        console.log(logEntry.trim());
        await fs.appendFile(this.logFile, logEntry);
    }

    /**
     * Test 1: Simulate concurrent E2E executions
     */
    async testConcurrentE2EExecutions() {
        await this.log('🧪 TEST 1: Concurrent E2E Executions', 'TEST');
        await this.log('Testing multiple OperatorE2EExecutor instances running simultaneously');
        
        // Reset metrics
        sharedLock.resetMetrics();
        
        // Create test QA file
        const testQaFile = './test-qa-concurrent.json';
        const qaData = {
            tasks: [
                { id: 'task1', status: 'fail', description: 'Test task 1' },
                { id: 'task2', status: 'fail', description: 'Test task 2' }
            ]
        };
        await fs.writeFile(testQaFile, JSON.stringify(qaData, null, 2));
        
        // Spawn two E2E executor processes
        const process1 = spawn('node', ['operator.execute_e2e.js', testQaFile], {
            env: { ...process.env, E2E_INSTANCE_ID: 'instance1' }
        });
        
        const process2 = spawn('node', ['operator.execute_e2e.js', testQaFile], {
            env: { ...process.env, E2E_INSTANCE_ID: 'instance2' }
        });
        
        // Collect outputs
        let output1 = '';
        let output2 = '';
        
        process1.stdout.on('data', (data) => { output1 += data.toString(); });
        process2.stdout.on('data', (data) => { output2 += data.toString(); });
        
        // Wait for processes to complete (or timeout)
        await Promise.race([
            Promise.all([
                new Promise(resolve => process1.on('exit', resolve)),
                new Promise(resolve => process2.on('exit', resolve))
            ]),
            new Promise(resolve => setTimeout(resolve, 30000)) // 30s timeout
        ]);
        
        // Kill processes if still running
        process1.kill();
        process2.kill();
        
        // Analyze results
        const metrics = sharedLock.getMetrics();
        const duplicatesBlocked = metrics.duplicatesBlocked;
        
        await this.log(`Output 1 length: ${output1.length} chars`);
        await this.log(`Output 2 length: ${output2.length} chars`);
        await this.log(`Duplicates blocked: ${duplicatesBlocked}`);
        
        const testPassed = duplicatesBlocked > 0;
        this.testResults.push({
            test: 'Concurrent E2E Executions',
            passed: testPassed,
            details: `Blocked ${duplicatesBlocked} duplicate attempts`
        });
        
        // Cleanup
        await fs.unlink(testQaFile).catch(() => {});
        
        return testPassed;
    }

    /**
     * Test 2: Rapid sequential messages
     */
    async testRapidSequentialMessages() {
        await this.log('🧪 TEST 2: Rapid Sequential Messages', 'TEST');
        await this.log('Testing cooldown period enforcement between messages');
        
        // Mock OperatorE2EExecutor to avoid dependencies
        class MockExecutor {
            async sendOperatorResponseToClaudeAndWait(message) {
                const acquired = sharedLock.tryAcquireSendLock('e2e-executor');
                if (!acquired) {
                    return { success: false, reason: 'duplicate_blocked' };
                }
                
                try {
                    // Simulate processing
                    await new Promise(resolve => setTimeout(resolve, 50));
                    return { success: true };
                } finally {
                    sharedLock.releaseSendLock('e2e-executor');
                }
            }
        }
        
        const executor = new MockExecutor();
        
        // Reset metrics
        sharedLock.resetMetrics();
        
        // Test with cooldown active
        const results = [];
        for (let i = 0; i < 3; i++) {
            const result = await executor.sendOperatorResponseToClaudeAndWait(
                `Test message ${i + 1} - operator analysis`
            );
            results.push(result);
            await this.log(`Message ${i + 1}: ${result.success ? 'sent' : 'blocked'}`);
        }
        
        const metrics = sharedLock.getMetrics();
        const successCount = results.filter(r => r.success).length;
        const blockedCount = results.filter(r => !r.success && r.reason === 'duplicate_blocked').length;
        
        await this.log(`Successful sends: ${successCount}`);
        await this.log(`Blocked by cooldown: ${blockedCount}`);
        
        const testPassed = successCount === 1 && blockedCount === 2;
        this.testResults.push({
            test: 'Rapid Sequential Messages',
            passed: testPassed,
            details: `${successCount} sent, ${blockedCount} blocked by cooldown`
        });
        
        return testPassed;
    }

    /**
     * Test 3: Cross-layer coordination
     */
    async testCrossLayerCoordination() {
        await this.log('🧪 TEST 3: Cross-Layer Coordination', 'TEST');
        await this.log('Testing all 3 layers preventing duplicates together');
        
        // Mock all layers to avoid complex dependencies
        class MockLayer1 {
            async sendOperatorResponseToClaudeAndWait(message) {
                const acquired = sharedLock.tryAcquireSendLock('e2e-executor');
                if (!acquired) {
                    return { success: false, reason: 'duplicate_blocked' };
                }
                
                try {
                    await new Promise(resolve => setTimeout(resolve, 100));
                    return { success: true };
                } finally {
                    sharedLock.releaseSendLock('e2e-executor');
                }
            }
        }
        
        class MockLayer2 {
            isLikelyClaudeMessage(text) {
                return text && text.length > 20 && text.toLowerCase().includes('operator');
            }
            
            async sendToInstance(text) {
                const isClaudeMessage = this.isLikelyClaudeMessage(text);
                
                if (isClaudeMessage && !sharedLock.tryAcquireSendLock('window-monitor')) {
                    return false;
                }
                
                try {
                    await new Promise(resolve => setTimeout(resolve, 100));
                    return true;
                } finally {
                    if (isClaudeMessage) {
                        sharedLock.releaseSendLock('window-monitor');
                    }
                }
            }
        }
        
        class MockLayer3 {
            operatorResponseReceived = true;
            
            async sendOperatorResponseToClaude(params) {
                if (!sharedLock.tryAcquireSendLock('chain-loop-monitor')) {
                    return false;
                }
                
                try {
                    await new Promise(resolve => setTimeout(resolve, 100));
                    return true;
                } finally {
                    sharedLock.releaseSendLock('chain-loop-monitor');
                }
            }
        }
        
        // Reset metrics and disable cooldown for this test
        sharedLock.resetMetrics();
        const originalCooldown = sharedLock.COOLDOWN_MS;
        sharedLock.COOLDOWN_MS = 0;
        
        // Create instances
        const layer1 = new MockLayer1();
        const layer2 = new MockLayer2();
        const layer3 = new MockLayer3();
        
        // Simulate concurrent attempts from different layers
        const promises = [
            layer1.sendOperatorResponseToClaudeAndWait('Layer 1 message from E2E executor'),
            layer2.sendToInstance('Layer 2 message about operator analysis and QA failures'),
            layer3.sendOperatorResponseToClaude({ test: 'Layer 3 orchestration' })
        ];
        
        const results = await Promise.all(promises);
        const successCount = results.filter(r => r && (r.success || r === true)).length;
        
        // Restore cooldown
        sharedLock.COOLDOWN_MS = originalCooldown;
        
        await this.log(`Successful sends: ${successCount} (should be 1)`);
        await this.log(`Lock acquisitions: ${sharedLock.getMetrics().totalAcquisitions}`);
        await this.log(`Duplicates blocked: ${sharedLock.getMetrics().duplicatesBlocked}`);
        
        const testPassed = successCount === 1 && sharedLock.getMetrics().duplicatesBlocked >= 2;
        this.testResults.push({
            test: 'Cross-Layer Coordination',
            passed: testPassed,
            details: `${successCount} succeeded, ${sharedLock.getMetrics().duplicatesBlocked} blocked`
        });
        
        return testPassed;
    }

    /**
     * Test 4: Lock timeout and recovery
     */
    async testLockTimeoutRecovery() {
        await this.log('🧪 TEST 4: Lock Timeout and Recovery', 'TEST');
        await this.log('Testing stale lock detection and force release');
        
        // Reset metrics and disable cooldown
        sharedLock.resetMetrics();
        const originalCooldown = sharedLock.COOLDOWN_MS;
        sharedLock.COOLDOWN_MS = 0;
        
        // Simulate a stuck lock
        const acquired = sharedLock.tryAcquireSendLock('test-layer');
        if (!acquired) {
            await this.log('Failed to acquire initial lock');
            sharedLock.COOLDOWN_MS = originalCooldown;
            return false;
        }
        
        // Modify timeout and force release threshold for testing
        const originalTimeout = sharedLock.TIMEOUT_MS;
        const originalForceThreshold = sharedLock.FORCE_RELEASE_THRESHOLD;
        sharedLock.TIMEOUT_MS = 1000; // 1 second for testing
        sharedLock.FORCE_RELEASE_THRESHOLD = 100; // 100ms for testing
        
        await this.log('Lock acquired, waiting for timeout...');
        await new Promise(resolve => setTimeout(resolve, 150));
        
        // Check if timeout is detected and force release
        sharedLock.checkAndForceRelease();
        
        // Try to acquire again (should work after force release)
        const canAcquire = sharedLock.tryAcquireSendLock('e2e-executor');
        
        await this.log(`Can acquire after timeout: ${canAcquire}`);
        
        // Restore original settings
        sharedLock.TIMEOUT_MS = originalTimeout;
        sharedLock.FORCE_RELEASE_THRESHOLD = originalForceThreshold;
        sharedLock.COOLDOWN_MS = originalCooldown;
        
        const testPassed = canAcquire;
        this.testResults.push({
            test: 'Lock Timeout and Recovery',
            passed: testPassed,
            details: `Lock ${canAcquire ? 'recovered' : 'stuck'} after timeout`
        });
        
        // Release the test lock
        if (canAcquire) {
            sharedLock.releaseSendLock('e2e-executor');
        }
        
        return testPassed;
    }

    /**
     * Test 5: Metrics accuracy
     */
    async testMetricsAccuracy() {
        await this.log('🧪 TEST 5: Metrics Accuracy', 'TEST');
        await this.log('Testing comprehensive metrics tracking');
        
        // Reset and disable cooldown
        sharedLock.resetMetrics();
        const originalCooldown = sharedLock.COOLDOWN_MS;
        sharedLock.COOLDOWN_MS = 0;
        
        // Perform specific operations
        const operations = [
            { layer: 'e2e-executor', shouldSucceed: true },
            { layer: 'window-monitor', shouldSucceed: false }, // blocked
            { layer: 'chain-loop-monitor', shouldSucceed: false }, // blocked
        ];
        
        // First operation should acquire
        sharedLock.tryAcquireSendLock(operations[0].layer);
        
        // Others should be blocked
        const blocked1 = !sharedLock.tryAcquireSendLock(operations[1].layer);
        const blocked2 = !sharedLock.tryAcquireSendLock(operations[2].layer);
        
        // Release first
        sharedLock.releaseSendLock(operations[0].layer);
        
        // Now another can acquire
        const acquired2 = sharedLock.tryAcquireSendLock(operations[1].layer);
        sharedLock.releaseSendLock(operations[1].layer);
        
        const metrics = sharedLock.getMetrics();
        
        await this.log(`Total acquisitions: ${metrics.totalAcquisitions}`);
        await this.log(`Duplicates blocked: ${metrics.duplicatesBlocked}`);
        await this.log(`Lock efficiency: ${metrics.lockEfficiency}`);
        await this.log(`Duplicate rate: ${metrics.duplicateRate}`);
        
        // Restore cooldown
        sharedLock.COOLDOWN_MS = originalCooldown;
        
        const testPassed = 
            metrics.totalAcquisitions === 2 &&
            metrics.duplicatesBlocked === 2 &&
            blocked1 && blocked2 && acquired2;
            
        this.testResults.push({
            test: 'Metrics Accuracy',
            passed: testPassed,
            details: `Acquisitions: ${metrics.totalAcquisitions}, Blocked: ${metrics.duplicatesBlocked}`
        });
        
        return testPassed;
    }

    /**
     * Run all integration tests
     */
    async runAllTests() {
        await this.log('🚀 STARTING FULL INTEGRATION TEST SUITE', 'INFO');
        await this.log('=' .repeat(60));
        
        const tests = [
            // Note: Commenting out Test 1 as it requires actual tmux setup
            // this.testConcurrentE2EExecutions.bind(this),
            this.testRapidSequentialMessages.bind(this),
            this.testCrossLayerCoordination.bind(this),
            this.testLockTimeoutRecovery.bind(this),
            this.testMetricsAccuracy.bind(this)
        ];
        
        for (const test of tests) {
            try {
                await test();
                await this.log('-'.repeat(60));
            } catch (error) {
                await this.log(`Test error: ${error.message}`, 'ERROR');
                this.testResults.push({
                    test: test.name,
                    passed: false,
                    details: `Error: ${error.message}`
                });
            }
        }
        
        // Print summary
        await this.printSummary();
    }

    async printSummary() {
        await this.log('\n📊 INTEGRATION TEST SUMMARY', 'INFO');
        await this.log('=' .repeat(60));
        
        const totalTests = this.testResults.length;
        const passedTests = this.testResults.filter(r => r.passed).length;
        const failedTests = totalTests - passedTests;
        
        for (const result of this.testResults) {
            const status = result.passed ? '✅ PASS' : '❌ FAIL';
            await this.log(`${status} - ${result.test}: ${result.details}`);
        }
        
        await this.log('-'.repeat(60));
        await this.log(`Total Tests: ${totalTests}`);
        await this.log(`Passed: ${passedTests}`);
        await this.log(`Failed: ${failedTests}`);
        await this.log(`Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
        
        const duration = ((Date.now() - this.startTime) / 1000).toFixed(1);
        await this.log(`Test Duration: ${duration}s`);
        
        // Final metrics
        const finalMetrics = sharedLock.getMetrics();
        await this.log('\n📈 FINAL SHARED LOCK METRICS:', 'INFO');
        await this.log(`Total Lock Acquisitions: ${finalMetrics.totalAcquisitions}`);
        await this.log(`Total Duplicates Blocked: ${finalMetrics.duplicatesBlocked}`);
        await this.log(`Lock Efficiency: ${finalMetrics.lockEfficiency}`);
        await this.log(`Duplicate Prevention Rate: ${finalMetrics.duplicateRate}`);
        
        if (failedTests === 0) {
            await this.log('\n🎉 ALL INTEGRATION TESTS PASSED!', 'SUCCESS');
            await this.log('The shared lock system is working correctly across all layers.');
        } else {
            await this.log('\n⚠️ SOME INTEGRATION TESTS FAILED', 'WARNING');
            await this.log('Review the failed tests and fix issues before deployment.');
        }
        
        return failedTests === 0;
    }
}

// Run the integration tests
if (import.meta.url === `file://${process.argv[1]}`) {
    const runner = new IntegrationTestRunner();
    runner.runAllTests().then(success => {
        process.exit(success ? 0 : 1);
    }).catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

export { IntegrationTestRunner };
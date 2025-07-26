#!/usr/bin/env node

/**
 * Production Edge Case Testing
 * Tests edge cases and error recovery in production-like scenarios
 */

import { sharedLock } from './shared-state.js';
import { spawn } from 'child_process';

class EdgeCaseTestRunner {
    constructor() {
        this.testResults = [];
        this.startTime = Date.now();
    }

    log(message, level = 'INFO') {
        console.log(`[${new Date().toISOString()}] [${level}] ${message}`);
    }

    /**
     * Test 1: Process crash recovery
     */
    async testProcessCrashRecovery() {
        this.log('🧪 TEST 1: Process Crash Recovery', 'TEST');
        
        // Reset metrics
        sharedLock.resetMetrics();
        
        // Acquire lock
        const acquired = sharedLock.tryAcquireSendLock('e2e-executor');
        this.log(`Lock acquired: ${acquired}`);
        
        // Simulate process crash (don't release lock)
        this.log('Simulating process crash (lock not released)...');
        
        // Check timeout mechanism
        const originalThreshold = sharedLock.FORCE_RELEASE_THRESHOLD;
        sharedLock.FORCE_RELEASE_THRESHOLD = 100; // 100ms for testing
        
        await new Promise(resolve => setTimeout(resolve, 150));
        
        // Force check
        sharedLock.checkAndForceRelease();
        
        // Try to acquire from another process
        const canAcquireAfterCrash = sharedLock.tryAcquireSendLock('window-monitor');
        
        sharedLock.FORCE_RELEASE_THRESHOLD = originalThreshold;
        
        if (canAcquireAfterCrash) {
            sharedLock.releaseSendLock('window-monitor');
        }
        
        const testPassed = canAcquireAfterCrash;
        this.testResults.push({
            test: 'Process Crash Recovery',
            passed: testPassed,
            details: testPassed ? 'Lock recovered after crash' : 'Lock stuck after crash'
        });
        
        return testPassed;
    }

    /**
     * Test 2: Network interruption simulation
     */
    async testNetworkInterruption() {
        this.log('🧪 TEST 2: Network Interruption Handling', 'TEST');
        
        // Reset metrics
        sharedLock.resetMetrics();
        
        // Simulate acquiring lock before network issue
        const acquired = sharedLock.tryAcquireSendLock('e2e-executor');
        this.log(`Lock acquired before network issue: ${acquired}`);
        
        // Simulate network delay
        this.log('Simulating network interruption...');
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Should still be able to release
        const released = sharedLock.releaseSendLock('e2e-executor');
        this.log(`Lock released after network recovery: ${released}`);
        
        const testPassed = acquired && released;
        this.testResults.push({
            test: 'Network Interruption Handling',
            passed: testPassed,
            details: testPassed ? 'Lock maintained through network issue' : 'Lock corrupted by network issue'
        });
        
        return testPassed;
    }

    /**
     * Test 3: Rapid layer switching
     */
    async testRapidLayerSwitching() {
        this.log('🧪 TEST 3: Rapid Layer Switching', 'TEST');
        
        // Reset metrics and disable cooldown
        sharedLock.resetMetrics();
        const originalCooldown = sharedLock.COOLDOWN_MS;
        sharedLock.COOLDOWN_MS = 0;
        
        const layers = ['e2e-executor', 'window-monitor', 'chain-loop-monitor'];
        const results = [];
        
        // Rapidly switch between layers
        for (let i = 0; i < 30; i++) {
            const layer = layers[i % 3];
            const acquired = sharedLock.tryAcquireSendLock(layer);
            
            if (acquired) {
                results.push({ layer, success: true });
                // Quick work simulation
                await new Promise(resolve => setImmediate(resolve));
                sharedLock.releaseSendLock(layer);
            } else {
                results.push({ layer, success: false });
            }
        }
        
        sharedLock.COOLDOWN_MS = originalCooldown;
        
        const successCount = results.filter(r => r.success).length;
        const testPassed = successCount === 30; // All should succeed with no cooldown
        
        this.testResults.push({
            test: 'Rapid Layer Switching',
            passed: testPassed,
            details: `${successCount}/30 successful acquisitions`
        });
        
        return testPassed;
    }

    /**
     * Test 4: Memory leak detection
     */
    async testMemoryLeakDetection() {
        this.log('🧪 TEST 4: Memory Leak Detection', 'TEST');
        
        const initialMemory = process.memoryUsage().heapUsed;
        
        // Perform many lock operations
        for (let i = 0; i < 1000; i++) {
            const layer = i % 2 === 0 ? 'e2e-executor' : 'window-monitor';
            
            const acquired = sharedLock.tryAcquireSendLock(layer);
            if (acquired) {
                sharedLock.releaseSendLock(layer);
            }
            
            // Check history is being trimmed
            if (i % 100 === 0) {
                const history = sharedLock.lockHistory;
                if (history.length > sharedLock.HISTORY_LIMIT) {
                    this.log(`History overflow at iteration ${i}: ${history.length} entries`, 'ERROR');
                }
            }
        }
        
        // Force garbage collection if available
        if (global.gc) {
            global.gc();
        }
        
        const finalMemory = process.memoryUsage().heapUsed;
        const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024; // MB
        
        this.log(`Memory increase: ${memoryIncrease.toFixed(2)} MB`);
        
        const testPassed = memoryIncrease < 5; // Less than 5MB increase
        this.testResults.push({
            test: 'Memory Leak Detection',
            passed: testPassed,
            details: `Memory increase: ${memoryIncrease.toFixed(2)} MB`
        });
        
        return testPassed;
    }

    /**
     * Test 5: Concurrent error handling
     */
    async testConcurrentErrorHandling() {
        this.log('🧪 TEST 5: Concurrent Error Handling', 'TEST');
        
        // Reset metrics
        sharedLock.resetMetrics();
        
        const promises = [];
        
        // Create concurrent operations with some designed to fail
        for (let i = 0; i < 10; i++) {
            promises.push(this.concurrentErrorOperation(i));
        }
        
        const results = await Promise.allSettled(promises);
        
        const successCount = results.filter(r => r.status === 'fulfilled' && r.value).length;
        const errorCount = results.filter(r => r.status === 'rejected').length;
        
        this.log(`Successful operations: ${successCount}`);
        this.log(`Failed operations: ${errorCount}`);
        
        // Check lock state after errors
        const lockStatus = sharedLock.getLockStatus();
        const testPassed = !lockStatus.isSendingToClaude && errorCount === 0;
        
        this.testResults.push({
            test: 'Concurrent Error Handling',
            passed: testPassed,
            details: `${successCount} succeeded, ${errorCount} errors, lock ${lockStatus.isSendingToClaude ? 'stuck' : 'clear'}`
        });
        
        return testPassed;
    }

    async concurrentErrorOperation(index) {
        try {
            // Some operations designed to create contention
            if (index % 3 === 0) {
                // Try invalid layer
                return sharedLock.tryAcquireSendLock(`invalid-layer-${index}`);
            } else {
                const layer = index % 2 === 0 ? 'e2e-executor' : 'window-monitor';
                const acquired = sharedLock.tryAcquireSendLock(layer);
                
                if (acquired) {
                    // Simulate work
                    await new Promise(resolve => setTimeout(resolve, 10));
                    sharedLock.releaseSendLock(layer);
                    return true;
                }
                
                return false;
            }
        } catch (error) {
            throw error;
        }
    }

    /**
     * Test 6: Lock state persistence
     */
    async testLockStatePersistence() {
        this.log('🧪 TEST 6: Lock State Persistence', 'TEST');
        
        // Get initial metrics
        const initialMetrics = sharedLock.getMetrics();
        
        // Perform some operations
        sharedLock.tryAcquireSendLock('e2e-executor');
        sharedLock.releaseSendLock('e2e-executor');
        
        sharedLock.tryAcquireSendLock('window-monitor');
        sharedLock.tryAcquireSendLock('chain-loop-monitor'); // Should be blocked
        sharedLock.releaseSendLock('window-monitor');
        
        // Get final metrics
        const finalMetrics = sharedLock.getMetrics();
        
        // Verify metrics updated correctly
        const acquisitionsDiff = finalMetrics.totalAcquisitions - initialMetrics.totalAcquisitions;
        const blockedDiff = finalMetrics.duplicatesBlocked - initialMetrics.duplicatesBlocked;
        
        const testPassed = acquisitionsDiff === 2 && blockedDiff === 1;
        
        this.testResults.push({
            test: 'Lock State Persistence',
            passed: testPassed,
            details: `Acquisitions tracked: ${acquisitionsDiff}, Blocks tracked: ${blockedDiff}`
        });
        
        return testPassed;
    }

    /**
     * Run all edge case tests
     */
    async runAllTests() {
        this.log('🚀 STARTING EDGE CASE TEST SUITE', 'INFO');
        this.log('=' .repeat(50));
        
        const tests = [
            this.testProcessCrashRecovery.bind(this),
            this.testNetworkInterruption.bind(this),
            this.testRapidLayerSwitching.bind(this),
            this.testMemoryLeakDetection.bind(this),
            this.testConcurrentErrorHandling.bind(this),
            this.testLockStatePersistence.bind(this)
        ];
        
        for (const test of tests) {
            try {
                await test();
                this.log('-'.repeat(50));
            } catch (error) {
                this.log(`Test error: ${error.message}`, 'ERROR');
                this.testResults.push({
                    test: test.name,
                    passed: false,
                    details: `Error: ${error.message}`
                });
            }
        }
        
        this.printSummary();
    }

    printSummary() {
        this.log('\n📊 EDGE CASE TEST SUMMARY', 'INFO');
        this.log('=' .repeat(50));
        
        const totalTests = this.testResults.length;
        const passedTests = this.testResults.filter(r => r.passed).length;
        const failedTests = totalTests - passedTests;
        
        for (const result of this.testResults) {
            const status = result.passed ? '✅ PASS' : '❌ FAIL';
            this.log(`${status} - ${result.test}: ${result.details}`);
        }
        
        this.log('-'.repeat(50));
        this.log(`Total Tests: ${totalTests}`);
        this.log(`Passed: ${passedTests}`);
        this.log(`Failed: ${failedTests}`);
        this.log(`Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
        
        const duration = ((Date.now() - this.startTime) / 1000).toFixed(1);
        this.log(`Test Duration: ${duration}s`);
        
        if (failedTests === 0) {
            this.log('\n🎉 ALL EDGE CASE TESTS PASSED!', 'SUCCESS');
            this.log('The shared lock system handles edge cases correctly.');
        } else {
            this.log('\n⚠️ SOME EDGE CASE TESTS FAILED', 'WARNING');
            this.log('Review and fix edge case handling.');
        }
        
        return failedTests === 0;
    }
}

// Run the tests
if (import.meta.url === `file://${process.argv[1]}`) {
    const runner = new EdgeCaseTestRunner();
    runner.runAllTests().then(success => {
        process.exit(success ? 0 : 1);
    }).catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

export { EdgeCaseTestRunner };
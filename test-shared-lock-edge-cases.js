/**
 * Comprehensive Edge Case Testing for SharedLock
 * Tests all failure scenarios and edge cases
 */

import { sharedLock, SharedLock } from './shared-state.js';

class EdgeCaseTestSuite {
    constructor() {
        this.testResults = [];
        this.testCount = 0;
        this.passCount = 0;
        this.failCount = 0;
    }
    
    async runAllTests() {
        console.log('🧪 Starting Comprehensive Edge Case Testing');
        console.log('=============================================');
        
        // Reset metrics for clean testing
        sharedLock.resetMetrics();
        
        await this.testBasicFunctionality();
        await this.testDuplicatePrevention();
        await this.testInvalidLayerIds();
        await this.testOwnershipValidation();
        await this.testTimeoutAndForceRelease();
        await this.testCooldownPeriod();
        await this.testConcurrentRequests();
        await this.testErrorRecovery();
        await this.testMetricsAccuracy();
        await this.testMemoryLeakPrevention();
        
        this.printTestSummary();
        return this.failCount === 0;
    }
    
    async testBasicFunctionality() {
        console.log('\n📋 Test Group: Basic Functionality');
        console.log('----------------------------------');
        
        // Test 1: Basic lock acquire and release
        this.test('Basic lock acquire and release', () => {
            // Reset cooldown for clean testing
            sharedLock.lastSendTime = 0;
            
            const acquired = sharedLock.tryAcquireSendLock('e2e-executor');
            if (!acquired) throw new Error('Lock acquisition failed');
            
            const status = sharedLock.getLockStatus();
            if (!status.isSendingToClaude) throw new Error('Lock state not updated');
            if (status.sendingLayerId !== 'e2e-executor') throw new Error('Layer ID not set');
            
            const released = sharedLock.releaseSendLock('e2e-executor');
            if (!released) throw new Error('Lock release failed');
            
            const finalStatus = sharedLock.getLockStatus();
            if (finalStatus.isSendingToClaude) throw new Error('Lock not cleared');
            
            return true;
        });
        
        // Test 2: Lock status accuracy
        this.test('Lock status accuracy', () => {
            // Reset cooldown for clean testing
            sharedLock.lastSendTime = 0;
            
            const acquired = sharedLock.tryAcquireSendLock('window-monitor');
            if (!acquired) throw new Error('Lock acquisition failed');
            
            const status = sharedLock.getLockStatus();
            if (status.sendingLayerId !== 'window-monitor') throw new Error('Incorrect layer ID');
            if (!status.lockStartTime) throw new Error('Lock start time not set');
            if (status.lockAge === null) throw new Error('Lock age not calculated');
            
            sharedLock.releaseSendLock('window-monitor');
            return true;
        });
    }
    
    async testDuplicatePrevention() {
        console.log('\n🚫 Test Group: Duplicate Prevention');
        console.log('-----------------------------------');
        
        // Test 3: Duplicate from same layer
        this.test('Duplicate prevention - same layer', () => {
            // Reset cooldown for clean testing
            sharedLock.lastSendTime = 0;
            
            const first = sharedLock.tryAcquireSendLock('e2e-executor');
            if (!first) throw new Error('First acquisition failed');
            
            const second = sharedLock.tryAcquireSendLock('e2e-executor');
            if (second) throw new Error('Duplicate acquisition allowed');
            
            sharedLock.releaseSendLock('e2e-executor');
            return true;
        });
        
        // Test 4: Duplicate from different layer
        this.test('Duplicate prevention - different layers', () => {
            // Reset cooldown for clean testing
            sharedLock.lastSendTime = 0;
            
            const first = sharedLock.tryAcquireSendLock('window-monitor');
            if (!first) throw new Error('First acquisition failed');
            
            const second = sharedLock.tryAcquireSendLock('chain-loop-monitor');
            if (second) throw new Error('Cross-layer duplicate allowed');
            
            sharedLock.releaseSendLock('window-monitor');
            
            // Reset cooldown after release
            sharedLock.lastSendTime = 0;
            
            // Now second layer should succeed
            const third = sharedLock.tryAcquireSendLock('chain-loop-monitor');
            if (!third) throw new Error('Post-release acquisition failed');
            
            sharedLock.releaseSendLock('chain-loop-monitor');
            return true;
        });
        
        // Test 5: Metrics tracking for duplicates
        this.test('Duplicate metrics tracking', () => {
            // Reset cooldown for clean testing
            sharedLock.lastSendTime = 0;
            const initialMetrics = sharedLock.getMetrics();
            const initialBlocked = initialMetrics.duplicatesBlocked;
            
            const acquired = sharedLock.tryAcquireSendLock('e2e-executor');
            if (!acquired) throw new Error('Initial acquisition failed');
            
            sharedLock.tryAcquireSendLock('window-monitor'); // Should be blocked
            sharedLock.tryAcquireSendLock('chain-loop-monitor'); // Should be blocked
            
            const metrics = sharedLock.getMetrics();
            const expectedBlocked = initialBlocked + 2;
            
            if (metrics.duplicatesBlocked !== expectedBlocked) {
                throw new Error(`Expected ${expectedBlocked} blocked, got ${metrics.duplicatesBlocked}`);
            }
            
            sharedLock.releaseSendLock('e2e-executor');
            return true;
        });
    }
    
    async testInvalidLayerIds() {
        console.log('\n❌ Test Group: Invalid Layer IDs');
        console.log('---------------------------------');
        
        // Test 6: Null/undefined layer ID
        this.test('Null/undefined layer ID rejection', () => {
            const nullResult = sharedLock.tryAcquireSendLock(null);
            if (nullResult) throw new Error('Null layer ID accepted');
            
            const undefinedResult = sharedLock.tryAcquireSendLock(undefined);
            if (undefinedResult) throw new Error('Undefined layer ID accepted');
            
            return true;
        });
        
        // Test 7: Invalid layer ID types
        this.test('Invalid layer ID types rejection', () => {
            const numberResult = sharedLock.tryAcquireSendLock(123);
            if (numberResult) throw new Error('Number layer ID accepted');
            
            const objectResult = sharedLock.tryAcquireSendLock({});
            if (objectResult) throw new Error('Object layer ID accepted');
            
            const arrayResult = sharedLock.tryAcquireSendLock([]);
            if (arrayResult) throw new Error('Array layer ID accepted');
            
            return true;
        });
        
        // Test 8: Unknown layer ID
        this.test('Unknown layer ID rejection', () => {
            const result = sharedLock.tryAcquireSendLock('unknown-layer');
            if (result) throw new Error('Unknown layer ID accepted');
            
            return true;
        });
    }
    
    async testOwnershipValidation() {
        console.log('\n🔐 Test Group: Ownership Validation');
        console.log('-----------------------------------');
        
        // Test 9: Wrong layer trying to release
        this.test('Wrong layer release prevention', () => {
            // Reset cooldown for clean testing
            sharedLock.lastSendTime = 0;
            
            const acquired = sharedLock.tryAcquireSendLock('e2e-executor');
            if (!acquired) throw new Error('Initial acquisition failed');
            
            const wrongRelease = sharedLock.releaseSendLock('window-monitor');
            if (wrongRelease) throw new Error('Wrong layer allowed to release');
            
            // Verify lock still held
            const status = sharedLock.getLockStatus();
            if (!status.isSendingToClaude) throw new Error('Lock incorrectly released');
            
            // Correct layer should be able to release
            const correctRelease = sharedLock.releaseSendLock('e2e-executor');
            if (!correctRelease) throw new Error('Correct layer could not release');
            
            return true;
        });
        
        // Test 10: Release without holding lock
        this.test('Release without lock held', () => {
            // Ensure no lock is held
            const status = sharedLock.getLockStatus();
            if (status.isSendingToClaude) {
                sharedLock.forceReleaseLock('test_cleanup');
            }
            
            const result = sharedLock.releaseSendLock('any-layer');
            if (result) throw new Error('Release without lock succeeded');
            
            return true;
        });
    }
    
    async testTimeoutAndForceRelease() {
        console.log('\n⏰ Test Group: Timeout and Force Release');
        console.log('---------------------------------------');
        
        // Test 11: Force release functionality
        this.test('Force release functionality', () => {
            // Reset cooldown for clean testing
            sharedLock.lastSendTime = 0;
            
            const acquired = sharedLock.tryAcquireSendLock('test-layer');
            if (!acquired) throw new Error('Initial acquisition failed');
            
            // Manually trigger force release
            sharedLock.forceReleaseLock('manual_test');
            
            const status = sharedLock.getLockStatus();
            if (status.isSendingToClaude) throw new Error('Force release failed');
            
            return true;
        });
        
        // Test 12: Stale lock detection (simulated)
        this.test('Stale lock detection', () => {
            const testLock = new SharedLock();
            testLock.FORCE_RELEASE_THRESHOLD = 50; // 50ms for testing
            testLock.COOLDOWN_MS = 0; // Disable cooldown for testing
            
            const acquired = testLock.tryAcquireSendLock('test-layer');
            if (!acquired) throw new Error('Initial acquisition failed');
            
            // Wait for threshold
            return new Promise((resolve) => {
                setTimeout(() => {
                    testLock.checkAndForceRelease();
                    
                    const status = testLock.getLockStatus();
                    if (status.isSendingToClaude) {
                        throw new Error('Stale lock not released');
                    }
                    
                    resolve(true);
                }, 75);
            });
        });
    }
    
    async testCooldownPeriod() {
        console.log('\n🕐 Test Group: Cooldown Period');
        console.log('------------------------------');
        
        // Test 13: Cooldown enforcement
        this.test('Cooldown period enforcement', async () => {
            const testLock = new SharedLock();
            testLock.COOLDOWN_MS = 200; // 200ms for faster testing
            
            // First acquisition should succeed
            const first = testLock.tryAcquireSendLock('test-layer');
            if (!first) throw new Error('First acquisition failed');
            testLock.releaseSendLock('test-layer');
            
            // Immediate second acquisition should fail (cooldown)
            const second = testLock.tryAcquireSendLock('test-layer');
            if (second) throw new Error('Cooldown not enforced');
            
            // Wait for cooldown to expire
            await new Promise(resolve => setTimeout(resolve, 250));
            
            // Third acquisition should succeed
            const third = testLock.tryAcquireSendLock('test-layer');
            if (!third) throw new Error('Post-cooldown acquisition failed');
            testLock.releaseSendLock('test-layer');
            
            return true;
        });
    }
    
    async testConcurrentRequests() {
        console.log('\n🔄 Test Group: Concurrent Requests');
        console.log('----------------------------------');
        
        // Test 14: Multiple rapid requests
        this.test('Multiple rapid requests', () => {
            // Reset cooldown for clean testing
            sharedLock.lastSendTime = 0;
            
            const results = [];
            const layers = ['e2e-executor', 'window-monitor', 'chain-loop-monitor', 'test-layer'];
            
            // Fire multiple requests rapidly
            for (const layer of layers) {
                results.push(sharedLock.tryAcquireSendLock(layer));
            }
            
            // Only first should succeed
            const successCount = results.filter(r => r).length;
            if (successCount !== 1) {
                throw new Error(`Expected 1 success, got ${successCount}`);
            }
            
            // Find and release the successful lock
            for (let i = 0; i < results.length; i++) {
                if (results[i]) {
                    sharedLock.releaseSendLock(layers[i]);
                    break;
                }
            }
            
            return true;
        });
    }
    
    async testErrorRecovery() {
        console.log('\n🛠️ Test Group: Error Recovery');
        console.log('-----------------------------');
        
        // Test 15: Error during release
        this.test('Error recovery during release', () => {
            const testLock = new SharedLock();
            testLock.COOLDOWN_MS = 0; // Disable cooldown for testing
            
            const acquired = testLock.tryAcquireSendLock('test-layer');
            if (!acquired) throw new Error('Initial acquisition failed');
            
            // Simulate error by corrupting state
            const originalLayerId = testLock.sendingLayerId;
            testLock.sendingLayerId = null;
            
            // Release should trigger error recovery
            const result = testLock.releaseSendLock('test-layer');
            
            // Lock should be force released due to error
            const status = testLock.getLockStatus();
            if (status.isSendingToClaude) {
                throw new Error('Error recovery failed');
            }
            
            return true;
        });
    }
    
    async testMetricsAccuracy() {
        console.log('\n📊 Test Group: Metrics Accuracy');
        console.log('-------------------------------');
        
        // Test 16: Comprehensive metrics validation
        this.test('Comprehensive metrics validation', () => {
            const testLock = new SharedLock();
            testLock.COOLDOWN_MS = 0; // Disable cooldown for testing
            
            // Perform various operations
            testLock.tryAcquireSendLock('e2e-executor'); // Success
            testLock.tryAcquireSendLock('window-monitor'); // Blocked
            testLock.tryAcquireSendLock('chain-loop-monitor'); // Blocked
            testLock.releaseSendLock('e2e-executor');    // Success
            testLock.tryAcquireSendLock('window-monitor'); // Success
            testLock.forceReleaseLock('manual');   // Force release
            
            const metrics = testLock.getMetrics();
            
            if (metrics.totalAcquisitions !== 2) {
                throw new Error(`Expected 2 acquisitions, got ${metrics.totalAcquisitions}`);
            }
            
            if (metrics.duplicatesBlocked !== 2) {
                throw new Error(`Expected 2 blocked, got ${metrics.duplicatesBlocked}`);
            }
            
            if (metrics.forceReleases !== 1) {
                throw new Error(`Expected 1 force release, got ${metrics.forceReleases}`);
            }
            
            return true;
        });
    }
    
    async testMemoryLeakPrevention() {
        console.log('\n🧠 Test Group: Memory Leak Prevention');
        console.log('-------------------------------------');
        
        // Test 17: Lock history size limit
        this.test('Lock history size limit', () => {
            const testLock = new SharedLock();
            
            // Generate more than 100 history entries
            for (let i = 0; i < 150; i++) {
                testLock.tryAcquireSendLock('test-layer');
                testLock.forceReleaseLock('cleanup');
            }
            
            const metrics = testLock.getMetrics();
            if (metrics.recentActivity.length > 100) {
                throw new Error(`History too long: ${metrics.recentActivity.length}`);
            }
            
            return true;
        });
    }
    
    async test(description, testFunction) {
        this.testCount++;
        try {
            const result = testFunction();
            
            // Handle async test results
            if (result instanceof Promise) {
                await result;
            }
            
            console.log(`  ✅ ${description}`);
            this.passCount++;
            this.testResults.push({ description, passed: true, error: null });
        } catch (error) {
            console.log(`  ❌ ${description}: ${error.message}`);
            this.failCount++;
            this.testResults.push({ description, passed: false, error: error.message });
        }
    }
    
    printTestSummary() {
        console.log('\n📋 Test Summary');
        console.log('================');
        console.log(`Total Tests: ${this.testCount}`);
        console.log(`Passed: ${this.passCount}`);
        console.log(`Failed: ${this.failCount}`);
        console.log(`Success Rate: ${((this.passCount / this.testCount) * 100).toFixed(1)}%`);
        
        if (this.failCount > 0) {
            console.log('\n❌ Failed Tests:');
            this.testResults
                .filter(r => !r.passed)
                .forEach(r => console.log(`  - ${r.description}: ${r.error}`));
        }
        
        console.log('\n📊 Final SharedLock Metrics:');
        console.log(sharedLock.getMetrics());
        
        if (this.failCount === 0) {
            console.log('\n🎉 ALL TESTS PASSED! SharedLock is ready for integration.');
        } else {
            console.log('\n⚠️  Some tests failed. Review and fix before integration.');
        }
    }
}

// Run the test suite
const testSuite = new EdgeCaseTestSuite();
testSuite.runAllTests().then(success => {
    process.exit(success ? 0 : 1);
});
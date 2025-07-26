/**
 * Test Layer 1 Wrapper Implementation
 * Tests the shared lock integration in OperatorE2EExecutor
 */

import { sharedLock } from './shared-state.js';

class MockOperatorE2EExecutor {
    constructor() {
        this.workflowTimings = {};
        this.iteration = 1;
        this.runId = 'test-run-123';
    }

    log(message, level = 'INFO') {
        console.log(`[${level}] ${message}`);
    }

    getTimestamp() {
        return new Date().toISOString();
    }

    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Simplified version of the wrapped function for testing
    async sendOperatorResponseToClaudeAndWait(operatorResponse) {
        // Acquire shared lock to prevent duplicate messages to Claude
        if (!sharedLock.tryAcquireSendLock('e2e-executor')) {
            this.log('⚠️ DUPLICATE BLOCKED: Another layer is already sending to Claude', 'WARNING');
            return {
                success: false,
                error: 'Duplicate send blocked - another layer is currently sending to Claude',
                reason: 'duplicate_blocked'
            };
        }

        try {
            this.log('🔒 SEND LOCK ACQUIRED: e2e-executor - Starting Claude communication', 'INFO');
            console.log('📤 Sending Operator response to Claude Code...');
            
            // Record Claude input timestamp
            this.workflowTimings.claudeInputTime = Date.now(); 
            this.log(`🕐 CLAUDE INPUT: ${this.getTimestamp()}`, 'TIMING');

            // Simulate sending to Claude (replace with actual tmux commands in production)
            console.log(`📝 Simulating Claude send: ${operatorResponse.substring(0, 100)}...`);
            await this.sleep(100); // Simulate processing time
            
            // Simulate successful response
            return {
                success: true,
                claudeResponse: "Simulated TASK_FINISHED response",
                detectionId: 'test-detection-123'
            };
            
        } catch (error) {
            return {
                success: false,
                error: `Failed to send to Claude: ${error.message}`
            };
        } finally {
            // Always release the lock, even on error
            sharedLock.releaseSendLock('e2e-executor');
            this.log('🔓 SEND LOCK RELEASED: e2e-executor - Claude communication complete', 'INFO');
        }
    }
}

// Test Suite
async function runLayer1Tests() {
    console.log('🧪 Testing Layer 1 Wrapper Implementation');
    console.log('=========================================');
    
    // Reset metrics for clean testing
    sharedLock.resetMetrics();
    
    // Disable cooldown for testing to allow rapid sequential tests
    const originalCooldown = sharedLock.COOLDOWN_MS;
    sharedLock.COOLDOWN_MS = 0;
    console.log('⚙️ Cooldown disabled for testing');
    
    const executor1 = new MockOperatorE2EExecutor();
    const executor2 = new MockOperatorE2EExecutor();
    
    console.log('\n📋 Test 1: Single executor should succeed');
    console.log('------------------------------------------');
    const result1 = await executor1.sendOperatorResponseToClaudeAndWait('Test operator response 1');
    console.log(`Result: ${result1.success ? '✅ Success' : '❌ Failed'}`);
    if (!result1.success) {
        console.log(`Error: ${result1.error}`);
    }
    
    console.log('\n📋 Test 2: Concurrent executors - second should be blocked');
    console.log('----------------------------------------------------------');
    
    // Test concurrent access by starting first but not waiting
    console.log('Starting first executor...');
    const promise1 = executor1.sendOperatorResponseToClaudeAndWait('Test operator response 2a');
    
    // Give first executor time to acquire lock
    await executor1.sleep(10);
    
    // Try second executor immediately (should be blocked by lock, not cooldown)
    console.log('Starting second executor immediately...');
    const result2 = await executor2.sendOperatorResponseToClaudeAndWait('Test operator response 2b');
    
    console.log(`Second executor result: ${result2.success ? '✅ Success (unexpected)' : '❌ Blocked (expected)'}`);
    console.log(`Reason: ${result2.reason || result2.error}`);
    
    // Wait for first executor to complete
    const result1Final = await promise1;
    console.log(`First executor result: ${result1Final.success ? '✅ Success (expected)' : '❌ Failed (unexpected)'}`);
    
    console.log('\n📋 Test 3: Sequential executors should both succeed');
    console.log('---------------------------------------------------');
    const result3a = await executor1.sendOperatorResponseToClaudeAndWait('Test operator response 3a');
    console.log(`First sequential: ${result3a.success ? '✅ Success' : '❌ Failed'}`);
    
    const result3b = await executor2.sendOperatorResponseToClaudeAndWait('Test operator response 3b'); 
    console.log(`Second sequential: ${result3b.success ? '✅ Success' : '❌ Failed'}`);
    
    console.log('\n📊 Final Metrics:');
    console.log('==================');
    const metrics = sharedLock.getMetrics();
    console.log(`Total Acquisitions: ${metrics.totalAcquisitions}`);
    console.log(`Duplicates Blocked: ${metrics.duplicatesBlocked}`);
    console.log(`Lock Efficiency: ${metrics.lockEfficiency}`);
    console.log(`Duplicate Rate: ${metrics.duplicateRate}`);
    
    // Restore original cooldown
    sharedLock.COOLDOWN_MS = originalCooldown;
    console.log('⚙️ Cooldown restored to original value');
    
    const expectedResults = {
        totalAcquisitions: 4, // Test 1(1) + Test 2 first(1) + Test 3a(1) + Test 3b(1) = 4
        duplicatesBlocked: 1  // Test 2 second should be blocked
    };
    
    console.log('\n🎯 Test Results Summary:');
    console.log('========================');
    let allTestsPassed = true;
    
    if (metrics.totalAcquisitions === expectedResults.totalAcquisitions) {
        console.log('✅ Acquisition count correct');
    } else {
        console.log(`❌ Acquisition count wrong: expected ${expectedResults.totalAcquisitions}, got ${metrics.totalAcquisitions}`);
        allTestsPassed = false;
    }
    
    if (metrics.duplicatesBlocked === expectedResults.duplicatesBlocked) {
        console.log('✅ Duplicate blocking working correctly');
    } else {
        console.log(`❌ Duplicate blocking failed: expected ${expectedResults.duplicatesBlocked}, got ${metrics.duplicatesBlocked}`);
        allTestsPassed = false;
    }
    
    if (allTestsPassed) {
        console.log('\n🎉 ALL LAYER 1 TESTS PASSED! Wrapper implementation is working correctly.');
        return true;
    } else {
        console.log('\n⚠️ Some tests failed. Review implementation before proceeding.');
        return false;
    }
}

// Run the tests
runLayer1Tests().then(success => {
    process.exit(success ? 0 : 1);
});
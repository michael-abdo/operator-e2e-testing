/**
 * Test Layer 3 Wrapper Implementation
 * Tests the shared lock integration in ChainLoopMonitor
 */

import { sharedLock } from './shared-state.js';

class MockE2EExecutor {
    constructor() {
        this.failedTasks = [
            { id: 'task1', status: 'fail', description: 'Test task 1' },
            { id: 'task2', status: 'fail', description: 'Test task 2' }
        ];
    }

    async getFailedTasks() {
        return this.failedTasks;
    }

    async sendTasksToOperator(tasks, parameters) {
        console.log(`📤 Mock sending ${tasks.length} tasks to Operator`);
        await new Promise(resolve => setTimeout(resolve, 50));
        return { success: true, operatorResponse: 'Mock operator analysis' };
    }

    async forwardOperatorResponseToClaude(parameters) {
        console.log('📤 Mock forwarding Operator response to Claude');
        await new Promise(resolve => setTimeout(resolve, 50));
        return { success: true, claudeResponse: 'Mock Claude response' };
    }
}

class MockChainLoopMonitor {
    constructor() {
        this.e2eExecutor = new MockE2EExecutor();
        this.operatorResponseReceived = false;
        this.eventHandlers = {};
    }

    emit(event, data) {
        console.log(`[EVENT] ${event}:`, data);
        if (this.eventHandlers[event]) {
            this.eventHandlers[event](data);
        }
    }

    on(event, handler) {
        this.eventHandlers[event] = handler;
    }

    async sendTasksToOperator(parameters) {
        console.log('📤 Sending failed tasks to Operator...');
        
        // Get failed tasks
        const failedTasks = await this.e2eExecutor.getFailedTasks();
        
        if (failedTasks.length === 0) {
            console.log('✅ No failed tasks found - all tasks passed!');
            return true;
        }
        
        console.log(`📋 Found ${failedTasks.length} failed tasks`);
        
        // Send to Operator
        this.operatorResponseReceived = false;
        const response = await this.e2eExecutor.sendTasksToOperator(failedTasks, parameters);
        
        if (response) {
            console.log('✅ Tasks sent to Operator successfully');
            this.operatorResponseReceived = true;
            
            // Automatically proceed to send response to Claude (no need to wait for OPERATOR_READY)
            console.log('🔄 Proceeding to send Operator response to Claude...');
            const claudeResult = await this.sendOperatorResponseToClaude({
                includeTaskStatus: true,
                addInstructions: true,
                ...parameters
            });
            
            if (!claudeResult) {
                console.log('❌ Failed to send Operator response to Claude');
            }
            
            return true;
        }
        
        return false;
    }

    async sendOperatorResponseToClaude(parameters) {
        // Acquire shared lock to prevent duplicate orchestration to Claude
        if (!sharedLock.tryAcquireSendLock('chain-loop-monitor')) {
            console.log('⚠️ DUPLICATE BLOCKED: chain-loop-monitor - Another layer is already sending to Claude');
            this.emit('action_error', { 
                action: 'sendOperatorResponseToClaude', 
                error: 'Duplicate orchestration blocked - another layer is currently sending to Claude',
                reason: 'duplicate_blocked'
            });
            return false;
        }

        try {
            console.log('🔒 SEND LOCK ACQUIRED: chain-loop-monitor - Starting orchestration');
            console.log('📤 Sending Operator response to Claude...');
            
            if (!this.operatorResponseReceived) {
                console.log('⚠️  No Operator response to send');
                return false;
            }
            
            const response = await this.e2eExecutor.forwardOperatorResponseToClaude(parameters);
            
            if (response) {
                console.log('✅ Response sent to Claude successfully');
                console.log('⏳ Waiting for Claude to process and say TASK_FINISHED...');
                return true;
            }
            
            return false;
            
        } catch (error) {
            console.error(`❌ Error in sendOperatorResponseToClaude: ${error.message}`);
            this.emit('action_error', { 
                action: 'sendOperatorResponseToClaude', 
                error: error.message 
            });
            return false;
        } finally {
            // Always release the lock, even on error
            sharedLock.releaseSendLock('chain-loop-monitor');
            console.log('🔓 SEND LOCK RELEASED: chain-loop-monitor - orchestration complete');
        }
    }
}

// Test Suite
async function runLayer3Tests() {
    console.log('🧪 Testing Layer 3 Wrapper Implementation (ChainLoopMonitor)');
    console.log('===========================================================');
    
    // Reset metrics for clean testing
    sharedLock.resetMetrics();
    
    // Disable cooldown for testing
    const originalCooldown = sharedLock.COOLDOWN_MS;
    sharedLock.COOLDOWN_MS = 0;
    console.log('⚙️ Cooldown disabled for testing');
    
    const monitor1 = new MockChainLoopMonitor();
    const monitor2 = new MockChainLoopMonitor();
    
    console.log('\n📋 Test 1: Single orchestration should succeed');
    console.log('----------------------------------------------');
    monitor1.operatorResponseReceived = true; // Set up for Claude send
    const result1 = await monitor1.sendOperatorResponseToClaude({ test: 'parameter1' });
    console.log(`Result: ${result1 ? '✅ Success' : '❌ Failed'}`);
    
    console.log('\n📋 Test 2: Concurrent orchestrations - second should be blocked');
    console.log('--------------------------------------------------------------');
    
    // Setup both monitors for Claude send
    monitor1.operatorResponseReceived = true;
    monitor2.operatorResponseReceived = true;
    
    // Start first orchestration but don't await
    const promise2a = monitor1.sendOperatorResponseToClaude({ test: 'parameter2a' });
    
    // Give first monitor time to acquire lock
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // Try second orchestration immediately (should be blocked)
    const result2b = await monitor2.sendOperatorResponseToClaude({ test: 'parameter2b' });
    
    console.log(`Second orchestration result: ${result2b ? '✅ Success (unexpected)' : '❌ Blocked (expected)'}`);
    
    // Wait for first orchestration to complete
    const result2a = await promise2a;
    console.log(`First orchestration result: ${result2a ? '✅ Success (expected)' : '❌ Failed (unexpected)'}`);
    
    console.log('\n📋 Test 3: sendTasksToOperator workflow with orchestration');
    console.log('----------------------------------------------------------');
    const result3 = await monitor1.sendTasksToOperator({ includeTaskStatus: true });
    console.log(`sendTasksToOperator result: ${result3 ? '✅ Success' : '❌ Failed'}`);
    
    console.log('\n📋 Test 4: No operator response scenario');
    console.log('-----------------------------------------');
    monitor2.operatorResponseReceived = false; // No response to send
    const result4 = await monitor2.sendOperatorResponseToClaude({ test: 'parameter4' });
    console.log(`No response scenario: ${result4 ? '✅ Success (unexpected)' : '❌ Failed (expected)'}`);
    
    console.log('\n📋 Test 5: Sequential orchestrations should both succeed');
    console.log('--------------------------------------------------------');
    monitor1.operatorResponseReceived = true;
    monitor2.operatorResponseReceived = true;
    
    const result5a = await monitor1.sendOperatorResponseToClaude({ test: 'parameter5a' });
    console.log(`First sequential: ${result5a ? '✅ Success' : '❌ Failed'}`);
    
    const result5b = await monitor2.sendOperatorResponseToClaude({ test: 'parameter5b' });
    console.log(`Second sequential: ${result5b ? '✅ Success' : '❌ Failed'}`);
    
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
        totalAcquisitions: 6, // Test 1(1) + Test 2 first(1) + Test 3(1) + Test 4(1) + Test 5a(1) + Test 5b(1) = 6
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
        console.log('\n🎉 ALL LAYER 3 TESTS PASSED! ChainLoopMonitor wrapper is working correctly.');
        return true;
    } else {
        console.log('\n⚠️ Some tests failed. Review implementation before proceeding.');
        return false;
    }
}

// Run the tests
runLayer3Tests().then(success => {
    process.exit(success ? 0 : 1);
});
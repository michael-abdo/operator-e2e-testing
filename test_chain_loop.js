#!/usr/bin/env node

/**
 * Test script for Chain Loop Monitor architecture
 * This verifies that the ChainLoopMonitor can properly orchestrate the E2E workflow
 */

import ChainLoopMonitor from './lib/monitors/ChainLoopMonitor.js';
import { OperatorE2EExecutor } from './operator.execute_e2e_refactored.js';

async function testChainLoop() {
    console.log('🧪 Testing Chain Loop Monitor Architecture\n');
    
    // Mock configuration
    const mockConfig = {
        windowIndex: 3,
        loopControl: {
            maxIterations: 2,
            checkAllTasksResolved: true,
            exitOnAllPass: true
        },
        chains: [
            {
                keyword: "TASK_FINISHED",
                name: "claude_fixes_complete",
                action: {
                    type: "sendTasksToOperator",
                    parameters: {
                        filterFailedTasks: true,
                        includeContext: true
                    }
                },
                nextChain: "operator_analysis",
                loopCheck: {
                    incrementIteration: true,
                    checkMaxIterations: true,
                    checkAllTasksPassed: true
                }
            },
            {
                keyword: "OPERATOR_READY", 
                name: "operator_analysis",
                waitForOperatorResponse: true,
                action: {
                    type: "sendOperatorResponseToClaude",
                    parameters: {
                        includeTaskStatus: true,
                        addInstructions: true
                    }
                },
                nextChain: "claude_fixes_complete"
            }
        ],
        options: {
            pollInterval: 2,
            timeout: 30000
        }
    };
    
    // Mock E2E Executor
    const mockExecutor = {
        claudeInstanceId: 3,
        getFailedTasks: async () => {
            console.log('📋 Mock: Getting failed tasks...');
            return [
                { id: 'task1', description: 'Fix button color', status: 'fail' },
                { id: 'task2', description: 'Fix layout issue', status: 'fail' }
            ];
        },
        checkAllTasksPassed: async () => {
            console.log('✅ Mock: Checking if all tasks passed...');
            return false; // Simulate tasks still failing
        },
        sendTasksToOperator: async (tasks, params) => {
            console.log(`📤 Mock: Sending ${tasks.length} tasks to Operator`);
            return "Mock operator response with technical analysis";
        },
        getOperatorResponse: async () => {
            return "Mock operator response";
        },
        forwardOperatorResponseToClaude: async (params) => {
            console.log('📤 Mock: Forwarding to Claude');
            return true;
        },
        saveQaUxFile: async () => {
            console.log('💾 Mock: Saving QA file');
        },
        cleanup: async () => {
            console.log('🧹 Mock: Cleanup');
        }
    };
    
    // Create monitor
    const monitor = new ChainLoopMonitor(mockConfig, mockExecutor);
    
    // Test loop status
    console.log('📊 Initial Loop Status:', monitor.getLoopStatus());
    
    // Test chain configuration
    console.log('\n🔗 Chain Configuration:');
    mockConfig.chains.forEach((chain, i) => {
        console.log(`  ${i + 1}. ${chain.name}: waits for "${chain.keyword}"`);
    });
    
    // Test action execution
    console.log('\n🎬 Testing Action Execution:');
    await monitor.executeAction({
        type: 'sendTasksToOperator',
        parameters: { filterFailedTasks: true }
    });
    
    // Test loop termination
    console.log('\n🏁 Testing Loop Termination:');
    const shouldTerminate = await monitor.checkLoopTermination({
        incrementIteration: true,
        checkMaxIterations: true,
        checkAllTasksPassed: true
    });
    console.log(`Should terminate: ${shouldTerminate}`);
    
    console.log('\n✅ Chain Loop Monitor architecture test complete!');
    console.log('\nKey Features Demonstrated:');
    console.log('1. Chain configuration with actions');
    console.log('2. Loop control within monitor');
    console.log('3. Action execution delegation to E2E executor');
    console.log('4. Iteration tracking and termination logic');
}

// Run test
testChainLoop().catch(console.error);
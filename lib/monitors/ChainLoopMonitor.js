import WindowKeywordMonitor from './WindowKeywordMonitor.js';
import { EventEmitter } from 'events';
import { sharedLock } from '../../shared-state.js';

/**
 * ChainLoopMonitor extends WindowKeywordMonitor to implement full E2E loop control.
 * Instead of just detecting keywords, it orchestrates the entire workflow by:
 * 1. Detecting keywords
 * 2. Executing associated actions (sending to Operator/Claude)
 * 3. Managing iterations and loop termination
 * 4. Tracking task status across iterations
 */
class ChainLoopMonitor extends WindowKeywordMonitor {
    constructor(config, e2eExecutor) {
        // Ensure parent gets the chains config it expects
        const configWithChains = {
            ...config,
            chains: config.chains || []
        };
        super(configWithChains);
        
        // Store reference to E2E executor for action execution
        this.e2eExecutor = e2eExecutor;
        
        // Loop control state
        this.currentIteration = 0;
        this.maxIterations = config.loopControl?.maxIterations || 5;
        this.checkAllTasksResolved = config.loopControl?.checkAllTasksResolved || true;
        this.exitOnAllPass = config.loopControl?.exitOnAllPass || true;
        
        // Chain configuration with actions (same as this.chains from parent, but with clearer name)
        this.chainConfig = config.chains || [];
        this.currentChainName = null;
        
        // Task tracking
        this.taskStatuses = new Map();
        this.allTasksPassed = false;
        
        // Action execution state
        this.isExecutingAction = false;
        this.operatorResponseReceived = false;
        
        // Chain execution tracking (inherited from parent, but ensure it exists)
        this.executedChains = this.executedChains || [];
    }
    
    /**
     * Override executeChainAction to include E2E loop handling
     */
    async executeChainAction(chainConfig) {
        const { keyword, instruction, chainIndex, nextKeyword } = chainConfig;
        
        // Find our enhanced chain configuration
        const enhancedChainConfig = this.chains.find(c => c.keyword === keyword);
        
        console.log(`🔍 Executing chain action for keyword: "${keyword}"`);
        console.log(`📋 Chain name: ${enhancedChainConfig?.name || 'unnamed'}`);
        console.log(`📋 Available chains: ${this.chains.map(c => c.name).join(', ')}`);
        
        if (!enhancedChainConfig) {
            console.log(`⚠️  No enhanced chain configuration found for keyword: ${keyword}`);
            console.log('❌ Cannot execute E2E action without proper chain configuration');
            return;
        }
        
        // Check if already executed IN THIS ITERATION (prevent duplicates within same iteration)
        const executionKey = `${keyword}-${chainIndex}-iteration-${this.currentIteration}`;
        if (this.executedChains.some(chain => 
            chain.keyword === keyword && 
            chain.chainIndex === chainIndex && 
            chain.iteration === this.currentIteration
        )) {
            console.log(`⚠️  Chain action for "${keyword}" already executed in iteration ${this.currentIteration}, skipping`);
            return;
        }
        
        this.currentChainName = enhancedChainConfig.name;
        console.log(`\n🔗 Executing Chain: ${enhancedChainConfig.name}`);
        console.log(`📍 Current Iteration: ${this.currentIteration}/${this.maxIterations} (will increment after action)`);
        
        // Record this execution with iteration number
        this.executedChains.push({
            keyword,
            instruction,
            chainIndex,
            iteration: this.currentIteration,
            timestamp: new Date().toISOString()
        });
        
        // Check loop termination conditions BEFORE executing action
        if (enhancedChainConfig.loopCheck) {
            const shouldTerminate = await this.checkLoopTermination(enhancedChainConfig.loopCheck);
            if (shouldTerminate) {
                console.log('🏁 LOOP TERMINATION CONDITIONS MET');
                this.emit('e2e_complete', {
                    iterations: this.currentIteration,
                    allTasksPassed: this.allTasksPassed,
                    reason: shouldTerminate
                });
                this.stop();
                return;
            }
        }
        
        // Execute the associated action
        if (enhancedChainConfig.action) {
            await this.executeAction(enhancedChainConfig.action);
        }
        
        // Handle special cases
        if (enhancedChainConfig.waitForOperatorResponse) {
            await this.waitForOperatorResponse();
        }
        
        // Determine next chain
        if (enhancedChainConfig.nextChain) {
            const nextChainIndex = this.chains.findIndex(c => c.name === enhancedChainConfig.nextChain);
            if (nextChainIndex !== -1) {
                // Set up for next chain detection
                this.currentChainIndex = nextChainIndex;
                this.currentKeyword = this.chains[nextChainIndex].keyword;
                console.log(`➡️  Next chain: ${enhancedChainConfig.nextChain}, waiting for: "${this.currentKeyword}"`);
                console.log('⏳ Waiting for Claude to process and say TASK_FINISHED...');
            }
        } else {
            // No next chain specified, continue with current chain for next iteration
            console.log(`⏳ Waiting for next "${this.currentKeyword}" to continue loop...`);
        }
        
        // Continue monitoring for next keyword
        this.startTime = Date.now();
        this.pollCount = 0;
        
        // Emit chain executed event
        this.emit('chain_executed', {
            keyword,
            instruction,
            chainIndex,
            totalChains: this.chains.length
        });
    }
    
    /**
     * Execute action associated with chain
     */
    async executeAction(actionConfig) {
        console.log(`\n🎬 EXECUTING ACTION: ${actionConfig.type}`);
        this.isExecutingAction = true;
        
        try {
            switch (actionConfig.type) {
                case 'sendTasksToOperator':
                    await this.sendTasksToOperator(actionConfig.parameters);
                    break;
                    
                case 'sendOperatorResponseToClaude':
                    await this.sendOperatorResponseToClaude(actionConfig.parameters);
                    break;
                    
                default:
                    console.log(`⚠️  Unknown action type: ${actionConfig.type}`);
            }
        } catch (error) {
            console.error(`❌ Action execution failed: ${error.message}`);
            this.emit('action_error', { action: actionConfig.type, error });
        } finally {
            this.isExecutingAction = false;
        }
    }
    
    /**
     * Send failed tasks to Operator
     */
    async sendTasksToOperator(parameters) {
        console.log('📤 Sending failed tasks to Operator...');
        
        // Get failed tasks
        const failedTasks = await this.e2eExecutor.getFailedTasks();
        
        if (failedTasks.length === 0) {
            console.log('✅ No failed tasks found - all tasks passed!');
            this.allTasksPassed = true;
            
            // Trigger early completion since all tasks passed
            console.log('🏁 LOOP TERMINATION CONDITIONS MET');
            this.emit('e2e_complete', {
                iterations: this.currentIteration,
                allTasksPassed: true,
                reason: 'all_tasks_passed'
            });
            this.stop();
            return;
        }
        
        console.log(`📋 Found ${failedTasks.length} failed tasks`);
        
        // Update task tracking
        failedTasks.forEach(task => {
            this.taskStatuses.set(task.id, task.status);
        });
        
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
        }
    }
    
    /**
     * Wait for Operator response
     */
    async waitForOperatorResponse() {
        console.log('⏳ Waiting for Operator response...');
        
        // This is handled by the keyword detection system
        // When operator finishes, it will trigger the next chain
        const operatorResponse = await this.e2eExecutor.getOperatorResponse();
        
        if (operatorResponse) {
            this.operatorResponseReceived = true;
            console.log('✅ Operator response received');
        }
    }
    
    /**
     * Send Operator response to Claude
     */
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
    
    /**
     * Check loop termination conditions
     */
    async checkLoopTermination(loopCheck) {
        // Increment iteration if specified
        if (loopCheck.incrementIteration) {
            this.currentIteration++;
            console.log(`🔄 Iteration ${this.currentIteration}/${this.maxIterations}`);
        }
        
        // Check max iterations
        if (loopCheck.checkMaxIterations && this.currentIteration >= this.maxIterations) {
            console.log(`⚠️  Max iterations (${this.maxIterations}) reached`);
            return 'max_iterations';
        }
        
        // Check if all tasks passed
        if (loopCheck.checkAllTasksPassed && this.exitOnAllPass) {
            const allPassed = await this.e2eExecutor.checkAllTasksPassed();
            if (allPassed) {
                console.log('✅ All tasks have passed!');
                this.allTasksPassed = true;
                return 'all_tasks_passed';
            }
        }
        
        return false;
    }
    
    /**
     * Override start to initialize loop state
     */
    start() {
        console.log('\n🚀 STARTING CHAIN LOOP MONITOR');
        console.log(`🔄 Max Iterations: ${this.maxIterations}`);
        console.log(`✅ Exit on All Pass: ${this.exitOnAllPass}`);
        console.log(`📋 Chains: ${this.chains.map(c => c.name).join(' → ')}`);
        console.log('━'.repeat(80));
        
        super.start();
    }
    
    /**
     * Get current loop status
     */
    getLoopStatus() {
        return {
            currentIteration: this.currentIteration,
            maxIterations: this.maxIterations,
            currentChain: this.currentChainName,
            allTasksPassed: this.allTasksPassed,
            taskStatuses: Object.fromEntries(this.taskStatuses)
        };
    }
}

export default ChainLoopMonitor;
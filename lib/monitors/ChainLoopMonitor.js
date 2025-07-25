import WindowKeywordMonitor from './WindowKeywordMonitor.js';
import { EventEmitter } from 'events';

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
        super(config);
        
        // Store reference to E2E executor for action execution
        this.e2eExecutor = e2eExecutor;
        
        // Loop control state
        this.currentIteration = 0;
        this.maxIterations = config.loopControl?.maxIterations || 5;
        this.checkAllTasksResolved = config.loopControl?.checkAllTasksResolved || true;
        this.exitOnAllPass = config.loopControl?.exitOnAllPass || true;
        
        // Chain configuration with actions
        this.chainConfig = config.chains || [];
        this.currentChainName = null;
        
        // Task tracking
        this.taskStatuses = new Map();
        this.allTasksPassed = false;
        
        // Action execution state
        this.isExecutingAction = false;
        this.operatorResponseReceived = false;
    }
    
    /**
     * Override chain execution to include action handling
     */
    async executeChain(chainIndex) {
        const chain = this.chains[chainIndex];
        const chainConfig = this.chainConfig.find(c => c.keyword === chain.keyword);
        
        if (!chainConfig) {
            console.log(`⚠️  No chain configuration found for keyword: ${chain.keyword}`);
            return super.executeChain(chainIndex);
        }
        
        this.currentChainName = chainConfig.name;
        console.log(`\n🔗 Executing Chain: ${chainConfig.name}`);
        console.log(`📍 Current Iteration: ${this.currentIteration + 1}/${this.maxIterations}`);
        
        // Check loop termination conditions BEFORE executing action
        if (chainConfig.loopCheck) {
            const shouldTerminate = await this.checkLoopTermination(chainConfig.loopCheck);
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
        if (chainConfig.action) {
            await this.executeAction(chainConfig.action);
        }
        
        // Handle special cases
        if (chainConfig.waitForOperatorResponse) {
            await this.waitForOperatorResponse();
        }
        
        // Determine next chain
        if (chainConfig.nextChain) {
            const nextChainIndex = this.chainConfig.findIndex(c => c.name === chainConfig.nextChain);
            if (nextChainIndex !== -1) {
                // Set up for next chain detection
                this.currentChainIndex = nextChainIndex;
                this.currentKeyword = this.chains[nextChainIndex].keyword;
                console.log(`➡️  Next chain: ${chainConfig.nextChain}, waiting for: "${this.currentKeyword}"`);
            }
        }
        
        // Continue monitoring for next keyword
        this.startTime = Date.now();
        this.pollCount = 0;
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
            // The operator response will be captured when OPERATOR_READY is detected
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
        console.log('📤 Sending Operator response to Claude...');
        
        if (!this.operatorResponseReceived) {
            console.log('⚠️  No Operator response to send');
            return;
        }
        
        const response = await this.e2eExecutor.forwardOperatorResponseToClaude(parameters);
        
        if (response) {
            console.log('✅ Response sent to Claude successfully');
            console.log('⏳ Waiting for Claude to process and say TASK_FINISHED...');
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
        console.log(`📋 Chains: ${this.chainConfig.map(c => c.name).join(' → ')}`);
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
#!/usr/bin/env node

/**
 * Operator E2E Execution Script - Refactored for Chain-Driven Architecture
 * 
 * This script is now a utility provider that works with ChainLoopMonitor.
 * The loop control is handled by ChainLoopMonitor, while this class provides:
 * - Task management utilities
 * - Operator communication methods
 * - Claude session management
 * - QA file handling
 * 
 * Usage:
 *   node operator.execute_e2e_refactored.js <qa_ux_file.json>
 *   node operator.execute_e2e_refactored.js --help
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Import existing utilities
import tmuxUtils from '../workflows/tmux_utils.js';
import { OperatorMessageSenderWithResponse } from '../operator/send_and_wait_for_response.js';
import workflowUtils from '../workflows/shared/workflow_utils.js';
import ChainLoopMonitor from './lib/monitors/ChainLoopMonitor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class OperatorE2EExecutor {
    constructor(options = {}) {
        this.qaUxFilePath = options.qaUxFilePath;
        this.workingDir = options.workingDir || process.cwd();
        this.claudeInstanceId = null;
        this.operatorSender = null;
        
        // QA data management
        this.qaUxData = null;
        this.currentOperatorResponse = null;
        
        // Operator session persistence
        this.operatorSessionUrl = null;
        this.isFirstOperatorUse = true;
        
        // Enhanced logging setup
        this.runId = this.generateRunId();
        this.logFilePath = path.join(this.workingDir, 'logs', `e2e_run_${this.runId}.log`);
        this.logBuffer = [];
        
        // Workflow timing tracking
        this.workflowTimings = {
            operatorSendTime: null,
            operatorReceiveTime: null,
            claudeInputTime: null,
            claudeFinishedTime: null
        };
    }
    
    /**
     * Generate unique run ID for logging
     */
    generateRunId() {
        const now = new Date();
        const timestamp = now.toISOString().replace(/[:.]/g, '-').split('T');
        const date = timestamp[0];
        const time = timestamp[1].substring(0, 8);
        return `${date}_${time}`;
    }
    
    /**
     * Get timestamp for logging
     */
    getTimestamp() {
        return new Date().toISOString().replace('T', ' ').substr(0, 19);
    }
    
    /**
     * Enhanced logging with buffer
     */
    async log(message, level = 'INFO', iteration = null) {
        const timestamp = this.getTimestamp();
        const iterStr = iteration !== null ? `[ITER:${iteration}] ` : '';
        const logLine = `[${timestamp}] [RUN:${this.runId}] ${iterStr}[${level}] ${message}`;
        
        console.log(message);
        
        this.logBuffer.push(logLine);
        if (this.logBuffer.length >= 50) {
            await this.flushLogBuffer();
        }
    }
    
    /**
     * Flush log buffer to file
     */
    async flushLogBuffer() {
        if (this.logBuffer.length === 0) return;
        
        try {
            const logDir = path.dirname(this.logFilePath);
            await fs.mkdir(logDir, { recursive: true });
            
            const logContent = this.logBuffer.join('\n') + '\n';
            await fs.appendFile(this.logFilePath, logContent);
            this.logBuffer = [];
        } catch (error) {
            console.error(`Failed to write logs: ${error.message}`);
        }
    }
    
    /**
     * Initialize the E2E system (called once at startup)
     */
    async initialize() {
        await this.log('🎯 Initializing Operator E2E System', 'INFO');
        await this.log(`Run ID: ${this.runId}`, 'INFO');
        await this.log(`Log file: ${this.logFilePath}`, 'INFO');
        await this.log(`QA file: ${this.qaUxFilePath}`, 'INFO');
        await this.log('─'.repeat(50), 'INFO');
        
        // Load QA_UX file
        this.qaUxData = await this.loadQaUxFile();
        
        // Setup Claude session once
        await this.setupClaudeSession();
        
        await this.log('✅ E2E system initialized', 'INFO');
    }
    
    /**
     * Load QA_UX JSON file
     */
    async loadQaUxFile() {
        console.log(`📄 Loading QA_UX file: ${this.qaUxFilePath}`);
        const content = await fs.readFile(this.qaUxFilePath, 'utf8');
        const data = JSON.parse(content);
        console.log(`✅ Loaded QA_UX file with ${Object.keys(data.tasks || {}).length} tasks`);
        return data;
    }
    
    /**
     * Save updated QA_UX file
     */
    async saveQaUxFile() {
        const content = JSON.stringify(this.qaUxData, null, 2);
        await fs.writeFile(this.qaUxFilePath, content);
        console.log(`💾 Saved updated QA_UX file`);
    }
    
    /**
     * Get failed tasks from QA data
     */
    async getFailedTasks() {
        if (!this.qaUxData || !this.qaUxData.tasks) return [];
        
        const failedTasks = Object.entries(this.qaUxData.tasks)
            .filter(([id, task]) => task.status === 'fail')
            .map(([id, task]) => ({
                id,
                ...task
            }));
            
        return failedTasks;
    }
    
    /**
     * Check if all tasks have passed
     */
    async checkAllTasksPassed() {
        if (!this.qaUxData || !this.qaUxData.tasks) return true;
        
        const failedTasks = Object.values(this.qaUxData.tasks)
            .filter(task => task.status === 'fail');
            
        return failedTasks.length === 0;
    }
    
    /**
     * Setup Claude Code session in tmux
     */
    async setupClaudeSession() {
        console.log('🚀 Setting up Claude Code window...');
        
        const isInTmux = await tmuxUtils.isInsideTmux();
        if (isInTmux) {
            console.log('✅ Detected running inside tmux session');
        } else {
            throw new Error('This script must be run inside a tmux session');
        }
        
        const sessionName = await tmuxUtils.getCurrentSession();
        const windowName = 'feature-op-debug';
        console.log(`📍 Creating new tmux window: ${windowName}`);
        
        await tmuxUtils.createWindow(sessionName, windowName);
        console.log(`✅ Created tmux window: ${windowName}`);
        
        const windowTarget = await tmuxUtils.getWindowIndex(sessionName, windowName);
        this.claudeInstanceId = windowTarget;
        console.log(`🎯 Using window target: ${windowTarget}`);
        
        console.log(`📁 Navigating to project root: ${this.workingDir}`);
        await tmuxUtils.sendToWindow(windowTarget, `cd "${this.workingDir}"`);
        
        const claudeCommand = await workflowUtils.checkForClaudeInPath();
        if (!claudeCommand) {
            throw new Error('Claude Code CLI not found in PATH');
        }
        console.log('✅ Claude Code CLI found');
        
        console.log('🔄 Clearing window with Ctrl+C...');
        await tmuxUtils.sendKeys(windowTarget, 'C-c');
        await this.sleep(1000);
        
        await tmuxUtils.sendToWindow(windowTarget, claudeCommand);
        console.log(`📤 Sent Claude Code command to window: ${windowTarget}`);
        
        console.log('⏳ Waiting for Claude to initialize...');
        await this.sleep(5000);
        
        console.log('✅ Claude Code appears to be running');
    }
    
    /**
     * Setup Operator connection
     */
    async setupOperatorConnection() {
        console.log('🔌 Setting up Operator connection...');
        
        if (this.isFirstOperatorUse) {
            console.log('🆕 FIRST ITERATION: Requiring fresh operator.chatgpt.com/ home page tab');
            this.operatorSender = new OperatorMessageSenderWithResponse({
                debugPort: 9222,
                requireOperatorHome: true,
                maxRetries: 3
            });
            
            this.isFirstOperatorUse = false;
        } else {
            console.log('♻️  SUBSEQUENT ITERATION: Reusing existing conversation tab');
            if (!this.operatorSessionUrl) {
                throw new Error('No operator session URL stored from first iteration');
            }
            
            this.operatorSender = new OperatorMessageSenderWithResponse({
                debugPort: 9222,
                existingTabUrl: this.operatorSessionUrl,
                requireOperatorHome: false,
                maxRetries: 3
            });
        }
        
        await this.operatorSender.connect();
        console.log('✅ Connected to Operator');
        
        const currentUrl = await this.operatorSender.getCurrentUrl();
        console.log(`📍 Current URL: ${currentUrl}`);
        
        if (!this.operatorSessionUrl && currentUrl.includes('/c/')) {
            this.operatorSessionUrl = currentUrl;
            console.log(`📌 Captured Operator conversation URL: ${this.operatorSessionUrl}`);
            console.log('✅ This tab will be reused and redirected for subsequent iterations');
        } else if (this.isFirstOperatorUse) {
            console.log('✅ Confirmed on Operator home page - ready for fresh conversation');
        }
    }
    
    /**
     * Send failed tasks to Operator and get response
     */
    async sendTasksToOperator(failedTasks, parameters = {}) {
        console.log(`🔍 Found ${failedTasks.length} failed tasks`);
        
        if (!this.operatorSender) {
            await this.setupOperatorConnection();
        }
        
        const message = this.formatTasksForOperator(failedTasks);
        console.log(`📤 Sending ${failedTasks.length} failed tasks to Operator using fast method...`);
        
        this.workflowTimings.operatorSendTime = Date.now();
        await this.log(`🕐 OPERATOR SEND: ${new Date().toISOString().split('T')[0]} ${new Date().toTimeString().split(' ')[0]}`, 'TIMING');
        
        const operatorResponse = await this.operatorSender.sendMessageAndWaitForResponse(message);
        
        this.workflowTimings.operatorReceiveTime = Date.now();
        await this.log(`🕐 OPERATOR RECEIVE: ${new Date().toISOString().split('T')[0]} ${new Date().toTimeString().split(' ')[0]}`, 'TIMING');
        
        if (!this.operatorSessionUrl) {
            const currentUrl = await this.operatorSender.getCurrentUrl();
            if (currentUrl.includes('/c/')) {
                this.operatorSessionUrl = currentUrl;
                console.log(`📌 Captured Operator conversation URL: ${this.operatorSessionUrl}`);
                console.log('✅ This tab will be reused and redirected for subsequent iterations');
            }
        }
        
        console.log('✅ Received response from Operator');
        this.currentOperatorResponse = operatorResponse;
        
        return operatorResponse;
    }
    
    /**
     * Get the current Operator response
     */
    async getOperatorResponse() {
        return this.currentOperatorResponse;
    }
    
    /**
     * Format tasks for Operator
     */
    formatTasksForOperator(failedTasks) {
        const prompt = `# QA/UX Analysis Request

I have a web application with several UI/UX issues that need to be fixed. Please analyze each issue and provide specific technical recommendations for fixing them.

## Application Details
${this.qaUxData.metadata ? `
- URL: ${this.qaUxData.metadata.demo_app_url || 'Not specified'}
- Description: ${this.qaUxData.metadata.description || 'Not specified'}
` : ''}

## Failed QA/UX Tasks

${failedTasks.map((task, index) => `
### ${index + 1}. ${task.feature_name || task.id}
**Issue:** ${task.description}
**Priority:** ${task.priority || 'medium'}
**Category:** ${task.category || 'general'}
${task.production_url ? `**URL:** ${task.production_url}` : ''}

**Test Steps:**
${task.test_steps ? task.test_steps.map(step => 
    `${step.step}. ${step.action}
   Expected: ${step.expectation}
   Result: ${step.result}`
).join('\n') : 'No test steps provided'}

**QA Report Summary:**
${task.qa_report ? 
`- Failed tests: ${task.qa_report.failed_tests ? task.qa_report.failed_tests.join(', ') : 'Not specified'}
- Required fixes: ${task.qa_report.retest_required ? task.qa_report.retest_required.join(', ') : 'Not specified'}` 
: 'No QA report available'}
`).join('\n---\n')}

## Request

For each issue above, please provide:
1. **Root cause analysis** - What's likely causing this issue?
2. **Technical fix recommendations** - Specific code changes needed
3. **Implementation approach** - Step-by-step fixing instructions

Please format your response as a JSON array with one object per task, including:
- taskId
- root_cause
- technical_recommendations (array)
- implementation_steps (array)
- estimated_complexity (low/medium/high)

Focus on providing actionable, specific technical guidance that a developer can immediately implement.`;

        return prompt;
    }
    
    /**
     * Forward Operator response to Claude
     */
    async forwardOperatorResponseToClaude(parameters = {}) {
        if (!this.currentOperatorResponse) {
            throw new Error('No Operator response to forward');
        }
        
        console.log('📤 Sending Operator response to Claude Code...');
        
        this.workflowTimings.claudeInputTime = Date.now();
        await this.log(`🕐 CLAUDE INPUT: ${new Date().toISOString().split('T')[0]} ${new Date().toTimeString().split(' ')[0]}`, 'TIMING');
        
        const claudePrompt = this.formatResponseForClaude(this.currentOperatorResponse, parameters);
        
        await tmuxUtils.sendToWindow(this.claudeInstanceId, claudePrompt);
        await this.sleep(500);
        await tmuxUtils.sendKeys(this.claudeInstanceId, 'Enter');
        await tmuxUtils.sendKeys(this.claudeInstanceId, 'Enter');
        console.log('✅ Sent Operator response to Claude Code with double Enter');
        
        await fs.writeFile('operator_response_debug.txt', this.currentOperatorResponse);
        console.log('💾 Full Operator response saved to operator_response_debug.txt');
        
        console.log('🧹 Running /compact to clear stale outputs while preserving context...');
        await this.sleep(2000);
        await tmuxUtils.sendToWindow(this.claudeInstanceId, '/compact');
        await this.sleep(500);
        await tmuxUtils.sendKeys(this.claudeInstanceId, 'Enter');
        await tmuxUtils.sendKeys(this.claudeInstanceId, 'Enter');
        console.log('✅ /compact completed with double Enter - ready for fresh TASK_FINISHED detection');
        
        return true;
    }
    
    /**
     * Format Operator response for Claude
     */
    formatResponseForClaude(operatorResponse, parameters = {}) {
        const responseLength = operatorResponse.length;
        console.log(`📝 Operator response length: ${responseLength} characters`);
        
        const preview = operatorResponse.substring(0, 150).replace(/\n/g, ' ');
        console.log(`📝 Operator response preview: ${preview}...`);
        
        const prompt = `The Operator has analyzed the QA/UX issues and provided technical recommendations. Here's their analysis:

${operatorResponse}

Based on this analysis, please:
1. Implement the recommended fixes for ALL issues
2. Ensure all changes follow the existing code patterns
3. Test your changes locally if possible
4. Commit your changes with a clear message
5. Deploy to production (the deployment method should be auto-detected)
6. Verify the deployment was successful

${parameters.addInstructions ? `
IMPORTANT: 
- Fix ALL issues identified, not just some
- Make minimal changes that solve the problems
- Preserve existing functionality while fixing the issues
- After deployment is complete and verified, say "TASK_FINISHED"
` : ''}

When you have completed ALL fixes, deployed them, and verified the deployment, say exactly: TASK_FINISHED`;

        return prompt;
    }
    
    /**
     * Update task statuses based on Operator response
     */
    updateTaskStatuses(operatorAnalysis) {
        // Parse Operator response if it's JSON
        try {
            const analysis = typeof operatorAnalysis === 'string' 
                ? JSON.parse(operatorAnalysis) 
                : operatorAnalysis;
                
            if (Array.isArray(analysis)) {
                analysis.forEach(item => {
                    if (item.taskId && this.qaUxData.tasks[item.taskId]) {
                        if (item.status === 'resolved' || item.fixed === true) {
                            this.qaUxData.tasks[item.taskId].status = 'pass';
                            this.qaUxData.tasks[item.taskId].lastUpdated = new Date().toISOString();
                            console.log(`✅ Task ${item.taskId} marked as: pass`);
                        }
                    }
                });
            }
        } catch (error) {
            console.log('📝 Operator response is not JSON, keeping tasks as failed pending actual fixes');
        }
    }
    
    /**
     * Cleanup resources
     */
    async cleanup() {
        if (this.operatorSender) {
            console.log('🧹 Disconnecting Operator connection...');
            await this.operatorSender.disconnect();
            this.operatorSender = null;
        }
        
        await this.flushLogBuffer();
        console.log(`💾 All logs saved to: ${this.logFilePath}`);
    }
    
    /**
     * Utility function for delays
     */
    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Main execution function using ChainLoopMonitor
async function main() {
    const args = process.argv.slice(2);
    
    if (args.length === 0 || args[0] === '--help') {
        console.log(`
Operator E2E Execution Script - Chain-Driven Architecture

Usage:
  node operator.execute_e2e_refactored.js <qa_ux_file.json>
  node operator.execute_e2e_refactored.js --help

Description:
  Executes end-to-end testing using ChainLoopMonitor to control the workflow:
  1. ChainLoopMonitor detects TASK_FINISHED and triggers Operator analysis
  2. When Operator completes, sends response to Claude
  3. Loops automatically until all tasks pass or max iterations reached
  
Requirements:
  - Chrome running with --remote-debugging-port=9222
  - tmux installed and available
  - Claude Code CLI installed
  - Fresh Operator home page tab open at https://operator.chatgpt.com/
  - QA_UX JSON file with task definitions

Example:
  node operator.execute_e2e_refactored.js ./test/sample_qa_ux.json
        `);
        process.exit(0);
    }
    
    const qaUxFilePath = path.resolve(args[0]);
    
    // Validate file exists
    try {
        await fs.access(qaUxFilePath);
    } catch (error) {
        console.error(`❌ QA_UX file not found: ${qaUxFilePath}`);
        process.exit(1);
    }
    
    // Create E2E executor
    const executor = new OperatorE2EExecutor({
        qaUxFilePath,
        workingDir: process.cwd()
    });
    
    try {
        // Initialize the system
        await executor.initialize();
        
        // Load chain configuration
        const chainConfigPath = path.join(process.cwd(), 'config', 'chain_loop_monitor.json');
        const chainConfig = JSON.parse(await fs.readFile(chainConfigPath, 'utf8'));
        
        // Create and start ChainLoopMonitor
        const monitor = new ChainLoopMonitor({
            ...chainConfig,
            windowIndex: executor.claudeInstanceId
        }, executor);
        
        // Set up event handlers
        monitor.on('e2e_complete', async (result) => {
            console.log('\n🎉 E2E Testing Complete!');
            console.log(`📊 Total Iterations: ${result.iterations}`);
            console.log(`✅ All Tasks Passed: ${result.allTasksPassed}`);
            console.log(`📝 Completion Reason: ${result.reason}`);
            
            // Save final QA file
            await executor.saveQaUxFile();
            
            // Cleanup
            await executor.cleanup();
            
            process.exit(0);
        });
        
        monitor.on('action_error', async (error) => {
            console.error('\n❌ Action execution failed:', error);
            await executor.cleanup();
            process.exit(1);
        });
        
        monitor.on('timeout', async () => {
            console.error('\n⏰ Monitor timeout reached');
            await executor.cleanup();
            process.exit(1);
        });
        
        // Start the chain loop monitor
        monitor.start();
        
        // Keep process alive
        process.stdin.resume();
        
    } catch (error) {
        console.error('\n💥 E2E execution failed:', error.message);
        await executor.cleanup();
        process.exit(1);
    }
}

// Handle process termination gracefully
process.on('SIGINT', async () => {
    console.log('\n👋 Received SIGINT, shutting down gracefully...');
    process.exit(0);
});

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(console.error);
}

export { OperatorE2EExecutor };
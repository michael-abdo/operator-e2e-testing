#!/usr/bin/env node

/**
 * Operator E2E Execution Script
 * 
 * This script executes end-to-end testing by:
 * 0) Accepting QA_UX file (json)
 * 1) Attaching to tmux
 * 2) Starting claude code inside of tmux
 * 3) Sending json contents with tasks.status = fail to new operator window (do this each time)
 * 4) Waiting for response
 * 5) Sending response to claude code
 * 6) Updating json
 * Repeating until either 1) all tasks are passes 2) 5 iterations
 * 
 * Usage:
 *   node operator.execute_e2e.js <qa_ux_file.json>
 *   node operator.execute_e2e.js --help
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Import existing utilities
import tmuxUtils from '../workflows/tmux_utils.js';
import { OperatorMessageSenderWithResponse } from '../operator/send_and_wait_for_response.js';
import workflowUtils from '../workflows/shared/workflow_utils.js';
import { ChainKeywordMonitor } from '../workflows/chain_keyword_monitor.js';
import WindowKeywordMonitor from './lib/monitors/WindowKeywordMonitor.js';
import { sharedLock } from './shared-state.js';
import MultiFormatParser from './lib/file-parsers/MultiFormatParser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class OperatorE2EExecutor {
    constructor(options = {}) {
        this.qaUxFilePath = options.qaUxFilePath;
        this.maxIterations = options.maxIterations || 5;
        this.workingDir = options.workingDir || process.cwd();
        this.claudeInstanceId = null;
        this.operatorSender = null;
        this.iteration = 0;
        this.startTime = Date.now();
        // Operator session persistence
        this.operatorSessionUrl = null; // Store the conversation URL after first use
        this.isFirstIteration = true; // Flag for first iteration
        
        // Enhanced logging setup
        this.runId = this.generateRunId();
        this.logFilePath = path.join(this.workingDir, 'logs', `e2e_run_${this.runId}.log`);
        this.taskFinishedDetections = new Map(); // Track TASK_FINISHED detections by iteration
        this.logBuffer = []; // Buffer for immediate logging
        
        // TASK_FINISHED detection cooldown
        this.lastTaskFinishedTime = Date.now(); // Initialize to current time to block stale detections
        this.taskFinishedCooldown = 60000; // 60 seconds cooldown period
        
        // Workflow timing tracking
        this.workflowTimings = {
            operatorSendTime: null,      // When we send to Operator
            operatorReceiveTime: null,   // When we receive from Operator
            claudeInputTime: null,       // When we send to Claude
            claudeFinishedTime: null     // When Claude says TASK_FINISHED
        };
    }
    
    /**
     * Generate unique run ID for logging
     */
    generateRunId() {
        const now = new Date();
        const timestamp = now.toISOString().replace(/[:.]/g, '-').split('T');
        const date = timestamp[0];
        const time = timestamp[1].substring(0, 8); // Remove milliseconds
        return `${date}_${time}`;
    }
    
    /**
     * Get timestamp for logging
     */
    getTimestamp() {
        return new Date().toISOString().replace('T', ' ').substr(0, 19);
    }
    
    /**
     * Format duration in a human-readable way
     */
    formatDuration(startTime, endTime) {
        const durationMs = endTime - startTime;
        const minutes = Math.floor(durationMs / 60000);
        const seconds = Math.floor((durationMs % 60000) / 1000);
        return `${minutes}m ${seconds}s (${durationMs}ms)`;
    }
    
    /**
     * Reset workflow timings for new iteration
     */
    resetWorkflowTimings() {
        this.workflowTimings = {
            operatorSendTime: null,
            operatorReceiveTime: null,
            claudeInputTime: null,
            claudeFinishedTime: null
        };
    }
    
    /**
     * Validate workflow timing and log warnings
     */
    validateWorkflowTiming() {
        const timings = this.workflowTimings;
        
        // Check Operator phase (Send → Receive should be ≥ 1 min)
        if (timings.operatorSendTime && timings.operatorReceiveTime) {
            const operatorDuration = timings.operatorReceiveTime - timings.operatorSendTime;
            const operatorMinutes = operatorDuration / 60000;
            
            this.log(`📊 OPERATOR PHASE: ${this.formatDuration(timings.operatorSendTime, timings.operatorReceiveTime)}`, 'INFO');
            
            if (operatorMinutes < 1) {
                this.log(`⚠️  WARNING: Operator phase too fast (${operatorMinutes.toFixed(1)} min < 1 min minimum)`, 'WARNING');
                this.log(`   This may indicate Operator didn't properly analyze the tasks`, 'WARNING');
            } else {
                this.log(`✅ Operator phase timing acceptable (≥ 1 min)`, 'INFO');
            }
        }
        
        // Check Claude phase (Input → TASK_FINISHED should be ≥ 2 min) 
        if (timings.claudeInputTime && timings.claudeFinishedTime) {
            const claudeDuration = timings.claudeFinishedTime - timings.claudeInputTime;
            const claudeMinutes = claudeDuration / 60000;
            
            this.log(`📊 CLAUDE PHASE: ${this.formatDuration(timings.claudeInputTime, timings.claudeFinishedTime)}`, 'INFO');
            
            if (claudeMinutes < 2) {
                this.log(`⚠️  WARNING: Claude phase too fast (${claudeMinutes.toFixed(1)} min < 2 min minimum)`, 'WARNING');
                this.log(`   This may indicate Claude didn't properly implement fixes`, 'WARNING');
            } else {
                this.log(`✅ Claude phase timing acceptable (≥ 2 min)`, 'INFO');
            }
        }
        
        // Log total iteration time
        if (timings.operatorSendTime && timings.claudeFinishedTime) {
            const totalDuration = timings.claudeFinishedTime - timings.operatorSendTime;
            this.log(`📊 TOTAL ITERATION: ${this.formatDuration(timings.operatorSendTime, timings.claudeFinishedTime)}`, 'INFO');
        }
    }
    
    /**
     * Log with timestamp to both console and file
     */
    log(message, level = 'INFO') {
        const timestamp = this.getTimestamp();
        const logEntry = `[${timestamp}] [RUN:${this.runId}] [ITER:${this.iteration}] [${level}] ${message}`;
        
        // Always log to console
        console.log(logEntry);
        
        // Add to buffer for file logging
        this.logBuffer.push(logEntry);
        
        // Immediate write for critical events
        if (level === 'ERROR' || level === 'CRITICAL' || message.includes('TASK_FINISHED')) {
            this.flushLogBuffer();
        }
    }
    
    /**
     * Write log buffer to file
     */
    async flushLogBuffer() {
        if (this.logBuffer.length === 0) return;
        
        try {
            const logContent = this.logBuffer.join('\n') + '\n';
            await fs.appendFile(this.logFilePath, logContent, 'utf8');
            this.logBuffer = []; // Clear buffer after writing
        } catch (error) {
            console.error(`Failed to write to log file: ${error.message}`);
        }
    }
    
    /**
     * Log TASK_FINISHED detection with detailed context
     */
    logTaskFinishedDetection(windowContent, detectionContext = {}) {
        const timestamp = this.getTimestamp();
        const detectionId = `${this.iteration}_${Date.now()}`;
        
        // Store detection details
        this.taskFinishedDetections.set(detectionId, {
            iteration: this.iteration,
            timestamp,
            windowContentLength: windowContent.length,
            windowContentPreview: windowContent.substring(0, 200),
            context: detectionContext
        });
        
        this.log(`🎯 TASK_FINISHED DETECTED - ID: ${detectionId}`, 'CRITICAL');
        
        // Record Claude finished timestamp
        this.workflowTimings.claudeFinishedTime = Date.now();
        this.log(`🕐 CLAUDE FINISHED: ${this.getTimestamp()}`, 'TIMING');
        this.log(`   Window content length: ${windowContent.length} chars`, 'DEBUG');
        this.log(`   Window preview: ${windowContent.substring(0, 100).replace(/\n/g, '\\n')}...`, 'DEBUG');
        this.log(`   Detection context: ${JSON.stringify(detectionContext)}`, 'DEBUG');
        
        // Immediate flush for this critical event
        this.flushLogBuffer();
        
        return detectionId;
    }

    /**
     * Load and parse QA_UX file (supports JSON, MD, TXT)
     */
    async loadQaUxFile() {
        try {
            console.log(`📄 Loading QA_UX file: ${this.qaUxFilePath}`);
            
            // Use MultiFormatParser for any file type
            const parser = new MultiFormatParser();
            const qaUxData = await parser.parseFile(this.qaUxFilePath);
            
            console.log(`✅ Loaded QA_UX file with ${Object.keys(qaUxData.tasks || {}).length} tasks`);
            return qaUxData;
        } catch (error) {
            throw new Error(`Failed to load QA_UX file: ${error.message}`);
        }
    }

    /**
     * Save updated QA_UX data back to file
     */
    async saveQaUxFile(qaUxData) {
        try {
            const jsonContent = JSON.stringify(qaUxData, null, 2);
            await fs.writeFile(this.qaUxFilePath, jsonContent, 'utf8');
            console.log(`💾 Saved updated QA_UX file`);
        } catch (error) {
            console.error(`❌ Failed to save QA_UX file: ${error.message}`);
            throw error;
        }
    }

    /**
     * Filter tasks with status = "fail"
     */
    getFailedTasks(qaUxData) {
        if (!qaUxData.tasks) return [];
        
        const failedTasks = Object.entries(qaUxData.tasks)
            .filter(([taskId, task]) => task.status === 'fail')
            .map(([taskId, task]) => ({ taskId, ...task }));
        
        console.log(`🔍 Found ${failedTasks.length} failed tasks`);
        return failedTasks;
    }

    /**
     * Setup or connect to Claude Code tmux window
     */
    async setupClaudeSession() {
        console.log('🚀 Setting up Claude Code window...');
        
        const windowName = 'feature-op-debug';
        
        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execAsync = promisify(exec);
        
        try {
            // Check if we're in a tmux session
            const { stdout: tmuxCheck } = await execAsync('echo $TMUX || echo "not_in_tmux"');
            
            if (tmuxCheck.trim() === 'not_in_tmux') {
                throw new Error('Not currently in a tmux session. Please run this script from within tmux.');
            }
            
            console.log('✅ Detected running inside tmux session');
            
            // Check if window already exists
            const { stdout: existingWindows } = await execAsync('tmux list-windows -F "#{window_name}"');
            const windowExists = existingWindows.split('\n').includes(windowName);
            
            if (windowExists) {
                console.log(`♻️  Tmux window '${windowName}' already exists, reusing it`);
                // Kill any existing processes in the window
                await execAsync(`tmux send-keys -t ${windowName} C-c C-c C-c C-c C-c`);
                await this.sleep(500);
            } else {
                // Create new window in current session
                console.log(`📍 Creating new tmux window: ${windowName}`);
                await execAsync(`tmux new-window -n ${windowName}`);
                console.log(`✅ Created tmux window: ${windowName}`);
            }
            
            // Get the window index for reliable targeting
            const { stdout: windowList } = await execAsync('tmux list-windows -F "#{window_index}:#{window_name}"');
            const windowMatch = windowList.split('\n').find(line => line.includes(windowName));
            const windowIndex = windowMatch ? windowMatch.split(':')[0] : windowName;
            
            console.log(`🎯 Using window target: ${windowIndex}`);
            this.claudeInstanceId = windowIndex;
            
            // Navigate to project root in the new window
            const projectRoot = process.cwd();
            console.log(`📁 Navigating to project root: ${projectRoot}`);
            
            await execAsync(`tmux send-keys -t ${windowIndex} 'cd "${projectRoot}"' Enter`);
            await this.sleep(1000);
            
            // Check if Claude Code is available
            try {
                await execAsync('which claude');
                console.log('✅ Claude Code CLI found');
            } catch (error) {
                console.log('⚠️ Claude Code CLI not found in PATH');
                console.log('💡 You may need to install it or add it to your PATH');
                console.log('📋 For now, using the window for manual Claude interaction');
            }
            
            // Send Ctrl+C 5 times first to clear any existing process
            console.log('🔄 Clearing window with Ctrl+C...');
            for (let i = 0; i < 5; i++) {
                await execAsync(`tmux send-keys -t ${windowIndex} C-c`);
                await this.sleep(100);
            }
            await this.sleep(500);
            
            // Start Claude Code with proper permissions
            await execAsync(`tmux send-keys -t ${windowIndex} 'claude --dangerously-skip-permissions' Enter`);
            console.log(`📤 Sent Claude Code command to window: ${windowIndex}`);
            
            // Wait for Claude to initialize
            console.log('⏳ Waiting for Claude to initialize...');
            await this.sleep(3000);
            
            // Check if Claude started successfully
            const { stdout: windowContent } = await execAsync(`tmux capture-pane -t ${windowIndex} -p`);
            
            if (windowContent.includes('Welcome to Claude') || windowContent.includes('claude>') || windowContent.includes('│ >')) {
                console.log('✅ Claude Code appears to be running');
            } else if (windowContent.includes('command not found') || windowContent.includes('no such file')) {
                console.log('❌ Claude Code failed to start - command not found');
                console.log('💡 Will proceed anyway for manual testing');
            } else {
                console.log('⚠️ Claude Code status unclear, proceeding...');
            }
            
        } catch (error) {
            throw new Error(`Failed to create tmux window: ${error.message}`);
        }
    }

    /**
     * Setup Operator connection
     */
    async setupOperatorConnection() {
        console.log('🔌 Setting up Operator connection...');
        
        let connectionOptions;
        
        if (this.isFirstIteration) {
            // First iteration: STRICT mode - require fresh home page
            connectionOptions = {
                waitForResponse: true,
                wait: 600, // 10 minutes timeout
                preferHome: true,
                requireHomePage: true // Strict requirement for home page only
            };
            console.log('🆕 FIRST ITERATION: Requiring fresh operator.chatgpt.com/ home page tab');
        } else if (this.operatorSessionUrl) {
            // Subsequent iterations: Use the saved conversation URL, but redirect to fresh page
            connectionOptions = {
                waitForResponse: true,
                wait: 600, // 10 minutes timeout
                targetUrl: this.operatorSessionUrl // Target specific conversation tab
            };
            console.log(`♻️  REUSING OPERATOR TAB: ${this.operatorSessionUrl}`);
        } else {
            throw new Error('No Operator session URL saved from first iteration');
        }
        
        this.operatorSender = new OperatorMessageSenderWithResponse(connectionOptions);
        
        const connected = await this.operatorSender.connect();
        if (!connected) {
            if (this.isFirstIteration) {
                throw new Error('Failed to connect to Operator. Ensure Chrome is running with --remote-debugging-port=9222 and has a fresh Operator home page open');
            } else {
                throw new Error(`Failed to reconnect to Operator session: ${this.operatorSessionUrl}`);
            }
        }
        
        console.log('✅ Connected to Operator');
        
        // Get current URL
        const currentUrl = await this.operatorSender.client.Runtime.evaluate({
            expression: 'window.location.href',
            returnByValue: true
        });
        
        const url = currentUrl.result.value;
        console.log(`📍 Current URL: ${url}`);
        
        if (this.isFirstIteration) {
            // First iteration: Verify we're on home page
            if (url.includes('/c/')) {
                throw new Error(`ERROR: Connected to existing conversation tab (${url}). Please open a fresh Operator home page tab.`);
            }
            
            // If not on home page, navigate there
            if (!url.endsWith('operator.chatgpt.com/') && !url.includes('?utm_source=chatgpt')) {
                console.log('🏠 Navigating to FRESH Operator home page...');
                await this.operatorSender.client.Page.navigate({
                    url: 'https://operator.chatgpt.com/'
                });
                await this.sleep(3000); // Wait for page to fully load
            }
            
            console.log('✅ Confirmed on Operator home page - ready for fresh conversation');
        } else {
            // Subsequent iterations: Redirect the reused tab to fresh home page
            console.log('🔄 Redirecting reused tab to fresh Operator home page for new conversation...');
            const redirectSuccess = await this.operatorSender.redirectToFreshOperatorPage();
            
            if (!redirectSuccess) {
                throw new Error('Failed to redirect tab to fresh Operator home page');
            }
            
            console.log('✅ Tab redirected - ready for fresh conversation in same tab');
        }
    }

    /**
     * Fast input method for Operator - bypasses character-by-character typing
     */
    async sendMessageToOperatorFast(message) {
        console.log('🚀 Sending message to Operator using fast input method...');
        
        try {
            // Record initial message count
            const initialMessageCount = await this.operatorSender.getMessageCount();
            console.log(`📊 Initial message count: ${initialMessageCount.assistant} assistant messages`);
            
            // Use direct value setting instead of character-by-character typing
            const sendResult = await this.operatorSender.client.Runtime.evaluate({
                expression: `
                (async () => {
                    const textarea = Array.from(document.querySelectorAll('textarea'))
                        .find(ta => ta.getBoundingClientRect().width > 0);
                    
                    if (!textarea) return { success: false, error: 'Textarea not found' };
                    
                    // Focus the textarea
                    textarea.focus();
                    textarea.click();
                    
                    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                        window.HTMLTextAreaElement.prototype, "value"
                    ).set;
                    
                    // Clear existing content
                    nativeInputValueSetter.call(textarea, '');
                    textarea.dispatchEvent(new Event('input', { bubbles: true }));
                    
                    // Short delay
                    await new Promise(r => setTimeout(r, 100));
                    
                    const message = ${JSON.stringify(message)};
                    
                    // Set entire message at once (much faster)
                    nativeInputValueSetter.call(textarea, message);
                    
                    // Trigger React events
                    const inputEvt = new Event('input', { bubbles: true });
                    Object.defineProperty(inputEvt, 'target', { value: textarea });
                    textarea.dispatchEvent(inputEvt);
                    
                    // Change event
                    textarea.dispatchEvent(new Event('change', { bubbles: true }));
                    
                    // Focus/blur cycle to trigger validation
                    textarea.blur();
                    await new Promise(r => setTimeout(r, 50));
                    textarea.focus();
                    
                    return { success: true };
                })()
                `,
                awaitPromise: true,
                returnByValue: true
            });
            
            if (!sendResult.result.value.success) {
                throw new Error(sendResult.result.value.error || 'Failed to set message');
            }
            
            console.log('✅ Message set in textarea');
            
            // Wait for UI to update
            await this.sleep(1000);
            
            // Send the message using existing logic
            const submitResult = await this.operatorSender.client.Runtime.evaluate({
                expression: `
                (() => {
                    // Find send button (same logic as original)
                    let sendButton = null;
                    const allButtons = document.querySelectorAll('button:not([disabled])');
                    
                    sendButton = Array.from(allButtons).find(btn => {
                        const svg = btn.querySelector('svg');
                        if (svg) {
                            const path = svg.querySelector('path');
                            if (path) {
                                const d = path.getAttribute('d');
                                if (d && d.includes('M11.2929 5.29289')) {
                                    return true;
                                }
                            }
                        }
                        return false;
                    });
                    
                    if (sendButton) {
                        sendButton.click();
                        return { success: true, method: 'button click' };
                    }
                    
                    // Fallback to Enter key
                    const textarea = document.querySelector('textarea');
                    if (textarea) {
                        textarea.focus();
                        const enterEvent = new KeyboardEvent('keydown', {
                            key: 'Enter',
                            code: 'Enter',
                            keyCode: 13,
                            bubbles: true
                        });
                        textarea.dispatchEvent(enterEvent);
                        return { success: true, method: 'enter key' };
                    }
                    
                    return { success: false, error: 'No send method worked' };
                })()
                `,
                returnByValue: true
            });
            
            console.log(`✅ Send attempt: ${submitResult.result.value.method}`);
            
            // Wait for response with longer timeout
            console.log(`⏳ Waiting up to 10 minutes for Operator response...`);
            this.operatorSender.waitTime = 600; // 10 minutes
            const response = await this.operatorSender.waitForResponse(initialMessageCount);
            
            if (response) {
                console.log('✅ Response received from Operator!');
                
                // Record Operator receive timestamp  
                this.workflowTimings.operatorReceiveTime = Date.now();
                this.log(`🕐 OPERATOR RECEIVE: ${this.getTimestamp()}`, 'TIMING');
                
                // If this is the first iteration, capture the conversation URL
                // Capture the NEW conversation URL after each iteration
                // (since we redirect to fresh home page each time, we get a new conversation)
                await this.sleep(1000); // Give URL time to update
                const conversationUrl = await this.operatorSender.client.Runtime.evaluate({
                    expression: 'window.location.href',
                    returnByValue: true
                });
                
                if (conversationUrl.result.value && conversationUrl.result.value.includes('/c/')) {
                    const newUrl = conversationUrl.result.value;
                    
                    if (this.isFirstIteration) {
                        this.operatorSessionUrl = newUrl;
                        console.log(`📌 Captured Operator conversation URL: ${this.operatorSessionUrl}`);
                        console.log('✅ This tab will be reused and redirected for subsequent iterations');
                        this.isFirstIteration = false; // Mark first iteration as complete
                    } else {
                        // Update to the new conversation URL for this iteration
                        const oldUrl = this.operatorSessionUrl;
                        this.operatorSessionUrl = newUrl;
                        console.log(`🔄 Updated conversation URL: ${oldUrl} → ${newUrl}`);
                    }
                } else {
                    console.log('⚠️  WARNING: Could not capture conversation URL');
                }
                
                return {
                    success: true,
                    response: response
                };
            } else {
                console.log('⚠️ No response received within timeout');
                return {
                    success: false,
                    error: 'No response received within timeout'
                };
            }
            
        } catch (error) {
            console.error('❌ Fast input failed:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }


    /**
     * Send failed tasks to Operator (FIRST step) - Using fast input
     */
    async sendTasksToOperator(failedTasks) {
        console.log(`📤 Sending ${failedTasks.length} failed tasks to Operator using fast method...`);
        
        // Record Operator send timestamp
        this.workflowTimings.operatorSendTime = Date.now();
        this.log(`🕐 OPERATOR SEND: ${this.getTimestamp()}`, 'TIMING');
        
        const operatorPrompt = this.buildOperatorPrompt(failedTasks);
        
        // Use the fast input method instead of character-by-character typing
        const result = await this.sendMessageToOperatorFast(operatorPrompt);
        
        if (!result.success) {
            throw new Error(`Failed to get response from Operator: ${result.error}`);
        }
        
        console.log('✅ Received response from Operator');
        return result.response;
    }

    /**
     * Build prompt for Operator with failed tasks (JSON format)
     */
    buildOperatorPrompt(failedTasks) {
        const taskDetails = failedTasks.map(task => ({
            taskId: task.taskId,
            description: task.description,
            status: task.status,
            priority: task.priority || 'medium',
            category: task.category || 'general',
            production_url: task.production_url || 'N/A',
            test_steps: task.test_steps || [],
            qa_report: task.qa_report || {}
        }));

        return `Please analyze these failed QA/UX tasks and provide specific recommendations for fixing them:

${JSON.stringify(taskDetails, null, 2)}

For each failed task, please provide:
1. Root cause analysis
2. Specific technical recommendations 
3. Priority level for fixes
4. Any additional testing suggestions

IMPORTANT: Your response should match the JSON format`;
    }

    /**
     * Send Operator response to Claude via tmux and wait for processing
     */
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
        
            const { exec } = await import('child_process');
            const { promisify } = await import('util');
            const execAsync = promisify(exec);
            // Build Claude prompt with Operator's analysis
            const claudePrompt = `Here's an analysis from an AI operator about some failed QA/UX tasks:

${operatorResponse}

ANALYZE the broken parts deeply and once the problem has been discovered, FIX them using these principles:
- ONLY execute the smallest possible change
- ALWAYS use real data so we fail FAST  
- ALWAYS have comprehensive logging so we can determine Root Cause
- Only use code that's already written so we always follow DRY Principles

Focus on:
1. Root cause analysis of each broken component
2. Minimal code fixes that address the core issue
3. Logging additions to prevent future failures
4. Reusing existing patterns and utilities

IMPORTANT: You MUST actually fix the code by:
1. Reading the relevant files
2. Making the necessary edits to fix the issues
3. Committing and deploying the changes to the live environment
4. Verifying your changes are live on the production URL
5. ONLY say "TASK_FINISHED" after you have completed ALL fixes AND deployment

DEPLOYMENT STEPS (CRITICAL):
After making code fixes, you MUST deploy to the live environment:
1. Add and commit all changes: git add . && git commit -m "Fix: [describe the fixes]"
2. Deploy using the appropriate method:
   - Heroku: git push heroku main
   - AWS/Vercel: use deployment commands or CI/CD pipeline
   - Other platforms: follow the deployment process for your environment
3. Wait for deployment to complete
4. Verify fixes are live on the production URL

Do NOT say TASK_FINISHED until you have:
- Made actual code changes to fix the issues
- Committed the changes to git
- Deployed to the live environment successfully
- Confirmed the fixes are live on the production app

The Operator will test the live production app to verify your fixes worked.

Say TASK_FINISHED only when ALL fixes are complete, deployed, and live.`;

            // Send the prompt to Claude
            const escapedPrompt = claudePrompt.replace(/'/g, "'\"'\"'");
            await execAsync(`tmux send-keys -t ${this.claudeInstanceId} '${escapedPrompt}'`);
            // Send Enter to submit the message
            await this.sleep(100);
            await execAsync(`tmux send-keys -t ${this.claudeInstanceId} Enter`);
            // Wait and send Enter again to ensure execution
            await this.sleep(2000);
            await execAsync(`tmux send-keys -t ${this.claudeInstanceId} Enter`);
            console.log('✅ Sent Operator response to Claude Code with double Enter');
            
            // Log the full response to a file for debugging
            await fs.writeFile('./operator_response_debug.txt', operatorResponse, 'utf8');
            console.log('💾 Full Operator response saved to operator_response_debug.txt');
            
            // Run /compact to clear stale TASK_FINISHED messages while preserving context
            console.log('🧹 Running /compact to clear stale outputs while preserving context...');
            await execAsync(`tmux send-keys -t ${this.claudeInstanceId} '/compact' Enter`);
            // Wait and send Enter again to ensure /compact executes
            await this.sleep(2000);
            await execAsync(`tmux send-keys -t ${this.claudeInstanceId} Enter`);
            await this.sleep(3000); // Wait for compact to complete
            console.log('✅ /compact completed with double Enter - ready for fresh TASK_FINISHED detection');
            
            // Use WindowKeywordMonitor to wait for Claude to finish
            console.log('⏳ Waiting for Claude to process Operator response and say TASK_FINISHED...');
            console.log(`📝 Operator response length: ${operatorResponse.length} characters`);
            console.log(`📝 Operator response preview: ${operatorResponse.substring(0, 500)}...`);
            
            // Load monitor configuration
            const monitorConfig = JSON.parse(
                await fs.readFile(
                    path.join(__dirname, 'config', 'task_finished_monitor.json'), 
                    'utf8'
                )
            );
            
            // Update config with window index
            monitorConfig.windowIndex = this.claudeInstanceId;
            
            // Create WindowKeywordMonitor instance
            const monitor = new WindowKeywordMonitor(monitorConfig);
            
            this.log(`⏳ Starting WindowKeywordMonitor - Iteration: ${this.iteration}, Window: ${this.claudeInstanceId}`, 'INFO');
            
            // Set up event handlers
            const detectionPromise = new Promise((resolve, reject) => {
                let detectionStartTime = Date.now();
                let hasDetected = false;
                
                monitor.on('keyword_detected', async ({keyword, output, chainIndex}) => {
                    if (hasDetected) return; // Prevent multiple detections
                    
                    const currentTime = Date.now();
                    const timeSinceLastDetection = currentTime - this.lastTaskFinishedTime;
                    const elapsedTime = currentTime - detectionStartTime;
                    
                    // Check cooldown period
                    if (timeSinceLastDetection < this.taskFinishedCooldown) {
                        this.log(`⏸️  TASK_FINISHED detected but in cooldown period`, 'WARNING');
                        this.log(`   Time since last detection: ${Math.floor(timeSinceLastDetection/1000)}s`, 'WARNING');
                        this.log(`   Cooldown remaining: ${Math.floor((this.taskFinishedCooldown - timeSinceLastDetection)/1000)}s`, 'WARNING');
                        this.log(`   Ignoring stale detection, continuing to monitor...`, 'WARNING');
                        return; // Don't resolve, keep monitoring
                    }
                    
                    hasDetected = true;
                    
                    // Valid detection
                    const detectionContext = {
                        monitorDuration: elapsedTime,
                        windowTarget: this.claudeInstanceId,
                        chainIndex
                    };
                    
                    const detectionId = this.logTaskFinishedDetection(output, detectionContext);
                    this.lastTaskFinishedTime = currentTime;
                    
                    this.log('✅ Claude completed processing (detected: TASK_FINISHED)', 'INFO');
                    this.log(`   Detection time: ${Math.floor(elapsedTime/1000)}s`, 'INFO');
                    this.log(`   Time since last detection: ${timeSinceLastDetection > 0 ? Math.floor(timeSinceLastDetection/1000) + 's' : 'First detection'}`, 'INFO');
                    
                    // Stop monitor and resolve
                    monitor.stop();
                    
                    resolve({
                        success: true,
                        claudeResponse: output,
                        detectionId,
                        detectionContext
                    });
                });
                
                monitor.on('timeout', () => {
                    this.log('⚠️ WindowKeywordMonitor timeout waiting for TASK_FINISHED', 'WARNING');
                    reject(new Error('Timeout waiting for Claude to finish processing'));
                });
                
                monitor.on('error', ({error, action}) => {
                    this.log(`❌ WindowKeywordMonitor error during ${action}: ${error}`, 'ERROR');
                    reject(new Error(`Monitor error: ${error}`));
                });
                
                monitor.on('chain_complete', ({totalStages, executionTime}) => {
                    // This shouldn't happen with single-chain TASK_FINISHED detection
                    this.log(`Chain complete event (unexpected): ${totalStages} stages in ${executionTime}ms`, 'DEBUG');
                });
            });
            
            try {
                // Start monitoring
                await monitor.start();
                
                // Wait for detection or timeout
                const result = await detectionPromise;
                return result;
                
            } catch (error) {
                console.log(`⚠️ Error during TASK_FINISHED monitoring: ${error.message}`);
                return {
                    success: false,
                    error: error.message
                };
            }
            
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

    /**
     * Update task statuses based on responses
     */
    updateTaskStatuses(qaUxData, operatorResponse) {
        console.log('🔄 Updating task statuses...');
        
        try {
            // Try to parse Operator's JSON response
            const analysis = JSON.parse(operatorResponse);
            
            if (analysis && analysis.analysis) {
                // Update tasks based on Operator's analysis
                Object.entries(analysis.analysis).forEach(([taskId, taskAnalysis]) => {
                    if (qaUxData.tasks[taskId]) {
                        // Update task with analysis data
                        qaUxData.tasks[taskId].operatorAnalysis = taskAnalysis;
                        qaUxData.tasks[taskId].lastAnalyzed = new Date().toISOString();
                        
                        // Check if task should be marked as resolved based on analysis
                        if (taskAnalysis.status === 'resolved' || taskAnalysis.fixed === true) {
                            qaUxData.tasks[taskId].status = 'pass';
                            qaUxData.tasks[taskId].lastUpdated = new Date().toISOString();
                            console.log(`✅ Task ${taskId} status updated to: pass`);
                        } else {
                            console.log(`📋 Task ${taskId} analysis recorded, status remains: ${qaUxData.tasks[taskId].status}`);
                        }
                    }
                });
            }
        } catch (error) {
            console.log('⚠️ Could not parse Operator response as JSON');
            console.log('❌ CRITICAL: Tasks should only be marked as pass after Claude confirms fixes are complete');
            console.log('⚠️  Keeping all task statuses unchanged until fixes are verified');
            
            // DO NOT randomly mark tasks as pass!
            // Tasks should only pass when:
            // 1. Claude has actually made code changes
            // 2. The changes have been verified to fix the issue
            // 3. Or when operator/claude explicitly confirms the fix
            
            Object.entries(qaUxData.tasks || {}).forEach(([taskId, task]) => {
                if (task.status === 'fail') {
                    console.log(`📋 Task ${taskId} remains: fail (awaiting actual fixes)`);
                }
            });
        }
    }

    /**
     * Check if all tasks have passed
     */
    allTasksPassed(qaUxData) {
        if (!qaUxData.tasks) return true;
        
        const failedTasks = Object.values(qaUxData.tasks).filter(task => task.status === 'fail');
        return failedTasks.length === 0;
    }

    /**
     * Main execution loop
     */
    async execute() {
        try {
            // Initialize logging
            this.log('🎯 Starting Operator E2E Execution', 'INFO');
            this.log(`Run ID: ${this.runId}`, 'INFO');
            this.log(`Log file: ${this.logFilePath}`, 'INFO');
            this.log(`QA file: ${this.qaUxFilePath}`, 'INFO');
            this.log(`Max iterations: ${this.maxIterations}`, 'INFO');
            this.log('─'.repeat(50), 'INFO');
            
            // Step 0: Load QA_UX file
            const qaUxData = await this.loadQaUxFile();
            
            // Step 1: Setup Claude session
            await this.setupClaudeSession();
            
            // Main iteration loop
            for (this.iteration = 1; this.iteration <= this.maxIterations; this.iteration++) {
                console.log(`\n🔄 Iteration ${this.iteration}/${this.maxIterations}`);
                
                // Reset workflow timings for new iteration
                this.resetWorkflowTimings();
                console.log('─'.repeat(30));
                
                // Step 2: Setup fresh Operator connection for each iteration
                console.log('🔌 Setting up fresh Operator connection for this iteration...');
                await this.setupOperatorConnection();
                
                // Check if all tasks have passed
                if (this.allTasksPassed(qaUxData)) {
                    console.log('🎉 All tasks have passed! Execution complete.');
                    // Cleanup connection before breaking
                    if (this.operatorSender) {
                        await this.operatorSender.disconnect();
                        this.operatorSender = null;
                    }
                    break;
                }
                
                // Step 3: Get failed tasks and send to Operator FIRST
                const failedTasks = this.getFailedTasks(qaUxData);
                if (failedTasks.length === 0) {
                    console.log('✅ No failed tasks found, execution complete');
                    // Cleanup connection before breaking
                    if (this.operatorSender) {
                        await this.operatorSender.disconnect();
                        this.operatorSender = null;
                    }
                    break;
                }
                
                const operatorResponse = await this.sendTasksToOperator(failedTasks);
                
                // Step 4: Send Operator response to Claude via tmux
                const claudeProcessed = await this.sendOperatorResponseToClaudeAndWait(operatorResponse);
                
                // Step 5: Only update task statuses if Claude successfully processed
                if (claudeProcessed.success) {
                    console.log('✅ Claude successfully processed Operator response');
                    this.updateTaskStatuses(qaUxData, operatorResponse);
                } else {
                    console.log('❌ Claude failed to process Operator response');
                    console.log(`   Error: ${claudeProcessed.error}`);
                    // Don't update task statuses on failure
                }
                
                // Step 6: Save updated file
                await this.saveQaUxFile(qaUxData);
                
                // Step 7: Cleanup Operator connection for this iteration
                if (this.operatorSender) {
                    console.log('🧹 Disconnecting Operator connection...');
                    await this.operatorSender.disconnect();
                    this.operatorSender = null;
                }
                
                console.log(`✅ Iteration ${this.iteration} completed`);
                
                // Validate workflow timing for this iteration
                this.validateWorkflowTiming();
            }
            
            const duration = ((Date.now() - this.startTime) / 1000).toFixed(1);
            this.log('\n🏁 Execution Summary', 'INFO');
            this.log('─'.repeat(50), 'INFO');
            this.log(`Total iterations: ${this.iteration}/${this.maxIterations}`, 'INFO');
            this.log(`Total duration: ${duration}s`, 'INFO');
            const allTasksPassed = this.allTasksPassed(qaUxData);
            const maxIterationsReached = this.iteration >= this.maxIterations;
            
            if (allTasksPassed) {
                this.log(`Final status: ✅ All tasks resolved - E2E test successful`, 'INFO');
            } else if (maxIterationsReached) {
                this.log(`Final status: ⚠️  Max iterations (${this.maxIterations}) reached - Some tasks may require deeper investigation`, 'INFO');
                this.log(`Remaining failed tasks may indicate complex issues that need manual intervention`, 'WARNING');
            } else {
                this.log(`Final status: 🔄 Some tasks still failing - Test stopped early`, 'INFO');
            }
            
            if (this.operatorSessionUrl) {
                this.log(`Operator session: ${this.operatorSessionUrl}`, 'INFO');
            }
            
            // Log TASK_FINISHED detection summary
            this.log('\n📊 TASK_FINISHED Detection Summary:', 'INFO');
            this.log(`Cooldown period: ${this.taskFinishedCooldown/1000} seconds`, 'INFO');
            if (this.taskFinishedDetections.size > 0) {
                this.log(`Total detections: ${this.taskFinishedDetections.size}`, 'INFO');
                Array.from(this.taskFinishedDetections.entries()).forEach(([detectionId, detection]) => {
                    this.log(`  Detection ${detectionId}: Iteration ${detection.iteration}, Time: ${detection.timestamp}`, 'INFO');
                });
                
                // Analyze for duplicates
                const detectionsByIteration = new Map();
                this.taskFinishedDetections.forEach((detection, id) => {
                    if (!detectionsByIteration.has(detection.iteration)) {
                        detectionsByIteration.set(detection.iteration, []);
                    }
                    detectionsByIteration.get(detection.iteration).push({id, ...detection});
                });
                
                let duplicateDetections = 0;
                detectionsByIteration.forEach((detections, iteration) => {
                    if (detections.length > 1) {
                        duplicateDetections++;
                        this.log(`  ⚠️  Iteration ${iteration} had ${detections.length} detections (potential duplicates)`, 'WARNING');
                    }
                });
                
                if (duplicateDetections > 0) {
                    this.log(`⚠️  ANALYSIS: Found ${duplicateDetections} iterations with multiple TASK_FINISHED detections`, 'WARNING');
                    this.log(`   Note: Cooldown should have prevented these if they were stale detections`, 'INFO');
                } else {
                    this.log(`✅ ANALYSIS: No duplicate TASK_FINISHED detections found within iterations`, 'INFO');
                    this.log(`   Cooldown period successfully prevented stale detections`, 'INFO');
                }
            } else {
                this.log('No TASK_FINISHED detections recorded', 'INFO');
            }
            
            // Final log flush
            await this.flushLogBuffer();
            this.log(`\n💾 Complete log saved to: ${this.logFilePath}`, 'INFO');
            
        } catch (error) {
            this.log(`\n❌ Execution failed: ${error.message}`, 'ERROR');
            this.log(`Stack trace: ${error.stack}`, 'ERROR');
            await this.flushLogBuffer();
            throw error;
        } finally {
            // Cleanup
            if (this.operatorSender) {
                await this.operatorSender.disconnect();
                this.log('🧹 Operator connection cleaned up', 'INFO');
            }
            
            // Final flush of any remaining logs
            await this.flushLogBuffer();
            console.log(`\n💾 All logs saved to: ${this.logFilePath}`);
        }
    }

    /**
     * Utility function for delays
     */
    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// CLI Interface
async function main() {
    const args = process.argv.slice(2);
    
    if (args.length === 0 || args[0] === '--help') {
        console.log(`
Operator E2E Execution Script

Usage:
  node operator.execute_e2e.js <qa_ux_file.json>
  node operator.execute_e2e.js --help

Description:
  Executes end-to-end testing workflow:
  1. Loads QA_UX JSON file with task statuses  
  2. Connects to tmux and spawns Claude Code instance
  3. Sends failed tasks to Claude Code for analysis
  4. Forwards Claude's response to Operator for additional analysis
  5. Updates task statuses based on responses
  6. Repeats until all tasks pass or 5 iterations reached

Requirements:
  - Chrome running with --remote-debugging-port=9222
  - tmux installed and available
  - Claude Code CLI installed
  - QA_UX JSON file with tasks structure

Example:
  node operator.execute_e2e.js ./test/sample_qa_ux.json
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
    
    const executor = new OperatorE2EExecutor({
        qaUxFilePath,
        workingDir: process.cwd()
    });
    
    try {
        await executor.execute();
        console.log('\n🎉 E2E execution completed successfully!');
    } catch (error) {
        console.error('\n💥 E2E execution failed:', error.message);
        process.exit(1);
    }
}

// Handle process termination gracefully
process.on('SIGINT', () => {
    console.log('\n👋 Received SIGINT, shutting down gracefully...');
    process.exit(0);
});

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(console.error);
}

export { OperatorE2EExecutor };
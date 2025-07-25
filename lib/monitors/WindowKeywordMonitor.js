import { ChainKeywordMonitor } from '../../../workflows/chain_keyword_monitor.js';
import { execSync } from 'child_process';
import { promisify } from 'util';
import { exec } from 'child_process';
import * as tmuxUtils from '../../../workflows/tmux_utils.js';

const execAsync = promisify(exec);

/**
 * WindowKeywordMonitor extends ChainKeywordMonitor to work with tmux windows
 * instead of tmux sessions. This allows E2E testing to use the sophisticated
 * keyword detection logic while maintaining window-based architecture.
 */
class WindowKeywordMonitor extends ChainKeywordMonitor {
    constructor(config) {
        // Convert window-based config to session-based for parent class
        const adaptedConfig = {
            ...config,
            instanceId: config.windowIndex || config.instanceId
        };
        super(adaptedConfig);
        
        // Store window-specific properties
        this.windowIndex = config.windowIndex || config.instanceId;
        this.isWindowBased = true;
    }

    /**
     * Override checkOutput to use window-based reading
     */
    async checkOutput() {
        if (!this.isActive) return;
        
        this.pollCount++;
        const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
        
        console.log(`\n📊 POLL #${this.pollCount} (${elapsed}s) - Looking for: "${this.currentKeyword}"`);
        
        try {
            // Check for timeout
            if (Date.now() - this.startTime > this.timeout) {
                console.log('⏰ TIMEOUT REACHED');
                this.stop();
                this.emit('timeout', { 
                    currentChain: this.currentChainIndex,
                    executedChains: this.executedChains.length 
                });
                return;
            }
            
            // Read output from window
            const stdout = await this.readFromInstance();
            
            // Process the output
            const currentContent = stdout || '';
            const newOutput = currentContent.slice(this.outputBuffer.length);
            this.outputBuffer = currentContent.slice(-10000); // Keep last 10k chars
            
            if (newOutput.length > 0) {
                console.log(`📝 New output: ${newOutput.length} characters`);
            } else {
                console.log('📝 No new output detected');
            }
            
            // Check for current keyword
            await this.checkForKeywords();
            
        } catch (error) {
            console.error('💥 Error in checkOutput:', error);
            throw error;
        }
    }

    /**
     * Override to read from tmux window instead of session
     */
    async readFromInstance() {
        try {
            // For windows, use capture-pane with window index
            const { stdout } = await execAsync(
                `tmux capture-pane -t ${this.windowIndex} -p -S -200`
            );
            return stdout;
        } catch (error) {
            this.emit('error', {
                action: 'read_from_window',
                error: error.message,
                windowIndex: this.windowIndex
            });
            throw error;
        }
    }

    /**
     * Override to send to tmux window instead of session
     */
    async sendToInstance(text) {
        try {
            // Escape single quotes in the text
            const escapedText = text.replace(/'/g, "'\"'\"'");
            
            // Send to window with retry logic
            let retryCount = 0;
            const maxRetries = this.options.retryAttempts || 3;
            const retryDelay = this.options.retryDelay || 2;
            
            while (retryCount < maxRetries) {
                try {
                    await execAsync(
                        `tmux send-keys -t ${this.windowIndex} '${escapedText}'`
                    );
                    
                    // Send Enter key
                    await execAsync(
                        `tmux send-keys -t ${this.windowIndex} Enter`
                    );
                    
                    // Double Enter for E2E (ensures proper submission)
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    await execAsync(
                        `tmux send-keys -t ${this.windowIndex} Enter`
                    );
                    
                    this.emit('text_sent', {
                        text,
                        windowIndex: this.windowIndex,
                        attempt: retryCount + 1
                    });
                    
                    return true;
                } catch (sendError) {
                    retryCount++;
                    if (retryCount >= maxRetries) {
                        throw sendError;
                    }
                    await new Promise(resolve => 
                        setTimeout(resolve, retryDelay * 1000)
                    );
                }
            }
        } catch (error) {
            this.emit('error', {
                action: 'send_to_window',
                error: error.message,
                windowIndex: this.windowIndex,
                text
            });
            throw error;
        }
    }

    /**
     * Override instance ID to session name conversion
     */
    instanceIdToSessionName() {
        // For windows, just return the window index
        return this.windowIndex;
    }

    /**
     * Override session name to instance ID conversion
     */
    sessionNameToInstanceId(sessionName) {
        // For windows, the session name is the window index
        return sessionName;
    }

    /**
     * Override logging to indicate window-based operation
     */
    log(message, level = 'info') {
        const prefix = `[WindowMonitor:${this.windowIndex}]`;
        // ChainKeywordMonitor uses console.log directly, not a log method
        console.log(`${prefix} ${message}`);
    }

    /**
     * Start monitoring with window-specific initialization
     */
    async start() {
        this.log('Starting window-based keyword monitoring');
        this.log(`Window index: ${this.windowIndex}`);
        this.log(`Chains: ${this.chains.length}`);
        
        // Verify window exists before starting
        try {
            await this.readFromInstance();
            this.log('Window verified accessible');
        } catch (error) {
            this.emit('error', {
                action: 'window_verification',
                error: `Window ${this.windowIndex} not accessible: ${error.message}`
            });
            throw new Error(`Cannot access tmux window ${this.windowIndex}`);
        }
        
        // Call parent start method
        return super.start();
    }

    /**
     * Override executeChainAction to handle null instructions
     */
    async executeChainAction(chainConfig) {
        const { keyword, instruction, chainIndex, nextKeyword } = chainConfig;
        
        // Check if already executed
        const executionKey = `${keyword}-${chainIndex}`;
        if (this.executedChains.some(chain => chain.keyword === keyword && chain.chainIndex === chainIndex)) {
            console.log(`⚠️  Chain action for "${keyword}" already executed, skipping`);
            return;
        }
        
        console.log('\n🎬 EXECUTING CHAIN ACTION');
        console.log(`🔗 Chain ${chainIndex + 1}/${this.chains.length}`);
        console.log(`📝 Instruction: "${instruction}"`);
        
        // Record this execution
        this.executedChains.push({
            keyword,
            instruction,
            chainIndex,
            timestamp: new Date().toISOString()
        });
        
        // Send instruction if not null
        if (instruction && instruction !== 'null') {
            const success = await this.sendInstructionWithRetry(instruction);
            if (!success) {
                console.error('❌ Failed to send instruction after all retries');
                this.emit('error', {
                    action: 'send_instruction',
                    error: 'Failed to send instruction after retries'
                });
                return;
            }
        } else {
            console.log('📌 No instruction to send (null instruction)');
        }
        
        // Emit chain executed event
        this.emit('chain_executed', {
            keyword,
            instruction,
            chainIndex,
            totalChains: this.chains.length
        });
        
        // Update for next chain or complete
        if (nextKeyword) {
            this.currentKeyword = nextKeyword;
            this.currentChainIndex = chainIndex + 1;
            console.log(`🔄 Next keyword: "${nextKeyword}"`);
        } else {
            // Chain complete
            console.log('\n🏁 CHAIN COMPLETE - All stages executed successfully');
            this.emit('chain_complete', {
                totalStages: this.executedChains.length,
                executionTime: Date.now() - this.startTime,
                executedChains: this.executedChains
            });
            this.stop();
        }
    }

    /**
     * Override sendInstructionWithRetry to use window-based sending
     */
    async sendInstructionWithRetry(instruction) {
        for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
            try {
                console.log(`📤 Sending instruction (attempt ${attempt}/${this.retryAttempts})`);
                
                await this.sendToInstance(instruction);
                console.log('✅ Instruction sent successfully');
                return true;
                
            } catch (error) {
                console.error(`❌ Send failed: ${error.message}`);
                
                // Wait before retry (except on last attempt)
                if (attempt < this.retryAttempts) {
                    console.log(`⏳ Waiting ${this.retryDelay/1000}s before retry...`);
                    await new Promise(resolve => setTimeout(resolve, this.retryDelay));
                }
            }
        }
        
        return false;
    }

    /**
     * Enhanced keyword detection for E2E specific needs
     */
    isActualCompletionSignal(output, keyword) {
        // First use parent's detection logic
        const parentResult = super.isActualCompletionSignal(output, keyword);
        if (!parentResult) return false;
        
        // Additional E2E-specific checks
        
        // Check for truncated messages (common E2E issue)
        const keywordIndex = output.lastIndexOf(keyword);
        const contextAfterKeyword = output.substring(
            keywordIndex + keyword.length, 
            keywordIndex + keyword.length + 50
        );
        
        // If there's substantial content after TASK_FINISHED, it might be truncated
        if (contextAfterKeyword.trim().length > 20) {
            this.log(`Warning: Detected content after ${keyword}, might be truncated`, 'warn');
        }
        
        // Check for common E2E false positives
        const lines = output.split('\n');
        const keywordLine = lines.find(line => line.includes(keyword));
        
        if (keywordLine) {
            // Skip if it's in a code block or comment
            if (keywordLine.trim().startsWith('//') || 
                keywordLine.trim().startsWith('#') ||
                keywordLine.trim().startsWith('*')) {
                return false;
            }
            
            // Skip if it's in quotes (being discussed, not executed)
            if (keywordLine.includes(`"${keyword}"`) || 
                keywordLine.includes(`'${keyword}'`) ||
                keywordLine.includes(`\`${keyword}\``)) {
                return false;
            }
        }
        
        return true;
    }
}

export default WindowKeywordMonitor;
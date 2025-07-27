import { stateManager } from './state-manager.js';
import { commandExecutor } from './command-executor.js';
import { execSync } from 'child_process';

class SessionRecovery {
    constructor(options = {}) {
        this.chromePort = options.chromePort || 9222;
        this.logger = options.logger || console.log;
        this.maxRecoveryAttempts = options.maxRecoveryAttempts || 3;
        this.sessionId = options.sessionId || 'default';
    }

    // Save session state for recovery
    saveSessionState(key, state) {
        stateManager.saveSessionState(`${this.sessionId}:${key}`, state);
    }

    // Get saved session state
    getSessionState(key) {
        return stateManager.getSessionState(`${this.sessionId}:${key}`);
    }

    // Recover Operator session after timeout
    async recoverOperatorSession(options = {}) {
        const { targetId, conversationUrl, iteration } = options;
        
        this.logger(`[RECOVERY] Starting Operator session recovery for iteration ${iteration}`);
        
        try {
            // First, check if the tab is still alive
            const response = await fetch(`http://localhost:${this.chromePort}/json/list`);
            const targets = await response.json();
            let operatorTab = targets.find(t => t.id === targetId);
            
            if (!operatorTab) {
                // Tab was closed, need to find or create new one
                operatorTab = await this.findOrCreateOperatorTab(conversationUrl);
                if (!operatorTab) {
                    throw new Error('Failed to recover Operator tab');
                }
            }

            // For now, we'll just verify the tab exists
            // Full CDP integration would require the chrome-remote-interface package
            
            this.logger('[RECOVERY] ✅ Operator tab found and accessible');
            
            return {
                success: true,
                targetId: operatorTab.id,
                recovered: true
            };

        } catch (error) {
            this.logger(`[RECOVERY] ❌ Failed to recover Operator session: ${error.message}`);
            return {
                success: false,
                error: error.message,
                recovered: false
            };
        }
    }

    // Find or create Operator tab
    async findOrCreateOperatorTab(conversationUrl) {
        const response = await fetch(`http://localhost:${this.chromePort}/json/list`);
        const targets = await response.json();
        
        // Look for existing Operator tab
        let operatorTab = targets.find(t => t.url?.includes('operator.chatgpt.com'));
        
        if (operatorTab) {
            this.logger('[RECOVERY] Found existing Operator tab');
            return operatorTab;
        }

        // Create new tab
        this.logger('[RECOVERY] Creating new Operator tab...');
        try {
            const newTabResponse = await fetch(`http://localhost:${this.chromePort}/json/new?${conversationUrl || 'https://operator.chatgpt.com'}`);
            const newTab = await newTabResponse.json();
            
            // Wait a moment for tab to initialize
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            return newTab;
        } catch (error) {
            this.logger(`[RECOVERY] Failed to create new tab: ${error.message}`);
            return null;
        }
    }

    // Get current page URL
    async getCurrentUrl(Page) {
        try {
            const { frameTree } = await Page.getFrameTree();
            return frameTree.frame.url;
        } catch (error) {
            return '';
        }
    }

    // Wait for page to load
    async waitForPageLoad(Page, timeout = 30000) {
        return new Promise((resolve) => {
            let timeoutId;
            
            const cleanup = () => {
                if (timeoutId) clearTimeout(timeoutId);
                Page.loadEventFired(null);
            };

            Page.loadEventFired(() => {
                cleanup();
                resolve(true);
            });

            timeoutId = setTimeout(() => {
                cleanup();
                resolve(false);
            }, timeout);
        });
    }

    // Check for session errors on the page
    async checkForSessionErrors(Runtime) {
        try {
            const result = await Runtime.evaluate({
                expression: `
                    (() => {
                        // Check for rate limit messages
                        const rateLimitText = document.body.innerText.toLowerCase();
                        if (rateLimitText.includes('rate limit') || 
                            rateLimitText.includes('too many requests')) {
                            return { hasError: true, type: 'rate_limit', message: 'Rate limit detected' };
                        }
                        
                        // Check for session expiration
                        if (rateLimitText.includes('session expired') || 
                            rateLimitText.includes('please log in')) {
                            return { hasError: true, type: 'session_expired', message: 'Session expired' };
                        }
                        
                        // Check for error modals
                        const errorModal = document.querySelector('[role="alert"], .error-message');
                        if (errorModal) {
                            return { 
                                hasError: true, 
                                type: 'error_modal', 
                                message: errorModal.textContent.trim() 
                            };
                        }
                        
                        return { hasError: false };
                    })()
                `
            });

            return result.result.value || { hasError: false };
        } catch (error) {
            return { hasError: false };
        }
    }

    // Verify we can interact with the page
    async verifyPageInteraction(Runtime) {
        try {
            const result = await Runtime.evaluate({
                expression: `
                    (() => {
                        // Check if text input is available
                        const input = document.querySelector('textarea, input[type="text"]');
                        return input && !input.disabled;
                    })()
                `
            });

            return result.result.value === true;
        } catch (error) {
            return false;
        }
    }

    // Recover tmux/Claude session or window
    async recoverClaudeSession(sessionOrWindowName = 'claude-code') {
        this.logger(`[RECOVERY] Checking Claude session/window: ${sessionOrWindowName}`);
        
        try {
            // Check if this is a window name (contains dashes) or session name
            const isWindowName = sessionOrWindowName.includes('-') && sessionOrWindowName.startsWith('e2e-');
            
            if (isWindowName) {
                // Handle window-based recovery (current implementation)
                return await this.recoverClaudeWindow(sessionOrWindowName);
            } else {
                // Handle session-based recovery (legacy support)
                return await this.recoverClaudeSessionLegacy(sessionOrWindowName);
            }
        } catch (error) {
            this.logger(`[RECOVERY] ❌ Failed to recover Claude session: ${error.message}`);
            return { success: false, error: error.message };
        }
    }
    
    // Recover Claude window within current session
    async recoverClaudeWindow(windowName) {
        this.logger(`[RECOVERY] Checking Claude window: ${windowName}`);
        
        try {
            // Check if window exists in current session
            const windowsResult = commandExecutor.execSync('tmux list-windows -F "#{window_name}" 2>/dev/null || true');
            const windows = windowsResult.output;
            
            if (!windows.includes(windowName)) {
                this.logger('[RECOVERY] Claude window not found, creating new one...');
                
                // Create new window
                commandExecutor.execSync(`tmux new-window -n ${windowName}`);
                
                // Start Claude in the window
                commandExecutor.execSync(`tmux send-keys -t ${windowName} 'claude' Enter`);
                
                // Wait for Claude to initialize
                await new Promise(resolve => setTimeout(resolve, 3000));
                
                this.logger('[RECOVERY] ✅ Claude window created');
                return { success: true, created: true };
            }

            // Window exists, check if it's responsive
            const contentResult = commandExecutor.execSync(`tmux capture-pane -t ${windowName} -p | tail -5`);
            const windowContent = contentResult.output;
            
            if (windowContent.includes('error') || windowContent.includes('Error')) {
                this.logger('[RECOVERY] Claude window has errors, restarting...');
                
                // Kill and recreate window
                commandExecutor.execSync(`tmux kill-window -t ${windowName} 2>/dev/null || true`);
                commandExecutor.execSync(`tmux new-window -n ${windowName}`);
                commandExecutor.execSync(`tmux send-keys -t ${windowName} 'claude' Enter`);
                
                await new Promise(resolve => setTimeout(resolve, 3000));
                
                this.logger('[RECOVERY] ✅ Claude window restarted');
                return { success: true, restarted: true };
            }

            this.logger('[RECOVERY] ✅ Claude window is healthy');
            return { success: true, healthy: true };

        } catch (error) {
            this.logger(`[RECOVERY] ❌ Failed to recover Claude window: ${error.message}`);
            return { success: false, error: error.message };
        }
    }
    
    // Legacy session-based recovery
    async recoverClaudeSessionLegacy(sessionName) {
        this.logger(`[RECOVERY] Checking Claude session (legacy): ${sessionName}`);
        
        try {
            // Check if session exists
            const sessionsResult = commandExecutor.execSync('tmux list-sessions 2>/dev/null || true');
            const sessions = sessionsResult.output;
            
            if (!sessions.includes(sessionName)) {
                this.logger('[RECOVERY] Claude session not found, creating new one...');
                
                // Create new session
                commandExecutor.execSync(`tmux new-session -d -s ${sessionName}`);
                
                // Start Claude in the session
                commandExecutor.execSync(`tmux send-keys -t ${sessionName} 'claude' Enter`);
                
                // Wait for Claude to initialize
                await new Promise(resolve => setTimeout(resolve, 3000));
                
                this.logger('[RECOVERY] ✅ Claude session created');
                return { success: true, created: true };
            }

            // Session exists, check if it's responsive
            const windowContent = execSync(`tmux capture-pane -t ${sessionName} -p | tail -5`).toString();
            
            if (windowContent.includes('error') || windowContent.includes('Error')) {
                this.logger('[RECOVERY] Claude session has errors, restarting...');
                
                // Kill and recreate session
                execSync(`tmux kill-session -t ${sessionName} 2>/dev/null || true`);
                execSync(`tmux new-session -d -s ${sessionName}`);
                execSync(`tmux send-keys -t ${sessionName} 'claude' Enter`);
                
                await new Promise(resolve => setTimeout(resolve, 3000));
                
                this.logger('[RECOVERY] ✅ Claude session restarted');
                return { success: true, restarted: true };
            }

            this.logger('[RECOVERY] ✅ Claude session is healthy');
            return { success: true, healthy: true };

        } catch (error) {
            this.logger(`[RECOVERY] ❌ Failed to recover Claude session: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    // Full system recovery
    async performFullRecovery(options = {}) {
        this.logger('[RECOVERY] Starting full system recovery...');
        
        const recoverySteps = [
            {
                name: 'Chrome Health',
                action: async () => await this.recoverChromeConnection()
            },
            {
                name: 'Operator Session',
                action: async () => await this.recoverOperatorSession(options)
            },
            {
                name: 'Claude Session',
                action: async () => await this.recoverClaudeSession(options.claudeSession)
            }
        ];

        const results = {};
        
        for (const step of recoverySteps) {
            this.logger(`[RECOVERY] Executing: ${step.name}`);
            
            try {
                results[step.name] = await step.action();
                
                if (!results[step.name].success) {
                    this.logger(`[RECOVERY] ⚠️  ${step.name} recovery had issues`);
                }
            } catch (error) {
                this.logger(`[RECOVERY] ❌ ${step.name} recovery failed: ${error.message}`);
                results[step.name] = { success: false, error: error.message };
            }
        }

        const allSuccessful = Object.values(results).every(r => r.success);
        
        this.logger(`[RECOVERY] Recovery complete: ${allSuccessful ? '✅ Success' : '⚠️  Partial success'}`);
        
        return {
            success: allSuccessful,
            results
        };
    }

    // Recover Chrome connection
    async recoverChromeConnection() {
        try {
            // Test connection
            const response = await fetch(`http://localhost:${this.chromePort}/json/list`);
            if (!response.ok) throw new Error('Connection failed');
            return { success: true, message: 'Chrome connection is healthy' };
        } catch (error) {
            this.logger('[RECOVERY] Chrome connection failed, checking if Chrome is running...');
            
            const isRunning = this.isChromeRunning();
            if (!isRunning) {
                return { 
                    success: false, 
                    message: 'Chrome is not running with debugging port',
                    action: 'Start Chrome with --remote-debugging-port=9222'
                };
            }

            // Chrome is running but connection failed
            return {
                success: false,
                message: 'Chrome is running but connection failed',
                action: 'Restart Chrome or check firewall settings'
            };
        }
    }

    // Check if Chrome is running
    isChromeRunning() {
        try {
            const result = commandExecutor.execSync('ps aux | grep -i chrome | grep -v grep');
            return result.success && result.output.includes(`--remote-debugging-port=${this.chromePort}`);
        } catch (error) {
            return false;
        }
    }
}

export default SessionRecovery;
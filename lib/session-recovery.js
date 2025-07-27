import { execSync } from 'child_process';

class SessionRecovery {
    constructor(options = {}) {
        this.chromePort = options.chromePort || 9222;
        this.logger = options.logger || console.log;
        this.sessionState = new Map();
        this.maxRecoveryAttempts = options.maxRecoveryAttempts || 3;
    }

    // Save session state for recovery
    saveSessionState(key, state) {
        this.sessionState.set(key, {
            ...state,
            savedAt: Date.now()
        });
    }

    // Get saved session state
    getSessionState(key) {
        return this.sessionState.get(key);
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

    // Recover tmux/Claude session
    async recoverClaudeSession(sessionName = 'claude-code') {
        this.logger(`[RECOVERY] Checking Claude session: ${sessionName}`);
        
        try {
            // Check if session exists
            const sessions = execSync('tmux list-sessions 2>/dev/null || true').toString();
            
            if (!sessions.includes(sessionName)) {
                this.logger('[RECOVERY] Claude session not found, creating new one...');
                
                // Create new session
                execSync(`tmux new-session -d -s ${sessionName}`);
                
                // Start Claude in the session
                execSync(`tmux send-keys -t ${sessionName} 'claude' Enter`);
                
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
            const processes = execSync('ps aux | grep -i chrome | grep -v grep').toString();
            return processes.includes(`--remote-debugging-port=${this.chromePort}`);
        } catch (error) {
            return false;
        }
    }
}

export default SessionRecovery;
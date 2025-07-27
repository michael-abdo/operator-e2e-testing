import { execSync } from 'child_process';

class HealthCheckSystem {
    constructor(options = {}) {
        this.chromePort = options.chromePort || 9222;
        this.tmuxSession = options.tmuxSession || 'claude-code';
        this.logger = options.logger || console.log;
        this.maxOperatorInactivity = options.maxOperatorInactivity || 300000; // 5 minutes
        this.lastOperatorActivity = Date.now();
    }

    // Main health check orchestrator
    async performHealthCheck(iteration = 0) {
        const checks = {
            chrome: await this.checkChromeHealth(),
            operator: await this.checkOperatorHealth(),
            claude: await this.checkClaudeHealth(),
            system: await this.checkSystemHealth()
        };

        const healthy = Object.values(checks).every(check => check.healthy);
        
        this.logger(`[HEALTH] Check results (Iteration ${iteration}):`);
        Object.entries(checks).forEach(([service, result]) => {
            const status = result.healthy ? '✅' : '❌';
            this.logger(`[HEALTH] ${status} ${service}: ${result.message}`);
            if (result.details) {
                this.logger(`[HEALTH]    Details: ${JSON.stringify(result.details)}`);
            }
        });

        return {
            healthy,
            checks,
            timestamp: new Date().toISOString()
        };
    }

    // Chrome health check
    async checkChromeHealth() {
        try {
            // Check if Chrome is running with debugging port
            const processes = execSync('ps aux | grep -i chrome | grep -v grep').toString();
            if (!processes.includes(`--remote-debugging-port=${this.chromePort}`)) {
                return {
                    healthy: false,
                    message: 'Chrome not running with debugging port',
                    recovery: 'Start Chrome with --remote-debugging-port=9222'
                };
            }

            // Try to connect to Chrome DevTools using fetch API
            const response = await fetch(`http://localhost:${this.chromePort}/json/list`);
            if (!response.ok) {
                throw new Error('Cannot connect to Chrome DevTools');
            }
            
            // List available tabs
            const targets = await response.json();
            const operatorTab = targets.find(t => t.url?.includes('operator.chatgpt.com'));

            if (!operatorTab) {
                return {
                    healthy: false,
                    message: 'No Operator tab found',
                    recovery: 'Open https://operator.chatgpt.com in Chrome'
                };
            }

            return {
                healthy: true,
                message: 'Chrome and Operator tab available',
                details: {
                    tabCount: targets.length,
                    operatorTabId: operatorTab.id
                }
            };
        } catch (error) {
            return {
                healthy: false,
                message: `Chrome connection failed: ${error.message}`,
                recovery: 'Restart Chrome with debugging port enabled'
            };
        }
    }

    // Operator session health check
    async checkOperatorHealth() {
        try {
            const timeSinceLastActivity = Date.now() - this.lastOperatorActivity;
            
            if (timeSinceLastActivity > this.maxOperatorInactivity) {
                return {
                    healthy: false,
                    message: 'Operator session may be stale',
                    details: {
                        lastActivity: new Date(this.lastOperatorActivity).toISOString(),
                        inactivityMinutes: Math.round(timeSinceLastActivity / 60000)
                    },
                    recovery: 'Refresh Operator session or start new conversation'
                };
            }

            // Check if we can access the Operator tab
            const response = await fetch(`http://localhost:${this.chromePort}/json/list`);
            const targets = await response.json();
            const operatorTab = targets.find(t => t.url?.includes('operator.chatgpt.com'));
            
            if (operatorTab && operatorTab.type === 'page') {
                return {
                    healthy: true,
                    message: 'Operator session active',
                    details: {
                        tabId: operatorTab.id,
                        title: operatorTab.title
                    }
                };
            }

            return {
                healthy: false,
                message: 'Operator tab not accessible',
                recovery: 'Reload Operator tab'
            };
        } catch (error) {
            return {
                healthy: false,
                message: `Operator check failed: ${error.message}`
            };
        }
    }

    // Claude session health check
    async checkClaudeHealth() {
        try {
            // Check if tmux session exists
            const sessions = execSync('tmux list-sessions 2>/dev/null || true').toString();
            if (!sessions.includes(this.tmuxSession)) {
                return {
                    healthy: false,
                    message: 'Claude tmux session not found',
                    recovery: `Create tmux session: tmux new-session -d -s ${this.tmuxSession}`
                };
            }

            // Check if claude is running in the session
            const windowContent = execSync(`tmux capture-pane -t ${this.tmuxSession} -p | tail -20`).toString();
            
            // Look for signs of an active claude session
            const isHealthy = windowContent.includes('claude') || 
                             windowContent.includes('Code') ||
                             windowContent.includes('TASK_FINISHED');

            if (isHealthy) {
                return {
                    healthy: true,
                    message: 'Claude session active',
                    details: {
                        sessionName: this.tmuxSession,
                        hasContent: windowContent.length > 0
                    }
                };
            }

            return {
                healthy: false,
                message: 'Claude session appears inactive',
                recovery: 'Start Claude in tmux session'
            };
        } catch (error) {
            return {
                healthy: false,
                message: `Claude check failed: ${error.message}`
            };
        }
    }

    // System resource health check
    async checkSystemHealth() {
        try {
            // Check memory usage
            const memInfo = execSync("vm_stat | grep 'Pages free' | awk '{print $3}' | sed 's/\\.//'").toString().trim();
            const freePages = parseInt(memInfo);
            const freeMB = Math.round(freePages * 4096 / 1024 / 1024);
            
            if (freeMB < 500) {
                return {
                    healthy: false,
                    message: 'Low system memory',
                    details: { freeMB },
                    recovery: 'Close unnecessary applications'
                };
            }

            // Check CPU load
            const loadAvg = execSync("uptime | awk -F'load averages:' '{print $2}'").toString().trim();
            const loads = loadAvg.split(' ').map(l => parseFloat(l));
            
            if (loads[0] > 10) {
                return {
                    healthy: false,
                    message: 'High CPU load',
                    details: { loadAverage: loads[0] },
                    recovery: 'Wait for system load to decrease'
                };
            }

            return {
                healthy: true,
                message: 'System resources adequate',
                details: {
                    freeMB,
                    loadAverage: loads[0]
                }
            };
        } catch (error) {
            // Non-critical, just log
            return {
                healthy: true,
                message: 'System check skipped',
                details: { error: error.message }
            };
        }
    }

    // Update activity timestamp
    updateOperatorActivity() {
        this.lastOperatorActivity = Date.now();
    }

    // Pre-iteration health check with recovery attempts
    async ensureHealthyBeforeIteration(iteration) {
        const maxRecoveryAttempts = 3;
        
        for (let attempt = 1; attempt <= maxRecoveryAttempts; attempt++) {
            const health = await this.performHealthCheck(iteration);
            
            if (health.healthy) {
                return true;
            }

            this.logger(`[HEALTH] System unhealthy (attempt ${attempt}/${maxRecoveryAttempts})`);
            
            // Attempt automatic recovery for common issues
            if (!health.checks.chrome.healthy) {
                this.logger('[HEALTH] Attempting Chrome recovery...');
                // Could implement auto-restart of Chrome here
            }
            
            if (!health.checks.claude.healthy) {
                this.logger('[HEALTH] Attempting Claude session recovery...');
                // Could implement tmux session recovery here
            }

            if (attempt < maxRecoveryAttempts) {
                this.logger('[HEALTH] Waiting 10 seconds before retry...');
                await new Promise(resolve => setTimeout(resolve, 10000));
            }
        }

        return false;
    }
}

export default HealthCheckSystem;
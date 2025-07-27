/**
 * Unified command execution utility
 * Consolidates execSync/execAsync patterns with consistent error handling
 */

import { execSync as nodeExecSync, exec as nodeExec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(nodeExec);

export class CommandExecutor {
    constructor(options = {}) {
        this.logger = options.logger || console.log;
        this.errorLogger = options.errorLogger || console.error;
        this.defaultTimeout = options.defaultTimeout || 30000; // 30 seconds
    }
    
    /**
     * Execute command synchronously with error handling
     */
    execSync(command, options = {}) {
        const execOptions = {
            encoding: 'utf8',
            timeout: this.defaultTimeout,
            ...options
        };
        
        try {
            const result = nodeExecSync(command, execOptions);
            return {
                success: true,
                output: result.toString().trim(),
                command
            };
        } catch (error) {
            this.errorLogger(`Command failed: ${command}`, error.message);
            return {
                success: false,
                error: error.message,
                output: error.stdout ? error.stdout.toString() : '',
                command
            };
        }
    }
    
    /**
     * Execute command asynchronously with error handling
     */
    async execAsync(command, options = {}) {
        const execOptions = {
            encoding: 'utf8',
            timeout: this.defaultTimeout,
            ...options
        };
        
        try {
            const { stdout, stderr } = await execAsync(command, execOptions);
            return {
                success: true,
                output: stdout.trim(),
                stderr: stderr.trim(),
                command
            };
        } catch (error) {
            this.errorLogger(`Async command failed: ${command}`, error.message);
            return {
                success: false,
                error: error.message,
                output: error.stdout || '',
                stderr: error.stderr || '',
                command
            };
        }
    }
    
    /**
     * Execute command with retry logic
     */
    async execWithRetry(command, options = {}) {
        const {
            maxRetries = 3,
            retryDelay = 1000,
            ...execOptions
        } = options;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            const result = await this.execAsync(command, execOptions);
            
            if (result.success) {
                return result;
            }
            
            if (attempt < maxRetries) {
                this.logger(`Retry ${attempt}/${maxRetries} for command: ${command}`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
            }
        }
        
        // Final attempt failed
        return {
            success: false,
            error: `Command failed after ${maxRetries} attempts`,
            command
        };
    }
    
    /**
     * Execute tmux-specific commands with proper escaping
     */
    async execTmux(tmuxCommand, options = {}) {
        // Escape special characters for tmux
        const escapedCommand = tmuxCommand
            .replace(/'/g, "'\"'\"'")
            .replace(/\$/g, '\\$');
            
        return this.execAsync(`tmux ${escapedCommand}`, options);
    }
    
    /**
     * Check if a command exists
     */
    commandExists(command) {
        const result = this.execSync(`which ${command}`, { throwOnError: false });
        return result.success;
    }
}

// Singleton instance
export const commandExecutor = new CommandExecutor();
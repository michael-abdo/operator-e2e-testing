/**
 * Unified logging utility for E2E testing system
 * Provides consistent logging interface across all components
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class UnifiedLogger {
    constructor(options = {}) {
        this.component = options.component || 'E2E';
        this.logLevel = options.logLevel || 'info';
        this.logToFile = options.logToFile !== false;
        this.logDir = options.logDir || path.join(dirname(__dirname), 'logs');
        this.timestamp = options.timestamp !== false;
        
        if (this.logToFile) {
            this.ensureLogDir();
            this.logFile = this.createLogFile();
        }
        
        this.levels = {
            error: 0,
            warn: 1,
            info: 2,
            debug: 3
        };
    }
    
    ensureLogDir() {
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }
    }
    
    createLogFile() {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `${this.component.toLowerCase()}_${timestamp}.log`;
        return path.join(this.logDir, filename);
    }
    
    formatMessage(level, message, data) {
        const timestamp = this.timestamp ? `[${new Date().toISOString()}]` : '';
        const component = `[${this.component}]`;
        const levelStr = `[${level.toUpperCase()}]`;
        
        let fullMessage = `${timestamp} ${component} ${levelStr} ${message}`;
        
        if (data) {
            fullMessage += '\n' + JSON.stringify(data, null, 2);
        }
        
        return fullMessage;
    }
    
    log(level, message, data) {
        if (this.levels[level] > this.levels[this.logLevel]) {
            return;
        }
        
        const formattedMessage = this.formatMessage(level, message, data);
        
        // Console output with colors
        switch (level) {
            case 'error':
                console.error(formattedMessage);
                break;
            case 'warn':
                console.warn(formattedMessage);
                break;
            default:
                console.log(formattedMessage);
        }
        
        // File output
        if (this.logToFile && this.logFile) {
            fs.appendFileSync(this.logFile, formattedMessage + '\n');
        }
    }
    
    error(message, data) {
        this.log('error', message, data);
    }
    
    warn(message, data) {
        this.log('warn', message, data);
    }
    
    info(message, data) {
        this.log('info', message, data);
    }
    
    debug(message, data) {
        this.log('debug', message, data);
    }
    
    // Specialized logging for E2E system
    logIteration(iteration, data) {
        this.info(`Iteration ${iteration}`, data);
    }
    
    logKeywordDetection(keyword, detected, data) {
        const status = detected ? '✓ DETECTED' : '⏳ WAITING';
        this.info(`Keyword "${keyword}" ${status}`, data);
    }
    
    logChainExecution(chainIndex, totalChains, data) {
        this.info(`Executing chain ${chainIndex}/${totalChains}`, data);
    }
    
    logSessionRecovery(action, data) {
        this.warn(`Session recovery: ${action}`, data);
    }
    
    logTimeout(component, data) {
        this.error(`Timeout in ${component}`, data);
    }
    
    // Create child logger with component prefix
    createChild(component) {
        return new UnifiedLogger({
            ...this,
            component: `${this.component}:${component}`,
            logToFile: this.logToFile,
            logDir: this.logDir,
            logLevel: this.logLevel
        });
    }
}

// Factory function for creating loggers
export function createLogger(component, options = {}) {
    return new UnifiedLogger({ component, ...options });
}

// Default logger instance
export const logger = new UnifiedLogger({ component: 'E2E' });
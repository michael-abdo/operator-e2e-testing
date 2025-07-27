#!/usr/bin/env node

/**
 * @fileoverview ProjectManager - Cross-Project E2E Testing Context Management
 * 
 * Provides project isolation for E2E testing by managing:
 * - Project detection from current working directory
 * - Unique Chrome debug ports per project  
 * - Project-specific tmux session names
 * - Isolated log directories
 * - Project-specific configuration
 * 
 * @author Claude AI Assistant
 * @version 1.0.0
 */

import path from 'path';
import crypto from 'crypto';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * ProjectManager handles cross-project E2E testing isolation
 * 
 * @class ProjectManager
 */
class ProjectManager {
    /**
     * @typedef {Object} ProjectContext
     * @property {string} projectName - Sanitized project name
     * @property {string} projectHash - SHA256 hash of project path
     * @property {string} shortHash - First 8 chars of project hash
     * @property {string} projectPath - Full path to project directory
     * @property {number} chromePort - Unique Chrome debug port (9222-9321)
     * @property {string} tmuxSessionName - Unique tmux session name
     * @property {string} logDirectory - Project-specific log directory path
     * @property {string} configPath - Path to project config file
     * @property {string} timestamp - ISO timestamp of context creation
     * @property {boolean} isUnique - Whether context passes uniqueness validation
     * @property {string} displayName - Human-readable project identifier
     */

    /**
     * @typedef {Object} ProjectConfig
     * @property {number} maxIterations - Maximum E2E iterations
     * @property {number} chromePortOffset - Additional port offset
     * @property {string} tmuxSessionPrefix - Session name prefix
     * @property {number} logRetentionDays - Log retention period
     * @property {Object} timeouts - Timeout configurations
     */

    /**
     * Create ProjectManager instance
     * 
     * @param {Object} options - Configuration options
     * @param {Object} options.baseConfig - Base configuration overrides
     * @param {boolean} options.enableValidation - Enable strict validation
     */
    constructor(options = {}) {
        this.baseConfig = options.baseConfig || {};
        this.enableValidation = options.enableValidation !== false;
        this.configCache = new Map();
        
        // Constants for port allocation
        this.BASE_CHROME_PORT = 9222;
        this.MAX_CHROME_PORTS = 100;
        
        // Constants for path validation
        this.MAX_PROJECT_NAME_LENGTH = 50;
        this.SAFE_CHAR_PATTERN = /^[a-zA-Z0-9_-]+$/;
    }

    /**
     * Detect project context from current working directory
     * 
     * @returns {ProjectContext} Complete project context
     * @throws {Error} If project detection fails
     */
    detectProjectContext() {
        try {
            const cwd = process.cwd();
            this._validateProjectPath(cwd);
            
            const projectName = this.extractProjectName(cwd);
            const projectHash = this.generateProjectHash(cwd);
            const shortHash = projectHash.substring(0, 8);
            
            const context = {
                projectName,
                projectHash,
                shortHash,
                projectPath: cwd,
                chromePort: this.generateChromePort(projectHash),
                tmuxSessionName: this.getTmuxSessionName(projectName, shortHash),
                logDirectory: this.getLogDirectory(projectName, shortHash),
                configPath: this._getConfigPath(projectName),
                timestamp: new Date().toISOString()
            };

            // Add derived properties
            context.isUnique = this._validateUniqueness(context);
            context.displayName = `${projectName} (${shortHash})`;
            
            if (this.enableValidation) {
                this._validateContext(context);
            }
            
            return context;
        } catch (error) {
            throw new Error(`Failed to detect project context: ${error.message}`);
        }
    }

    /**
     * Extract and sanitize project name from directory path
     * 
     * @param {string} directoryPath - Full path to project directory
     * @returns {string} Sanitized project name
     * @throws {Error} If path is invalid or name cannot be extracted
     */
    extractProjectName(directoryPath) {
        try {
            const baseName = path.basename(directoryPath);
            
            if (!baseName || baseName === '.' || baseName === '/') {
                throw new Error(`Invalid project directory: ${directoryPath}`);
            }
            
            // Sanitize for tmux session names (alphanumeric + dash/underscore)
            let sanitized = baseName.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
            
            // Remove consecutive dashes and trim
            sanitized = sanitized.replace(/-+/g, '-').replace(/^-+|-+$/g, '');
            
            if (!sanitized) {
                throw new Error(`Project name becomes empty after sanitization: ${baseName}`);
            }
            
            if (sanitized.length > this.MAX_PROJECT_NAME_LENGTH) {
                sanitized = sanitized.substring(0, this.MAX_PROJECT_NAME_LENGTH);
            }
            
            return sanitized;
        } catch (error) {
            throw new Error(`Failed to extract project name: ${error.message}`);
        }
    }

    /**
     * Generate deterministic hash for project path
     * 
     * @param {string} projectPath - Full path to project
     * @returns {string} SHA256 hash of normalized project path
     * @throws {Error} If hash generation fails
     */
    generateProjectHash(projectPath) {
        try {
            const normalizedPath = path.resolve(projectPath);
            return crypto.createHash('sha256').update(normalizedPath).digest('hex');
        } catch (error) {
            throw new Error(`Failed to generate project hash: ${error.message}`);
        }
    }

    /**
     * Generate unique Chrome debug port for project
     * 
     * @param {string} projectHash - Project hash
     * @returns {number} Chrome debug port (9222-9321 range)
     * @throws {Error} If port generation fails
     */
    generateChromePort(projectHash) {
        try {
            const hashNumber = parseInt(projectHash.substring(0, 8), 16);
            const port = this.BASE_CHROME_PORT + (hashNumber % this.MAX_CHROME_PORTS);
            
            if (port < this.BASE_CHROME_PORT || port >= this.BASE_CHROME_PORT + this.MAX_CHROME_PORTS) {
                throw new Error(`Generated port ${port} outside valid range`);
            }
            
            return port;
        } catch (error) {
            throw new Error(`Failed to generate Chrome port: ${error.message}`);
        }
    }

    /**
     * Generate tmux session name for project
     * 
     * @param {string} projectName - Sanitized project name
     * @param {string} shortHash - Short hash for uniqueness
     * @returns {string} Tmux session name
     * @throws {Error} If session name generation fails
     */
    getTmuxSessionName(projectName, shortHash) {
        try {
            const sessionName = `e2e-${projectName}-${shortHash}`;
            
            // Validate tmux session name constraints
            if (sessionName.length > 255) {
                throw new Error(`Session name too long: ${sessionName.length} chars`);
            }
            
            if (!this.SAFE_CHAR_PATTERN.test(sessionName.replace(/-/g, ''))) {
                throw new Error(`Session name contains invalid characters: ${sessionName}`);
            }
            
            return sessionName;
        } catch (error) {
            throw new Error(`Failed to generate tmux session name: ${error.message}`);
        }
    }

    /**
     * Get project-specific log directory
     * 
     * @param {string} projectName - Project name
     * @param {string} shortHash - Short hash for uniqueness
     * @returns {string} Log directory path
     * @throws {Error} If log directory path generation fails
     */
    getLogDirectory(projectName, shortHash) {
        try {
            const baseDir = path.resolve(__dirname, '../logs');
            const logDir = path.join(baseDir, `${projectName}-${shortHash}`);
            
            // Validate path safety
            if (!logDir.startsWith(baseDir)) {
                throw new Error(`Log directory path traversal detected: ${logDir}`);
            }
            
            return logDir;
        } catch (error) {
            throw new Error(`Failed to generate log directory path: ${error.message}`);
        }
    }

    /**
     * Get project-specific configuration file path
     * 
     * @private
     * @param {string} projectName - Project name
     * @returns {string} Config file path
     * @throws {Error} If config path generation fails
     */
    _getConfigPath(projectName) {
        try {
            const configDir = path.resolve(__dirname, '../config/project-configs');
            const configPath = path.join(configDir, `${projectName}.json`);
            
            // Validate path safety
            if (!configPath.startsWith(configDir)) {
                throw new Error(`Config path traversal detected: ${configPath}`);
            }
            
            return configPath;
        } catch (error) {
            throw new Error(`Failed to generate config path: ${error.message}`);
        }
    }

    /**
     * Validate project path for security and accessibility
     * 
     * @private
     * @param {string} projectPath - Path to validate
     * @throws {Error} If path is invalid or inaccessible
     */
    _validateProjectPath(projectPath) {
        if (!projectPath || typeof projectPath !== 'string') {
            throw new Error('Project path must be a non-empty string');
        }
        
        if (projectPath.includes('\0')) {
            throw new Error('Project path contains null bytes');
        }
        
        try {
            const resolved = path.resolve(projectPath);
            // Additional validation could be added here
        } catch (error) {
            throw new Error(`Invalid project path: ${error.message}`);
        }
    }

    /**
     * Validate project context for completeness and correctness
     * 
     * @private
     * @param {ProjectContext} context - Context to validate
     * @throws {Error} If context is invalid
     */
    _validateContext(context) {
        const required = ['projectName', 'projectHash', 'chromePort', 'tmuxSessionName'];
        
        for (const field of required) {
            if (!context[field]) {
                throw new Error(`Missing required context field: ${field}`);
            }
        }
        
        if (typeof context.chromePort !== 'number' || context.chromePort < 1024) {
            throw new Error(`Invalid Chrome port: ${context.chromePort}`);
        }
    }

    /**
     * Validate that project context is unique and won't conflict
     * 
     * @private
     * @param {ProjectContext} context - Project context
     * @returns {boolean} True if context appears unique
     */
    _validateUniqueness(context) {
        // Basic validation - could be enhanced with actual conflict detection
        try {
            return !!(context.projectName && 
                     context.chromePort && 
                     context.tmuxSessionName && 
                     context.logDirectory);
        } catch (error) {
            return false;
        }
    }

    /**
     * Ensure log directory exists with proper permissions
     * 
     * @param {string} logDirectory - Log directory path
     * @returns {Promise<boolean>} True if directory exists or was created
     */
    async ensureLogDirectory(logDirectory) {
        try {
            await fs.mkdir(logDirectory, { recursive: true, mode: 0o755 });
            return true;
        } catch (error) {
            console.error(`Failed to create log directory ${logDirectory}:`, error.message);
            return false;
        }
    }

    /**
     * Load project-specific configuration with fallback to defaults
     * 
     * @param {string} configPath - Path to config file
     * @returns {Promise<ProjectConfig>} Configuration object
     */
    async loadProjectConfig(configPath) {
        if (this.configCache.has(configPath)) {
            return this.configCache.get(configPath);
        }

        const defaultConfig = {
            maxIterations: 5,
            chromePortOffset: 0,
            tmuxSessionPrefix: 'e2e',
            logRetentionDays: 7,
            timeouts: {
                operatorPhase: 60000,
                claudePhase: 120000,
                chromeConnection: 10000
            }
        };

        try {
            const configData = await fs.readFile(configPath, 'utf8');
            const projectConfig = JSON.parse(configData);
            
            // Merge with defaults (deep merge for nested objects)
            const mergedConfig = this._deepMergeConfig(defaultConfig, projectConfig);
            
            // Validate and sanitize config
            const validatedConfig = this._validateConfig(mergedConfig);
            
            this.configCache.set(configPath, validatedConfig);
            return validatedConfig;
        } catch (error) {
            if (error.code === 'ENOENT') {
                // Config file doesn't exist, validate defaults
                const validatedDefaults = this._validateConfig(defaultConfig);
                this.configCache.set(configPath, validatedDefaults);
                return validatedDefaults;
            }
            
            console.warn(`Failed to load config from ${configPath}, using validated defaults:`, error.message);
            const validatedDefaults = this._validateConfig(defaultConfig);
            this.configCache.set(configPath, validatedDefaults);
            return validatedDefaults;
        }
    }

    /**
     * Deep merge configuration objects to properly handle nested properties
     * 
     * @private
     * @param {Object} defaultConfig - Default configuration object
     * @param {Object} projectConfig - Project-specific configuration overrides
     * @returns {Object} Merged configuration object
     */
    _deepMergeConfig(defaultConfig, projectConfig) {
        const merged = { ...defaultConfig };
        
        for (const [key, value] of Object.entries(projectConfig)) {
            if (value && typeof value === 'object' && !Array.isArray(value)) {
                // Recursively merge nested objects
                merged[key] = this._deepMergeConfig(merged[key] || {}, value);
            } else {
                // Direct assignment for primitives and arrays
                merged[key] = value;
            }
        }
        
        return merged;
    }

    /**
     * Validate configuration object with comprehensive schema validation
     * 
     * @private
     * @param {ProjectConfig} config - Configuration to validate
     * @returns {ProjectConfig} Sanitized and validated configuration
     * @throws {Error} If configuration has critical validation errors
     */
    _validateConfig(config) {
        const sanitizedConfig = { ...config };
        const warnings = [];
        const errors = [];

        // Validate maxIterations
        if (typeof config.maxIterations !== 'number' || config.maxIterations < 1 || config.maxIterations > 20) {
            if (config.maxIterations !== undefined) {
                warnings.push(`Invalid maxIterations: ${config.maxIterations}, using default: 5`);
            }
            sanitizedConfig.maxIterations = 5;
        }

        // Validate chromePortOffset
        if (typeof config.chromePortOffset !== 'number' || config.chromePortOffset < 0 || config.chromePortOffset > 99) {
            if (config.chromePortOffset !== undefined) {
                warnings.push(`Invalid chromePortOffset: ${config.chromePortOffset}, using default: 0`);
            }
            sanitizedConfig.chromePortOffset = 0;
        }

        // Validate tmuxSessionPrefix
        if (typeof config.tmuxSessionPrefix !== 'string' || 
            !/^[a-zA-Z0-9_-]+$/.test(config.tmuxSessionPrefix) || 
            config.tmuxSessionPrefix.length > 20) {
            if (config.tmuxSessionPrefix !== undefined) {
                warnings.push(`Invalid tmuxSessionPrefix: ${config.tmuxSessionPrefix}, using default: 'e2e'`);
            }
            sanitizedConfig.tmuxSessionPrefix = 'e2e';
        }

        // Validate logRetentionDays
        if (typeof config.logRetentionDays !== 'number' || config.logRetentionDays < 1 || config.logRetentionDays > 90) {
            if (config.logRetentionDays !== undefined) {
                warnings.push(`Invalid logRetentionDays: ${config.logRetentionDays}, using default: 7`);
            }
            sanitizedConfig.logRetentionDays = 7;
        }

        // Validate timeouts object
        if (!config.timeouts || typeof config.timeouts !== 'object') {
            warnings.push('Missing or invalid timeouts object, using defaults');
            sanitizedConfig.timeouts = {
                operatorPhase: 60000,
                claudePhase: 120000,
                chromeConnection: 10000
            };
        } else {
            const timeoutDefaults = {
                operatorPhase: 60000,
                claudePhase: 120000,
                chromeConnection: 10000
            };

            sanitizedConfig.timeouts = { ...timeoutDefaults };

            // Validate operatorPhase timeout
            if (typeof config.timeouts.operatorPhase === 'number' && 
                config.timeouts.operatorPhase >= 30000 && 
                config.timeouts.operatorPhase <= 1800000) {
                sanitizedConfig.timeouts.operatorPhase = config.timeouts.operatorPhase;
            } else if (config.timeouts.operatorPhase !== undefined) {
                warnings.push(`Invalid operatorPhase timeout: ${config.timeouts.operatorPhase}, using default: 60000`);
            }

            // Validate claudePhase timeout
            if (typeof config.timeouts.claudePhase === 'number' && 
                config.timeouts.claudePhase >= 60000 && 
                config.timeouts.claudePhase <= 3600000) {
                sanitizedConfig.timeouts.claudePhase = config.timeouts.claudePhase;
            } else if (config.timeouts.claudePhase !== undefined) {
                warnings.push(`Invalid claudePhase timeout: ${config.timeouts.claudePhase}, using default: 120000`);
            }

            // Validate chromeConnection timeout
            if (typeof config.timeouts.chromeConnection === 'number' && 
                config.timeouts.chromeConnection >= 5000 && 
                config.timeouts.chromeConnection <= 60000) {
                sanitizedConfig.timeouts.chromeConnection = config.timeouts.chromeConnection;
            } else if (config.timeouts.chromeConnection !== undefined) {
                warnings.push(`Invalid chromeConnection timeout: ${config.timeouts.chromeConnection}, using default: 10000`);
            }
        }

        // Validate validation object
        if (config.validation && typeof config.validation === 'object') {
            sanitizedConfig.validation = {
                enforceUniqueness: config.validation.enforceUniqueness !== false,
                validatePorts: config.validation.validatePorts !== false,
                checkTmuxAvailability: config.validation.checkTmuxAvailability !== false,
                customValidations: Array.isArray(config.validation.customValidations) ? 
                    config.validation.customValidations : []
            };
        } else {
            sanitizedConfig.validation = {
                enforceUniqueness: true,
                validatePorts: true,
                checkTmuxAvailability: true,
                customValidations: []
            };
        }

        // Validate logging object
        if (config.logging && typeof config.logging === 'object') {
            sanitizedConfig.logging = {
                level: ['debug', 'info', 'warn', 'error'].includes(config.logging.level) ? 
                    config.logging.level : 'info',
                includeTimestamps: config.logging.includeTimestamps !== false,
                bufferSize: (typeof config.logging.bufferSize === 'number' && 
                    config.logging.bufferSize >= 100 && 
                    config.logging.bufferSize <= 10000) ? 
                    config.logging.bufferSize : 1000,
                flushOnCritical: config.logging.flushOnCritical !== false
            };
        } else {
            sanitizedConfig.logging = {
                level: 'info',
                includeTimestamps: true,
                bufferSize: 1000,
                flushOnCritical: true
            };
        }

        // Validate deployment object
        if (config.deployment && typeof config.deployment === 'object') {
            const validPlatforms = ['heroku', 'vercel', 'aws', 'custom'];
            sanitizedConfig.deployment = {
                autoDetectPlatform: config.deployment.autoDetectPlatform !== false,
                platform: validPlatforms.includes(config.deployment.platform) ? 
                    config.deployment.platform : undefined,
                verifyAfterDeploy: config.deployment.verifyAfterDeploy !== false,
                deploymentTimeout: (typeof config.deployment.deploymentTimeout === 'number' && 
                    config.deployment.deploymentTimeout >= 60000 && 
                    config.deployment.deploymentTimeout <= 1800000) ? 
                    config.deployment.deploymentTimeout : 300000,
                supportedPlatforms: Array.isArray(config.deployment.supportedPlatforms) ? 
                    config.deployment.supportedPlatforms.filter(p => validPlatforms.includes(p)) : 
                    validPlatforms,
                customCommands: (config.deployment.customCommands && 
                    typeof config.deployment.customCommands === 'object') ? 
                    config.deployment.customCommands : {}
            };
        } else {
            sanitizedConfig.deployment = {
                autoDetectPlatform: true,
                verifyAfterDeploy: true,
                deploymentTimeout: 300000,
                supportedPlatforms: ['heroku', 'vercel', 'aws', 'custom'],
                customCommands: {}
            };
        }

        // Log warnings if any
        if (warnings.length > 0) {
            console.warn(`Configuration validation warnings:`);
            warnings.forEach(warning => console.warn(`  - ${warning}`));
        }

        // Throw errors if any critical validation failures
        if (errors.length > 0) {
            throw new Error(`Configuration validation errors: ${errors.join(', ')}`);
        }

        return sanitizedConfig;
    }

    /**
     * Clear configuration cache (useful for testing or config updates)
     * 
     * @param {string} [configPath] - Specific config path to clear, or clear all if not specified
     */
    clearConfigCache(configPath = null) {
        if (configPath) {
            this.configCache.delete(configPath);
        } else {
            this.configCache.clear();
        }
    }

    /**
     * Get configuration schema for validation reference
     * 
     * @returns {Object} Configuration schema object
     */
    getConfigSchema() {
        return {
            maxIterations: { type: 'number', min: 1, max: 20, default: 5 },
            chromePortOffset: { type: 'number', min: 0, max: 99, default: 0 },
            tmuxSessionPrefix: { type: 'string', pattern: '^[a-zA-Z0-9_-]+$', maxLength: 20, default: 'e2e' },
            logRetentionDays: { type: 'number', min: 1, max: 90, default: 7 },
            timeouts: {
                operatorPhase: { type: 'number', min: 30000, max: 1800000, default: 60000 },
                claudePhase: { type: 'number', min: 60000, max: 3600000, default: 120000 },
                chromeConnection: { type: 'number', min: 5000, max: 60000, default: 10000 }
            },
            validation: {
                enforceUniqueness: { type: 'boolean', default: true },
                validatePorts: { type: 'boolean', default: true },
                checkTmuxAvailability: { type: 'boolean', default: true },
                customValidations: { type: 'array', default: [] }
            },
            logging: {
                level: { type: 'string', enum: ['debug', 'info', 'warn', 'error'], default: 'info' },
                includeTimestamps: { type: 'boolean', default: true },
                bufferSize: { type: 'number', min: 100, max: 10000, default: 1000 },
                flushOnCritical: { type: 'boolean', default: true }
            },
            deployment: {
                autoDetectPlatform: { type: 'boolean', default: true },
                platform: { type: 'string', enum: ['heroku', 'vercel', 'aws', 'custom'] },
                verifyAfterDeploy: { type: 'boolean', default: true },
                deploymentTimeout: { type: 'number', min: 60000, max: 1800000, default: 300000 },
                supportedPlatforms: { type: 'array', default: ['heroku', 'vercel', 'aws', 'custom'] },
                customCommands: { type: 'object', default: {} }
            }
        };
    }

    /**
     * Get complete project context with configuration
     * 
     * @returns {Promise<ProjectContext & {config: ProjectConfig, ready: boolean}>} Complete project context
     */
    async getFullProjectContext() {
        try {
            const context = this.detectProjectContext();
            const config = await this.loadProjectConfig(context.configPath);
            
            // Ensure log directory exists
            const logDirCreated = await this.ensureLogDirectory(context.logDirectory);
            
            return {
                ...context,
                config,
                ready: logDirCreated
            };
        } catch (error) {
            throw new Error(`Failed to get full project context: ${error.message}`);
        }
    }

    /**
     * Generate Chrome launch command for project
     * 
     * @param {number} chromePort - Chrome debug port
     * @returns {string} Chrome launch command
     */
    generateChromeCommand(chromePort) {
        const userDataDir = `/tmp/chrome-e2e-${chromePort}`;
        return [
            'google-chrome',
            `--remote-debugging-port=${chromePort}`,
            `--user-data-dir=${userDataDir}`,
            '--no-first-run',
            '--no-default-browser-check',
            '--disable-extensions',
            '--disable-background-timer-throttling',
            '--disable-background-networking',
            '--disable-client-side-phishing-detection',
            '--disable-sync',
            '--metrics-recording-only',
            '--no-report-upload',
            '--safebrowsing-disable-auto-update',
            '--enable-automation',
            '--password-store=basic',
            '--use-mock-keychain'
        ].join(' ');
    }
}

export default ProjectManager;

// Example usage for testing
if (import.meta.url === `file://${process.argv[1]}`) {
    try {
        const manager = new ProjectManager();
        const context = await manager.getFullProjectContext();
        console.log('Project Context:', JSON.stringify(context, null, 2));
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}
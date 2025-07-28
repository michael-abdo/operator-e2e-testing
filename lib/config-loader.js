/**
 * Configuration Loader for Queue Management
 * Handles loading and merging configuration files based on environment
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class ConfigLoader {
    constructor(options = {}) {
        this.options = {
            configDir: options.configDir || join(__dirname, '../config'),
            environment: options.environment || process.env.NODE_ENV || 'development',
            enableOverrides: options.enableOverrides !== false,
            validateConfig: options.validateConfig !== false
        };
        
        this.loadedConfig = null;
        this.configSources = [];
    }
    
    /**
     * Load configuration with environment-specific overrides
     */
    loadConfig(configOverrides = {}) {
        try {
            // Base configuration
            const baseConfig = this.loadBaseConfig();
            
            // Environment-specific configuration
            const envConfig = this.loadEnvironmentConfig();
            
            // Queue management specific configuration
            const queueConfig = this.loadQueueManagementConfig();
            
            // Project-specific configuration (if available)
            const projectConfig = this.loadProjectConfig();
            
            // Merge configurations in order of precedence
            this.loadedConfig = this.mergeConfigs([
                baseConfig,
                queueConfig,
                envConfig,
                projectConfig,
                configOverrides
            ]);
            
            // Validate final configuration
            if (this.options.validateConfig) {
                this.validateConfiguration(this.loadedConfig);
            }
            
            this.logConfigSources();
            
            return this.loadedConfig;
            
        } catch (error) {
            throw new Error(`Configuration loading failed: ${error.message}`);
        }
    }
    
    /**
     * Load base E2E configuration
     */
    loadBaseConfig() {
        const configPath = join(this.options.configDir, 'e2e-config.json');
        return this.loadConfigFile(configPath, 'base e2e config');
    }
    
    /**
     * Load environment-specific configuration
     */
    loadEnvironmentConfig() {
        const envConfigPath = join(
            this.options.configDir, 
            `queue-management-${this.options.environment}.json`
        );
        
        if (existsSync(envConfigPath)) {
            return this.loadConfigFile(envConfigPath, `${this.options.environment} environment config`);
        }
        
        console.warn(`Environment config not found: ${envConfigPath}`);
        return {};
    }
    
    /**
     * Load general queue management configuration
     */
    loadQueueManagementConfig() {
        const queueConfigPath = join(this.options.configDir, 'queue-management.json');
        
        if (existsSync(queueConfigPath)) {
            return this.loadConfigFile(queueConfigPath, 'queue management config');
        }
        
        return {};
    }
    
    /**
     * Load project-specific configuration
     */
    loadProjectConfig() {
        const projectId = process.env.PROJECT_ID || process.env.E2E_PROJECT_ID;
        
        if (!projectId) {
            return {};
        }
        
        const projectConfigPath = join(
            this.options.configDir, 
            'project-configs', 
            `${projectId}.json`
        );
        
        if (existsSync(projectConfigPath)) {
            return this.loadConfigFile(projectConfigPath, `project ${projectId} config`);
        }
        
        return {};
    }
    
    /**
     * Load a single configuration file
     */
    loadConfigFile(filePath, description) {
        try {
            if (!existsSync(filePath)) {
                console.warn(`Config file not found: ${filePath}`);
                return {};
            }
            
            const configContent = readFileSync(filePath, 'utf8');
            const config = JSON.parse(configContent);
            
            this.configSources.push({
                path: filePath,
                description,
                size: Object.keys(config).length
            });
            
            return config;
            
        } catch (error) {
            throw new Error(`Failed to load ${description} from ${filePath}: ${error.message}`);
        }
    }
    
    /**
     * Merge multiple configuration objects
     */
    mergeConfigs(configs) {
        const result = {};
        
        for (const config of configs) {
            if (config && typeof config === 'object') {
                this.deepMerge(result, config);
            }
        }
        
        return result;
    }
    
    /**
     * Deep merge two objects
     */
    deepMerge(target, source) {
        for (const key in source) {
            if (source.hasOwnProperty(key)) {
                if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                    if (!target[key] || typeof target[key] !== 'object') {
                        target[key] = {};
                    }
                    this.deepMerge(target[key], source[key]);
                } else {
                    target[key] = source[key];
                }
            }
        }
    }
    
    /**
     * Validate configuration structure and values
     */
    validateConfiguration(config) {
        const validationErrors = [];
        
        // Validate queue management configuration
        if (config.queueManagement) {
            const qm = config.queueManagement;
            
            // Validate thresholds
            if (qm.autoCleanup && qm.autoCleanup.threshold) {
                if (qm.autoCleanup.threshold < 1 || qm.autoCleanup.threshold > 100) {
                    validationErrors.push('autoCleanup.threshold must be between 1 and 100');
                }
                
                if (qm.autoCleanup.preserveLatest >= qm.autoCleanup.threshold) {
                    validationErrors.push('preserveLatest must be less than cleanup threshold');
                }
            }
            
            // Validate intervals
            if (qm.autoCleanup && qm.autoCleanup.interval < 1) {
                validationErrors.push('autoCleanup.interval must be at least 1');
            }
            
            // Validate strategies
            if (qm.autoCleanup && qm.autoCleanup.strategy) {
                const validStrategies = ['smart', 'age', 'pattern', 'emergency'];
                if (!validStrategies.includes(qm.autoCleanup.strategy)) {
                    validationErrors.push(`Invalid cleanup strategy: ${qm.autoCleanup.strategy}`);
                }
            }
            
            // Validate retry configuration
            if (qm.advanced && qm.advanced.maxRetries) {
                if (qm.advanced.maxRetries < 0 || qm.advanced.maxRetries > 10) {
                    validationErrors.push('maxRetries must be between 0 and 10');
                }
            }
        }
        
        // Validate timeouts
        if (config.timeouts) {
            Object.entries(config.timeouts).forEach(([key, value]) => {
                if (value < 1000 || value > 3600000) { // 1 second to 1 hour
                    validationErrors.push(`Timeout ${key} must be between 1000ms and 3600000ms`);
                }
            });
        }
        
        if (validationErrors.length > 0) {
            throw new Error(`Configuration validation failed:\n${validationErrors.join('\n')}`);
        }
    }
    
    /**
     * Get queue management configuration specifically
     */
    getQueueManagementConfig() {
        if (!this.loadedConfig) {
            this.loadConfig();
        }
        
        return this.loadedConfig.queueManagement || {};
    }
    
    /**
     * Get environment-specific settings
     */
    getEnvironmentSettings() {
        return {
            environment: this.options.environment,
            isDevelopment: this.options.environment === 'development',
            isProduction: this.options.environment === 'production',
            isTest: this.options.environment === 'test'
        };
    }
    
    /**
     * Get configuration value by path
     */
    get(path, defaultValue = undefined) {
        if (!this.loadedConfig) {
            this.loadConfig();
        }
        
        const keys = path.split('.');
        let current = this.loadedConfig;
        
        for (const key of keys) {
            if (current && typeof current === 'object' && key in current) {
                current = current[key];
            } else {
                return defaultValue;
            }
        }
        
        return current;
    }
    
    /**
     * Check if a feature is enabled
     */
    isEnabled(featurePath) {
        return Boolean(this.get(featurePath, false));
    }
    
    /**
     * Export configuration to file
     */
    exportConfig(outputPath) {
        if (!this.loadedConfig) {
            this.loadConfig();
        }
        
        const fs = require('fs');
        fs.writeFileSync(outputPath, JSON.stringify(this.loadedConfig, null, 2));
    }
    
    /**
     * Log configuration sources for debugging
     */
    logConfigSources() {
        console.log('📋 Configuration loaded from:');
        this.configSources.forEach(source => {
            console.log(`   ${source.description}: ${source.path} (${source.size} keys)`);
        });
        console.log(`   Environment: ${this.options.environment}`);
        console.log(`   Queue Management Enabled: ${this.get('queueManagement.enabled', false)}`);
    }
    
    /**
     * Get configuration summary for logging
     */
    getConfigSummary() {
        if (!this.loadedConfig) {
            this.loadConfig();
        }
        
        const queueConfig = this.getQueueManagementConfig();
        
        return {
            environment: this.options.environment,
            queueManagement: {
                enabled: queueConfig.enabled || false,
                strategy: queueConfig.autoCleanup?.strategy || 'none',
                threshold: queueConfig.autoCleanup?.threshold || 'none',
                preserveLatest: queueConfig.autoCleanup?.preserveLatest || 'none'
            },
            sources: this.configSources.length,
            totalKeys: Object.keys(this.loadedConfig).length
        };
    }
}

/**
 * Create a singleton instance for global use
 */
export const globalConfigLoader = new ConfigLoader();

/**
 * Convenience function to load configuration
 */
export function loadQueueConfig(environment = null, overrides = {}) {
    const loader = new ConfigLoader({ 
        environment: environment || process.env.NODE_ENV || 'development' 
    });
    return loader.loadConfig(overrides);
}

export default ConfigLoader;
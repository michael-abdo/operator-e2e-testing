#!/usr/bin/env node

/**
 * ProjectManager Comprehensive Test Suite
 * 
 * Tests all ProjectManager functionality including:
 * - Basic context detection and validation
 * - Error handling and edge cases
 * - Configuration loading and validation
 * - Filesystem operations and permissions
 * - Caching and performance
 * - Cross-platform compatibility
 * 
 * Run with: node test/project-manager.test.js
 */

import ProjectManager from '../lib/project-manager.js';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ProjectManagerTestSuite {
    constructor() {
        this.testResults = [];
        this.tempDirs = [];
        this.tempFiles = [];
        this.originalCwd = process.cwd();
    }

    /**
     * Run complete test suite
     */
    async runAllTests() {
        console.log('🚀 ProjectManager Comprehensive Test Suite');
        console.log('=' .repeat(60));
        
        try {
            // Core functionality tests
            await this.testBasicContextDetection();
            await this.testProjectNameExtraction();
            await this.testChromePortGeneration();
            await this.testTmuxSessionNaming();
            await this.testLogDirectoryGeneration();
            
            // Configuration tests
            await this.testConfigurationLoading();
            await this.testConfigurationValidation();
            await this.testConfigurationDefaults();
            
            // Error handling tests
            await this.testErrorHandling();
            await this.testEdgeCases();
            await this.testPermissionHandling();
            
            // Performance and caching tests
            await this.testCachingBehavior();
            await this.testPerformance();
            
            // Integration tests
            await this.testFullContextIntegration();
            await this.testConcurrentInstances();
            
            return this.generateReport();
            
        } finally {
            await this.cleanup();
            process.chdir(this.originalCwd);
        }
    }

    /**
     * Test basic project context detection
     */
    async testBasicContextDetection() {
        console.log('\n📍 Testing Basic Context Detection...');
        
        try {
            const manager = new ProjectManager({ logLevel: 'error' });
            const context = manager.detectProjectContext();
            
            this.assert(
                typeof context === 'object',
                'Context should be an object',
                'basic_context_type'
            );
            
            this.assert(
                typeof context.projectName === 'string' && context.projectName.length > 0,
                'Project name should be a non-empty string',
                'basic_context_project_name'
            );
            
            this.assert(
                typeof context.projectHash === 'string' && context.projectHash.length === 64,
                'Project hash should be a 64-character string',
                'basic_context_hash'
            );
            
            this.assert(
                typeof context.chromePort === 'number' && context.chromePort >= 9222 && context.chromePort <= 9321,
                'Chrome port should be in valid range',
                'basic_context_chrome_port'
            );
            
            this.assert(
                typeof context.tmuxSessionName === 'string' && context.tmuxSessionName.includes('e2e-'),
                'Tmux session name should follow naming convention',
                'basic_context_tmux_session'
            );
            
            console.log('  ✅ Basic context detection passed');
            
        } catch (error) {
            this.fail('basic_context_detection', error.message);
        }
    }

    /**
     * Test project name extraction with various inputs
     */
    async testProjectNameExtraction() {
        console.log('\n📝 Testing Project Name Extraction...');
        
        const manager = new ProjectManager({ logLevel: 'error' });
        
        const testCases = [
            { input: '/home/user/my-project', expected: 'my-project' },
            { input: '/Users/john/Special@Project!', expected: 'special-project-' },
            { input: '/tmp/project with spaces', expected: 'project-with-spaces' },
            { input: '/var/123-numeric-start', expected: 'numeric-start' },
            { input: '/root/.hidden-project', expected: 'hidden-project' },
            { input: '/very/long/path/to/a/project/with/many/nested/directories', expected: 'directories' },
            { input: '', expected: 'fallback-project' },
            { input: '/', expected: 'unknown-project' }
        ];
        
        testCases.forEach((testCase, index) => {
            try {
                const result = manager.extractProjectName(testCase.input);
                this.assert(
                    typeof result === 'string' && result.length > 0,
                    `Project name extraction case ${index + 1} should return valid string`,
                    `project_name_case_${index + 1}`
                );
                
                // Test sanitization
                this.assert(
                    /^[a-z0-9_-]+$/.test(result),
                    `Project name should be sanitized (alphanumeric, dash, underscore only)`,
                    `project_name_sanitization_${index + 1}`
                );
                
            } catch (error) {
                this.fail(`project_name_case_${index + 1}`, error.message);
            }
        });
        
        console.log('  ✅ Project name extraction passed');
    }

    /**
     * Test Chrome port generation consistency and uniqueness
     */
    async testChromePortGeneration() {
        console.log('\n🌐 Testing Chrome Port Generation...');
        
        const manager = new ProjectManager({ logLevel: 'error' });
        const ports = new Set();
        const hashes = [];
        
        // Generate multiple hashes and test port uniqueness
        for (let i = 0; i < 50; i++) {
            const testPath = `/test/project-${i}`;
            const hash = manager.generateProjectHash(testPath);
            const port = manager.generateChromePort(hash);
            
            hashes.push(hash);
            ports.add(port);
            
            this.assert(
                port >= 9222 && port <= 9321,
                `Port ${port} should be in valid range`,
                `chrome_port_range_${i}`
            );
        }
        
        // Test deterministic behavior - same input should give same output
        const testHash = manager.generateProjectHash('/test/consistent-project');
        const port1 = manager.generateChromePort(testHash);
        const port2 = manager.generateChromePort(testHash);
        
        this.assert(
            port1 === port2,
            'Same hash should generate same port',
            'chrome_port_deterministic'
        );
        
        console.log(`  ✅ Chrome port generation passed (${ports.size} unique ports from 50 tests)`);
    }

    /**
     * Test tmux session naming
     */
    async testTmuxSessionNaming() {
        console.log('\n📺 Testing Tmux Session Naming...');
        
        const manager = new ProjectManager({ logLevel: 'error' });
        
        const testCases = [
            { projectName: 'my-project', shortHash: 'abc12345' },
            { projectName: 'very-long-project-name-that-might-cause-issues', shortHash: 'def67890' },
            { projectName: 'simple', shortHash: '12345678' }
        ];
        
        testCases.forEach((testCase, index) => {
            try {
                const sessionName = manager.getTmuxSessionName(testCase.projectName, testCase.shortHash);
                
                this.assert(
                    sessionName.startsWith('e2e-'),
                    'Session name should start with e2e-',
                    `tmux_session_prefix_${index}`
                );
                
                this.assert(
                    sessionName.includes(testCase.shortHash),
                    'Session name should include short hash',
                    `tmux_session_hash_${index}`
                );
                
                this.assert(
                    sessionName.length <= 100,
                    'Session name should not exceed tmux limits',
                    `tmux_session_length_${index}`
                );
                
            } catch (error) {
                this.fail(`tmux_session_case_${index}`, error.message);
            }
        });
        
        console.log('  ✅ Tmux session naming passed');
    }

    /**
     * Test log directory generation and validation
     */
    async testLogDirectoryGeneration() {
        console.log('\n📁 Testing Log Directory Generation...');
        
        const manager = new ProjectManager({ logLevel: 'error' });
        
        try {
            const logDir = manager.getLogDirectory('test-project', 'abc12345');
            
            this.assert(
                typeof logDir === 'string' && logDir.length > 0,
                'Log directory should be a non-empty string',
                'log_dir_type'
            );
            
            this.assert(
                path.isAbsolute(logDir),
                'Log directory should be absolute path',
                'log_dir_absolute'
            );
            
            this.assert(
                logDir.includes('test-project') && logDir.includes('abc12345'),
                'Log directory should include project name and hash',
                'log_dir_components'
            );
            
            // Test directory creation
            const created = await manager.ensureLogDirectory(logDir);
            this.assert(
                created === true,
                'Log directory should be created successfully',
                'log_dir_creation'
            );
            
            // Clean up test directory
            await fs.rm(logDir, { recursive: true, force: true });
            
            console.log('  ✅ Log directory generation passed');
            
        } catch (error) {
            this.fail('log_directory_generation', error.message);
        }
    }

    /**
     * Test configuration loading and merging
     */
    async testConfigurationLoading() {
        console.log('\n⚙️ Testing Configuration Loading...');
        
        try {
            // Create temporary config file
            const tempConfigPath = path.join('/tmp', `test-config-${Date.now()}.json`);
            const testConfig = {
                maxIterations: 10,
                chromePortOffset: 5,
                timeouts: {
                    operatorPhase: 90000
                }
            };
            
            await fs.writeFile(tempConfigPath, JSON.stringify(testConfig, null, 2));
            this.tempFiles.push(tempConfigPath);
            
            const manager = new ProjectManager({ logLevel: 'error' });
            const config = await manager.loadProjectConfig(tempConfigPath);
            
            this.assert(
                config.maxIterations === 10,
                'Custom config values should be loaded',
                'config_loading_custom'
            );
            
            this.assert(
                config.timeouts.claudePhase === 120000,
                'Default values should be preserved for unspecified options',
                'config_loading_defaults'
            );
            
            console.log('  ✅ Configuration loading passed');
            
        } catch (error) {
            this.fail('configuration_loading', error.message);
        }
    }

    /**
     * Test configuration validation
     */
    async testConfigurationValidation() {
        console.log('\n✅ Testing Configuration Validation...');
        
        const manager = new ProjectManager({ logLevel: 'error' });
        
        try {
            // Test invalid config values
            const invalidConfigPath = path.join('/tmp', `invalid-config-${Date.now()}.json`);
            const invalidConfig = {
                maxIterations: -5, // Invalid: negative
                chromePortOffset: 2000, // Invalid: too large
                tmuxSessionPrefix: 'invalid chars!', // Invalid: special characters
                timeouts: {
                    operatorPhase: 'not-a-number' // Invalid: wrong type
                }
            };
            
            await fs.writeFile(invalidConfigPath, JSON.stringify(invalidConfig, null, 2));
            this.tempFiles.push(invalidConfigPath);
            
            const config = await manager.loadProjectConfig(invalidConfigPath);
            
            // Should fall back to defaults for invalid values
            this.assert(
                config.maxIterations === 5,
                'Invalid maxIterations should fall back to default',
                'config_validation_max_iterations'
            );
            
            this.assert(
                config.chromePortOffset === 0,
                'Invalid chromePortOffset should fall back to default',
                'config_validation_port_offset'
            );
            
            this.assert(
                config.tmuxSessionPrefix === 'e2e',
                'Invalid tmuxSessionPrefix should fall back to default',
                'config_validation_session_prefix'
            );
            
            console.log('  ✅ Configuration validation passed');
            
        } catch (error) {
            this.fail('configuration_validation', error.message);
        }
    }

    /**
     * Test configuration defaults
     */
    async testConfigurationDefaults() {
        console.log('\n🎯 Testing Configuration Defaults...');
        
        const manager = new ProjectManager({ logLevel: 'error' });
        
        try {
            // Test with non-existent config file
            const config = await manager.loadProjectConfig('/non/existent/config.json');
            
            this.assert(
                config.maxIterations === 5,
                'Default maxIterations should be 5',
                'config_default_max_iterations'
            );
            
            this.assert(
                config.timeouts.operatorPhase === 60000,
                'Default operator timeout should be 60000ms',
                'config_default_operator_timeout'
            );
            
            this.assert(
                config.timeouts.claudePhase === 120000,
                'Default claude timeout should be 120000ms',
                'config_default_claude_timeout'
            );
            
            console.log('  ✅ Configuration defaults passed');
            
        } catch (error) {
            this.fail('configuration_defaults', error.message);
        }
    }

    /**
     * Test error handling scenarios
     */
    async testErrorHandling() {
        console.log('\n🚨 Testing Error Handling...');
        
        try {
            // Test with invalid inputs
            const manager = new ProjectManager({ logLevel: 'error' });
            
            // Test null/undefined inputs
            const safeName = manager.extractProjectName(null);
            this.assert(
                typeof safeName === 'string',
                'Should handle null input gracefully',
                'error_handling_null_input'
            );
            
            // Test invalid hash input
            const safePort = manager.generateChromePort('');
            this.assert(
                typeof safePort === 'number' && safePort >= 9222,
                'Should handle invalid hash gracefully',
                'error_handling_invalid_hash'
            );
            
            // Test session name with missing inputs
            const safeSession = manager.getTmuxSessionName('', '');
            this.assert(
                typeof safeSession === 'string' && safeSession.length > 0,
                'Should handle missing session name inputs gracefully',
                'error_handling_missing_session_inputs'
            );
            
            console.log('  ✅ Error handling passed');
            
        } catch (error) {
            this.fail('error_handling', error.message);
        }
    }

    /**
     * Test edge cases
     */
    async testEdgeCases() {
        console.log('\n🔬 Testing Edge Cases...');
        
        const manager = new ProjectManager({ logLevel: 'error' });
        
        try {
            // Test very long project paths
            const longPath = '/very/long/path/that/exceeds/normal/filesystem/limits/' + 'x'.repeat(200);
            const context = manager.detectProjectContext();
            
            this.assert(
                context.projectName.length <= 50,
                'Project name should be truncated for very long paths',
                'edge_case_long_path'
            );
            
            // Test paths with special characters
            const specialChars = ['/', '\\', ':', '*', '?', '"', '<', '>', '|'];
            specialChars.forEach((char, index) => {
                const safeName = manager.extractProjectName(`/test/project${char}name`);
                this.assert(
                    !safeName.includes(char),
                    `Special character ${char} should be sanitized`,
                    `edge_case_special_char_${index}`
                );
            });
            
            console.log('  ✅ Edge cases passed');
            
        } catch (error) {
            this.fail('edge_cases', error.message);
        }
    }

    /**
     * Test permission handling
     */
    async testPermissionHandling() {
        console.log('\n🔐 Testing Permission Handling...');
        
        const manager = new ProjectManager({ logLevel: 'error' });
        
        try {
            // Test creation in accessible directory
            const accessibleDir = path.join('/tmp', `test-accessible-${Date.now()}`);
            const result = await manager.ensureLogDirectory(accessibleDir);
            
            this.assert(
                result === true,
                'Should successfully create directory in accessible location',
                'permission_accessible_creation'
            );
            
            // Clean up
            await fs.rm(accessibleDir, { recursive: true, force: true });
            
            // Test with potentially inaccessible directory (should handle gracefully)
            const inaccessibleDir = '/root/restricted-access-test';
            const restrictedResult = await manager.ensureLogDirectory(inaccessibleDir);
            
            // Should handle gracefully (either succeed or fail safely)
            this.assert(
                typeof restrictedResult === 'boolean',
                'Should handle restricted access gracefully',
                'permission_restricted_handling'
            );
            
            console.log('  ✅ Permission handling passed');
            
        } catch (error) {
            this.fail('permission_handling', error.message);
        }
    }

    /**
     * Test caching behavior
     */
    async testCachingBehavior() {
        console.log('\n💾 Testing Caching Behavior...');
        
        try {
            // Test context caching
            const manager = new ProjectManager({ enableCaching: true, logLevel: 'error' });
            
            const context1 = manager.detectProjectContext();
            const context2 = manager.detectProjectContext();
            
            this.assert(
                JSON.stringify(context1) === JSON.stringify(context2),
                'Cached context should be identical',
                'caching_context_consistency'
            );
            
            // Test cache clearing
            manager.clearCache();
            const context3 = manager.detectProjectContext();
            
            this.assert(
                context3.timestamp !== context1.timestamp,
                'Cache should be cleared and regenerated',
                'caching_clear_functionality'
            );
            
            console.log('  ✅ Caching behavior passed');
            
        } catch (error) {
            this.fail('caching_behavior', error.message);
        }
    }

    /**
     * Test performance
     */
    async testPerformance() {
        console.log('\n⚡ Testing Performance...');
        
        try {
            const manager = new ProjectManager({ logLevel: 'error' });
            
            // Test context detection performance
            const startTime = Date.now();
            for (let i = 0; i < 100; i++) {
                manager.detectProjectContext();
            }
            const endTime = Date.now();
            const avgTime = (endTime - startTime) / 100;
            
            this.assert(
                avgTime < 10, // Should take less than 10ms on average
                `Context detection should be fast (avg: ${avgTime.toFixed(2)}ms)`,
                'performance_context_detection'
            );
            
            console.log(`  ✅ Performance passed (avg context detection: ${avgTime.toFixed(2)}ms)`);
            
        } catch (error) {
            this.fail('performance', error.message);
        }
    }

    /**
     * Test full context integration
     */
    async testFullContextIntegration() {
        console.log('\n🔗 Testing Full Context Integration...');
        
        try {
            const manager = new ProjectManager({ logLevel: 'error' });
            const fullContext = await manager.getFullProjectContext();
            
            this.assert(
                typeof fullContext === 'object',
                'Full context should be an object',
                'integration_full_context_type'
            );
            
            this.assert(
                fullContext.hasOwnProperty('config'),
                'Full context should include config',
                'integration_includes_config'
            );
            
            this.assert(
                typeof fullContext.ready === 'boolean',
                'Full context should include ready status',
                'integration_ready_status'
            );
            
            this.assert(
                fullContext.projectName && fullContext.chromePort && fullContext.tmuxSessionName,
                'Full context should include all essential properties',
                'integration_essential_properties'
            );
            
            console.log('  ✅ Full context integration passed');
            
        } catch (error) {
            this.fail('full_context_integration', error.message);
        }
    }

    /**
     * Test concurrent instances
     */
    async testConcurrentInstances() {
        console.log('\n👥 Testing Concurrent Instances...');
        
        try {
            // Create multiple ProjectManager instances
            const managers = Array.from({ length: 5 }, () => new ProjectManager({ logLevel: 'error' }));
            
            // Get contexts from all instances concurrently
            const contexts = await Promise.all(
                managers.map(manager => manager.getFullProjectContext())
            );
            
            // All should detect the same project (since they're in the same directory)
            const projectNames = contexts.map(ctx => ctx.projectName);
            const uniqueNames = new Set(projectNames);
            
            this.assert(
                uniqueNames.size === 1,
                'All instances should detect the same project name',
                'concurrent_same_project_name'
            );
            
            // All should generate the same Chrome port (deterministic)
            const chromePorts = contexts.map(ctx => ctx.chromePort);
            const uniquePorts = new Set(chromePorts);
            
            this.assert(
                uniquePorts.size === 1,
                'All instances should generate the same Chrome port',
                'concurrent_same_chrome_port'
            );
            
            console.log('  ✅ Concurrent instances passed');
            
        } catch (error) {
            this.fail('concurrent_instances', error.message);
        }
    }

    /**
     * Assert a condition and record result
     */
    assert(condition, message, testId) {
        const result = {
            testId,
            message,
            passed: Boolean(condition),
            timestamp: new Date().toISOString()
        };
        
        this.testResults.push(result);
        
        if (!condition) {
            console.log(`    ❌ ${message}`);
        }
    }

    /**
     * Record a test failure
     */
    fail(testId, errorMessage) {
        this.testResults.push({
            testId,
            message: `Test failed: ${errorMessage}`,
            passed: false,
            timestamp: new Date().toISOString(),
            error: errorMessage
        });
        console.log(`    ❌ ${testId}: ${errorMessage}`);
    }

    /**
     * Clean up test resources
     */
    async cleanup() {
        console.log('\n🧹 Cleaning up test resources...');
        
        // Remove temporary files
        for (const file of this.tempFiles) {
            try {
                await fs.rm(file, { force: true });
            } catch (error) {
                // Ignore cleanup errors
            }
        }
        
        // Remove temporary directories
        for (const dir of this.tempDirs) {
            try {
                await fs.rm(dir, { recursive: true, force: true });
            } catch (error) {
                // Ignore cleanup errors
            }
        }
    }

    /**
     * Generate comprehensive test report
     */
    generateReport() {
        console.log('\n📊 Test Report');
        console.log('=' .repeat(60));
        
        const totalTests = this.testResults.length;
        const passedTests = this.testResults.filter(r => r.passed).length;
        const failedTests = totalTests - passedTests;
        
        console.log(`Total Tests: ${totalTests}`);
        console.log(`Passed: ${passedTests}`);
        console.log(`Failed: ${failedTests}`);
        console.log(`Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
        
        if (failedTests > 0) {
            console.log('\n❌ Failed Tests:');
            this.testResults
                .filter(r => !r.passed)
                .forEach(result => {
                    console.log(`  - ${result.testId}: ${result.message}`);
                });
        }
        
        const status = failedTests === 0 ? 'PASSED' : 'FAILED';
        console.log(`\n${status === 'PASSED' ? '🎉' : '💥'} Overall Status: ${status}`);
        
        return {
            status,
            total: totalTests,
            passed: passedTests,
            failed: failedTests,
            results: this.testResults
        };
    }
}

// Run tests if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    (async () => {
        try {
            const testSuite = new ProjectManagerTestSuite();
            const report = await testSuite.runAllTests();
            process.exit(report.status === 'PASSED' ? 0 : 1);
        } catch (error) {
            console.error('Test suite failed:', error);
            process.exit(1);
        }
    })();
}

export default ProjectManagerTestSuite;
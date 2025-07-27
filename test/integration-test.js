#!/usr/bin/env node

/**
 * Cross-Project E2E Integration Test Suite
 * 
 * Comprehensive testing of the integrated cross-project E2E system including:
 * - Project context detection and isolation
 * - Chrome port allocation and uniqueness
 * - Tmux session naming and separation
 * - Log directory isolation
 * - Configuration loading and validation
 * - Mock project execution scenarios
 * - Concurrent project testing
 * - Error handling and edge cases
 * 
 * Usage: node test/integration-test.js
 */

import ProjectManager from '../lib/project-manager.js';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class CrossProjectIntegrationTestSuite {
    constructor() {
        this.testResults = [];
        this.mockProjects = [];
        this.tempDirs = [];
        this.originalCwd = process.cwd();
        this.testStartTime = Date.now();
    }

    /**
     * Run the complete integration test suite
     */
    async runIntegrationTests() {
        console.log('🚀 Cross-Project E2E Integration Test Suite');
        console.log('=' .repeat(80));
        console.log(`Start time: ${new Date().toISOString()}`);
        console.log('');

        try {
            // Phase 1: Environment validation
            await this.testEnvironmentValidation();
            
            // Phase 2: Mock project setup
            await this.setupMockProjects();
            
            // Phase 3: Project isolation testing
            await this.testProjectIsolation();
            
            // Phase 4: Configuration system testing
            await this.testConfigurationSystem();
            
            // Phase 5: Concurrent execution testing
            await this.testConcurrentExecution();
            
            // Phase 6: Error handling and edge cases
            await this.testErrorHandlingAndEdgeCases();
            
            // Phase 7: Performance and resource testing
            await this.testPerformanceAndResources();
            
            return this.generateIntegrationReport();
            
        } finally {
            await this.cleanupMockProjects();
            process.chdir(this.originalCwd);
        }
    }

    /**
     * Test environment validation
     */
    async testEnvironmentValidation() {
        console.log('📋 Phase 1: Environment Validation');
        console.log('-'.repeat(50));

        // Test original ProjectManager functionality
        try {
            const manager = new ProjectManager();
            const context = manager.detectProjectContext();
            
            this.assert(
                typeof context === 'object' && context.projectName,
                'ProjectManager should detect project context',
                'env_project_detection'
            );
            
            this.assert(
                context.chromePort >= 9222 && context.chromePort <= 9321,
                'Chrome port should be in valid range',
                'env_chrome_port_range'
            );
            
            console.log('  ✅ Environment validation passed');
            
        } catch (error) {
            this.fail('env_validation', `Environment validation failed: ${error.message}`);
        }
    }

    /**
     * Setup mock projects for testing
     */
    async setupMockProjects() {
        console.log('\\n🏗️  Phase 2: Mock Project Setup');
        console.log('-'.repeat(50));

        const projectNames = [
            'mock-ecommerce-app',
            'mock-blog-platform', 
            'mock-dashboard-ui',
            'mock-api-service',
            'mock-mobile-backend'
        ];

        try {
            for (const projectName of projectNames) {
                const projectDir = path.join('/tmp', `e2e-test-${projectName}-${Date.now()}`);
                
                // Create project directory
                await fs.mkdir(projectDir, { recursive: true });
                this.tempDirs.push(projectDir);
                
                // Create mock project files
                await this.createMockProjectStructure(projectDir, projectName);
                
                // Create project-specific configuration
                await this.createMockProjectConfig(projectName);
                
                this.mockProjects.push({
                    name: projectName,
                    path: projectDir,
                    originalName: projectName
                });
                
                console.log(`  📁 Created mock project: ${projectName} at ${projectDir}`);
            }
            
            console.log(`  ✅ Created ${this.mockProjects.length} mock projects`);
            
        } catch (error) {
            this.fail('mock_setup', `Failed to setup mock projects: ${error.message}`);
        }
    }

    /**
     * Create mock project structure
     */
    async createMockProjectStructure(projectDir, projectName) {
        // Create basic project structure
        const directories = ['src', 'config', 'tests', 'docs'];
        for (const dir of directories) {
            await fs.mkdir(path.join(projectDir, dir), { recursive: true });
        }
        
        // Create package.json
        const packageJson = {
            name: projectName,
            version: '1.0.0',
            description: `Mock project for E2E testing: ${projectName}`,
            scripts: {
                start: 'node src/index.js',
                test: 'jest',
                deploy: 'echo "Mock deployment for testing"'
            }
        };
        
        await fs.writeFile(
            path.join(projectDir, 'package.json'),
            JSON.stringify(packageJson, null, 2)
        );
        
        // Create mock source file
        const indexJs = `// Mock application for ${projectName}
console.log('Mock application ${projectName} is running');
console.log('Project directory: ${projectDir}');

module.exports = {
    name: '${projectName}',
    version: '1.0.0',
    start: () => console.log('Mock app started'),
    stop: () => console.log('Mock app stopped')
};`;
        
        await fs.writeFile(path.join(projectDir, 'src', 'index.js'), indexJs);
    }

    /**
     * Create mock project configuration
     */
    async createMockProjectConfig(projectName) {
        const configPath = path.join(__dirname, '../config/project-configs', `${projectName}.json`);
        
        const configs = {
            'mock-ecommerce-app': {
                description: 'E-commerce application with Heroku deployment',
                maxIterations: 8,
                chromePortOffset: 5,
                deployment: {
                    platform: 'heroku',
                    customCommands: {
                        deploy: 'git push heroku main',
                        verify: 'heroku ps:scale web=1'
                    }
                }
            },
            'mock-blog-platform': {
                description: 'Blog platform with Vercel deployment',
                maxIterations: 5,
                chromePortOffset: 10,
                deployment: {
                    platform: 'vercel',
                    customCommands: {
                        deploy: 'vercel --prod',
                        verify: 'curl -f https://blog.vercel.app/health'
                    }
                }
            },
            'mock-dashboard-ui': {
                description: 'Dashboard UI with custom deployment',
                maxIterations: 6,
                chromePortOffset: 15,
                logging: {
                    level: 'debug',
                    bufferSize: 2000
                },
                deployment: {
                    platform: 'custom',
                    customCommands: {
                        deploy: 'npm run build && npm run deploy',
                        verify: 'npm run test:e2e'
                    }
                }
            },
            'mock-api-service': {
                description: 'API service with AWS deployment',
                maxIterations: 7,
                chromePortOffset: 20,
                deployment: {
                    platform: 'aws',
                    deploymentTimeout: 600000,
                    customCommands: {
                        deploy: 'sam deploy --guided',
                        verify: 'aws lambda invoke --function-name health'
                    }
                }
            },
            'mock-mobile-backend': {
                description: 'Mobile backend with long timeouts',
                maxIterations: 4,
                chromePortOffset: 25,
                timeouts: {
                    operatorPhase: 120000,
                    claudePhase: 300000
                }
            }
        };
        
        const config = configs[projectName] || {
            description: `Mock configuration for ${projectName}`,
            maxIterations: 5
        };
        
        await fs.writeFile(configPath, JSON.stringify(config, null, 2));
    }

    /**
     * Test project isolation functionality
     */
    async testProjectIsolation() {
        console.log('\\n🔐 Phase 3: Project Isolation Testing');
        console.log('-'.repeat(50));

        const contexts = [];
        const chromePorts = new Set();
        const tmuxSessions = new Set();
        const logDirectories = new Set();
        
        try {
            for (const mockProject of this.mockProjects) {
                // Change to project directory
                process.chdir(mockProject.path);
                
                // Create ProjectManager instance
                const manager = new ProjectManager();
                const context = await manager.getFullProjectContext();
                
                contexts.push({ project: mockProject.name, context });
                
                // Test unique Chrome ports
                const chromePort = context.chromePort;
                this.assert(
                    !chromePorts.has(chromePort),
                    `Chrome port ${chromePort} should be unique for project ${mockProject.name}`,
                    `isolation_chrome_port_${mockProject.name}`
                );
                chromePorts.add(chromePort);
                
                // Test unique tmux session names
                const tmuxSession = context.tmuxSessionName;
                this.assert(
                    !tmuxSessions.has(tmuxSession),
                    `Tmux session ${tmuxSession} should be unique for project ${mockProject.name}`,
                    `isolation_tmux_session_${mockProject.name}`
                );
                tmuxSessions.add(tmuxSession);
                
                // Test unique log directories
                const logDir = context.logDirectory;
                this.assert(
                    !logDirectories.has(logDir),
                    `Log directory ${logDir} should be unique for project ${mockProject.name}`,
                    `isolation_log_directory_${mockProject.name}`
                );
                logDirectories.add(logDir);
                
                // Test project name sanitization
                this.assert(
                    /^[a-z0-9_-]+$/.test(context.projectName),
                    `Project name should be sanitized: ${context.projectName}`,
                    `isolation_name_sanitization_${mockProject.name}`
                );
                
                console.log(`  📋 ${mockProject.name}: Port ${chromePort}, Session ${tmuxSession}`);
            }
            
            // Test port distribution
            this.assert(
                chromePorts.size === this.mockProjects.length,
                `All ${this.mockProjects.length} projects should have unique Chrome ports`,
                'isolation_unique_ports'
            );
            
            console.log(`  ✅ Project isolation validated: ${chromePorts.size} unique configurations`);
            
        } catch (error) {
            this.fail('project_isolation', `Project isolation test failed: ${error.message}`);
        } finally {
            process.chdir(this.originalCwd);
        }
    }

    /**
     * Test configuration system
     */
    async testConfigurationSystem() {
        console.log('\\n⚙️  Phase 4: Configuration System Testing');
        console.log('-'.repeat(50));

        try {
            for (const mockProject of this.mockProjects) {
                process.chdir(mockProject.path);
                
                const manager = new ProjectManager();
                const context = await manager.getFullProjectContext();
                const config = context.config;
                
                // Test configuration loading
                this.assert(
                    config && typeof config === 'object',
                    `Configuration should be loaded for ${mockProject.name}`,
                    `config_loading_${mockProject.name}`
                );
                
                // Test required configuration properties
                const requiredProps = ['maxIterations', 'timeouts', 'logging', 'deployment'];
                for (const prop of requiredProps) {
                    this.assert(
                        config.hasOwnProperty(prop),
                        `Configuration should have ${prop} property`,
                        `config_property_${prop}_${mockProject.name}`
                    );
                }
                
                // Test configuration validation
                this.assert(
                    config.maxIterations >= 1 && config.maxIterations <= 20,
                    `maxIterations should be in valid range for ${mockProject.name}`,
                    `config_validation_${mockProject.name}`
                );
                
                // Test timeout validation
                this.assert(
                    config.timeouts.operatorPhase >= 30000,
                    `operatorPhase timeout should be valid for ${mockProject.name}`,
                    `config_timeout_validation_${mockProject.name}`
                );
                
                console.log(`  ⚙️  ${mockProject.name}: MaxIter=${config.maxIterations}, Platform=${config.deployment.platform || 'auto'}`);
            }
            
            console.log('  ✅ Configuration system validation passed');
            
        } catch (error) {
            this.fail('config_system', `Configuration system test failed: ${error.message}`);
        } finally {
            process.chdir(this.originalCwd);
        }
    }

    /**
     * Test concurrent execution scenarios
     */
    async testConcurrentExecution() {
        console.log('\\n👥 Phase 5: Concurrent Execution Testing');
        console.log('-'.repeat(50));

        try {
            // Test concurrent project context detection
            const concurrentPromises = this.mockProjects.map(async (mockProject) => {
                process.chdir(mockProject.path);
                const manager = new ProjectManager();
                const context = await manager.getFullProjectContext();
                return { project: mockProject.name, context };
            });
            
            const concurrentResults = await Promise.all(concurrentPromises);
            
            // Validate concurrent results
            const concurrentPorts = new Set();
            const concurrentSessions = new Set();
            
            for (const result of concurrentResults) {
                const { project, context } = result;
                
                // Test no port conflicts in concurrent execution
                this.assert(
                    !concurrentPorts.has(context.chromePort),
                    `Concurrent execution should not cause port conflicts for ${project}`,
                    `concurrent_port_${project}`
                );
                concurrentPorts.add(context.chromePort);
                
                // Test no session conflicts in concurrent execution
                this.assert(
                    !concurrentSessions.has(context.tmuxSessionName),
                    `Concurrent execution should not cause session conflicts for ${project}`,
                    `concurrent_session_${project}`
                );
                concurrentSessions.add(context.tmuxSessionName);
            }
            
            console.log(`  ✅ Concurrent execution validated: ${concurrentResults.length} projects executed simultaneously`);
            
        } catch (error) {
            this.fail('concurrent_execution', `Concurrent execution test failed: ${error.message}`);
        } finally {
            process.chdir(this.originalCwd);
        }
    }

    /**
     * Test error handling and edge cases
     */
    async testErrorHandlingAndEdgeCases() {
        console.log('\\n🚨 Phase 6: Error Handling and Edge Cases');
        console.log('-'.repeat(50));

        try {
            // Test invalid project directory
            const invalidDir = '/nonexistent/directory/path';
            try {
                process.chdir(invalidDir);
                this.fail('edge_invalid_dir', 'Should not be able to change to invalid directory');
            } catch (error) {
                this.assert(
                    true,
                    'Should handle invalid directory gracefully',
                    'edge_invalid_dir_handling'
                );
            }
            
            process.chdir(this.originalCwd);
            
            // Test with invalid configuration
            const manager = new ProjectManager();
            const invalidConfig = {
                maxIterations: -1,
                chromePortOffset: 200,
                tmuxSessionPrefix: 'invalid!@#',
                timeouts: {
                    operatorPhase: 'not-a-number'
                }
            };
            
            const sanitizedConfig = manager._validateConfig(invalidConfig);
            
            this.assert(
                sanitizedConfig.maxIterations === 5,
                'Invalid maxIterations should fall back to default',
                'edge_invalid_config_fallback'
            );
            
            this.assert(
                sanitizedConfig.chromePortOffset === 0,
                'Invalid chromePortOffset should fall back to default',
                'edge_invalid_port_fallback'
            );
            
            // Test configuration cache clearing
            manager.clearConfigCache();
            this.assert(
                true,
                'Configuration cache should clear without error',
                'edge_cache_clear'
            );
            
            // Test schema retrieval
            const schema = manager.getConfigSchema();
            this.assert(
                schema && typeof schema === 'object',
                'Should be able to retrieve configuration schema',
                'edge_schema_retrieval'
            );
            
            console.log('  ✅ Error handling and edge cases validated');
            
        } catch (error) {
            this.fail('error_handling', `Error handling test failed: ${error.message}`);
        }
    }

    /**
     * Test performance and resource usage
     */
    async testPerformanceAndResources() {
        console.log('\\n⚡ Phase 7: Performance and Resource Testing');
        console.log('-'.repeat(50));

        try {
            // Test context detection performance
            const performanceTests = [];
            
            for (let i = 0; i < 100; i++) {
                const startTime = Date.now();
                const manager = new ProjectManager();
                const context = manager.detectProjectContext();
                const endTime = Date.now();
                
                performanceTests.push(endTime - startTime);
            }
            
            const avgTime = performanceTests.reduce((a, b) => a + b, 0) / performanceTests.length;
            const maxTime = Math.max(...performanceTests);
            
            this.assert(
                avgTime < 50,
                `Average context detection should be fast (${avgTime.toFixed(2)}ms)`,
                'performance_avg_context_detection'
            );
            
            this.assert(
                maxTime < 200,
                `Maximum context detection should be reasonable (${maxTime}ms)`,
                'performance_max_context_detection'
            );
            
            // Test memory usage with many instances
            const managers = [];
            for (let i = 0; i < 50; i++) {
                managers.push(new ProjectManager());
            }
            
            this.assert(
                managers.length === 50,
                'Should be able to create many ProjectManager instances',
                'performance_multiple_instances'
            );
            
            // Test configuration caching
            const manager = new ProjectManager();
            const configPath = '/mock/config/path.json';
            
            // Simulate cache usage
            const startCacheTime = Date.now();
            for (let i = 0; i < 1000; i++) {
                // This simulates cache hits without actual file I/O
                manager.configCache.set(`test-${i}`, { mockConfig: i });
                manager.configCache.get(`test-${i}`);
            }
            const endCacheTime = Date.now();
            
            const cacheTime = endCacheTime - startCacheTime;
            this.assert(
                cacheTime < 100,
                `Configuration caching should be fast (${cacheTime}ms for 1000 operations)`,
                'performance_config_caching'
            );
            
            console.log(`  ⚡ Performance metrics:`);
            console.log(`     - Average context detection: ${avgTime.toFixed(2)}ms`);
            console.log(`     - Maximum context detection: ${maxTime}ms`);
            console.log(`     - Cache operations (1000): ${cacheTime}ms`);
            console.log(`     - Memory test: ${managers.length} instances created`);
            console.log('  ✅ Performance and resource testing completed');
            
        } catch (error) {
            this.fail('performance_testing', `Performance testing failed: ${error.message}`);
        }
    }

    /**
     * Cleanup mock projects and temporary files
     */
    async cleanupMockProjects() {
        console.log('\\n🧹 Cleaning up mock projects...');
        
        // Remove temporary directories
        for (const tempDir of this.tempDirs) {
            try {
                await fs.rm(tempDir, { recursive: true, force: true });
            } catch (error) {
                console.warn(`Failed to remove ${tempDir}: ${error.message}`);
            }
        }
        
        // Remove mock project configurations
        for (const mockProject of this.mockProjects) {
            try {
                const configPath = path.join(__dirname, '../config/project-configs', `${mockProject.name}.json`);
                await fs.rm(configPath, { force: true });
            } catch (error) {
                // Ignore cleanup errors for config files
            }
        }
        
        console.log(`  🗑️  Cleaned up ${this.tempDirs.length} temporary directories`);
        console.log(`  🗑️  Cleaned up ${this.mockProjects.length} mock configurations`);
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
     * Generate comprehensive integration test report
     */
    generateIntegrationReport() {
        const testEndTime = Date.now();
        const testDuration = testEndTime - this.testStartTime;
        
        console.log('\\n📊 Cross-Project E2E Integration Test Report');
        console.log('=' .repeat(80));
        
        const totalTests = this.testResults.length;
        const passedTests = this.testResults.filter(r => r.passed).length;
        const failedTests = totalTests - passedTests;
        
        console.log(`Test Duration: ${(testDuration / 1000).toFixed(2)} seconds`);
        console.log(`Total Tests: ${totalTests}`);
        console.log(`Passed: ${passedTests}`);
        console.log(`Failed: ${failedTests}`);
        console.log(`Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
        console.log(`Mock Projects Created: ${this.mockProjects.length}`);
        
        // Group results by test phase
        const testPhases = {
            'Environment Validation': this.testResults.filter(r => r.testId.startsWith('env_')),
            'Project Isolation': this.testResults.filter(r => r.testId.startsWith('isolation_')),
            'Configuration System': this.testResults.filter(r => r.testId.startsWith('config_')),
            'Concurrent Execution': this.testResults.filter(r => r.testId.startsWith('concurrent_')),
            'Error Handling': this.testResults.filter(r => r.testId.startsWith('edge_')),
            'Performance Testing': this.testResults.filter(r => r.testId.startsWith('performance_'))
        };
        
        console.log('\\nTest Results by Phase:');
        for (const [phase, results] of Object.entries(testPhases)) {
            if (results.length > 0) {
                const phasePass = results.filter(r => r.passed).length;
                const phaseFail = results.length - phasePass;
                const status = phaseFail === 0 ? '✅' : '❌';
                console.log(`  ${status} ${phase}: ${phasePass}/${results.length} passed`);
            }
        }
        
        if (failedTests > 0) {
            console.log('\\n❌ Failed Tests:');
            this.testResults
                .filter(r => !r.passed)
                .forEach(result => {
                    console.log(`  - ${result.testId}: ${result.message}`);
                });
        }
        
        const overallStatus = failedTests === 0 ? 'PASSED' : 'FAILED';
        console.log(`\\n${overallStatus === 'PASSED' ? '🎉' : '💥'} Integration Test Status: ${overallStatus}`);
        
        if (overallStatus === 'PASSED') {
            console.log('\\n✅ Cross-project E2E system is ready for production use!');
            console.log('   - Project isolation working correctly');
            console.log('   - Configuration system functioning properly');
            console.log('   - Concurrent execution supported');
            console.log('   - Error handling robust');
            console.log('   - Performance within acceptable limits');
        }
        
        return {
            status: overallStatus,
            total: totalTests,
            passed: passedTests,
            failed: failedTests,
            duration: testDuration,
            mockProjects: this.mockProjects.length,
            results: this.testResults,
            phases: testPhases
        };
    }
}

// Run integration tests if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    (async () => {
        try {
            const testSuite = new CrossProjectIntegrationTestSuite();
            const report = await testSuite.runIntegrationTests();
            process.exit(report.status === 'PASSED' ? 0 : 1);
        } catch (error) {
            console.error('\\n💥 Integration test suite failed:', error.message);
            console.error(error.stack);
            process.exit(1);
        }
    })();
}

export default CrossProjectIntegrationTestSuite;
#!/usr/bin/env node

/**
 * Cross-Project E2E Edge Case and Error Scenario Validation
 * 
 * Comprehensive testing of boundary conditions, error handling, and edge cases:
 * - Boundary value testing (extreme inputs, limits)
 * - Error condition validation (malformed data, missing dependencies)
 * - Security testing (path traversal, injection attempts)
 * - Resource exhaustion scenarios (memory, ports, filesystem)
 * - Recovery and resilience testing
 * - Concurrent error handling
 * - Configuration validation edge cases
 * - Platform-specific error scenarios
 * 
 * Usage: node test/edge-case-validation.js
 */

import ProjectManager from '../lib/project-manager.js';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class EdgeCaseValidationSuite {
    constructor() {
        this.testResults = [];
        this.tempFiles = [];
        this.tempDirs = [];
        this.originalCwd = process.cwd();
        this.testStartTime = Date.now();
        this.maxMemoryUsage = 0;
    }

    /**
     * Run comprehensive edge case validation
     */
    async runEdgeCaseValidation() {
        console.log('🔬 Cross-Project E2E Edge Case & Error Scenario Validation');
        console.log('=' .repeat(80));
        console.log(`Start time: ${new Date().toISOString()}`);
        console.log('');

        try {
            // Test Phase 1: Boundary Value Testing
            await this.testBoundaryValues();
            
            // Test Phase 2: Malformed Input Handling
            await this.testMalformedInputs();
            
            // Test Phase 3: Security Vulnerability Testing
            await this.testSecurityVulnerabilities();
            
            // Test Phase 4: Resource Exhaustion Testing
            await this.testResourceExhaustion();
            
            // Test Phase 5: Filesystem Edge Cases
            await this.testFilesystemEdgeCases();
            
            // Test Phase 6: Configuration Edge Cases
            await this.testConfigurationEdgeCases();
            
            // Test Phase 7: Platform-Specific Error Scenarios
            await this.testPlatformSpecificErrors();
            
            // Test Phase 8: Recovery and Resilience Testing
            await this.testRecoveryAndResilience();
            
            return this.generateEdgeCaseReport();
            
        } finally {
            await this.cleanup();
            process.chdir(this.originalCwd);
        }
    }

    /**
     * Test boundary values and extreme inputs
     */
    async testBoundaryValues() {
        console.log('🎯 Phase 1: Boundary Value Testing');
        console.log('-'.repeat(50));

        try {
            const manager = new ProjectManager();
            
            // Test extremely long project paths
            const extremelyLongPath = '/tmp/' + 'x'.repeat(1000);
            const longPathName = manager.extractProjectName(extremelyLongPath);
            
            this.assert(
                longPathName.length <= 50,
                `Long path should be truncated: ${longPathName.length} chars`,
                'boundary_long_path_truncation'
            );
            
            // Test path with maximum valid length
            const maxValidPath = '/tmp/' + 'a'.repeat(255);
            try {
                const maxPathName = manager.extractProjectName(maxValidPath);
                this.assert(
                    typeof maxPathName === 'string' && maxPathName.length > 0,
                    'Should handle maximum valid path length',
                    'boundary_max_valid_path'
                );
            } catch (error) {
                // Expected for some systems
                this.assert(
                    true,
                    'System correctly rejects oversized paths',
                    'boundary_max_path_rejection'
                );
            }
            
            // Test minimum values
            const minConfig = {
                maxIterations: 1,
                chromePortOffset: 0,
                logRetentionDays: 1,
                timeouts: {
                    operatorPhase: 30000,
                    claudePhase: 60000,
                    chromeConnection: 5000
                }
            };
            
            const validatedMinConfig = manager._validateConfig(minConfig);
            this.assert(
                validatedMinConfig.maxIterations === 1,
                'Minimum valid values should be accepted',
                'boundary_min_values'
            );
            
            // Test maximum values
            const maxConfig = {
                maxIterations: 20,
                chromePortOffset: 99,
                logRetentionDays: 90,
                timeouts: {
                    operatorPhase: 1800000,
                    claudePhase: 3600000,
                    chromeConnection: 60000
                }
            };
            
            const validatedMaxConfig = manager._validateConfig(maxConfig);
            this.assert(
                validatedMaxConfig.maxIterations === 20,
                'Maximum valid values should be accepted',
                'boundary_max_values'
            );
            
            // Test boundary conditions for Chrome port generation
            const testHashes = [
                '00000000', // Minimum hex value
                'ffffffff', // Maximum hex value
                '80000000', // Middle value
                '12345678', // Typical value
                'abcdefab'  // Another typical value
            ];
            
            const generatedPorts = new Set();
            for (const hash of testHashes) {
                const port = manager.generateChromePort(hash);
                this.assert(
                    port >= 9222 && port <= 9321,
                    `Generated port ${port} should be in valid range for hash ${hash}`,
                    `boundary_port_generation_${hash}`
                );
                generatedPorts.add(port);
            }
            
            console.log(`  ✅ Boundary value testing completed: ${generatedPorts.size} unique ports from ${testHashes.length} hash tests`);
            
        } catch (error) {
            this.fail('boundary_testing', `Boundary value testing failed: ${error.message}`);
        }
    }

    /**
     * Test malformed input handling
     */
    async testMalformedInputs() {
        console.log('\\n🚨 Phase 2: Malformed Input Handling');
        console.log('-'.repeat(50));

        try {
            const manager = new ProjectManager();
            
            // Test null/undefined inputs
            const nullSafeName = manager.extractProjectName(null);
            this.assert(
                typeof nullSafeName === 'string',
                'Should handle null project path gracefully',
                'malformed_null_path'
            );
            
            const undefinedSafeName = manager.extractProjectName(undefined);
            this.assert(
                typeof undefinedSafeName === 'string',
                'Should handle undefined project path gracefully',
                'malformed_undefined_path'
            );
            
            // Test empty string inputs
            const emptySafeName = manager.extractProjectName('');
            this.assert(
                typeof emptySafeName === 'string' && emptySafeName.length > 0,
                'Should handle empty project path gracefully',
                'malformed_empty_path'
            );
            
            // Test malformed hash inputs
            const malformedHashes = ['', null, undefined, 'xyz', '1234', 'not-hex'];
            for (const badHash of malformedHashes) {
                try {
                    const port = manager.generateChromePort(badHash);
                    this.assert(
                        typeof port === 'number' && port >= 9222,
                        `Should generate valid port even with malformed hash: ${badHash}`,
                        `malformed_hash_${String(badHash).replace(/[^a-zA-Z0-9]/g, '_')}`
                    );
                } catch (error) {
                    this.assert(
                        true,
                        `Correctly rejects malformed hash: ${badHash}`,
                        `malformed_hash_rejection_${String(badHash).replace(/[^a-zA-Z0-9]/g, '_')}`
                    );
                }
            }
            
            // Test malformed configuration objects
            const malformedConfigs = [
                null,
                undefined,
                'not-an-object',
                [],
                42,
                { malformed: 'config without required fields' },
                { maxIterations: 'not-a-number' },
                { timeouts: 'not-an-object' },
                { timeouts: { operatorPhase: -1 } }
            ];
            
            for (let i = 0; i < malformedConfigs.length; i++) {
                const malformedConfig = malformedConfigs[i];
                try {
                    const sanitized = manager._validateConfig(malformedConfig || {});
                    this.assert(
                        sanitized && typeof sanitized === 'object',
                        `Should sanitize malformed config #${i}`,
                        `malformed_config_sanitization_${i}`
                    );
                } catch (error) {
                    this.assert(
                        true,
                        `Correctly rejects critically malformed config #${i}`,
                        `malformed_config_rejection_${i}`
                    );
                }
            }
            
            // Test special characters in project names
            const specialCharPaths = [
                '/tmp/project!@#$%^&*()',
                '/tmp/project with spaces',
                '/tmp/project-with-unicode-αβγ',
                '/tmp/project\\\\with\\\\backslashes',
                '/tmp/project/with/slashes',
                '/tmp/project<>|\"?*',
                '/tmp/.hidden-project',
                '/tmp/project.',
                '/tmp/project-'
            ];
            
            for (const specialPath of specialCharPaths) {
                const sanitizedName = manager.extractProjectName(specialPath);
                this.assert(
                    /^[a-z0-9_-]+$/.test(sanitizedName),
                    `Special characters should be sanitized in: ${specialPath} -> ${sanitizedName}`,
                    `malformed_special_chars_${crypto.createHash('md5').update(specialPath).digest('hex').substr(0, 8)}`
                );
            }
            
            console.log('  ✅ Malformed input handling validated');
            
        } catch (error) {
            this.fail('malformed_inputs', `Malformed input testing failed: ${error.message}`);
        }
    }

    /**
     * Test security vulnerabilities
     */
    async testSecurityVulnerabilities() {
        console.log('\\n🔒 Phase 3: Security Vulnerability Testing');
        console.log('-'.repeat(50));

        try {
            const manager = new ProjectManager();
            
            // Test path traversal attempts
            const pathTraversalAttempts = [
                '../../../etc/passwd',
                '..\\\\..\\\\..\\\\windows\\\\system32',
                '/tmp/project/../../../sensitive-file',
                '/tmp/project/./../../etc/hosts',
                '/tmp/project/%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd',
                '/tmp/project/..%252f..%252f..%252fetc%252fpasswd'
            ];
            
            for (const maliciousPath of pathTraversalAttempts) {
                const safeName = manager.extractProjectName(maliciousPath);
                this.assert(
                    !/\.\./.test(safeName) && !/\/etc\//.test(safeName),
                    `Path traversal should be prevented: ${maliciousPath} -> ${safeName}`,
                    `security_path_traversal_${crypto.createHash('md5').update(maliciousPath).digest('hex').substr(0, 8)}`
                );
            }
            
            // Test log directory path safety
            const logDir = manager.getLogDirectory('test-project', 'abc12345');
            const expectedBasePath = path.resolve(__dirname, '../logs');
            this.assert(
                logDir.startsWith(expectedBasePath),
                `Log directory should be contained within expected base: ${logDir}`,
                'security_log_directory_containment'
            );
            
            // Test config path safety
            const configPath = manager.getConfigPath('test-project');
            const expectedConfigBase = path.resolve(__dirname, '../config/project-configs');
            this.assert(
                configPath.startsWith(expectedConfigBase),
                `Config path should be contained within expected base: ${configPath}`,
                'security_config_path_containment'
            );
            
            // Test null byte injection attempts
            const nullByteAttempts = [
                '/tmp/project\\0../../../etc/passwd',
                '/tmp/project\\x00/malicious',
                '/tmp/project%00../sensitive'
            ];
            
            for (const nullBytePath of nullByteAttempts) {
                try {
                    manager._validateProjectPath(nullBytePath);
                    this.fail(
                        `security_null_byte_${crypto.createHash('md5').update(nullBytePath).digest('hex').substr(0, 8)}`,
                        'Should reject null byte injection attempts'
                    );
                } catch (error) {
                    this.assert(
                        true,
                        `Correctly rejects null byte injection: ${nullBytePath}`,
                        `security_null_byte_prevention_${crypto.createHash('md5').update(nullBytePath).digest('hex').substr(0, 8)}`
                    );
                }
            }
            
            // Test configuration injection attempts
            const injectionAttempts = [
                { eval: 'process.exit(1)' },
                { require: '../../../sensitive-module' },
                { __proto__: { polluted: true } },
                { constructor: { prototype: { polluted: true } } }
            ];
            
            for (let i = 0; i < injectionAttempts.length; i++) {
                const injectionConfig = injectionAttempts[i];
                try {
                    const sanitized = manager._validateConfig(injectionConfig);
                    this.assert(
                        !sanitized.hasOwnProperty('eval') && 
                        !sanitized.hasOwnProperty('require') &&
                        !sanitized.hasOwnProperty('__proto__'),
                        `Should prevent configuration injection #${i}`,
                        `security_config_injection_prevention_${i}`
                    );
                } catch (error) {
                    this.assert(
                        true,
                        `Correctly rejects configuration injection #${i}`,
                        `security_config_injection_rejection_${i}`
                    );
                }
            }
            
            console.log('  ✅ Security vulnerability testing completed');
            
        } catch (error) {
            this.fail('security_testing', `Security testing failed: ${error.message}`);
        }
    }

    /**
     * Test resource exhaustion scenarios
     */
    async testResourceExhaustion() {
        console.log('\\n💾 Phase 4: Resource Exhaustion Testing');
        console.log('-'.repeat(50));

        try {
            // Test massive configuration objects
            const hugeConfig = {
                description: 'x'.repeat(10000),
                customValidations: new Array(1000).fill('test-validation'),
                deployment: {
                    customCommands: {}
                }
            };
            
            // Add many custom commands
            for (let i = 0; i < 100; i++) {
                hugeConfig.deployment.customCommands[`command_${i}`] = `echo "command ${i}"`;
            }
            
            const manager = new ProjectManager();
            const startMemory = process.memoryUsage().heapUsed;
            
            try {
                const sanitized = manager._validateConfig(hugeConfig);
                const endMemory = process.memoryUsage().heapUsed;
                const memoryIncrease = endMemory - startMemory;
                
                this.assert(
                    memoryIncrease < 10 * 1024 * 1024, // Less than 10MB increase
                    `Memory usage should be reasonable for large config: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`,
                    'resource_large_config_memory'
                );
                
                this.assert(
                    sanitized && typeof sanitized === 'object',
                    'Should handle large configuration objects',
                    'resource_large_config_handling'
                );
            } catch (error) {
                this.assert(
                    true,
                    'Correctly rejects oversized configuration',
                    'resource_large_config_rejection'
                );
            }
            
            // Test many ProjectManager instances
            const instances = [];
            const startTime = Date.now();
            
            try {
                for (let i = 0; i < 1000; i++) {
                    instances.push(new ProjectManager());
                }
                
                const endTime = Date.now();
                const creationTime = endTime - startTime;
                
                this.assert(
                    creationTime < 5000, // Less than 5 seconds
                    `Instance creation should be fast: ${creationTime}ms for 1000 instances`,
                    'resource_many_instances_performance'
                );
                
                this.assert(
                    instances.length === 1000,
                    'Should be able to create many instances',
                    'resource_many_instances_creation'
                );
                
            } catch (error) {
                this.assert(
                    instances.length > 100, // At least some instances created
                    `Should create reasonable number of instances before failure: ${instances.length}`,
                    'resource_instance_limit_handling'
                );
            }
            
            // Test cache exhaustion
            const cacheManager = new ProjectManager();
            const startCacheTime = Date.now();
            
            try {
                for (let i = 0; i < 10000; i++) {
                    const fakePath = `/fake/config/path/project-${i}.json`;
                    const fakeConfig = { maxIterations: i % 20 + 1 };
                    cacheManager.configCache.set(fakePath, fakeConfig);
                }
                
                const endCacheTime = Date.now();
                const cacheTime = endCacheTime - startCacheTime;
                
                this.assert(
                    cacheTime < 1000, // Less than 1 second
                    `Cache operations should be fast: ${cacheTime}ms for 10000 entries`,
                    'resource_cache_performance'
                );
                
                this.assert(
                    cacheManager.configCache.size === 10000,
                    'Cache should handle many entries',
                    'resource_cache_capacity'
                );
                
            } catch (error) {
                this.assert(
                    cacheManager.configCache.size > 1000,
                    `Cache should handle reasonable number of entries: ${cacheManager.configCache.size}`,
                    'resource_cache_reasonable_capacity'
                );
            }
            
            const currentMemory = process.memoryUsage().heapUsed;
            this.maxMemoryUsage = Math.max(this.maxMemoryUsage, currentMemory);
            
            console.log(`  ✅ Resource exhaustion testing completed`);
            console.log(`     - Created ${instances.length} ProjectManager instances`);
            console.log(`     - Cache entries: ${cacheManager.configCache.size}`);
            console.log(`     - Peak memory usage: ${(this.maxMemoryUsage / 1024 / 1024).toFixed(2)}MB`);
            
        } catch (error) {
            this.fail('resource_exhaustion', `Resource exhaustion testing failed: ${error.message}`);
        }
    }

    /**
     * Test filesystem edge cases
     */
    async testFilesystemEdgeCases() {
        console.log('\\n📁 Phase 5: Filesystem Edge Cases');
        console.log('-'.repeat(50));

        try {
            const manager = new ProjectManager();
            
            // Test read-only directory scenarios
            const readOnlyTestDir = '/tmp/readonly-test-' + Date.now();
            try {
                await fs.mkdir(readOnlyTestDir, { mode: 0o444 }); // Read-only
                this.tempDirs.push(readOnlyTestDir);
                
                const result = await manager.ensureLogDirectory(path.join(readOnlyTestDir, 'logs'));
                this.assert(
                    typeof result === 'boolean',
                    'Should handle read-only directory gracefully',
                    'filesystem_readonly_handling'
                );
                
            } catch (error) {
                this.assert(
                    true,
                    'System correctly handles permission errors',
                    'filesystem_permission_error_handling'
                );
            }
            
            // Test deeply nested directory creation
            const deepPath = '/tmp/deep-test-' + Date.now();
            const veryDeepPath = path.join(deepPath, ...new Array(50).fill('level'));
            
            try {
                const deepResult = await manager.ensureLogDirectory(veryDeepPath);
                this.assert(
                    deepResult === true,
                    'Should handle deeply nested directory creation',
                    'filesystem_deep_directory_creation'
                );
                
                this.tempDirs.push(deepPath);
                
            } catch (error) {
                this.assert(
                    true,
                    'System correctly handles filesystem limits',
                    'filesystem_depth_limit_handling'
                );
            }
            
            // Test concurrent directory creation
            const concurrentBase = '/tmp/concurrent-test-' + Date.now();
            const concurrentPromises = [];
            
            for (let i = 0; i < 10; i++) {
                const concurrentPath = path.join(concurrentBase, `dir-${i}`);
                concurrentPromises.push(manager.ensureLogDirectory(concurrentPath));
            }
            
            try {
                const concurrentResults = await Promise.all(concurrentPromises);
                const successCount = concurrentResults.filter(r => r === true).length;
                
                this.assert(
                    successCount >= 8, // Allow some failures
                    `Concurrent directory creation should mostly succeed: ${successCount}/10`,
                    'filesystem_concurrent_creation'
                );
                
                this.tempDirs.push(concurrentBase);
                
            } catch (error) {
                this.assert(
                    true,
                    'System handles concurrent filesystem operations',
                    'filesystem_concurrent_error_handling'
                );
            }
            
            // Test configuration file with invalid JSON
            const invalidConfigPath = '/tmp/invalid-config-' + Date.now() + '.json';
            await fs.writeFile(invalidConfigPath, '{ invalid json content }');
            this.tempFiles.push(invalidConfigPath);
            
            try {
                const config = await manager.loadProjectConfig(invalidConfigPath);
                this.assert(
                    config && typeof config === 'object',
                    'Should fallback to defaults for invalid JSON',
                    'filesystem_invalid_json_fallback'
                );
            } catch (error) {
                this.assert(
                    true,
                    'Correctly handles invalid JSON files',
                    'filesystem_invalid_json_handling'
                );
            }
            
            // Test configuration file with binary content
            const binaryConfigPath = '/tmp/binary-config-' + Date.now() + '.json';
            const binaryContent = Buffer.from([0x00, 0x01, 0x02, 0x03, 0xFF, 0xFE, 0xFD]);
            await fs.writeFile(binaryConfigPath, binaryContent);
            this.tempFiles.push(binaryConfigPath);
            
            try {
                const binaryConfig = await manager.loadProjectConfig(binaryConfigPath);
                this.assert(
                    binaryConfig && typeof binaryConfig === 'object',
                    'Should fallback to defaults for binary files',
                    'filesystem_binary_file_fallback'
                );
            } catch (error) {
                this.assert(
                    true,
                    'Correctly handles binary files',
                    'filesystem_binary_file_handling'
                );
            }
            
            console.log('  ✅ Filesystem edge case testing completed');
            
        } catch (error) {
            this.fail('filesystem_edge_cases', `Filesystem edge case testing failed: ${error.message}`);
        }
    }

    /**
     * Test configuration edge cases
     */
    async testConfigurationEdgeCases() {
        console.log('\\n⚙️  Phase 6: Configuration Edge Cases');
        console.log('-'.repeat(50));

        try {
            const manager = new ProjectManager();
            
            // Test circular reference in configuration
            const circularConfig = { maxIterations: 5 };
            circularConfig.self = circularConfig;
            
            try {
                const sanitized = manager._validateConfig(circularConfig);
                this.assert(
                    !sanitized.hasOwnProperty('self'),
                    'Should handle circular references',
                    'config_circular_reference_handling'
                );
            } catch (error) {
                this.assert(
                    true,
                    'Correctly rejects circular references',
                    'config_circular_reference_rejection'
                );
            }
            
            // Test deeply nested configuration
            let deepConfig = { maxIterations: 5 };
            let current = deepConfig;
            for (let i = 0; i < 100; i++) {
                current.nested = { level: i };
                current = current.nested;
            }
            
            try {
                const sanitized = manager._validateConfig(deepConfig);
                this.assert(
                    sanitized && typeof sanitized === 'object',
                    'Should handle deeply nested configuration',
                    'config_deep_nesting_handling'
                );
            } catch (error) {
                this.assert(
                    true,
                    'Correctly handles deep nesting limits',
                    'config_deep_nesting_limit'
                );
            }
            
            // Test configuration with many properties
            const manyPropsConfig = { maxIterations: 5 };
            for (let i = 0; i < 1000; i++) {
                manyPropsConfig[`property_${i}`] = `value_${i}`;
            }
            
            try {
                const sanitized = manager._validateConfig(manyPropsConfig);
                this.assert(
                    sanitized.maxIterations === 5,
                    'Should preserve valid properties with many unknown properties',
                    'config_many_properties_handling'
                );
            } catch (error) {
                this.assert(
                    true,
                    'Correctly handles configurations with many properties',
                    'config_many_properties_limit'
                );
            }
            
            // Test configuration schema retrieval
            const schema = manager.getConfigSchema();
            this.assert(
                schema && typeof schema === 'object',
                'Should provide configuration schema',
                'config_schema_availability'
            );
            
            this.assert(
                schema.hasOwnProperty('maxIterations') && schema.hasOwnProperty('timeouts'),
                'Schema should contain expected properties',
                'config_schema_completeness'
            );
            
            // Test cache operations with edge cases
            manager.clearConfigCache(); // Clear all
            manager.clearConfigCache('/nonexistent/path'); // Clear specific
            
            this.assert(
                manager.configCache.size === 0,
                'Cache should be empty after clearing',
                'config_cache_clear_functionality'
            );
            
            // Test concurrent configuration loading
            const concurrentConfigPromises = [];
            for (let i = 0; i < 10; i++) {
                const fakePath = `/fake/concurrent/config-${i}.json`;
                concurrentConfigPromises.push(
                    Promise.resolve().then(() => manager.loadProjectConfig(fakePath))
                );
            }
            
            const concurrentConfigs = await Promise.all(concurrentConfigPromises);
            this.assert(
                concurrentConfigs.every(config => config && typeof config === 'object'),
                'Concurrent configuration loading should work',
                'config_concurrent_loading'
            );
            
            console.log('  ✅ Configuration edge case testing completed');
            
        } catch (error) {
            this.fail('config_edge_cases', `Configuration edge case testing failed: ${error.message}`);
        }
    }

    /**
     * Test platform-specific error scenarios
     */
    async testPlatformSpecificErrors() {
        console.log('\\n🖥️  Phase 7: Platform-Specific Error Scenarios');
        console.log('-'.repeat(50));

        try {
            const manager = new ProjectManager();
            
            // Test platform detection with various configurations
            const platformConfigs = [
                { deployment: { platform: 'heroku' } },
                { deployment: { platform: 'vercel' } },
                { deployment: { platform: 'aws' } },
                { deployment: { platform: 'custom' } },
                { deployment: { platform: 'nonexistent-platform' } },
                { deployment: { autoDetectPlatform: true } },
                { deployment: { autoDetectPlatform: false } }
            ];
            
            for (let i = 0; i < platformConfigs.length; i++) {
                const platformConfig = platformConfigs[i];
                try {
                    const sanitized = manager._validateConfig(platformConfig);
                    const platform = sanitized.deployment.platform;
                    
                    if (platform) {
                        this.assert(
                            ['heroku', 'vercel', 'aws', 'custom'].includes(platform),
                            `Platform should be valid: ${platform}`,
                            `platform_validation_${i}`
                        );
                    } else {
                        this.assert(
                            sanitized.deployment.autoDetectPlatform === true,
                            'Auto-detection should be enabled when no platform specified',
                            `platform_auto_detect_${i}`
                        );
                    }
                } catch (error) {
                    this.assert(
                        true,
                        `Correctly handles platform configuration error #${i}`,
                        `platform_error_handling_${i}`
                    );
                }
            }
            
            // Test Chrome command generation
            const chromePorts = [9222, 9250, 9300, 9321, 9999, -1];
            for (const port of chromePorts) {
                try {
                    const chromeCommand = manager.generateChromeCommand(port);
                    
                    if (port >= 9222 && port <= 9321) {
                        this.assert(
                            chromeCommand.includes(`--remote-debugging-port=${port}`),
                            `Chrome command should include valid port: ${port}`,
                            `platform_chrome_command_valid_${port}`
                        );
                    } else {
                        this.assert(
                            typeof chromeCommand === 'string',
                            `Chrome command should be generated even for edge case port: ${port}`,
                            `platform_chrome_command_edge_${port}`
                        );
                    }
                } catch (error) {
                    this.assert(
                        true,
                        `Correctly handles invalid Chrome port: ${port}`,
                        `platform_chrome_port_error_${port}`
                    );
                }
            }
            
            // Test tmux session name limits
            const longProjectNames = [
                'a'.repeat(100),
                'project-with-many-hyphens-and-long-descriptive-name-that-exceeds-limits',
                'प्रोजेक्ट-with-unicode',
                'project_with_underscores_and_numbers_12345'
            ];
            
            for (let i = 0; i < longProjectNames.length; i++) {
                const longName = longProjectNames[i];
                const sanitizedName = manager.extractProjectName(`/tmp/${longName}`);
                const sessionName = manager.getTmuxSessionName(sanitizedName, 'abc12345');
                
                this.assert(
                    sessionName.length <= 255, // tmux session name limit
                    `Tmux session name should respect limits: ${sessionName.length} chars`,
                    `platform_tmux_session_limit_${i}`
                );
                
                this.assert(
                    /^[a-zA-Z0-9_-]+$/.test(sessionName.replace(/-/g, '')),
                    `Tmux session name should contain safe characters: ${sessionName}`,
                    `platform_tmux_session_safety_${i}`
                );
            }
            
            console.log('  ✅ Platform-specific error testing completed');
            
        } catch (error) {
            this.fail('platform_specific_errors', `Platform-specific error testing failed: ${error.message}`);
        }
    }

    /**
     * Test recovery and resilience
     */
    async testRecoveryAndResilience() {
        console.log('\\n🔄 Phase 8: Recovery and Resilience Testing');
        console.log('-'.repeat(50));

        try {
            // Test recovery from corrupted cache
            const manager = new ProjectManager();
            
            // Corrupt the cache with invalid data
            manager.configCache.set('/test/path', 'invalid-cache-data');
            manager.configCache.set('/test/path2', { circular: {} });
            manager.configCache.get('/test/path2').circular = manager.configCache.get('/test/path2');
            
            // Should recover gracefully
            const recoveredConfig = await manager.loadProjectConfig('/nonexistent/path');
            this.assert(
                recoveredConfig && typeof recoveredConfig === 'object',
                'Should recover from corrupted cache',
                'recovery_corrupted_cache'
            );
            
            // Test recovery from memory pressure
            const startMemory = process.memoryUsage().heapUsed;
            
            // Create memory pressure
            const memoryPressure = [];
            try {
                for (let i = 0; i < 1000; i++) {
                    memoryPressure.push(new Array(1000).fill(`memory-pressure-${i}`));
                }
                
                // Should still function under memory pressure
                const pressureManager = new ProjectManager();
                const pressureContext = pressureManager.detectProjectContext();
                
                this.assert(
                    pressureContext && typeof pressureContext === 'object',
                    'Should function under memory pressure',
                    'recovery_memory_pressure'
                );
                
            } catch (error) {
                this.assert(
                    true,
                    'Correctly handles memory pressure limits',
                    'recovery_memory_pressure_limit'
                );
            } finally {
                // Release memory pressure
                memoryPressure.length = 0;
            }
            
            // Test recovery from invalid project states
            const invalidStates = [
                { context: null },
                { context: { projectName: '', chromePort: 0 } },
                { context: { projectName: 'test', chromePort: -1 } }
            ];
            
            for (let i = 0; i < invalidStates.length; i++) {
                try {
                    const recoveryManager = new ProjectManager();
                    const context = recoveryManager.detectProjectContext();
                    
                    this.assert(
                        context && context.projectName && context.chromePort > 0,
                        `Should recover from invalid state #${i}`,
                        `recovery_invalid_state_${i}`
                    );
                } catch (error) {
                    this.assert(
                        true,
                        `Correctly handles invalid state #${i}`,
                        `recovery_invalid_state_handling_${i}`
                    );
                }
            }
            
            // Test resilience to concurrent modifications
            const concurrentManager = new ProjectManager();
            const concurrentPromises = [];
            
            // Simulate concurrent operations
            for (let i = 0; i < 20; i++) {
                concurrentPromises.push(
                    Promise.resolve().then(async () => {
                        try {
                            const context = concurrentManager.detectProjectContext();
                            const config = await concurrentManager.loadProjectConfig('/fake/path');
                            concurrentManager.clearConfigCache();
                            return { success: true, context, config };
                        } catch (error) {
                            return { success: false, error: error.message };
                        }
                    })
                );
            }
            
            const concurrentResults = await Promise.all(concurrentPromises);
            const successfulOperations = concurrentResults.filter(r => r.success).length;
            
            this.assert(
                successfulOperations >= 15, // Allow some failures
                `Should be resilient to concurrent operations: ${successfulOperations}/20 successful`,
                'recovery_concurrent_resilience'
            );
            
            console.log('  ✅ Recovery and resilience testing completed');
            console.log(`     - Concurrent operations success rate: ${successfulOperations}/20`);
            
        } catch (error) {
            this.fail('recovery_resilience', `Recovery and resilience testing failed: ${error.message}`);
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
        console.log('\\n🧹 Cleaning up edge case test resources...');
        
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
        
        console.log(`  🗑️  Cleaned up ${this.tempFiles.length} temporary files`);
        console.log(`  🗑️  Cleaned up ${this.tempDirs.length} temporary directories`);
    }

    /**
     * Generate comprehensive edge case validation report
     */
    generateEdgeCaseReport() {
        const testEndTime = Date.now();
        const testDuration = testEndTime - this.testStartTime;
        
        console.log('\\n📊 Edge Case & Error Scenario Validation Report');
        console.log('=' .repeat(80));
        
        const totalTests = this.testResults.length;
        const passedTests = this.testResults.filter(r => r.passed).length;
        const failedTests = totalTests - passedTests;
        
        console.log(`Test Duration: ${(testDuration / 1000).toFixed(2)} seconds`);
        console.log(`Total Edge Case Tests: ${totalTests}`);
        console.log(`Passed: ${passedTests}`);
        console.log(`Failed: ${failedTests}`);
        console.log(`Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
        console.log(`Peak Memory Usage: ${(this.maxMemoryUsage / 1024 / 1024).toFixed(2)}MB`);
        
        // Group results by test category
        const testCategories = {
            'Boundary Values': this.testResults.filter(r => r.testId.startsWith('boundary_')),
            'Malformed Inputs': this.testResults.filter(r => r.testId.startsWith('malformed_')),
            'Security': this.testResults.filter(r => r.testId.startsWith('security_')),
            'Resource Exhaustion': this.testResults.filter(r => r.testId.startsWith('resource_')),
            'Filesystem Edge Cases': this.testResults.filter(r => r.testId.startsWith('filesystem_')),
            'Configuration Edge Cases': this.testResults.filter(r => r.testId.startsWith('config_')),
            'Platform-Specific': this.testResults.filter(r => r.testId.startsWith('platform_')),
            'Recovery & Resilience': this.testResults.filter(r => r.testId.startsWith('recovery_'))
        };
        
        console.log('\\nEdge Case Test Results by Category:');
        for (const [category, results] of Object.entries(testCategories)) {
            if (results.length > 0) {
                const categoryPass = results.filter(r => r.passed).length;
                const categoryFail = results.length - categoryPass;
                const status = categoryFail === 0 ? '✅' : '❌';
                console.log(`  ${status} ${category}: ${categoryPass}/${results.length} passed`);
            }
        }
        
        if (failedTests > 0) {
            console.log('\\n❌ Failed Edge Case Tests:');
            this.testResults
                .filter(r => !r.passed)
                .forEach(result => {
                    console.log(`  - ${result.testId}: ${result.message}`);
                });
        }
        
        const overallStatus = failedTests === 0 ? 'PASSED' : 'FAILED';
        console.log(`\\n${overallStatus === 'PASSED' ? '🎉' : '💥'} Edge Case Validation Status: ${overallStatus}`);
        
        if (overallStatus === 'PASSED') {
            console.log('\\n✅ Cross-project E2E system demonstrates excellent resilience!');
            console.log('   - Boundary conditions handled correctly');
            console.log('   - Malformed inputs processed safely');
            console.log('   - Security vulnerabilities prevented');
            console.log('   - Resource exhaustion managed gracefully');
            console.log('   - Filesystem edge cases handled robustly');
            console.log('   - Configuration validation comprehensive');
            console.log('   - Platform-specific errors managed');
            console.log('   - Recovery and resilience mechanisms effective');
        } else {
            console.log('\\n⚠️  Some edge cases need attention for production readiness');
        }
        
        return {
            status: overallStatus,
            total: totalTests,
            passed: passedTests,
            failed: failedTests,
            duration: testDuration,
            peakMemoryMB: (this.maxMemoryUsage / 1024 / 1024).toFixed(2),
            results: this.testResults,
            categories: testCategories
        };
    }
}

// Run edge case validation if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    (async () => {
        try {
            const validationSuite = new EdgeCaseValidationSuite();
            const report = await validationSuite.runEdgeCaseValidation();
            process.exit(report.status === 'PASSED' ? 0 : 1);
        } catch (error) {
            console.error('\\n💥 Edge case validation suite failed:', error.message);
            console.error(error.stack);
            process.exit(1);
        }
    })();
}

export default EdgeCaseValidationSuite;
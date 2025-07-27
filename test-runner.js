#!/usr/bin/env node

/**
 * Test Runner for Cross-Project E2E System
 * 
 * Validates that all test files can be imported and basic functionality works
 * without running the full test suites (which may require specific environment setup)
 */

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🧪 Cross-Project E2E Test Validation');
console.log('=' .repeat(50));

async function validateTestFiles() {
    const results = [];
    
    try {
        // Test 1: Validate ProjectManager can be imported and instantiated
        console.log('📋 Test 1: ProjectManager Import and Basic Functionality');
        
        const { default: ProjectManager } = await import('./lib/project-manager.js');
        const manager = new ProjectManager();
        
        console.log('  ✅ ProjectManager imported successfully');
        
        // Test basic methods
        const context = manager.detectProjectContext();
        console.log(`  ✅ Project context detected: ${context.projectName}`);
        console.log(`  ✅ Chrome port generated: ${context.chromePort}`);
        console.log(`  ✅ Tmux session name: ${context.tmuxSessionName}`);
        
        // Test public method accessibility
        const testName = manager.extractProjectName('/test/sample-project');
        const testHash = manager.generateProjectHash('/test/sample-project');
        const testPort = manager.generateChromePort(testHash);
        const testSession = manager.getTmuxSessionName(testName, testHash.substring(0, 8));
        const testLogDir = manager.getLogDirectory(testName, testHash.substring(0, 8));
        
        console.log('  ✅ All public methods accessible');
        
        results.push({ test: 'ProjectManager Functionality', status: 'PASSED' });
        
    } catch (error) {
        console.log(`  ❌ ProjectManager test failed: ${error.message}`);
        results.push({ test: 'ProjectManager Functionality', status: 'FAILED', error: error.message });
    }
    
    try {
        // Test 2: Validate test files can be imported
        console.log('\n📋 Test 2: Test File Import Validation');
        
        const { default: ProjectManagerTestSuite } = await import('./test/project-manager.test.js');
        console.log('  ✅ project-manager.test.js imported successfully');
        
        const { default: IntegrationTestSuite } = await import('./test/integration-test.js');
        console.log('  ✅ integration-test.js imported successfully');
        
        const { default: EdgeCaseValidationSuite } = await import('./test/edge-case-validation.js');
        console.log('  ✅ edge-case-validation.js imported successfully');
        
        results.push({ test: 'Test File Imports', status: 'PASSED' });
        
    } catch (error) {
        console.log(`  ❌ Test file import failed: ${error.message}`);
        results.push({ test: 'Test File Imports', status: 'FAILED', error: error.message });
    }
    
    try {
        // Test 3: Validate Configuration System
        console.log('\n📋 Test 3: Configuration System Validation');
        
        const { default: ProjectManager } = await import('./lib/project-manager.js');
        const manager = new ProjectManager();
        
        // Test configuration validation
        const validConfig = {
            maxIterations: 5,
            timeouts: {
                operatorPhase: 60000,
                claudePhase: 120000
            }
        };
        
        const sanitized = manager._validateConfig(validConfig);
        console.log('  ✅ Configuration validation working');
        
        // Test configuration schema
        const schema = manager.getConfigSchema();
        console.log('  ✅ Configuration schema available');
        
        // Test cache operations
        manager.clearConfigCache();
        console.log('  ✅ Configuration cache operations working');
        
        results.push({ test: 'Configuration System', status: 'PASSED' });
        
    } catch (error) {
        console.log(`  ❌ Configuration system test failed: ${error.message}`);
        results.push({ test: 'Configuration System', status: 'FAILED', error: error.message });
    }
    
    try {
        // Test 4: Validate Project Isolation Logic
        console.log('\n📋 Test 4: Project Isolation Logic Validation');
        
        const { default: ProjectManager } = await import('./lib/project-manager.js');
        
        // Test multiple project contexts
        const projects = [
            '/tmp/project-a',
            '/tmp/project-b', 
            '/tmp/project-c'
        ];
        
        const contexts = projects.map(projectPath => {
            const manager = new ProjectManager();
            const name = manager.extractProjectName(projectPath);
            const hash = manager.generateProjectHash(projectPath);
            const port = manager.generateChromePort(hash);
            const session = manager.getTmuxSessionName(name, hash.substring(0, 8));
            return { projectPath, name, hash, port, session };
        });
        
        // Verify uniqueness
        const ports = new Set(contexts.map(c => c.port));
        const sessions = new Set(contexts.map(c => c.session));
        
        if (ports.size === contexts.length) {
            console.log('  ✅ Chrome port isolation working');
        } else {
            throw new Error('Chrome port conflicts detected');
        }
        
        if (sessions.size === contexts.length) {
            console.log('  ✅ Tmux session isolation working');
        } else {
            throw new Error('Tmux session conflicts detected');
        }
        
        console.log(`  ✅ Generated ${contexts.length} unique project contexts`);
        
        results.push({ test: 'Project Isolation Logic', status: 'PASSED' });
        
    } catch (error) {
        console.log(`  ❌ Project isolation test failed: ${error.message}`);
        results.push({ test: 'Project Isolation Logic', status: 'FAILED', error: error.message });
    }
    
    // Generate summary
    console.log('\n📊 Test Validation Summary');
    console.log('=' .repeat(50));
    
    const passed = results.filter(r => r.status === 'PASSED').length;
    const failed = results.filter(r => r.status === 'FAILED').length;
    
    console.log(`Total Tests: ${results.length}`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    console.log(`Success Rate: ${((passed / results.length) * 100).toFixed(1)}%`);
    
    if (failed > 0) {
        console.log('\n❌ Failed Tests:');
        results
            .filter(r => r.status === 'FAILED')
            .forEach(result => {
                console.log(`  - ${result.test}: ${result.error}`);
            });
    }
    
    const overallStatus = failed === 0 ? 'PASSED' : 'FAILED';
    console.log(`\n${overallStatus === 'PASSED' ? '🎉' : '💥'} Overall Status: ${overallStatus}`);
    
    if (overallStatus === 'PASSED') {
        console.log('\n✅ All core functionality validated!');
        console.log('   - ProjectManager can be imported and used');
        console.log('   - Test files are syntactically correct');
        console.log('   - Configuration system is functional');
        console.log('   - Project isolation logic works correctly');
        console.log('\n💡 To run full test suites:');
        console.log('   node test/project-manager.test.js');
        console.log('   node test/integration-test.js');
        console.log('   node test/edge-case-validation.js');
    }
    
    return overallStatus === 'PASSED';
}

// Run validation
(async () => {
    try {
        const success = await validateTestFiles();
        process.exit(success ? 0 : 1);
    } catch (error) {
        console.error('\n💥 Test validation failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
})();
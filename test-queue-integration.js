#!/usr/bin/env node

/**
 * Queue Management Integration Test
 * Tests core functionality without requiring Chrome or Operator
 */

import { ConfigLoader } from './lib/config-loader.js';
import OperatorQueueManager from './lib/operator-queue-manager.js';
import { QueueMetrics } from './lib/queue-metrics.js';
import { CleanupStrategies } from './lib/cleanup-strategies.js';
import { HealthQueueMonitor } from './lib/health-queue-monitor.js';

// Test configuration
const TEST_CONFIG = {
    environment: 'development',
    testTimeout: 10000,
    verbose: true
};

// Test results tracking
const testResults = [];

function log(message, level = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = level === 'error' ? '❌' : level === 'success' ? '✅' : 'ℹ️';
    console.log(`${prefix} [${timestamp}] ${message}`);
}

function addTestResult(testName, passed, error = null) {
    testResults.push({
        name: testName,
        passed,
        error: error?.message || null,
        timestamp: Date.now()
    });
    
    if (passed) {
        log(`Test passed: ${testName}`, 'success');
    } else {
        log(`Test failed: ${testName} - ${error?.message}`, 'error');
    }
}

async function runTest(testName, testFunction) {
    try {
        log(`Running test: ${testName}`);
        await testFunction();
        addTestResult(testName, true);
    } catch (error) {
        addTestResult(testName, false, error);
    }
}

// Test 1: Configuration Loading
async function testConfigurationLoading() {
    const loader = new ConfigLoader({ 
        environment: 'development',
        configDir: './config'
    });
    
    const config = loader.loadConfig();
    
    if (!config) {
        throw new Error('Config loading returned null');
    }
    
    if (!config.queueManagement) {
        throw new Error('Queue management configuration not found');
    }
    
    const queueConfig = loader.getQueueManagementConfig();
    if (!queueConfig.enabled) {
        throw new Error('Queue management not enabled in config');
    }
    
    log(`Configuration loaded: ${Object.keys(config).length} top-level keys`);
    log(`Queue management enabled: ${queueConfig.enabled}`);
    log(`Cleanup threshold: ${queueConfig.autoCleanup?.threshold}`);
}

// Test 2: Queue Manager Initialization
async function testQueueManagerInitialization() {
    const manager = new OperatorQueueManager({
        autoCleanupThreshold: 5,
        preserveLatest: 2,
        debug: true,
        dryRun: true,
        enableCircuitBreaker: true,
        maxRetries: 2
    });
    
    const stats = manager.getStats();
    
    if (typeof stats !== 'object') {
        throw new Error('getStats() did not return an object');
    }
    
    if (stats.cleanupCount !== 0) {
        throw new Error('Initial cleanup count should be 0');
    }
    
    if (stats.successRate !== 1.0) {
        throw new Error('Initial success rate should be 1.0');
    }
    
    log(`Queue manager initialized with success rate: ${stats.successRate}`);
}

// Test 3: Metrics System
async function testMetricsSystem() {
    const metrics = new QueueMetrics({
        enablePersistence: false,
        enableRealTimeUpdates: false,
        metricsDir: './test-metrics'
    });
    
    // Record some test events
    metrics.recordQueueSize(10, { context: 'test' });
    metrics.recordCleanup({
        success: true,
        deleted: 5,
        failed: 0,
        duration: 1500
    }, 'smart', 'test');
    
    const report = metrics.generateReport();
    
    if (!report.summary) {
        throw new Error('Report missing summary section');
    }
    
    if (report.summary.totalCleanups !== 1) {
        throw new Error('Expected 1 cleanup in report');
    }
    
    log(`Metrics report generated with ${report.summary.totalCleanups} cleanups`);
}

// Test 4: Cleanup Strategies
async function testCleanupStrategies() {
    // Mock page object for testing
    const mockPage = {
        evaluate: async (fn, ...args) => {
            // Simulate different page states
            if (fn.toString().includes('getConversationCount')) {
                return 8; // Mock conversation count
            }
            
            if (fn.toString().includes('querySelectorAll')) {
                // Mock conversations
                return Array.from({ length: 8 }, (_, i) => ({
                    index: i,
                    text: `Conversation ${i}`,
                    matches: i % 2 === 0, // Every other conversation matches
                    isOld: i < 4, // First 4 are old
                    hasError: i === 1 // Second conversation has error
                }));
            }
            
            // Mock cleanup result
            return { successCount: 3, failCount: 0 };
        }
    };
    
    // Test smart cleanup with dry run
    const smartResult = await CleanupStrategies.smartCleanup(mockPage, {
        dryRun: true,
        preserveLatest: 2
    });
    
    if (!smartResult.dryRun) {
        throw new Error('Smart cleanup dry run flag not set');
    }
    
    // Test age-based cleanup
    const ageResult = await CleanupStrategies.deleteByAge(mockPage, 30, {
        dryRun: true
    });
    
    if (!ageResult.dryRun) {
        throw new Error('Age cleanup dry run flag not set');
    }
    
    log(`Smart cleanup would delete: ${smartResult.wouldDelete} conversations`);
    log(`Age cleanup would delete: ${ageResult.wouldDelete} conversations`);
}

// Test 5: Health Queue Monitor
async function testHealthQueueMonitor() {
    const monitor = new HealthQueueMonitor({
        checkInterval: 1000,
        enableAutoTriggers: false, // Don't start monitoring automatically
        memoryThresholdMB: 100,
        logger: (msg) => log(`[Monitor] ${msg}`)
    });
    
    const stats = monitor.getMonitoringStats();
    
    if (stats.isMonitoring !== false) {
        throw new Error('Monitor should not be running initially');
    }
    
    if (stats.totalChecks !== 0) {
        throw new Error('Initial check count should be 0');
    }
    
    log(`Health monitor initialized, monitoring: ${stats.isMonitoring}`);
}

// Test 6: Integration Test
async function testComponentIntegration() {
    // Test that all components can work together
    const loader = new ConfigLoader({ environment: 'development' });
    const config = loader.loadConfig();
    
    const queueConfig = config.queueManagement;
    
    const manager = new OperatorQueueManager({
        autoCleanupThreshold: queueConfig.autoCleanup?.threshold || 5,
        preserveLatest: queueConfig.autoCleanup?.preserveLatest || 2,
        enableCircuitBreaker: queueConfig.advanced?.enableCircuitBreaker,
        dryRun: true
    });
    
    const metrics = new QueueMetrics({
        enablePersistence: false
    });
    
    const monitor = new HealthQueueMonitor({
        enableAutoTriggers: false,
        logger: () => {} // Silent logger for test
    });
    
    // Simulate some integration
    const stats = manager.getStats();
    const report = metrics.generateReport();
    const monitorStats = monitor.getMonitoringStats();
    
    if (!stats || !report || !monitorStats) {
        throw new Error('Component integration failed - missing data');
    }
    
    log('All components integrated successfully');
}

// Main test execution
async function runAllTests() {
    log('🧪 Starting Queue Management Integration Tests');
    log(`Environment: ${TEST_CONFIG.environment}`);
    
    const tests = [
        ['Configuration Loading', testConfigurationLoading],
        ['Queue Manager Initialization', testQueueManagerInitialization],
        ['Metrics System', testMetricsSystem],
        ['Cleanup Strategies', testCleanupStrategies],
        ['Health Queue Monitor', testHealthQueueMonitor],
        ['Component Integration', testComponentIntegration]
    ];
    
    for (const [testName, testFunction] of tests) {
        await runTest(testName, testFunction);
    }
    
    // Generate test report
    const passedTests = testResults.filter(r => r.passed).length;
    const totalTests = testResults.length;
    const successRate = (passedTests / totalTests) * 100;
    
    log('\n📊 Test Results Summary:');
    log(`Total tests: ${totalTests}`);
    log(`Passed: ${passedTests}`);
    log(`Failed: ${totalTests - passedTests}`);
    log(`Success rate: ${successRate.toFixed(1)}%`);
    
    if (successRate === 100) {
        log('🎉 All tests passed! Queue management integration is ready.', 'success');
    } else {
        log('⚠️  Some tests failed. Check the details above.', 'error');
        
        // Show failed tests
        const failedTests = testResults.filter(r => !r.passed);
        if (failedTests.length > 0) {
            log('\n❌ Failed tests:');
            failedTests.forEach(test => {
                log(`  - ${test.name}: ${test.error}`);
            });
        }
    }
    
    return successRate === 100;
}

// Run tests and exit with appropriate code
runAllTests().then(success => {
    process.exit(success ? 0 : 1);
}).catch(error => {
    log(`Fatal error during testing: ${error.message}`, 'error');
    process.exit(1);
});
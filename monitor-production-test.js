#!/usr/bin/env node

/**
 * Production Test Monitor
 * Real-time monitoring of shared lock behavior during e2e execution
 * Compares actual results against PRODUCTION_HYPOTHESIS.md
 */

import { spawn } from 'child_process';
import { readFile } from 'fs/promises';

class ProductionTestMonitor {
    constructor() {
        this.startTime = Date.now();
        this.observations = {
            lockActivity: [],
            duplicatePrevention: [],
            performance: [],
            systemBehavior: []
        };
        this.hypothesisResults = {
            duplicateElimination: null,
            lockActivityLogs: null,
            performanceImpact: null,
            systemStability: null
        };
    }

    log(message, category = 'INFO') {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] [${category}] ${message}`);
    }

    async captureSharedLockActivity() {
        try {
            // Capture tmux session output
            const result = spawn('tmux', ['capture-pane', '-t', 'operator:5', '-S', '-2000', '-p']);
            let output = '';
            
            result.stdout.on('data', (data) => {
                output += data.toString();
            });

            await new Promise((resolve) => {
                result.on('close', resolve);
            });

            // Extract shared lock messages
            const lockMessages = output.split('\n')
                .filter(line => line.includes('SHARED_LOCK'))
                .map(line => ({
                    timestamp: this.extractTimestamp(line),
                    message: line.trim(),
                    type: this.classifyLockMessage(line)
                }));

            return lockMessages;
        } catch (error) {
            this.log(`Error capturing lock activity: ${error.message}`, 'ERROR');
            return [];
        }
    }

    extractTimestamp(line) {
        const match = line.match(/\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\]/);
        return match ? match[1] : new Date().toISOString();
    }

    classifyLockMessage(line) {
        if (line.includes('LOCK ACQUIRED')) return 'ACQUISITION';
        if (line.includes('LOCK RELEASED')) return 'RELEASE';
        if (line.includes('DUPLICATE BLOCKED')) return 'DUPLICATE_BLOCKED';
        if (line.includes('initialized')) return 'INITIALIZATION';
        return 'OTHER';
    }

    async analyzeAgainstHypothesis() {
        const lockActivity = await this.captureSharedLockActivity();
        
        this.log('🔍 PRODUCTION TEST ANALYSIS', 'ANALYSIS');
        this.log('=' .repeat(50), 'ANALYSIS');
        
        // Test 1: Lock Initialization
        const initMessages = lockActivity.filter(msg => msg.type === 'INITIALIZATION');
        if (initMessages.length > 0) {
            this.log('✅ SUCCESS: SharedLock initialized correctly', 'SUCCESS');
            this.hypothesisResults.systemStability = 'SUCCESS';
        } else {
            this.log('❌ FAILURE: SharedLock not initialized', 'FAILURE');
            this.hypothesisResults.systemStability = 'FAILURE';
        }

        // Test 2: Lock Acquisition
        const acquisitions = lockActivity.filter(msg => msg.type === 'ACQUISITION');
        if (acquisitions.length > 0) {
            this.log(`✅ SUCCESS: Lock acquired ${acquisitions.length} times`, 'SUCCESS');
            this.log(`   Acquisitions: ${acquisitions.map(a => a.message).join(', ')}`, 'INFO');
            this.hypothesisResults.lockActivityLogs = 'SUCCESS';
        } else {
            this.log('⚠️  WARNING: No lock acquisitions detected yet', 'WARNING');
            this.hypothesisResults.lockActivityLogs = 'PENDING';
        }

        // Test 3: Duplicate Prevention
        const duplicatesBlocked = lockActivity.filter(msg => msg.type === 'DUPLICATE_BLOCKED');
        if (duplicatesBlocked.length > 0) {
            this.log(`✅ SUCCESS: ${duplicatesBlocked.length} duplicates blocked`, 'SUCCESS');
            this.log(`   Blocked: ${duplicatesBlocked.map(d => d.message).join(', ')}`, 'INFO');
            this.hypothesisResults.duplicateElimination = 'SUCCESS';
        } else {
            this.log('ℹ️  INFO: No duplicates blocked yet (normal if single layer active)', 'INFO');
            this.hypothesisResults.duplicateElimination = 'PENDING';
        }

        // Test 4: Lock Releases
        const releases = lockActivity.filter(msg => msg.type === 'RELEASE');
        if (releases.length === acquisitions.length) {
            this.log('✅ SUCCESS: Perfect lock efficiency (acquisitions = releases)', 'SUCCESS');
        } else if (releases.length < acquisitions.length) {
            this.log(`⚠️  WARNING: ${acquisitions.length - releases.length} locks not yet released`, 'WARNING');
        } else {
            this.log('❌ FAILURE: More releases than acquisitions (data corruption?)', 'FAILURE');
        }

        return this.hypothesisResults;
    }

    async compareToHypothesis() {
        this.log('📊 COMPARING RESULTS TO PRODUCTION_HYPOTHESIS.md', 'ANALYSIS');
        
        const hypothesisExpectations = {
            'Lock Activity Logs': {
                expected: 'SEND LOCK ACQUIRED: e2e-executor',
                actual: this.hypothesisResults.lockActivityLogs,
                status: this.hypothesisResults.lockActivityLogs === 'SUCCESS' ? '✅' : '⚠️'
            },
            'Duplicate Prevention': {
                expected: 'DUPLICATE BLOCKED messages when multiple layers attempt access',
                actual: this.hypothesisResults.duplicateElimination,
                status: this.hypothesisResults.duplicateElimination === 'SUCCESS' ? '✅' : 'ℹ️'
            },
            'System Stability': {
                expected: 'No deadlocks, proper initialization',
                actual: this.hypothesisResults.systemStability,
                status: this.hypothesisResults.systemStability === 'SUCCESS' ? '✅' : '❌'
            }
        };

        this.log('\n📋 HYPOTHESIS VALIDATION RESULTS:', 'ANALYSIS');
        this.log('-'.repeat(50), 'ANALYSIS');
        
        for (const [test, result] of Object.entries(hypothesisExpectations)) {
            this.log(`${result.status} ${test}: ${result.actual || 'PENDING'}`, 'RESULT');
            this.log(`   Expected: ${result.expected}`, 'INFO');
        }
    }

    async monitorContinuous() {
        this.log('🚀 Starting continuous production monitoring...', 'INFO');
        this.log('Monitoring shared lock behavior during e2e execution', 'INFO');
        
        let iteration = 1;
        while (true) {
            this.log(`\n🔄 Monitoring iteration ${iteration}`, 'INFO');
            
            await this.analyzeAgainstHypothesis();
            await this.compareToHypothesis();
            
            this.log(`\n⏳ Waiting 30 seconds before next check...`, 'INFO');
            await new Promise(resolve => setTimeout(resolve, 30000));
            iteration++;
        }
    }
}

// Run the monitor
if (import.meta.url === `file://${process.argv[1]}`) {
    const monitor = new ProductionTestMonitor();
    
    if (process.argv[2] === '--continuous') {
        monitor.monitorContinuous().catch(console.error);
    } else {
        // Single analysis
        monitor.analyzeAgainstHypothesis()
            .then(() => monitor.compareToHypothesis())
            .catch(console.error);
    }
}

export { ProductionTestMonitor };
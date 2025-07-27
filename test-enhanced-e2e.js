#!/usr/bin/env node

/**
 * Test script for enhanced E2E system
 * Verifies all new reliability features are working
 */

import { execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

async function testEnhancedE2E() {
    console.log('🧪 Testing Enhanced E2E System...\n');
    
    const tests = [
        {
            name: 'Module Imports',
            test: async () => {
                try {
                    const modules = [
                        './lib/retry-utility.js',
                        './lib/health-check.js',
                        './lib/code-change-verifier.js',
                        './lib/session-recovery.js',
                        './lib/phase-duration-enforcer.js',
                        './lib/monitoring-alerts.js'
                    ];
                    
                    for (const module of modules) {
                        await import(module);
                    }
                    return { success: true, message: 'All modules load successfully' };
                } catch (error) {
                    return { success: false, message: error.message };
                }
            }
        },
        {
            name: 'Chrome Connection',
            test: async () => {
                try {
                    const isRunning = execSync('ps aux | grep -i chrome | grep remote-debugging-port | grep -v grep', { encoding: 'utf-8' });
                    if (isRunning) {
                        return { success: true, message: 'Chrome is running with debugging port' };
                    }
                    return { success: false, message: 'Chrome not running with debugging port' };
                } catch (error) {
                    return { success: false, message: 'Chrome not found' };
                }
            }
        },
        {
            name: 'Tmux Session',
            test: async () => {
                try {
                    const sessions = execSync('tmux list-sessions 2>/dev/null || true', { encoding: 'utf-8' });
                    if (sessions.includes('claude-code')) {
                        return { success: true, message: 'Claude tmux session exists' };
                    }
                    return { success: false, message: 'Claude tmux session not found' };
                } catch (error) {
                    return { success: false, message: 'Tmux not available' };
                }
            }
        },
        {
            name: 'Log Directory',
            test: async () => {
                try {
                    const logDir = path.join(process.cwd(), 'logs');
                    await fs.access(logDir);
                    return { success: true, message: 'Log directory exists' };
                } catch (error) {
                    try {
                        await fs.mkdir(path.join(process.cwd(), 'logs'), { recursive: true });
                        return { success: true, message: 'Log directory created' };
                    } catch (e) {
                        return { success: false, message: 'Cannot create log directory' };
                    }
                }
            }
        },
        {
            name: 'Git Repository',
            test: async () => {
                try {
                    execSync('git status', { encoding: 'utf-8' });
                    return { success: true, message: 'Git repository detected' };
                } catch (error) {
                    return { success: false, message: 'Not a git repository' };
                }
            }
        }
    ];
    
    const results = [];
    
    for (const { name, test } of tests) {
        process.stdout.write(`Testing ${name}... `);
        const result = await test();
        results.push({ name, ...result });
        console.log(result.success ? '✅' : '❌');
        if (!result.success) {
            console.log(`  Issue: ${result.message}`);
        }
    }
    
    console.log('\n📊 Test Summary:');
    const passed = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    console.log(`  Passed: ${passed}`);
    console.log(`  Failed: ${failed}`);
    
    if (failed > 0) {
        console.log('\n⚠️  Some tests failed. Please address the issues before running E2E tests.');
        console.log('\nRequired setup:');
        console.log('1. Start Chrome with: google-chrome --remote-debugging-port=9222');
        console.log('2. Create tmux session: tmux new-session -d -s claude-code');
        console.log('3. Ensure you are in a git repository');
        process.exit(1);
    } else {
        console.log('\n✅ All tests passed! The enhanced E2E system is ready to use.');
        console.log('\nTo run E2E tests:');
        console.log('  node operator.execute_e2e.js <qa_ux_file.json>');
    }
}

// Run tests
testEnhancedE2E().catch(error => {
    console.error('❌ Test execution failed:', error);
    process.exit(1);
});
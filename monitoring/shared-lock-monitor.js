#!/usr/bin/env node

/**
 * Shared Lock Monitoring Dashboard
 * Real-time monitoring of the shared lock system
 */

import { sharedLock } from '../shared-state.js';
import readline from 'readline';

class SharedLockMonitor {
    constructor() {
        this.isRunning = true;
        this.refreshInterval = 1000; // 1 second
        this.lastMetrics = null;
    }

    clearScreen() {
        console.clear();
        readline.cursorTo(process.stdout, 0, 0);
        readline.clearScreenDown(process.stdout);
    }

    formatDuration(ms) {
        if (ms < 1000) return `${ms}ms`;
        if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
        return `${(ms / 60000).toFixed(1)}min`;
    }

    displayDashboard() {
        this.clearScreen();
        
        const metrics = sharedLock.getMetrics();
        const status = sharedLock.getLockStatus();
        const timestamp = new Date().toISOString();
        
        console.log('╔════════════════════════════════════════════════════════════════╗');
        console.log('║             SHARED LOCK SYSTEM MONITOR                         ║');
        console.log('╠════════════════════════════════════════════════════════════════╣');
        console.log(`║ Time: ${timestamp}                       ║`);
        console.log('╚════════════════════════════════════════════════════════════════╝');
        
        // Current Lock Status
        console.log('\n📊 CURRENT LOCK STATUS');
        console.log('─────────────────────');
        if (status.isSendingToClaude) {
            console.log(`🔒 LOCKED by: ${status.sendingLayerId}`);
            console.log(`⏱️  Duration: ${this.formatDuration(status.lockAge)}`);
            console.log(`🕐 Started: ${new Date(status.lockStartTime).toLocaleTimeString()}`);
        } else {
            console.log('🔓 UNLOCKED - Available for acquisition');
            if (status.cooldownRemaining > 0) {
                console.log(`⏸️  Cooldown: ${this.formatDuration(status.cooldownRemaining)} remaining`);
            }
        }
        
        // Metrics Summary
        console.log('\n📈 METRICS SUMMARY');
        console.log('─────────────────');
        console.log(`Total Acquisitions: ${metrics.totalAcquisitions}`);
        console.log(`Total Releases: ${metrics.totalReleases}`);
        console.log(`Duplicates Blocked: ${metrics.duplicatesBlocked} (${metrics.duplicateRate})`);
        console.log(`Force Releases: ${metrics.forceReleases}`);
        console.log(`Lock Efficiency: ${metrics.lockEfficiency}`);
        console.log(`Avg Lock Duration: ${metrics.averageLockDuration || 'N/A'}`);
        
        // Performance Indicators
        console.log('\n⚡ PERFORMANCE');
        console.log('─────────────');
        const duplicateRateNum = parseFloat(metrics.duplicateRate);
        if (duplicateRateNum > 0) {
            console.log(`✅ Duplicate Prevention: ACTIVE (${metrics.duplicateRate} blocked)`);
        } else {
            console.log('⚠️  Duplicate Prevention: No duplicates detected yet');
        }
        
        if (metrics.forceReleases > 0) {
            console.log(`⚠️  Force Releases: ${metrics.forceReleases} (possible stuck locks)`);
        } else {
            console.log('✅ Force Releases: None (healthy)');
        }
        
        // Recent Activity
        console.log('\n📜 RECENT ACTIVITY');
        console.log('─────────────────');
        const recentActivity = metrics.recentActivity.slice(-5);
        if (recentActivity.length === 0) {
            console.log('No recent activity');
        } else {
            recentActivity.forEach(activity => {
                const time = new Date(activity.timestamp).toLocaleTimeString();
                const icon = activity.action === 'acquired' ? '🔒' :
                           activity.action === 'released' ? '🔓' :
                           activity.action.includes('blocked') ? '🚫' : '⚠️';
                const duration = activity.duration ? ` (${activity.duration}ms)` : '';
                console.log(`${time} ${icon} ${activity.layerId}: ${activity.action}${duration}`);
            });
        }
        
        // Health Status
        console.log('\n🏥 HEALTH STATUS');
        console.log('───────────────');
        const health = this.calculateHealth(metrics, status);
        console.log(`Overall Health: ${health.icon} ${health.status}`);
        health.issues.forEach(issue => console.log(`  - ${issue}`));
        
        console.log('\n───────────────────────────────────────────────────────────────');
        console.log('Press Ctrl+C to exit | Updates every second');
    }

    calculateHealth(metrics, status) {
        const issues = [];
        let healthScore = 100;
        
        // Check for stuck locks
        if (status.isSendingToClaude && status.lockAge > 60000) {
            issues.push('⚠️  Lock held for over 1 minute');
            healthScore -= 20;
        }
        
        // Check force releases
        if (metrics.forceReleases > 0) {
            issues.push(`⚠️  ${metrics.forceReleases} force releases detected`);
            healthScore -= 10 * metrics.forceReleases;
        }
        
        // Check efficiency
        const efficiency = parseFloat(metrics.lockEfficiency);
        if (efficiency < 95) {
            issues.push('⚠️  Lock efficiency below 95%');
            healthScore -= 15;
        }
        
        // Check if system is active
        if (metrics.totalAcquisitions === 0) {
            issues.push('ℹ️  No lock activity detected');
        }
        
        // Determine overall status
        let status = 'HEALTHY';
        let icon = '🟢';
        
        if (healthScore >= 90) {
            status = 'HEALTHY';
            icon = '🟢';
        } else if (healthScore >= 70) {
            status = 'WARNING';
            icon = '🟡';
        } else {
            status = 'CRITICAL';
            icon = '🔴';
        }
        
        if (issues.length === 0) {
            issues.push('✅ All systems operating normally');
        }
        
        return { status, icon, issues, score: healthScore };
    }

    async start() {
        console.log('Starting Shared Lock Monitor...');
        
        // Set up graceful shutdown
        process.on('SIGINT', () => {
            console.log('\n\nShutting down monitor...');
            this.isRunning = false;
            process.exit(0);
        });
        
        // Main monitoring loop
        while (this.isRunning) {
            this.displayDashboard();
            await new Promise(resolve => setTimeout(resolve, this.refreshInterval));
        }
    }
}

// Run the monitor
if (import.meta.url === `file://${process.argv[1]}`) {
    const monitor = new SharedLockMonitor();
    monitor.start().catch(console.error);
}

export { SharedLockMonitor };
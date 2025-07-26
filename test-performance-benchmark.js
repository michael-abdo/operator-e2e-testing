#!/usr/bin/env node

/**
 * Performance Benchmark Suite
 * Measures the performance impact of the shared lock implementation
 */

import { sharedLock } from './shared-state.js';
import { performance } from 'perf_hooks';

class PerformanceBenchmark {
    constructor() {
        this.results = [];
        this.iterations = 1000;
    }

    /**
     * Measure baseline performance without locks
     */
    async measureBaseline() {
        console.log('📊 Measuring baseline performance (no locks)...');
        
        const times = [];
        
        for (let i = 0; i < this.iterations; i++) {
            const start = performance.now();
            
            // Simulate message sending operation
            await this.simulateOperation();
            
            const end = performance.now();
            times.push(end - start);
        }
        
        return this.calculateStats(times);
    }

    /**
     * Measure performance with shared lock
     */
    async measureWithLock() {
        console.log('🔒 Measuring performance with shared lock...');
        
        // Reset metrics
        sharedLock.resetMetrics();
        
        const times = [];
        const blockCounts = { acquired: 0, blocked: 0 };
        
        for (let i = 0; i < this.iterations; i++) {
            const start = performance.now();
            
            const acquired = sharedLock.tryAcquireSendLock('e2e-executor');
            
            if (acquired) {
                blockCounts.acquired++;
                await this.simulateOperation();
                sharedLock.releaseSendLock('e2e-executor');
            } else {
                blockCounts.blocked++;
            }
            
            const end = performance.now();
            times.push(end - start);
        }
        
        const stats = this.calculateStats(times);
        stats.blockCounts = blockCounts;
        return stats;
    }

    /**
     * Measure concurrent performance
     */
    async measureConcurrent() {
        console.log('🔄 Measuring concurrent access performance...');
        
        // Reset metrics
        sharedLock.resetMetrics();
        
        const concurrentOps = 10;
        const results = [];
        
        const promises = [];
        for (let i = 0; i < concurrentOps; i++) {
            promises.push(this.concurrentOperation(`layer-${i}`));
        }
        
        const start = performance.now();
        const operationResults = await Promise.all(promises);
        const end = performance.now();
        
        const successCount = operationResults.filter(r => r.acquired).length;
        const blockedCount = operationResults.filter(r => !r.acquired).length;
        
        return {
            totalTime: end - start,
            operationsPerSecond: (concurrentOps / ((end - start) / 1000)).toFixed(2),
            successCount,
            blockedCount,
            blockRate: ((blockedCount / concurrentOps) * 100).toFixed(2) + '%'
        };
    }

    /**
     * Simulate a single concurrent operation
     */
    async concurrentOperation(layerId) {
        const start = performance.now();
        // Use valid layer IDs
        const validLayerId = layerId === 'layer-0' ? 'e2e-executor' : 
                           layerId === 'layer-1' ? 'window-monitor' : 
                           layerId === 'layer-2' ? 'chain-loop-monitor' : 'e2e-executor';
        const acquired = sharedLock.tryAcquireSendLock(validLayerId);
        
        if (acquired) {
            await this.simulateOperation();
            sharedLock.releaseSendLock(validLayerId);
        }
        
        const end = performance.now();
        
        return {
            layerId,
            acquired,
            time: end - start
        };
    }

    /**
     * Measure lock overhead
     */
    async measureLockOverhead() {
        console.log('⏱️ Measuring lock acquisition/release overhead...');
        
        const times = {
            acquire: [],
            release: [],
            full: []
        };
        
        // Disable cooldown for accurate measurements
        const originalCooldown = sharedLock.COOLDOWN_MS;
        sharedLock.COOLDOWN_MS = 0;
        
        for (let i = 0; i < this.iterations; i++) {
            // Measure acquire time
            const acquireStart = performance.now();
            const acquired = sharedLock.tryAcquireSendLock('e2e-executor');
            const acquireEnd = performance.now();
            
            if (acquired) {
                times.acquire.push(acquireEnd - acquireStart);
                
                // Measure release time
                const releaseStart = performance.now();
                sharedLock.releaseSendLock('e2e-executor');
                const releaseEnd = performance.now();
                
                times.release.push(releaseEnd - releaseStart);
                times.full.push((acquireEnd - acquireStart) + (releaseEnd - releaseStart));
            }
        }
        
        // Restore cooldown
        sharedLock.COOLDOWN_MS = originalCooldown;
        
        return {
            acquire: this.calculateStats(times.acquire),
            release: this.calculateStats(times.release),
            full: this.calculateStats(times.full)
        };
    }

    /**
     * Simulate an operation (like sending to Claude)
     */
    async simulateOperation() {
        // Simulate some async work
        await new Promise(resolve => setImmediate(resolve));
        
        // Simulate string processing
        const testString = 'operator analysis ' + Math.random();
        const processed = testString.toLowerCase().includes('operator');
        
        return processed;
    }

    /**
     * Calculate statistics from timing data
     */
    calculateStats(times) {
        if (!times || times.length === 0) {
            return {
                count: 0,
                mean: '0.000',
                median: '0.000',
                p95: '0.000',
                p99: '0.000',
                min: '0.000',
                max: '0.000'
            };
        }
        
        const sorted = times.sort((a, b) => a - b);
        const sum = times.reduce((a, b) => a + b, 0);
        
        return {
            count: times.length,
            mean: (sum / times.length).toFixed(3),
            median: sorted[Math.floor(times.length / 2)].toFixed(3),
            p95: sorted[Math.floor(times.length * 0.95)].toFixed(3),
            p99: sorted[Math.floor(times.length * 0.99)].toFixed(3),
            min: sorted[0].toFixed(3),
            max: sorted[sorted.length - 1].toFixed(3)
        };
    }

    /**
     * Run all benchmarks
     */
    async runBenchmarks() {
        console.log('🚀 Starting Performance Benchmark Suite');
        console.log('=====================================');
        console.log(`Iterations per test: ${this.iterations}`);
        console.log('');
        
        // Run benchmarks
        const baseline = await this.measureBaseline();
        const withLock = await this.measureWithLock();
        const concurrent = await this.measureConcurrent();
        const overhead = await this.measureLockOverhead();
        
        // Calculate impact
        const impactPercent = (((parseFloat(withLock.mean) - parseFloat(baseline.mean)) / parseFloat(baseline.mean)) * 100).toFixed(2);
        
        // Print results
        console.log('\n📈 BENCHMARK RESULTS');
        console.log('===================');
        
        console.log('\n1️⃣ Baseline (No Lock):');
        console.log(`   Mean: ${baseline.mean}ms`);
        console.log(`   Median: ${baseline.median}ms`);
        console.log(`   P95: ${baseline.p95}ms`);
        console.log(`   P99: ${baseline.p99}ms`);
        
        console.log('\n2️⃣ With Shared Lock:');
        console.log(`   Mean: ${withLock.mean}ms`);
        console.log(`   Median: ${withLock.median}ms`);
        console.log(`   P95: ${withLock.p95}ms`);
        console.log(`   P99: ${withLock.p99}ms`);
        console.log(`   Acquired: ${withLock.blockCounts.acquired}`);
        console.log(`   Blocked: ${withLock.blockCounts.blocked}`);
        
        console.log('\n3️⃣ Concurrent Operations:');
        console.log(`   Total Time: ${concurrent.totalTime.toFixed(3)}ms`);
        console.log(`   Ops/Second: ${concurrent.operationsPerSecond}`);
        console.log(`   Success Rate: ${concurrent.successCount}/10`);
        console.log(`   Block Rate: ${concurrent.blockRate}`);
        
        console.log('\n4️⃣ Lock Overhead:');
        console.log(`   Acquire: ${overhead.acquire.mean}ms (mean)`);
        console.log(`   Release: ${overhead.release.mean}ms (mean)`);
        console.log(`   Total: ${overhead.full.mean}ms (mean)`);
        
        console.log('\n📊 PERFORMANCE IMPACT');
        console.log('====================');
        console.log(`   Impact: ${impactPercent > 0 ? '+' : ''}${impactPercent}%`);
        
        if (Math.abs(parseFloat(impactPercent)) < 5) {
            console.log('   ✅ Minimal performance impact (<5%)');
        } else if (Math.abs(parseFloat(impactPercent)) < 10) {
            console.log('   ⚠️ Moderate performance impact (5-10%)');
        } else {
            console.log('   ❌ Significant performance impact (>10%)');
        }
        
        // Memory usage
        const memUsage = process.memoryUsage();
        console.log('\n💾 MEMORY USAGE');
        console.log('===============');
        console.log(`   Heap Used: ${(memUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`);
        console.log(`   RSS: ${(memUsage.rss / 1024 / 1024).toFixed(2)} MB`);
        
        // Lock metrics
        const lockMetrics = sharedLock.getMetrics();
        console.log('\n🔒 LOCK METRICS');
        console.log('===============');
        console.log(`   Total Acquisitions: ${lockMetrics.totalAcquisitions}`);
        console.log(`   Duplicates Blocked: ${lockMetrics.duplicatesBlocked}`);
        console.log(`   Lock Efficiency: ${lockMetrics.lockEfficiency}`);
        console.log(`   Duplicate Rate: ${lockMetrics.duplicateRate}`);
        
        console.log('\n✨ Benchmark Complete!');
        
        return {
            baseline,
            withLock,
            concurrent,
            overhead,
            impactPercent: parseFloat(impactPercent)
        };
    }
}

// Run benchmarks
if (import.meta.url === `file://${process.argv[1]}`) {
    const benchmark = new PerformanceBenchmark();
    benchmark.runBenchmarks().then(results => {
        process.exit(0);
    }).catch(error => {
        console.error('Benchmark error:', error);
        process.exit(1);
    });
}

export { PerformanceBenchmark };
#!/usr/bin/env node

/**
 * Simple Performance Test
 * Quick performance measurement of the shared lock system
 */

import { sharedLock } from './shared-state.js';
import { performance } from 'perf_hooks';

async function runSimplePerformanceTest() {
    console.log('🚀 Simple Performance Test');
    console.log('=========================\n');
    
    // Disable cooldown for performance testing
    const originalCooldown = sharedLock.COOLDOWN_MS;
    sharedLock.COOLDOWN_MS = 0;
    
    // Reset metrics
    sharedLock.resetMetrics();
    
    // Test 1: Lock acquisition and release timing
    console.log('1️⃣ Testing lock acquisition/release speed:');
    const timings = [];
    
    for (let i = 0; i < 100; i++) {
        const start = performance.now();
        
        const acquired = sharedLock.tryAcquireSendLock('e2e-executor');
        if (acquired) {
            sharedLock.releaseSendLock('e2e-executor');
        }
        
        const end = performance.now();
        timings.push(end - start);
    }
    
    const avgTime = timings.reduce((a, b) => a + b, 0) / timings.length;
    console.log(`   Average time: ${avgTime.toFixed(3)}ms`);
    console.log(`   Min time: ${Math.min(...timings).toFixed(3)}ms`);
    console.log(`   Max time: ${Math.max(...timings).toFixed(3)}ms`);
    
    // Test 2: Concurrent access simulation
    console.log('\n2️⃣ Testing concurrent access:');
    const start = performance.now();
    
    const promises = [];
    for (let i = 0; i < 10; i++) {
        promises.push(simulateConcurrentAccess(`layer-${i % 3}`));
    }
    
    const results = await Promise.all(promises);
    const end = performance.now();
    
    const successCount = results.filter(r => r).length;
    console.log(`   Total time: ${(end - start).toFixed(3)}ms`);
    console.log(`   Success rate: ${successCount}/10`);
    console.log(`   Operations/second: ${(10 / ((end - start) / 1000)).toFixed(0)}`);
    
    // Test 3: Lock contention
    console.log('\n3️⃣ Testing lock contention:');
    sharedLock.resetMetrics();
    
    // Acquire lock
    sharedLock.tryAcquireSendLock('e2e-executor');
    
    // Try to acquire from different layers
    const blocked = [];
    blocked.push(!sharedLock.tryAcquireSendLock('window-monitor'));
    blocked.push(!sharedLock.tryAcquireSendLock('chain-loop-monitor'));
    blocked.push(!sharedLock.tryAcquireSendLock('e2e-executor'));
    
    // Release
    sharedLock.releaseSendLock('e2e-executor');
    
    const blockedCount = blocked.filter(b => b).length;
    console.log(`   Blocked attempts: ${blockedCount}/3`);
    console.log(`   Lock efficiency: ${sharedLock.getMetrics().lockEfficiency}`);
    
    // Final metrics
    console.log('\n📊 Final Metrics:');
    const metrics = sharedLock.getMetrics();
    console.log(`   Total acquisitions: ${metrics.totalAcquisitions}`);
    console.log(`   Duplicates blocked: ${metrics.duplicatesBlocked}`);
    console.log(`   Duplicate rate: ${metrics.duplicateRate}`);
    
    // Performance impact estimate
    console.log('\n💡 Performance Impact:');
    console.log(`   Lock overhead: ~${avgTime.toFixed(3)}ms per operation`);
    console.log(`   Impact level: ${avgTime < 0.1 ? '✅ Negligible' : avgTime < 1 ? '⚠️ Minor' : '❌ Significant'}`);
    
    // Restore cooldown
    sharedLock.COOLDOWN_MS = originalCooldown;
    
    console.log('\n✨ Test complete!');
}

async function simulateConcurrentAccess(layerId) {
    const validLayer = layerId === 'layer-0' ? 'e2e-executor' :
                      layerId === 'layer-1' ? 'window-monitor' :
                      'chain-loop-monitor';
    
    const acquired = sharedLock.tryAcquireSendLock(validLayer);
    
    if (acquired) {
        // Simulate some work
        await new Promise(resolve => setImmediate(resolve));
        sharedLock.releaseSendLock(validLayer);
        return true;
    }
    
    return false;
}

// Run the test
runSimplePerformanceTest().catch(console.error);
#!/usr/bin/env node

/**
 * Test for WindowKeywordMonitor executeChainAction Override
 * Verifies that our fix properly emits keyword_detected event
 */

import WindowKeywordMonitor from './lib/monitors/WindowKeywordMonitor.js';

async function testKeywordDetectionFix() {
    console.log('🧪 Testing WindowKeywordMonitor executeChainAction Override');
    console.log('=' .repeat(60));
    
    // Create monitor config similar to task_finished_monitor.json
    const config = {
        windowIndex: 999, // Non-existent window for testing
        chains: [
            {
                keyword: "TEST_KEYWORD",
                instruction: null,
                nextKeyword: null
            }
        ],
        options: {
            pollInterval: 1,
            timeout: 10
        }
    };
    
    const monitor = new WindowKeywordMonitor(config);
    
    let keywordDetectedFired = false;
    let chainCompleteFired = false;
    let chainExecutedFired = false;
    
    // Set up event listeners to test our fix
    monitor.on('keyword_detected', ({keyword, output, chainIndex}) => {
        console.log('✅ keyword_detected event fired!');
        console.log(`   Keyword: ${keyword}`);
        console.log(`   Chain Index: ${chainIndex}`);
        keywordDetectedFired = true;
    });
    
    monitor.on('chain_complete', () => {
        console.log('❌ chain_complete event fired (should NOT happen with our fix)');
        chainCompleteFired = true;
    });
    
    monitor.on('chain_executed', () => {
        console.log('❌ chain_executed event fired (should NOT happen with our fix)');
        chainExecutedFired = true;
    });
    
    // Test our override method directly
    console.log('\n🔧 Testing executeChainAction override...');
    
    const chainConfig = {
        keyword: "TEST_KEYWORD",
        instruction: null,
        nextKeyword: null,
        chainIndex: 0
    };
    
    // Set up some test buffer content
    monitor.outputBuffer = "Some output content\nTEST_KEYWORD\nMore content";
    
    try {
        // Call our override method directly
        await monitor.executeChainAction(chainConfig);
        
        // Give events time to fire
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Verify results
        console.log('\n📊 Test Results:');
        console.log('──────────────');
        console.log(`keyword_detected fired: ${keywordDetectedFired ? '✅ YES' : '❌ NO'}`);
        console.log(`chain_complete fired: ${chainCompleteFired ? '❌ YES (BAD)' : '✅ NO (GOOD)'}`);
        console.log(`chain_executed fired: ${chainExecutedFired ? '❌ YES (BAD)' : '✅ NO (GOOD)'}`);
        
        const success = keywordDetectedFired && !chainCompleteFired && !chainExecutedFired;
        
        console.log('\n🎯 Overall Test Result:');
        if (success) {
            console.log('✅ SUCCESS: Override method works correctly!');
            console.log('   - Emits keyword_detected event ✅');
            console.log('   - Does NOT trigger chain execution ✅');
            console.log('   - Fix will resolve hanging issue ✅');
        } else {
            console.log('❌ FAILURE: Override method needs adjustment');
            if (!keywordDetectedFired) {
                console.log('   - Missing keyword_detected event');
            }
            if (chainCompleteFired) {
                console.log('   - Unwanted chain_complete event');
            }
            if (chainExecutedFired) {
                console.log('   - Unwanted chain_executed event');
            }
        }
        
        return success;
        
    } catch (error) {
        console.log(`❌ Error during test: ${error.message}`);
        return false;
    }
}

// Run the test
testKeywordDetectionFix().then(success => {
    process.exit(success ? 0 : 1);
}).catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
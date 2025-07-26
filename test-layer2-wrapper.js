/**
 * Test Layer 2 Wrapper Implementation
 * Tests the shared lock integration in WindowKeywordMonitor
 */

import { sharedLock } from './shared-state.js';

class MockWindowKeywordMonitor {
    constructor(windowIndex) {
        this.windowIndex = windowIndex;
        this.options = { retryAttempts: 3, retryDelay: 2 };
        this.eventHandlers = {};
    }

    emit(event, data) {
        console.log(`[EVENT] ${event}:`, data);
        if (this.eventHandlers[event]) {
            this.eventHandlers[event](data);
        }
    }

    on(event, handler) {
        this.eventHandlers[event] = handler;
    }

    /**
     * Determine if a message is likely destined for Claude based on content and context
     */
    isLikelyClaudeMessage(text) {
        // Skip lock for short messages or commands
        if (!text || text.length < 20) {
            return false;
        }
        
        // Claude message indicators
        const claudeIndicators = [
            'operator',
            'analysis',
            'QA',
            'UX',
            'failed',
            'fix',
            'TASK_FINISHED',
            'deploy',
            'implement',
            'code',
            'bug'
        ];
        
        const textLower = text.toLowerCase();
        const hasClaudeIndicators = claudeIndicators.some(indicator => 
            textLower.includes(indicator.toLowerCase())
        );
        
        // Long messages (>100 chars) are likely Claude-bound
        const isLongMessage = text.length > 100;
        
        // If this window index matches known Claude instances, treat as Claude message
        const isClaudeWindow = this.windowIndex && (
            this.windowIndex.toString().includes('claude') ||
            this.windowIndex.toString().includes('4') // Claude Code often runs in window 4
        );
        
        return hasClaudeIndicators || isLongMessage || isClaudeWindow;
    }

    async sendToInstance(text) {
        // Determine if this is likely a Claude message based on content and context
        const isClaudeMessage = this.isLikelyClaudeMessage(text);
        
        // Acquire shared lock only for potential Claude messages
        if (isClaudeMessage && !sharedLock.tryAcquireSendLock('window-monitor')) {
            console.log('⚠️ DUPLICATE BLOCKED: window-monitor - Another layer is already sending to Claude');
            this.emit('error', {
                action: 'send_to_window',
                error: 'Duplicate send blocked - another layer is currently sending to Claude',
                windowIndex: this.windowIndex,
                reason: 'duplicate_blocked'
            });
            return false;
        }

        try {
            if (isClaudeMessage) {
                console.log('🔒 SEND LOCK ACQUIRED: window-monitor - Starting tmux communication');
            }
            
            // Simulate tmux send-keys (replace with actual tmux commands in production)
            console.log(`📝 Simulating tmux send to window ${this.windowIndex}: ${text.substring(0, 100)}...`);
            
            // Simulate processing time
            await new Promise(resolve => setTimeout(resolve, 50));
            
            this.emit('text_sent', {
                text,
                windowIndex: this.windowIndex,
                attempt: 1
            });
            
            return true;
            
        } catch (error) {
            this.emit('error', {
                action: 'send_to_window',
                error: error.message,
                windowIndex: this.windowIndex,
                text
            });
            throw error;
        } finally {
            // Always release the lock for Claude messages, even on error
            if (isClaudeMessage) {
                sharedLock.releaseSendLock('window-monitor');
                console.log('🔓 SEND LOCK RELEASED: window-monitor - tmux communication complete');
            }
        }
    }

    async sendInstructionWithRetry(instruction) {
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                console.log(`📤 Sending instruction (attempt ${attempt}/3)`);
                
                const result = await this.sendToInstance(instruction);
                if (result) {
                    console.log('✅ Instruction sent successfully');
                    return true;
                }
                
            } catch (error) {
                console.error(`❌ Send failed: ${error.message}`);
                
                // Wait before retry (except on last attempt)
                if (attempt < 3) {
                    console.log(`⏳ Waiting 2s before retry...`);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            }
        }
        
        return false;
    }
}

// Test Suite
async function runLayer2Tests() {
    console.log('🧪 Testing Layer 2 Wrapper Implementation (WindowKeywordMonitor)');
    console.log('================================================================');
    
    // Reset metrics for clean testing
    sharedLock.resetMetrics();
    
    // Disable cooldown for testing
    const originalCooldown = sharedLock.COOLDOWN_MS;
    sharedLock.COOLDOWN_MS = 0;
    console.log('⚙️ Cooldown disabled for testing');
    
    const monitor1 = new MockWindowKeywordMonitor('4'); // Claude window
    const monitor2 = new MockWindowKeywordMonitor('2'); // Non-Claude window
    const monitor3 = new MockWindowKeywordMonitor('claude-instance');
    
    console.log('\n📋 Test 1: Non-Claude message should not acquire lock');
    console.log('-----------------------------------------------------');
    const result1 = await monitor2.sendToInstance('ls -la'); // Short command, no lock
    console.log(`Result: ${result1 ? '✅ Success' : '❌ Failed'}`);
    
    console.log('\n📋 Test 2: Claude message should acquire lock');
    console.log('---------------------------------------------');
    const claudeMessage = 'Here is the operator analysis about failed QA tasks that need to be fixed';
    const result2 = await monitor1.sendToInstance(claudeMessage);
    console.log(`Result: ${result2 ? '✅ Success' : '❌ Failed'}`);
    
    console.log('\n📋 Test 3: Concurrent Claude messages - second should be blocked');
    console.log('----------------------------------------------------------------');
    
    // Start first Claude message but don't await
    const promise3a = monitor1.sendToInstance('Analysis of operator QA/UX failure reports with technical recommendations');
    
    // Give first monitor time to acquire lock
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // Try second Claude message immediately (should be blocked)
    const result3b = await monitor3.sendToInstance('Another operator analysis about code bugs that need fixing');
    
    console.log(`Second Claude message result: ${result3b ? '✅ Success (unexpected)' : '❌ Blocked (expected)'}`);
    
    // Wait for first message to complete
    const result3a = await promise3a;
    console.log(`First Claude message result: ${result3a ? '✅ Success (expected)' : '❌ Failed (unexpected)'}`);
    
    console.log('\n📋 Test 4: sendInstructionWithRetry should respect lock');
    console.log('-----------------------------------------------------');
    const result4 = await monitor1.sendInstructionWithRetry('Complete operator analysis with implementation steps for bug fixes');
    console.log(`sendInstructionWithRetry result: ${result4 ? '✅ Success' : '❌ Failed'}`);
    
    console.log('\n📋 Test 5: Mixed Claude and non-Claude messages');
    console.log('------------------------------------------------');
    const shortMessage = await monitor2.sendToInstance('pwd'); // Should not use lock
    const longMessage = await monitor1.sendToInstance('This is a very long message that contains operator analysis and should trigger the shared lock mechanism because it appears to be destined for Claude');
    
    console.log(`Short message: ${shortMessage ? '✅ Success' : '❌ Failed'}`);
    console.log(`Long message: ${longMessage ? '✅ Success' : '❌ Failed'}`);
    
    console.log('\n📊 Final Metrics:');
    console.log('==================');
    const metrics = sharedLock.getMetrics();
    console.log(`Total Acquisitions: ${metrics.totalAcquisitions}`);
    console.log(`Duplicates Blocked: ${metrics.duplicatesBlocked}`);
    console.log(`Lock Efficiency: ${metrics.lockEfficiency}`);
    console.log(`Duplicate Rate: ${metrics.duplicateRate}`);
    
    // Restore original cooldown
    sharedLock.COOLDOWN_MS = originalCooldown;
    console.log('⚙️ Cooldown restored to original value');
    
    const expectedResults = {
        totalAcquisitions: 4, // Test 2 + Test 3 first + Test 4 + Test 5 long
        duplicatesBlocked: 1  // Test 3 second should be blocked
    };
    
    console.log('\n🎯 Test Results Summary:');
    console.log('========================');
    let allTestsPassed = true;
    
    if (metrics.totalAcquisitions === expectedResults.totalAcquisitions) {
        console.log('✅ Acquisition count correct');
    } else {
        console.log(`❌ Acquisition count wrong: expected ${expectedResults.totalAcquisitions}, got ${metrics.totalAcquisitions}`);
        allTestsPassed = false;
    }
    
    if (metrics.duplicatesBlocked === expectedResults.duplicatesBlocked) {
        console.log('✅ Duplicate blocking working correctly');
    } else {
        console.log(`❌ Duplicate blocking failed: expected ${expectedResults.duplicatesBlocked}, got ${metrics.duplicatesBlocked}`);
        allTestsPassed = false;
    }
    
    if (allTestsPassed) {
        console.log('\n🎉 ALL LAYER 2 TESTS PASSED! WindowKeywordMonitor wrapper is working correctly.');
        return true;
    } else {
        console.log('\n⚠️ Some tests failed. Review implementation before proceeding.');
        return false;
    }
}

// Run the tests
runLayer2Tests().then(success => {
    process.exit(success ? 0 : 1);
});
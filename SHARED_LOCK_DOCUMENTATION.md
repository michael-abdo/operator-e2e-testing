# Shared Lock System Documentation

## Overview

The Shared Lock System prevents duplicate messages from being sent to Claude by coordinating between multiple layers in the E2E chain loop controller. It ensures that only one layer can communicate with Claude at any given time.

## Architecture

### Core Components

1. **SharedLock Class** (`shared-state.js`)
   - Singleton pattern ensuring single instance across all layers
   - Manages lock state, metrics, and history
   - Implements cooldown period to prevent rapid duplicates

2. **Layer Integration**
   - **Layer 1**: OperatorE2EExecutor (`operator.execute_e2e.js`)
   - **Layer 2**: WindowKeywordMonitor (`lib/monitors/WindowKeywordMonitor.js`)
   - **Layer 3**: ChainLoopMonitor (`lib/monitors/ChainLoopMonitor.js`)

### How It Works

```javascript
// Before sending to Claude
if (!sharedLock.tryAcquireSendLock('layer-id')) {
    // Another layer is already sending - block this attempt
    return { success: false, reason: 'duplicate_blocked' };
}

try {
    // Send message to Claude
    await sendToClaude(message);
} finally {
    // Always release lock
    sharedLock.releaseSendLock('layer-id');
}
```

## Configuration

### Timing Parameters

```javascript
COOLDOWN_MS: 2000          // 2-second cooldown between messages
TIMEOUT_MS: 300000         // 5-minute timeout for normal operations
FORCE_RELEASE_THRESHOLD: 600000  // 10-minute force release for stuck locks
```

### Valid Layer IDs

- `e2e-executor` - Primary E2E orchestrator
- `window-monitor` - Window-based keyword monitor
- `chain-loop-monitor` - Chain loop orchestrator
- `chain-keyword-monitor` - Keyword detection layer
- `test-layer` - Testing only

## Monitoring

### Real-time Metrics

```javascript
const metrics = sharedLock.getMetrics();
console.log(metrics);
// {
//   totalAcquisitions: 150,
//   totalReleases: 150,
//   duplicatesBlocked: 45,
//   forceReleases: 0,
//   lockEfficiency: '100.00%',
//   duplicateRate: '23.08%',
//   averageLockDuration: '2500ms',
//   recentActivity: [...]
// }
```

### Key Metrics to Monitor

1. **Duplicate Rate**: Should be >0% (proving duplicates are being blocked)
2. **Lock Efficiency**: Should be near 100% (releases matching acquisitions)
3. **Force Releases**: Should be 0 or very low (indicates stuck locks)
4. **Average Lock Duration**: Should be reasonable for your operations

### Logging

All lock operations are logged with timestamps:

```
[2025-07-26T21:00:00.000Z] [SHARED_LOCK] [INFO] 🔒 SEND LOCK ACQUIRED: e2e-executor
[2025-07-26T21:00:02.000Z] [SHARED_LOCK] [INFO] 🔓 SEND LOCK RELEASED: e2e-executor (held for 2000ms)
[2025-07-26T21:00:02.001Z] [SHARED_LOCK] [WARNING] ⏸️ Cooldown active for window-monitor: 1999ms remaining
```

## Troubleshooting

### Common Issues

1. **High Duplicate Rate**
   - This is actually good! It means duplicates are being prevented
   - If rate is 0%, the lock might not be working

2. **Lock Stuck (Force Releases > 0)**
   - Check for errors in layers that might prevent lock release
   - Review FORCE_RELEASE_THRESHOLD setting

3. **Performance Impact**
   - Lock overhead is ~0.047ms (negligible)
   - If seeing delays, check cooldown settings

### Debug Commands

```javascript
// Check current lock status
console.log(sharedLock.getLockStatus());

// Force release a stuck lock
sharedLock.forceReleaseLock('manual-intervention');

// Reset all metrics
sharedLock.resetMetrics();

// Get lock history
console.log(sharedLock.getMetrics().recentActivity);
```

## Testing

### Unit Tests
- `test-shared-lock-edge-cases.js` - 17 edge case tests
- Individual layer tests for each wrapper

### Integration Tests
- `test-full-integration.js` - Cross-layer coordination
- `test-performance-simple.js` - Performance benchmarking
- `test-edge-cases-production.js` - Production scenarios

### Running Tests

```bash
# All tests
npm test

# Individual test suites
node test-shared-lock-edge-cases.js
node test-layer1-wrapper.js
node test-layer2-wrapper.js
node test-layer3-wrapper.js
node test-full-integration.js
node test-performance-simple.js
```

## Deployment

### Installation

1. Ensure `shared-state.js` is in the project root
2. Import in each layer that sends to Claude:
   ```javascript
   import { sharedLock } from './shared-state.js';
   ```

3. Wrap message sending functions with lock acquisition

### Rollback Procedure

If issues arise:

1. Remove lock acquisition calls from layers
2. Remove imports of shared-state.js
3. Restart services

The system will revert to original behavior without the shared lock.

## Performance Characteristics

- **Lock Overhead**: ~0.047ms per operation
- **Throughput**: 18,596 operations/second capability
- **Memory Impact**: <1MB for history tracking
- **CPU Impact**: Negligible

## Best Practices

1. **Always Release Locks**
   - Use try/finally blocks to ensure release
   - Lock will auto-release after timeout as safety

2. **Monitor Metrics**
   - Check duplicate rate regularly
   - Watch for force releases

3. **Layer Identification**
   - Use consistent layer IDs
   - Only use valid layer IDs from the list

4. **Error Handling**
   - Handle duplicate_blocked responses gracefully
   - Log when duplicates are prevented

## API Reference

### Methods

#### `tryAcquireSendLock(layerId)`
- Returns: `boolean` - true if lock acquired
- Acquires exclusive lock for sending to Claude

#### `releaseSendLock(layerId)`
- Returns: `boolean` - true if successfully released
- Releases the lock held by the specified layer

#### `getLockStatus()`
- Returns: Current lock state object
- Check if lock is held and by which layer

#### `getMetrics()`
- Returns: Comprehensive metrics object
- Monitor system performance and behavior

#### `forceReleaseLock(reason)`
- Forces release of stuck lock
- Use only in emergency situations

#### `resetMetrics()`
- Clears all metrics and history
- Useful for testing or fresh starts

## Conclusion

The Shared Lock System provides reliable duplicate prevention with minimal performance impact. It's designed to be transparent to existing operations while ensuring Claude receives each message only once.
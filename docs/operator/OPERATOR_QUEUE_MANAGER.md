# Operator Queue Manager

## Overview

The Operator Queue Manager is an automated conversation management system for ChatGPT Operator. It provides functionality to automatically clean up conversation queues, manage session state, and ensure optimal performance during automated E2E testing sessions.

## Core Features

### 1. Automatic Conversation Deletion
- Automatically identifies and deletes completed or stale conversations
- Prevents queue overflow during long-running E2E test sessions
- Maintains clean workspace for new test iterations

### 2. Intelligent Queue Processing
- Processes conversation buttons in sequential order
- Handles dynamic menu rendering with proper wait conditions
- Provides robust error handling for failed deletions

### 3. User-Triggered Execution
- Floating button interface for manual trigger
- Console logging for debugging and monitoring
- Non-invasive integration with Operator UI

## Technical Implementation

### Core Script Components

```javascript
// Real pointer event dispatch for proper interaction
function realClick(el) {
    el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('pointerup',   { bubbles: true }));
}

// Polling mechanism for dynamic content
function waitFor(conditionFn, timeout = 1500, interval = 100) {
    const start = Date.now();
    return new Promise((resolve, reject) => {
        (function check() {
            if (conditionFn()) return resolve();
            if (Date.now() - start > timeout) return reject('timed out');
            setTimeout(check, interval);
        })();
    });
}

// Main processing function
async function processButtons() {
    const buttons = document.querySelectorAll('.group.relative > button');
    console.log(`[AutoDelete] Found ${buttons.length} buttons`);
    
    for (let i = 0; i < buttons.length; i++) {
        const btn = buttons[i];
        console.log(`[AutoDelete] ➤ Button #${i+1}`, btn);
        realClick(btn);

        // Wait for menu to render
        await new Promise(r => setTimeout(r, 200));

        const menuId = btn.getAttribute('aria-controls');
        let menu;
        try {
            await waitFor(() => {
                menu = document.getElementById(menuId);
                return menu && menu.dataset.state === 'open';
            });
        } catch (err) {
            console.warn(`[AutoDelete] ❌ Menu did not open for button #${i+1}`, err);
            continue;
        }

        console.log(`[AutoDelete] ✅ Menu open for button #${i+1}`, menu);

        // Locate dropdown container
        const wrapper = document.querySelector(`[aria-labelledby="${btn.id}"]`) || menu;
        console.log(`[AutoDelete] Using container:`, wrapper);

        // Find delete button
        let deleteBtn = wrapper.querySelector('button.text-destructive')
                     || Array.from(wrapper.querySelectorAll('button'))
                         .find(el => el.textContent.trim().toLowerCase() === 'delete');

        if (deleteBtn) {
            console.log(`[AutoDelete] 🔥 Found Delete button for #${i+1}`, deleteBtn);
            realClick(deleteBtn);
            deleteBtn.click();
            console.log(`[AutoDelete] ✔ Clicked Delete for button #${i+1}`);
        } else {
            console.warn(`[AutoDelete] ⚠ Delete button not found in container for button #${i+1}`);
        }

        // Pause before next iteration
        await new Promise(r => setTimeout(r, 300));
    }
    console.log('[AutoDelete] 🎉 All done');
}
```

### UI Integration

```javascript
// Floating trigger button
const trigger = document.createElement('button');
trigger.textContent = 'Run Deletes';
Object.assign(trigger.style, {
    position: 'fixed',
    bottom: '20px',
    left: '20px',
    zIndex: 9999,
    padding: '8px 12px',
    backgroundColor: '#d53f3f',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    fontSize: '13px',
    cursor: 'pointer'
});
trigger.addEventListener('click', () => {
    console.log('[AutoDelete] ▶ Trigger clicked');
    processButtons();
});
document.body.appendChild(trigger);
```

## Integration with E2E System

### 1. Session Management
The Queue Manager can be integrated into the E2E system to automatically clean up conversations between test runs:

```javascript
// In OperatorE2EExecutor
async cleanupOperatorQueue() {
    await this.operatorSender.page.evaluate(() => {
        // Inject and execute queue manager
        processButtons();
    });
}
```

### 2. Automatic Cleanup Triggers
- **After each iteration**: Clean up completed conversations
- **On health check failures**: Clear stale sessions
- **Before new test runs**: Ensure clean slate

### 3. Configuration Options
```javascript
const queueManagerConfig = {
    autoCleanup: true,              // Enable automatic cleanup
    cleanupThreshold: 10,           // Max conversations before cleanup
    cleanupInterval: 5,             // Cleanup every N iterations
    preserveLatest: 2,              // Keep N most recent conversations
    deletePattern: 'completed'       // Delete based on status
};
```

## Use Cases

### 1. E2E Testing
- Prevents conversation overflow during multi-iteration tests
- Maintains clean test environment
- Reduces memory usage in long-running sessions

### 2. Development Workflow
- Quick cleanup of test conversations
- Batch deletion of failed attempts
- Session state management

### 3. Performance Optimization
- Reduces DOM complexity in Operator interface
- Improves response times with fewer active conversations
- Prevents browser memory leaks

## Implementation Strategy

### Phase 1: Standalone Script
1. Deploy as browser bookmarklet
2. Manual trigger via floating button
3. Console logging for monitoring

### Phase 2: E2E Integration
1. Inject script via Chrome Debug Protocol
2. Automatic execution based on conditions
3. Configuration via E2E options

### Phase 3: Advanced Features
1. Selective deletion based on conversation state
2. Preserve important conversations
3. Export conversation history before deletion
4. Integration with monitoring dashboard

## Safety Considerations

### 1. Confirmation Dialogs
- Add optional confirmation before bulk deletion
- Preview mode to show what will be deleted
- Undo functionality for accidental deletions

### 2. Preservation Rules
- Never delete active conversations
- Preserve flagged/starred conversations
- Maintain conversation history export

### 3. Error Recovery
- Graceful handling of UI changes
- Fallback to manual deletion
- Comprehensive error logging

## API Reference

### Functions

#### `realClick(element)`
Dispatches real pointer events to properly trigger React/framework handlers.

#### `waitFor(conditionFn, timeout, interval)`
Polls for a condition to be true, with configurable timeout and interval.

#### `processButtons()`
Main function that processes all conversation buttons and deletes them.

### Configuration

```javascript
const config = {
    selectors: {
        conversationButtons: '.group.relative > button',
        deleteButton: 'button.text-destructive',
        menuContainer: '[aria-labelledby]'
    },
    timing: {
        menuOpenDelay: 200,
        betweenDeletions: 300,
        waitForTimeout: 1500
    },
    ui: {
        triggerPosition: 'bottom-left',
        triggerColor: '#d53f3f',
        triggerText: 'Run Deletes'
    }
};
```

## Future Enhancements

1. **Smart Deletion Logic**
   - Delete based on conversation age
   - Pattern matching for test conversations
   - ML-based relevance scoring

2. **Batch Operations**
   - Select multiple conversations
   - Bulk actions (archive, export, delete)
   - Keyboard shortcuts

3. **Integration Features**
   - REST API for remote management
   - WebSocket for real-time updates
   - CLI commands for queue management

4. **Analytics**
   - Conversation lifecycle tracking
   - Deletion statistics
   - Performance metrics

## Troubleshooting

### Common Issues

1. **Menu Not Opening**
   - Check selector compatibility
   - Increase wait timeout
   - Verify button state

2. **Delete Button Not Found**
   - Update selectors for UI changes
   - Check for dynamic class names
   - Use text-based fallback

3. **Partial Deletion**
   - Handle rate limiting
   - Add retry logic
   - Implement progressive delays

### Debug Mode

Enable verbose logging:
```javascript
window.OPERATOR_QUEUE_DEBUG = true;
```

## License

This component is part of the E2E Testing System and follows the same licensing terms.
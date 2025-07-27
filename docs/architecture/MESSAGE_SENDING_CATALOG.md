# Message Sending Functions Catalog
## Phase 1.1 Complete Analysis Results

### **COMPREHENSIVE FUNCTION CATALOG ✅**

**Analysis Date:** July 26, 2025  
**Files Analyzed:** 15 JavaScript files  
**Critical Functions Identified:** 6 functions requiring shared lock protection

---

## **Layer Architecture Discovered**

### **Layer 1: E2E Executor (Primary Layer)**
**File:** `operator.execute_e2e.js`
- **Main sending function:** `sendOperatorResponseToClaudeAndWait(operatorResponse)`
- **Line:** ~669
- **Function:** Sends operator analysis to Claude via tmux
- **Critical:** YES - This is the main duplicate source

### **Layer 2: Chain Loop Monitor (Orchestration Layer)**
**File:** `lib/monitors/ChainLoopMonitor.js`
- **Function 1:** `sendTasksToOperator(parameters)` (Line ~173)
- **Function 2:** `sendOperatorResponseToClaude(parameters)` (Line ~238)
- **Critical:** YES - Orchestrates message sending between layers

### **Layer 3: Window Keyword Monitor (tmux Layer)**
**File:** `lib/monitors/WindowKeywordMonitor.js`
- **Function 1:** `sendToInstance(text)` (Line ~114)
- **Function 2:** `sendInstructionWithRetry(instruction)` (Line ~288)
- **Critical:** YES - Direct tmux communication layer

### **Layer 4: Operator Sender (External Communication)**
**File:** `../operator/send_and_wait_for_response.js` (Referenced)
- **Class:** `OperatorMessageSenderWithResponse`
- **Critical:** YES - Communicates with external Operator

---

## **Critical Functions Requiring Lock Protection**

### **🔴 HIGH PRIORITY - Direct Claude Sending**

#### **1. sendOperatorResponseToClaudeAndWait()**
```javascript
File: operator.execute_e2e.js:669
Function: async sendOperatorResponseToClaudeAndWait(operatorResponse)
Purpose: Main function that sends operator analysis to Claude
Evidence: Contains tmux send-keys commands to Claude instance
Lock Required: YES - Primary duplicate source
```

#### **2. sendOperatorResponseToClaude()**
```javascript
File: lib/monitors/ChainLoopMonitor.js:238
Function: async sendOperatorResponseToClaude(parameters)
Purpose: Orchestration layer that triggers Claude sending
Evidence: Calls e2eExecutor.sendOperatorResponseToClaudeAndWait()
Lock Required: YES - Orchestration trigger
```

### **🟡 MEDIUM PRIORITY - tmux Communication**

#### **3. sendToInstance()**
```javascript
File: lib/monitors/WindowKeywordMonitor.js:114
Function: async sendToInstance(text)
Purpose: Direct tmux window communication
Evidence: Contains `tmux send-keys -t ${this.windowIndex}` commands
Lock Required: YES - Could send to Claude windows
```

#### **4. sendInstructionWithRetry()**
```javascript
File: lib/monitors/WindowKeywordMonitor.js:288
Function: async sendInstructionWithRetry(instruction)
Purpose: Retrying tmux instruction sending
Evidence: Calls sendToInstance() with retry logic
Lock Required: YES - Wrapper around sendToInstance
```

### **🟢 LOW PRIORITY - Operator Communication**

#### **5. sendTasksToOperator()**
```javascript
File: lib/monitors/ChainLoopMonitor.js:173
Function: async sendTasksToOperator(parameters)
Purpose: Send failed tasks to external Operator
Evidence: Calls e2eExecutor.sendTasksToOperator()
Lock Required: MAYBE - Doesn't send to Claude directly
```

#### **6. OperatorMessageSenderWithResponse.connect()**
```javascript
File: ../operator/send_and_wait_for_response.js
Class: OperatorMessageSenderWithResponse
Purpose: External Operator communication
Evidence: Chrome Debug Protocol communication
Lock Required: NO - External system communication
```

---

## **Duplicate Pattern Analysis**

### **Root Cause Identified:**
```
Current Flow (PROBLEMATIC):
┌─────────────────────────────────────────────────────────┐
│ ChainLoopMonitor.sendOperatorResponseToClaude()        │
│           ↓                                             │
│ E2EExecutor.sendOperatorResponseToClaudeAndWait()      │
│           ↓                                             │
│ tmux send-keys (Claude receives message)               │
│                                                         │
│ [NO COORDINATION - Multiple calls possible]            │
│                                                         │
│ ChainLoopMonitor.sendOperatorResponseToClaude() AGAIN  │ ← DUPLICATE
│           ↓                                             │
│ E2EExecutor.sendOperatorResponseToClaudeAndWait() AGAIN│ ← DUPLICATE
│           ↓                                             │
│ tmux send-keys (Claude receives DUPLICATE message)     │ ← PROBLEM
└─────────────────────────────────────────────────────────┘
```

### **Evidence from Logs:**
```
[BASELINE_MEASUREMENT.md confirmed]:
- 80% of runs show 3-4 CLAUDE INPUT events (should be 1)
- Timeline shows multiple OPERATOR SEND → CLAUDE INPUT cycles
- Pattern: sendOperatorResponseToClaude() called multiple times per iteration
```

---

## **Lock Implementation Strategy**

### **Phase 3 Implementation Priority:**

#### **Phase 3.1: Core Protection (45 minutes)**
```javascript
// File: operator.execute_e2e.js
// Function: sendOperatorResponseToClaudeAndWait()
// Strategy: Wrap entire function with lock
async sendOperatorResponseToClaudeAndWait(operatorResponse) {
    if (!sharedLock.tryAcquireSendLock('e2e-executor')) {
        console.log('⚠️ Duplicate Claude send blocked');
        return false;
    }
    
    try {
        // ... existing tmux send-keys logic ...
        return result;
    } finally {
        sharedLock.releaseSendLock('e2e-executor');
    }
}
```

#### **Phase 3.2: Orchestration Protection (30 minutes)**
```javascript
// File: lib/monitors/ChainLoopMonitor.js  
// Function: sendOperatorResponseToClaude()
// Strategy: Check lock before calling executor
async sendOperatorResponseToClaude(parameters) {
    if (!sharedLock.tryAcquireSendLock('chain-loop-monitor')) {
        console.log('⚠️ Duplicate orchestration blocked');
        return false;
    }
    
    try {
        // ... existing orchestration logic ...
        return result;
    } finally {
        sharedLock.releaseSendLock('chain-loop-monitor');
    }
}
```

#### **Phase 3.3: tmux Protection (20 minutes)**
```javascript
// File: lib/monitors/WindowKeywordMonitor.js
// Function: sendToInstance()
// Strategy: Conditional lock for Claude-bound messages
async sendToInstance(text) {
    const isClaudeMessage = text.includes('operator') || text.includes('analysis');
    if (isClaudeMessage && !sharedLock.tryAcquireSendLock('window-monitor')) {
        console.log('⚠️ Duplicate window send blocked');
        return false;
    }
    
    try {
        // ... existing tmux logic ...
        return result;
    } finally {
        if (isClaudeMessage) {
            sharedLock.releaseSendLock('window-monitor');
        }
    }
}
```

---

## **Expected Results After Implementation**

### **Before Lock (Current State):**
```
OPERATOR SEND → OPERATOR RECEIVE → CLAUDE INPUT → 
OPERATOR SEND → OPERATOR RECEIVE → CLAUDE INPUT →  
OPERATOR SEND → OPERATOR RECEIVE → CLAUDE INPUT →
OPERATOR SEND → OPERATOR RECEIVE → CLAUDE INPUT
[4 duplicate messages to Claude per cycle]
```

### **After Lock (Target State):**
```
OPERATOR SEND → OPERATOR RECEIVE → CLAUDE INPUT → TASK_FINISHED → [Next Iteration]
[1 message to Claude per cycle]

Lock Log Output:
🔒 SEND LOCK ACQUIRED: e2e-executor
📤 Sending Operator response to Claude Code...
✅ Message sent successfully  
🔓 SEND LOCK RELEASED: e2e-executor
⚠️ DUPLICATE BLOCKED: chain-loop-monitor - e2e-executor already sending
⚠️ DUPLICATE BLOCKED: window-monitor - e2e-executor already sending
```

---

## **Integration Requirements**

### **Shared State Import Paths:**
```javascript
// operator.execute_e2e.js (root level):
import { sharedLock } from './shared-state.js';

// lib/monitors/ChainLoopMonitor.js (2 levels deep):
import { sharedLock } from '../../shared-state.js';

// lib/monitors/WindowKeywordMonitor.js (2 levels deep):
import { sharedLock } from '../../shared-state.js';
```

### **Layer IDs for Lock:**
- `'e2e-executor'` - Primary execution layer
- `'chain-loop-monitor'` - Orchestration layer
- `'window-monitor'` - tmux communication layer

---

## **Risk Assessment**

### **High Impact Functions (Must Wrap):**
- ✅ `sendOperatorResponseToClaudeAndWait()` - Direct Claude communication
- ✅ `sendOperatorResponseToClaude()` - Orchestration trigger

### **Medium Impact Functions (Should Wrap):**
- ✅ `sendToInstance()` - tmux window communication
- ✅ `sendInstructionWithRetry()` - Retry wrapper

### **Low Impact Functions (Monitor Only):**
- 🔍 `sendTasksToOperator()` - External Operator communication
- 🔍 `OperatorMessageSenderWithResponse` - Chrome protocol

---

**Phase 1.1 COMPLETE ✅** - All 6 critical message sending functions cataloged with implementation strategy.
# Layer Architecture & Dependencies Map
## Phase 1.2 Complete System Analysis

### **ARCHITECTURE DISCOVERY ✅**

**Analysis Date:** July 26, 2025  
**Architecture Pattern:** Hierarchical Event-Driven with tmux Integration  
**Total Layers:** 4 (confirmed) + 2 (supporting)

---

## **Discovered Layer Architecture**

### **LAYER 1: OperatorE2EExecutor (Main Orchestrator)**
```
File: operator.execute_e2e.js
Role: Primary workflow orchestrator
Dependencies:
├── tmuxUtils (tmux session management)
├── OperatorMessageSenderWithResponse (Chrome Debug Protocol)
├── workflowUtils (shared utilities)
├── ChainKeywordMonitor (base monitoring)
└── WindowKeywordMonitor (tmux window monitoring)

Key Functions:
- sendOperatorResponseToClaudeAndWait() ← PRIMARY DUPLICATE SOURCE
- sendTasksToOperator()
- execute() (main workflow)

Instantiates:
- WindowKeywordMonitor (line 766) ← CRITICAL INTERACTION
- OperatorMessageSenderWithResponse (via import)
```

### **LAYER 2: WindowKeywordMonitor (tmux Interface)**
```
File: lib/monitors/WindowKeywordMonitor.js
Role: Direct tmux window communication and keyword detection
Dependencies:
├── ChainKeywordMonitor (base class inheritance)
├── execSync, exec (child_process)
├── promisify (util)
└── tmuxUtils (tmux command execution)

Key Functions:
- sendToInstance() ← TMUX SENDING FUNCTION
- sendInstructionWithRetry() ← RETRY WRAPPER
- keyword detection events

Created by: OperatorE2EExecutor (line 766)
Configuration: task_finished_monitor.json
```

### **LAYER 3: ChainLoopMonitor (Workflow Orchestration)**
```
File: lib/monitors/ChainLoopMonitor.js
Role: Chain-based workflow orchestration
Dependencies:
├── WindowKeywordMonitor (composition)
└── EventEmitter (events)

Key Functions:
- sendTasksToOperator() ← ORCHESTRATION TRIGGER
- sendOperatorResponseToClaude() ← ORCHESTRATION TRIGGER
- chain execution logic

Status: EXISTS but NOT directly instantiated by main executor
Usage: Referenced but may be used in different workflow patterns
```

### **LAYER 4: ChainKeywordMonitor (Base Monitor)**
```
File: ../workflows/chain_keyword_monitor.js
Role: Base monitoring functionality
Dependencies:
├── Node.js core modules
└── tmux integration

Key Functions:
- Base keyword detection
- Event emission
- Chain management

Relationship: Base class for WindowKeywordMonitor
```

---

## **Supporting Components**

### **COMPONENT A: OperatorMessageSenderWithResponse**
```
File: ../operator/send_and_wait_for_response.js
Role: External Operator communication via Chrome Debug Protocol
Dependencies:
├── Chrome Debug Protocol
└── Chrome browser automation

Key Functions:
- connect() (Chrome connection)
- sendMessage() (Operator communication)
- waitForResponse() (Response handling)

Integration: Used by OperatorE2EExecutor for Operator communication
```

### **COMPONENT B: tmuxUtils**
```
File: ../workflows/tmux_utils.js
Role: tmux session and window management
Dependencies:
├── child_process (exec)
└── tmux CLI

Key Functions:
- Session management
- Window creation/control
- Command execution

Integration: Used by multiple layers for tmux operations
```

---

## **Critical Dependency Chain Analysis**

### **Message Sending Flow (PROBLEMATIC CURRENT STATE):**
```
1. OperatorE2EExecutor.execute()
        ↓
2. OperatorE2EExecutor.sendOperatorResponseToClaudeAndWait()
        ↓
3. tmux send-keys (Claude receives message)
        ↓
4. WindowKeywordMonitor.start() (monitors for TASK_FINISHED)
        ↓
5. [DUPLICATE TRIGGER] - WindowKeywordMonitor events
        ↓
6. OperatorE2EExecutor.sendOperatorResponseToClaudeAndWait() AGAIN
        ↓
7. tmux send-keys (Claude receives DUPLICATE message)
```

### **Event Flow Analysis:**
```
WindowKeywordMonitor Events:
├── 'keyword_detected' → triggers actions
├── 'timeout' → error handling  
├── 'error' → error handling
└── 'chain_complete' → completion handling

Problem: Events can trigger multiple times causing duplicate sends
```

### **Configuration Dependencies:**
```
OperatorE2EExecutor
        ↓
task_finished_monitor.json (config/task_finished_monitor.json)
        ↓
WindowKeywordMonitor configuration
        ↓ 
monitorConfig.windowIndex = this.claudeInstanceId
```

---

## **Shared Lock Integration Points**

### **Integration Strategy Based on Architecture:**

#### **PRIORITY 1: Primary Orchestrator Lock**
```javascript
// File: operator.execute_e2e.js
// Function: sendOperatorResponseToClaudeAndWait()
// Strategy: Lock entire function to prevent ALL duplicates

import { sharedLock } from './shared-state.js';

async sendOperatorResponseToClaudeAndWait(operatorResponse) {
    if (!sharedLock.tryAcquireSendLock('e2e-executor')) {
        this.log('⚠️ DUPLICATE BLOCKED: e2e-executor already sending', 'WARNING');
        return { success: false, reason: 'duplicate_blocked' };
    }
    
    try {
        this.log('🔒 SEND LOCK ACQUIRED: e2e-executor', 'INFO');
        // ... existing tmux send-keys logic ...
        return { success: true };
    } finally {
        sharedLock.releaseSendLock('e2e-executor');
        this.log('🔓 SEND LOCK RELEASED: e2e-executor', 'INFO');
    }
}
```

#### **PRIORITY 2: tmux Interface Lock**
```javascript
// File: lib/monitors/WindowKeywordMonitor.js
// Function: sendToInstance()
// Strategy: Lock tmux communication to Claude

import { sharedLock } from '../../shared-state.js';

async sendToInstance(text) {
    // Only lock for potential Claude messages
    const isClaudeMessage = this.windowIndex && text.length > 50;
    
    if (isClaudeMessage && !sharedLock.tryAcquireSendLock('window-monitor')) {
        console.log('⚠️ DUPLICATE BLOCKED: window-monitor already sending');
        return false;
    }
    
    try {
        // ... existing tmux send-keys logic ...
        return true;
    } finally {
        if (isClaudeMessage) {
            sharedLock.releaseSendLock('window-monitor');
        }
    }
}
```

#### **PRIORITY 3: Orchestration Lock (if needed)**
```javascript
// File: lib/monitors/ChainLoopMonitor.js 
// Function: sendOperatorResponseToClaude()
// Strategy: Lock orchestration layer

import { sharedLock } from '../../shared-state.js';

async sendOperatorResponseToClaude(parameters) {
    if (!sharedLock.tryAcquireSendLock('chain-loop-monitor')) {
        console.log('⚠️ DUPLICATE BLOCKED: chain-loop-monitor already sending');
        return false;
    }
    
    try {
        // ... existing orchestration logic ...
        return true;
    } finally {
        sharedLock.releaseSendLock('chain-loop-monitor');
    }
}
```

---

## **Import Path Strategy**

### **Shared State Import Paths (VERIFIED):**
```javascript
// Root level (operator.execute_e2e.js):
import { sharedLock } from './shared-state.js';

// 2 levels deep (lib/monitors/*.js):
import { sharedLock } from '../../shared-state.js';

// Workflows level (../workflows/*.js):
import { sharedLock } from '../e2e-chain-loop-controller/shared-state.js';
```

### **Directory Structure for Imports:**
```
e2e-chain-loop-controller/
├── shared-state.js                           ← SHARED LOCK LOCATION
├── operator.execute_e2e.js                  ← import './shared-state.js'
└── lib/monitors/
    ├── WindowKeywordMonitor.js              ← import '../../shared-state.js' 
    └── ChainLoopMonitor.js                  ← import '../../shared-state.js'
```

---

## **Risk Analysis by Layer**

### **HIGH RISK (Must Lock):**
- ✅ **OperatorE2EExecutor.sendOperatorResponseToClaudeAndWait()** - PRIMARY duplicate source
- ✅ **WindowKeywordMonitor.sendToInstance()** - Direct tmux to Claude

### **MEDIUM RISK (Should Lock):**
- 🟡 **ChainLoopMonitor.sendOperatorResponseToClaude()** - Orchestration layer
- 🟡 **WindowKeywordMonitor.sendInstructionWithRetry()** - Retry wrapper

### **LOW RISK (Monitor Only):**
- 🟢 **OperatorMessageSenderWithResponse** - External system
- 🟢 **tmuxUtils** - Utility functions

---

## **Implementation Order (Phase 3)**

### **Phase 3.1: Core Protection (45 minutes)**
1. **Create shared-state.js** (root level)
2. **Lock OperatorE2EExecutor.sendOperatorResponseToClaudeAndWait()**
3. **Test with single layer lock**

### **Phase 3.2: Interface Protection (30 minutes)**
1. **Lock WindowKeywordMonitor.sendToInstance()**
2. **Lock WindowKeywordMonitor.sendInstructionWithRetry()**
3. **Test cross-layer coordination**

### **Phase 3.3: Orchestration Protection (20 minutes)**
1. **Lock ChainLoopMonitor functions** (if actively used)
2. **Comprehensive integration testing**
3. **Performance validation**

---

## **Expected Architecture After Implementation**

### **Coordinated Layer Communication:**
```
┌─────────────────────────────────────────────────────────────┐
│ SHARED LOCK STATE: { isSending: false, layer: null }       │
└─────────────────────────────────────────────────────────────┘
                               ↓
┌─────────────────────────────────────────────────────────────┐
│ Layer 1: OperatorE2EExecutor                               │
│ - tryAcquireLock('e2e-executor') → SUCCESS                 │
│ - sendOperatorResponseToClaudeAndWait() → EXECUTE          │
│ - releaseLock('e2e-executor')                              │
└─────────────────────────────────────────────────────────────┘
                               ↓
┌─────────────────────────────────────────────────────────────┐
│ Layer 2: WindowKeywordMonitor                              │
│ - tryAcquireLock('window-monitor') → BLOCKED               │
│ - sendToInstance() → SKIPPED                               │
│ - Log: "⚠️ DUPLICATE BLOCKED"                              │
└─────────────────────────────────────────────────────────────┘
```

---

**Phase 1.2 COMPLETE ✅** - Complete layer architecture mapped with dependency analysis and integration strategy.
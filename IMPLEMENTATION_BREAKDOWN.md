# Implementation Breakdown: Shared Lock Solution
## Atomic Step-by-Step Actions for Op-Loop Duplicate Prevention

### **Overview**
This document breaks down the shared lock implementation into atomic, executable steps. Each task is designed to be completed independently with clear success criteria.

---

## **Task 1: Create Shared Lock Foundation**

### **1.1 Create shared-state.js File Structure**
**Time Estimate:** 15 minutes  
**Dependencies:** None  
**Tools Required:** Text editor

#### **Atomic Steps:**
1. **Navigate to project directory**
   ```bash
   cd /Users/Mike/Desktop/programming/dev_ops/tools/e2e-chain-loop-controller
   ```

2. **Create shared-state.js file**
   ```bash
   touch shared-state.js
   ```

3. **Add file header and basic structure**
   ```javascript
   /**
    * Shared Lock System for Op-Loop Duplicate Prevention
    * Prevents multiple layers from sending messages to Claude simultaneously
    */
   ```

4. **Define SharedLock class skeleton**
   ```javascript
   class SharedLock {
     constructor() {
       // Initialize state variables
     }
   }
   ```

5. **Add module export**
   ```javascript
   export const sharedLock = new SharedLock();
   ```

**Success Criteria:**
- ✅ File exists at correct path
- ✅ Basic class structure defined
- ✅ Export statement present

---

### **1.2 Implement SharedLock Core Logic**
**Time Estimate:** 20 minutes  
**Dependencies:** 1.1 complete  

#### **Atomic Steps:**
1. **Add constructor with state variables**
   ```javascript
   constructor() {
     this.isSendingToClaude = false;
     this.lastSendTime = 0;
     this.sendingLayerId = null;
     this.lockStartTime = null;
   }
   ```

2. **Implement tryAcquireSendLock method**
   ```javascript
   tryAcquireSendLock(layerId) {
     // Check if lock is available
     // Acquire lock if available
     // Log lock acquisition
     // Return success/failure
   }
   ```

3. **Implement releaseSendLock method**
   ```javascript
   releaseSendLock(layerId) {
     // Verify caller owns the lock
     // Release lock
     // Log lock release
     // Clear state variables
   }
   ```

4. **Add logging helper method**
   ```javascript
   log(message, level = 'INFO') {
     const timestamp = new Date().toISOString();
     console.log(`[${timestamp}] [${level}] ${message}`);
   }
   ```

**Success Criteria:**
- ✅ Constructor initializes all required state
- ✅ tryAcquireSendLock returns boolean
- ✅ releaseSendLock cleans up state
- ✅ Logging provides clear output

---

### **1.3 Add Error Handling and Timeout Protection**
**Time Estimate:** 15 minutes  
**Dependencies:** 1.2 complete

#### **Atomic Steps:**
1. **Add timeout constants**
   ```javascript
   constructor() {
     // ... existing code ...
     this.TIMEOUT_MS = 300000; // 5 minutes
     this.FORCE_RELEASE_THRESHOLD = 600000; // 10 minutes
   }
   ```

2. **Implement forceReleaseLock method**
   ```javascript
   forceReleaseLock() {
     // Check if lock is stale
     // Force release if timeout exceeded
     // Log forced release
   }
   ```

3. **Add timeout check to tryAcquireSendLock**
   ```javascript
   tryAcquireSendLock(layerId) {
     this.checkAndForceRelease();
     // ... existing lock logic ...
   }
   ```

4. **Add error boundary in releaseSendLock**
   ```javascript
   releaseSendLock(layerId) {
     try {
       // ... existing release logic ...
     } catch (error) {
       this.log(`Error releasing lock: ${error.message}`, 'ERROR');
     }
   }
   ```

**Success Criteria:**
- ✅ Stale locks automatically released
- ✅ Error handling prevents crashes
- ✅ Timeout protection implemented
- ✅ Clear error logging

---

## **Task 2: Identify Message Sending Functions**

### **2.1 Search for Claude Message Sending Patterns**
**Time Estimate:** 30 minutes  
**Dependencies:** None  
**Tools Required:** grep, text editor

#### **Atomic Steps:**
1. **Search for tmux send patterns**
   ```bash
   grep -r "tmux.*send" . --include="*.js" > send_functions_search.txt
   ```

2. **Search for Claude-specific patterns**
   ```bash
   grep -r "send.*claude\|claude.*send" . --include="*.js" -i >> send_functions_search.txt
   ```

3. **Search for TASK_FINISHED related sending**
   ```bash
   grep -r "TASK_FINISHED" . --include="*.js" -B 5 -A 5 >> send_functions_search.txt
   ```

4. **Search for operator response handling**
   ```bash
   grep -r "operator.*response\|response.*operator" . --include="*.js" -i >> send_functions_search.txt
   ```

5. **Review and document findings**
   - Open send_functions_search.txt
   - Identify actual send functions
   - Note file paths and line numbers
   - Create summary of findings

**Success Criteria:**
- ✅ All potential send functions identified
- ✅ File locations documented
- ✅ Function signatures captured
- ✅ Search results saved for reference

---

### **2.2 Analyze Identified Functions**
**Time Estimate:** 20 minutes  
**Dependencies:** 2.1 complete

#### **Atomic Steps:**
1. **Examine operator.execute_e2e.js**
   ```bash
   grep -n "send\|Send" operator.execute_e2e.js
   ```

2. **Examine WindowKeywordMonitor.js**
   ```bash
   grep -n "send\|Send" lib/monitors/WindowKeywordMonitor.js
   ```

3. **Examine ChainLoopMonitor.js** (if exists)
   ```bash
   find . -name "*ChainLoop*" -type f
   grep -n "send\|Send" [found_file]
   ```

4. **Document function signatures**
   - Function name
   - Parameters
   - Return type
   - File location
   - Line number

5. **Prioritize functions by impact**
   - High: Direct Claude message sending
   - Medium: Operator response forwarding
   - Low: Diagnostic/logging sends

**Success Criteria:**
- ✅ Each function analyzed and documented
- ✅ Function signatures recorded
- ✅ Impact priority assigned
- ✅ Integration complexity assessed

---

## **Task 3: Implement Lock Wrappers**

### **3.1 Implement Lock Wrapper for operator.execute_e2e.js**
**Time Estimate:** 45 minutes  
**Dependencies:** Tasks 1, 2 complete

#### **Atomic Steps:**
1. **Backup original file**
   ```bash
   cp operator.execute_e2e.js operator.execute_e2e.js.backup
   ```

2. **Add shared-state import**
   ```javascript
   // Add at top of file
   import { sharedLock } from './shared-state.js';
   ```

3. **Locate primary send function**
   - Find function that sends operator analysis to Claude
   - Note current function structure
   - Identify error handling patterns

4. **Create wrapped send function**
   ```javascript
   async function sendToClaudeWithLock(message, layerId = 'e2e-executor') {
     if (!sharedLock.tryAcquireSendLock(layerId)) {
       console.log(`⚠️ Duplicate send blocked for ${layerId}`);
       return false;
     }
     
     try {
       // Original send logic here
       const result = await originalSendFunction(message);
       console.log(`✅ Message sent successfully by ${layerId}`);
       return result;
     } catch (error) {
       console.log(`❌ Send failed for ${layerId}: ${error.message}`);
       throw error;
     } finally {
       sharedLock.releaseSendLock(layerId);
     }
   }
   ```

5. **Replace original send calls**
   - Find all calls to original send function
   - Replace with wrapped version
   - Maintain same parameters and return handling

6. **Test file syntax**
   ```bash
   node -c operator.execute_e2e.js
   ```

**Success Criteria:**
- ✅ Backup created successfully
- ✅ Import added without syntax errors
- ✅ Wrapper function implemented
- ✅ Original calls replaced
- ✅ File syntax validates

---

### **3.2 Implement Lock Wrapper for WindowKeywordMonitor.js**
**Time Estimate:** 30 minutes  
**Dependencies:** 3.1 complete

#### **Atomic Steps:**
1. **Backup original file**
   ```bash
   cp lib/monitors/WindowKeywordMonitor.js lib/monitors/WindowKeywordMonitor.js.backup
   ```

2. **Add shared-state import**
   ```javascript
   // Add import (adjust path for lib/monitors/ location)
   import { sharedLock } from '../../shared-state.js';
   ```

3. **Locate keyword action functions**
   - Find functions that trigger on TASK_FINISHED
   - Identify any functions that send to Claude
   - Note current error handling

4. **Wrap action functions with lock**
   ```javascript
   async function executeActionWithLock(action, keyword) {
     if (!sharedLock.tryAcquireSendLock('window-monitor')) {
       console.log(`⚠️ Action blocked for window-monitor: ${keyword}`);
       return false;
     }
     
     try {
       const result = await originalActionFunction(action, keyword);
       return result;
     } finally {
       sharedLock.releaseSendLock('window-monitor');
     }
   }
   ```

5. **Update action calls**
   - Replace direct action calls with wrapped version
   - Ensure keyword parameter passed correctly
   - Maintain existing return value handling

6. **Validate syntax**
   ```bash
   node -c lib/monitors/WindowKeywordMonitor.js
   ```

**Success Criteria:**
- ✅ Backup created
- ✅ Import path correctly adjusted
- ✅ Action functions wrapped
- ✅ Calls updated to use wrapper
- ✅ Syntax validation passes

---

### **3.3 Implement Lock Wrapper for Additional Layers**
**Time Estimate:** 20 minutes per layer  
**Dependencies:** 3.2 complete

#### **Atomic Steps (Repeat for each layer):**
1. **Identify layer file**
   - ChainLoopMonitor or equivalent
   - Any other files found in Task 2

2. **Follow same pattern as 3.2**
   - Backup file
   - Add import with correct path
   - Wrap relevant functions
   - Update function calls
   - Validate syntax

3. **Use unique layer ID**
   - 'chain-loop-monitor'
   - 'additional-layer-name'
   - Ensure no conflicts with other layers

**Success Criteria:**
- ✅ Each additional layer wrapped
- ✅ Unique layer IDs assigned
- ✅ All syntax validated
- ✅ No integration conflicts

---

## **Task 4: Integration and Testing**

### **4.1 Create Basic Test Script**
**Time Estimate:** 25 minutes  
**Dependencies:** Task 3 complete

#### **Atomic Steps:**
1. **Create test-shared-lock.js**
   ```bash
   touch test-shared-lock.js
   ```

2. **Import shared lock**
   ```javascript
   import { sharedLock } from './shared-state.js';
   ```

3. **Write basic lock test**
   ```javascript
   async function testBasicLock() {
     console.log('Testing basic lock functionality...');
     
     // Test 1: First acquisition should succeed
     const lock1 = sharedLock.tryAcquireSendLock('test-layer-1');
     console.log(`Lock 1 acquired: ${lock1}`);
     
     // Test 2: Second acquisition should fail
     const lock2 = sharedLock.tryAcquireSendLock('test-layer-2');
     console.log(`Lock 2 acquired: ${lock2}`);
     
     // Test 3: Release and re-acquire
     sharedLock.releaseSendLock('test-layer-1');
     const lock3 = sharedLock.tryAcquireSendLock('test-layer-2');
     console.log(`Lock 3 acquired: ${lock3}`);
     
     sharedLock.releaseSendLock('test-layer-2');
   }
   ```

4. **Add timeout test**
   ```javascript
   async function testTimeoutRelease() {
     console.log('Testing timeout release...');
     // Simulate stale lock
     // Test force release
   }
   ```

5. **Run tests**
   ```bash
   node test-shared-lock.js
   ```

**Success Criteria:**
- ✅ Basic lock tests pass
- ✅ Duplicate prevention works
- ✅ Release functionality works
- ✅ Timeout handling works

---

### **4.2 Integration Test with Op-Loop**
**Time Estimate:** 30 minutes  
**Dependencies:** 4.1 complete

#### **Atomic Steps:**
1. **Start op-loop in test mode**
   - Use test QA/UX data
   - Monitor console output
   - Watch for lock messages

2. **Verify lock acquisition**
   - Look for "🔒 SEND LOCK ACQUIRED" messages
   - Confirm only one layer acquires lock at a time
   - Check for proper release messages

3. **Test duplicate prevention**
   - Trigger scenario that previously caused duplicates
   - Verify "⚠️ DUPLICATE BLOCKED" appears
   - Confirm no duplicate messages sent to Claude

4. **Monitor system stability**
   - Ensure op-loop continues normal operation
   - Check for deadlocks or hanging
   - Verify error recovery works

5. **Document test results**
   - Capture successful test logs
   - Note any issues or unexpected behavior
   - Record performance impact

**Success Criteria:**
- ✅ Op-loop runs without errors
- ✅ Lock messages appear correctly
- ✅ Duplicates are prevented
- ✅ System remains stable
- ✅ No performance degradation

---

## **Task 5: Documentation and Finalization**

### **5.1 Update Configuration and Documentation**
**Time Estimate:** 20 minutes  
**Dependencies:** Task 4 complete

#### **Atomic Steps:**
1. **Update README.md**
   - Add section about duplicate prevention
   - Document lock system briefly
   - Add troubleshooting section

2. **Create ROLLBACK.md**
   ```markdown
   # Rollback Procedure
   
   To disable shared lock system:
   1. Remove imports from modified files
   2. Restore original function calls
   3. Delete shared-state.js
   ```

3. **Update .gitignore if needed**
   - Add any temporary test files
   - Exclude backup files from commits

4. **Create performance benchmark**
   - Document baseline timing
   - Record lock overhead measurements
   - Note memory usage impact

**Success Criteria:**
- ✅ Documentation updated
- ✅ Rollback procedure documented
- ✅ Performance impact measured
- ✅ Repository clean

---

### **5.2 Final Validation and Cleanup**
**Time Estimate:** 15 minutes  
**Dependencies:** 5.1 complete

#### **Atomic Steps:**
1. **Remove test files**
   ```bash
   rm test-shared-lock.js
   rm send_functions_search.txt
   ```

2. **Verify all backups exist**
   ```bash
   ls -la *.backup
   ls -la lib/monitors/*.backup
   ```

3. **Run final syntax check**
   ```bash
   node -c shared-state.js
   node -c operator.execute_e2e.js
   node -c lib/monitors/WindowKeywordMonitor.js
   ```

4. **Test import resolution**
   ```bash
   node -e "import('./shared-state.js').then(console.log)"
   ```

5. **Commit changes**
   ```bash
   git add .
   git commit -m "Implement shared lock duplicate prevention system"
   ```

**Success Criteria:**
- ✅ Repository cleaned up
- ✅ All syntax checks pass
- ✅ Imports resolve correctly
- ✅ Changes committed
- ✅ Ready for production testing

---

## **Implementation Summary**

### **Total Time Estimate: 4.5 hours**
- Task 1: Shared Lock Foundation (50 minutes)
- Task 2: Identify Functions (50 minutes)
- Task 3: Implement Wrappers (1.5 hours)
- Task 4: Integration Testing (55 minutes)
- Task 5: Documentation (35 minutes)

### **Dependencies Chain:**
```
Task 1.1 → Task 1.2 → Task 1.3
Task 2.1 → Task 2.2
Task 1 + Task 2 → Task 3.1 → Task 3.2 → Task 3.3
Task 3 → Task 4.1 → Task 4.2
Task 4 → Task 5.1 → Task 5.2
```

### **Risk Mitigation:**
- ✅ Backup files created before any modifications
- ✅ Syntax validation at each step
- ✅ Incremental testing approach
- ✅ Clear rollback procedure
- ✅ Atomic steps allow partial completion

### **Success Validation:**
- **Primary Goal**: Zero duplicate messages in op-loop output
- **Secondary Goal**: No system regressions
- **Tertiary Goal**: Clear observability through logging

**Each atomic step includes specific commands, expected outputs, and clear success criteria to ensure reliable implementation.**
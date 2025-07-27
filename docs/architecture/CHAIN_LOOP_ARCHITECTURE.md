# Chain-Driven E2E Testing Architecture

## Overview

This branch implements a **chain-driven architecture** where `ChainLoopMonitor` controls the entire E2E testing workflow. Instead of external iteration management, the monitor orchestrates the complete loop through keyword detection and action execution.

## Architecture Comparison

### Previous Architecture (Detection-Only)
```
OperatorE2EExecutor (Loop Controller)
├── Manages iterations externally
├── Calls WindowKeywordMonitor for detection
└── WindowKeywordMonitor
    └── Only detects keywords → signals back
```

### New Architecture (Chain-Driven)
```
ChainLoopMonitor (Loop Controller)
├── Detects keywords AND executes actions
├── Manages iterations internally
├── Controls complete workflow
└── OperatorE2EExecutor (Utility Provider)
    ├── Task management functions
    ├── Operator communication
    └── Claude session management
```

## Key Components

### 1. ChainLoopMonitor (`lib/monitors/ChainLoopMonitor.js`)
- Extends `WindowKeywordMonitor` with action execution
- Manages iteration counting and loop termination
- Executes actions when keywords are detected
- Tracks task status across iterations

### 2. Chain Configuration (`config/chain_loop_monitor.json`)
```json
{
  "loopControl": {
    "maxIterations": 5,
    "checkAllTasksResolved": true,
    "exitOnAllPass": true
  },
  "chains": [
    {
      "name": "claude_fixes_complete",
      "keyword": "TASK_FINISHED",
      "action": {
        "type": "sendTasksToOperator"
      },
      "nextChain": "operator_analysis",
      "loopCheck": {
        "incrementIteration": true,
        "checkMaxIterations": true,
        "checkAllTasksPassed": true
      }
    }
  ]
}
```

### 3. Refactored OperatorE2EExecutor
- No longer controls the loop
- Provides utility methods:
  - `getFailedTasks()` - Returns tasks with status='fail'
  - `sendTasksToOperator()` - Sends to Operator and gets response
  - `forwardOperatorResponseToClaude()` - Sends to Claude
  - `checkAllTasksPassed()` - Verifies completion

## Workflow

1. **Start**: ChainLoopMonitor begins monitoring Claude output
2. **TASK_FINISHED detected** → Execute `sendTasksToOperator` action
3. **Operator analyzes** → Waits for response
4. **OPERATOR_READY detected** → Execute `sendOperatorResponseToClaude` action
5. **Loop Check** → Increment iteration, check termination conditions
6. **Repeat** until all tasks pass OR max iterations reached

## Benefits

### 1. **Single Responsibility**
- ChainLoopMonitor owns the entire workflow
- Clear separation of concerns

### 2. **Event-Driven**
- Keywords trigger actions automatically
- No external coordination needed

### 3. **Self-Contained Looping**
- Iteration management within the monitor
- Loop termination logic integrated

### 4. **Configurable Actions**
- Actions defined in configuration
- Easy to modify workflow without code changes

### 5. **Extensible**
- Add new actions easily
- Support for multi-stage workflows

## Usage

```bash
# Run with chain-driven architecture
node operator.execute_e2e_refactored.js tests/demo_test/qa_ux_demo_realistic.json

# Test the architecture
node test_chain_loop.js
```

## Configuration Options

### Loop Control
- `maxIterations`: Maximum number of iterations before stopping
- `checkAllTasksResolved`: Check if all tasks passed
- `exitOnAllPass`: Stop early if all tasks pass

### Chain Actions
- `sendTasksToOperator`: Send failed tasks to Operator
- `sendOperatorResponseToClaude`: Forward response to Claude
- Custom actions can be added

### Loop Checks
- `incrementIteration`: Increase iteration counter
- `checkMaxIterations`: Verify iteration limit
- `checkAllTasksPassed`: Check completion status

## Implementation Details

### Action Execution Flow
1. Keyword detected in Claude output
2. ChainLoopMonitor finds matching chain config
3. Executes associated action via E2E executor
4. Waits for action completion
5. Moves to next chain in sequence

### Iteration Management
- Counter incremented after TASK_FINISHED
- Checks performed before sending to Operator
- Early exit if all tasks pass
- Force exit at max iterations

### Error Handling
- Action errors emit 'action_error' event
- Timeouts handled gracefully
- Operator connection failures retry
- Claude session errors logged

## Future Enhancements

1. **Parallel Actions** - Execute multiple actions simultaneously
2. **Conditional Chains** - Branch based on results
3. **Action Plugins** - Dynamically load action handlers
4. **Progress Visualization** - Real-time status dashboard
5. **Checkpoint/Resume** - Save and restore loop state

---

This architecture transforms the E2E testing system from a procedural loop to an event-driven, chain-based workflow orchestrator.
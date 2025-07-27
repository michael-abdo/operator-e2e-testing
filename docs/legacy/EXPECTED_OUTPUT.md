# Expected E2E Test Output with Cross-Project Support

This document outlines the expected output when running the E2E testing system with WindowKeywordMonitor integration and cross-project isolation support.

## Phase 1: Initialization with Project Context

### Single Project Execution
```
✅ Project context detected:
   Project: demo-app
   Path: /Users/Mike/projects/demo-app
   Chrome Port: 9234
   Tmux Session: e2e-demo-app-a3b4c5d6
   Log Directory: /Users/Mike/projects/demo-app/logs/demo-app-a3b4c5d6/
   Updated Log File: /Users/Mike/projects/demo-app/logs/demo-app-a3b4c5d6/e2e_run_2025-07-25_14-32-15.log
✅ Reliability systems initialized with project context
🎯 Starting Operator E2E Execution
Run ID: 2025-07-25_14-32-15
QA file: /Users/Mike/projects/demo-app/tests/qa_ux_demo.json
Max iterations: 5
──────────────────────────────────────────────────
```

### Multi-Project Concurrent Execution
When running from different project directories simultaneously:

**Terminal 1 - Demo App**:
```
[demo-app:9234] ✅ Project context detected
[demo-app:9234] 📺 Using tmux window/session: e2e-demo-app-a3b4c5d6
[demo-app:9234] 🔌 Setting up Operator connection on Chrome port 9234...
```

**Terminal 2 - Blog Platform**:
```
[blog-platform:9235] ✅ Project context detected
[blog-platform:9235] 📺 Using tmux window/session: e2e-blog-platform-b7c8d9e0
[blog-platform:9235] 🔌 Setting up Operator connection on Chrome port 9235...
```

**Terminal 3 - E-commerce App**:
```
[ecommerce-app:9236] ✅ Project context detected
[ecommerce-app:9236] 📺 Using tmux window/session: e2e-ecommerce-app-c9d0e1f2
[ecommerce-app:9236] 🔌 Setting up Operator connection on Chrome port 9236...
```

## Phase 2: Operator Communication (Iteration 1)

```
🕐 OPERATOR SEND: 2025-07-25 HH:MM:SS
[Chrome Debug Protocol messages]
🕐 OPERATOR RECEIVE: 2025-07-25 HH:MM:SS  // ~3-4 minutes later
```

## Phase 3: Claude Processing with Project-Scoped WindowKeywordMonitor

### Single Project Output
```
[demo-app:9234] 🕐 CLAUDE INPUT: 2025-07-25 14:36:22
[demo-app:9234] ✅ Sent Operator response to Claude Code with double Enter
[demo-app:9234] 💾 Full Operator response saved to operator_response_debug.txt
[demo-app:9234] 🧹 Running /compact to clear stale outputs while preserving context...
[demo-app:9234] ✅ /compact completed with double Enter - ready for fresh TASK_FINISHED detection

[demo-app:9234] ⏳ Waiting for Claude to process Operator response and say TASK_FINISHED...
[demo-app:9234] 📝 Operator response length: [length] characters
[demo-app:9234] 📝 Operator response preview: jsonCopy[...

[demo-app:9234] ⏳ Starting WindowKeywordMonitor - Iteration: 1, Window: e2e-demo-app-a3b4c5d6
[WindowMonitor:e2e-demo-app-a3b4c5d6] Starting window-based keyword monitoring
[WindowMonitor:e2e-demo-app-a3b4c5d6] Project: demo-app
[WindowMonitor:e2e-demo-app-a3b4c5d6] Chrome Port: 9234
[WindowMonitor:e2e-demo-app-a3b4c5d6] Window verified accessible

🚀 STARTING CHAIN KEYWORD MONITOR
⏱️  Poll Interval: 5s
⏰ Total Timeout: 1200s
🔄 Retry Attempts: 3
────────────────────────────────────────────────
```

### Multi-Project Parallel Monitoring
Different projects show isolated monitoring in their respective windows:

**Project A (demo-app)**:
```
[WindowMonitor:e2e-demo-app-a3b4c5d6] 📊 POLL #24 (120.0s) - Looking for: "TASK_FINISHED"
[WindowMonitor:e2e-demo-app-a3b4c5d6] 🎯 KEYWORD DETECTED: "TASK_FINISHED"
```

**Project B (blog-platform)** (running simultaneously):
```
[WindowMonitor:e2e-blog-platform-b7c8d9e0] 📊 POLL #18 (90.0s) - Looking for: "TASK_FINISHED"
[WindowMonitor:e2e-blog-platform-b7c8d9e0] 📝 New output: [Y] characters
```

**Project C (ecommerce-app)** (also running):
```
[WindowMonitor:e2e-ecommerce-app-c9d0e1f2] 📊 POLL #32 (160.0s) - Looking for: "TASK_FINISHED"
[WindowMonitor:e2e-ecommerce-app-c9d0e1f2] 🎯 KEYWORD DETECTED: "TASK_FINISHED"
```

## Phase 4: Timing Validation with Project Context

### Single Project Timing
```
[demo-app:9234] 📊 OPERATOR PHASE: 3m 42s (222817ms)
[demo-app:9234] ✅ INFO: Operator phase timing acceptable (3.7 min ≥ 1 min minimum)
[demo-app:9234] 📊 CLAUDE PHASE: 2m 5s (125346ms)
[demo-app:9234] ✅ INFO: Claude phase timing acceptable (2.1 min ≥ 2 min minimum)
[demo-app:9234] 📊 TOTAL ITERATION: 5m 47s (347166ms)
```

### Multi-Project Status Overview
When viewing tmux sessions during concurrent execution:
```
$ tmux list-windows
0: local* (1 panes)
1: e2e-demo-app-a3b4c5d6 (1 panes) [Claude processing - Iteration 3/5]
2: e2e-blog-platform-b7c8d9e0 (1 panes) [Operator analysis - Iteration 1/5]
3: e2e-ecommerce-app-c9d0e1f2 (1 panes) [Completed ✅]
```

## Phase 5: Multi-Project Element

### Overview
The Multi-Project Element enables coordinated testing across multiple projects simultaneously, leveraging tmux for orchestration and isolation.

### Key Components

#### 1. Project Registry
```json
{
  "projects": {
    "demo-app": {
      "path": "/Users/Mike/projects/demo-app",
      "port": 9234,
      "session": "e2e-demo-app-a3b4c5d6",
      "status": "active"
    },
    "blog-platform": {
      "path": "/Users/Mike/projects/blog-platform", 
      "port": 9235,
      "session": "e2e-blog-platform-b7c8d9e0",
      "status": "active"
    },
    "ecommerce-app": {
      "path": "/Users/Mike/projects/ecommerce-app",
      "port": 9236,
      "session": "e2e-ecommerce-app-c9d0e1f2",
      "status": "completed"
    }
  }
}
```

#### 2. Orchestrator Dashboard
```
┌─────────────────────────────────────────────────┐
│  Multi-Project E2E Testing Orchestrator         │
├─────────────────────────────────────────────────┤
│  Active Sessions: 3                             │
│  Total Iterations: 9 (3 + 1 + 5)              │
│  Overall Progress: 60%                         │
├─────────────────────────────────────────────────┤
│  [1] demo-app       ▓▓▓░░ 60%  (3/5)          │
│  [2] blog-platform  ▓░░░░ 20%  (1/5)          │
│  [3] ecommerce-app  ▓▓▓▓▓ 100% (5/5) ✅       │
├─────────────────────────────────────────────────┤
│  Commands:                                      │
│  [s] Switch view  [p] Pause  [r] Resume        │
│  [d] Details      [l] Logs   [q] Quit          │
└─────────────────────────────────────────────────┘
```

#### 3. Cross-Project Communication
```
[Orchestrator] Broadcasting start signal to all projects...
[demo-app:9234] Received start signal, beginning iteration 1
[blog-platform:9235] Received start signal, beginning iteration 1
[ecommerce-app:9236] Received start signal, beginning iteration 1

[Orchestrator] Project status update:
  → demo-app: Claude processing (2m 15s)
  → blog-platform: Operator analysis (45s)
  → ecommerce-app: Deployment phase (1m 30s)
```

## Phase 6: Project Isolation Benefits

### Chrome Port Isolation
```
$ lsof -i :9234
COMMAND   PID  USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
chrome  12345  user  123u  IPv4 0x1234567890abcdef      0t0  TCP localhost:9234 (LISTEN)

$ lsof -i :9235
COMMAND   PID  USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
chrome  12346  user  123u  IPv4 0xfedcba0987654321      0t0  TCP localhost:9235 (LISTEN)
```

### Log Directory Isolation
```
/projects/
├── demo-app/
│   └── logs/
│       └── demo-app-a3b4c5d6/
│           ├── e2e_run_2025-07-25_14-32-15.log
│           ├── e2e_metrics_2025-07-25_14-32-15.json
│           └── e2e_alerts_2025-07-25_14-32-15.log
├── blog-platform/
│   └── logs/
│       └── blog-platform-b7c8d9e0/
│           └── e2e_run_2025-07-25_14-35-22.log
└── ecommerce-app/
    └── logs/
        └── ecommerce-app-c9d0e1f2/
            └── e2e_run_2025-07-25_14-38-45.log
```

## Key Improvements Expected

### 1. No More Premature Detection
- WindowKeywordMonitor's sophisticated filtering prevents false positives
- Proper detection of actual TASK_FINISHED completion
- No detection of TASK_FINISHED in quotes, comments, or user input

### 2. Accurate Timing
- Claude phase should now take 2+ minutes (proper analysis and implementation)
- No more 7-17 second false detections
- Reflects actual time spent on code fixes and deployment

### 3. Better Context
- Shows detection context for debugging
- Event-driven logging provides clear flow
- Structured output with emojis for visual parsing

### 4. Robust Detection
- Filters out TASK_FINISHED in quotes, comments, user input
- Only detects genuine completion signals
- Uses ChainKeywordMonitor's battle-tested detection logic

### 5. Clean Architecture
- Configuration-based approach
- Reusable for future enhancements
- Event-driven design for better error handling

## Expected Benefits

The WindowKeywordMonitor integration should resolve the timing issues by ensuring TASK_FINISHED is only detected when Claude genuinely completes the tasks, not on partial or echoed content. This leads to:

- **Accurate timing measurements** for quality assurance
- **Reliable iteration flow** without premature advancement
- **Better debugging** with contextual information
- **Foundation for multi-stage workflows** in the future

## Monitoring Features

### Poll Output
Each poll shows:
- Poll number and elapsed time
- Amount of new output detected
- Keyword detection attempts
- Context when keywords are found

### Event System
The monitor emits events for:
- `keyword_detected` - When TASK_FINISHED is found
- `timeout` - If detection takes too long
- `error` - For any monitoring errors
- `chain_complete` - When the chain finishes

### Cooldown Integration
- Maintains 60-second cooldown period
- Prevents stale TASK_FINISHED detection
- Works alongside WindowKeywordMonitor's filtering

## Multi-Project Monitoring Dashboard

### Active E2E Testing Sessions
```
🌐 Cross-Project E2E Status Dashboard
─────────────────────────────────────
Project         Port  Iteration  Status              Duration
─────────────────────────────────────
demo-app        9234  3/5       Claude Processing   15m 32s
blog-platform   9235  1/5       Operator Analysis    3m 18s
ecommerce-app   9236  5/5       Completed ✅        28m 45s
mobile-backend  9237  2/5       Deployment Phase     8m 12s
api-service     9238  Queue     Waiting...           -
─────────────────────────────────────
Total Active: 4 | Completed: 1 | Queued: 1
```

### Resource Usage
```
Chrome Instances: 4 (ports 9234-9237 active)
Tmux Windows: 5 (including orchestrator)
Memory Usage: 1.2GB across all projects
CPU Usage: 35% (distributed load)
```

## Summary

The cross-project E2E testing system provides complete isolation through:

1. **Port Isolation**: Each project gets a unique Chrome debug port (9222-9321)
2. **Tmux Isolation**: Project-specific windows prevent output mixing
3. **Log Isolation**: Separate directories for each project's logs and metrics
4. **State Isolation**: No shared state between projects
5. **Concurrent Execution**: Multiple projects can run E2E tests simultaneously

This enables teams to:
- Run E2E tests from any project directory
- Execute tests for multiple projects in parallel
- Maintain clean separation of concerns
- Scale testing across entire organizations
- Monitor all active tests from a central dashboard
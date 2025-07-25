# Operator E2E Execution Script

Automated end-to-end testing workflow that integrates Claude Code and Operator to process QA/UX task failures.

## Overview

This script implements the following workflow:
1. Accepts QA_UX file (JSON) with task statuses
2. Attaches to tmux and starts Claude Code
3. Sends failed tasks to Claude Code for analysis
4. Forwards Claude's response to Operator for additional insights
5. Updates task statuses based on responses
6. Repeats until all tasks pass or 5 iterations reached

## Prerequisites

- **Chrome** running with remote debugging: `chrome --remote-debugging-port=9222`
- **tmux** installed and available in PATH
- **Claude Code CLI** installed and configured
- **Node.js** 16+ with ES modules support

## Usage

```bash
# Basic usage
node operator.execute_e2e.js ./test/sample_qa_ux.json

# Show help
node operator.execute_e2e.js --help
```

## QA_UX File Format

The input JSON file should follow this structure:

```json
{
  "metadata": {
    "name": "Test Suite Name",
    "version": "1.0.0",
    "created": "2025-01-24T10:00:00Z"
  },
  "tasks": {
    "task_001": {
      "description": "Task description",
      "status": "fail|pass",
      "priority": "high|medium|low",
      "category": "ui|accessibility|forms|etc",
      "expectedBehavior": "What should happen",
      "actualBehavior": "What actually happens",
      "reproductionSteps": ["Step 1", "Step 2"],
      "lastTested": "2025-01-24T09:30:00Z"
    }
  }
}
```

## Project Structure

```
e2e/
├── operator.execute_e2e.js      # Main script
├── config/
│   └── default.json             # Default configuration
├── test/
│   └── sample_qa_ux.json        # Example QA_UX file
└── README.md                    # This file
```

## Integration Points

This script leverages existing utilities:
- `../workflows/tmux_utils.js` - tmux session management
- `../operator/send_and_wait_for_response.js` - Operator communication
- `../workflows/shared/workflow_utils.js` - Configuration management

## Configuration

Default settings are in `config/default.json`. Key options:
- `maxIterations`: Maximum retry attempts (default: 5)
- `timeoutPerIteration`: Timeout per iteration in ms
- `claude.responseTimeout`: Claude response timeout
- `operator.responseTimeout`: Operator response timeout

## Example Output

```
🎯 Starting Operator E2E Execution
──────────────────────────────────────────────────
📄 Loading QA_UX file: ./test/sample_qa_ux.json
✅ Loaded QA_UX file with 6 tasks
🚀 Setting up Claude Code session...
✅ Using existing Claude instance: auto_1737712345
🔌 Setting up Operator connection...
✅ Connected to Operator

🔄 Iteration 1/5
──────────────────────────────
🔍 Found 4 failed tasks
📤 Sending 4 failed tasks to Claude Code...
✅ Received response from Claude Code
📤 Sending Claude response to Operator...
✅ Received response from Operator
🔄 Updating task statuses...
✅ Task task_001 status updated to: pass
💾 Saved updated QA_UX file
✅ Iteration 1 completed

🎉 All tasks have passed! Execution complete.

🏁 Execution Summary
──────────────────────────────────────────────────
Total iterations: 2/5
Total duration: 45.3s
Final status: All tasks passed
```

## Troubleshooting

**Chrome connection issues:**
- Ensure Chrome is running with `--remote-debugging-port=9222`
- Check that Operator tab is open at `operator.chatgpt.com`

**tmux issues:**
- Verify tmux is installed: `tmux -V`
- Check if Claude Code CLI is available: `claude --version`

**Claude Code issues:**
- Update Claude Code: `claude update`
- Ensure proper permissions are set
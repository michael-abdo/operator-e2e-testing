#!/bin/bash

# Simulate multi-project E2E execution as described in EXPECTED_OUTPUT.md

echo "🎬 Simulating Multi-Project E2E Execution"
echo "========================================"

# Simulate different phases for each project
echo -e "\n📍 Updating project windows to show different phases..."

# Demo-app: Claude Processing (Iteration 3/5)
tmux send-keys -t e2e-orchestrator:1 C-c
tmux send-keys -t e2e-orchestrator:1 "clear" C-m
tmux send-keys -t e2e-orchestrator:1 "echo '[demo-app:9234] Iteration: 3/5'" C-m
tmux send-keys -t e2e-orchestrator:1 "echo '[demo-app:9234] 🕐 CLAUDE INPUT: $(date +%Y-%m-%d' '%H:%M:%S)'" C-m
tmux send-keys -t e2e-orchestrator:1 "echo '[demo-app:9234] ⏳ Waiting for Claude to process Operator response...'" C-m
tmux send-keys -t e2e-orchestrator:1 "echo '[WindowMonitor:e2e-demo-app-a3b4c5d6] 📊 POLL #24 (120.0s) - Looking for: \"TASK_FINISHED\"'" C-m

# Blog-platform: Operator Analysis (Iteration 1/5)
tmux send-keys -t e2e-orchestrator:2 C-c
tmux send-keys -t e2e-orchestrator:2 "clear" C-m
tmux send-keys -t e2e-orchestrator:2 "echo '[blog-platform:9235] Iteration: 1/5'" C-m
tmux send-keys -t e2e-orchestrator:2 "echo '[blog-platform:9235] 🕐 OPERATOR SEND: $(date +%Y-%m-%d' '%H:%M:%S)'" C-m
tmux send-keys -t e2e-orchestrator:2 "echo '[blog-platform:9235] Sending to Operator for analysis...'" C-m
tmux send-keys -t e2e-orchestrator:2 "echo '[WindowMonitor:e2e-blog-platform-b7c8d9e0] 📊 POLL #18 (90.0s) - Looking for: \"TASK_FINISHED\"'" C-m

# Ecommerce-app: Completed (Iteration 5/5)
tmux send-keys -t e2e-orchestrator:3 C-c
tmux send-keys -t e2e-orchestrator:3 "clear" C-m
tmux send-keys -t e2e-orchestrator:3 "echo '[ecommerce-app:9236] Iteration: 5/5'" C-m
tmux send-keys -t e2e-orchestrator:3 "echo '[ecommerce-app:9236] ✅ All tasks resolved!'" C-m
tmux send-keys -t e2e-orchestrator:3 "echo '[ecommerce-app:9236] 📊 TOTAL TIME: 28m 45s'" C-m
tmux send-keys -t e2e-orchestrator:3 "echo '[WindowMonitor:e2e-ecommerce-app-c9d0e1f2] 🎯 KEYWORD DETECTED: \"TASK_FINISHED\"'" C-m
tmux send-keys -t e2e-orchestrator:3 "echo '[ecommerce-app:9236] Status: Completed ✅'" C-m

# Update monitoring window
echo -e "\n📊 Setting up monitoring panes..."

# Pane 0: Demo-app logs
tmux send-keys -t e2e-orchestrator:6.0 C-c
tmux send-keys -t e2e-orchestrator:6.0 "echo '=== demo-app logs ==='" C-m
tmux send-keys -t e2e-orchestrator:6.0 "echo '[2025-07-27 15:32:45] Claude processing iteration 3...'" C-m
tmux send-keys -t e2e-orchestrator:6.0 "echo '[2025-07-27 15:33:12] Analyzing Operator response...'" C-m

# Pane 1: Blog-platform logs
tmux send-keys -t e2e-orchestrator:6.1 C-c
tmux send-keys -t e2e-orchestrator:6.1 "echo '=== blog-platform logs ==='" C-m
tmux send-keys -t e2e-orchestrator:6.1 "echo '[2025-07-27 15:30:22] Starting Operator analysis...'" C-m
tmux send-keys -t e2e-orchestrator:6.1 "echo '[2025-07-27 15:31:18] Waiting for Operator response...'" C-m

# Pane 2: Ecommerce-app logs
tmux send-keys -t e2e-orchestrator:6.2 C-c
tmux send-keys -t e2e-orchestrator:6.2 "echo '=== ecommerce-app logs ==='" C-m
tmux send-keys -t e2e-orchestrator:6.2 "echo '[2025-07-27 15:28:45] Test completed successfully!'" C-m
tmux send-keys -t e2e-orchestrator:6.2 "echo '[2025-07-27 15:28:45] All 5 iterations completed'" C-m

# Pane 3: System resources
tmux send-keys -t e2e-orchestrator:6.3 C-c
tmux send-keys -t e2e-orchestrator:6.3 "echo '=== Resource Usage ==='" C-m
tmux send-keys -t e2e-orchestrator:6.3 "echo 'Chrome Instances: 3 (ports 9234-9236)'" C-m
tmux send-keys -t e2e-orchestrator:6.3 "echo 'Tmux Windows: 7 active'" C-m
tmux send-keys -t e2e-orchestrator:6.3 "echo 'Memory Usage: 1.2GB'" C-m
tmux send-keys -t e2e-orchestrator:6.3 "echo 'CPU Usage: 35%'" C-m

echo -e "\n✅ Multi-project simulation complete!"
echo ""
echo "View the orchestrator dashboard:"
echo "  tmux attach-session -t e2e-orchestrator"
echo ""
echo "Switch between windows:"
echo "  Ctrl-b 0  - Dashboard"
echo "  Ctrl-b 1  - demo-app (Claude processing)"
echo "  Ctrl-b 2  - blog-platform (Operator analysis)"
echo "  Ctrl-b 3  - ecommerce-app (Completed)"
echo "  Ctrl-b 6  - Monitoring (4 panes)"
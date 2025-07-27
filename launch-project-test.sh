#!/bin/bash

# Launch E2E test for a specific project
# Usage: ./launch-project-test.sh PROJECT_NAME WINDOW_INDEX CHROME_PORT

PROJECT=$1
WINDOW=$2
PORT=$3

if [ -z "$PROJECT" ] || [ -z "$WINDOW" ] || [ -z "$PORT" ]; then
    echo "Usage: $0 PROJECT_NAME WINDOW_INDEX CHROME_PORT"
    echo "Example: $0 demo-app 1 9234"
    exit 1
fi

echo "🚀 Launching E2E test for $PROJECT in window $WINDOW on port $PORT"

# Switch to project window
tmux select-window -t e2e-orchestrator:$WINDOW

# Clear the window
tmux send-keys -t e2e-orchestrator:$WINDOW C-c
tmux send-keys -t e2e-orchestrator:$WINDOW clear C-m

# Change to project directory (using e2e directory for demo)
tmux send-keys -t e2e-orchestrator:$WINDOW "cd /Users/Mike/Desktop/programming/dev_ops/tools/e2e" C-m

# Set Chrome port
tmux send-keys -t e2e-orchestrator:$WINDOW "export CHROME_PORT=$PORT" C-m

# Display project info
tmux send-keys -t e2e-orchestrator:$WINDOW "echo '[$PROJECT:$PORT] Starting E2E test...'" C-m
tmux send-keys -t e2e-orchestrator:$WINDOW "echo '[$PROJECT:$PORT] Chrome Port: $PORT'" C-m
tmux send-keys -t e2e-orchestrator:$WINDOW "echo '[$PROJECT:$PORT] Session: e2e-$PROJECT-$(date +%s | tail -c 7)'" C-m
tmux send-keys -t e2e-orchestrator:$WINDOW "echo ''" C-m

# Simulate E2E test execution
tmux send-keys -t e2e-orchestrator:$WINDOW "echo '[$PROJECT:$PORT] ✅ Project context detected'" C-m
tmux send-keys -t e2e-orchestrator:$WINDOW "echo '[$PROJECT:$PORT] 📺 Using tmux window/session: e2e-$PROJECT-$(date +%s | tail -c 7)'" C-m
tmux send-keys -t e2e-orchestrator:$WINDOW "echo '[$PROJECT:$PORT] 🔌 Setting up Operator connection on Chrome port $PORT...'" C-m

echo "✅ Test launched for $PROJECT"
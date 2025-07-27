#!/bin/bash

# Multi-Project E2E Testing Setup Script
# Creates tmux orchestrator session with project windows

echo "🚀 Setting up Multi-Project E2E Testing Infrastructure"

# Kill existing orchestrator session if it exists
tmux kill-session -t e2e-orchestrator 2>/dev/null

# Create main orchestrator session with dashboard window
echo "📊 Creating orchestrator session..."
tmux new-session -d -s e2e-orchestrator -n dashboard

# Create project windows
echo "🪟 Creating project windows..."
tmux new-window -t e2e-orchestrator:1 -n demo-app
tmux new-window -t e2e-orchestrator:2 -n blog-platform
tmux new-window -t e2e-orchestrator:3 -n ecommerce-app
tmux new-window -t e2e-orchestrator:4 -n mobile-backend
tmux new-window -t e2e-orchestrator:5 -n api-service

# Create monitoring window
echo "📡 Creating monitoring window..."
tmux new-window -t e2e-orchestrator:6 -n monitoring

# Setup dashboard in window 0
echo "🎯 Starting dashboard..."
tmux send-keys -t e2e-orchestrator:0 'cd /Users/Mike/Desktop/programming/dev_ops/tools/e2e' C-m
tmux send-keys -t e2e-orchestrator:0 'node dashboard.js' C-m

# Setup monitoring window with split panes
echo "📊 Configuring monitoring panes..."
tmux select-window -t e2e-orchestrator:6

# Create 4-pane layout for monitoring
tmux split-window -h -t e2e-orchestrator:6
tmux split-window -v -t e2e-orchestrator:6.0
tmux split-window -v -t e2e-orchestrator:6.2

# Display session info
echo "✅ Multi-Project E2E Testing Infrastructure Ready!"
echo ""
echo "Session: e2e-orchestrator"
echo "Windows:"
echo "  0: dashboard     - Main orchestrator dashboard"
echo "  1: demo-app      - Demo application project"
echo "  2: blog-platform - Blog platform project"
echo "  3: ecommerce-app - E-commerce application project"
echo "  4: mobile-backend - Mobile backend service"
echo "  5: api-service   - API gateway service"
echo "  6: monitoring    - Multi-pane monitoring view"
echo ""
echo "To attach: tmux attach-session -t e2e-orchestrator"
echo "To switch windows: Ctrl-b [window-number]"
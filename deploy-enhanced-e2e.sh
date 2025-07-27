#!/bin/bash

# Enhanced E2E System Deployment Script
# This script sets up and verifies the enhanced E2E testing system

set -e

echo "🚀 Deploying Enhanced E2E System..."
echo "=================================="

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Check prerequisites
check_prerequisites() {
    echo -e "\n${YELLOW}Checking prerequisites...${NC}"
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        echo -e "${RED}❌ Node.js is not installed${NC}"
        exit 1
    fi
    echo -e "${GREEN}✅ Node.js found$(NC)"
    
    # Check tmux
    if ! command -v tmux &> /dev/null; then
        echo -e "${RED}❌ tmux is not installed${NC}"
        echo "   Install with: brew install tmux (macOS) or apt-get install tmux (Linux)"
        exit 1
    fi
    echo -e "${GREEN}✅ tmux found${NC}"
    
    # Check git
    if ! git status &> /dev/null; then
        echo -e "${RED}❌ Not in a git repository${NC}"
        exit 1
    fi
    echo -e "${GREEN}✅ Git repository detected${NC}"
}

# Setup Chrome
setup_chrome() {
    echo -e "\n${YELLOW}Setting up Chrome...${NC}"
    
    if ! pgrep -f "chrome.*remote-debugging-port=9222" > /dev/null; then
        echo -e "${YELLOW}Starting Chrome with debugging port...${NC}"
        
        if [[ "$OSTYPE" == "darwin"* ]]; then
            # macOS
            open -a "Google Chrome" --args --remote-debugging-port=9222 &
        else
            # Linux
            google-chrome --remote-debugging-port=9222 &
        fi
        
        sleep 3
    fi
    
    # Verify Chrome is accessible
    if curl -s http://localhost:9222/json/version > /dev/null; then
        echo -e "${GREEN}✅ Chrome debugging port is accessible${NC}"
    else
        echo -e "${RED}❌ Cannot connect to Chrome debugging port${NC}"
        exit 1
    fi
}

# Setup tmux session
setup_tmux() {
    echo -e "\n${YELLOW}Setting up tmux session...${NC}"
    
    if ! tmux has-session -t claude-code 2>/dev/null; then
        echo "Creating claude-code tmux session..."
        tmux new-session -d -s claude-code
        echo -e "${GREEN}✅ tmux session created${NC}"
    else
        echo -e "${GREEN}✅ tmux session already exists${NC}"
    fi
}

# Create log directory
setup_logs() {
    echo -e "\n${YELLOW}Setting up log directory...${NC}"
    
    if [ ! -d "logs" ]; then
        mkdir -p logs
        echo -e "${GREEN}✅ Log directory created${NC}"
    else
        echo -e "${GREEN}✅ Log directory exists${NC}"
    fi
}

# Run system test
run_system_test() {
    echo -e "\n${YELLOW}Running system verification...${NC}"
    
    if node test-enhanced-e2e.js; then
        echo -e "${GREEN}✅ System verification passed${NC}"
    else
        echo -e "${RED}❌ System verification failed${NC}"
        exit 1
    fi
}

# Generate sample configuration
generate_config() {
    echo -e "\n${YELLOW}Generating sample configuration...${NC}"
    
    if [ ! -f "config/e2e-config.json" ]; then
        mkdir -p config
        cat > config/e2e-config.json << EOF
{
  "maxIterations": 5,
  "timeouts": {
    "operator": 600000,
    "claude": 1200000
  },
  "retry": {
    "maxAttempts": 3,
    "backoffMultiplier": 2
  },
  "monitoring": {
    "alertThresholds": {
      "maxConsecutiveFailures": 2,
      "minSuccessRate": 0.8,
      "maxMemoryUsageMB": 2048
    }
  }
}
EOF
        echo -e "${GREEN}✅ Configuration file created${NC}"
    else
        echo -e "${GREEN}✅ Configuration file exists${NC}"
    fi
}

# Main deployment
main() {
    echo "Starting deployment at $(date)"
    
    # Change to e2e directory
    cd "$(dirname "$0")"
    
    # Run checks and setup
    check_prerequisites
    setup_chrome
    setup_tmux
    setup_logs
    generate_config
    run_system_test
    
    echo -e "\n${GREEN}🎉 Enhanced E2E System Successfully Deployed!${NC}"
    echo -e "\nTo run E2E tests:"
    echo -e "  ${YELLOW}node operator.execute_e2e.js <qa_ux_file.json>${NC}"
    echo -e "\nTo monitor system health:"
    echo -e "  ${YELLOW}node test-enhanced-e2e.js${NC}"
    echo -e "\nView logs in:"
    echo -e "  ${YELLOW}./logs/${NC}"
    echo -e "\nFor more information, see:"
    echo -e "  ${YELLOW}ENHANCED_E2E_DEPLOYMENT.md${NC}"
}

# Run main
main
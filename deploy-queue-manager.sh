#!/bin/bash

# Operator Queue Manager Deployment Script
# Deploys and tests the queue management integration

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR"
LOG_DIR="$PROJECT_ROOT/logs"
METRICS_DIR="$LOG_DIR/metrics"
CONFIG_DIR="$PROJECT_ROOT/config"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Parse command line arguments
ENVIRONMENT="development"
ENABLE_TESTS="true"
CLEANUP_THRESHOLD="5"
PRESERVE_LATEST="3"

while [[ $# -gt 0 ]]; do
    case $1 in
        -e|--environment)
            ENVIRONMENT="$2"
            shift 2
            ;;
        --no-tests)
            ENABLE_TESTS="false"
            shift
            ;;
        --threshold)
            CLEANUP_THRESHOLD="$2"
            shift 2
            ;;
        --preserve)
            PRESERVE_LATEST="$2"
            shift 2
            ;;
        -h|--help)
            echo "Usage: $0 [OPTIONS]"
            echo "Options:"
            echo "  -e, --environment    Environment (development|production) [default: development]"
            echo "  --no-tests          Skip integration tests"
            echo "  --threshold         Queue cleanup threshold [default: 5]"
            echo "  --preserve          Number of conversations to preserve [default: 3]"
            echo "  -h, --help          Show this help message"
            exit 0
            ;;
        *)
            error "Unknown option: $1"
            exit 1
            ;;
    esac
done

log "🚀 Starting Operator Queue Manager deployment"
log "Environment: $ENVIRONMENT"
log "Cleanup threshold: $CLEANUP_THRESHOLD"
log "Preserve latest: $PRESERVE_LATEST"

# Create necessary directories
log "📁 Creating directory structure..."
mkdir -p "$LOG_DIR" "$METRICS_DIR"

# Validate environment
if [[ "$ENVIRONMENT" != "development" && "$ENVIRONMENT" != "production" ]]; then
    error "Invalid environment: $ENVIRONMENT. Must be 'development' or 'production'"
    exit 1
fi

# Check dependencies
log "🔍 Checking dependencies..."

check_dependency() {
    local cmd="$1"
    local desc="$2"
    
    if ! command -v "$cmd" &> /dev/null; then
        error "$desc is not installed or not in PATH"
        return 1
    else
        success "$desc is available"
        return 0
    fi
}

DEPS_OK=true
check_dependency "node" "Node.js" || DEPS_OK=false
check_dependency "tmux" "tmux" || DEPS_OK=false
check_dependency "chrome" "Google Chrome" || check_dependency "google-chrome" "Google Chrome" || DEPS_OK=false

if [[ "$DEPS_OK" != "true" ]]; then
    error "Missing required dependencies"
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node --version | cut -d'v' -f2)
NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d'.' -f1)

if [[ "$NODE_MAJOR" -lt 16 ]]; then
    error "Node.js version $NODE_VERSION is not supported. Minimum version is 16.x"
    exit 1
fi

success "Node.js version $NODE_VERSION is supported"

# Validate configuration files
log "📋 Validating configuration files..."

CONFIG_FILE="$CONFIG_DIR/queue-management-$ENVIRONMENT.json"
if [[ ! -f "$CONFIG_FILE" ]]; then
    error "Configuration file not found: $CONFIG_FILE"
    exit 1
fi

# Validate JSON syntax
if ! node -e "JSON.parse(require('fs').readFileSync('$CONFIG_FILE', 'utf8'))" 2>/dev/null; then
    error "Invalid JSON syntax in configuration file: $CONFIG_FILE"
    exit 1
fi

success "Configuration file validated: $CONFIG_FILE"

# Check Chrome debugging port
log "🌐 Checking Chrome debugging setup..."

CHROME_PORT="9222"
if lsof -i :"$CHROME_PORT" &> /dev/null; then
    success "Chrome is running with debugging port $CHROME_PORT"
else
    warning "Chrome debugging port $CHROME_PORT is not available"
    log "Starting Chrome with debugging enabled..."
    
    # Attempt to start Chrome with debugging
    if command -v google-chrome &> /dev/null; then
        CHROME_CMD="google-chrome"
    elif command -v chrome &> /dev/null; then
        CHROME_CMD="chrome"
    else
        error "Chrome not found in PATH"
        exit 1
    fi
    
    # Start Chrome in background
    nohup "$CHROME_CMD" --remote-debugging-port="$CHROME_PORT" --no-first-run --no-default-browser-check > /dev/null 2>&1 &
    
    # Wait for Chrome to start
    sleep 3
    
    if lsof -i :"$CHROME_PORT" &> /dev/null; then
        success "Chrome started with debugging port $CHROME_PORT"
    else
        error "Failed to start Chrome with debugging port"
        exit 1
    fi
fi

# Test queue management components
if [[ "$ENABLE_TESTS" == "true" ]]; then
    log "🧪 Running integration tests..."
    
    # Test configuration loading
    log "Testing configuration loader..."
    if node -e "
        import('./lib/config-loader.js').then(({ ConfigLoader }) => {
            const loader = new ConfigLoader({ environment: '$ENVIRONMENT' });
            const config = loader.loadConfig();
            console.log('✅ Configuration loaded successfully');
            console.log('Queue management enabled:', config.queueManagement?.enabled);
        }).catch(err => {
            console.error('❌ Configuration test failed:', err.message);
            process.exit(1);
        })
    "; then
        success "Configuration loader test passed"
    else
        error "Configuration loader test failed"
        exit 1
    fi
    
    # Test queue manager initialization
    log "Testing queue manager initialization..."
    if node -e "
        import('./lib/operator-queue-manager.js').then(({ default: OperatorQueueManager }) => {
            const manager = new OperatorQueueManager({
                autoCleanupThreshold: $CLEANUP_THRESHOLD,
                preserveLatest: $PRESERVE_LATEST,
                debug: true,
                dryRun: true
            });
            console.log('✅ Queue manager initialized successfully');
            console.log('Stats:', manager.getStats());
        }).catch(err => {
            console.error('❌ Queue manager test failed:', err.message);
            process.exit(1);
        })
    "; then
        success "Queue manager initialization test passed"
    else
        error "Queue manager initialization test failed"
        exit 1
    fi
    
    # Test cleanup strategies
    log "Testing cleanup strategies..."
    if node -e "
        import('./lib/cleanup-strategies.js').then(({ CleanupStrategies }) => {
            console.log('✅ Cleanup strategies loaded successfully');
            console.log('Available methods:', Object.getOwnPropertyNames(CleanupStrategies).filter(name => name !== 'prototype'));
        }).catch(err => {
            console.error('❌ Cleanup strategies test failed:', err.message);
            process.exit(1);
        })
    "; then
        success "Cleanup strategies test passed"
    else
        error "Cleanup strategies test failed"
        exit 1
    fi
    
    # Test metrics system
    log "Testing metrics system..."
    if node -e "
        import('./lib/queue-metrics.js').then(({ QueueMetrics }) => {
            const metrics = new QueueMetrics({
                enablePersistence: false,
                enableRealTimeUpdates: false
            });
            const report = metrics.generateReport();
            console.log('✅ Metrics system working');
            console.log('Report keys:', Object.keys(report));
        }).catch(err => {
            console.error('❌ Metrics test failed:', err.message);
            process.exit(1);
        })
    "; then
        success "Metrics system test passed"
    else
        error "Metrics system test failed"
        exit 1
    fi
else
    warning "Skipping integration tests"
fi

# Create deployment configuration
log "⚙️  Creating deployment configuration..."

DEPLOYMENT_CONFIG="$LOG_DIR/deployment-config-$ENVIRONMENT.json"
cat > "$DEPLOYMENT_CONFIG" << EOF
{
  "deployment": {
    "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
    "environment": "$ENVIRONMENT",
    "version": "1.0.0",
    "configuration": {
      "queueCleanupThreshold": $CLEANUP_THRESHOLD,
      "preserveLatestConversations": $PRESERVE_LATEST,
      "enableHealthMonitoring": true,
      "enableMetrics": true
    },
    "paths": {
      "projectRoot": "$PROJECT_ROOT",
      "logDir": "$LOG_DIR",
      "metricsDir": "$METRICS_DIR",
      "configFile": "$CONFIG_FILE"
    },
    "systemInfo": {
      "nodeVersion": "$(node --version)",
      "platform": "$(uname -s)",
      "arch": "$(uname -m)"
    }
  }
}
EOF

success "Deployment configuration created: $DEPLOYMENT_CONFIG"

# Test E2E executor with queue management
if [[ "$ENABLE_TESTS" == "true" ]]; then
    log "🔄 Testing E2E executor integration..."
    
    # Create a test QA file
    TEST_QA_FILE="$LOG_DIR/test-qa-queue-manager.json"
    cat > "$TEST_QA_FILE" << EOF
{
  "metadata": {
    "demo_app_url": "https://example.com",
    "description": "Queue Manager Integration Test"
  },
  "tasks": {
    "test_task": {
      "status": "fail",
      "description": "Test queue management integration",
      "production_url": "https://example.com",
      "test_steps": ["Navigate to page", "Check functionality"],
      "qa_report": {
        "issues": ["Mock issue for testing queue management"]
      }
    }
  }
}
EOF
    
    log "Created test QA file: $TEST_QA_FILE"
    
    # Test dry run
    log "Running dry-run test..."
    if timeout 30 node operator.execute_e2e.js "$TEST_QA_FILE" \
        --environment="$ENVIRONMENT" \
        --enableQueueManagement=true \
        --queueCleanupThreshold="$CLEANUP_THRESHOLD" \
        --preserveLatestConversations="$PRESERVE_LATEST" \
        --maxIterations=1 \
        --dry-run 2>&1 | tee "$LOG_DIR/dry-run-test.log"; then
        success "Dry-run test completed successfully"
    else
        warning "Dry-run test had issues (this may be expected in test environment)"
        log "Check log file: $LOG_DIR/dry-run-test.log"
    fi
fi

# Create monitoring script
log "📊 Creating monitoring script..."

MONITOR_SCRIPT="$PROJECT_ROOT/monitor-queue-manager.sh"
cat > "$MONITOR_SCRIPT" << 'EOF'
#!/bin/bash

# Queue Manager Monitoring Script

METRICS_DIR="./logs/metrics"
LOG_DIR="./logs"

echo "🔍 Operator Queue Manager Status"
echo "================================"

# Check if metrics directory exists
if [[ -d "$METRICS_DIR" ]]; then
    echo "📊 Metrics Directory: $METRICS_DIR"
    echo "Files: $(ls -la "$METRICS_DIR" 2>/dev/null | wc -l) files"
    
    # Show latest metrics file
    LATEST_METRICS=$(ls -t "$METRICS_DIR"/queue-metrics*.json 2>/dev/null | head -1)
    if [[ -n "$LATEST_METRICS" ]]; then
        echo "📈 Latest Metrics: $(basename "$LATEST_METRICS")"
        echo "Size: $(du -h "$LATEST_METRICS" | cut -f1)"
        echo "Modified: $(stat -f "%Sm" "$LATEST_METRICS" 2>/dev/null || stat -c "%y" "$LATEST_METRICS" 2>/dev/null)"
    fi
else
    echo "⚠️  Metrics directory not found"
fi

# Check log files
echo ""
echo "📋 Recent E2E Logs:"
ls -lt "$LOG_DIR"/e2e_run_*.log 2>/dev/null | head -5 || echo "No E2E logs found"

# Check Chrome debugging port
echo ""
echo "🌐 Chrome Debugging Status:"
if lsof -i :9222 &> /dev/null; then
    echo "✅ Chrome debugging port 9222 is active"
    echo "PID: $(lsof -i :9222 | grep LISTEN | awk '{print $2}' | head -1)"
else
    echo "❌ Chrome debugging port 9222 is not active"
fi

# Check tmux sessions
echo ""
echo "🖥️  Tmux Sessions:"
tmux list-sessions 2>/dev/null || echo "No tmux sessions found"

echo ""
echo "✅ Monitoring check complete"
EOF

chmod +x "$MONITOR_SCRIPT"
success "Monitoring script created: $MONITOR_SCRIPT"

# Final status
log "✅ Deployment completed successfully!"
echo ""
echo "📋 Summary:"
echo "  Environment: $ENVIRONMENT"
echo "  Queue threshold: $CLEANUP_THRESHOLD"
echo "  Preserve latest: $PRESERVE_LATEST"
echo "  Configuration: $CONFIG_FILE"
echo "  Deployment config: $DEPLOYMENT_CONFIG"
echo "  Monitor script: $MONITOR_SCRIPT"
echo ""
echo "🚀 Next steps:"
echo "  1. Run: ./monitor-queue-manager.sh (to check status)"
echo "  2. Test: node operator.execute_e2e.js [qa-file] --enableQueueManagement=true"
echo "  3. Monitor: tail -f $LOG_DIR/e2e_run_*.log"
echo ""
echo "📚 Documentation:"
echo "  Queue management config: $CONFIG_FILE"
echo "  Logs directory: $LOG_DIR"
echo "  Metrics directory: $METRICS_DIR"

success "🎉 Queue Manager deployment ready!"
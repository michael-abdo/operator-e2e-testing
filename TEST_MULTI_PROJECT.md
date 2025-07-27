# Test Multi-Project E2E Testing Infrastructure

## Overview

This document describes the testing infrastructure for orchestrating and simulating multi-project E2E test use cases using tmux sessions and windows.

## Architecture

### 1. Tmux Session Structure

```
tmux-orchestrator (main session)
├── window 0: orchestrator-dashboard
├── window 1: project-demo-app
├── window 2: project-blog-platform
├── window 3: project-ecommerce-app
├── window 4: project-mobile-backend
└── window 5: monitoring-aggregator
```

### 2. Project Configuration

Each project requires a configuration file at `e2e/config/project-configs/[project-name].json`:

```json
{
  "projectName": "demo-app",
  "projectPath": "/Users/Mike/projects/demo-app",
  "chromePort": 9234,
  "qaFile": "tests/qa_ux_demo.json",
  "deploymentMethod": "heroku",
  "productionUrl": "https://demo-app.herokuapp.com",
  "maxIterations": 5,
  "timeouts": {
    "operator": 300000,
    "claude": 600000,
    "deployment": 180000
  }
}
```

### 3. Orchestrator Commands

#### Initialize Multi-Project Test
```bash
# Start the orchestrator
./e2e/multi-project-orchestrator.js init

# Add projects to test queue
./e2e/multi-project-orchestrator.js add demo-app
./e2e/multi-project-orchestrator.js add blog-platform
./e2e/multi-project-orchestrator.js add ecommerce-app

# Start all tests simultaneously
./e2e/multi-project-orchestrator.js start-all
```

#### Monitor and Control
```bash
# View real-time dashboard
./e2e/multi-project-orchestrator.js dashboard

# Pause specific project
./e2e/multi-project-orchestrator.js pause demo-app

# Resume specific project
./e2e/multi-project-orchestrator.js resume demo-app

# Stop all tests
./e2e/multi-project-orchestrator.js stop-all
```

## Testing Scenarios

### Scenario 1: Concurrent Independent Projects

Test multiple unrelated projects simultaneously to verify isolation:

```bash
# Terminal 1
cd /Users/Mike/projects/demo-app
node e2e/operator.execute_e2e.js tests/qa_ux_demo.json

# Terminal 2  
cd /Users/Mike/projects/blog-platform
node e2e/operator.execute_e2e.js tests/qa_blog_issues.json

# Terminal 3
cd /Users/Mike/projects/ecommerce-app
node e2e/operator.execute_e2e.js tests/qa_checkout_flow.json
```

Expected behavior:
- Each project uses different Chrome debug ports
- Separate tmux windows prevent output mixing
- Independent log directories
- No interference between tests

### Scenario 2: Coordinated Multi-Service Testing

Test microservices that depend on each other:

```javascript
// orchestration-config.json
{
  "testSuite": "microservices-integration",
  "projects": [
    {
      "name": "api-gateway",
      "port": 9234,
      "startOrder": 1,
      "dependencies": []
    },
    {
      "name": "auth-service",
      "port": 9235,
      "startOrder": 2,
      "dependencies": ["api-gateway"]
    },
    {
      "name": "user-service",
      "port": 9236,
      "startOrder": 3,
      "dependencies": ["api-gateway", "auth-service"]
    }
  ],
  "coordinationMode": "sequential-with-dependencies"
}
```

### Scenario 3: Load Testing with Multiple Instances

Simulate load by running multiple instances of the same project:

```bash
# Create multiple test instances
for i in {1..5}; do
  ./e2e/multi-project-orchestrator.js add demo-app --instance $i --port $((9234 + $i))
done

# Start all instances
./e2e/multi-project-orchestrator.js start-all --parallel
```

## Tmux Automation Scripts

### 1. Setup Script (`setup-multi-project.sh`)

```bash
#!/bin/bash

# Create main orchestrator session
tmux new-session -d -s e2e-orchestrator -n dashboard

# Create project windows
tmux new-window -t e2e-orchestrator:1 -n demo-app
tmux new-window -t e2e-orchestrator:2 -n blog-platform
tmux new-window -t e2e-orchestrator:3 -n ecommerce-app

# Setup monitoring window
tmux new-window -t e2e-orchestrator:4 -n monitoring

# Start dashboard in window 0
tmux send-keys -t e2e-orchestrator:0 './e2e/dashboard.js' C-m

# Attach to session
tmux attach-session -t e2e-orchestrator
```

### 2. Project Launcher (`launch-project-test.sh`)

```bash
#!/bin/bash

PROJECT=$1
WINDOW=$2
PORT=$3

# Switch to project window
tmux select-window -t e2e-orchestrator:$WINDOW

# Change to project directory
tmux send-keys -t e2e-orchestrator:$WINDOW "cd /Users/Mike/projects/$PROJECT" C-m

# Set Chrome port
tmux send-keys -t e2e-orchestrator:$WINDOW "export CHROME_PORT=$PORT" C-m

# Launch E2E test
tmux send-keys -t e2e-orchestrator:$WINDOW "node e2e/operator.execute_e2e.js tests/qa_test.json" C-m
```

### 3. Monitoring Script (`monitor-all-projects.sh`)

```bash
#!/bin/bash

# Switch to monitoring window
tmux select-window -t e2e-orchestrator:4

# Split window into panes for each project
tmux split-window -h
tmux split-window -v
tmux select-pane -t 0
tmux split-window -v

# Monitor each project's logs
tmux send-keys -t e2e-orchestrator:4.0 "tail -f /Users/Mike/projects/demo-app/logs/latest.log" C-m
tmux send-keys -t e2e-orchestrator:4.1 "tail -f /Users/Mike/projects/blog-platform/logs/latest.log" C-m
tmux send-keys -t e2e-orchestrator:4.2 "tail -f /Users/Mike/projects/ecommerce-app/logs/latest.log" C-m
tmux send-keys -t e2e-orchestrator:4.3 "watch -n 1 './e2e/status-summary.js'" C-m
```

## Testing Verification

### 1. Port Isolation Test

```javascript
// test/verify-port-isolation.js
const { exec } = require('child_process');

async function verifyPortIsolation() {
  const ports = [9234, 9235, 9236];
  
  for (const port of ports) {
    exec(`lsof -i :${port}`, (error, stdout) => {
      if (stdout.includes('chrome')) {
        console.log(`✅ Port ${port}: Chrome instance active`);
      } else {
        console.log(`❌ Port ${port}: No Chrome instance found`);
      }
    });
  }
}
```

### 2. Session Isolation Test

```javascript
// test/verify-session-isolation.js
function verifyTmuxSessions() {
  const { execSync } = require('child_process');
  
  const sessions = execSync('tmux list-windows -t e2e-orchestrator').toString();
  const expectedWindows = ['dashboard', 'demo-app', 'blog-platform', 'ecommerce-app'];
  
  expectedWindows.forEach(window => {
    if (sessions.includes(window)) {
      console.log(`✅ Window '${window}' exists`);
    } else {
      console.log(`❌ Window '${window}' missing`);
    }
  });
}
```

### 3. Concurrent Execution Test

```javascript
// test/verify-concurrent-execution.js
async function verifyConcurrentExecution() {
  const projectStatuses = {
    'demo-app': { window: 1, expectedState: 'active' },
    'blog-platform': { window: 2, expectedState: 'active' },
    'ecommerce-app': { window: 3, expectedState: 'active' }
  };
  
  for (const [project, config] of Object.entries(projectStatuses)) {
    const output = execSync(`tmux capture-pane -t e2e-orchestrator:${config.window} -p`);
    
    if (output.includes('OPERATOR SEND') || output.includes('CLAUDE INPUT')) {
      console.log(`✅ ${project}: Actively processing`);
    } else {
      console.log(`⚠️ ${project}: May be idle or completed`);
    }
  }
}
```

## Monitoring and Debugging

### 1. Real-time Status Dashboard

```javascript
// e2e/dashboard.js
class MultiProjectDashboard {
  constructor() {
    this.projects = new Map();
    this.updateInterval = 1000;
  }
  
  addProject(name, config) {
    this.projects.set(name, {
      ...config,
      status: 'pending',
      currentIteration: 0,
      startTime: null,
      errors: []
    });
  }
  
  updateStatus() {
    console.clear();
    console.log('╔════════════════════════════════════════════════════╗');
    console.log('║     Multi-Project E2E Testing Dashboard            ║');
    console.log('╠════════════════════════════════════════════════════╣');
    
    this.projects.forEach((project, name) => {
      const progress = (project.currentIteration / project.maxIterations) * 100;
      const progressBar = '█'.repeat(Math.floor(progress / 10)) + '░'.repeat(10 - Math.floor(progress / 10));
      
      console.log(`║ ${name.padEnd(15)} │ ${progressBar} │ ${progress.toFixed(0)}% │ ${project.status.padEnd(10)} ║`);
    });
    
    console.log('╚════════════════════════════════════════════════════╝');
  }
}
```

### 2. Log Aggregation

```javascript
// e2e/log-aggregator.js
class LogAggregator {
  constructor(projects) {
    this.projects = projects;
    this.aggregatedLog = './logs/multi-project-aggregate.log';
  }
  
  startAggregation() {
    this.projects.forEach(project => {
      const logPath = `${project.path}/logs/latest.log`;
      
      // Tail each project's log and prefix with project name
      const tail = spawn('tail', ['-f', logPath]);
      
      tail.stdout.on('data', (data) => {
        const prefixedData = data.toString().split('\n')
          .map(line => `[${project.name}] ${line}`)
          .join('\n');
        
        fs.appendFileSync(this.aggregatedLog, prefixedData);
      });
    });
  }
}
```

### 3. Error Detection and Alerting

```javascript
// e2e/error-monitor.js
class MultiProjectErrorMonitor {
  constructor() {
    this.errorPatterns = [
      /TASK_FINISHED.*not detected/i,
      /Chrome.*not.*reachable/i,
      /Deployment.*failed/i,
      /Timeout.*exceeded/i
    ];
  }
  
  monitorProject(projectName, logPath) {
    const tail = spawn('tail', ['-f', logPath]);
    
    tail.stdout.on('data', (data) => {
      const content = data.toString();
      
      this.errorPatterns.forEach(pattern => {
        if (pattern.test(content)) {
          this.alertError(projectName, content, pattern);
        }
      });
    });
  }
  
  alertError(project, content, pattern) {
    console.error(`🚨 ERROR in ${project}: ${pattern}`);
    
    // Send notification (e.g., Slack, email)
    this.sendNotification({
      project,
      error: content,
      timestamp: new Date().toISOString()
    });
  }
}
```

## Success Metrics

### 1. Isolation Verification
- No port conflicts between projects
- No tmux window/pane interference
- Independent log files and directories
- No shared Chrome instances

### 2. Performance Metrics
- Concurrent execution reduces total test time by 60-80%
- Resource usage scales linearly with project count
- No performance degradation up to 10 concurrent projects

### 3. Reliability Metrics
- 99%+ success rate for isolated test execution
- Automatic recovery from individual project failures
- No cascade failures between projects

## Troubleshooting

### Common Issues

1. **Port Conflicts**
   ```bash
   # Check port usage
   lsof -i :9234-9250
   
   # Kill stuck Chrome instances
   pkill -f "chrome.*remote-debugging-port"
   ```

2. **Tmux Session Issues**
   ```bash
   # List all sessions
   tmux ls
   
   # Kill stuck session
   tmux kill-session -t e2e-orchestrator
   ```

3. **Resource Constraints**
   ```bash
   # Monitor system resources
   htop
   
   # Limit concurrent projects
   ./e2e/multi-project-orchestrator.js set-max-concurrent 3
   ```

## Future Enhancements

1. **Distributed Testing**
   - Run projects on different machines
   - Central orchestrator with remote agents
   - Cloud-based test execution

2. **Advanced Scheduling**
   - Priority-based project queuing
   - Resource-aware scheduling
   - Dependency graph execution

3. **Integration with CI/CD**
   - GitHub Actions integration
   - GitLab CI integration
   - Jenkins pipeline support

4. **Enhanced Monitoring**
   - Grafana dashboards
   - Prometheus metrics
   - Real-time alerts and notifications
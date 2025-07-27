#!/usr/bin/env node

/**
 * Multi-Project E2E Testing Dashboard
 * Real-time monitoring of multiple concurrent E2E test executions
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class MultiProjectDashboard {
  constructor() {
    this.projects = new Map();
    this.updateInterval = 1000;
    this.startTime = Date.now();
    this.configDir = path.join(__dirname, 'config/project-configs');
  }

  loadProjects() {
    // Load all project configurations
    const configFiles = fs.readdirSync(this.configDir)
      .filter(file => file.endsWith('.json') && !file.includes('default') && !file.includes('schema'));

    configFiles.forEach(file => {
      const config = JSON.parse(fs.readFileSync(path.join(this.configDir, file), 'utf8'));
      if (config.projectName) {
        this.addProject(config.projectName, config);
      }
    });
  }

  addProject(name, config) {
    this.projects.set(name, {
      ...config,
      status: 'pending',
      currentIteration: 0,
      startTime: null,
      lastUpdate: null,
      errors: [],
      phase: 'waiting'
    });
  }

  updateProjectStatus(projectName) {
    const project = this.projects.get(projectName);
    if (!project) return;

    try {
      // Try to capture tmux pane content to determine status
      const windowIndex = this.getWindowIndex(projectName);
      if (windowIndex >= 0) {
        const paneContent = execSync(
          `tmux capture-pane -t e2e-orchestrator:${windowIndex} -p | tail -20`,
          { encoding: 'utf8' }
        );

        // Update status based on content
        if (paneContent.includes('OPERATOR SEND')) {
          project.phase = 'operator-analysis';
          project.status = 'active';
        } else if (paneContent.includes('CLAUDE INPUT')) {
          project.phase = 'claude-processing';
          project.status = 'active';
        } else if (paneContent.includes('Deploying to')) {
          project.phase = 'deployment';
          project.status = 'active';
        } else if (paneContent.includes('TASK_FINISHED')) {
          project.currentIteration++;
          project.phase = 'iteration-complete';
        } else if (paneContent.includes('All tasks resolved')) {
          project.status = 'completed';
          project.phase = 'success';
        } else if (paneContent.includes('ERROR') || paneContent.includes('Failed')) {
          project.status = 'error';
          project.errors.push(paneContent.match(/ERROR.*$/m)?.[0] || 'Unknown error');
        }

        // Extract iteration info
        const iterMatch = paneContent.match(/Iteration: (\d+)\/(\d+)/);
        if (iterMatch) {
          project.currentIteration = parseInt(iterMatch[1]);
          project.maxIterations = parseInt(iterMatch[2]);
        }
      }
    } catch (e) {
      // Window might not exist yet
    }

    project.lastUpdate = Date.now();
  }

  getWindowIndex(projectName) {
    const windowMap = {
      'demo-app': 1,
      'blog-platform': 2,
      'ecommerce-app': 3,
      'mobile-backend': 4,
      'api-service': 5
    };
    return windowMap[projectName] || -1;
  }

  formatDuration(ms) {
    if (!ms) return '-';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  renderDashboard() {
    console.clear();
    
    // Header
    console.log('┌─────────────────────────────────────────────────────────────────────┐');
    console.log('│  Multi-Project E2E Testing Orchestrator                             │');
    console.log('├─────────────────────────────────────────────────────────────────────┤');
    
    // Summary stats
    const activeCount = Array.from(this.projects.values()).filter(p => p.status === 'active').length;
    const completedCount = Array.from(this.projects.values()).filter(p => p.status === 'completed').length;
    const errorCount = Array.from(this.projects.values()).filter(p => p.status === 'error').length;
    const totalIterations = Array.from(this.projects.values()).reduce((sum, p) => sum + p.currentIteration, 0);
    
    console.log(`│  Active Sessions: ${activeCount}    Completed: ${completedCount}    Errors: ${errorCount}                     │`);
    console.log(`│  Total Iterations: ${totalIterations}    Runtime: ${this.formatDuration(Date.now() - this.startTime)}                        │`);
    console.log('├─────────────────────────────────────────────────────────────────────┤');
    
    // Project list
    this.projects.forEach((project, name) => {
      const progress = project.maxIterations ? (project.currentIteration / project.maxIterations) * 100 : 0;
      const progressBar = this.renderProgressBar(progress);
      const statusIcon = this.getStatusIcon(project.status);
      const phaseStr = project.phase.padEnd(20);
      
      console.log(`│  ${statusIcon} ${name.padEnd(15)} ${progressBar} ${progress.toFixed(0).padStart(3)}% │ ${phaseStr} │`);
    });
    
    console.log('├─────────────────────────────────────────────────────────────────────┤');
    console.log('│  Commands: [s] Switch view  [p] Pause  [r] Resume  [q] Quit        │');
    console.log('└─────────────────────────────────────────────────────────────────────┘');
    
    // Error details if any
    const projectsWithErrors = Array.from(this.projects.entries()).filter(([_, p]) => p.errors.length > 0);
    if (projectsWithErrors.length > 0) {
      console.log('\n⚠️  Recent Errors:');
      projectsWithErrors.forEach(([name, project]) => {
        console.log(`  ${name}: ${project.errors[project.errors.length - 1]}`);
      });
    }
  }

  renderProgressBar(percentage) {
    const filled = Math.floor(percentage / 10);
    const empty = 10 - filled;
    return '▓'.repeat(filled) + '░'.repeat(empty);
  }

  getStatusIcon(status) {
    const icons = {
      'pending': '⏳',
      'active': '🔄',
      'completed': '✅',
      'error': '❌',
      'paused': '⏸️'
    };
    return icons[status] || '❓';
  }

  start() {
    this.loadProjects();
    
    // Initial render
    this.renderDashboard();
    
    // Update loop
    setInterval(() => {
      this.projects.forEach((project, name) => {
        this.updateProjectStatus(name);
      });
      this.renderDashboard();
    }, this.updateInterval);

    // Handle keyboard input
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', (key) => {
      const char = key.toString();
      
      if (char === 'q' || char === '\x03') { // q or Ctrl+C
        console.clear();
        console.log('Dashboard shutting down...');
        process.exit(0);
      } else if (char === 's') {
        // Switch view logic
        console.log('\nSwitching view not implemented yet');
      } else if (char === 'p') {
        // Pause logic
        console.log('\nPause functionality not implemented yet');
      } else if (char === 'r') {
        // Resume logic
        console.log('\nResume functionality not implemented yet');
      }
    });
  }
}

// Start the dashboard
const dashboard = new MultiProjectDashboard();
dashboard.start();
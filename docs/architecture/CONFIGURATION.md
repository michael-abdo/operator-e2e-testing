# Cross-Project E2E Testing Configuration Guide

## Table of Contents
1. [Overview](#overview)
2. [Configuration Architecture](#configuration-architecture)
3. [Global Configuration](#global-configuration)
4. [Project-Specific Configuration](#project-specific-configuration)
5. [Schema Validation](#schema-validation)
6. [Environment Variables](#environment-variables)
7. [Advanced Configuration](#advanced-configuration)
8. [Troubleshooting](#troubleshooting)
9. [Best Practices](#best-practices)

## Overview

The cross-project E2E testing system uses a hierarchical configuration system that supports:

- **Global defaults** for system-wide settings
- **Project-specific overrides** for custom configurations
- **Schema validation** to ensure configuration correctness
- **Runtime configuration** through environment variables
- **Platform-specific deployment** configurations

## Configuration Architecture

### Configuration Hierarchy

```
1. System Defaults (built-in)
   ↓
2. Global Configuration (/config/default.json)
   ↓  
3. Project Configuration (/config/project-configs/{project-name}.json)
   ↓
4. Environment Variables (runtime overrides)
```

### File Locations

```
e2e/
├── config/
│   ├── default.json                    # Global E2E settings
│   ├── task_finished_monitor.json      # Task monitoring config
│   └── project-configs/
│       ├── README.md                   # Project config documentation
│       ├── schema.json                 # JSON schema for validation
│       ├── default.json                # Default project template
│       ├── demo-app.json              # Example project config
│       └── {project-name}.json        # Your project configs
```

## Global Configuration

Located at: `config/default.json`

### Structure

```json
{
  "execution": {
    "maxIterations": 5,
    "timeoutPerIteration": 300000,
    "pauseBetweenIterations": 2000
  },
  "claude": {
    "responseTimeout": 30000,
    "maxRetries": 3,
    "workingDirectory": null
  },
  "operator": {
    "chromeDebugPort": 9222,
    "responseTimeout": 30000,
    "preferConversation": false,
    "waitForResponse": true
  },
  "statusUpdate": {
    "autoPassThreshold": 0.7,
    "requireExplicitPass": false,
    "backupOnUpdate": true
  },
  "logging": {
    "verbose": true,
    "saveConversations": true,
    "logDir": "./logs"
  }
}
```

### Configuration Sections

#### Execution Settings
- `maxIterations`: Maximum E2E test cycles
- `timeoutPerIteration`: Time limit per iteration (ms)  
- `pauseBetweenIterations`: Delay between iterations (ms)

#### Claude Integration
- `responseTimeout`: Max wait time for Claude responses (ms)
- `maxRetries`: Retry attempts for failed operations
- `workingDirectory`: Override working directory for Claude

#### Operator Integration  
- `chromeDebugPort`: Base Chrome debug port
- `responseTimeout`: Max wait time for Operator responses (ms)
- `preferConversation`: Use existing conversations when possible
- `waitForResponse`: Wait for Operator responses vs fire-and-forget

#### Status Management
- `autoPassThreshold`: Confidence threshold for auto-passing tasks
- `requireExplicitPass`: Require explicit pass confirmation
- `backupOnUpdate`: Create backups when updating task status

#### Logging
- `verbose`: Enable detailed logging
- `saveConversations`: Save conversation transcripts
- `logDir`: Directory for log files

## Project-Specific Configuration

Located at: `config/project-configs/{project-name}.json`

### Basic Structure

```json
{
  "description": "Project description",
  "maxIterations": 5,
  "chromePortOffset": 0,
  "tmuxSessionPrefix": "e2e",
  "logRetentionDays": 7,
  "timeouts": {
    "operatorPhase": 60000,
    "claudePhase": 120000,
    "chromeConnection": 10000
  },
  "validation": {
    "enforceUniqueness": true,
    "validatePorts": true,
    "checkTmuxAvailability": true,
    "customValidations": []
  },
  "logging": {
    "level": "info",
    "includeTimestamps": true,
    "bufferSize": 1000,
    "flushOnCritical": true
  },
  "deployment": {
    "autoDetectPlatform": true,
    "platform": "heroku",
    "verifyAfterDeploy": true,
    "deploymentTimeout": 300000,
    "supportedPlatforms": ["heroku", "vercel", "aws", "custom"],
    "customCommands": {
      "deploy": "git push heroku main",
      "verify": "curl -f https://app.herokuapp.com/health"
    }
  }
}
```

### Configuration Options

#### Core Settings
- `maxIterations` (1-20): Maximum test iterations
- `chromePortOffset` (0-99): Additional port offset for Chrome
- `tmuxSessionPrefix` (string): Prefix for tmux session names
- `logRetentionDays` (1-90): Days to keep log files

#### Timeout Configuration
- `timeouts.operatorPhase` (30s-30min): Max time for Operator analysis
- `timeouts.claudePhase` (1min-1hour): Max time for Claude implementation  
- `timeouts.chromeConnection` (5s-1min): Chrome connection timeout

#### Validation Settings
- `validation.enforceUniqueness`: Ensure unique ports/sessions
- `validation.validatePorts`: Check port availability
- `validation.checkTmuxAvailability`: Verify tmux accessibility
- `validation.customValidations`: Array of custom validation checks

#### Logging Configuration
- `logging.level`: Log level (debug, info, warn, error)
- `logging.includeTimestamps`: Include timestamps in logs
- `logging.bufferSize` (100-10000): Log buffer size before flush
- `logging.flushOnCritical`: Immediate flush for critical events

#### Deployment Settings
- `deployment.autoDetectPlatform`: Auto-detect deployment platform
- `deployment.platform`: Specific platform (heroku, vercel, aws, custom)
- `deployment.verifyAfterDeploy`: Verify deployment success
- `deployment.deploymentTimeout` (1min-30min): Deployment timeout
- `deployment.supportedPlatforms`: Array of supported platforms
- `deployment.customCommands`: Platform-specific commands

## Schema Validation

### Validation Features

The system provides comprehensive validation:

- **Type checking**: Ensures correct data types
- **Range validation**: Enforces min/max values
- **Pattern matching**: Validates string patterns (e.g., session names)
- **Enum validation**: Restricts values to allowed sets
- **Fallback behavior**: Uses defaults for invalid values
- **Warning system**: Logs warnings for invalid values

### Validation Rules

#### Numbers
```javascript
maxIterations: 1-20 (default: 5)
chromePortOffset: 0-99 (default: 0)
logRetentionDays: 1-90 (default: 7)
operatorPhase: 30000-1800000ms (default: 60000)
claudePhase: 60000-3600000ms (default: 120000)
chromeConnection: 5000-60000ms (default: 10000)
deploymentTimeout: 60000-1800000ms (default: 300000)
bufferSize: 100-10000 (default: 1000)
```

#### Strings
```javascript
tmuxSessionPrefix: ^[a-zA-Z0-9_-]+$ (max 20 chars, default: "e2e")
platform: "heroku" | "vercel" | "aws" | "custom"
level: "debug" | "info" | "warn" | "error" (default: "info")
```

#### Booleans
```javascript
enforceUniqueness: true | false (default: true)
validatePorts: true | false (default: true)  
checkTmuxAvailability: true | false (default: true)
autoDetectPlatform: true | false (default: true)
verifyAfterDeploy: true | false (default: true)
includeTimestamps: true | false (default: true)
flushOnCritical: true | false (default: true)
```

### Custom Validation

Add custom validation checks:

```json
{
  "validation": {
    "customValidations": [
      "heroku_auth",
      "git_remote_heroku",
      "docker_available",
      "ssl_certificates"
    ]
  }
}
```

## Environment Variables

Override configuration at runtime:

```bash
# Core settings
export E2E_MAX_ITERATIONS=8
export E2E_CHROME_PORT_OFFSET=10
export E2E_LOG_LEVEL=debug

# Timeouts (in milliseconds)
export E2E_OPERATOR_TIMEOUT=90000
export E2E_CLAUDE_TIMEOUT=240000
export E2E_DEPLOYMENT_TIMEOUT=600000

# Deployment
export E2E_DEPLOYMENT_PLATFORM=heroku
export E2E_VERIFY_DEPLOYMENT=true

# Logging
export E2E_LOG_RETENTION_DAYS=14
export E2E_LOG_BUFFER_SIZE=2000

# Validation
export E2E_ENFORCE_UNIQUENESS=true
export E2E_VALIDATE_PORTS=true
```

### Priority Order

1. Environment variables (highest priority)
2. Project-specific configuration
3. Global configuration  
4. System defaults (lowest priority)

## Advanced Configuration

### Platform-Specific Configurations

#### Heroku Configuration
```json
{
  "deployment": {
    "platform": "heroku",
    "customCommands": {
      "deploy": "git push heroku main",
      "verify": "heroku ps:scale web=1",
      "rollback": "heroku rollback"
    },
    "deploymentTimeout": 600000,
    "verifyAfterDeploy": true
  },
  "validation": {
    "customValidations": ["heroku_auth", "git_remote_heroku"]
  }
}
```

#### Vercel Configuration
```json
{
  "deployment": {
    "platform": "vercel",
    "customCommands": {
      "deploy": "vercel --prod",
      "verify": "curl -f https://app.vercel.app/api/health"
    },
    "deploymentTimeout": 300000
  },
  "validation": {
    "customValidations": ["vercel_auth", "vercel_project"]
  }
}
```

#### AWS Configuration
```json
{
  "deployment": {
    "platform": "aws",
    "customCommands": {
      "deploy": "sam deploy --guided",
      "verify": "aws lambda invoke --function-name health-check"
    },
    "deploymentTimeout": 900000
  },
  "validation": {
    "customValidations": ["aws_credentials", "sam_cli"]
  }
}
```

### Multi-Environment Setup

#### Development Environment
```json
{
  "description": "Development environment configuration",
  "maxIterations": 2,
  "logging": {
    "level": "debug",
    "bufferSize": 5000
  },
  "timeouts": {
    "operatorPhase": 300000,
    "claudePhase": 600000
  },
  "deployment": {
    "platform": "custom",
    "customCommands": {
      "deploy": "npm run dev",
      "verify": "curl -f http://localhost:3000/health"
    }
  }
}
```

#### Production Environment
```json
{
  "description": "Production environment configuration",
  "maxIterations": 8,
  "logging": {
    "level": "warn",
    "bufferSize": 500
  },
  "timeouts": {
    "operatorPhase": 120000,
    "claudePhase": 300000
  },
  "deployment": {
    "platform": "heroku",
    "verifyAfterDeploy": true,
    "deploymentTimeout": 600000
  }
}
```

## Troubleshooting

### Common Configuration Issues

#### Invalid Configuration Values
```
Configuration validation warnings:
  - Invalid maxIterations: -1, using default: 5
  - Invalid chromePortOffset: 150, using default: 0
```

**Solution**: Check configuration values against schema limits.

#### Port Conflicts
```
Chrome port 9222 already in use
```

**Solutions**:
- Increase `chromePortOffset` in project configuration
- Kill existing Chrome processes: `pkill -f "chrome.*remote-debugging"`
- Use different base port range

#### Tmux Session Conflicts
```
Tmux session 'e2e-myapp-abc12345' already exists
```

**Solutions**:
- Kill existing session: `tmux kill-session -t e2e-myapp-abc12345`
- Change `tmuxSessionPrefix` in configuration
- Use project isolation: run from different directories

#### Configuration File Errors
```
Failed to load config from /path/to/config.json: Invalid JSON
```

**Solutions**:
- Validate JSON syntax using `jq . config.json`
- Check file permissions: `ls -la config.json`
- Ensure file encoding is UTF-8

#### Deployment Configuration Issues
```
Deployment command failed: heroku: command not found
```

**Solutions**:
- Install required deployment tools
- Add tools to PATH
- Use absolute paths in `customCommands`
- Add validation checks for required tools

### Debug Configuration

Enable debug mode for configuration troubleshooting:

```json
{
  "logging": {
    "level": "debug",
    "includeTimestamps": true,
    "bufferSize": 10000
  },
  "validation": {
    "customValidations": ["debug_mode"]
  }
}
```

## Best Practices

### Configuration Management

1. **Start Simple**: Begin with default configuration and add overrides as needed
2. **Document Changes**: Use descriptive `description` fields
3. **Version Control**: Keep configuration files in version control
4. **Environment Separation**: Use different configs for dev/staging/prod
5. **Validate Early**: Test configurations with mock runs

### Performance Optimization

1. **Appropriate Timeouts**: Set realistic timeouts based on project complexity
2. **Log Management**: Use appropriate log levels and buffer sizes
3. **Port Management**: Use port offsets to avoid conflicts
4. **Resource Cleanup**: Set reasonable log retention periods

### Security Considerations

1. **No Secrets**: Never store secrets in configuration files
2. **Environment Variables**: Use environment variables for sensitive data
3. **Access Control**: Restrict access to configuration directories
4. **Validation**: Enable all validation checks in production

### Monitoring and Maintenance

1. **Log Analysis**: Monitor logs for configuration warnings
2. **Performance Metrics**: Track timeout occurrences and iteration counts
3. **Regular Review**: Review and update configurations periodically
4. **Documentation**: Keep configuration documentation up to date

## Configuration Examples

### Quick Start Template
```json
{
  "description": "Quick start configuration for new projects",
  "maxIterations": 3,
  "timeouts": {
    "operatorPhase": 90000,
    "claudePhase": 180000
  }
}
```

### High-Performance Template
```json
{
  "description": "High-performance configuration for complex projects",
  "maxIterations": 10,
  "timeouts": {
    "operatorPhase": 180000,
    "claudePhase": 600000
  },
  "logging": {
    "level": "warn",
    "bufferSize": 5000
  }
}
```

### Debug Template
```json
{
  "description": "Debug configuration with verbose logging",
  "maxIterations": 1,
  "logging": {
    "level": "debug",
    "bufferSize": 10000,
    "flushOnCritical": true
  },
  "timeouts": {
    "operatorPhase": 600000,
    "claudePhase": 1200000
  }
}
```

## Configuration API Reference

### ProjectManager Methods

```javascript
// Load configuration
const config = await projectManager.loadProjectConfig(configPath);

// Validate configuration
const validatedConfig = projectManager._validateConfig(config);

// Get configuration schema
const schema = projectManager.getConfigSchema();

// Clear configuration cache
projectManager.clearConfigCache();
projectManager.clearConfigCache(specificConfigPath);

// Deep merge configurations
const merged = projectManager._deepMergeConfig(defaults, overrides);
```

### Configuration Properties

See the [Schema Validation](#schema-validation) section for complete property reference.

---

*This configuration system enables flexible, validated, and maintainable E2E testing setups across multiple projects and environments.*
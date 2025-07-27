# Project-Specific Configuration System

## Overview

This directory contains project-specific configuration files for the cross-project E2E testing system. Each project can have its own configuration file that overrides the default settings.

## File Naming Convention

- Configuration files should be named: `{project-name}.json`
- The project name is automatically detected from the current working directory
- Example: `/my-app` directory → `my-app.json` configuration file

## Configuration Structure

### Core Settings

```json
{
  "description": "Human-readable description of this configuration",
  "maxIterations": 5,              // Maximum E2E test iterations
  "chromePortOffset": 0,           // Additional offset for Chrome debug port
  "tmuxSessionPrefix": "e2e",      // Prefix for tmux session names
  "logRetentionDays": 7            // How long to keep log files
}
```

### Timeout Configuration

```json
{
  "timeouts": {
    "operatorPhase": 60000,        // Max time for Operator analysis (ms)
    "claudePhase": 120000,         // Max time for Claude implementation (ms)
    "chromeConnection": 10000      // Chrome connection timeout (ms)
  }
}
```

### Validation Settings

```json
{
  "validation": {
    "enforceUniqueness": true,     // Enforce unique ports/sessions
    "validatePorts": true,         // Check port availability
    "checkTmuxAvailability": true, // Verify tmux is available
    "customValidations": []        // Project-specific validation checks
  }
}
```

### Logging Configuration

```json
{
  "logging": {
    "level": "info",               // Log level: debug, info, warn, error
    "includeTimestamps": true,     // Include timestamps in logs
    "bufferSize": 1000,           // Log buffer size before flush
    "flushOnCritical": true       // Immediate flush for critical events
  }
}
```

### Deployment Settings

```json
{
  "deployment": {
    "autoDetectPlatform": true,    // Auto-detect deployment platform
    "platform": "heroku",         // Specific platform override
    "verifyAfterDeploy": true,     // Verify deployment success
    "deploymentTimeout": 300000,   // Deployment timeout (ms)
    "supportedPlatforms": [        // Supported deployment platforms
      "heroku", "vercel", "aws", "custom"
    ],
    "customCommands": {            // Platform-specific commands
      "deploy": "git push heroku main",
      "verify": "curl -f https://app.herokuapp.com/health"
    }
  }
}
```

## Configuration Inheritance

1. **System defaults** are loaded from `default.json`
2. **Project-specific overrides** are loaded from `{project-name}.json`
3. **Merging strategy**: Project settings override defaults, missing values fallback to defaults

## Example Usage

### Basic Project Configuration

For a project called "my-webapp" with longer timeouts:

```json
// my-webapp.json
{
  "description": "My Web Application E2E Configuration",
  "maxIterations": 8,
  "timeouts": {
    "operatorPhase": 120000,
    "claudePhase": 300000
  }
}
```

### Heroku-Specific Configuration

```json
// heroku-app.json
{
  "description": "Heroku deployment configuration",
  "deployment": {
    "platform": "heroku",
    "customCommands": {
      "deploy": "git push heroku main",
      "verify": "heroku ps:scale web=1"
    },
    "deploymentTimeout": 600000
  }
}
```

### Development/Debug Configuration

```json
// debug-project.json
{
  "description": "Development debugging configuration",
  "maxIterations": 2,
  "logging": {
    "level": "debug",
    "bufferSize": 5000
  },
  "timeouts": {
    "operatorPhase": 300000,
    "claudePhase": 600000
  }
}
```

## Configuration Validation

The ProjectManager validates configuration files and:

- Falls back to defaults for invalid values
- Warns about unrecognized configuration keys
- Ensures timeout values are reasonable
- Validates platform-specific settings

## Best Practices

1. **Start with defaults**: Only override values you need to change
2. **Document overrides**: Use descriptive `description` field
3. **Test configurations**: Validate with different project types
4. **Platform-specific**: Create separate configs for different deployment targets
5. **Reasonable timeouts**: Don't set timeouts too low or too high

## Troubleshooting

### Configuration Not Loading
- Check file name matches project directory name (sanitized)
- Verify JSON syntax is valid
- Check file permissions are readable

### Timeout Issues
- Increase `operatorPhase` for complex analysis tasks
- Increase `claudePhase` for large codebases
- Adjust `deploymentTimeout` based on platform

### Port Conflicts
- Use `chromePortOffset` to avoid conflicts
- Ensure base Chrome port (9222) + offset doesn't exceed 9321

## File Locations

- **Default config**: `config/project-configs/default.json`
- **Project configs**: `config/project-configs/{project-name}.json`
- **Monitor config**: `config/task_finished_monitor.json`
- **Global config**: `config/default.json`
# Cross-Project E2E Testing Implementation Plan

## Overview

Enable the E2E testing system to run simultaneously across multiple projects in different directories and tmux sessions, eliminating conflicts through natural OS-level isolation.

## Core Insight

**Natural Isolation Benefits:**
- Different tmux sessions = No window name conflicts
- Different directories = No file path conflicts  
- Different Chrome instances = No browser conflicts
- Different project contexts = No shared state conflicts

## Task Breakdown

### Phase 1: Project Context Management (2 hours)

#### Task 1.1: Create ProjectManager Class (45 minutes)
**File:** `lib/project-manager.js`

**Atomic Steps:**
1. Create new file `lib/project-manager.js`
2. Import required dependencies (`path`, `crypto`, `fs`)
3. Define `ProjectManager` class with constructor
4. Add method `detectProjectContext()` that:
   - Uses `process.cwd()` to get current directory
   - Extracts project name from directory path
   - Generates project hash for uniqueness
5. Add method `generateChromePort()` that:
   - Takes project hash as input
   - Returns deterministic port (9222 + hash % 100)
   - Ensures ports don't conflict
6. Add method `getTmuxSessionName()` that:
   - Returns `e2e-${projectName}-${shortHash}`
   - Ensures session name uniqueness
7. Add method `getLogDirectory()` that:
   - Returns project-specific log path
   - Creates directory if it doesn't exist
8. Export ProjectManager class

**Acceptance Criteria:**
- ProjectManager can detect project from any directory
- Chrome ports are deterministic but unique per project
- Tmux session names are collision-free
- Log directories are project-isolated

#### Task 1.2: Add Project Detection Logic (30 minutes)

**Atomic Steps:**
1. Open `operator.execute_e2e.js`
2. Import ProjectManager at top of file
3. In `OperatorE2EExecutor` constructor:
   - Instantiate `this.projectManager = new ProjectManager()`
   - Call `this.projectContext = this.projectManager.detectProjectContext()`
   - Store project-specific settings
4. Update Chrome port assignment:
   - Replace hardcoded `9222` with `this.projectContext.chromePort`
5. Update tmux session naming:
   - Use `this.projectContext.tmuxSessionName`
6. Update log file paths:
   - Use `this.projectContext.logDirectory`
7. Add project context to all log messages

**Acceptance Criteria:**
- Each project gets unique Chrome port automatically
- Tmux sessions are named by project
- Logs are saved to project-specific directories
- Project context is visible in all log output

#### Task 1.3: Create Project Configuration System (45 minutes)
**Files:** `config/project-configs/` directory

**Atomic Steps:**
1. Create directory `config/project-configs/`
2. Create `config/project-configs/default.json` with:
   - Chrome port offset settings
   - Tmux session prefix options
   - Log rotation settings
   - Project-specific timeouts
3. Create `config/project-configs/README.md` explaining:
   - How to override settings per project
   - Naming conventions for config files
   - Available configuration options
4. Update ProjectManager to:
   - Check for project-specific config file
   - Merge with default settings
   - Handle missing config gracefully
5. Add validation for config values
6. Add config loading error handling

**Acceptance Criteria:**
- Projects can have custom configuration
- Default config works for all projects
- Invalid configs are handled gracefully
- Configuration is well-documented

### Phase 2: Chrome Instance Management (1 hour)

#### Task 2.1: Update Chrome Connection Logic (30 minutes)

**Atomic Steps:**
1. Open `../operator/send_and_wait_for_response.js`
2. Locate Chrome connection initialization
3. Add parameter for custom Chrome port
4. Update connection string to use dynamic port
5. Add connection retry logic for different ports
6. Add error handling for port conflicts
7. Update all Chrome Debug Protocol calls to use dynamic port
8. Add logging for Chrome connection attempts

**Acceptance Criteria:**
- Chrome connections use project-specific ports
- Connection failures are handled gracefully
- Multiple Chrome instances can run simultaneously
- Connection attempts are logged for debugging

#### Task 2.2: Add Chrome Instance Validation (30 minutes)

**Atomic Steps:**
1. Create method `validateChromeInstance()` in ProjectManager
2. Add Chrome instance health check:
   - Test connection to debug port
   - Verify Operator tab is available
   - Check for required permissions
3. Add method `suggestChromeSetup()` that:
   - Provides port-specific Chrome launch command
   - Shows troubleshooting steps
   - Lists required Chrome flags
4. Integrate validation into startup process
5. Add user-friendly error messages
6. Add automatic retry logic

**Acceptance Criteria:**
- Chrome instance health is verified before starting
- Clear error messages for Chrome issues
- Setup instructions are project-specific
- Connection problems are auto-resolved when possible

### Phase 3: Tmux Session Isolation (1 hour)

#### Task 3.1: Update Tmux Utilities (45 minutes)
**File:** `../workflows/tmux_utils.js`

**Atomic Steps:**
1. Open `../workflows/tmux_utils.js`
2. Add parameter for custom session name to all functions
3. Update `sendToInstance()` to use project session name
4. Update `readFromInstance()` to use project session name
5. Add session existence check before operations
6. Add session creation with project-specific name
7. Update window naming to include project context
8. Add session cleanup utilities
9. Add error handling for session conflicts

**Acceptance Criteria:**
- All tmux operations use project-specific sessions
- Sessions are created automatically as needed
- Window names include project context for clarity
- Session conflicts are impossible

#### Task 3.2: Add Session Management (15 minutes)

**Atomic Steps:**
1. Add method `ensureTmuxSession()` to ProjectManager
2. Check if session exists before creating
3. Add session metadata (project name, start time)
4. Add cleanup method `cleanupTmuxSession()`
5. Integrate session management into main workflow
6. Add logging for session operations

**Acceptance Criteria:**
- Tmux sessions are managed automatically
- No manual session setup required
- Sessions are cleaned up properly
- Session operations are logged

### Phase 4: State Management Updates (30 minutes)

#### Task 4.1: Add Project Isolation to WindowKeywordMonitor (30 minutes)

**Atomic Steps:**
1. Open `lib/monitors/WindowKeywordMonitor.js`
2. Add project context parameter to constructor
3. Update window targeting to use project session
4. Add project prefix to all monitoring logs
5. Update TASK_FINISHED detection to be project-scoped
6. Add project validation to prevent cross-contamination
7. Update shared lock system to be project-aware
8. Add project context to all event emissions

**Acceptance Criteria:**
- WindowKeywordMonitor is completely project-isolated
- No cross-project interference in monitoring
- TASK_FINISHED detection is project-scoped
- All events include project context

### Phase 5: Testing & Validation (1 hour)

#### Task 5.1: Create Multi-Project Test Suite (30 minutes)
**File:** `tests/multi-project-test.js`

**Atomic Steps:**
1. Create test file `tests/multi-project-test.js`
2. Create mock project directories with different names
3. Test ProjectManager context detection
4. Verify Chrome port assignment uniqueness
5. Test tmux session name generation
6. Validate log directory isolation
7. Test concurrent project execution
8. Add performance benchmarks
9. Create cleanup utilities for tests

**Acceptance Criteria:**
- All project isolation features are tested
- Concurrent execution works correctly
- No resource conflicts occur
- Tests clean up properly

#### Task 5.2: Integration Testing (30 minutes)

**Atomic Steps:**
1. Set up 3 different mock projects in separate directories
2. Start E2E testing in all 3 projects simultaneously
3. Verify each uses different:
   - Chrome ports (9222, 9223, 9224)
   - Tmux sessions (e2e-project1-abc, e2e-project2-def, etc.)
   - Log directories (logs-project1/, logs-project2/, etc.)
4. Confirm no interference between projects
5. Test failure scenarios (Chrome conflicts, tmux issues)
6. Verify cleanup works for all projects
7. Document test results

**Acceptance Criteria:**
- 3+ projects can run E2E tests simultaneously
- Zero conflicts or interference
- All resources are properly isolated
- Cleanup works correctly

### Phase 6: Documentation & Refinement (30 minutes)

#### Task 6.1: Update Documentation (15 minutes)

**Atomic Steps:**
1. Update `README.md` with multi-project instructions
2. Add examples of running from different directories
3. Document Chrome port allocation system
4. Explain tmux session naming convention
5. Add troubleshooting section for conflicts
6. Create usage examples for common scenarios

**Acceptance Criteria:**
- Documentation is clear and complete
- Examples work out of the box
- Troubleshooting covers common issues

#### Task 6.2: Add CLI Enhancements (15 minutes)

**Atomic Steps:**
1. Add `--project-name` CLI override option
2. Add `--chrome-port` CLI override option
3. Add `--list-projects` command to show active projects
4. Add project context to help output
5. Add validation for CLI arguments
6. Update help text with new options

**Acceptance Criteria:**
- CLI supports project overrides
- Project status can be checked easily
- Help is updated and accurate

## Implementation Order

1. **Start with ProjectManager** - Core foundation for everything else
2. **Update Chrome connections** - Essential for isolation
3. **Fix tmux session handling** - Required for window operations
4. **Update monitoring** - Ensure TASK_FINISHED works correctly
5. **Test thoroughly** - Verify no conflicts occur
6. **Document** - Enable easy adoption

## Risk Mitigation

### Potential Issues & Solutions

1. **Port Conflicts**
   - Solution: Deterministic port assignment with fallback
   - Validation: Test with 10+ concurrent projects

2. **Tmux Session Limits**
   - Solution: Session cleanup and monitoring
   - Validation: Test session creation/destruction cycles

3. **File System Conflicts**
   - Solution: Project-scoped directories
   - Validation: Test with identical project names in different paths

4. **Chrome Instance Conflicts**
   - Solution: Health checks and automatic port selection
   - Validation: Test Chrome crash/restart scenarios

## Success Metrics

- ✅ 5+ projects can run E2E tests simultaneously
- ✅ Zero conflicts or resource contention
- ✅ Automatic project detection and setup
- ✅ Clean separation of logs and state
- ✅ Backward compatibility with single-project usage
- ✅ Sub-5-second startup time per project
- ✅ Comprehensive error handling and recovery

## Estimated Total Time: 6 hours

**Breakdown:**
- Phase 1: 2 hours (Project context management)
- Phase 2: 1 hour (Chrome instance management)  
- Phase 3: 1 hour (Tmux session isolation)
- Phase 4: 30 minutes (State management updates)
- Phase 5: 1 hour (Testing & validation)
- Phase 6: 30 minutes (Documentation & refinement)

## Next Steps

1. **Create worktree**: `git worktree add worktrees/cross-project -b cross-project-support`
2. **Start with Task 1.1**: Create ProjectManager class as foundation
3. **Test early and often**: Validate each component as it's built
4. **Maintain backward compatibility**: Ensure existing single-project usage continues to work

---

**This implementation leverages natural OS-level isolation to eliminate conflicts, making multi-project E2E testing simple and reliable.**
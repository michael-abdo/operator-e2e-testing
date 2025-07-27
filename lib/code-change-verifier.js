import { execSync } from 'child_process';
import crypto from 'crypto';

class CodeChangeVerifier {
    constructor(options = {}) {
        this.logger = options.logger || console.log;
        this.gitRepo = options.gitRepo || process.cwd();
        this.minChangedFiles = options.minChangedFiles || 1;
        this.minChangedLines = options.minChangedLines || 5;
        this.verificationCache = new Map();
    }

    // Capture current git state
    captureGitState() {
        try {
            const status = execSync('git status --porcelain', { cwd: this.gitRepo }).toString();
            const diff = execSync('git diff', { cwd: this.gitRepo }).toString();
            const stagedDiff = execSync('git diff --staged', { cwd: this.gitRepo }).toString();
            const lastCommit = execSync('git rev-parse HEAD', { cwd: this.gitRepo }).toString().trim();
            
            const stateHash = crypto.createHash('sha256')
                .update(status + diff + stagedDiff + lastCommit)
                .digest('hex');

            return {
                timestamp: Date.now(),
                status,
                diff,
                stagedDiff,
                lastCommit,
                hash: stateHash,
                changedFiles: this.parseChangedFiles(status),
                stats: this.calculateChangeStats(diff + stagedDiff)
            };
        } catch (error) {
            this.logger(`[VERIFIER] Error capturing git state: ${error.message}`);
            return null;
        }
    }

    // Parse changed files from git status
    parseChangedFiles(status) {
        const lines = status.split('\n').filter(line => line.trim());
        return lines.map(line => {
            const parts = line.trim().split(/\s+/);
            return {
                status: parts[0],
                file: parts[1]
            };
        });
    }

    // Calculate change statistics
    calculateChangeStats(diff) {
        const lines = diff.split('\n');
        let additions = 0;
        let deletions = 0;
        let filesChanged = new Set();
        
        lines.forEach(line => {
            if (line.startsWith('+++ b/')) {
                filesChanged.add(line.substring(6));
            } else if (line.startsWith('+') && !line.startsWith('+++')) {
                additions++;
            } else if (line.startsWith('-') && !line.startsWith('---')) {
                deletions++;
            }
        });

        return {
            filesChanged: filesChanged.size,
            additions,
            deletions,
            totalChanges: additions + deletions
        };
    }

    // Verify changes occurred between two states
    verifyChanges(beforeState, afterState, requirements = {}) {
        if (!beforeState || !afterState) {
            return {
                verified: false,
                reason: 'Missing state information',
                changes: null
            };
        }

        // Check if any changes occurred
        if (beforeState.hash === afterState.hash) {
            return {
                verified: false,
                reason: 'No changes detected',
                changes: null
            };
        }

        const changes = {
            filesModified: afterState.stats.filesChanged,
            linesAdded: afterState.stats.additions,
            linesDeleted: afterState.stats.deletions,
            totalChanges: afterState.stats.totalChanges,
            duration: afterState.timestamp - beforeState.timestamp,
            files: afterState.changedFiles
        };

        // Apply minimum requirements
        const minFiles = requirements.minFiles || this.minChangedFiles;
        const minLines = requirements.minLines || this.minChangedLines;

        if (changes.filesModified < minFiles) {
            return {
                verified: false,
                reason: `Only ${changes.filesModified} files changed (minimum: ${minFiles})`,
                changes
            };
        }

        if (changes.totalChanges < minLines) {
            return {
                verified: false,
                reason: `Only ${changes.totalChanges} lines changed (minimum: ${minLines})`,
                changes
            };
        }

        // Check for deployment-related changes if specified
        if (requirements.requireDeployment) {
            const hasDeploymentChanges = this.checkDeploymentChanges(afterState);
            if (!hasDeploymentChanges) {
                return {
                    verified: false,
                    reason: 'No deployment-related changes detected',
                    changes
                };
            }
        }

        return {
            verified: true,
            reason: 'Changes meet requirements',
            changes
        };
    }

    // Check for deployment-related changes
    checkDeploymentChanges(state) {
        const deploymentPatterns = [
            /package\.json/,
            /package-lock\.json/,
            /yarn\.lock/,
            /requirements\.txt/,
            /Gemfile\.lock/,
            /docker/i,
            /\.env/,
            /config\//,
            /deploy/,
            /build/,
            /dist/
        ];

        return state.changedFiles.some(file => 
            deploymentPatterns.some(pattern => pattern.test(file.file))
        );
    }

    // Monitor changes during a phase
    async monitorPhase(phaseName) {
        const startState = this.captureGitState();
        const phaseId = `${phaseName}_${Date.now()}`;
        
        this.verificationCache.set(phaseId, {
            phaseName,
            startState,
            startTime: Date.now()
        });

        return {
            phaseId,
            complete: () => this.completePhase(phaseId, expectedChanges)
        };
    }

    // Complete phase monitoring and verify changes
    completePhase(phaseId, expectedChanges = {}) {
        const phaseData = this.verificationCache.get(phaseId);
        if (!phaseData) {
            return {
                verified: false,
                reason: 'Phase not found'
            };
        }

        const endState = this.captureGitState();
        const verification = this.verifyChanges(phaseData.startState, endState, expectedChanges);
        
        const duration = Date.now() - phaseData.startTime;
        
        this.logger(`[VERIFIER] Phase '${phaseData.phaseName}' completed in ${Math.round(duration / 1000)}s`);
        this.logger(`[VERIFIER] Verification: ${verification.verified ? '✅' : '❌'} ${verification.reason}`);
        
        if (verification.changes) {
            this.logger(`[VERIFIER] Changes: ${verification.changes.filesModified} files, ${verification.changes.totalChanges} lines`);
        }

        // Clean up cache
        this.verificationCache.delete(phaseId);

        return {
            ...verification,
            phaseName: phaseData.phaseName,
            duration
        };
    }

    // Check if deployment occurred
    async verifyDeployment(beforeCommit) {
        try {
            const currentCommit = execSync('git rev-parse HEAD', { cwd: this.gitRepo }).toString().trim();
            
            if (beforeCommit === currentCommit) {
                return {
                    deployed: false,
                    reason: 'No new commits'
                };
            }

            // Check if changes were pushed
            const unpushedCommits = execSync('git log origin/main..HEAD --oneline 2>/dev/null || echo "none"', { cwd: this.gitRepo }).toString().trim();
            
            if (unpushedCommits && unpushedCommits !== 'none') {
                return {
                    deployed: false,
                    reason: 'Changes not pushed to remote',
                    unpushedCommits: unpushedCommits.split('\n').length
                };
            }

            // Check deployment markers (could be customized per platform)
            const deploymentMarkers = await this.checkDeploymentMarkers();
            
            return {
                deployed: deploymentMarkers.found,
                reason: deploymentMarkers.reason,
                markers: deploymentMarkers.markers
            };
        } catch (error) {
            this.logger(`[VERIFIER] Deployment verification error: ${error.message}`);
            return {
                deployed: false,
                reason: 'Verification error',
                error: error.message
            };
        }
    }

    // Check for platform-specific deployment markers
    async checkDeploymentMarkers() {
        const markers = [];
        
        // Check for recent Heroku deployment
        try {
            const herokuActivity = execSync('heroku releases -n 1 2>/dev/null || echo "none"', { cwd: this.gitRepo }).toString();
            if (herokuActivity && herokuActivity !== 'none') {
                const lines = herokuActivity.split('\n');
                const recentRelease = lines.find(line => line.includes('Deploy'));
                if (recentRelease) {
                    const releaseTime = new Date(recentRelease.match(/\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}/)?.[0]);
                    if (releaseTime && (Date.now() - releaseTime.getTime()) < 600000) { // 10 minutes
                        markers.push('heroku_recent_deploy');
                    }
                }
            }
        } catch (e) {
            // Heroku CLI not available or not a Heroku app
        }

        // Check for CI/CD pipeline markers
        try {
            const ciStatus = execSync('gh run list -L 1 2>/dev/null || echo "none"', { cwd: this.gitRepo }).toString();
            if (ciStatus && ciStatus !== 'none' && ciStatus.includes('completed')) {
                markers.push('github_actions_completed');
            }
        } catch (e) {
            // GitHub CLI not available
        }

        return {
            found: markers.length > 0,
            reason: markers.length > 0 ? 'Deployment markers found' : 'No deployment markers found',
            markers
        };
    }
}

export default CodeChangeVerifier;
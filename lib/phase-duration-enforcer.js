class PhaseDurationEnforcer {
    constructor(options = {}) {
        this.logger = options.logger || console.log;
        this.minOperatorDuration = options.minOperatorDuration || 60000; // 1 minute
        this.minClaudeDuration = options.minClaudeDuration || 120000; // 2 minutes
        this.maxPhaseDuration = options.maxPhaseDuration || 1200000; // 20 minutes
        this.phaseTimings = new Map();
    }

    // Start tracking a phase
    startPhase(phaseName, iteration) {
        const phaseKey = `${phaseName}_${iteration}`;
        const startTime = Date.now();
        
        this.phaseTimings.set(phaseKey, {
            phaseName,
            iteration,
            startTime,
            events: [],
            qualityChecks: []
        });

        this.logger(`[DURATION] Phase '${phaseName}' started for iteration ${iteration}`);
        
        return {
            phaseKey,
            logEvent: (event) => this.logPhaseEvent(phaseKey, event),
            addQualityCheck: (check) => this.addQualityCheck(phaseKey, check)
        };
    }

    // Log an event during a phase
    logPhaseEvent(phaseKey, event) {
        const phase = this.phaseTimings.get(phaseKey);
        if (phase) {
            phase.events.push({
                timestamp: Date.now(),
                elapsed: Date.now() - phase.startTime,
                event
            });
        }
    }

    // Add a quality check result
    addQualityCheck(phaseKey, check) {
        const phase = this.phaseTimings.get(phaseKey);
        if (phase) {
            phase.qualityChecks.push({
                timestamp: Date.now(),
                ...check
            });
        }
    }

    // Complete a phase and enforce minimum duration
    async completePhase(phaseKey, options = {}) {
        const phase = this.phaseTimings.get(phaseKey);
        if (!phase) {
            this.logger(`[DURATION] Warning: Phase ${phaseKey} not found`);
            return { allowed: true };
        }

        const elapsed = Date.now() - phase.startTime;
        const minDuration = this.getMinDuration(phase.phaseName);
        
        // Check if minimum duration has been met
        if (elapsed < minDuration && !options.force) {
            const remainingTime = minDuration - elapsed;
            
            this.logger(`[DURATION] Phase '${phase.phaseName}' too fast (${Math.round(elapsed/1000)}s < ${Math.round(minDuration/1000)}s minimum)`);
            
            // Perform additional quality checks during wait time
            const qualityResult = await this.performQualityChecks(phase, remainingTime);
            
            if (!qualityResult.passed) {
                return {
                    allowed: false,
                    reason: 'Quality checks failed',
                    details: qualityResult
                };
            }

            // Wait for remaining time
            this.logger(`[DURATION] Waiting ${Math.round(remainingTime/1000)}s to meet minimum duration...`);
            await this.sleep(remainingTime);
        }

        // Check if phase took too long
        if (elapsed > this.maxPhaseDuration) {
            this.logger(`[DURATION] Warning: Phase '${phase.phaseName}' exceeded maximum duration (${Math.round(elapsed/1000)}s)`);
        }

        // Final quality assessment
        const finalQuality = this.assessPhaseQuality(phase);
        
        this.logger(`[DURATION] Phase '${phase.phaseName}' completed in ${Math.round(elapsed/1000)}s - Quality: ${finalQuality.score}/100`);
        
        // Clean up
        this.phaseTimings.delete(phaseKey);

        return {
            allowed: true,
            duration: elapsed,
            quality: finalQuality
        };
    }

    // Get minimum duration for a phase
    getMinDuration(phaseName) {
        switch (phaseName.toLowerCase()) {
            case 'operator':
                return this.minOperatorDuration;
            case 'claude':
                return this.minClaudeDuration;
            default:
                return 30000; // 30 seconds default
        }
    }

    // Perform quality checks during wait time
    async performQualityChecks(phase, waitTime) {
        const checks = [];
        
        // Check 1: Verify meaningful activity occurred
        if (phase.events.length < 3) {
            checks.push({
                name: 'activity_check',
                passed: false,
                reason: 'Insufficient activity during phase'
            });
        } else {
            checks.push({
                name: 'activity_check',
                passed: true
            });
        }

        // Check 2: For Operator phase, verify response was received
        if (phase.phaseName.toLowerCase() === 'operator') {
            const hasResponse = phase.events.some(e => 
                e.event.includes('response') || 
                e.event.includes('analysis') ||
                e.event.includes('recommendation')
            );
            
            checks.push({
                name: 'operator_response',
                passed: hasResponse,
                reason: hasResponse ? null : 'No Operator response detected'
            });
        }

        // Check 3: For Claude phase, verify code changes
        if (phase.phaseName.toLowerCase() === 'claude') {
            const hasCodeChanges = phase.qualityChecks.some(c => 
                c.type === 'code_changes' && c.verified
            );
            
            checks.push({
                name: 'code_changes',
                passed: hasCodeChanges,
                reason: hasCodeChanges ? null : 'No code changes detected'
            });
        }

        const allPassed = checks.every(c => c.passed);
        
        return {
            passed: allPassed,
            checks,
            timestamp: Date.now()
        };
    }

    // Assess overall phase quality
    assessPhaseQuality(phase) {
        let score = 0;
        const factors = [];

        // Factor 1: Duration appropriateness (20 points)
        const elapsed = Date.now() - phase.startTime;
        const minDuration = this.getMinDuration(phase.phaseName);
        const durationRatio = elapsed / minDuration;
        
        if (durationRatio >= 1 && durationRatio <= 3) {
            score += 20;
            factors.push({ name: 'duration', score: 20, status: 'good' });
        } else if (durationRatio < 1) {
            score += 5;
            factors.push({ name: 'duration', score: 5, status: 'too_fast' });
        } else {
            score += 10;
            factors.push({ name: 'duration', score: 10, status: 'too_slow' });
        }

        // Factor 2: Event density (20 points)
        const eventDensity = phase.events.length / (elapsed / 1000); // events per second
        if (eventDensity > 0.1) {
            score += 20;
            factors.push({ name: 'event_density', score: 20, status: 'good' });
        } else {
            score += Math.round(eventDensity * 200);
            factors.push({ name: 'event_density', score: Math.round(eventDensity * 200), status: 'low' });
        }

        // Factor 3: Quality check results (40 points)
        const passedChecks = phase.qualityChecks.filter(c => c.passed || c.verified).length;
        const totalChecks = phase.qualityChecks.length || 1;
        const checkScore = Math.round((passedChecks / totalChecks) * 40);
        score += checkScore;
        factors.push({ name: 'quality_checks', score: checkScore, status: checkScore >= 30 ? 'good' : 'poor' });

        // Factor 4: Error absence (20 points)
        const hasErrors = phase.events.some(e => 
            e.event.toLowerCase().includes('error') || 
            e.event.toLowerCase().includes('fail')
        );
        if (!hasErrors) {
            score += 20;
            factors.push({ name: 'error_free', score: 20, status: 'good' });
        } else {
            factors.push({ name: 'error_free', score: 0, status: 'has_errors' });
        }

        return {
            score: Math.min(score, 100),
            factors,
            recommendation: this.getQualityRecommendation(score)
        };
    }

    // Get recommendation based on quality score
    getQualityRecommendation(score) {
        if (score >= 80) {
            return 'Excellent - Phase completed successfully with high quality';
        } else if (score >= 60) {
            return 'Good - Phase completed but could be improved';
        } else if (score >= 40) {
            return 'Fair - Phase has quality concerns that should be addressed';
        } else {
            return 'Poor - Phase quality is below acceptable threshold';
        }
    }

    // Sleep utility
    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Get phase statistics
    getPhaseStats() {
        const stats = {
            active: [],
            averageDurations: {}
        };

        // Active phases
        for (const [key, phase] of this.phaseTimings) {
            stats.active.push({
                phase: phase.phaseName,
                iteration: phase.iteration,
                elapsed: Date.now() - phase.startTime
            });
        }

        return stats;
    }

    // Force complete all phases (for cleanup)
    forceCompleteAll() {
        for (const phaseKey of this.phaseTimings.keys()) {
            this.completePhase(phaseKey, { force: true });
        }
    }
}

export default PhaseDurationEnforcer;
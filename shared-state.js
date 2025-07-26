/**
 * Shared Lock System for Op-Loop Duplicate Prevention
 * Prevents multiple layers from sending messages to Claude simultaneously
 * 
 * Architecture Integration:
 * - Layer 1: OperatorE2EExecutor (e2e-executor)
 * - Layer 2: WindowKeywordMonitor (window-monitor) 
 * - Layer 3: ChainLoopMonitor (chain-loop-monitor)
 * 
 * Usage:
 * import { sharedLock } from './shared-state.js';
 * if (sharedLock.tryAcquireSendLock('layer-id')) { ... }
 */

class SharedLock {
    constructor() {
        // Core lock state
        this.isSendingToClaude = false;
        this.sendingLayerId = null;
        this.lockStartTime = null;
        this.lastSendTime = 0;
        
        // Configuration
        this.TIMEOUT_MS = 300000; // 5 minutes
        this.FORCE_RELEASE_THRESHOLD = 600000; // 10 minutes
        this.COOLDOWN_MS = 2000; // 2 seconds between sends
        
        // Metrics and monitoring
        this.totalAcquisitions = 0;
        this.totalReleases = 0;
        this.duplicatesBlocked = 0;
        this.forceReleases = 0;
        this.lockHistory = [];
        
        // Valid layer IDs
        this.validLayerIds = new Set([
            'e2e-executor',
            'window-monitor', 
            'chain-loop-monitor',
            'test-layer'
        ]);
        
        this.log('🔧 SharedLock initialized', 'INFO');
    }
    
    /**
     * Attempt to acquire the send lock for a specific layer
     * @param {string} layerId - Unique identifier for the requesting layer
     * @returns {boolean} - True if lock acquired, false if blocked
     */
    tryAcquireSendLock(layerId) {
        try {
            // Validate layer ID
            if (!this.validateLayerId(layerId)) {
                this.log(`❌ Invalid layer ID: ${layerId}`, 'ERROR');
                return false;
            }
            
            // Check for stale locks and force release if needed
            this.checkAndForceRelease();
            
            // Check cooldown period
            const timeSinceLastSend = Date.now() - this.lastSendTime;
            if (timeSinceLastSend < this.COOLDOWN_MS) {
                const remainingCooldown = this.COOLDOWN_MS - timeSinceLastSend;
                this.log(`⏸️ Cooldown active for ${layerId}: ${remainingCooldown}ms remaining`, 'WARNING');
                this.duplicatesBlocked++;
                return false;
            }
            
            // Check if lock is already held
            if (this.isSendingToClaude) {
                this.log(`⚠️ DUPLICATE BLOCKED: ${layerId} - ${this.sendingLayerId} already sending`, 'WARNING');
                this.duplicatesBlocked++;
                this.recordLockAttempt(layerId, false, 'duplicate_blocked');
                return false;
            }
            
            // Acquire the lock
            this.isSendingToClaude = true;
            this.sendingLayerId = layerId;
            this.lockStartTime = Date.now();
            this.lastSendTime = Date.now();
            this.totalAcquisitions++;
            
            this.log(`🔒 SEND LOCK ACQUIRED: ${layerId}`, 'INFO');
            this.recordLockAttempt(layerId, true, 'acquired');
            
            return true;
            
        } catch (error) {
            this.log(`❌ Error in tryAcquireSendLock for ${layerId}: ${error.message}`, 'ERROR');
            return false;
        }
    }
    
    /**
     * Release the send lock for a specific layer
     * @param {string} layerId - Layer ID that is releasing the lock
     * @returns {boolean} - True if successfully released
     */
    releaseSendLock(layerId) {
        try {
            // Validate that the caller owns the lock
            if (!this.isSendingToClaude) {
                this.log(`⚠️ Release attempted by ${layerId} but no lock held`, 'WARNING');
                return false;
            }
            
            if (this.sendingLayerId !== layerId) {
                this.log(`❌ Release attempted by ${layerId} but lock held by ${this.sendingLayerId}`, 'ERROR');
                return false;
            }
            
            // Calculate lock duration
            const lockDuration = Date.now() - this.lockStartTime;
            
            // Release the lock
            this.isSendingToClaude = false;
            const previousLayer = this.sendingLayerId;
            this.sendingLayerId = null;
            this.lockStartTime = null;
            this.totalReleases++;
            
            this.log(`🔓 SEND LOCK RELEASED: ${previousLayer} (held for ${lockDuration}ms)`, 'INFO');
            this.recordLockAttempt(previousLayer, true, 'released', lockDuration);
            
            return true;
            
        } catch (error) {
            this.log(`❌ Error in releaseSendLock for ${layerId}: ${error.message}`, 'ERROR');
            
            // Force release on error to prevent deadlocks
            this.forceReleaseLock('error_recovery');
            return false;
        }
    }
    
    /**
     * Force release a stale lock (safety mechanism)
     * @param {string} reason - Reason for force release
     */
    forceReleaseLock(reason = 'timeout') {
        if (!this.isSendingToClaude) {
            return; // No lock to release
        }
        
        const lockDuration = Date.now() - this.lockStartTime;
        const previousLayer = this.sendingLayerId;
        
        // Force release
        this.isSendingToClaude = false;
        this.sendingLayerId = null;
        this.lockStartTime = null;
        this.forceReleases++;
        
        this.log(`⚠️ FORCE RELEASING STALE LOCK: ${previousLayer} (${reason}, held for ${lockDuration}ms)`, 'WARNING');
        this.recordLockAttempt(previousLayer, true, `force_released_${reason}`, lockDuration);
    }
    
    /**
     * Check for stale locks and force release if needed
     */
    checkAndForceRelease() {
        if (!this.isSendingToClaude || !this.lockStartTime) {
            return;
        }
        
        const lockAge = Date.now() - this.lockStartTime;
        
        if (lockAge > this.FORCE_RELEASE_THRESHOLD) {
            this.forceReleaseLock('stale_timeout');
        }
    }
    
    /**
     * Validate layer ID
     * @param {string} layerId - Layer ID to validate
     * @returns {boolean} - True if valid
     */
    validateLayerId(layerId) {
        if (!layerId || typeof layerId !== 'string') {
            return false;
        }
        
        return this.validLayerIds.has(layerId);
    }
    
    /**
     * Record lock attempt for metrics and debugging
     * @param {string} layerId - Layer attempting lock
     * @param {boolean} success - Whether attempt succeeded
     * @param {string} action - Action performed
     * @param {number} duration - Duration if applicable
     */
    recordLockAttempt(layerId, success, action, duration = null) {
        const record = {
            timestamp: Date.now(),
            layerId,
            success,
            action,
            duration,
            lockState: {
                isSending: this.isSendingToClaude,
                currentLayer: this.sendingLayerId
            }
        };
        
        this.lockHistory.push(record);
        
        // Keep only last 100 records to prevent memory leak
        if (this.lockHistory.length > 100) {
            this.lockHistory.shift();
        }
    }
    
    /**
     * Get current lock status
     * @returns {object} - Current lock state
     */
    getLockStatus() {
        return {
            isSendingToClaude: this.isSendingToClaude,
            sendingLayerId: this.sendingLayerId,
            lockStartTime: this.lockStartTime,
            lockAge: this.lockStartTime ? Date.now() - this.lockStartTime : null,
            metrics: {
                totalAcquisitions: this.totalAcquisitions,
                totalReleases: this.totalReleases,
                duplicatesBlocked: this.duplicatesBlocked,
                forceReleases: this.forceReleases
            }
        };
    }
    
    /**
     * Get performance metrics
     * @returns {object} - Performance and usage metrics
     */
    getMetrics() {
        const status = this.getLockStatus();
        
        return {
            ...status.metrics,
            lockEfficiency: this.totalAcquisitions > 0 ? 
                (this.totalReleases / this.totalAcquisitions * 100).toFixed(2) + '%' : 'N/A',
            duplicateRate: this.totalAcquisitions > 0 ? 
                (this.duplicatesBlocked / (this.totalAcquisitions + this.duplicatesBlocked) * 100).toFixed(2) + '%' : 'N/A',
            averageLockDuration: this.calculateAverageLockDuration(),
            recentActivity: this.lockHistory.slice(-10)
        };
    }
    
    /**
     * Calculate average lock duration from history
     * @returns {string} - Average duration in milliseconds
     */
    calculateAverageLockDuration() {
        const releasedLocks = this.lockHistory.filter(h => h.action.includes('released') && h.duration);
        
        if (releasedLocks.length === 0) {
            return 'N/A';
        }
        
        const totalDuration = releasedLocks.reduce((sum, lock) => sum + lock.duration, 0);
        const average = totalDuration / releasedLocks.length;
        
        return `${average.toFixed(0)}ms`;
    }
    
    /**
     * Enhanced logging with timestamps and levels
     * @param {string} message - Log message
     * @param {string} level - Log level (INFO, WARNING, ERROR)
     */
    log(message, level = 'INFO') {
        const timestamp = new Date().toISOString();
        const prefix = level === 'ERROR' ? '❌' : level === 'WARNING' ? '⚠️' : 'ℹ️';
        console.log(`[${timestamp}] [SHARED_LOCK] [${level}] ${prefix} ${message}`);
    }
    
    /**
     * Reset all metrics (for testing)
     */
    resetMetrics() {
        this.totalAcquisitions = 0;
        this.totalReleases = 0;
        this.duplicatesBlocked = 0;
        this.forceReleases = 0;
        this.lockHistory = [];
        this.log('📊 Metrics reset', 'INFO');
    }
}

// Create and export singleton instance
export const sharedLock = new SharedLock();

// Export class for testing
export { SharedLock };
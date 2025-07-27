/**
 * Unified state management for E2E testing system
 * Consolidates session state, execution state, and recovery state
 */

export class StateManager {
    constructor() {
        this.sessionStates = new Map();
        this.executionStates = new Map();
        this.recoveryMetadata = new Map();
    }
    
    // Session state management
    saveSessionState(sessionId, state) {
        this.sessionStates.set(sessionId, {
            ...state,
            lastUpdated: new Date().toISOString()
        });
    }
    
    getSessionState(sessionId) {
        return this.sessionStates.get(sessionId);
    }
    
    clearSessionState(sessionId) {
        this.sessionStates.delete(sessionId);
    }
    
    // Execution state tracking
    trackExecution(executionId, data) {
        const existing = this.executionStates.get(executionId) || { 
            history: [],
            startTime: new Date().toISOString()
        };
        
        existing.history.push({
            ...data,
            timestamp: new Date().toISOString()
        });
        
        existing.lastUpdated = new Date().toISOString();
        this.executionStates.set(executionId, existing);
    }
    
    getExecutionHistory(executionId) {
        return this.executionStates.get(executionId);
    }
    
    // Recovery metadata
    saveRecoveryMetadata(key, metadata) {
        this.recoveryMetadata.set(key, {
            ...metadata,
            savedAt: new Date().toISOString()
        });
    }
    
    getRecoveryMetadata(key) {
        return this.recoveryMetadata.get(key);
    }
    
    // Unified state queries
    getAllStates() {
        return {
            sessions: Object.fromEntries(this.sessionStates),
            executions: Object.fromEntries(this.executionStates),
            recovery: Object.fromEntries(this.recoveryMetadata)
        };
    }
    
    clearAll() {
        this.sessionStates.clear();
        this.executionStates.clear();
        this.recoveryMetadata.clear();
    }
    
    // State persistence helpers
    exportState() {
        return JSON.stringify(this.getAllStates(), null, 2);
    }
    
    importState(stateJson) {
        const states = JSON.parse(stateJson);
        
        this.sessionStates = new Map(Object.entries(states.sessions || {}));
        this.executionStates = new Map(Object.entries(states.executions || {}));
        this.recoveryMetadata = new Map(Object.entries(states.recovery || {}));
    }
}

// Singleton instance
export const stateManager = new StateManager();
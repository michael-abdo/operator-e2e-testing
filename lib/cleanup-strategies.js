/**
 * Cleanup Strategies Module
 * Provides intelligent conversation cleanup strategies for different scenarios
 */

export class CleanupStrategies {
    /**
     * Smart cleanup based on conversation patterns and metadata
     */
    static async smartCleanup(page, options = {}) {
        const defaultOptions = {
            preserveLatest: 2,
            preserveErrors: true,
            preservePatterns: ['error', 'investigating', 'debugging'],
            deletePatterns: ['completed', 'finished', 'resolved'],
            maxAge: null, // Age in minutes
            prioritizeOlder: true,
            dryRun: false
        };
        
        const config = { ...defaultOptions, ...options };
        
        try {
            // Analyze conversation states
            const conversations = await page.evaluate(() => {
                const buttons = document.querySelectorAll('.group.relative > button');
                return Array.from(buttons).map((btn, index) => {
                    const text = btn.textContent || '';
                    const parent = btn.closest('.group');
                    
                    return {
                        index,
                        text: text.trim(),
                        hasError: text.toLowerCase().includes('error'),
                        isActive: parent?.classList.contains('active'),
                        hasMenu: !!btn.getAttribute('aria-controls'),
                        element: btn,
                        timestamp: Date.now() // Placeholder - real implementation would extract actual timestamp
                    };
                });
            });
            
            // Apply smart filtering logic
            const analysisResult = this.analyzeConversations(conversations, config);
            
            if (config.dryRun) {
                return {
                    strategy: 'smart',
                    dryRun: true,
                    analysis: analysisResult,
                    wouldDelete: analysisResult.toDelete.length,
                    wouldPreserve: analysisResult.toPreserve.length
                };
            }
            
            // Execute targeted deletion
            return await this.executeTargetedDeletion(page, analysisResult.toDelete);
            
        } catch (error) {
            throw new Error(`Smart cleanup failed: ${error.message}`);
        }
    }
    
    /**
     * Age-based cleanup - delete conversations older than specified age
     */
    static async deleteByAge(page, maxAgeMinutes = 30, options = {}) {
        const cutoffTime = Date.now() - (maxAgeMinutes * 60 * 1000);
        const config = { preserveLatest: 2, dryRun: false, ...options };
        
        try {
            const conversations = await page.evaluate((cutoff) => {
                const buttons = document.querySelectorAll('.group.relative > button');
                const results = [];
                
                Array.from(buttons).forEach((btn, index) => {
                    const parent = btn.closest('.group');
                    const timestampStr = parent?.dataset.timestamp || 
                                       parent?.getAttribute('data-timestamp') ||
                                       btn.getAttribute('data-timestamp');
                    
                    let timestamp = Date.now(); // Default to current time if not found
                    if (timestampStr) {
                        timestamp = parseInt(timestampStr) || Date.now();
                    }
                    
                    results.push({
                        index,
                        text: btn.textContent?.trim() || '',
                        timestamp,
                        isOld: timestamp < cutoff,
                        element: btn
                    });
                });
                
                return results;
            }, cutoffTime);
            
            // Filter by age and preservation rules
            const toDelete = conversations.filter((conv, idx) => {
                if (conv.isOld && idx < conversations.length - config.preserveLatest) {
                    return true;
                }
                return false;
            });
            
            if (config.dryRun) {
                return {
                    strategy: 'age',
                    dryRun: true,
                    maxAge: maxAgeMinutes,
                    cutoffTime,
                    wouldDelete: toDelete.length,
                    total: conversations.length
                };
            }
            
            return await this.executeTargetedDeletion(page, toDelete);
            
        } catch (error) {
            throw new Error(`Age-based cleanup failed: ${error.message}`);
        }
    }
    
    /**
     * Pattern-based cleanup - delete conversations matching specific patterns
     */
    static async deleteByPattern(page, patterns, options = {}) {
        const config = { 
            preserveLatest: 2, 
            caseSensitive: false, 
            exactMatch: false,
            dryRun: false,
            ...options 
        };
        
        try {
            const conversations = await page.evaluate((patternList, caseSensitive, exactMatch) => {
                const buttons = document.querySelectorAll('.group.relative > button');
                return Array.from(buttons).map((btn, index) => {
                    const text = btn.textContent?.trim() || '';
                    const searchText = caseSensitive ? text : text.toLowerCase();
                    
                    const matches = patternList.some(pattern => {
                        const searchPattern = caseSensitive ? pattern : pattern.toLowerCase();
                        return exactMatch ? searchText === searchPattern : searchText.includes(searchPattern);
                    });
                    
                    return {
                        index,
                        text,
                        matches,
                        element: btn
                    };
                });
            }, Array.isArray(patterns) ? patterns : [patterns], config.caseSensitive, config.exactMatch);
            
            // Filter matches while preserving latest conversations
            const toDelete = conversations.filter((conv, idx) => {
                return conv.matches && idx < conversations.length - config.preserveLatest;
            });
            
            if (config.dryRun) {
                return {
                    strategy: 'pattern',
                    dryRun: true,
                    patterns: Array.isArray(patterns) ? patterns : [patterns],
                    wouldDelete: toDelete.length,
                    matches: toDelete.map(c => c.text)
                };
            }
            
            return await this.executeTargetedDeletion(page, toDelete);
            
        } catch (error) {
            throw new Error(`Pattern-based cleanup failed: ${error.message}`);
        }
    }
    
    /**
     * Memory pressure cleanup - aggressive cleanup when memory usage is high
     */
    static async emergencyCleanup(page, options = {}) {
        const config = {
            preserveLatest: 1, // Very aggressive
            forceCleanup: true,
            targetReduction: 0.8, // Delete 80% of conversations
            dryRun: false,
            ...options
        };
        
        try {
            const conversations = await page.evaluate(() => {
                const buttons = document.querySelectorAll('.group.relative > button');
                return Array.from(buttons).map((btn, index) => ({
                    index,
                    text: btn.textContent?.trim() || '',
                    hasError: btn.textContent?.toLowerCase().includes('error'),
                    element: btn
                }));
            });
            
            const totalCount = conversations.length;
            const targetDeletions = Math.floor(totalCount * config.targetReduction);
            const actualDeletions = Math.min(targetDeletions, totalCount - config.preserveLatest);
            
            // Select conversations to delete (oldest first, preserve errors if possible)
            const toDelete = conversations
                .slice(0, totalCount - config.preserveLatest)
                .filter((conv, idx) => idx < actualDeletions)
                .filter(conv => config.forceCleanup || !conv.hasError);
            
            if (config.dryRun) {
                return {
                    strategy: 'emergency',
                    dryRun: true,
                    targetReduction: config.targetReduction,
                    wouldDelete: toDelete.length,
                    total: totalCount,
                    memoryPressure: true
                };
            }
            
            const result = await this.executeTargetedDeletion(page, toDelete);
            result.emergency = true;
            result.memoryPressure = true;
            
            return result;
            
        } catch (error) {
            throw new Error(`Emergency cleanup failed: ${error.message}`);
        }
    }
    
    /**
     * Analyze conversations and determine what to keep/delete
     */
    static analyzeConversations(conversations, config) {
        const toDelete = [];
        const toPreserve = [];
        
        conversations.forEach((conv, index) => {
            let shouldPreserve = false;
            let reason = '';
            
            // Always preserve latest N conversations
            if (index >= conversations.length - config.preserveLatest) {
                shouldPreserve = true;
                reason = 'latest_conversations';
            }
            // Preserve active conversations
            else if (conv.isActive) {
                shouldPreserve = true;
                reason = 'active_conversation';
            }
            // Preserve error conversations if enabled
            else if (config.preserveErrors && conv.hasError) {
                shouldPreserve = true;
                reason = 'error_conversation';
            }
            // Check preserve patterns
            else if (config.preservePatterns && config.preservePatterns.some(pattern => 
                conv.text.toLowerCase().includes(pattern.toLowerCase()))) {
                shouldPreserve = true;
                reason = 'preserve_pattern_match';
            }
            // Check delete patterns
            else if (config.deletePatterns && config.deletePatterns.some(pattern => 
                conv.text.toLowerCase().includes(pattern.toLowerCase()))) {
                shouldPreserve = false;
                reason = 'delete_pattern_match';
            }
            // Check age if specified
            else if (config.maxAge) {
                const ageMinutes = (Date.now() - conv.timestamp) / (1000 * 60);
                if (ageMinutes > config.maxAge) {
                    shouldPreserve = false;
                    reason = 'too_old';
                }
            }
            
            if (shouldPreserve) {
                toPreserve.push({ ...conv, reason });
            } else {
                toDelete.push({ ...conv, reason });
            }
        });
        
        return {
            toDelete,
            toPreserve,
            analysis: {
                total: conversations.length,
                deleteCount: toDelete.length,
                preserveCount: toPreserve.length,
                deletionRatio: toDelete.length / conversations.length
            }
        };
    }
    
    /**
     * Execute targeted deletion of specific conversations
     */
    static async executeTargetedDeletion(page, conversationsToDelete) {
        if (conversationsToDelete.length === 0) {
            return {
                success: true,
                deleted: 0,
                failed: 0,
                reason: 'no_conversations_to_delete'
            };
        }
        
        try {
            const result = await page.evaluate(async (indicesToDelete) => {
                let successCount = 0;
                let failCount = 0;
                
                // Sort indices in descending order to avoid index shifting issues
                const sortedIndices = indicesToDelete.sort((a, b) => b - a);
                
                for (const index of sortedIndices) {
                    try {
                        const buttons = document.querySelectorAll('.group.relative > button');
                        if (buttons[index]) {
                            await window.OperatorQueueCleaner.processSingleButton(buttons[index]);
                            successCount++;
                        }
                    } catch (err) {
                        console.error(`Failed to delete conversation at index ${index}:`, err);
                        failCount++;
                    }
                    
                    // Small delay between deletions
                    await new Promise(resolve => setTimeout(resolve, 300));
                }
                
                return { successCount, failCount };
            }, conversationsToDelete.map(c => c.index));
            
            return {
                success: result.successCount > 0,
                deleted: result.successCount,
                failed: result.failCount,
                strategy: 'targeted',
                timestamp: new Date().toISOString()
            };
            
        } catch (error) {
            throw new Error(`Targeted deletion failed: ${error.message}`);
        }
    }
    
    /**
     * Get recommended cleanup strategy based on current state
     */
    static async getRecommendedStrategy(page, systemMetrics = {}) {
        try {
            const conversations = await page.evaluate(() => {
                const buttons = document.querySelectorAll('.group.relative > button');
                return {
                    total: buttons.length,
                    hasErrors: Array.from(buttons).some(btn => 
                        btn.textContent?.toLowerCase().includes('error')),
                    hasActive: Array.from(buttons).some(btn => 
                        btn.closest('.group')?.classList.contains('active'))
                };
            });
            
            const memoryUsage = systemMetrics.memoryUsageMB || 0;
            const uptime = systemMetrics.uptimeMinutes || 0;
            
            // Determine best strategy based on conditions
            if (memoryUsage > 1500 || conversations.total > 50) {
                return {
                    strategy: 'emergency',
                    reason: 'High memory usage or too many conversations',
                    config: { preserveLatest: 1, targetReduction: 0.8 }
                };
            } else if (conversations.total > 20) {
                return {
                    strategy: 'smart',
                    reason: 'Moderate conversation count',
                    config: { preserveLatest: 3, preserveErrors: true }
                };
            } else if (uptime > 180) { // 3 hours
                return {
                    strategy: 'age',
                    reason: 'Long running session',
                    config: { maxAgeMinutes: 60, preserveLatest: 2 }
                };
            } else {
                return {
                    strategy: 'pattern',
                    reason: 'Normal cleanup',
                    config: { 
                        patterns: ['completed', 'finished'],
                        preserveLatest: 2 
                    }
                };
            }
        } catch (error) {
            return {
                strategy: 'smart',
                reason: 'Fallback due to analysis error',
                config: { preserveLatest: 2 },
                error: error.message
            };
        }
    }
}

export default CleanupStrategies;
#!/usr/bin/env node

/**
 * Multi-Format File Parser for QA/UX Test Data
 * Supports JSON, Markdown, and Text files
 * Converts any format to standardized QA/UX data structure
 */

import fs from 'fs/promises';
import path from 'path';

class MultiFormatParser {
    constructor() {
        this.supportedExtensions = ['.json', '.md', '.markdown', '.txt'];
    }

    /**
     * Parse content directly with a given filename for format detection
     */
    async parseContent(content, fileName) {
        const extension = path.extname(fileName).toLowerCase();
        
        // Parse based on file extension
        let qaUxData;
        switch (extension) {
            case '.json':
                qaUxData = this.parseJsonFile(content, fileName);
                break;
            case '.md':
            case '.markdown':
                qaUxData = this.parseMarkdownFile(content, fileName);
                break;
            case '.txt':
                qaUxData = this.parseTextFile(content, fileName);
                break;
            default:
                // Try to detect format from content
                qaUxData = this.parseByContent(content, fileName);
                break;
        }
        
        // Validate and normalize the data structure
        qaUxData = this.normalizeQaUxData(qaUxData, fileName);
        
        return qaUxData;
    }

    /**
     * Parse file and convert to QA/UX data structure
     */
    async parseFile(filePath) {
        // Resolve path - if relative, make it relative to /root
        const resolvedPath = this.resolvePath(filePath);
        
        console.log(`📄 Loading file: ${resolvedPath}`);
        
        // Validate file exists
        try {
            await fs.access(resolvedPath);
        } catch (error) {
            throw new Error(`File not found: ${resolvedPath}`);
        }
        
        // Read file content
        const fileContent = await fs.readFile(resolvedPath, 'utf8');
        const extension = path.extname(resolvedPath).toLowerCase();
        
        // Parse based on file extension
        let qaUxData;
        switch (extension) {
            case '.json':
                qaUxData = this.parseJsonFile(fileContent, resolvedPath);
                break;
            case '.md':
            case '.markdown':
                qaUxData = this.parseMarkdownFile(fileContent, resolvedPath);
                break;
            case '.txt':
                qaUxData = this.parseTextFile(fileContent, resolvedPath);
                break;
            default:
                // Try to detect format from content
                qaUxData = this.parseByContent(fileContent, resolvedPath);
                break;
        }
        
        // Validate and normalize the data structure
        qaUxData = this.normalizeQaUxData(qaUxData, resolvedPath);
        
        const taskCount = Object.keys(qaUxData.tasks || {}).length;
        console.log(`✅ Loaded file with ${taskCount} tasks`);
        
        return qaUxData;
    }

    /**
     * Resolve file path - handle relative paths from /root
     */
    resolvePath(filePath) {
        // If it's already absolute, use as-is
        if (path.isAbsolute(filePath)) {
            return filePath;
        }
        
        // If it starts with a path like "qa/ux-tests/...", treat as relative to /root
        if (filePath.includes('/') && !filePath.startsWith('./') && !filePath.startsWith('../')) {
            return path.resolve('/root', filePath);
        }
        
        // Otherwise, treat as relative to current working directory
        return path.resolve(process.cwd(), filePath);
    }

    /**
     * Parse JSON file (existing functionality)
     */
    parseJsonFile(content, filePath) {
        try {
            return JSON.parse(content);
        } catch (error) {
            throw new Error(`Invalid JSON in file ${filePath}: ${error.message}`);
        }
    }

    /**
     * Parse Markdown file - extract QA/UX information
     */
    parseMarkdownFile(content, filePath) {
        console.log(`📝 Parsing Markdown file: ${path.basename(filePath)}`);
        
        const qaUxData = {
            metadata: {
                demo_app_url: null,
                description: "QA/UX tests extracted from Markdown file",
                source_file: filePath,
                parsed_at: new Date().toISOString()
            },
            tasks: {}
        };

        // Extract metadata from front matter or headers
        const metadataMatch = content.match(/^---\n([\s\S]*?)\n---/);
        if (metadataMatch) {
            try {
                const frontMatter = this.parseFrontMatter(metadataMatch[1]);
                Object.assign(qaUxData.metadata, frontMatter);
            } catch (error) {
                console.warn(`⚠️ Could not parse front matter: ${error.message}`);
            }
        }

        // Look for demo app URL in content if not already set from front matter
        if (!qaUxData.metadata.demo_app_url) {
            const urlMatch = content.match(/(?:demo[_\s-]?app[_\s-]?url|app[_\s-]?url|url):\s*([^\s\n]+)/i);
            if (urlMatch) {
                qaUxData.metadata.demo_app_url = urlMatch[1];
            }
        }

        // Extract tasks from various markdown patterns
        this.extractTasksFromMarkdown(content, qaUxData.tasks);

        return qaUxData;
    }

    /**
     * Parse text file - extract QA/UX information
     */
    parseTextFile(content, filePath) {
        console.log(`📄 Parsing text file: ${path.basename(filePath)}`);
        
        const qaUxData = {
            metadata: {
                demo_app_url: null,
                description: "QA/UX tests extracted from text file",
                source_file: filePath,
                parsed_at: new Date().toISOString()
            },
            tasks: {}
        };

        // Look for demo app URL
        const urlMatch = content.match(/(?:demo[_\\s-]?app[_\\s-]?url|app[_\\s-]?url|url):\\s*([^\\s\\n]+)/i);
        if (urlMatch) {
            qaUxData.metadata.demo_app_url = urlMatch[1];
        }

        // Extract tasks from text patterns
        this.extractTasksFromText(content, qaUxData.tasks);

        return qaUxData;
    }

    /**
     * Try to detect format from content
     */
    parseByContent(content, filePath) {
        const trimmedContent = content.trim();
        
        // Try JSON first
        if (trimmedContent.startsWith('{') || trimmedContent.startsWith('[')) {
            try {
                return this.parseJsonFile(content, filePath);
            } catch (error) {
                // Fall through to other parsers
            }
        }
        
        // Try Markdown if it has markdown patterns
        if (content.includes('#') || content.includes('##') || content.includes('```')) {
            return this.parseMarkdownFile(content, filePath);
        }
        
        // Default to text parser
        return this.parseTextFile(content, filePath);
    }

    /**
     * Extract tasks from Markdown content using various patterns
     */
    extractTasksFromMarkdown(content, tasks) {
        let taskId = 1;

        // Pattern 1: Header-based tasks
        const headerPattern = /^#+\\s*(.+)$/gm;
        let match;
        while ((match = headerPattern.exec(content)) !== null) {
            const title = match[1].trim();
            if (this.isLikelyTaskTitle(title)) {
                const taskKey = this.generateTaskId(title, taskId++);
                tasks[taskKey] = {
                    status: "fail",
                    description: title,
                    production_url: null,
                    test_steps: [],
                    qa_report: {
                        issue: title,
                        severity: "medium"
                    }
                };
            }
        }

        // Pattern 2: Checklist items
        const checklistPattern = /^\\s*[-*+]\\s*\\[[ x]\\]\\s*(.+)$/gm;
        while ((match = checklistPattern.exec(content)) !== null) {
            const description = match[1].trim();
            const taskKey = this.generateTaskId(description, taskId++);
            tasks[taskKey] = {
                status: "fail",
                description: description,
                production_url: null,
                test_steps: [description],
                qa_report: {
                    issue: description,
                    severity: "medium"
                }
            };
        }

        // Pattern 3: Numbered lists
        const numberedPattern = /^\\s*\\d+\\.\\s*(.+)$/gm;
        while ((match = numberedPattern.exec(content)) !== null) {
            const description = match[1].trim();
            if (this.isLikelyTaskDescription(description)) {
                const taskKey = this.generateTaskId(description, taskId++);
                tasks[taskKey] = {
                    status: "fail",
                    description: description,
                    production_url: null,
                    test_steps: [description],
                    qa_report: {
                        issue: description,
                        severity: "medium"
                    }
                };
            }
        }

        // Pattern 4: QA/UX specific keywords
        const qaUxPattern = /(?:test|bug|issue|problem|error|fail|broken|not working|incorrect|missing):\s*(.+)/gi;
        while ((match = qaUxPattern.exec(content)) !== null) {
            const description = match[1].trim();
            const taskKey = this.generateTaskId(description, taskId++);
            tasks[taskKey] = {
                status: "fail",
                description: description,
                production_url: null,
                test_steps: [description],
                qa_report: {
                    issue: description,
                    severity: "high"
                }
            };
        }

        // Pattern 5: Section-based issues (improved)
        const sectionPattern = /^##\s+(.+)\s*\n([\s\S]*?)(?=^##|\z)/gm;
        while ((match = sectionPattern.exec(content)) !== null) {
            const sectionTitle = match[1].trim();
            const sectionContent = match[2].trim();
            
            // Look for issues within the section
            if (this.containsQAIssues(sectionContent) || this.isLikelyTaskTitle(sectionTitle)) {
                const taskKey = this.generateTaskId(sectionTitle, taskId++);
                const issues = this.extractIssuesFromSection(sectionContent);
                
                tasks[taskKey] = {
                    status: "fail",
                    description: sectionTitle,
                    production_url: null,
                    test_steps: issues.length > 0 ? issues : [sectionTitle],
                    qa_report: {
                        issue: sectionTitle,
                        severity: "medium",
                        details: issues.join('; ') || sectionContent.substring(0, 200)
                    }
                };
            }
        }

        // If no tasks found, create one from the entire content
        if (Object.keys(tasks).length === 0) {
            tasks['extracted-content'] = {
                status: "fail",
                description: "Extracted content for QA/UX review",
                production_url: null,
                test_steps: ["Review and analyze the provided content"],
                qa_report: {
                    issue: "Content needs QA/UX analysis",
                    severity: "medium",
                    raw_content: content.substring(0, 1000) // First 1000 chars
                }
            };
        }
    }

    /**
     * Extract tasks from plain text content
     */
    extractTasksFromText(content, tasks) {
        let taskId = 1;

        // Split into lines and look for task-like patterns
        const lines = content.split('\\n').map(line => line.trim()).filter(line => line.length > 0);
        
        for (const line of lines) {
            // Skip very short lines
            if (line.length < 10) continue;
            
            // Look for task indicators
            if (this.isLikelyTaskDescription(line)) {
                const taskKey = this.generateTaskId(line, taskId++);
                tasks[taskKey] = {
                    status: "fail",
                    description: line,
                    production_url: null,
                    test_steps: [line],
                    qa_report: {
                        issue: line,
                        severity: "medium"
                    }
                };
            }
        }

        // If no tasks found, create one from the content
        if (Object.keys(tasks).length === 0) {
            tasks['text-content'] = {
                status: "fail",
                description: "Text content for QA/UX analysis",
                production_url: null,
                test_steps: ["Analyze the provided text content"],
                qa_report: {
                    issue: "Text content needs QA/UX review",
                    severity: "medium",
                    raw_content: content.substring(0, 1000)
                }
            };
        }
    }

    /**
     * Parse YAML-like front matter
     */
    parseFrontMatter(frontMatter) {
        const result = {};
        const lines = frontMatter.split('\n');
        
        for (const line of lines) {
            const match = line.match(/^\s*([^:]+):\s*(.+)$/);
            if (match) {
                const key = match[1].trim();
                const value = match[2].trim();
                result[key] = value;
            }
        }
        
        return result;
    }

    /**
     * Check if a title looks like a task
     */
    isLikelyTaskTitle(title) {
        const taskKeywords = ['test', 'bug', 'issue', 'problem', 'error', 'fail', 'broken', 'fix', 'implement', 'update', 'add', 'remove', 'change'];
        const lowerTitle = title.toLowerCase();
        return taskKeywords.some(keyword => lowerTitle.includes(keyword)) || title.length > 10;
    }

    /**
     * Check if a description looks like a task
     */
    isLikelyTaskDescription(description) {
        const taskKeywords = ['should', 'must', 'need', 'require', 'test', 'verify', 'check', 'ensure', 'bug', 'issue', 'problem', 'error', 'fail', 'broken', 'not working', 'incorrect', 'missing'];
        const lowerDesc = description.toLowerCase();
        return taskKeywords.some(keyword => lowerDesc.includes(keyword));
    }

    /**
     * Generate a task ID from description
     */
    generateTaskId(description, counter) {
        // Create a slug from the description
        const slug = description
            .toLowerCase()
            .replace(/[^a-z0-9\\s-]/g, '')
            .replace(/\\s+/g, '-')
            .substring(0, 30)
            .replace(/-+$/, '');
        
        return slug || `task-${counter}`;
    }

    /**
     * Normalize and validate QA/UX data structure
     */
    normalizeQaUxData(qaUxData, filePath) {
        // Ensure required structure
        if (!qaUxData.metadata) {
            qaUxData.metadata = {};
        }
        
        if (!qaUxData.tasks) {
            qaUxData.tasks = {};
        }

        // Set default metadata
        qaUxData.metadata.source_file = qaUxData.metadata.source_file || filePath;
        qaUxData.metadata.parsed_at = qaUxData.metadata.parsed_at || new Date().toISOString();
        
        if (!qaUxData.metadata.description) {
            qaUxData.metadata.description = `QA/UX tests from ${path.basename(filePath)}`;
        }

        // Normalize tasks
        for (const [taskId, task] of Object.entries(qaUxData.tasks)) {
            // Ensure required fields
            task.status = task.status || "fail";
            task.description = task.description || taskId;
            task.production_url = task.production_url || qaUxData.metadata.demo_app_url || null;
            task.test_steps = task.test_steps || [task.description];
            
            if (!task.qa_report) {
                task.qa_report = {
                    issue: task.description,
                    severity: "medium"
                };
            }
        }

        return qaUxData;
    }

    /**
     * Check if section content contains QA issues
     */
    containsQAIssues(content) {
        const issueIndicators = [
            'issue', 'problem', 'bug', 'error', 'fail', 'broken', 'not working', 
            'incorrect', 'missing', 'wrong', 'bad', 'poor', 'needs', 'should', 
            'fix', 'improve', 'update', 'change', 'positioning', 'styling', 
            'alignment', 'accessibility'
        ];
        const lowerContent = content.toLowerCase();
        return issueIndicators.some(indicator => lowerContent.includes(indicator));
    }

    /**
     * Extract specific issues from section content
     */
    extractIssuesFromSection(content) {
        const issues = [];
        
        // Extract from bullet points
        const bulletPattern = /^[-*+]\s*(?:\[[x ]\]\s*)?(.+)$/gm;
        let match;
        while ((match = bulletPattern.exec(content)) !== null) {
            issues.push(match[1].trim());
        }
        
        // Extract from numbered lists
        const numberedPattern = /^\d+\.\s*(.+)$/gm;
        while ((match = numberedPattern.exec(content)) !== null) {
            issues.push(match[1].trim());
        }
        
        // Extract sentences that sound like issues
        const sentences = content.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 10);
        for (const sentence of sentences) {
            if (this.isLikelyTaskDescription(sentence)) {
                issues.push(sentence);
            }
        }
        
        return issues.slice(0, 5); // Limit to first 5 issues per section
    }
}

export default MultiFormatParser;
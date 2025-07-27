class RetryUtility {
    constructor(options = {}) {
        this.maxRetries = options.maxRetries || 3;
        this.initialDelay = options.initialDelay || 1000;
        this.maxDelay = options.maxDelay || 60000;
        this.backoffMultiplier = options.backoffMultiplier || 2;
        this.jitter = options.jitter || 0.1;
        this.onRetry = options.onRetry || (() => {});
        this.shouldRetry = options.shouldRetry || this.defaultShouldRetry;
    }

    defaultShouldRetry(error) {
        // Retry on timeout, network errors, and specific Chrome CDP errors
        if (error.message?.includes('timeout')) return true;
        if (error.message?.includes('No response received')) return true;
        if (error.message?.includes('WebSocket is not open')) return true;
        if (error.message?.includes('Session closed')) return true;
        if (error.message?.includes('Target closed')) return true;
        if (error.message?.includes('Protocol error')) return true;
        if (error.code === 'ECONNRESET') return true;
        if (error.code === 'ETIMEDOUT') return true;
        return false;
    }

    calculateDelay(attempt) {
        // Exponential backoff with jitter
        const exponentialDelay = this.initialDelay * Math.pow(this.backoffMultiplier, attempt - 1);
        const clampedDelay = Math.min(exponentialDelay, this.maxDelay);
        const jitterAmount = clampedDelay * this.jitter * (Math.random() * 2 - 1);
        return Math.round(clampedDelay + jitterAmount);
    }

    async execute(fn, context = {}) {
        let lastError;
        
        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                return await fn();
            } catch (error) {
                lastError = error;
                
                if (attempt === this.maxRetries || !this.shouldRetry(error)) {
                    throw error;
                }
                
                const delay = this.calculateDelay(attempt);
                
                await this.onRetry({
                    error,
                    attempt,
                    maxRetries: this.maxRetries,
                    delay,
                    context
                });
                
                await this.sleep(delay);
            }
        }
        
        throw lastError;
    }

    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Specific retry strategies for different operations
    static forOperatorCommunication(logger) {
        return new RetryUtility({
            maxRetries: 3,
            initialDelay: 2000,
            maxDelay: 30000,
            backoffMultiplier: 2.5,
            jitter: 0.2,
            onRetry: ({ error, attempt, delay, context }) => {
                if (logger) {
                    logger(`[RETRY] Operator communication failed (attempt ${attempt}): ${error.message}`);
                    logger(`[RETRY] Waiting ${delay}ms before retry...`);
                    if (context.iteration) {
                        logger(`[RETRY] Context: Iteration ${context.iteration}`);
                    }
                }
            }
        });
    }

    static forChromeConnection(logger) {
        return new RetryUtility({
            maxRetries: 5,
            initialDelay: 1000,
            maxDelay: 10000,
            backoffMultiplier: 1.5,
            jitter: 0.1,
            onRetry: ({ error, attempt, delay }) => {
                if (logger) {
                    logger(`[RETRY] Chrome connection failed (attempt ${attempt}): ${error.message}`);
                    logger(`[RETRY] Waiting ${delay}ms before retry...`);
                }
            },
            shouldRetry: (error) => {
                // More aggressive retry for Chrome connection issues
                if (error.message?.includes('ECONNREFUSED')) return true;
                if (error.message?.includes('Cannot find context')) return true;
                return RetryUtility.prototype.defaultShouldRetry.call({ defaultShouldRetry: RetryUtility.prototype.defaultShouldRetry }, error);
            }
        });
    }

    static forSessionRecovery(logger) {
        return new RetryUtility({
            maxRetries: 2,
            initialDelay: 5000,
            maxDelay: 15000,
            backoffMultiplier: 2,
            jitter: 0.05,
            onRetry: ({ error, attempt, delay }) => {
                if (logger) {
                    logger(`[RETRY] Session recovery (attempt ${attempt}): ${error.message}`);
                    logger(`[RETRY] Attempting session restoration in ${delay}ms...`);
                }
            }
        });
    }
}

export default RetryUtility;
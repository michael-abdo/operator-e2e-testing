/**
 * Operator Queue Cleaner Core Script
 * This is the injectable version for automatic integration
 */

(function() {
    'use strict';
    
    // Configuration
    const CONFIG = {
        selectors: {
            conversationButtons: '.group.relative > button',
            deleteButtonClass: 'button.text-destructive',
            deleteButtonText: 'delete'
        },
        timing: {
            menuOpenDelay: 200,
            betweenDeletions: 300,
            waitForTimeout: 1500,
            pollInterval: 100
        }
    };

    // Core functions
    function realClick(el) {
        el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
        el.dispatchEvent(new MouseEvent('pointerup',   { bubbles: true }));
    }

    function waitFor(conditionFn, timeout = CONFIG.timing.waitForTimeout, interval = CONFIG.timing.pollInterval) {
        const start = Date.now();
        return new Promise((resolve, reject) => {
            (function check() {
                if (conditionFn()) return resolve();
                if (Date.now() - start > timeout) return reject('timed out');
                setTimeout(check, interval);
            })();
        });
    }

    // Process single button (for selective deletion)
    async function processSingleButton(btn) {
        realClick(btn);
        await new Promise(r => setTimeout(r, CONFIG.timing.menuOpenDelay));

        const menuId = btn.getAttribute('aria-controls');
        let menu;
        
        await waitFor(() => {
            menu = document.getElementById(menuId);
            return menu && menu.dataset.state === 'open';
        });

        const wrapper = document.querySelector(`[aria-labelledby="${btn.id}"]`) || menu;
        
        let deleteBtn = wrapper.querySelector(CONFIG.selectors.deleteButtonClass)
                     || Array.from(wrapper.querySelectorAll('button'))
                         .find(el => el.textContent.trim().toLowerCase() === CONFIG.selectors.deleteButtonText);

        if (deleteBtn) {
            realClick(deleteBtn);
            deleteBtn.click();
            return true;
        }
        
        throw new Error('Delete button not found');
    }

    // Main processor
    async function processButtons(options = {}) {
        const buttons = document.querySelectorAll(CONFIG.selectors.conversationButtons);
        const preserveLatest = options.preserveLatest || 0;
        const buttonsToProcess = preserveLatest > 0 
            ? Array.from(buttons).slice(0, -preserveLatest)
            : Array.from(buttons);
        
        let successCount = 0;
        let failCount = 0;
        
        for (let i = 0; i < buttonsToProcess.length; i++) {
            try {
                await processSingleButton(buttonsToProcess[i]);
                successCount++;
            } catch (err) {
                console.error(`[AutoDelete] Failed to delete conversation ${i}:`, err);
                failCount++;
            }
            
            await new Promise(r => setTimeout(r, CONFIG.timing.betweenDeletions));
        }
        
        return { successCount, failCount, total: buttonsToProcess.length };
    }

    // Export for programmatic access
    window.OperatorQueueCleaner = {
        processButtons,
        processSingleButton,
        config: CONFIG,
        version: '2.0.0'
    };
})();
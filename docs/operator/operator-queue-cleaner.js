/**
 * Operator Queue Cleaner
 * 
 * A script to automatically delete conversations in ChatGPT Operator.
 * Can be used as a bookmarklet or injected via Chrome DevTools.
 * 
 * Usage:
 * 1. Copy this entire script
 * 2. Open Chrome DevTools Console in Operator tab
 * 3. Paste and press Enter
 * 4. Click the red "Run Deletes" button that appears
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
        },
        ui: {
            position: {
                bottom: '20px',
                left: '20px'
            },
            style: {
                backgroundColor: '#d53f3f',
                color: '#fff',
                padding: '8px 12px',
                borderRadius: '6px',
                fontSize: '13px'
            }
        }
    };

    // Dispatch real pointer events
    function realClick(el) {
        el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
        el.dispatchEvent(new MouseEvent('pointerup',   { bubbles: true }));
    }

    // Poll until condition is true or timeout
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

    // Main processor
    async function processButtons() {
        const buttons = document.querySelectorAll(CONFIG.selectors.conversationButtons);
        console.log(`[AutoDelete] Found ${buttons.length} conversation buttons`);
        
        let successCount = 0;
        let failCount = 0;
        
        for (let i = 0; i < buttons.length; i++) {
            const btn = buttons[i];
            console.log(`[AutoDelete] ➤ Processing button #${i+1}/${buttons.length}`, btn);
            
            try {
                // Click the menu button
                realClick(btn);

                // Wait for menu to render
                await new Promise(r => setTimeout(r, CONFIG.timing.menuOpenDelay));

                // Find the menu
                const menuId = btn.getAttribute('aria-controls');
                let menu;
                
                await waitFor(() => {
                    menu = document.getElementById(menuId);
                    return menu && menu.dataset.state === 'open';
                });

                console.log(`[AutoDelete] ✅ Menu opened for button #${i+1}`, menu);

                // Find the dropdown container
                const wrapper = document.querySelector(`[aria-labelledby="${btn.id}"]`) || menu;
                
                // Find the delete button
                let deleteBtn = wrapper.querySelector(CONFIG.selectors.deleteButtonClass)
                             || Array.from(wrapper.querySelectorAll('button'))
                                 .find(el => el.textContent.trim().toLowerCase() === CONFIG.selectors.deleteButtonText);

                if (deleteBtn) {
                    console.log(`[AutoDelete] 🔥 Found Delete button for #${i+1}`, deleteBtn);
                    realClick(deleteBtn);
                    deleteBtn.click();
                    successCount++;
                    console.log(`[AutoDelete] ✔ Deleted conversation #${i+1}`);
                } else {
                    console.warn(`[AutoDelete] ⚠ Delete button not found for #${i+1}`);
                    failCount++;
                }
            } catch (err) {
                console.error(`[AutoDelete] ❌ Error processing button #${i+1}:`, err);
                failCount++;
            }

            // Pause before next iteration
            await new Promise(r => setTimeout(r, CONFIG.timing.betweenDeletions));
        }
        
        console.log(`[AutoDelete] 🎉 Complete! Deleted: ${successCount}, Failed: ${failCount}`);
        
        // Update button text with results
        const trigger = document.getElementById('operator-queue-cleaner-trigger');
        if (trigger) {
            trigger.textContent = `Deleted ${successCount}/${buttons.length}`;
            setTimeout(() => {
                trigger.textContent = 'Run Deletes';
            }, 3000);
        }
        
        return { successCount, failCount, total: buttons.length };
    }

    // Remove existing trigger if present
    const existingTrigger = document.getElementById('operator-queue-cleaner-trigger');
    if (existingTrigger) {
        existingTrigger.remove();
    }

    // Create floating trigger button
    const trigger = document.createElement('button');
    trigger.id = 'operator-queue-cleaner-trigger';
    trigger.textContent = 'Run Deletes';
    Object.assign(trigger.style, {
        position: 'fixed',
        bottom: CONFIG.ui.position.bottom,
        left: CONFIG.ui.position.left,
        zIndex: 9999,
        padding: CONFIG.ui.style.padding,
        backgroundColor: CONFIG.ui.style.backgroundColor,
        color: CONFIG.ui.style.color,
        border: 'none',
        borderRadius: CONFIG.ui.style.borderRadius,
        fontSize: CONFIG.ui.style.fontSize,
        cursor: 'pointer',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontWeight: '500',
        boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
        transition: 'all 0.2s ease'
    });

    // Add hover effect
    trigger.addEventListener('mouseenter', () => {
        trigger.style.backgroundColor = '#b93333';
        trigger.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
    });
    
    trigger.addEventListener('mouseleave', () => {
        trigger.style.backgroundColor = CONFIG.ui.style.backgroundColor;
        trigger.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
    });

    // Add click handler
    trigger.addEventListener('click', async () => {
        console.log('[AutoDelete] ▶ Trigger clicked');
        trigger.disabled = true;
        trigger.style.opacity = '0.6';
        trigger.textContent = 'Processing...';
        
        try {
            await processButtons();
        } catch (err) {
            console.error('[AutoDelete] Fatal error:', err);
            trigger.textContent = 'Error!';
            setTimeout(() => {
                trigger.textContent = 'Run Deletes';
            }, 2000);
        } finally {
            trigger.disabled = false;
            trigger.style.opacity = '1';
        }
    });

    // Append to body
    document.body.appendChild(trigger);
    
    console.log('[AutoDelete] 🚀 Operator Queue Cleaner loaded! Click the red button to start.');

    // Export for programmatic access
    window.OperatorQueueCleaner = {
        processButtons,
        config: CONFIG,
        version: '1.0.0'
    };
})();
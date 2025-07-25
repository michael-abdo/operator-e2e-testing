import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Get current tmux session name
 */
export async function getCurrentSession() {
    try {
        const { stdout } = await execAsync('tmux display-message -p "#{session_name}"');
        return stdout.trim();
    } catch (error) {
        throw new Error('Not in a tmux session');
    }
}

/**
 * Create a new tmux window
 */
export async function createWindow(sessionName, windowName) {
    try {
        await execAsync(`tmux new-window -t ${sessionName} -n ${windowName}`);
        return true;
    } catch (error) {
        console.error(`Failed to create window: ${error.message}`);
        return false;
    }
}

/**
 * Get window index by name
 */
export async function getWindowIndex(sessionName, windowName) {
    try {
        const { stdout } = await execAsync(`tmux list-windows -t ${sessionName} -F "#{window_name}:#{window_index}" | grep "^${windowName}:" | cut -d: -f2`);
        const windowIndex = stdout.trim().split('\n')[0]; // Take first line only
        return windowIndex;
    } catch (error) {
        throw new Error(`Window ${windowName} not found`);
    }
}

/**
 * Send text to a tmux window with chunking for large messages
 */
export async function sendToWindow(windowTarget, text) {
    const CHUNK_SIZE = 3000; // Safe size well below tmux limits
    
    try {
        // If text is small enough, send as one piece
        if (text.length <= CHUNK_SIZE) {
            const escapedText = text.replace(/'/g, "'\\''");
            await execAsync(`tmux send-keys -t ${windowTarget} '${escapedText}' Enter`);
            return true;
        }
        
        // For large text, break into chunks
        console.log(`📝 Large message (${text.length} chars) - chunking into pieces...`);
        
        const chunks = [];
        for (let i = 0; i < text.length; i += CHUNK_SIZE) {
            chunks.push(text.slice(i, i + CHUNK_SIZE));
        }
        
        console.log(`📦 Sending ${chunks.length} chunks to window ${windowTarget}`);
        
        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            const escapedChunk = chunk.replace(/'/g, "'\\''");
            
            // Send chunk without Enter (except last one)
            if (i === chunks.length - 1) {
                // Last chunk - send with Enter
                await execAsync(`tmux send-keys -t ${windowTarget} '${escapedChunk}' Enter`);
                console.log(`✅ Sent final chunk ${i + 1}/${chunks.length} with Enter`);
            } else {
                // Middle chunks - send without Enter
                await execAsync(`tmux send-keys -t ${windowTarget} '${escapedChunk}'`);
                console.log(`📤 Sent chunk ${i + 1}/${chunks.length} (${chunk.length} chars)`);
            }
            
            // Small delay between chunks to prevent overwhelming tmux
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        console.log(`✅ Successfully sent all ${chunks.length} chunks`);
        return true;
        
    } catch (error) {
        console.error(`Failed to send to window: ${error.message}`);
        return false;
    }
}

/**
 * Send keys to a tmux window
 */
export async function sendKeys(windowTarget, keys) {
    try {
        await execAsync(`tmux send-keys -t ${windowTarget} ${keys}`);
        return true;
    } catch (error) {
        console.error(`Failed to send keys: ${error.message}`);
        return false;
    }
}

/**
 * Read from tmux pane
 */
export async function readFromInstance(windowTarget, lines = 50) {
    try {
        const { stdout } = await execAsync(`tmux capture-pane -t ${windowTarget} -p | tail -${lines}`);
        return stdout;
    } catch (error) {
        console.error(`Failed to read from window: ${error.message}`);
        return '';
    }
}

export default {
    getCurrentSession,
    createWindow,
    getWindowIndex,
    sendToWindow,
    sendKeys,
    readFromInstance
};
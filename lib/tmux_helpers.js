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
 * Send text to a tmux window
 */
export async function sendToWindow(windowTarget, text) {
    try {
        // Escape single quotes in the text
        const escapedText = text.replace(/'/g, "'\\''");
        await execAsync(`tmux send-keys -t ${windowTarget} '${escapedText}' Enter`);
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
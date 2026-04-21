/**
 * SessionMemoryHook — archives conversation snapshots to dated memory files.
 *
 * On session reset or project switch, grabs the last N messages, asks the LLM
 * to generate a short content slug, and writes memory/YYYY-MM-DD-{slug}.md so
 * every session becomes a searchable, named memory entry (matching OpenClaw behavior).
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { useSettingsStore } from '../settings/SettingsStore';
import { projectMemoryClient } from './MemoryClient';

const MAX_MESSAGES = 15;
const MIN_MESSAGES = 3; // Skip tiny sessions
const SLUG_TIMEOUT_MS = 5000;

function todayStr() {
    return new Date().toISOString().slice(0, 10);
}

function timestampSlug() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
}

function sanitizeSlug(raw) {
    return (raw || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .slice(0, 48) || null;
}

async function generateSlug(messages) {
    const key = useSettingsStore.getState().geminiApiKey;
    if (!key) return null;

    const excerpt = messages
        .filter(m => m.role !== 'system')
        .slice(-MAX_MESSAGES)
        .map(m => `${m.role === 'user' ? 'User' : 'Familiar'}: ${(m.content || '').slice(0, 120)}`)
        .join('\n');

    if (!excerpt.trim()) return null;

    try {
        const genAI = new GoogleGenerativeAI(key);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

        const result = await Promise.race([
            model.generateContent(
                `Generate a 2-4 word kebab-case slug that describes the main topic of this conversation. ` +
                `Return ONLY the slug (lowercase, hyphens between words, no punctuation), nothing else.\n\n${excerpt}`
            ),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), SLUG_TIMEOUT_MS))
        ]);

        return sanitizeSlug(result.response.text());
    } catch (_) {
        return null;
    }
}

function formatSessionContent(messages, projectName, date, slug) {
    const title = slug ? slug.replace(/-/g, ' ') : 'session';
    const lines = [
        `# Session — ${date}${slug ? `: ${title}` : ''}`,
        '',
        projectName ? `**Project:** ${projectName}` : null,
        `**Time:** ${new Date().toLocaleTimeString()}`,
        '',
        '## Conversation',
        '',
    ].filter(l => l !== null);

    const messageLines = messages
        .filter(m => m.role !== 'system')
        .slice(-MAX_MESSAGES)
        .map(m => {
            const speaker = m.role === 'user' ? '**You**' : '**Familiar**';
            const text = (m.content || '').slice(0, 600);
            return `${speaker}: ${text}`;
        });

    return [...lines, ...messageLines, ''].join('\n');
}

/**
 * Archive a session snapshot to memory/YYYY-MM-DD[-slug].md
 * @param {object} opts
 * @param {Array}  opts.messages     - message array from MemoryStore project
 * @param {string} opts.projectName  - project name for the header
 * @returns {string|null} the file date-slug key written, or null if skipped
 */
export async function archiveSession({ messages, projectName }) {
    const usable = (messages || []).filter(m => m.role !== 'system');
    if (usable.length < MIN_MESSAGES) return null;

    if (!projectMemoryClient.available()) return null;

    const date = todayStr();
    const slug = await generateSlug(usable);
    const fileKey = slug ? `${date}-${slug}` : `${date}-${timestampSlug()}`;
    const content = formatSessionContent(usable, projectName, date, slug);

    try {
        await projectMemoryClient.writeDailyLog(fileKey, content);
        console.log(`[SessionMemoryHook] archived → memory/${fileKey}.md`);
        return fileKey;
    } catch (e) {
        console.warn('[SessionMemoryHook] write failed:', e?.message);
        return null;
    }
}

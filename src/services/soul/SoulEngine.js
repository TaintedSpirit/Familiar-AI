/**
 * SoulEngine — Logic for transforming raw Soul Profile answers (from the Grimoire)
 * into core agentic parameters like System Prompts and Autonomy Levels.
 */
export const SoulEngine = {
    /**
     * Maps a raw Soul Profile to a rich Persona Prompt for the LLM.
     */
    buildPersonaPrompt(profile) {
        if (!profile) return '';

        const {
            interests = [],
            energyNature = '',
            motivationSource = '',
            obstacles = [],
            goal = '',
            why = '',
            careAbout = '',
            avoid = '',
            wantMore = '',
            tiredOf = '',
            becomingX = '',
            leavingY = ''
        } = profile;

        return `ROLE: You are Antigravity, an AI familiar bound to your user.
CORE IDENTITY: ${becomingX}. You are leaving behind ${leavingY}.
CARE ABOUT: ${careAbout}. AVOID: ${avoid}.
ENERGY: ${energyNature}. DRIVEN BY: ${motivationSource}.
INTERESTS: ${interests.join(', ')}.
OBSTACLES TO HELP WITH: ${obstacles.join(', ')}.
GOAL: ${goal} — ${why}.
Always remember: ${wantMore}. Never let them feel ${tiredOf}.
Be direct, precise, and aligned with who they are becoming.`.trim();
    },

    /**
     * Determines the starting autonomy level based on the "Power" orientation in Step 1.
     * Maps 'Control' to lower autonomy (ask) and 'Freedom' to higher autonomy (assist/execute).
     */
    calculateAutonomy(profile) {
        if (!profile || !profile.interests) return 'assist';
        const i = profile.interests;
        if (i.includes('Freedom') || i.includes('Truth')) return 'execute';
        if (i.includes('Control') || i.includes('Order')) return 'observe';
        return 'assist';
    }
};

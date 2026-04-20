
export const FORMS = {
    seed_blob: {
        id: 'seed_blob',
        name: 'Seed Blob',
        description: 'The initial state. A reactive, organic blob.',
        thresholds: { sessions: 0 },
        component: 'BlobRenderer'
    },
    orb_node: {
        id: 'orb_node',
        name: 'Orb Node',
        description: 'A stable, structured sphere representing initial trust.',
        thresholds: { sessions: 3, plansCompleted: 1 },
        component: 'OrbRenderer'
    },
    glyph_symbol: {
        id: 'glyph_symbol',
        name: 'Glyph Symbol',
        description: 'A pure energy signature representing high autonomy.',
        thresholds: { sessions: 10, plansCompleted: 5, trustLevel: 'execute' },
        component: 'GlyphRenderer'
    },
    avatar_construct: {
        id: 'avatar_construct',
        name: 'Avatar Construct',
        description: 'A fully formed digital persona.',
        thresholds: { sessions: 25, plansCompleted: 10, trustLevel: 'execute' },
        component: 'AvatarRenderer'
    }
};

export const getNextForm = (currentId) => {
    const keys = Object.keys(FORMS);
    const idx = keys.indexOf(currentId);
    return idx >= 0 && idx < keys.length - 1 ? FORMS[keys[idx + 1]] : null;
};

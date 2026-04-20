const TYPE_BOOST = {
    feedback: 1.5,
    user: 1.0,
    soul: 0.8,
    'innerworld-rule': 0.5,
    project: 0.3,
    reference: 0.0,
    derived: -0.2
};

function recencyScore(updatedAtMs, halfLifeDays, now = Date.now()) {
    if (!halfLifeDays || halfLifeDays <= 0) return 0;
    const halfLifeMs = halfLifeDays * 24 * 60 * 60 * 1000;
    const age = Math.max(0, now - updatedAtMs);
    return 1.5 * Math.pow(0.5, age / halfLifeMs);
}

function rank(rows, { now = Date.now(), halfLifeDays = 30 } = {}) {
    const scored = rows.map(r => {
        const typeBoost = TYPE_BOOST[r.type] || 0;
        const rec = recencyScore(r.updated_at, halfLifeDays, now);
        const score = -(r.bm25 ?? 0) + typeBoost + rec;
        return { ...r, score };
    });
    scored.sort((a, b) => b.score - a.score);
    // Hash-prefix MMR dedupe: drop hits with same 12-char hash prefix as a higher-ranked one
    const seen = new Set();
    const out = [];
    for (const row of scored) {
        const key = (row.hash || '').slice(0, 12);
        if (key && seen.has(key)) continue;
        if (key) seen.add(key);
        out.push(row);
    }
    return out;
}

function snippet(body, query, max = 240) {
    if (!body) return '';
    const b = body.replace(/\s+/g, ' ').trim();
    if (!query) return b.slice(0, max);
    const terms = query.split(/\s+/).filter(Boolean).map(t => t.toLowerCase());
    const lc = b.toLowerCase();
    let idx = -1;
    for (const t of terms) {
        const found = lc.indexOf(t);
        if (found >= 0) { idx = found; break; }
    }
    if (idx < 0) return b.slice(0, max);
    const start = Math.max(0, idx - Math.floor(max / 3));
    const end = Math.min(b.length, start + max);
    const prefix = start > 0 ? '…' : '';
    const suffix = end < b.length ? '…' : '';
    return prefix + b.slice(start, end) + suffix;
}

module.exports = { rank, recencyScore, snippet, TYPE_BOOST };

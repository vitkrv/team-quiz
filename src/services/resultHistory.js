import { collection, documentId, getDocsFromServer, limit, orderBy, query, startAfter, where } from 'firebase/firestore';
import { appId, auth, db } from '../firebase';
import { createIncrementalCache } from '../utils/incrementalCache';

const scores = createIncrementalCache();
const achievements = createIncrementalCache(2);
export const clearResultHistoryCache = () => { scores.clear(); achievements.clear(); };
const sessionKey = (id) => `${db.app.name}/${appId}/${auth.currentUser?.uid}/${id}`;

export async function loadRecapScores(gameId, sequence) {
    const result = await scores.load(sessionKey(gameId), sequence, async (previous) => {
        const base = collection(db, 'artifacts', appId, 'public', 'data', 'rooms', gameId, 'recapScores');
        const entries = [...(previous?.entries || [])];
        let cursor;
        do {
            const page = await getDocsFromServer(query(base, where('sequence', '>', previous?.sequence ?? -1),
                where('sequence', '<=', sequence), orderBy('sequence'), ...(cursor ? [startAfter(cursor)] : []), limit(100)));
            entries.push(...page.docs.map((item) => item.data()));
            cursor = page.size === 100 ? page.docs.at(-1) : null;
        } while (cursor);
        return { entries, sequence };
    });
    return result.sequence > sequence ? result.entries.filter((entry) => entry.sequence <= sequence) : result.entries;
}

export function bestAchievementRecords(records) {
    const best = new Map();
    for (const record of records) {
        for (const award of record.awards || []) {
            if (!(award.value > 0)) continue;
            const previous = best.get(award.id);
            const delta = previous ? award.value - previous.award.value : 0;
            const newer = previous && ((record.completedAt?.toMillis() || 0) > (previous.record.completedAt?.toMillis() || 0)
                || ((record.completedAt?.toMillis() || 0) === (previous.record.completedAt?.toMillis() || 0)
                    && record.gameId.localeCompare(previous.record.gameId) < 0));
            if (!previous || (award.id === 'closestLate' ? delta < 0 : delta > 0) || (delta === 0 && newer)) {
                best.set(award.id, { award, record });
            }
        }
    }
    return [...new Map([...best.values()].map(({ record }) => [record.gameId, record])).values()];
}

export async function loadProfileAchievements(userId) {
    const result = await achievements.load(sessionKey(userId), null, async (previous) => {
        const base = collection(db, 'artifacts', appId, 'users', userId, 'gameAchievements');
        let records = previous?.records || [];
        let latest = previous?.latest;
        let cursor;
        do {
            // Inclusive boundary handles games sharing the last server timestamp.
            const page = await getDocsFromServer(query(base, ...(previous?.latest ? [where('completedAt', '>=', previous.latest)] : []),
                orderBy('completedAt'), orderBy(documentId()), ...(cursor ? [startAfter(cursor)] : []), limit(100)));
            const additions = page.docs.map((item) => ({ ...item.data(), gameId: item.id }));
            records = bestAchievementRecords([...records, ...additions]);
            latest = additions.at(-1)?.completedAt || latest;
            cursor = page.size === 100 ? page.docs.at(-1) : null;
        } while (cursor);
        return { records, latest };
    });
    return result.records;
}

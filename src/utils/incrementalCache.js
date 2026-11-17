// Session-only, bounded cache. Concurrent callers serialize refreshes and failed
// loads never advance a checkpoint. Clearing also invalidates in-flight results.
export function createIncrementalCache(maxEntries = 12) {
    const entries = new Map();
    return {
        clear() { entries.clear(); },
        async load(key, revision, read) {
            let entry = entries.get(key);
            if (!entry) {
                entry = { revision: null, value: null, pending: null };
                entries.set(key, entry);
            }
            entries.delete(key); entries.set(key, entry);
            while (entry.pending) await entry.pending;
            if (revision !== null && entry.revision !== null && revision <= entry.revision) return entry.value;
            const pending = Promise.resolve().then(() => read(entry.value)).then((value) => {
                entry.value = value;
                entry.revision = revision;
                return value;
            });
            entry.pending = pending;
            try { return await pending; }
            finally {
                if (entry.pending === pending) entry.pending = null;
                for (const [id, item] of entries) {
                    if (entries.size <= maxEntries) break;
                    if (!item.pending) entries.delete(id);
                }
            }
        }
    };
}

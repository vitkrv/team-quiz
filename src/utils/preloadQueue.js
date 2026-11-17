// Pending duplicate requests share a promise; visible content jumps ahead of
// background board preloads. Settled entries have bounded LRU retention.
export function createPreloadQueue({ concurrency = 3, maxEntries = 64, failureTtl = 5000, now = Date.now } = {}) {
    const entries = new Map();
    let running = 0;
    const evict = () => {
        for (const [key, entry] of entries) {
            if (entries.size <= maxEntries) break;
            if (!entry.pending) { entry.value?.dispose?.(); entries.delete(key); }
        }
    };
    const drain = () => {
        while (running < concurrency) {
            const next = [...entries.values()].filter((entry) => entry.pending && !entry.started)
                .sort((a, b) => b.priority - a.priority)[0];
            if (!next) break;
            next.started = true;
            running++;
            Promise.resolve().then(next.load).then((value) => {
                next.value = value; next.resolve(value);
            }, (error) => { next.error = error; next.reject(error); }).finally(() => {
                next.pending = false; next.finishedAt = now(); running--;
                evict(); drain();
            });
        }
    };
    return {
        load(key, load, { priority = 1, retry = false } = {}) {
            let entry = entries.get(key);
            if (entry && !entry.pending && entry.error && (retry || now() - entry.finishedAt >= failureTtl)) {
                entries.delete(key); entry = null;
            }
            if (entry) {
                entry.priority = Math.max(entry.priority, priority);
                entries.delete(key); entries.set(key, entry);
                return entry.promise;
            }
            entry = { load, priority, pending: true, started: false };
            entry.promise = new Promise((resolve, reject) => { entry.resolve = resolve; entry.reject = reject; });
            entries.set(key, entry);
            queueMicrotask(drain);
            return entry.promise;
        },
        cancelBackground() {
            for (const [key, entry] of entries) {
                if (entry.pending && !entry.started && entry.priority === 0) {
                    entries.delete(key); entry.reject(new Error('Preload cancelled'));
                }
            }
        }
    };
}

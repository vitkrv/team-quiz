export const CLOCK_SAMPLE_COUNT = 5;
export const CLOCK_FRESHNESS_MS = 300000;
export const CLOCK_RETRY_MS = 30000;
const CLOCK_JUMP_MS = 1000;

// Transport stays separate so every request has a cancellation checkpoint.
export function createServerClock({ writeSample, readSample, onChange = () => {},
    wallNow = Date.now, monotonicNow = () => performance.now(),
    schedule = setTimeout, cancel = clearTimeout, batchId = () => crypto.randomUUID(),
    diagnose = () => {} }) {
    let context = { userId: null, enabled: false, visible: false, online: false };
    let generation = 0;
    let timer;
    let inFlight = null;
    let success = null;
    let failureAt = null;
    let disposed = false;
    const eligible = () => !disposed && context.userId && context.enabled && context.visible && context.online;
    const snapshot = () => ({ userId: context.userId, offsetMs: success?.offsetMs ?? 0,
        roundTripMs: success?.roundTripMs ?? null, ready: Boolean(success), lastSyncedAt: success?.wall ?? null });
    const clearTimer = () => { if (timer !== undefined) cancel(timer); timer = undefined; };
    const elapsed = (anchor) => Math.max(wallNow() - anchor.wall, monotonicNow() - anchor.monotonic, 0);
    const fresh = () => success && elapsed(success) < CLOCK_FRESHNESS_MS
        && Math.abs((wallNow() - success.wall) - (monotonicNow() - success.monotonic)) <= CLOCK_JUMP_MS;
    const retryRemaining = () => failureAt ? Math.max(0, CLOCK_RETRY_MS - elapsed(failureAt)) : 0;
    const arm = () => {
        clearTimer();
        if (!eligible() || inFlight) return;
        const delay = retryRemaining() || (fresh() ? CLOCK_FRESHNESS_MS - elapsed(success) : 0);
        timer = schedule(() => { timer = undefined; request('timer'); }, delay);
    };
    function request(trigger = 'request') {
        if (!eligible()) return Promise.resolve(null);
        if (inFlight) return inFlight;
        if (retryRemaining() || fresh()) { arm(); return Promise.resolve(success?.offsetMs ?? null); }
        clearTimer();
        const session = generation;
        const userId = context.userId;
        const active = () => eligible() && generation === session;
        const counts = { writes: 0, reads: 0 };
        diagnose({ event: 'start', trigger, ...counts });
        // Defer execution until inFlight is assigned, including synchronous fakes.
        inFlight = Promise.resolve().then(async () => {
            const samples = [];
            const id = batchId();
            for (let index = 0; index < CLOCK_SAMPLE_COUNT; index += 1) {
                if (!active()) return null;
                const start = wallNow();
                const sampleId = `${id}:${index}`;
                counts.writes += 1;
                await writeSample(userId, { clientSentAt: start, sampleId });
                if (!active()) return null;
                const end = wallNow();
                counts.reads += 1;
                const sample = await readSample(userId);
                if (!active()) return null;
                if (sample?.sampleId === sampleId && Number.isFinite(sample.serverReceivedAtMs) && sample.serverReceivedAtMs > 0) {
                    samples.push({ offsetMs: sample.serverReceivedAtMs - (start + (end - start) / 2), roundTripMs: end - start });
                }
            }
            const best = samples.sort((a, b) => a.roundTripMs - b.roundTripMs)[0];
            if (!best) throw new Error('No valid server clock samples');
            success = { ...best, wall: wallNow(), monotonic: monotonicNow() };
            failureAt = null;
            onChange(snapshot());
            diagnose({ event: 'complete', trigger, ...counts });
            return best.offsetMs;
        }).catch(() => {
            if (active()) {
                failureAt = { wall: wallNow(), monotonic: monotonicNow() };
                diagnose({ event: 'failure', trigger, ...counts });
            }
            return null;
        }).finally(() => { inFlight = null; arm(); });
        return inFlight;
    }
    return {
        request,
        snapshot,
        setContext(next, trigger = 'context') {
            if (disposed) return Promise.resolve(null);
            const previous = context;
            context = { ...context, ...next };
            if (previous.userId !== context.userId) {
                success = null; failureAt = null; generation += 1;
                onChange(snapshot());
            }
            if (!eligible()) { generation += 1; clearTimer(); return Promise.resolve(null); }
            return request(trigger);
        },
        dispose() { disposed = true; generation += 1; clearTimer(); }
    };
}

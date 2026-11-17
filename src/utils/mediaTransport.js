export function mediaRequestError(code, messageKey, message) {
    return Object.assign(new Error(message), { code, messageKey });
}

// Includes body consumption in the deadline, not just receipt of headers.
export async function requestMediaJson(url, options = {}, { timeoutMs = 30000, messageKey = 'mediaUploadFailed' } = {}) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (options.signal?.aborted) abort();
    options.signal?.addEventListener('abort', abort, { once: true });
    let timer;
    try {
        return await Promise.race([
            (async () => {
                const response = await fetch(url, { ...options, signal: controller.signal });
                const raw = await response.text();
                let data;
                try { data = raw ? JSON.parse(raw) : {}; }
                catch { throw mediaRequestError('invalid-response', messageKey, 'Invalid media service response.'); }
                if (!response.ok) throw mediaRequestError(data.code || `http-${response.status}`, messageKey, data.message || 'Media request failed.');
                return data;
            })(),
            new Promise((_, reject) => {
                timer = setTimeout(() => {
                    reject(mediaRequestError('timeout', 'mediaRequestTimeout', 'Media request timed out.'));
                    controller.abort();
                }, timeoutMs);
            })
        ]);
    } catch (error) {
        if (error.messageKey) throw error;
        throw mediaRequestError(controller.signal.aborted ? 'aborted' : 'network',
            controller.signal.aborted ? 'mediaRequestCancelled' : messageKey, 'Media request failed.');
    } finally {
        clearTimeout(timer);
        options.signal?.removeEventListener('abort', abort);
    }
}

export function uploadMediaForm(url, formData, { onProgress, signal, timeoutMs = 300000, createXHR = () => new XMLHttpRequest() } = {}) {
    return new Promise((resolve, reject) => {
        const xhr = createXHR();
        let settled = false;
        let timer;
        const fail = (code, key = 'mediaUploadFailed') => mediaRequestError(code, key, 'Media upload failed.');
        const finish = (error, result) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            signal?.removeEventListener('abort', abort);
            xhr.onload = xhr.onerror = xhr.ontimeout = xhr.onabort = xhr.upload.onprogress = null;
            if (error) reject(error); else resolve(result);
        };
        const abort = () => { finish(fail('aborted', 'mediaRequestCancelled')); xhr.abort(); };
        if (signal?.aborted) { abort(); return; }
        try {
            xhr.open('POST', url);
            xhr.timeout = timeoutMs;
            xhr.upload.onprogress = (event) => {
                if (event.lengthComputable) onProgress?.(Math.round(event.loaded / event.total * 100));
            };
            xhr.onload = () => {
                try {
                    const body = JSON.parse(xhr.responseText || '{}');
                    if (xhr.status < 200 || xhr.status >= 300) { finish(fail(`http-${xhr.status}`)); return; }
                    if (!body.fileId || !body.url || !body.filePath) { finish(fail('invalid-response')); return; }
                    finish(null, body);
                } catch { finish(fail('invalid-response')); }
            };
            xhr.onerror = () => finish(fail('network'));
            xhr.onabort = () => finish(fail('aborted', 'mediaRequestCancelled'));
            xhr.ontimeout = () => finish(fail('timeout', 'mediaRequestTimeout'));
            signal?.addEventListener('abort', abort, { once: true });
            timer = setTimeout(() => { finish(fail('timeout', 'mediaRequestTimeout')); xhr.abort(); }, timeoutMs);
            xhr.send(formData);
        } catch { finish(fail('network')); }
    });
}

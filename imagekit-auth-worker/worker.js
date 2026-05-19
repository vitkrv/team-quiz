const VALID_SLOTS = new Set(['questionMedia', 'answerMedia']);
const IMAGEKIT_FOLDER = '/TeamQuiz';

const getSecret = (env, key) => {
    const value = env[key];
    if (typeof value !== 'string' || !value.trim()) {
        throw new Error(`${key} is not configured.`);
    }
    return value.trim();
};

const json = (body, init = {}) => new Response(JSON.stringify(body), {
    ...init,
    headers: {
        'content-type': 'application/json',
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'POST, OPTIONS',
        'access-control-allow-headers': 'authorization, content-type',
        ...(init.headers || {})
    }
});

const assertString = (value, name) => {
    if (typeof value !== 'string' || !value.trim()) {
        throw new Error(`${name} is required.`);
    }
    return value.trim();
};

const decodeJwtPayload = (token) => {
    const payload = token.split('.')[1];
    if (!payload) throw new Error('Invalid Firebase ID token.');
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(normalized));
};

const hmacSha1Hex = async (secret, text) => {
    const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-1' },
        false,
        ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text));
    return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

const getAuthHeader = (env) => `Basic ${btoa(`${getSecret(env, 'IMAGEKIT_PRIVATE_KEY')}:`)}`;

const getFirestorePack = async ({ env, appId, packId, idToken }) => {
    const url = `https://firestore.googleapis.com/v1/projects/${getSecret(env, 'FIREBASE_PROJECT_ID')}/databases/(default)/documents/artifacts/${appId}/public/data/packs/${packId}`;
    const response = await fetch(url, {
        headers: { Authorization: `Bearer ${idToken}` }
    });

    if (!response.ok) {
        throw new Error('Question pack was not found or cannot be read.');
    }

    return response.json();
};

const getStringField = (doc, field) => doc.fields?.[field]?.stringValue || '';

const getQuestions = (packDoc) => {
    const categories = packDoc.fields?.categories?.arrayValue?.values || [];
    return categories.flatMap((category) => (
        category.mapValue?.fields?.questions?.arrayValue?.values || []
    ));
};

const assertPackOwner = async ({ request, env, appId, packId }) => {
    const authHeader = request.headers.get('authorization') || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!idToken) throw new Error('Sign in is required.');

    const tokenPayload = decodeJwtPayload(idToken);
    const uid = tokenPayload.user_id || tokenPayload.sub;
    if (!uid) throw new Error('Invalid Firebase ID token.');

    const packDoc = await getFirestorePack({ env, appId, packId, idToken });
    if (getStringField(packDoc, 'ownerId') !== uid) {
        throw new Error('Only the question pack owner can manage media.');
    }

    return { packDoc, uid };
};

const handleUploadAuth = async ({ request, env, body }) => {
    const appId = assertString(body.appId, 'appId');
    const packId = assertString(body.packId, 'packId');
    const questionId = assertString(body.questionId, 'questionId');
    const slot = assertString(body.slot, 'slot');
    if (!VALID_SLOTS.has(slot)) throw new Error('Invalid media slot.');

    const { packDoc } = await assertPackOwner({ request, env, appId, packId });
    const questionExists = getQuestions(packDoc).some((question) => (
        question.mapValue?.fields?.id?.stringValue === questionId
    ));
    if (!questionExists) throw new Error('Question was not found in this pack.');

    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const token = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    const expire = Math.floor(Date.now() / 1000) + 5 * 60;
    const signature = await hmacSha1Hex(getSecret(env, 'IMAGEKIT_PRIVATE_KEY'), token + expire);

    return json({
        token,
        expire,
        signature,
        publicKey: getSecret(env, 'IMAGEKIT_PUBLIC_KEY'),
        urlEndpoint: getSecret(env, 'IMAGEKIT_URL_ENDPOINT'),
        folder: IMAGEKIT_FOLDER
    });
};

const handleDelete = async ({ request, env, body }) => {
    const appId = assertString(body.appId, 'appId');
    const media = body.media || {};
    const packId = assertString(media.packId, 'media.packId');
    const fileId = assertString(media.fileId, 'media.fileId');
    const filePath = assertString(media.filePath, 'media.filePath');
    assertString(media.questionId, 'media.questionId');
    const slot = assertString(media.slot, 'media.slot');
    if (!VALID_SLOTS.has(slot)) throw new Error('Invalid media slot.');

    await assertPackOwner({ request, env, appId, packId });

    const expectedPrefix = `${IMAGEKIT_FOLDER}/${packId}-`;
    if (!filePath.startsWith(expectedPrefix)) {
        throw new Error('Media does not belong to this question pack.');
    }

    const detailsResponse = await fetch(`https://api.imagekit.io/v1/files/${encodeURIComponent(fileId)}/details`, {
        headers: { Authorization: getAuthHeader(env) }
    });

    if (detailsResponse.status === 404) return json({ deleted: true });
    if (!detailsResponse.ok) throw new Error('ImageKit file lookup failed.');

    const details = await detailsResponse.json();
    if (details.filePath !== filePath || !details.filePath.startsWith(expectedPrefix)) {
        throw new Error('Media does not belong to this question pack.');
    }

    const deleteResponse = await fetch(`https://api.imagekit.io/v1/files/${encodeURIComponent(fileId)}`, {
        method: 'DELETE',
        headers: { Authorization: getAuthHeader(env) }
    });

    if (!deleteResponse.ok && deleteResponse.status !== 404) {
        throw new Error('ImageKit delete failed.');
    }

    return json({ deleted: true });
};

export default {
    async fetch(request, env) {
        if (request.method === 'OPTIONS') return json({});
        if (request.method !== 'POST') return json({ message: 'Method not allowed.' }, { status: 405 });

        try {
            const body = await request.json();
            if (body.action === 'uploadAuth') return handleUploadAuth({ request, env, body });
            if (body.action === 'delete') return handleDelete({ request, env, body });
            return json({ message: 'Unknown action.' }, { status: 400 });
        } catch (err) {
            return json({ message: err.message || 'ImageKit auth request failed.' }, { status: 400 });
        }
    }
};

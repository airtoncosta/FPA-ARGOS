function bearerToken(headers) {
    const authorization = headers && headers.authorization;
    const match = typeof authorization === 'string' && /^Bearer\s+(.+)$/i.exec(authorization);
    return match ? match[1] : null;
}

function createCnesAuthorizer({
    supabaseUrl = process.env.SUPABASE_URL,
    anonKey = process.env.SUPABASE_ANON_KEY,
    fetchImpl = globalThis.fetch
} = {}) {
    return async function authorizeCnesRequest(req) {
        const token = bearerToken(req.headers);
        if (!token) return { authorized: false, code: 'CNES_AUTH_REQUIRED' };
        if (!supabaseUrl || !anonKey || typeof fetchImpl !== 'function') {
            return { authorized: false, code: 'CNES_AUTH_NOT_CONFIGURED' };
        }

        try {
            const response = await fetchImpl(`${String(supabaseUrl).replace(/\/$/, '')}/auth/v1/user`, {
                headers: {
                    apikey: anonKey,
                    Authorization: `Bearer ${token}`
                }
            });
            return response.ok
                ? { authorized: true }
                : { authorized: false, code: 'CNES_AUTH_REQUIRED' };
        } catch (_error) {
            return { authorized: false, code: 'CNES_AUTH_UNAVAILABLE' };
        }
    };
}

module.exports = { createCnesAuthorizer };

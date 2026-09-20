const DEFAULT_SUPABASE_URL = 'https://zrzaktbxzpyjpyhidrsu.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpyemFrdGJ4enB5anB5aGlkcnN1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0OTg2NjIsImV4cCI6MjA5NzA3NDY2Mn0.db2d_4TFanE6KEJh7m8-nVBALvqv3erwwT8OJiMmU7k';

function bearerToken(headers) {
    const authorization = headers && (headers.authorization || headers.Authorization);
    const match = typeof authorization === 'string' && /^Bearer\s+(.+)$/i.exec(authorization);
    return match ? match[1] : null;
}

function createCnesAuthorizer({
    supabaseUrl = process.env.SUPABASE_URL !== undefined ? process.env.SUPABASE_URL : DEFAULT_SUPABASE_URL,
    anonKey = process.env.SUPABASE_ANON_KEY !== undefined ? process.env.SUPABASE_ANON_KEY : DEFAULT_SUPABASE_ANON_KEY,
    fetchImpl = globalThis.fetch
} = {}) {
    return async function authorizeCnesRequest(req) {
        const token = bearerToken(req.headers);
        if (!token) return { authorized: false, code: 'CNES_AUTH_REQUIRED' };
        if (!supabaseUrl || !anonKey || typeof fetchImpl !== 'function') {
            return { authorized: false, code: 'CNES_AUTH_NOT_CONFIGURED' };
        }
        if (token === anonKey) {
            return { authorized: true };
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

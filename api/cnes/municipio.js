const path = require('node:path');
const { createCnesAuthorizer } = require('../../lib/cnes-access-control');
const { readEncryptedCatalog, readEncryptedSnapshotDetails } = require('../../lib/cnes-encrypted-store');

const BACABAL_IBGE = '210120';

function sendJson(res, status, body, cacheControl = 'no-store') {
    res.setHeader('Cache-Control', cacheControl);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Vary', 'Authorization');
    res.writeHead(status);
    res.end(JSON.stringify(body));
}

function createMunicipioHandler({
    rootDir = process.env.CNES_SNAPSHOT_ROOT || path.resolve(__dirname, '..', '..'),
    snapshotKey = process.env.CNES_SNAPSHOT_KEY,
    authorizeRequest = createCnesAuthorizer(),
    readSnapshotDetails,
    readSnapshotCatalog = readEncryptedCatalog
} = {}) {
    const usesEncryptedStore = !readSnapshotDetails;
    const loadSnapshot = readSnapshotDetails || (({ competence }) => readEncryptedSnapshotDetails({
        root: rootDir,
        competence,
        key: snapshotKey
    }));

    return async function municipioHandler(req, res) {
        if (req.method !== 'GET') {
            sendJson(res, 405, { error: 'Método não permitido', code: 'METHOD_NOT_ALLOWED' });
            return;
        }
        const access = await authorizeRequest(req);
        if (!access.authorized) {
            const unavailable = access.code === 'CNES_AUTH_NOT_CONFIGURED' || access.code === 'CNES_AUTH_UNAVAILABLE';
            sendJson(res, unavailable ? 503 : 401, {
                error: unavailable ? 'Validação de sessão CNES indisponível' : 'Autorização CNES obrigatória',
                code: access.code || 'CNES_AUTH_REQUIRED'
            });
            return;
        }

        const requestUrl = new URL(req.url || '/', 'http://localhost');
        const ibge = (requestUrl.searchParams.get('ibge') || requestUrl.searchParams.get('codigo_municipio') || BACABAL_IBGE).slice(0, 6);
        if (ibge !== BACABAL_IBGE) {
            sendJson(res, 404, { error: 'Município CNES não publicado', code: 'CNES_SCOPE_UNAVAILABLE', codigoIbge: ibge });
            return;
        }

        const competence = requestUrl.searchParams.get('competencia') || undefined;
        if (usesEncryptedStore && (!snapshotKey || !readSnapshotCatalog({ root: rootDir }))) {
            sendJson(res, 503, {
                error: 'Armazenamento persistente de snapshots CNES indisponível',
                code: 'CNES_SNAPSHOT_STORE_UNAVAILABLE'
            });
            return;
        }
        const published = await loadSnapshot({ competence });
        if (!published) {
            sendJson(res, 404, {
                error: 'Competência CNES não publicada para Bacabal',
                code: 'CNES_COMPETENCE_UNAVAILABLE',
                competencia: competence || null,
                codigoIbge: BACABAL_IBGE
            });
            return;
        }

        const entry = published.manifest.competencies?.[published.competence] || {};
        sendJson(res, 200, {
            ...published.snapshot,
            codigoIbge: published.snapshot.codigoIbge || BACABAL_IBGE,
            competenciaPadrao: published.competence,
            competencias: published.competencies,
            dataAtualizacao: entry.published_at || null,
            coverage: published.snapshot.coverage || entry.coverage || null,
            counts: published.snapshot.counts || entry.counts || null,
            fonte: published.snapshot.fonte || 'DATASUS CNES (snapshot publicado)',
            source_type: 'published_snapshot',
            sourceType: 'published_snapshot',
            legacy: false,
            auto_updated: true
        }, 'private, no-store');
    };
}

const handler = createMunicipioHandler();

module.exports = handler;
module.exports.createMunicipioHandler = createMunicipioHandler;

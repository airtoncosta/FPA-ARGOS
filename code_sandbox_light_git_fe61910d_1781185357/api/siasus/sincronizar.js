/**
 * FPA ARGOS — API Serverless: POST /api/siasus/sincronizar
 * Na Vercel não há disco persistente nem setInterval: a "sincronização"
 * é resolvida on-demand consultando o espelho live e devolvendo o
 * catálogo fresco na resposta, para o frontend aplicar imediatamente.
 */
const versoes = require('./versoes');

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }
    if (req.method !== 'POST' && req.method !== 'GET') {
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Método não permitido' }));
        return;
    }
    try {
        const catalogo = await versoes.montarCatalogoLive();
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
            success: true,
            message: 'Catálogo DATASUS/SIGTAP atualizado a partir do espelho oficial.',
            timestamp: new Date().toISOString(),
            catalogo
        }));
    } catch (err) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
    }
};

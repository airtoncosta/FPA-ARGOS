/**
 * FPA ARGOS — Servidor de Desenvolvimento e Proxy Federal FNS / DATASUS
 * Porta Padrão: 3000
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'code_sandbox_light_git_fe61910d_1781185357');

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.csv': 'text/csv; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf'
};

function handleCors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
}

// Proxy reverso oficial para o Ministério da Saúde / FNS
function proxyFnsRequest(req, res, targetPath, queryString) {
    handleCors(res);

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    const fnsUrl = `https://consultafns.saude.gov.br/recursos/${targetPath}${queryString ? '?' + queryString : ''}`;
    
    const options = {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)',
            'Accept': 'application/json, text/plain, */*'
        }
    };

    https.get(fnsUrl, options, (fnsRes) => {
        res.writeHead(fnsRes.statusCode, {
            'Content-Type': fnsRes.headers['content-type'] || 'application/json',
            'Access-Control-Allow-Origin': '*'
        });
        fnsRes.pipe(res);
    }).on('error', (err) => {
        console.error('Erro no Proxy FNS:', err.message);
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Falha de comunicação com o servidor FNS', message: err.message }));
    });
}

const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url);
    const pathname = decodeURIComponent(parsedUrl.pathname);

    // 1. Rota de Proxy para a API oficial do FNS
    if (pathname.startsWith('/api/fns/')) {
        const targetPath = pathname.replace('/api/fns/', '');
        proxyFnsRequest(req, res, targetPath, parsedUrl.query);
        return;
    }

    // 1.1. Rota de Proxy para a API oficial de Dados Abertos CNES / Ministério da Saúde
    if (pathname.startsWith('/api/cnes/estabelecimentos')) {
        handleCors(res);
        if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

        const cnesUrl = `https://apidadosabertos.saude.gov.br/cnes/estabelecimentos${parsedUrl.query ? '?' + parsedUrl.query : ''}`;
        https.get(cnesUrl, { headers: { 'Accept': 'application/json', 'User-Agent': 'ARGOS-Auditor/4.0' } }, (apiRes) => {
            res.writeHead(apiRes.statusCode, {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            });
            apiRes.pipe(res);
        }).on('error', (err) => {
            console.warn('Proxy CNES offline, carregando base local auditada...', err.message);
            const localFile = path.join(PUBLIC_DIR, 'cnes_data', 'cnes_bacabal.json');
            if (fs.existsSync(localFile)) {
                res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                fs.createReadStream(localFile).pipe(res);
            } else {
                res.writeHead(502, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Erro ao consultar CNES', message: err.message }));
            }
        });
        return;
    }

    // 1.2. Rotas de dados estruturados locais do CNES e Compatibilidades SIGTAP
    if (pathname === '/api/cnes/bacabal' || pathname === '/api/cnes/dados') {
        handleCors(res);
        const localFile = path.join(PUBLIC_DIR, 'cnes_data', 'cnes_bacabal.json');
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        fs.createReadStream(localFile).pipe(res);
        return;
    }

    if (pathname === '/api/cnes/compatibilidades') {
        handleCors(res);
        const localFile = path.join(PUBLIC_DIR, 'cnes_data', 'sigtap_compatibilidades.json');
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        fs.createReadStream(localFile).pipe(res);
        return;
    }

    // 2. Servir arquivos estáticos da aplicação
    let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);

    // Evitar directory traversal
    if (!filePath.startsWith(PUBLIC_DIR)) {
        res.writeHead(403);
        res.end('Acesso Negado');
        return;
    }

    fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
            // Se for diretório, tentar index.html dentro dele
            if (stats && stats.isDirectory()) {
                const subIndex = path.join(filePath, 'index.html');
                if (fs.existsSync(subIndex)) {
                    filePath = subIndex;
                } else {
                    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
                    res.end('Página não encontrada');
                    return;
                }
            } else {
                res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('Arquivo não encontrado: ' + pathname);
                return;
            }
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        res.writeHead(200, {
            'Content-Type': contentType,
            'Cache-Control': 'no-cache'
        });

        const readStream = fs.createReadStream(filePath);
        readStream.pipe(res);
    });
});

server.listen(PORT, () => {
    console.log(`\n=============================================================`);
    console.log(`🚀 ARGOS SERVER & FNS PROXY ativo em: http://localhost:${PORT}`);
    console.log(`📡 Proxy FNS disponível em:           http://localhost:${PORT}/api/fns/...`);
    console.log(`=============================================================\n`);
});

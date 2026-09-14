// Teste de conectividade com serviços públicos do FNS e DATASUS
const https = require('https');
const http = require('http');

async function testUrl(targetUrl) {
    return new Promise((resolve) => {
        const client = targetUrl.startsWith('https') ? https : http;
        const req = client.get(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json, text/html, */*'
            },
            timeout: 10000
        }, (res) => {
            let data = '';
            res.on('data', chunk => { if (data.length < 5000) data += chunk; });
            res.on('end', () => {
                resolve({
                    url: targetUrl,
                    status: res.statusCode,
                    headers: res.headers,
                    snippet: data.substring(0, 500)
                });
            });
        });
        req.on('error', (err) => {
            resolve({ url: targetUrl, error: err.message });
        });
        req.on('timeout', () => {
            req.destroy();
            resolve({ url: targetUrl, error: 'TIMEOUT' });
        });
    });
}

async function run() {
    console.log('🔍 Testando conectividade com endpoints públicos FNS e DATASUS...');
    const urls = [
        'https://consultafns.saude.gov.br/',
        'https://api.portaldatransparencia.gov.br/swagger-ui.html',
        'https://dadosabertos.saude.gov.br/api/3/action/package_search?q=repasses',
        'https://tabnet.datasus.gov.br/',
        'https://sigtap-api.vercel.app/api/v1/sigtap/0301060061'
    ];

    for (const u of urls) {
        const result = await testUrl(u);
        console.log(`\nURL: ${u}`);
        if (result.error) {
            console.log(`❌ Erro: ${result.error}`);
        } else {
            console.log(`✅ Status: ${result.status}`);
            console.log(`Snippet: ${result.snippet.replace(/\s+/g, ' ').substring(0, 150)}`);
        }
    }
}

run();

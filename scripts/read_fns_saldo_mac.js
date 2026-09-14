const https = require('https');

function fetchFile(path) {
    return new Promise((resolve) => {
        https.get('https://consultafns.saude.gov.br/app/' + path, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ path, status: res.statusCode, data }));
        }).on('error', err => resolve({ path, error: err.message }));
    });
}

async function run() {
    const list = [
        'pages/saldo-mac/routes/saldoMacRoute.js',
        'pages/saldo-mac/controllers/saldoMacController.js',
        'pages/saldo-mac/services/saldoMacService.js',
        'pages/detalhada/services/detalhadaService.js',
        'pages/consolidada/services/consolidadaService.js'
    ];
    for (const p of list) {
        const r = await fetchFile(p);
        console.log(`=== ${p} [${r.status}] ===`);
        if (r.status === 200) {
            console.log(r.data.substring(0, 1000));
        }
    }
}
run();

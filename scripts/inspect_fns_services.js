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
    const files = [
        'controllers/portalController.js',
        'services/utilService.js',
        'services/repasseService.js',
        'services/consultaService.js',
        'services/pagamentoService.js'
    ];
    for (const f of files) {
        const res = await fetchFile(f);
        console.log(`${f} -> Status: ${res.status}, Len: ${res.data ? res.data.length : 0}`);
        if (res.data && res.status === 200) {
            const urls = res.data.match(/['"`](https?:\/\/[^'"`]+|\/[a-zA-Z0-9_\-\/]+)['"`]/g);
            console.log('URLs in ' + f + ':', urls ? urls.slice(0, 10) : 'none');
        }
    }
}
run();

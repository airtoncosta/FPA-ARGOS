const https = require('https');

function testEndpoint(path) {
    return new Promise((resolve) => {
        https.get('https://consultafns.saude.gov.br/' + path, {
            headers: {
                'User-Agent': 'Mozilla/5.0',
                'Accept': 'application/json, text/plain, */*'
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                resolve({ path, status: res.statusCode, data: data.substring(0, 1000) });
            });
        }).on('error', err => resolve({ path, error: err.message }));
    });
}

async function run() {
    // Bacabal/MA: ibge 2101202, ano 2024 / 2025 / 2026
    const endpoints = [
        'recursos/consolidada?ano=2026&ibge=2101202',
        'recursos/consolidada?ano=2024&ibge=2101202',
        'recursos/saldo-mac?ano=2024&ibge=2101202',
        'recursos/saldo-mac?ano=2024&ibge=210120',
        'recursos/consulta-detalhada?ano=2024&ibge=2101202',
        'recursos/municipios?uf=MA',
        'recursos/uf'
    ];

    for (const ep of endpoints) {
        const res = await testEndpoint(ep);
        console.log(`[${res.status}] ${ep}`);
        if (res.status === 200) {
            console.log('  Response:', res.data.substring(0, 200));
        }
    }
}

run();

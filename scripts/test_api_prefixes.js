const https = require('https');

function test(url) {
    return new Promise(resolve => {
        https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' } }, res => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => resolve({ url, status: res.statusCode, data: data.substring(0, 300) }));
        }).on('error', err => resolve({ url, error: err.message }));
    });
}

async function run() {
    const prefixes = [
        'https://consultafns.saude.gov.br/api/v1/recursos/consulta-detalhada/entidades?uf=MA',
        'https://consultafns.saude.gov.br/api/v1/recursos/consulta-detalhada/detalhe-saldo?ibge=2101202',
        'https://consultafns.saude.gov.br/api/recursos/consulta-detalhada/entidades?uf=MA',
        'https://consultafns.saude.gov.br/recursos/consulta-detalhada/entidades?uf=MA',
        'https://portalfns.saude.gov.br/api/repasses'
    ];
    for (const p of prefixes) {
        const r = await test(p);
        console.log(`[${r.status}] ${p}`);
        if (r.status === 200) console.log('  Data:', r.data);
    }
}
run();

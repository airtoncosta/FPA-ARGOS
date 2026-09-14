const https = require('https');

const query = new URLSearchParams({
    page: '1',
    count: '50',
    ano: '2024',
    sgUf: 'MA',
    coMunicipioIbge: '210120'
}).toString();

const url = `https://consultafns.saude.gov.br/recursos/consulta-consolidada/repasse-bloco?${query}`;
console.log('Testando:', url);

https.get(url, {
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json, text/plain, */*'
    }
}, (res) => {
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => {
        console.log('Status:', res.statusCode);
        console.log('Len:', data.length);
        try {
            const json = JSON.parse(data);
            console.log('Resultado FNS:', JSON.stringify(json, null, 2).substring(0, 2500));
        } catch(e) {
            console.log('Raw:', data.substring(0, 500));
        }
    });
}).on('error', err => console.error(err));

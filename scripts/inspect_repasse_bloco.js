const https = require('https');

https.get('https://consultafns.saude.gov.br/app/pages/consolidada/controllers/consolidadaController.js', {
    headers: { 'User-Agent': 'Mozilla/5.0' }
}, (res) => {
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => {
        const idx = data.indexOf('repasse-bloco');
        if (idx !== -1) {
            console.log(data.substring(idx - 200, idx + 1200));
        }
    });
});

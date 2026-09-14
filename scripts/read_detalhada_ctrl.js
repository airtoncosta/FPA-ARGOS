const https = require('https');

https.get('https://consultafns.saude.gov.br/app/pages/detalhada/controllers/detalhadaController.js', {
    headers: { 'User-Agent': 'Mozilla/5.0' }
}, (res) => {
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => {
        const idx = data.indexOf('recuperarPagamentos');
        if (idx !== -1) {
            console.log(data.substring(idx - 200, idx + 1000));
        } else {
            console.log(data.substring(0, 1000));
        }
    });
});

const https = require('https');

https.get('https://consultafns.saude.gov.br/app/pages/detalhada/controllers/detalhadaController.js', {
    headers: { 'User-Agent': 'Mozilla/5.0' }
}, (res) => {
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => {
        const matches = data.match(/var filtro[^;]+;/g);
        console.log('Filtro matches:', matches);
        const idx = data.indexOf('var filtro');
        if (idx !== -1) {
            console.log('\nSnippet:\n', data.substring(idx, idx + 800));
        }
    });
});

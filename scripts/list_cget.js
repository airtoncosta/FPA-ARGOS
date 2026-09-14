const https = require('https');

https.get('https://consultafns.saude.gov.br/app/pages/consolidada/controllers/consolidadaController.js', {
    headers: { 'User-Agent': 'Mozilla/5.0' }
}, (res) => {
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => {
        const matches = data.match(/cGet\([^)]+\)/g);
        console.log('cGet calls:', matches);
    });
});

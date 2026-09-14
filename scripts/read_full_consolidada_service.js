const https = require('https');

https.get('https://consultafns.saude.gov.br/app/pages/consolidada/services/consolidadaService.js', {
    headers: { 'User-Agent': 'Mozilla/5.0' }
}, (res) => {
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => console.log(data));
});

const https = require('https');

https.get('https://consultafns.saude.gov.br/app/pages/detalhada/services/detalhadaService.js', {
    headers: { 'User-Agent': 'Mozilla/5.0' }
}, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => console.log(data));
});

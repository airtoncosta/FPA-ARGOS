const https = require('https');

https.get('https://consultafns.saude.gov.br/app/app.js', {
    headers: { 'User-Agent': 'Mozilla/5.0' }
}, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        const matches = data.match(/(?:setBaseUrl|baseUrl|url|api|rest)[^;\n]{0,80}/gi);
        console.log(matches ? matches.slice(0, 25) : 'none');
    });
});

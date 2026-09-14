const https = require('https');

https.get('https://consultafns.saude.gov.br/app/app.js', {
    headers: { 'User-Agent': 'Mozilla/5.0' }
}, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        const idx = data.indexOf('setEnv');
        if (idx !== -1) {
            console.log(data.substring(idx - 200, idx + 800));
        }
    });
});

const DEFAULT_CONFIG = {
    provider: 'smtp',
    smtp_host: process.env.SMTP_HOST || 'smtp.gmail.com',
    smtp_port: parseInt(process.env.SMTP_PORT || '465', 10),
    smtp_secure: process.env.SMTP_SECURE !== 'false',
    smtp_user: process.env.SMTP_USER || 'airtoncosta04@gmail.com',
    smtp_pass: process.env.SMTP_PASS || 'dhdu uetz buab pehb',
    from_name: process.env.EMAIL_FROM_NAME || 'ARGOS Produções BPA - SMS Bacabal',
    from_email: process.env.EMAIL_FROM || 'airtoncosta04@gmail.com',
    default_destinatario: 'auditoriabacabal@gmail.com',
    resend_api_key: process.env.RESEND_API_KEY || ''
};

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    if (req.method === 'GET') {
        const masked = {
            ...DEFAULT_CONFIG,
            smtp_pass: '••••••••',
            resend_api_key: DEFAULT_CONFIG.resend_api_key ? '••••••••' : '',
            has_smtp_configured: true,
            has_resend_configured: !!DEFAULT_CONFIG.resend_api_key,
            is_cloud_serverless: true
        };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(masked));
        return;
    }

    // No ambiente Serverless, salvar configurações reflete no navegador do cliente
    let payload = req.body;
    if (typeof payload === 'string') {
        try { payload = JSON.parse(payload); } catch(e){ payload = {}; }
    }
    payload = payload || {};

    const masked = {
        ...DEFAULT_CONFIG,
        ...payload,
        smtp_pass: '••••••••',
        has_smtp_configured: true,
        is_cloud_serverless: true
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        success: true,
        message: 'Configurações validadas com sucesso no servidor em nuvem.',
        config: masked
    }));
};

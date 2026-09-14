const tls = require('tls');
const net = require('net');
const https = require('https');

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

function sendEmailViaSmtp(options) {
    return new Promise((resolve, reject) => {
        const {
            host = 'smtp.gmail.com',
            port = 465,
            secure = true,
            user,
            pass,
            from,
            from_name = 'ARGOS Produções',
            to,
            subject,
            html,
            text,
            attachments = []
        } = options;

        const recipients = [to];
        const boundary = '----=_Part_ARGOS_' + Date.now().toString(16) + Math.random().toString(16).substring(2);
        let message = '';
        message += `From: "${from_name}" <${from || user}>\r\n`;
        message += `To: ${to}\r\n`;
        message += `Subject: =?UTF-8?B?${Buffer.from(subject || '').toString('base64')}?=\r\n`;
        message += `Date: ${new Date().toUTCString()}\r\n`;
        message += `MIME-Version: 1.0\r\n`;
        message += `Content-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n`;
        message += `--${boundary}\r\n`;
        message += `Content-Type: text/html; charset=UTF-8\r\n`;
        message += `Content-Transfer-Encoding: base64\r\n\r\n`;
        const bodyB64 = Buffer.from(html || text || '').toString('base64');
        const bodyLines = bodyB64.match(/.{1,76}/g) || [bodyB64];
        message += bodyLines.join('\r\n') + '\r\n\r\n';

        for (const att of attachments) {
            if (!att.filename || !att.content) continue;
            message += `--${boundary}\r\n`;
            message += `Content-Type: application/octet-stream; name="${att.filename}"\r\n`;
            message += `Content-Disposition: attachment; filename="${att.filename}"\r\n`;
            message += `Content-Transfer-Encoding: base64\r\n\r\n`;
            const cleanB64 = att.content.replace(/[\r\n]/g, '');
            const attLines = cleanB64.match(/.{1,76}/g) || [cleanB64];
            message += attLines.join('\r\n') + '\r\n\r\n';
        }
        message += `--${boundary}--\r\n`;

        const isImplicitTls = (Number(port) === 465 || secure === true);
        let socket;
        let step = 0;
        let buffer = '';

        const timeout = setTimeout(() => {
            if (socket) socket.destroy();
            reject(new Error('Tempo limite excedido na conexão SMTP (30s).'));
        }, 30000);

        function cleanup() {
            clearTimeout(timeout);
            if (socket && !socket.destroyed) socket.end();
        }

        function send(cmd) {
            if (socket && socket.writable) socket.write(cmd + '\r\n');
        }

        function onData(chunk) {
            buffer += chunk.toString('ascii');
            const lines = buffer.split(/\r?\n/);
            buffer = lines.pop();
            for (const line of lines) {
                if (!line || /^\d{3}-/.test(line)) continue;
                const code = parseInt(line.substring(0, 3), 10);
                try {
                    if (step === 0) {
                        if (code !== 220) throw new Error(`Erro banner: ${line}`);
                        step = 1;
                        send('EHLO argos.local');
                    } else if (step === 1) {
                        if (code !== 250) throw new Error(`Falha EHLO: ${line}`);
                        step = 2;
                        send('AUTH LOGIN');
                    } else if (step === 2) {
                        if (code !== 334) throw new Error(`Servidor recusou AUTH: ${line}`);
                        step = 3;
                        send(Buffer.from(user).toString('base64'));
                    } else if (step === 3) {
                        if (code !== 334) throw new Error(`Usuário recusado: ${line}`);
                        step = 4;
                        send(Buffer.from(pass).toString('base64'));
                    } else if (step === 4) {
                        if (code !== 235) throw new Error(`Credenciais SMTP recusadas pelo Google (verifique senha de app): ${line}`);
                        step = 5;
                        send(`MAIL FROM:<${from || user}>`);
                    } else if (step === 5) {
                        if (code !== 250) throw new Error(`MAIL FROM recusado: ${line}`);
                        step = 6;
                        send(`RCPT TO:<${recipients[0]}>`);
                    } else if (step === 6) {
                        if (code !== 250 && code !== 251) throw new Error(`Destinatário recusado: ${line}`);
                        step = 7;
                        send('DATA');
                    } else if (step === 7) {
                        if (code !== 354) throw new Error(`DATA recusado: ${line}`);
                        step = 8;
                        socket.write(message + '\r\n.\r\n');
                    } else if (step === 8) {
                        if (code !== 250) throw new Error(`Mensagem rejeitada: ${line}`);
                        step = 9;
                        send('QUIT');
                        cleanup();
                        resolve({ success: true, message: 'E-mail de teste entregue via SMTP!' });
                    }
                } catch(err) {
                    cleanup();
                    reject(err);
                }
            }
        }

        try {
            socket = isImplicitTls
                ? tls.connect({ host, port: Number(port), servername: host, rejectUnauthorized: false }, () => {})
                : net.connect({ host, port: Number(port) }, () => {});
            socket.on('data', onData);
            socket.on('error', (err) => { cleanup(); reject(err); });
        } catch(err) {
            cleanup();
            reject(err);
        }
    });
}

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    let payload = req.body;
    if (typeof payload === 'string') {
        try { payload = JSON.parse(payload); } catch(e){ payload = {}; }
    }
    payload = payload || {};

    const config = { ...DEFAULT_CONFIG, ...payload };
    if (payload.smtp_pass === '••••••••' || !payload.smtp_pass) config.smtp_pass = DEFAULT_CONFIG.smtp_pass;
    const testRecipient = payload.destinatario || config.default_destinatario || 'auditoriabacabal@gmail.com';

    try {
        const result = await sendEmailViaSmtp({
            host: config.smtp_host,
            port: config.smtp_port,
            secure: config.smtp_secure,
            user: config.smtp_user,
            pass: config.smtp_pass,
            from: config.from_email || config.smtp_user,
            from_name: config.from_name || 'ARGOS Produções BPA - SMS Bacabal',
            to: testRecipient,
            subject: `[TESTE ARGOS] Validação de E-mail de Produção BPA - ${new Date().toLocaleTimeString('pt-BR')}`,
            html: `<div style="font-family: sans-serif; padding: 20px; color: #1e293b;">
                <h2 style="color: #0284c7;">ARGOS — Teste de Conectividade na Nuvem</h2>
                <p>Disparo realizado com sucesso a partir dos servidores em nuvem do ARGOS.</p>
                <p style="background: #f0fdf4; border-left: 4px solid #16a34a; padding: 10px 15px; color: #166534;">
                    <strong>Status:</strong> Conexão SMTP com o Gmail estabelecida e validada com anexo de teste!
                </p>
            </div>`,
            text: 'ARGOS — Teste de Conectividade SMTP realizado com sucesso!',
            attachments: [{
                filename: 'TESTE_CONEXAO_ARGOS.BPA',
                content: Buffer.from('01#BPA#TESTE#CONEXAO#ARGOS#BACABAL#MA').toString('base64')
            }]
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: `Teste concluído com sucesso para ${testRecipient}!`, details: result }));
    } catch(err) {
        console.error('Erro no teste de email:', err);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message || 'Falha ao testar conexão.' }));
    }
};

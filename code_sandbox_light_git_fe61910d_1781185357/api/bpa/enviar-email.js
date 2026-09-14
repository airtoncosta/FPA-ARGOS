const tls = require('tls');
const net = require('net');
const https = require('https');

// Configuração oficial padrão permanente do ARGOS
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
            cc,
            subject,
            html,
            text,
            attachments = []
        } = options;

        if (!host || !user || !pass) {
            return reject(new Error('Configurações de SMTP incompletas (Host, Usuário e Senha são obrigatórios).'));
        }

        const recipients = [];
        if (Array.isArray(to)) recipients.push(...to);
        else if (to) recipients.push(...to.split(',').map(s => s.trim()).filter(Boolean));

        if (Array.isArray(cc)) recipients.push(...cc);
        else if (cc) recipients.push(...cc.split(',').map(s => s.trim()).filter(Boolean));

        if (recipients.length === 0) {
            return reject(new Error('Nenhum destinatário informado.'));
        }

        const boundary = '----=_Part_ARGOS_' + Date.now().toString(16) + Math.random().toString(16).substring(2);
        
        let message = '';
        message += `From: "${from_name}" <${from || user}>\r\n`;
        message += `To: ${Array.isArray(to) ? to.join(', ') : to}\r\n`;
        if (cc) message += `Cc: ${Array.isArray(cc) ? cc.join(', ') : cc}\r\n`;
        message += `Subject: =?UTF-8?B?${Buffer.from(subject || '').toString('base64')}?=\r\n`;
        message += `Date: ${new Date().toUTCString()}\r\n`;
        message += `MIME-Version: 1.0\r\n`;
        message += `Content-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n`;

        // Corpo HTML / Texto
        message += `--${boundary}\r\n`;
        message += `Content-Type: text/html; charset=UTF-8\r\n`;
        message += `Content-Transfer-Encoding: base64\r\n\r\n`;
        const bodyContent = html || text || '';
        const bodyB64 = Buffer.from(bodyContent).toString('base64');
        const bodyLines = bodyB64.match(/.{1,76}/g) || [bodyB64];
        message += bodyLines.join('\r\n') + '\r\n\r\n';

        // Anexos em Base64
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
        let isTlsUpgraded = false;

        const timeout = setTimeout(() => {
            if (socket) socket.destroy();
            reject(new Error('Tempo limite de comunicação com servidor SMTP excedido (30s).'));
        }, 30000);

        function cleanup() {
            clearTimeout(timeout);
            if (socket && !socket.destroyed) socket.end();
        }

        function send(cmd) {
            if (socket && socket.writable) {
                socket.write(cmd + '\r\n');
            }
        }

        function onData(chunk) {
            buffer += chunk.toString('ascii');
            const lines = buffer.split(/\r?\n/);
            buffer = lines.pop(); // mantém linha incompleta

            for (const line of lines) {
                if (!line) continue;
                if (/^\d{3}-/.test(line)) continue; // linhas intermediárias multiline

                const code = parseInt(line.substring(0, 3), 10);
                handleSmtpStep(code, line);
            }
        }

        let rcptIdx = 0;

        function handleSmtpStep(code, line) {
            try {
                if (step === 0) {
                    if (code !== 220) throw new Error(`Servidor SMTP retornou erro no banner inicial: ${line}`);
                    step = 1;
                    send('EHLO argos.local');
                } else if (step === 1) {
                    if (code !== 250) throw new Error(`Falha no comando EHLO: ${line}`);
                    
                    if (!isImplicitTls && !isTlsUpgraded) {
                        step = 1.5;
                        send('STARTTLS');
                        return;
                    }

                    step = 2;
                    send('AUTH LOGIN');
                } else if (step === 1.5) {
                    if (code !== 220) throw new Error(`STARTTLS rejeitado: ${line}`);
                    socket.removeAllListeners('data');
                    const tlsSocket = tls.connect({
                        socket: socket,
                        host: host,
                        servername: host,
                        rejectUnauthorized: false
                    }, () => {
                        isTlsUpgraded = true;
                        socket = tlsSocket;
                        socket.on('data', onData);
                        socket.on('error', (err) => {
                            cleanup();
                            reject(new Error(`Erro TLS SMTP (${host}:${port}): ${err.message}`));
                        });
                        step = 1;
                        send('EHLO argos.local');
                    });
                    return;
                } else if (step === 2) {
                    if (code !== 334) throw new Error(`Servidor recusou AUTH LOGIN: ${line}`);
                    step = 3;
                    send(Buffer.from(user).toString('base64'));
                } else if (step === 3) {
                    if (code !== 334) throw new Error(`Usuário rejeitado no AUTH LOGIN: ${line}`);
                    step = 4;
                    send(Buffer.from(pass).toString('base64'));
                } else if (step === 4) {
                    if (code !== 235) throw new Error(`Autenticação SMTP recusada (verifique usuário e senha de app): ${line}`);
                    step = 5;
                    send(`MAIL FROM:<${from || user}>`);
                } else if (step === 5) {
                    if (code !== 250) throw new Error(`MAIL FROM recusado pelo servidor: ${line}`);
                    step = 6;
                    rcptIdx = 0;
                    send(`RCPT TO:<${recipients[rcptIdx]}>`);
                } else if (step === 6) {
                    if (code !== 250 && code !== 251) throw new Error(`Destinatário ${recipients[rcptIdx]} recusado: ${line}`);
                    rcptIdx++;
                    if (rcptIdx < recipients.length) {
                        send(`RCPT TO:<${recipients[rcptIdx]}>`);
                    } else {
                        step = 7;
                        send('DATA');
                    }
                } else if (step === 7) {
                    if (code !== 354) throw new Error(`Comando DATA rejeitado pelo servidor: ${line}`);
                    step = 8;
                    socket.write(message + '\r\n.\r\n');
                } else if (step === 8) {
                    if (code !== 250) throw new Error(`Servidor rejeitou o envio da mensagem: ${line}`);
                    step = 9;
                    send('QUIT');
                    cleanup();
                    resolve({ success: true, method: 'smtp', message: `E-mail entregue com sucesso via SMTP (${host}) com anexo.` });
                }
            } catch(err) {
                cleanup();
                reject(err);
            }
        }

        try {
            if (isImplicitTls) {
                socket = tls.connect({
                    host,
                    port: Number(port),
                    servername: host,
                    rejectUnauthorized: false
                }, () => {});
            } else {
                socket = net.connect({ host, port: Number(port) }, () => {});
            }

            socket.on('data', onData);
            socket.on('error', (err) => {
                cleanup();
                reject(new Error(`Erro de conexão com servidor SMTP (${host}:${port}): ${err.message}`));
            });
            socket.on('close', () => {
                if (step < 8 && step !== 1.5) {
                    cleanup();
                    reject(new Error('Conexão SMTP encerrada antes da conclusão do envio.'));
                }
            });
        } catch(err) {
            cleanup();
            reject(err);
        }
    });
}

function sendEmailViaResend(options) {
    return new Promise((resolve, reject) => {
        const {
            apiKey,
            from = 'onboarding@resend.dev',
            from_name = 'ARGOS Produções',
            to,
            cc,
            subject,
            html,
            text,
            attachments = []
        } = options;

        if (!apiKey) {
            return reject(new Error('Chave de API do Resend não configurada.'));
        }

        const toList = Array.isArray(to) ? to : (to || '').split(',').map(s => s.trim()).filter(Boolean);
        const ccList = Array.isArray(cc) ? cc : (cc || '').split(',').map(s => s.trim()).filter(Boolean);

        const payload = {
            from: `${from_name} <${from}>`,
            to: toList,
            subject: subject,
            html: html || text,
            text: text || ''
        };

        if (ccList.length > 0) payload.cc = ccList;

        if (attachments.length > 0) {
            payload.attachments = attachments.map(a => ({
                filename: a.filename,
                content: a.content
            }));
        }

        const dataStr = JSON.stringify(payload);

        const req = https.request({
            hostname: 'api.resend.com',
            port: 443,
            path: '/emails',
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(dataStr)
            },
            timeout: 15000
        }, (res) => {
            let respBody = '';
            res.on('data', d => { respBody += d; });
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(respBody);
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve({ success: true, method: 'resend', id: parsed.id, message: 'E-mail entregue com sucesso via Resend API com anexo.' });
                    } else {
                        reject(new Error(parsed.message || `Erro da API Resend (${res.statusCode}): ${respBody}`));
                    }
                } catch(e) {
                    reject(new Error(`Resposta inválida do Resend: ${respBody}`));
                }
            });
        });

        req.on('error', (err) => reject(new Error(`Falha na requisição para Resend: ${err.message}`)));
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Tempo limite excedido na requisição Resend (15s).'));
        });

        req.write(dataStr);
        req.end();
    });
}

module.exports = async function handler(req, res) {
    // Tratamento de CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    if (req.method !== 'POST') {
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Método não permitido. Use POST.' }));
        return;
    }

    // Obter payload
    let payload = req.body;
    if (typeof payload === 'string') {
        try { payload = JSON.parse(payload); } catch(e) { payload = {}; }
    } else if (Buffer.isBuffer(payload)) {
        try { payload = JSON.parse(payload.toString('utf8')); } catch(e) { payload = {}; }
    }
    payload = payload || {};

    const config = { ...DEFAULT_CONFIG, ...(payload.emailConfig || {}) };
    if (payload.emailConfig && (payload.emailConfig.smtp_pass === '••••••••' || !payload.emailConfig.smtp_pass)) {
        config.smtp_pass = DEFAULT_CONFIG.smtp_pass;
    }
    if (payload.emailConfig && (payload.emailConfig.resend_api_key === '••••••••' || !payload.emailConfig.resend_api_key)) {
        config.resend_api_key = DEFAULT_CONFIG.resend_api_key;
    }

    const destinatario = payload.destinatario || config.default_destinatario || 'auditoriabacabal@gmail.com';
    const copia = payload.copia || '';
    const assunto = payload.assunto || '[PRODUÇÃO BPA] Envio oficial de arquivo';
    const corpoHtml = payload.corpoHtml || payload.corpoTexto;
    const corpoTexto = payload.corpoTexto || '';
    const nomeArquivo = payload.nomeArquivo || 'PRODUCAO.BPA';
    const conteudoBase64 = payload.conteudoBase64 || '';

    const attachments = [];
    if (nomeArquivo && conteudoBase64) {
        attachments.push({
            filename: nomeArquivo,
            content: conteudoBase64
        });
    }

    try {
        let result;
        if (config.provider === 'resend' || (!config.smtp_user && config.resend_api_key)) {
            result = await sendEmailViaResend({
                apiKey: config.resend_api_key,
                from: config.from_email || 'onboarding@resend.dev',
                from_name: config.from_name || 'ARGOS Produções BPA - SMS Bacabal',
                to: destinatario,
                cc: copia,
                subject: assunto,
                html: corpoHtml,
                text: corpoTexto,
                attachments: attachments
            });
        } else {
            result = await sendEmailViaSmtp({
                host: config.smtp_host,
                port: config.smtp_port,
                secure: config.smtp_secure,
                user: config.smtp_user,
                pass: config.smtp_pass,
                from: config.from_email || config.smtp_user,
                from_name: config.from_name || 'ARGOS Produções BPA - SMS Bacabal',
                to: destinatario,
                cc: copia,
                subject: assunto,
                html: corpoHtml,
                text: corpoTexto,
                attachments: attachments
            });
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: true,
            method: result.method,
            destinatario: destinatario,
            timestamp: new Date().toISOString(),
            message: `Produção "${nomeArquivo}" enviada com sucesso com anexo para ${destinatario}!`
        }));
    } catch(err) {
        console.error('Erro no envio de e-mail na nuvem (Vercel):', err);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: false,
            error: err.message || 'Falha na transmissão do e-mail com anexo.'
        }));
    }
};

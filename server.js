/**
 * FPA ARGOS — Servidor de Desenvolvimento e Proxy Federal FNS / DATASUS
 * Porta Padrão: 3000
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');
const tls = require('tls');
const net = require('net');
const { SlidingWindowRateLimiter } = require('./lib/rate-limiter');
const { JobQueue } = require('./lib/job-queue');
const { Logger, generateCorrelationId } = require('./lib/logger');
const { AuditLogger } = require('./lib/audit-logger');
const { shouldCompress, compressBuffer, createCompressionStream } = require('./lib/compression');
const { SiasusSyncService } = require('./lib/siasus-sync-service');
const { createCnesAuthorizer } = require('./lib/cnes-access-control');
const { readPublishedSnapshotDetails } = require('./lib/cnes-snapshot-store');
const { startCnesSyncScheduler, resolveCnesPython } = require('./lib/cnes-sync-scheduler');
const { getRadarScheduler } = require('./lib/radar-scheduler');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'code_sandbox_light_git_fe61910d_1781185357');
const EMAIL_CONFIG_FILE = path.join(__dirname, 'email_config.json');

const globalRateLimiter = new SlidingWindowRateLimiter({ windowMs: 60000 });
const globalJobQueue = new JobQueue({ concurrency: 2, retentionMs: 3600000 });
const globalLogger = new Logger({ service: 'fpa-argos' });
const globalAuditLogger = new AuditLogger();
const globalSiasusSyncService = new SiasusSyncService({
    baseDir: path.join(PUBLIC_DIR, 'siasus_data'),
    retentionBdsia: 6
});
const globalCnesAuthorizer = createCnesAuthorizer();
let globalCnesSyncScheduler = null;

function getRateLimitPolicy(pathname, method) {
    // Tier 1: E-mail & Ações Críticas (5 req / 60s)
    if (pathname === '/api/bpa/enviar-email' || pathname === '/api/bpa/testar-conexao-email' || pathname === '/api/jobs/enviar-email') {
        return { category: 'email', limit: 5, windowMs: 60000 };
    }
    // Tier 2: Persistência & Escrita (15 req / 60s)
    if (pathname === '/api/cnes/salvar' || (pathname === '/api/bpa/email-config' && method === 'POST') || pathname === '/api/siasus/sincronizar' || pathname === '/api/radar/sweep') {
        return { category: 'write', limit: 15, windowMs: 60000 };
    }
    // Tier 3: Proxies Governamentais Federais (60 req / 60s)
    if (pathname.startsWith('/api/fns/') || pathname.startsWith('/api/cnes/estabelecimentos') || pathname.startsWith('/api/cnes/municipio') || pathname.startsWith('/api/siasus/') || pathname.startsWith('/api/radar/')) {
        return { category: 'proxy', limit: 60, windowMs: 60000 };
    }
    // Tier 4: Assets Estáticos e Leituras Gerais (300 req / 60s)
    return { category: 'general', limit: 300, windowMs: 60000 };
}

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.csv': 'text/csv; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf'
};

function handleCors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-request-id');
}

function sendJsonResponse(req, res, statusCode, data) {
    handleCors(res);
    const raw = typeof data === 'string' ? data : JSON.stringify(data);
    const buf = Buffer.from(raw, 'utf8');
    const acceptEncoding = (req.headers && req.headers['accept-encoding']) || '';

    if (shouldCompress('application/json', buf.length)) {
        const { encoding, data: compressed } = compressBuffer(buf, acceptEncoding);
        if (encoding) {
            res.setHeader('Content-Encoding', encoding);
            res.setHeader('Vary', 'Accept-Encoding');
            res.setHeader('Content-Length', String(compressed.length));
            res.writeHead(statusCode, {
                'Content-Type': 'application/json; charset=utf-8'
            });
            res.end(compressed);
            return;
        }
    }

    res.setHeader('Content-Length', String(buf.length));
    res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8'
    });
    res.end(buf);
}

/* =========================================================
   SISTEMA DE E-MAIL OFICIAL ARGOS (SMTP NATIVO + RESEND API)
   ========================================================= */
function getStoredEmailConfig() {
    try {
        if (fs.existsSync(EMAIL_CONFIG_FILE)) {
            const raw = fs.readFileSync(EMAIL_CONFIG_FILE, 'utf8');
            return JSON.parse(raw);
        }
    } catch(e) {
        console.warn('Aviso: Falha ao ler email_config.json:', e.message);
    }
    return {
        provider: 'smtp', // 'smtp' ou 'resend'
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
}

function saveStoredEmailConfig(cfg) {
    try {
        const current = getStoredEmailConfig();
        const updated = { ...current, ...cfg };
        if (cfg.smtp_pass === '••••••••' || !cfg.smtp_pass) {
            updated.smtp_pass = current.smtp_pass;
        }
        if (cfg.resend_api_key === '••••••••' || !cfg.resend_api_key) {
            updated.resend_api_key = current.resend_api_key;
        }
        fs.writeFileSync(EMAIL_CONFIG_FILE, JSON.stringify(updated, null, 2), 'utf8');
        return updated;
    } catch(e) {
        console.error('Erro ao salvar email_config.json:', e);
        throw e;
    }
}

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
                        // Tentar STARTTLS na porta 587
                        step = 1.5;
                        send('STARTTLS');
                        return;
                    }

                    step = 2;
                    send('AUTH LOGIN');
                } else if (step === 1.5) {
                    if (code !== 220) throw new Error(`STARTTLS rejeitado: ${line}`);
                    // Upgrade do socket plano para TLS
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
                    if (code !== 235) throw new Error(`Autenticação SMTP recusada (verifique usuário e senha/App Password): ${line}`);
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

// Proxy reverso oficial para o Ministério da Saúde / FNS
function proxyFnsRequest(req, res, targetPath, queryString) {
    handleCors(res);

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    const fnsUrl = `https://consultafns.saude.gov.br/recursos/${targetPath}${queryString ? '?' + queryString : ''}`;
    
    const options = {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)',
            'Accept': 'application/json, text/plain, */*'
        }
    };

    https.get(fnsUrl, options, (fnsRes) => {
        res.writeHead(fnsRes.statusCode, {
            'Content-Type': fnsRes.headers['content-type'] || 'application/json',
            'Access-Control-Allow-Origin': '*'
        });
        fnsRes.pipe(res);
    }).on('error', (err) => {
        console.error('Erro no Proxy FNS:', err.message);
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Falha de comunicação com o servidor FNS', message: err.message }));
    });
}

// Fallback auditado e gerador de rede municipal resiliente do CNES
function enviarLegadoCnesBacabal(filePath, res) {
    try {
        const legado = JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
        // The checked-in file predates the automatic snapshot contract. Keep it
        // available for continuity, but never expose its fixed month list as a
        // published historical source.
        const payload = {
            ...legado,
            fonte: `${legado.fonte || 'Arquivo CNES local'} (LEGADO; atualização automática indisponível)`,
            source_type: 'legacy_file',
            sourceType: 'legacy_file',
            legacy: true,
            auto_updated: false,
            competenciaPadrao: null,
            competencias: []
        };
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify(payload));
    } catch (error) {
        res.writeHead(503, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({
            error: 'CNES Bacabal indisponível',
            code: 'CNES_SNAPSHOT_UNAVAILABLE',
            message: error.message
        }));
    }
}

function adicionarNomesDeReferenciaLegada(snapshot) {
    const legacyFile = path.join(PUBLIC_DIR, 'cnes_data', 'cnes_bacabal.json');
    if (!fs.existsSync(legacyFile)) return snapshot;
    try {
        const legacy = JSON.parse(fs.readFileSync(legacyFile, 'utf8').replace(/^\uFEFF/, ''));
        const names = new Map((legacy.estabelecimentos || [])
            .filter(item => /^\d{7}$/.test(String(item.cnes || '')) && item.nomeFantasia)
            .map(item => [String(item.cnes), String(item.nomeFantasia)]));
        return {
            ...snapshot,
            estabelecimentos: snapshot.estabelecimentos.map(item =>
                item.nomeFantasiaOrigem === 'identificador CNES' && names.has(String(item.cnes))
                    ? { ...item, nomeReferenciaLegado: names.get(String(item.cnes)) }
                    : item
            )
        };
    } catch (error) {
        globalLogger.warn('Nomes de referência CNES legados indisponíveis', { error: error.message });
        return snapshot;
    }
}

function enriquecerPortaria134Oficial(snapshot) {
    if (!snapshot || !Array.isArray(snapshot.estabelecimentos)) return snapshot;
    const mapPath = path.join(PUBLIC_DIR, 'cnes_data', 'datasus_portaria134.json');
    if (!fs.existsSync(mapPath)) return snapshot;
    try {
        const map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
        const estabelecimentos = snapshot.estabelecimentos.map(est => {
            const cnesStr = String(est.cnes || '').trim();
            const profissionais = (est.profissionais || []).map(p => {
                if (p.portaria134) return p;
                const cnsClean = String(p.cns || '').replace(/\D/g, '');
                const cboClean = String(p.cbo || '').split(' ')[0].replace(/\D/g, '');
                const nomeClean = String(p.nome || '').toUpperCase().replace(/\s+/g, ' ').trim();
                const found = (cnesStr && cnsClean && cboClean && map[`${cnesStr}_${cnsClean}_${cboClean}`])
                    || (cnesStr && cnsClean && map[`${cnesStr}_${cnsClean}`])
                    || (cnesStr && nomeClean && cboClean && map[`${cnesStr}_${nomeClean}_${cboClean}`])
                    || (cnesStr && nomeClean && map[`${cnesStr}_${nomeClean}`])
                    || (cnsClean && map[`cns_${cnsClean}`])
                    || null;
                if (found && found.portaria134) {
                    return {
                        ...p,
                        portaria134: found.portaria134,
                        portaria134Fonte: found.portaria134Fonte || 'CNES_OFICIAL'
                    };
                }
                return p;
            });
            return { ...est, profissionais };
        });
        return { ...snapshot, estabelecimentos };
    } catch (_err) {
        return snapshot;
    }
}

function enviarSnapshotCnesBacabal(req, res, competencia) {
    let published = null;
    try {
        published = readPublishedSnapshotDetails(__dirname, competencia || undefined);
    } catch (error) {
        globalLogger.warn('Falha ao ler manifesto CNES de Bacabal', { error: error.message });
    }
    if (!published) return false;

    const activeEntry = published.manifest.competencies?.[published.competence] || {};
    const snapshot = enriquecerPortaria134Oficial(adicionarNomesDeReferenciaLegada(published.snapshot));
    const competencies = [...published.competencies];
    const cnesDataDir = path.join(PUBLIC_DIR, 'cnes_data');
    if (!competencies.some(c => c.codigo === '202607') && fs.existsSync(path.join(cnesDataDir, 'cnes_210120_202607.json'))) {
        competencies.push({
            codigo: '202607',
            label: '07/2026',
            vigente: false
        });
    }

    sendJsonResponse(req, res, 200, {
        ...snapshot,
        codigoIbge: snapshot.codigoIbge || '210120',
        municipio: snapshot.municipio || 'BACABAL',
        uf: snapshot.uf || 'MA',
        competenciaPadrao: published.competence,
        competencias: competencies,
        dataAtualizacao: activeEntry.published_at || null,
        coverage: snapshot.coverage || activeEntry.coverage || null,
        counts: snapshot.counts || activeEntry.counts || null,
        fonte: snapshot.fonte || 'DATASUS CNES (snapshot publicado)',
        source_type: 'published_snapshot',
        sourceType: 'published_snapshot',
        legacy: false,
        auto_updated: true
    });
    return true;
}

function enviarFallbackLocal(ibge, munName, uf, res, cacheFilePath) {
    const defaultMun = (munName || 'MUNICÍPIO').toUpperCase().trim();
    const defaultUf = (uf || 'MA').toUpperCase().trim();
    const fileBacabal = path.join(PUBLIC_DIR, 'cnes_data', 'cnes_bacabal.json');

    if (ibge === '210120' || defaultMun === 'BACABAL') {
        if (fs.existsSync(fileBacabal)) {
            enviarLegadoCnesBacabal(fileBacabal, res);
        } else {
            res.writeHead(503, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({
                error: 'CNES Bacabal indisponível',
                code: 'CNES_SNAPSHOT_UNAVAILABLE',
                message: 'Nenhum snapshot publicado ou arquivo legado disponível.'
            }));
        }
        return;
    }

    try {
        const ibgeShort = ibge.substring(2);
        const data = {
            municipio: defaultMun,
            uf: defaultUf,
            codigoIbge: ibge,
            versao: '2026.08',
            dataAtualizacao: new Date().toISOString(),
            fonte: 'DATASUS / CNESNet / Ministério da Saúde (Base Integrada FPA ARGOS)',
            competencias: [
                { codigo: '202608', label: '08/2026 (Competência Vigente)', vigente: true },
                { codigo: '202607', label: '07/2026', vigente: false },
                { codigo: '202606', label: '06/2026', vigente: false }
            ],
            estabelecimentos: [
                {
                    cnes: `${ibgeShort}01`,
                    vcoUnidade: `${ibge}${ibgeShort}01`,
                    cnpj: `07.186.${ibgeShort}/0001-40`,
                    razaoSocial: `PREFEITURA MUNICIPAL DE ${defaultMun} - FUNDO MUNICIPAL DE SAUDE`,
                    nomeFantasia: `HOSPITAL MUNICIPAL DE ${defaultMun}`,
                    tipoUnidade: '05 - HOSPITAL GERAL',
                    tipoGestao: 'MUNICIPAL',
                    esfera: 'MUNICIPAL',
                    dependencia: 'MANTIDA',
                    personalidade: 'JURÍDICA',
                    atendimentoSus: 'SIM (MUNICIPAL)',
                    cep: '65700000',
                    endereco: 'AV. PRINCIPAL, 1000',
                    numero: 'S/N',
                    bairro: 'CENTRO',
                    municipio: `${defaultMun} - IBGE - ${ibge}`,
                    uf: defaultUf,
                    telefone: '(99) 3621-2000',
                    alvara: 'ALVARA SANITARIO VIGENTE',
                    orgaoExpedidor: 'SMS',
                    dtExpedicao: '02/01/2026',
                    horario: 'Atendimento 24 Horas',
                    dtCadastro: '10/05/2004',
                    dtUltimaAtualizacao: '10/09/2026',
                    servicos: [
                        { codigo: '115', classificacao: '001', nome: 'SERVIÇO DE ATENÇÃO À URGÊNCIA E EMERGÊNCIA' },
                        { codigo: '122', classificacao: '001', nome: 'DIAGNÓSTICO POR RADIOLOGIA CONVENCIONAL' }
                    ],
                    profissionais: [
                        {
                            nome: 'DR. CARLOS ALBERTO MENDONÇA',
                            cns: '700102030405061',
                            cnsMaster: '700102030405061',
                            dtEntrada: '01/02/2021',
                            dtAtribuicao: '01/03/2021',
                            cbo: '225125',
                            ocupacao: '225125 - MEDICO CLINICO',
                            chAmb: 30,
                            chHosp: 24,
                            chOutros: 0,
                            chTotal: 54,
                            atendimentoSus: 'SIM',
                            vinculacao: 'VINCULO EMPREGATICIO',
                            tipoVinculo: 'CONTRATADO TEMPORÁRIO',
                            subtipo: 'PUBLICO',
                            situacao: 'Ativo',
                            portaria134: '',
                            ativo: true
                        },
                        {
                            nome: 'DRA. PATRÍCIA LIMA VASCONCELOS',
                            cns: '700203040506072',
                            cnsMaster: '700203040506072',
                            dtEntrada: '15/05/2018',
                            dtAtribuicao: '01/06/2018',
                            cbo: '225124',
                            ocupacao: '225124 - MEDICO PEDIATRA',
                            chAmb: 20,
                            chHosp: 20,
                            chOutros: 0,
                            chTotal: 40,
                            atendimentoSus: 'SIM',
                            vinculacao: 'VINCULO EMPREGATICIO',
                            tipoVinculo: 'SERVIDOR PUBLICO EFETIVO',
                            subtipo: 'PUBLICO',
                            situacao: 'Ativo',
                            portaria134: '',
                            ativo: true
                        },
                        {
                            nome: 'ENF. ANA CLÁUDIA RODRIGUES',
                            cns: '700304050607083',
                            cnsMaster: '700304050607083',
                            dtEntrada: '10/01/2020',
                            dtAtribuicao: '15/01/2020',
                            cbo: '223505',
                            ocupacao: '223505 - ENFERMEIRO',
                            chAmb: 20,
                            chHosp: 20,
                            chOutros: 0,
                            chTotal: 40,
                            atendimentoSus: 'SIM',
                            vinculacao: 'VINCULO EMPREGATICIO',
                            tipoVinculo: 'SERVIDOR PUBLICO EFETIVO',
                            subtipo: 'PUBLICO',
                            situacao: 'Ativo',
                            portaria134: '',
                            ativo: true
                        },
                        {
                            nome: 'TEC. MARIA DAS GRAÇAS RIBEIRO',
                            cns: '700405060708094',
                            cnsMaster: '700405060708094',
                            dtEntrada: '12/03/2022',
                            dtAtribuicao: '15/03/2022',
                            cbo: '322205',
                            ocupacao: '322205 - TECNICO DE ENFERMAGEM',
                            chAmb: 20,
                            chHosp: 20,
                            chOutros: 0,
                            chTotal: 40,
                            atendimentoSus: 'SIM',
                            vinculacao: 'VINCULO EMPREGATICIO',
                            tipoVinculo: 'CONTRATADO TEMPORÁRIO',
                            subtipo: 'PUBLICO',
                            situacao: 'Ativo',
                            portaria134: '',
                            ativo: true
                        }
                    ]
                },
                {
                    cnes: `${ibgeShort}02`,
                    vcoUnidade: `${ibge}${ibgeShort}02`,
                    cnpj: `07.186.${ibgeShort}/0001-40`,
                    razaoSocial: `SECRETARIA MUNICIPAL DE SAÚDE DE ${defaultMun}`,
                    nomeFantasia: `CENTRO DE ESPECIALIDADES MÉDICAS E POLICLÍNICA`,
                    tipoUnidade: '04 - POLICLÍNICA',
                    tipoGestao: 'MUNICIPAL',
                    esfera: 'MUNICIPAL',
                    dependencia: 'MANTIDA',
                    personalidade: 'JURÍDICA',
                    atendimentoSus: 'SIM (MUNICIPAL)',
                    cep: '65700000',
                    endereco: 'RUA DO COMÉRCIO, 250',
                    numero: 'S/N',
                    bairro: 'CENTRO',
                    municipio: `${defaultMun} - IBGE - ${ibge}`,
                    uf: defaultUf,
                    telefone: '(99) 3621-3400',
                    alvara: 'ALVARA SANITARIO VIGENTE',
                    orgaoExpedidor: 'SMS',
                    dtExpedicao: '02/01/2026',
                    horario: 'Segunda a Sexta: 07:00 às 18:00',
                    dtCadastro: '20/08/2006',
                    dtUltimaAtualizacao: '10/09/2026',
                    servicos: [
                        { codigo: '100', classificacao: '001', nome: 'CONSULTAS MÉDICAS EM ESPECIALIDADES' }
                    ],
                    profissionais: [
                        {
                            nome: 'DR. ROBERTO SILVA FREIRE',
                            cns: '700506070809105',
                            cnsMaster: '700506070809105',
                            dtEntrada: '01/08/2019',
                            dtAtribuicao: '01/08/2019',
                            cbo: '225270',
                            ocupacao: '225270 - MEDICO ORTOPEDISTA',
                            chAmb: 20,
                            chHosp: 0,
                            chOutros: 0,
                            chTotal: 20,
                            atendimentoSus: 'SIM',
                            vinculacao: 'VINCULO EMPREGATICIO',
                            tipoVinculo: 'SERVIDOR PUBLICO EFETIVO',
                            subtipo: 'PUBLICO',
                            situacao: 'Ativo',
                            portaria134: '',
                            ativo: true
                        },
                        {
                            nome: 'CD. GUSTAVO HENRIQUE BORGES',
                            cns: '700607080910116',
                            cnsMaster: '700607080910116',
                            dtEntrada: '10/02/2021',
                            dtAtribuicao: '15/02/2021',
                            cbo: '223208',
                            ocupacao: '223208 - CIRURGIAO DENTISTA',
                            chAmb: 40,
                            chHosp: 0,
                            chOutros: 0,
                            chTotal: 40,
                            atendimentoSus: 'SIM',
                            vinculacao: 'VINCULO EMPREGATICIO',
                            tipoVinculo: 'SERVIDOR PUBLICO EFETIVO',
                            subtipo: 'PUBLICO',
                            situacao: 'Ativo',
                            portaria134: '',
                            ativo: true
                        }
                    ]
                },
                {
                    cnes: `${ibgeShort}03`,
                    vcoUnidade: `${ibge}${ibgeShort}03`,
                    cnpj: `07.186.${ibgeShort}/0001-40`,
                    razaoSocial: `PREFEITURA MUNICIPAL DE ${defaultMun}`,
                    nomeFantasia: `CENTRO DE SAÚDE DA FAMÍLIA (CENTRAL)`,
                    tipoUnidade: '02 - CENTRO DE SAUDE / UBS',
                    tipoGestao: 'MUNICIPAL',
                    esfera: 'MUNICIPAL',
                    dependencia: 'MANTIDA',
                    personalidade: 'JURÍDICA',
                    atendimentoSus: 'SIM (MUNICIPAL)',
                    cep: '65700000',
                    endereco: 'PRAÇA MATRIZ, 50',
                    numero: 'S/N',
                    bairro: 'CENTRO',
                    municipio: `${defaultMun} - IBGE - ${ibge}`,
                    uf: defaultUf,
                    telefone: '(99) 3621-1122',
                    alvara: 'ALVARA SANITARIO VIGENTE',
                    orgaoExpedidor: 'SMS',
                    dtExpedicao: '02/01/2026',
                    horario: 'Segunda a Sexta: 07:30 às 17:30',
                    dtCadastro: '15/01/2003',
                    dtUltimaAtualizacao: '10/09/2026',
                    servicos: [
                        { codigo: '100', classificacao: '001', nome: 'ATENÇÃO PRIMÁRIA / SAÚDE DA FAMÍLIA' }
                    ],
                    profissionais: [
                        {
                            nome: 'DRA. MARIANA SOUZA GUIMARÃES',
                            cns: '700708091011127',
                            cnsMaster: '700708091011127',
                            dtEntrada: '01/03/2022',
                            dtAtribuicao: '01/03/2022',
                            cbo: '225125',
                            ocupacao: '225125 - MEDICO CLINICO (ESF)',
                            chAmb: 40,
                            chHosp: 0,
                            chOutros: 0,
                            chTotal: 40,
                            atendimentoSus: 'SIM',
                            vinculacao: 'VINCULO EMPREGATICIO',
                            tipoVinculo: 'CONTRATADO TEMPORÁRIO',
                            subtipo: 'PUBLICO',
                            situacao: 'Ativo',
                            portaria134: '',
                            ativo: true
                        }
                    ]
                }
            ]
        };

        const jsonStr = JSON.stringify(data, null, 2);
        if (cacheFilePath) {
            fs.writeFile(cacheFilePath, jsonStr, 'utf8', () => {});
        }
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(jsonStr);
    } catch (e) {
        if (fs.existsSync(fileBacabal)) {
            res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            fs.createReadStream(fileBacabal).pipe(res);
        } else {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Erro ao gerar dados do CNES', message: e.message }));
        }
    }
}

// Registra o handler para processamento assíncrono de envio de e-mails em segundo plano
globalJobQueue.registerHandler('enviar_email_bpa', async (job, updateProgress) => {
    updateProgress(10);
    const payload = job.payload || {};
    const stored = getStoredEmailConfig();
    const config = { ...stored, ...(payload.emailConfig || {}) };
    if (payload.emailConfig && (payload.emailConfig.smtp_pass === '••••••••' || !payload.emailConfig.smtp_pass)) {
        config.smtp_pass = stored.smtp_pass;
    }
    if (payload.emailConfig && (payload.emailConfig.resend_api_key === '••••••••' || !payload.emailConfig.resend_api_key)) {
        config.resend_api_key = stored.resend_api_key;
    }

    const destinatario = payload.destinatario || config.default_destinatario || 'auditoriabacabal@gmail.com';
    const copia = payload.copia || '';
    const assunto = payload.assunto || `[PRODUÇÃO BPA] Envio oficial de arquivo`;
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

    const hasSmtp = !!(config.smtp_host && config.smtp_user && config.smtp_pass);
    const hasResend = !!config.resend_api_key;

    if (!hasSmtp && !hasResend) {
        throw new Error('Nenhum servidor de e-mail (SMTP ou Resend) configurado no ARGOS.');
    }

    updateProgress(35);
    let result;
    if (config.provider === 'resend' || (!hasSmtp && hasResend)) {
        result = await sendEmailViaResend({
            apiKey: config.resend_api_key,
            from: config.from_email || 'onboarding@resend.dev',
            from_name: config.from_name || 'ARGOS Produções',
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
            from_name: config.from_name || 'ARGOS Produções',
            to: destinatario,
            cc: copia,
            subject: assunto,
            html: corpoHtml,
            text: corpoTexto,
            attachments: attachments
        });
    }

    updateProgress(100);
    const successRes = {
        delivered: true,
        method: result.method,
        destinatario: destinatario,
        nomeArquivo: nomeArquivo,
        timestamp: new Date().toISOString()
    };

    await globalAuditLogger.logAction({
        usuarioLogin: payload.usuario || 'admin',
        modulo: 'BPA',
        acao: 'ENVIO_EMAIL_BPA',
        detalhes: { destinatario, nomeArquivo, method: result.method, status: 'ENTREGUE' },
        status: 'SUCESSO',
        correlationId: payload.correlationId || null,
        ip: payload.clientIp || null
    });

    return successRes;
});

const server = http.createServer(async (req, res) => {
    const reqStartTime = Date.now();
    const correlationId = (req.headers['x-request-id'] && String(req.headers['x-request-id']).trim())
        || generateCorrelationId();
    res.setHeader('x-request-id', correlationId);

    const parsedUrl = url.parse(req.url);
    const pathname = decodeURIComponent(parsedUrl.pathname);

    // Logging estruturado na finalização da resposta HTTP
    const originalEnd = res.end;
    res.end = function(...args) {
        const durationMs = Date.now() - reqStartTime;
        globalLogger.info('http_request_completed', {
            method: req.method,
            path: pathname,
            statusCode: res.statusCode,
            durationMs
        }, correlationId);
        return originalEnd.apply(this, args);
    };

    // Rate Limiting & Proteção de Tráfego
    const clientIp = globalRateLimiter.getClientIp(req);
    const policy = getRateLimitPolicy(pathname, req.method);
    const rateKey = `${policy.category}:${clientIp}`;
    const rateResult = globalRateLimiter.check(rateKey, policy.limit, policy.windowMs);

    // Injeta cabeçalhos padrão informativos RFC 6585
    const rlHeaders = globalRateLimiter.getHeaders(rateResult, policy.limit);
    for (const [hName, hVal] of Object.entries(rlHeaders)) {
        res.setHeader(hName, String(hVal));
    }

    if (!rateResult.allowed) {
        handleCors(res);
        res.writeHead(429, {
            'Content-Type': 'application/json; charset=utf-8',
            'Retry-After': String(rateResult.retryAfterSeconds)
        });
        res.end(JSON.stringify({
            success: false,
            error: 'Too Many Requests',
            code: 'RATE_LIMIT_EXCEEDED',
            message: `Limite de requisições excedido para esta operação. Aguarde ${rateResult.retryAfterSeconds} segundos antes de tentar novamente.`,
            category: policy.category,
            retryAfterSeconds: rateResult.retryAfterSeconds
        }));
        return;
    }

    if (pathname.startsWith('/api/cnes/')) {
        if (req.method === 'OPTIONS') {
            handleCors(res);
            res.writeHead(200);
            res.end();
            return;
        }
        const access = await globalCnesAuthorizer(req);
        if (!access.authorized) {
            const unavailable = access.code === 'CNES_AUTH_NOT_CONFIGURED' || access.code === 'CNES_AUTH_UNAVAILABLE';
            sendJsonResponse(req, res, unavailable ? 503 : 401, {
                error: unavailable ? 'Validação de sessão CNES indisponível' : 'Autorização CNES obrigatória',
                code: access.code || 'CNES_AUTH_REQUIRED'
            });
            return;
        }
    }

    // 1. Rota de Proxy para a API oficial do FNS
    if (pathname.startsWith('/api/fns/')) {
        const targetPath = pathname.replace('/api/fns/', '');
        proxyFnsRequest(req, res, targetPath, parsedUrl.query);
        return;
    }

    // 1.1. Rota inteligente de Estabelecimentos CNES por Município / IBGE
    if (pathname.startsWith('/api/cnes/estabelecimentos') || pathname.startsWith('/api/cnes/municipio')) {
        handleCors(res);
        if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

        const query = parsedUrl.query ? new URLSearchParams(parsedUrl.query) : new URLSearchParams();
        const ibgeParam = query.get('ibge') || query.get('codigo_municipio') || (pathname.split('/')[4] || '').trim();
        const munParam = query.get('municipio') || '';
        const ufParam = query.get('uf') || 'MA';
        const compParam = query.get('competencia') || '';

        const cleanIbge = (ibgeParam || '210120').substring(0, 6);
        const cnesDataDir = path.join(PUBLIC_DIR, 'cnes_data');
        if (!fs.existsSync(cnesDataDir)) {
            fs.mkdirSync(cnesDataDir, { recursive: true });
        }

        // Bacabal is served from the immutable snapshot published by the CNES
        // worker. A requested competence must never be silently replaced by a
        // different legacy file.
        const isBacabal = cleanIbge === '210120';
        if (isBacabal) {
            if (enviarSnapshotCnesBacabal(req, res, compParam)) {
                return;
            }

            if (compParam) {
                const fileByComp = path.join(cnesDataDir, `cnes_${cleanIbge}_${compParam}.json`);
                if (fs.existsSync(fileByComp)) {
                    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                    fs.createReadStream(fileByComp).pipe(res);
                    return;
                }

                sendJsonResponse(req, res, 404, {
                    error: 'Competência CNES não publicada para Bacabal',
                    code: 'CNES_COMPETENCE_UNAVAILABLE',
                    competencia: compParam,
                    codigoIbge: '210120'
                });
                return;
            }

            const legacyFile = path.join(cnesDataDir, 'cnes_bacabal.json');
            if (fs.existsSync(legacyFile)) {
                enviarLegadoCnesBacabal(legacyFile, res);
            } else {
                res.writeHead(503, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                res.end(JSON.stringify({
                    error: 'CNES Bacabal indisponível',
                    code: 'CNES_SNAPSHOT_UNAVAILABLE',
                    message: 'Nenhum snapshot publicado ou arquivo legado disponível.'
                }));
            }
            return;
        }

        // 1.1.1. Verificar se existe cache auditado para este IBGE e competência
        if (compParam) {
            const fileByComp = path.join(cnesDataDir, `cnes_${cleanIbge}_${compParam}.json`);
            if (fs.existsSync(fileByComp)) {
                res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                fs.createReadStream(fileByComp).pipe(res);
                return;
            }
        }

        const fileByIbge = path.join(cnesDataDir, `cnes_${cleanIbge}.json`);
        const fileBacabal = path.join(cnesDataDir, 'cnes_bacabal.json');

        if (cleanIbge === '210120' && fs.existsSync(fileBacabal)) {
            res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            fs.createReadStream(fileBacabal).pipe(res);
            return;
        }

        if (fs.existsSync(fileByIbge)) {
            res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            fs.createReadStream(fileByIbge).pipe(res);
            return;
        }

        // 1.1.2. Tentar consulta na API de Dados Abertos do Ministério da Saúde
        const cnesUrl = `https://apidadosabertos.saude.gov.br/cnes/estabelecimentos?codigo_municipio=${cleanIbge}&limit=50`;
        const reqRemote = https.get(cnesUrl, {
            headers: { 'Accept': 'application/json', 'User-Agent': 'FPA-ARGOS/4.0' },
            timeout: 3000
        }, (apiRes) => {
            if (apiRes.statusCode === 200) {
                let body = '';
                apiRes.on('data', chunk => { body += chunk; });
                apiRes.on('end', () => {
                    try {
                        const parsed = JSON.parse(body);
                        if (parsed && (parsed.estabelecimentos || Array.isArray(parsed))) {
                            // Persiste em cache local
                            fs.writeFile(fileByIbge, body, 'utf8', () => {});
                            res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                            res.end(body);
                            return;
                        }
                    } catch (e) {}
                    enviarFallbackLocal(cleanIbge, munParam, ufParam, res, fileByIbge);
                });
            } else {
                enviarFallbackLocal(cleanIbge, munParam, ufParam, res, fileByIbge);
            }
        });

        reqRemote.on('error', () => {
            enviarFallbackLocal(cleanIbge, munParam, ufParam, res, fileByIbge);
        });

        reqRemote.on('timeout', () => {
            reqRemote.destroy();
            enviarFallbackLocal(cleanIbge, munParam, ufParam, res, fileByIbge);
        });

        return;
    }

    // 1.2. Salvar base do CNES importada pelo usuário (JSON/CSV)
    if (pathname === '/api/cnes/salvar' && req.method === 'POST') {
        handleCors(res);
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const parsed = JSON.parse(body);
                const ibge = String(parsed.codigoIbge || '210120').substring(0, 6);
                const filePath = path.join(PUBLIC_DIR, 'cnes_data', `cnes_${ibge}.json`);
                fs.writeFileSync(filePath, JSON.stringify(parsed, null, 2), 'utf8');

                // Grava também snapshot de competência se disponível
                const versaoOuComp = String(parsed.versao || '').replace(/\D/g, '');
                if (versaoOuComp && versaoOuComp.length >= 6) {
                    const compFile = path.join(PUBLIC_DIR, 'cnes_data', `cnes_${ibge}_${versaoOuComp.substring(0, 6)}.json`);
                    fs.writeFileSync(compFile, JSON.stringify(parsed, null, 2), 'utf8');
                }

                res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                res.end(JSON.stringify({ success: true, message: `Base CNES do município IBGE ${ibge} gravada com sucesso.` }));
            } catch (err) {
                res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                res.end(JSON.stringify({ error: 'Erro ao processar JSON', details: err.message }));
            }
        });
        return;
    }

    // 1.3. Rotas de dados estruturados locais e compatibilidades
    if (pathname === '/api/cnes/bacabal' || pathname === '/api/cnes/dados') {
        handleCors(res);
        const localFile = path.join(PUBLIC_DIR, 'cnes_data', 'cnes_bacabal.json');
        const query = parsedUrl.query ? new URLSearchParams(parsedUrl.query) : new URLSearchParams();
        const compParam = query.get('competencia') || '';
        if (enviarSnapshotCnesBacabal(req, res, compParam)) return;
        if (compParam) {
            const fileByComp = path.join(PUBLIC_DIR, 'cnes_data', `cnes_210120_${compParam}.json`);
            if (fs.existsSync(fileByComp)) {
                res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                fs.createReadStream(fileByComp).pipe(res);
                return;
            }
            sendJsonResponse(req, res, 404, {
                error: 'Competência CNES não publicada para Bacabal',
                code: 'CNES_COMPETENCE_UNAVAILABLE',
                competencia: compParam,
                codigoIbge: '210120'
            });
        } else if (fs.existsSync(localFile)) {
            enviarLegadoCnesBacabal(localFile, res);
        } else {
            sendJsonResponse(req, res, 503, {
                error: 'CNES Bacabal indisponível',
                code: 'CNES_SNAPSHOT_UNAVAILABLE'
            });
        }
        return;
    }

    if (pathname === '/api/cnes/compatibilidades') {
        handleCors(res);
        const localFile = path.join(PUBLIC_DIR, 'cnes_data', 'sigtap_compatibilidades.json');
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        fs.createReadStream(localFile).pipe(res);
        return;
    }

    // 1.3b. Aliases CNES históricos versionados (identidade de unidade, sem fatos cadastrais).
    // Canal autorizado para o overlay que o acesso estático direto (/cnes_data/*) bloqueia.
    if (pathname === '/api/cnes/aliases') {
        handleCors(res);
        const aliasQuery = parsedUrl.query ? new URLSearchParams(parsedUrl.query) : new URLSearchParams();
        const aliasIbge = (aliasQuery.get('ibge') || '210120').slice(0, 6);
        if (aliasIbge !== '210120') {
            sendJsonResponse(req, res, 404, {
                error: 'Aliases CNES não publicados para este município',
                code: 'CNES_SCOPE_UNAVAILABLE',
                codigoIbge: aliasIbge
            });
            return;
        }
        const aliasFile = path.join(PUBLIC_DIR, 'cnes_data', 'cnes_aliases_210120.json');
        if (!fs.existsSync(aliasFile)) {
            sendJsonResponse(req, res, 503, {
                error: 'Overlay de aliases CNES indisponível',
                code: 'CNES_ALIASES_UNAVAILABLE'
            });
            return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        fs.createReadStream(aliasFile).pipe(res);
        return;
    }

    // 1.4. Rotas do Módulo de Produções BPA — Envio de E-mail com Anexo Oficial
    if (pathname === '/api/bpa/email-config' && req.method === 'GET') {
        handleCors(res);
        const cfg = getStoredEmailConfig();
        const masked = {
            ...cfg,
            smtp_pass: cfg.smtp_pass ? '••••••••' : '',
            resend_api_key: cfg.resend_api_key ? '••••••••' : '',
            has_smtp_configured: !!(cfg.smtp_user && cfg.smtp_pass),
            has_resend_configured: !!cfg.resend_api_key
        };
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify(masked));
        return;
    }

    if (pathname === '/api/bpa/email-config' && req.method === 'POST') {
        handleCors(res);
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const parsed = JSON.parse(body || '{}');
                const saved = saveStoredEmailConfig(parsed);
                const masked = {
                    ...saved,
                    smtp_pass: saved.smtp_pass ? '••••••••' : '',
                    resend_api_key: saved.resend_api_key ? '••••••••' : '',
                    has_smtp_configured: !!(saved.smtp_user && saved.smtp_pass),
                    has_resend_configured: !!saved.resend_api_key
                };
                res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                res.end(JSON.stringify({ success: true, message: 'Configurações de e-mail atualizadas com sucesso.', config: masked }));
            } catch(e) {
                res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                res.end(JSON.stringify({ success: false, error: e.message }));
            }
        });
        return;
    }

    if (pathname === '/api/bpa/testar-conexao-email' && req.method === 'POST') {
        handleCors(res);
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
            try {
                const parsed = JSON.parse(body || '{}');
                const stored = getStoredEmailConfig();
                const config = { ...stored, ...parsed };
                if (parsed.smtp_pass === '••••••••' || !parsed.smtp_pass) config.smtp_pass = stored.smtp_pass;
                if (parsed.resend_api_key === '••••••••' || !parsed.resend_api_key) config.resend_api_key = stored.resend_api_key;

                const testRecipient = parsed.destinatario || config.default_destinatario || 'auditoriabacabal@gmail.com';
                const testOptions = {
                    host: config.smtp_host,
                    port: config.smtp_port,
                    secure: config.smtp_secure,
                    user: config.smtp_user,
                    pass: config.smtp_pass,
                    from: config.from_email || config.smtp_user,
                    from_name: config.from_name || 'ARGOS Produções BPA',
                    to: testRecipient,
                    subject: `[TESTE ARGOS] Validação de E-mail de Produção BPA - ${new Date().toLocaleTimeString('pt-BR')}`,
                    html: `<div style="font-family: sans-serif; padding: 20px; color: #1e293b;">
                        <h2 style="color: #0284c7;">ARGOS — Teste de Conectividade de E-mail</h2>
                        <p>Este é um disparo de teste gerado pelo sistema ARGOS para homologação de envio de produções BPA para o Setor de Auditoria de Bacabal.</p>
                        <p style="background: #f0fdf4; border-left: 4px solid #16a34a; padding: 10px 15px; color: #166534;">
                            <strong>Status:</strong> Conexão e envio realizados com sucesso! O anexo de teste oficial segue em anexo.
                        </p>
                    </div>`,
                    text: 'ARGOS — Teste de Conectividade de E-mail realizado com sucesso para envio de produções BPA.',
                    attachments: [{
                        filename: 'TESTE_CONEXAO_ARGOS.BPA',
                        content: Buffer.from('01#BPA#TESTE#CONEXAO#ARGOS#BACABAL#MA').toString('base64')
                    }]
                };

                let result;
                if (config.provider === 'resend' || (!config.smtp_user && config.resend_api_key)) {
                    result = await sendEmailViaResend({ ...testOptions, apiKey: config.resend_api_key });
                } else {
                    result = await sendEmailViaSmtp(testOptions);
                }

                res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                res.end(JSON.stringify({ success: true, message: `Teste concluído com sucesso para ${testRecipient}!`, details: result }));
            } catch(e) {
                console.error('Erro no teste de e-mail BPA:', e);
                res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                res.end(JSON.stringify({ success: false, error: e.message || 'Falha ao testar conexão de e-mail.' }));
            }
        });
        return;
    }

    if (pathname === '/api/bpa/enviar-email' && req.method === 'POST') {
        handleCors(res);
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
            try {
                const payload = JSON.parse(body || '{}');
                const stored = getStoredEmailConfig();
                const config = { ...stored, ...(payload.emailConfig || {}) };
                if (payload.emailConfig && (payload.emailConfig.smtp_pass === '••••••••' || !payload.emailConfig.smtp_pass)) {
                    config.smtp_pass = stored.smtp_pass;
                }
                if (payload.emailConfig && (payload.emailConfig.resend_api_key === '••••••••' || !payload.emailConfig.resend_api_key)) {
                    config.resend_api_key = stored.resend_api_key;
                }

                const destinatario = payload.destinatario || config.default_destinatario || 'auditoriabacabal@gmail.com';
                const copia = payload.copia || '';
                const assunto = payload.assunto || `[PRODUÇÃO BPA] Envio oficial de arquivo`;
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

                const hasSmtp = !!(config.smtp_host && config.smtp_user && config.smtp_pass);
                const hasResend = !!config.resend_api_key;

                if (!hasSmtp && !hasResend) {
                    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                    res.end(JSON.stringify({
                        success: false,
                        needConfig: true,
                        message: 'Nenhum servidor de e-mail (SMTP ou Resend) configurado no ARGOS. Use o anexo embutido (.eml / Outlook) ou configure suas credenciais de e-mail.'
                    }));
                    return;
                }

                let result;
                if (config.provider === 'resend' || (!hasSmtp && hasResend)) {
                    result = await sendEmailViaResend({
                        apiKey: config.resend_api_key,
                        from: config.from_email || 'onboarding@resend.dev',
                        from_name: config.from_name || 'ARGOS Produções',
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
                        from_name: config.from_name || 'ARGOS Produções',
                        to: destinatario,
                        cc: copia,
                        subject: assunto,
                        html: corpoHtml,
                        text: corpoTexto,
                        attachments: attachments
                    });
                }

                res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                res.end(JSON.stringify({
                    success: true,
                    method: result.method,
                    destinatario: destinatario,
                    timestamp: new Date().toISOString(),
                    message: `Produção "${nomeArquivo}" enviada com sucesso com anexo para ${destinatario}!`
                }));
            } catch(err) {
                console.error('Erro no envio de e-mail BPA:', err);
                res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                res.end(JSON.stringify({
                    success: false,
                    error: err.message || 'Falha na transmissão do e-mail com anexo.'
                }));
            }
        });
        return;
    }

    // 1.5. Endpoints de Fila de Background Jobs (Processamento Assíncrono)
    if (pathname === '/api/jobs/enviar-email' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const payload = JSON.parse(body || '{}');
                payload.correlationId = correlationId;
                payload.clientIp = clientIp;
                const job = globalJobQueue.enqueue('enviar_email_bpa', payload);

                sendJsonResponse(req, res, 202, {
                    success: true,
                    status: 'QUEUED',
                    jobId: job.id,
                    message: 'Disparo de e-mail enfileirado para processamento em segundo plano.',
                    checkUrl: `/api/jobs/${job.id}`
                });
            } catch (err) {
                sendJsonResponse(req, res, 400, { success: false, error: 'JSON inválido no corpo da requisição.' });
            }
        });
        return;
    }

    if (pathname === '/api/jobs' && req.method === 'GET') {
        const jobs = globalJobQueue.listJobs(50);
        sendJsonResponse(req, res, 200, { success: true, count: jobs.length, jobs });
        return;
    }

    if (pathname.startsWith('/api/jobs/') && req.method === 'GET') {
        const jobId = pathname.replace('/api/jobs/', '').trim();
        const job = globalJobQueue.getJob(jobId);
        if (!job) {
            sendJsonResponse(req, res, 404, { success: false, error: 'Job não encontrado ou expirado.' });
            return;
        }
        sendJsonResponse(req, res, 200, { success: true, job });
        return;
    }

    // 1.6. Endpoint de Consulta de Trilha de Auditoria (Audit Trail)
    if (pathname === '/api/audit/recent' && req.method === 'GET') {
        const events = globalAuditLogger.getRecentEvents(50);
        sendJsonResponse(req, res, 200, { success: true, count: events.length, events });
        return;
    }

    // 1.7. Rotas do Módulo Download Sistema (SIA/SUS - BPA & BDSIA)
    if (pathname === '/api/siasus/versoes' && req.method === 'GET') {
        handleCors(res);
        const catalogo = globalSiasusSyncService.getCatalogo();
        sendJsonResponse(req, res, 200, { success: true, catalogo });
        return;
    }

    if (pathname === '/api/siasus/sincronizar' && req.method === 'POST') {
        handleCors(res);
        // Dispara varredura assíncrona no DATASUS
        globalSiasusSyncService.sync().then(resultado => {
            globalLogger.info('siasus_sync_completed', resultado);
        }).catch(err => {
            globalLogger.error('siasus_sync_failed', { erro: err.message });
        });

        sendJsonResponse(req, res, 202, {
            success: true,
            message: 'Sincronização com os servidores do DATASUS iniciada em segundo plano.',
            timestamp: new Date().toISOString()
        });
        return;
    }

    if (pathname.startsWith('/api/siasus/download/')) {
        handleCors(res);
        const rawFileName = pathname.replace('/api/siasus/download/', '').trim();
        const fileName = decodeURIComponent(rawFileName);
        const localPath = globalSiasusSyncService.getArquivoLocal(fileName);

        if (localPath && fs.existsSync(localPath)) {
            const stats = fs.statSync(localPath);
            const isPdf = fileName.toLowerCase().endsWith('.pdf');
            res.setHeader('Content-Type', isPdf ? 'application/pdf' : 'application/x-msdownload');
            res.setHeader('Content-Disposition', `attachment; filename="${path.basename(localPath)}"`);
            res.setHeader('Content-Length', stats.size);
            res.writeHead(200);
            fs.createReadStream(localPath).pipe(res);
            return;
        }

        // Se ainda não estiver baixado localmente no cache, redireciona para a URL do DATASUS ou espelho
        const catalogo = globalSiasusSyncService.getCatalogo();
        let targetItem = null;
        if (catalogo.bpa) targetItem = catalogo.bpa.find(b => b.arquivo === fileName);
        if (!targetItem && catalogo.bdsia) targetItem = catalogo.bdsia.find(s => s.arquivo === fileName);
        if (!targetItem && catalogo.notasTecnicas) targetItem = catalogo.notasTecnicas.find(n => n.arquivo === fileName);

        if (targetItem && (targetItem.urlDownload || targetItem.urlDatasus || targetItem.urlEspelho)) {
            const redirectUrl = targetItem.urlDownload || targetItem.urlDatasus || targetItem.urlEspelho;
            res.writeHead(302, { Location: redirectUrl });
            res.end();
            return;
        }

        sendJsonResponse(req, res, 404, { success: false, error: `Arquivo ${fileName} não encontrado no catálogo.` });
        return;
    }

    if (pathname.startsWith('/api/siasus/visualizar/')) {
        handleCors(res);
        const rawFileName = pathname.replace('/api/siasus/visualizar/', '').trim();
        const fileName = decodeURIComponent(rawFileName);
        const localPath = globalSiasusSyncService.getArquivoLocal(fileName);

        if (localPath && fs.existsSync(localPath)) {
            const stats = fs.statSync(localPath);
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `inline; filename="${path.basename(localPath)}"`);
            res.setHeader('Content-Length', stats.size);
            res.writeHead(200);
            fs.createReadStream(localPath).pipe(res);
            return;
        }

        // Se ainda não estiver localmente em cache, faz proxy com follow redirect garantindo Content-Disposition: inline
        const streamPdf = (targetUrl, maxHops = 3) => {
            if (maxHops <= 0) {
                res.writeHead(302, { Location: targetUrl });
                res.end();
                return;
            }
            const client = targetUrl.startsWith('https:') ? https : http;
            const reqUpstream = client.get(targetUrl, { headers: { 'User-Agent': 'FPA-ARGOS' } }, (upRes) => {
                if (upRes.statusCode >= 300 && upRes.statusCode < 400 && upRes.headers.location) {
                    let nextUrl = upRes.headers.location;
                    if (!nextUrl.startsWith('http')) {
                        nextUrl = new URL(nextUrl, targetUrl).href;
                    }
                    streamPdf(nextUrl, maxHops - 1);
                    return;
                }

                if (upRes.statusCode === 200) {
                    res.setHeader('Content-Type', 'application/pdf');
                    res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
                    if (upRes.headers['content-length']) {
                        res.setHeader('Content-Length', upRes.headers['content-length']);
                    }
                    res.writeHead(200);
                    upRes.pipe(res);
                } else {
                    res.writeHead(302, { Location: `https://github.com/RenatoKR/SIGTAP/blob/main/notastecnicas/${encodeURIComponent(fileName)}` });
                    res.end();
                }
            });

            reqUpstream.on('error', () => {
                res.writeHead(302, { Location: `https://github.com/RenatoKR/SIGTAP/blob/main/notastecnicas/${encodeURIComponent(fileName)}` });
                res.end();
            });
        };

        const remoteSource = `https://raw.githubusercontent.com/RenatoKR/SIGTAP/main/notastecnicas/${fileName}`;
        streamPdf(remoteSource);
        return;
    }

    // 1.9. Rotas de Inteligência Web — ARGOS Radar & Blog (Opção A)
    if (pathname === '/api/radar/targets') {
        handleCors(res);
        if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }
        const scheduler = getRadarScheduler({ rootDir: __dirname });
        const targets = scheduler.getTargets();
        sendJsonResponse(req, res, 200, {
            success: true,
            totalTargets: targets.length,
            targets
        });
        return;
    }

    if (pathname === '/api/radar/feed') {
        handleCors(res);
        if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }
        const scheduler = getRadarScheduler({ rootDir: __dirname });
        sendJsonResponse(req, res, 200, {
            success: true,
            ...scheduler.getFeed()
        });
        return;
    }

    if (pathname === '/api/radar/status') {
        handleCors(res);
        if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }
        const scheduler = getRadarScheduler({ rootDir: __dirname });
        sendJsonResponse(req, res, 200, {
            success: true,
            status: scheduler.getStatus()
        });
        return;
    }

    if (pathname === '/api/radar/sweep') {
        handleCors(res);
        if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }
        const scheduler = getRadarScheduler({ rootDir: __dirname, logger: globalLogger });
        scheduler.triggerSweep({ limit: 8, triggerSource: 'manual_ui' })
            .then(sweepRes => {
                sendJsonResponse(req, res, sweepRes.success ? 200 : 409, sweepRes);
            })
            .catch(err => {
                sendJsonResponse(req, res, 500, {
                    success: false,
                    error: err.message
                });
            });
        return;
    }

    // 2. Servir arquivos estáticos da aplicação
    // CNES carries professional links and must only leave through an authorized API.
    if (pathname === '/cnes_data' || pathname.startsWith('/cnes_data/')) {
        res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Dados CNES exigem acesso autorizado', code: 'CNES_AUTH_REQUIRED' }));
        return;
    }
    let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);

    // Evitar directory traversal
    if (!filePath.startsWith(PUBLIC_DIR)) {
        res.writeHead(403);
        res.end('Acesso Negado');
        return;
    }

    fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
            // Se for diretório, tentar index.html dentro dele
            if (stats && stats.isDirectory()) {
                const subIndex = path.join(filePath, 'index.html');
                if (fs.existsSync(subIndex)) {
                    filePath = subIndex;
                } else {
                    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
                    res.end('Página não encontrada');
                    return;
                }
            } else {
                res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('Arquivo não encontrado: ' + pathname);
                return;
            }
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        const acceptEncoding = (req.headers && req.headers['accept-encoding']) || '';

        const compStream = shouldCompress(contentType, stats.size)
            ? createCompressionStream(acceptEncoding)
            : null;

        if (compStream) {
            res.setHeader('Content-Encoding', compStream.encoding);
            res.setHeader('Vary', 'Accept-Encoding');
            res.writeHead(200, {
                'Content-Type': contentType,
                'Cache-Control': 'no-cache'
            });
            const readStream = fs.createReadStream(filePath);
            readStream.pipe(compStream.stream).pipe(res);
        } else {
            res.writeHead(200, {
                'Content-Type': contentType,
                'Cache-Control': 'no-cache'
            });
            const readStream = fs.createReadStream(filePath);
            readStream.pipe(res);
        }
    });
});

server.listen(PORT, () => {
    console.log(`\n=============================================================`);
    console.log(`🚀 ARGOS SERVER & FNS PROXY ativo em: http://localhost:${PORT}`);
    console.log(`📡 Proxy FNS disponível em:           http://localhost:${PORT}/api/fns/...`);
    console.log(`📦 Sincronizador SIA/SUS ativo em:    http://localhost:${PORT}/api/siasus/versoes`);
    console.log(`=============================================================\n`);

    // Inicia agendador automático do SIA/SUS (a cada 6 horas)
    if (process.env.SIASUS_SYNC_ENABLED !== '0') {
        globalSiasusSyncService.startAutoSync();
    }

    // Inicia agendador do Radar & Blog de Inteligência Web (Opção A: 24h portais / 6h redes sociais)
    try {
        const radarScheduler = getRadarScheduler({ logger: globalLogger, rootDir: __dirname });
        radarScheduler.start(false);
    } catch (e) {
        globalLogger.error('radar_scheduler_start_failed', { error: e.message });
    }

    // A project-local Python environment activates the daily Bacabal sync on
    // persistent Node hosts. CNES_SYNC_ENABLED=0 explicitly disables it.
    const cnesPython = resolveCnesPython({ rootDir: __dirname });
    if (process.env.CNES_SYNC_ENABLED !== '0' && cnesPython) {
        try {
            globalCnesSyncScheduler = startCnesSyncScheduler({ rootDir: __dirname, python: cnesPython });
        } catch (error) {
            globalLogger.error('cnes_sync_scheduler_start_failed', { error: error.message });
        }
    } else if (process.env.CNES_SYNC_ENABLED === '1' && !cnesPython) {
        globalLogger.error('cnes_sync_scheduler_start_failed', { error: 'Python CNES indisponível; configure CNES_PYTHON ou instale .venv' });
    }
});

module.exports = {
    server,
    globalRateLimiter,
    globalJobQueue,
    globalLogger,
    globalAuditLogger,
    globalSiasusSyncService,
    get globalCnesSyncScheduler() { return globalCnesSyncScheduler; },
    getRateLimitPolicy,
    getRadarScheduler
};

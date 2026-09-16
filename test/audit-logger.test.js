const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { AuditLogger, sanitizeData } = require('../lib/audit-logger');

describe('AuditLogger & Sanitizer', () => {
    const testLogFile = path.join(__dirname, 'test_audit.log');

    afterEach(() => {
        if (fs.existsSync(testLogFile)) {
            try { fs.unlinkSync(testLogFile); } catch(e) {}
        }
    });

    test('mascara senhas, tokens e chaves de API recursivamente', () => {
        const sensitive = {
            usuario: 'operador_bacabal',
            smtp_pass: 'minhasenhasupersecreta',
            emailConfig: {
                resend_api_key: 're_1234567890abcdef',
                host: 'smtp.gmail.com'
            },
            headers: {
                Authorization: 'Bearer super-jwt-token-xyz'
            }
        };

        const sanitized = sanitizeData(sensitive);
        assert.equal(sanitized.usuario, 'operador_bacabal');
        assert.equal(sanitized.smtp_pass, '••••••••');
        assert.equal(sanitized.emailConfig.resend_api_key, '••••••••');
        assert.equal(sanitized.emailConfig.host, 'smtp.gmail.com');
        assert.equal(sanitized.headers.Authorization, '••••••••');
    });

    test('registra evento de auditoria em memória e grava no arquivo de log', async () => {
        const audit = new AuditLogger({ filePath: testLogFile });

        const evt = await audit.logAction({
            usuarioLogin: 'admin',
            modulo: 'BPA',
            acao: 'ENVIO_EMAIL_BPA',
            detalhes: { destinatario: 'teste@bacabal.ma.gov.br', smtp_pass: '123456' },
            status: 'SUCESSO',
            correlationId: 'req_test_01',
            ip: '127.0.0.1'
        });

        assert.ok(evt.id.startsWith('evt_'));
        assert.equal(evt.usuarioLogin, 'admin');
        assert.equal(evt.detalhes.smtp_pass, '••••••••');
        assert.equal(evt.detalhes.destinatario, 'teste@bacabal.ma.gov.br');

        const recent = audit.getRecentEvents();
        assert.equal(recent.length, 1);
        assert.equal(recent[0].id, evt.id);

        assert.ok(fs.existsSync(testLogFile));
        const fileContent = fs.readFileSync(testLogFile, 'utf8');
        assert.ok(fileContent.includes('ENVIO_EMAIL_BPA'));
        assert.ok(!fileContent.includes('123456'));
    });
});

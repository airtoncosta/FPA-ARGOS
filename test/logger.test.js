const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { Logger, generateCorrelationId } = require('../lib/logger');

describe('Logger Core', () => {
    test('gera correlation ID válido com prefixo req_', () => {
        const id1 = generateCorrelationId();
        const id2 = generateCorrelationId();
        assert.ok(id1.startsWith('req_'));
        assert.notEqual(id1, id2);
    });

    test('formata entradas de log em JSON estruturado com campos obrigatórios', () => {
        const logger = new Logger({ service: 'fpa-test' });
        const correlationId = 'req_12345';
        const entry = logger.formatEntry('INFO', 'test_event', { key: 'value', durationMs: 12.5 }, correlationId);

        const parsed = JSON.parse(entry);
        assert.equal(parsed.level, 'INFO');
        assert.equal(parsed.service, 'fpa-test');
        assert.equal(parsed.event, 'test_event');
        assert.equal(parsed.correlationId, 'req_12345');
        assert.equal(parsed.durationMs, 12.5);
        assert.equal(parsed.meta.key, 'value');
        assert.ok(parsed.timestamp);
    });

    test('respeita o nível mínimo de log (minLevel)', () => {
        const logs = [];
        const mockStream = {
            write: (str) => logs.push(JSON.parse(str.trim()))
        };

        const logger = new Logger({ minLevel: 'WARN', stream: mockStream });
        logger.debug('debug_event');
        logger.info('info_event');
        logger.warn('warn_event');
        logger.error('error_event', { error: new Error('Erro grave') });

        assert.equal(logs.length, 2);
        assert.equal(logs[0].level, 'WARN');
        assert.equal(logs[1].level, 'ERROR');
        assert.match(logs[1].error.message, /Erro grave/);
    });

    test('permite criar child logger com correlationId fixado', () => {
        const logs = [];
        const mockStream = {
            write: (str) => logs.push(JSON.parse(str.trim()))
        };

        const parent = new Logger({ stream: mockStream });
        const child = parent.child({ correlationId: 'req_sub_999' });

        child.info('sub_event', { step: 1 });
        assert.equal(logs.length, 1);
        assert.equal(logs[0].correlationId, 'req_sub_999');
        assert.equal(logs[0].meta.step, 1);
    });
});

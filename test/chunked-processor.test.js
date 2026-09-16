const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { processInChunks } = require('../lib/chunked-processor');

describe('ChunkedProcessor', () => {
    test('processa 10.000 itens em lotes sem bloquear a pilha e reporta progresso', async () => {
        const data = Array.from({ length: 10000 }, (_, i) => i);
        const progressReports = [];

        const results = await processInChunks(data, (item) => item * 2, {
            chunkSize: 2000,
            onProgress: (pct) => progressReports.push(pct)
        });

        assert.equal(results.length, 10000);
        assert.equal(results[0], 0);
        assert.equal(results[9999], 19998);
        assert.ok(progressReports.length >= 5, 'Deve reportar progresso em cada chunk');
        assert.equal(progressReports[progressReports.length - 1], 100);
    });

    test('funciona com handlers assíncronos', async () => {
        const data = [1, 2, 3, 4, 5];
        const results = await processInChunks(data, async (item) => {
            return item + 10;
        }, { chunkSize: 2 });

        assert.deepEqual(results, [11, 12, 13, 14, 15]);
    });

    test('lida com array vazio retornando lista vazia e 100% de progresso', async () => {
        let reported = false;
        const results = await processInChunks([], (x) => x, {
            onProgress: (pct) => { reported = true; assert.equal(pct, 100); }
        });
        assert.deepEqual(results, []);
        assert.equal(reported, true);
    });

    test('rejeita se o primeiro argumento não for um Array', async () => {
        await assert.rejects(
            async () => processInChunks(null, () => {}),
            { name: 'TypeError' }
        );
    });
});

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const { shouldCompress, compressBuffer, createCompressionStream } = require('../lib/compression');

describe('Compression Core', () => {
    test('identifica corretamente tipos de conteúdo e tamanhos elegíveis para compressão', () => {
        assert.equal(shouldCompress('application/json', 2048), true);
        assert.equal(shouldCompress('application/javascript', 5000), true);
        assert.equal(shouldCompress('text/css; charset=utf-8', 1500), true);
        assert.equal(shouldCompress('text/html', 1024), true);

        // Menor que 1KB não deve comprimir
        assert.equal(shouldCompress('application/json', 500), false);

        // Imagens binárias JPEG/PNG não devem comprimir
        assert.equal(shouldCompress('image/jpeg', 50000), false);
        assert.equal(shouldCompress('image/png', 50000), false);
        assert.equal(shouldCompress(null, 5000), false);
    });

    test('comprime buffers em gzip quando cliente suporta', () => {
        const jsonStr = JSON.stringify({ items: Array.from({ length: 500 }, (_, i) => ({ id: i, name: `Item ${i}` })) });
        const originalBuf = Buffer.from(jsonStr, 'utf8');

        const { encoding, data } = compressBuffer(originalBuf, 'gzip, deflate, br');
        assert.equal(encoding, 'gzip');
        assert.ok(data.length < originalBuf.length, 'Buffer comprimido deve ser significativamente menor');

        // Descomprime e valida integridade
        const decompressed = zlib.gunzipSync(data).toString('utf8');
        assert.equal(decompressed, jsonStr);
    });

    test('comprime buffers em deflate quando cliente não suporta gzip', () => {
        const text = 'FPA-ARGOS '.repeat(200);
        const originalBuf = Buffer.from(text, 'utf8');

        const { encoding, data } = compressBuffer(originalBuf, 'deflate');
        assert.equal(encoding, 'deflate');
        assert.ok(data.length < originalBuf.length);

        const decompressed = zlib.inflateSync(data).toString('utf8');
        assert.equal(decompressed, text);
    });

    test('retorna dados intactos quando cliente não suporta compressão', () => {
        const buf = Buffer.from('dados simples sem compressao');
        const { encoding, data } = compressBuffer(buf, '');
        assert.equal(encoding, null);
        assert.equal(data, buf);
    });

    test('cria streams de compressão para streaming de arquivos', () => {
        const gzipStreamObj = createCompressionStream('gzip, deflate');
        assert.ok(gzipStreamObj);
        assert.equal(gzipStreamObj.encoding, 'gzip');
        assert.ok(gzipStreamObj.stream);

        const nullStream = createCompressionStream('identity');
        assert.equal(nullStream, null);
    });
});

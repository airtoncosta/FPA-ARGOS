/**
 * FPA-ARGOS - lib/compression.js
 * Módulo de Compressão HTTP Nativa (Gzip & Deflate).
 *
 * Reduz payloads JSON da API e arquivos estáticos (JS, CSS, HTML) em até 80-90%,
 * acelerando o carregamento na rede local e remota sem dependências externas.
 */

const zlib = require('zlib');

const COMPRESSIBLE_TYPES = [
    'application/json',
    'text/html',
    'text/css',
    'application/javascript',
    'text/plain',
    'image/svg+xml',
    'text/csv'
];

/**
 * Verifica se o Content-Type e o tamanho são elegíveis para compressão.
 * @param {string} contentType
 * @param {number} bufferLength
 * @param {number} [minSize=1024] - Limiar mínimo em bytes
 * @returns {boolean}
 */
function shouldCompress(contentType, bufferLength = 0, minSize = 1024) {
    if (!contentType || typeof contentType !== 'string') return false;
    if (bufferLength < minSize) return false;

    const lower = contentType.toLowerCase();
    return COMPRESSIBLE_TYPES.some(type => lower.includes(type));
}

/**
 * Comprime um buffer baseado nas capacidades do cliente (Accept-Encoding).
 * @param {Buffer|string} buffer
 * @param {string} [acceptEncoding='']
 * @returns {{ encoding: string|null, data: Buffer }}
 */
function compressBuffer(buffer, acceptEncoding = '') {
    const raw = Buffer.isBuffer(buffer) ? buffer : Buffer.from(String(buffer || ''), 'utf8');
    const enc = (acceptEncoding || '').toLowerCase();

    if (enc.includes('gzip')) {
        return {
            encoding: 'gzip',
            data: zlib.gzipSync(raw, { level: 6 })
        };
    }

    if (enc.includes('deflate')) {
        return {
            encoding: 'deflate',
            data: zlib.deflateSync(raw, { level: 6 })
        };
    }

    return {
        encoding: null,
        data: raw
    };
}

/**
 * Cria uma stream de compressão para streaming contínuo de arquivos.
 * @param {string} [acceptEncoding='']
 * @returns {{ encoding: string, stream: zlib.Gzip|zlib.Deflate } | null}
 */
function createCompressionStream(acceptEncoding = '') {
    const enc = (acceptEncoding || '').toLowerCase();

    if (enc.includes('gzip')) {
        return {
            encoding: 'gzip',
            stream: zlib.createGzip({ level: 6 })
        };
    }

    if (enc.includes('deflate')) {
        return {
            encoding: 'deflate',
            stream: zlib.createDeflate({ level: 6 })
        };
    }

    return null;
}

module.exports = { shouldCompress, compressBuffer, createCompressionStream };

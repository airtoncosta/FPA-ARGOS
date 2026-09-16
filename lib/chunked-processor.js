/**
 * FPA-ARGOS - lib/chunked-processor.js
 * Processador de Lotes Cooperativo Não-Bloqueante (Anti-Recursão & Anti-Freeze).
 *
 * Divide grandes coleções de dados (ex: 50.000 registros BPA/SIA) em lotes (chunks)
 * intercalados por pausas no event loop (setImmediate / setTimeout), garantindo
 * fluidez de interface e eliminando estouro de pilha recursiva (Call Stack Overflow).
 *
 * Isomórfico: compatível com Node.js e Navegadores.
 */

/**
 * Pausa cooperativa no event loop para liberar a thread principal.
 * @param {number} [delayMs=0]
 * @returns {Promise<void>}
 */
function yieldToEventLoop(delayMs = 0) {
    return new Promise((resolve) => {
        if (delayMs > 0) {
            setTimeout(resolve, delayMs);
        } else if (typeof setImmediate === 'function') {
            setImmediate(resolve);
        } else {
            setTimeout(resolve, 0);
        }
    });
}

/**
 * Processa uma coleção em fatias sem travar a thread.
 * @param {Array<any>} items - Array de itens
 * @param {Function} itemHandler - Função síncrona ou assíncrona (item, index) => any
 * @param {Object} [options={}]
 * @param {number} [options.chunkSize=2000] - Quantidade de itens por lote
 * @param {Function} [options.onProgress] - Callback (pct, processedCount, total) => void
 * @param {number} [options.yieldDelay=0] - Atraso de pausa cooperativa em ms
 * @returns {Promise<Array<any>>}
 */
async function processInChunks(items, itemHandler, options = {}) {
    if (!Array.isArray(items)) {
        throw new TypeError('O parâmetro items deve ser um Array.');
    }
    if (typeof itemHandler !== 'function') {
        throw new TypeError('O parâmetro itemHandler deve ser uma função.');
    }

    const total = items.length;
    const chunkSize = Math.max(1, options.chunkSize || 2000);
    const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
    const yieldDelay = options.yieldDelay || 0;

    if (total === 0) {
        if (onProgress) onProgress(100, 0, 0);
        return [];
    }

    const results = new Array(total);

    for (let offset = 0; offset < total; offset += chunkSize) {
        const end = Math.min(offset + chunkSize, total);

        for (let i = offset; i < end; i++) {
            const res = itemHandler(items[i], i);
            results[i] = res && typeof res.then === 'function' ? await res : res;
        }

        if (onProgress) {
            const pct = Math.min(100, Math.round((end / total) * 100));
            onProgress(pct, end, total);
        }

        // Se ainda restam fatias, cede o controle ao event loop
        if (end < total) {
            await yieldToEventLoop(yieldDelay);
        }
    }

    return results;
}

// Exportação compatível com CommonJS e ES/Navegador
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { processInChunks, yieldToEventLoop };
}

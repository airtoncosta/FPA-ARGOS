/**
 * FPA-ARGOS - lib/logger.js
 * Logger Estruturado JSON Corporativo com Correlation IDs (x-request-id)
 * e Medição de Latência.
 *
 * 100% Zero dependências externas (usa stdout/stderr nativos).
 */

const LOG_LEVELS = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3
};

/**
 * Gera um Correlation ID exclusivo para rastreamento de ponta a ponta.
 * @returns {string}
 */
function generateCorrelationId() {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

class Logger {
    /**
     * @param {Object} [options={}]
     * @param {string} [options.service='fpa-argos'] - Nome do serviço
     * @param {string} [options.minLevel='INFO'] - Nível mínimo de exibição
     * @param {Object} [options.stream=process.stdout] - Stream de saída
     * @param {Object} [options.defaultMeta={}] - Metadados padrão herdados
     */
    constructor(options = {}) {
        this.service = options.service || 'fpa-argos';
        this.minLevel = (options.minLevel || 'INFO').toUpperCase();
        this.stream = options.stream || process.stdout;
        this.defaultMeta = options.defaultMeta || {};
    }

    /**
     * Formata uma entrada de log como JSON serializado.
     * @param {string} level
     * @param {string} event
     * @param {Object} [meta={}]
     * @param {string} [correlationId=null]
     * @returns {string}
     */
    formatEntry(level, event, meta = {}, correlationId = null) {
        const mergedMeta = { ...this.defaultMeta, ...meta };
        const corrId = correlationId || mergedMeta.correlationId || null;
        delete mergedMeta.correlationId;

        const durationMs = typeof mergedMeta.durationMs === 'number' ? mergedMeta.durationMs : undefined;
        if (durationMs !== undefined) {
            delete mergedMeta.durationMs;
        }

        let formattedError = undefined;
        if (mergedMeta.error) {
            const err = mergedMeta.error;
            formattedError = {
                name: err.name || 'Error',
                message: err.message || String(err),
                stack: err.stack
            };
            delete mergedMeta.error;
        }

        const entry = {
            timestamp: new Date().toISOString(),
            level,
            service: this.service,
            correlationId: corrId,
            event,
            ...(durationMs !== undefined ? { durationMs } : {}),
            ...(formattedError ? { error: formattedError } : {}),
            meta: mergedMeta
        };

        return JSON.stringify(entry);
    }

    /**
     * @private
     */
    _log(level, event, meta = {}, correlationId = null) {
        const currentPriority = LOG_LEVELS[level] ?? 1;
        const minPriority = LOG_LEVELS[this.minLevel] ?? 1;

        if (currentPriority < minPriority) {
            return;
        }

        const line = this.formatEntry(level, event, meta, correlationId);
        if (this.stream && typeof this.stream.write === 'function') {
            this.stream.write(line + '\n');
        }
    }

    debug(event, meta, correlationId) {
        this._log('DEBUG', event, meta, correlationId);
    }

    info(event, meta, correlationId) {
        this._log('INFO', event, meta, correlationId);
    }

    warn(event, meta, correlationId) {
        this._log('WARN', event, meta, correlationId);
    }

    error(event, meta, correlationId) {
        this._log('ERROR', event, meta, correlationId);
    }

    /**
     * Cria um sub-logger com metadados herdados e correlationId fixo.
     * @param {Object} bindings
     * @returns {Logger}
     */
    child(bindings = {}) {
        return new Logger({
            service: this.service,
            minLevel: this.minLevel,
            stream: this.stream,
            defaultMeta: { ...this.defaultMeta, ...bindings }
        });
    }
}

module.exports = { Logger, generateCorrelationId, LOG_LEVELS };

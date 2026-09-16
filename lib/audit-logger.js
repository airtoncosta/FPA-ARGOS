/**
 * FPA-ARGOS - lib/audit-logger.js
 * Módulo de Trilha de Auditoria Corporativa (Audit Trail) com Sanitização
 * e Mascaramento Automático de Credenciais Sensíveis.
 *
 * Alinhado aos padrões do DATASUS, LGPD e tabela historico_acoes do Supabase.
 * 100% Zero dependências externas (usa fs/promises e path nativos).
 */

const fs = require('fs');
const path = require('path');

const SENSITIVE_KEY_REGEX = /pass|password|secret|token|api_key|authorization|bearer|chave/i;

/**
 * Sanitiza recursivamente qualquer objeto removendo ou mascarando chaves sensíveis.
 * @param {any} data
 * @param {WeakSet} [seen=new WeakSet()]
 * @returns {any}
 */
function sanitizeData(data, seen = new WeakSet()) {
    if (data === null || data === undefined) return data;
    if (typeof data !== 'object') return data;

    if (seen.has(data)) return '[Circular]';
    seen.add(data);

    if (Array.isArray(data)) {
        return data.map(item => sanitizeData(item, seen));
    }

    const sanitized = {};
    for (const [key, val] of Object.entries(data)) {
        if (SENSITIVE_KEY_REGEX.test(key)) {
            sanitized[key] = '••••••••';
        } else {
            sanitized[key] = sanitizeData(val, seen);
        }
    }
    return sanitized;
}

class AuditLogger {
    /**
     * @param {Object} [options={}]
     * @param {string} [options.filePath] - Caminho do arquivo de auditoria append-only
     * @param {number} [options.bufferSize=100] - Quantidade máxima de eventos recentes em memória
     */
    constructor(options = {}) {
        this.filePath = options.filePath || path.join(__dirname, '../logs/audit.log');
        this.bufferSize = options.bufferSize || 100;
        /** @type {Object[]} */
        this.events = [];
    }

    /**
     * Registra formalmente uma ação na trilha de auditoria.
     * @param {Object} action
     * @param {string} [action.usuarioLogin='sistema']
     * @param {string} [action.modulo='GERAL']
     * @param {string} [action.acao='ACAO_DESCONHECIDA']
     * @param {Object} [action.detalhes={}]
     * @param {string} [action.status='SUCESSO']
     * @param {string} [action.correlationId=null]
     * @param {string} [action.ip=null]
     * @returns {Promise<Object>}
     */
    async logAction(action = {}) {
        const id = `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        const timestamp = new Date().toISOString();

        const event = {
            id,
            timestamp,
            usuarioLogin: action.usuarioLogin || 'sistema',
            modulo: action.modulo || 'GERAL',
            acao: action.acao || 'ACAO_DESCONHECIDA',
            detalhes: sanitizeData(action.detalhes || {}),
            status: action.status || 'SUCESSO',
            correlationId: action.correlationId || null,
            ip: action.ip || null
        };

        // Mantém buffer circular em memória
        this.events.push(event);
        if (this.events.length > this.bufferSize) {
            this.events.shift();
        }

        // Persistência assíncrona em disco (se caminho definido)
        if (this.filePath) {
            try {
                const dir = path.dirname(this.filePath);
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }
                const line = JSON.stringify(event) + '\n';
                await fs.promises.appendFile(this.filePath, line, 'utf8');
            } catch (err) {
                console.error('[AuditLogger] Falha ao persistir evento no disco:', err.message);
            }
        }

        return event;
    }

    /**
     * Retorna os eventos recentes da memória (do mais recente para o mais antigo).
     * @param {number} [limit=50]
     * @returns {Object[]}
     */
    getRecentEvents(limit = 50) {
        return this.events.slice(-limit).reverse();
    }
}

module.exports = { AuditLogger, sanitizeData };

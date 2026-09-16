/**
 * FPA-ARGOS - lib/job-queue.js
 * Fila de Tarefas em Segundo Plano com Concorrência Controlada,
 * Retries Automáticos e Expurgador de Memória.
 *
 * 100% Zero dependências externas (usa nativo EventEmitter).
 */

const { EventEmitter } = require('node:events');

class JobQueue extends EventEmitter {
    /**
     * @param {Object} options
     * @param {number} [options.concurrency=2] - Número máximo de tarefas simultâneas
     * @param {number} [options.retentionMs=3600000] - Tempo de retenção em memória (padrão: 1h)
     * @param {number} [options.cleanupIntervalMs=60000] - Intervalo de checagem do expurgo
     */
    constructor(options = {}) {
        super();
        this.concurrency = Math.max(1, options.concurrency || 2);
        this.retentionMs = options.retentionMs || 3600000;
        this.cleanupIntervalMs = options.cleanupIntervalMs || 60000;

        /** @type {Map<string, Object>} */
        this.jobs = new Map();
        /** @type {string[]} */
        this.queue = [];
        /** @type {Set<string>} */
        this.running = new Set();
        /** @type {Map<string, Function>} */
        this.handlers = new Map();

        // Expurgador periódico de memória não-bloqueante
        this.cleanupTimer = setInterval(() => {
            this.cleanup(this.retentionMs);
        }, this.cleanupIntervalMs);

        if (this.cleanupTimer && typeof this.cleanupTimer.unref === 'function') {
            this.cleanupTimer.unref();
        }
    }

    /**
     * Registra o processador para um determinado tipo de tarefa.
     * @param {string} type - Identificador da tarefa (ex: 'enviar_email_bpa')
     * @param {Function} handler - Função assíncrona (job, updateProgress) => Promise<any>
     */
    registerHandler(type, handler) {
        if (typeof handler !== 'function') {
            throw new TypeError(`Handler para o tipo "${type}" deve ser uma função.`);
        }
        this.handlers.set(type, handler);
    }

    /**
     * Enfileira uma nova tarefa para execução em segundo plano.
     * @param {string} type - Tipo de tarefa
     * @param {Object} [payload={}] - Dados de entrada
     * @param {Object} [options={}] - Opções específicas da tarefa
     * @param {number} [options.maxAttempts=3] - Máximo de tentativas
     * @param {number} [options.retryDelayMs=1000] - Atraso base para retry
     * @returns {Object} Job recém-criado
     */
    enqueue(type, payload = {}, options = {}) {
        const id = 'job_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
        const job = {
            id,
            type,
            payload,
            status: 'QUEUED',
            progress: 0,
            attempts: 0,
            maxAttempts: options.maxAttempts || 3,
            retryDelayMs: options.retryDelayMs || 1000,
            result: null,
            error: null,
            createdAt: Date.now(),
            startedAt: null,
            completedAt: null
        };

        this.jobs.set(id, job);
        this.queue.push(id);
        this.emit('job:enqueued', job);

        // Agendamento assíncrono para o próximo tick
        setImmediate(() => this._dispatch());

        return job;
    }

    /**
     * Despachante interno de tarefas respeitando limite de concorrência.
     * @private
     */
    _dispatch() {
        while (this.running.size < this.concurrency && this.queue.length > 0) {
            const nextJobId = this.queue.shift();
            const job = this.jobs.get(nextJobId);
            if (!job || job.status === 'COMPLETED' || job.status === 'FAILED') {
                continue;
            }

            this.running.add(job.id);
            this._runJob(job);
        }
    }

    /**
     * Executa um job específico e gerencia retries e eventos.
     * @param {Object} job
     * @private
     */
    async _runJob(job) {
        job.status = 'RUNNING';
        if (!job.startedAt) {
            job.startedAt = Date.now();
        }
        job.attempts++;
        this.emit('job:started', job);

        const handler = this.handlers.get(job.type);
        if (!handler) {
            job.status = 'FAILED';
            job.error = `Nenhum handler registrado para o tipo de tarefa "${job.type}".`;
            job.completedAt = Date.now();
            this.running.delete(job.id);
            this.emit('job:failed', job);
            this._dispatch();
            return;
        }

        const updateProgress = (pct) => {
            job.progress = Math.min(100, Math.max(0, Math.round(pct)));
            this.emit('job:progress', job);
        };

        try {
            const result = await handler(job, updateProgress);
            job.status = 'COMPLETED';
            job.progress = 100;
            job.result = result;
            job.completedAt = Date.now();
            this.emit('job:complete', job);
        } catch (err) {
            const errMsg = err && err.message ? err.message : String(err);
            if (job.attempts < job.maxAttempts) {
                // Cálculo de backoff exponencial
                const backoff = Math.min(30000, job.retryDelayMs * Math.pow(2, job.attempts - 1));
                this.emit('job:retry', { job, delay: backoff, error: errMsg });
                
                // Re-agenda após o intervalo de backoff
                setTimeout(() => {
                    this.queue.unshift(job.id);
                    this._dispatch();
                }, backoff);
            } else {
                job.status = 'FAILED';
                job.error = errMsg;
                job.completedAt = Date.now();
                this.emit('job:failed', job);
            }
        } finally {
            this.running.delete(job.id);
            this._dispatch();
        }
    }

    /**
     * Retorna um job pelo ID.
     * @param {string} id
     * @returns {Object|null}
     */
    getJob(id) {
        return this.jobs.get(id) || null;
    }

    /**
     * Lista os jobs mais recentes.
     * @param {number} [limit=50]
     * @returns {Object[]}
     */
    listJobs(limit = 50) {
        const arr = Array.from(this.jobs.values());
        arr.sort((a, b) => b.createdAt - a.createdAt);
        return arr.slice(0, limit);
    }

    /**
     * Remove jobs finalizados que excederam o tempo de retenção.
     * @param {number} [retentionMs]
     * @returns {number} Quantidade de jobs expurgados
     */
    cleanup(retentionMs) {
        const maxAge = retentionMs || this.retentionMs;
        const now = Date.now();
        let purged = 0;

        for (const [id, job] of this.jobs.entries()) {
            if ((job.status === 'COMPLETED' || job.status === 'FAILED') && job.completedAt) {
                if (now - job.completedAt >= maxAge) {
                    this.jobs.delete(id);
                    purged++;
                }
            }
        }

        return purged;
    }

    /**
     * Destrói a fila e cancela temporizadores.
     */
    destroy() {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }
        this.removeAllListeners();
        this.queue.length = 0;
        this.running.clear();
        this.jobs.clear();
    }
}

module.exports = { JobQueue };

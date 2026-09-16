const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { JobQueue } = require('../lib/job-queue');

describe('JobQueue Core', () => {
    let queue;

    beforeEach(() => {
        queue = new JobQueue({ concurrency: 2, retentionMs: 10000 });
    });

    afterEach(() => {
        if (queue) queue.destroy();
    });

    test('enfileira e executa jobs com sucesso', async () => {
        queue.registerHandler('test_task', async (job, updateProgress) => {
            updateProgress(50);
            return { processed: true, value: job.payload.val * 2 };
        });

        const job = queue.enqueue('test_task', { val: 21 });
        assert.equal(job.status, 'QUEUED');
        assert.ok(job.id);
        assert.equal(job.progress, 0);

        await new Promise((resolve) => queue.on('job:complete', (completed) => {
            if (completed.id === job.id) resolve();
        }));

        const resultJob = queue.getJob(job.id);
        assert.equal(resultJob.status, 'COMPLETED');
        assert.equal(resultJob.progress, 100);
        assert.equal(resultJob.result.value, 42);
    });

    test('respeita a concorrência máxima de 2 jobs simultâneos', async () => {
        let active = 0;
        let maxObserved = 0;

        queue.registerHandler('slow_task', async () => {
            active++;
            maxObserved = Math.max(maxObserved, active);
            await new Promise((r) => setTimeout(r, 40));
            active--;
            return true;
        });

        const j1 = queue.enqueue('slow_task', {});
        const j2 = queue.enqueue('slow_task', {});
        const j3 = queue.enqueue('slow_task', {});

        await Promise.all([
            new Promise(r => {
                const handler = (j) => { if (j.id === j1.id) { queue.off('job:complete', handler); r(); } };
                queue.on('job:complete', handler);
            }),
            new Promise(r => {
                const handler = (j) => { if (j.id === j2.id) { queue.off('job:complete', handler); r(); } };
                queue.on('job:complete', handler);
            }),
            new Promise(r => {
                const handler = (j) => { if (j.id === j3.id) { queue.off('job:complete', handler); r(); } };
                queue.on('job:complete', handler);
            })
        ]);

        assert.equal(maxObserved, 2, 'Concorrência máxima não deve exceder 2');
    });

    test('re-tenta falhas transitórias até maxAttempts com sucesso no retry', async () => {
        let callCount = 0;
        queue.registerHandler('failing_task', async () => {
            callCount++;
            if (callCount < 2) throw new Error('Erro temporário de conexão');
            return 'sucesso_no_retry';
        });

        const job = queue.enqueue('failing_task', {}, { maxAttempts: 3, retryDelayMs: 20 });

        await new Promise((resolve) => {
            const handler = (completed) => {
                if (completed.id === job.id) {
                    queue.off('job:complete', handler);
                    resolve();
                }
            };
            queue.on('job:complete', handler);
        });

        const resultJob = queue.getJob(job.id);
        assert.equal(resultJob.status, 'COMPLETED');
        assert.equal(resultJob.attempts, 2);
        assert.equal(resultJob.result, 'sucesso_no_retry');
    });

    test('marca como FAILED se exceder o número máximo de tentativas', async () => {
        queue.registerHandler('fatal_task', async () => {
            throw new Error('Falha irrecuperável');
        });

        const job = queue.enqueue('fatal_task', {}, { maxAttempts: 2, retryDelayMs: 10 });

        await new Promise((resolve) => {
            const handler = (failed) => {
                if (failed.id === job.id) {
                    queue.off('job:failed', handler);
                    resolve();
                }
            };
            queue.on('job:failed', handler);
        });

        const resultJob = queue.getJob(job.id);
        assert.equal(resultJob.status, 'FAILED');
        assert.equal(resultJob.attempts, 2);
        assert.match(resultJob.error, /Falha irrecuperável/);
    });

    test('lista jobs recentes e permite expurgo de memória', () => {
        queue.registerHandler('noop', async () => true);

        const j1 = queue.enqueue('noop', { n: 1 });
        const j2 = queue.enqueue('noop', { n: 2 });

        const list = queue.listJobs();
        assert.equal(list.length, 2);

        // Força timestamp antigo para testar expurgo
        j1.completedAt = Date.now() - 50000;
        j1.status = 'COMPLETED';

        const purged = queue.cleanup(30000);
        assert.equal(purged, 1);
        assert.equal(queue.getJob(j1.id), null);
        assert.ok(queue.getJob(j2.id));
    });
});

const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');

function resolveCnesPython({ rootDir, configured = process.env.CNES_PYTHON, exists = fs.existsSync } = {}) {
    if (configured && String(configured).trim()) return String(configured).trim();
    if (!rootDir) return null;
    const candidate = process.platform === 'win32'
        ? path.join(rootDir, '.venv', 'Scripts', 'python.exe')
        : path.join(rootDir, '.venv', 'bin', 'python');
    return exists(candidate) ? candidate : null;
}

function startCnesSyncScheduler({
    rootDir,
    python = process.env.CNES_PYTHON,
    intervalMs = 24 * 60 * 60 * 1000,
    runOnStart = true,
    spawnProcess = spawn,
    setIntervalFn = setInterval,
    clearIntervalFn = clearInterval,
    logger = console
} = {}) {
    if (!rootDir) throw new Error('rootDir é obrigatório para o CNES sync');
    if (!python) throw new Error('Defina CNES_PYTHON para habilitar a sincronização CNES');
    if (!Number.isSafeInteger(intervalMs) || intervalMs < 60_000) {
        throw new Error('intervalMs deve ser pelo menos 60000');
    }

    const worker = path.join(rootDir, 'workers', 'cnes-sync', 'cnes_sync.py');
    let running = false;
    let stopped = false;

    function run() {
        if (running || stopped) return Promise.resolve(false);
        running = true;
        return new Promise(resolve => {
            let settled = false;
            function finish(ok, error) {
                if (settled) return;
                settled = true;
                running = false;
                if (!ok) logger.error(`Sincronização CNES falhou: ${error}`);
                resolve(ok);
            }

            try {
                const child = spawnProcess(python, [worker, 'sync'], {
                    cwd: rootDir,
                    shell: false,
                    windowsHide: true,
                    stdio: 'inherit'
                });
                child.once('error', error => finish(false, error.message));
                child.once('close', code => finish(code === 0, `código ${code}`));
            } catch (error) {
                finish(false, error.message);
            }
        });
    }

    const timer = setIntervalFn(() => { void run(); }, intervalMs);
    if (typeof timer?.unref === 'function') timer.unref();
    if (runOnStart) queueMicrotask(() => { void run(); });

    return {
        run,
        stop() {
            stopped = true;
            clearIntervalFn(timer);
        }
    };
}

module.exports = { startCnesSyncScheduler, resolveCnesPython };

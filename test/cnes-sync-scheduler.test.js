const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const path = require('node:path');
const { startCnesSyncScheduler, resolveCnesPython } = require('../lib/cnes-sync-scheduler');

test('encontra Python local do worker e respeita configuração explícita', () => {
    const rootDir = path.resolve(__dirname, '..');
    const expected = path.join(rootDir, '.venv', process.platform === 'win32' ? 'Scripts' : 'bin', process.platform === 'win32' ? 'python.exe' : 'python');
    assert.equal(resolveCnesPython({ rootDir, configured: '', exists: candidate => candidate === expected }), expected);
    assert.equal(resolveCnesPython({ rootDir, configured: 'custom-python', exists: () => false }), 'custom-python');
});

test('executa sync sem shell e evita ciclos simultâneos', async () => {
    const calls = [];
    const children = [];
    const scheduler = startCnesSyncScheduler({
        rootDir: path.resolve(__dirname, '..'),
        python: 'python-test',
        runOnStart: false,
        setIntervalFn: () => 1,
        clearIntervalFn: () => {},
        spawnProcess: (command, args, options) => {
            calls.push({ command, args, options });
            const child = new EventEmitter();
            children.push(child);
            return child;
        }
    });

    const first = scheduler.run();
    const overlapping = await scheduler.run();
    assert.equal(overlapping, false);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].command, 'python-test');
    assert.equal(calls[0].args[1], 'sync');
    assert.equal(calls[0].options.shell, false);
    assert.equal(calls[0].options.windowsHide, true);
    children[0].emit('close', 0);
    assert.equal(await first, true);
    scheduler.stop();
});

test('falha de sync é reportada e permite novo ciclo', async () => {
    const children = [];
    const errors = [];
    const scheduler = startCnesSyncScheduler({
        rootDir: path.resolve(__dirname, '..'),
        python: 'python-test',
        runOnStart: false,
        setIntervalFn: () => 1,
        clearIntervalFn: () => {},
        logger: { error: message => errors.push(message) },
        spawnProcess: () => {
            const child = new EventEmitter();
            children.push(child);
            return child;
        }
    });

    const first = scheduler.run();
    children[0].emit('close', 2);
    assert.equal(await first, false);
    assert.equal(errors.length, 1);
    const second = scheduler.run();
    children[1].emit('close', 0);
    assert.equal(await second, true);
    scheduler.stop();
});

test('requer Python configurado antes de agendar', () => {
    assert.throws(() => startCnesSyncScheduler({
        rootDir: path.resolve(__dirname, '..'),
        python: '',
        runOnStart: false
    }), /CNES_PYTHON/);
});

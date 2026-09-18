const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const sourceScripts = path.join(__dirname, '..', 'scripts');

function withIsolatedScript(name, callback) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'argos-cnes-legacy-'));
    try {
        const scripts = path.join(root, 'scripts');
        fs.mkdirSync(scripts);
        const copied = path.join(scripts, name);
        fs.copyFileSync(path.join(sourceScripts, name), copied);
        callback(root, copied);
    } finally {
        const resolved = path.resolve(root);
        if (!resolved.startsWith(path.resolve(os.tmpdir()) + path.sep)) throw new Error('temporary path escaped');
        fs.rmSync(resolved, { recursive: true, force: true });
    }
}

test('legacy generator refuses to publish invented professionals and competencies', () => {
    withIsolatedScript('build_cnes_bacabal_completo.js', (root, script) => {
        const result = spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8' });
        assert.notEqual(result.status, 0);
        assert.equal(fs.existsSync(path.join(root, 'code_sandbox_light_git_fe61910d_1781185357', 'cnes_data')), false);
    });
});

test('legacy ingestor refuses to relabel August data as June', () => {
    withIsolatedScript('ingest_datasus_cnes.ps1', (root, script) => {
        const dataDir = path.join(root, 'code_sandbox_light_git_fe61910d_1781185357', 'cnes_data');
        fs.mkdirSync(dataDir, { recursive: true });
        fs.writeFileSync(path.join(dataDir, 'cnes_210120.json'), JSON.stringify({ competencia: '202608', estabelecimentos: [] }));
        const result = spawnSync('pwsh', ['-NoProfile', '-File', script, '-Competencia', '202606'], { cwd: root, encoding: 'utf8' });
        assert.notEqual(result.status, 0);
        assert.equal(fs.existsSync(path.join(dataDir, 'cnes_210120_202606.json')), false);
    });
});

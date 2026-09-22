const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../../code_sandbox_light_git_fe61910d_1781185357/js/bpa-module.js'), 'utf8');

function setup(supabaseImpl, user = { username: 'admin', role: 'ADM' }) {
    const store = new Map();
    const session = new Map([['argos_user', JSON.stringify(user)]]);
    const storage = m => ({ getItem: k => m.get(k) || null, setItem: (k, v) => m.set(k, v), removeItem: k => m.delete(k) });
    let inserted = null;
    const client = supabaseImpl || { from: () => ({ insert: (rows) => { inserted = rows; return { select: async () => ({ data: [{ id: 'uuid-nuvem-1' }], error: null }) }; } }) };
    const ctx = {
        window: { SupabaseConfig: { isConnected: () => true, getClient: () => client } },
        document: { getElementById: () => null, querySelectorAll: () => [] },
        localStorage: storage(store), sessionStorage: storage(session),
        console: { error() {}, warn() {} }, alert() {}, confirm: () => true,
        crypto: require('node:crypto').webcrypto
    };
    ctx.window.BpaAuditCore = require('../../code_sandbox_light_git_fe61910d_1781185357/js/bpa-audit-core.js');
    vm.createContext(ctx); vm.runInContext(source, ctx);
    const b = ctx.window.BpaModule;
    b.renderAll = () => {};
    return { b, ctx, store, getInserted: () => inserted };
}

test('saveProducao persiste os campos de auditoria na nuvem', async () => {
    const { b, getInserted } = setup();
    const rec = await b.saveProducao({
        nomeArquivo: 'PAULTRAE.JUL', estabelecimentoNome: 'HOSPITAL MATERNO INFANTIL',
        cnes: '2387439', competencia: '07/2026', tipoBpa: 'BPA-I', conteudo: 'x',
        status_auditoria: 'COM_APONTAMENTOS', total_apontamentos: 4,
        auditado_em: '2026-09-22T10:00:00.000Z', fingerprint: 'fp-abc-123'
    });
    assert.equal(rec.status_auditoria, 'COM_APONTAMENTOS');
    assert.equal(rec.total_apontamentos, 4);
    assert.equal(rec.fingerprint, 'fp-abc-123');
    const payload = getInserted()[0];
    assert.equal(payload.status_auditoria, 'COM_APONTAMENTOS');
    assert.equal(payload.fingerprint, 'fp-abc-123');
    assert.equal(payload._localOnly, undefined);
});

test('falha na nuvem guarda na outbox e resolve (sem perder o envio)', async () => {
    const failing = { from: () => ({ insert: () => ({ select: async () => ({ data: null, error: new Error('rede caiu') }) }) }) };
    const { b, store } = setup(failing);
    const rec = await b.saveProducao({
        nomeArquivo: 'PAULTRAE.JUL', estabelecimentoNome: 'HOSPITAL MATERNO INFANTIL',
        cnes: '2387439', competencia: '07/2026', tipoBpa: 'BPA-I', conteudo: 'x'
    });
    assert.equal(rec._localOnly, true);
    const outbox = JSON.parse(store.get(b.outboxKey) || '[]');
    assert.equal(outbox.length, 1);
    assert.equal(outbox[0].nome_arquivo, 'PAULTRAE.JUL');
});

test('reenviarOutbox drena a fila e limpa a cópia local', async () => {
    const { b, store } = setup();
    const rec = { id: 'pend-1', nome_arquivo: 'A.JUL', _localOnly: true };
    store.set(b.outboxKey, JSON.stringify([rec]));
    store.set(b.localProducoesKey, JSON.stringify([rec]));
    const r = await b.reenviarOutbox();
    assert.equal(r.enviados, 1);
    assert.equal(r.falhas, 0);
    assert.equal(JSON.parse(store.get(b.outboxKey) || '[]').length, 0);
    assert.equal(JSON.parse(store.get(b.localProducoesKey) || '[]').length, 0);
});

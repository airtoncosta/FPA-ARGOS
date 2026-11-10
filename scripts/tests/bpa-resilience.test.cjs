const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '../../code_sandbox_light_git_fe61910d_1781185357/js/bpa-module.js'), 'utf8');

function setup(user = { username: 'airton', name: 'Airton', role: 'ADM' }) {
    const store = new Map();
    const session = new Map([['argos_user', JSON.stringify(user)]]);
    const storage = m => ({ getItem: k => m.get(k) || null, setItem: (k, v) => m.set(k, v), removeItem: k => m.delete(k) });
    const ctx = {
        window: {},
        document: {
            getElementById: id => ({
                id,
                style: {},
                classList: { add() {}, remove() {}, toggle() {} },
                textContent: '',
                innerHTML: '',
                disabled: false,
                appendChild() {}
            }),
            createElement: tag => ({
                tagName: tag,
                style: {},
                classList: { add() {}, remove() {}, toggle() {} },
                textContent: '',
                value: '',
                appendChild() {}
            }),
            querySelectorAll: () => []
        },
        localStorage: storage(store),
        sessionStorage: storage(session),
        console: { error() {}, warn() {}, log() {} },
        alert() {},
        confirm: () => true,
        crypto: require('node:crypto').webcrypto
    };
    ctx.window.BpaAuditCore = require('../../code_sandbox_light_git_fe61910d_1781185357/js/bpa-audit-core.js');
    vm.createContext(ctx);
    vm.runInContext(source, ctx);
    const b = ctx.window.BpaModule;
    return { b, ctx, store, session };
}

test('resiliência: SDK do Supabase ausente (client null) cai em modo local e não zera unidades para ADM', async () => {
    const { b, ctx } = setup({ username: 'airton', name: 'Airton', role: 'ADM' });
    // Supabase marcado como conectado conceitualmente, mas client é null (CDN falhou)
    ctx.window.SupabaseConfig = {
        isConnected: () => true,
        getClient: () => null
    };
    b.renderAll = () => {};
    await b.loadProducoes();

    assert.equal(b.accessLoadError, '', 'accessLoadError não deve travar o sistema em falha de conexão');
    assert.equal(b.persistenceMode, 'local', 'Deve entrar em modo local de contingência');
    assert.ok(b.getUnidadesSistema().length > 0, 'Unidades do sistema devem permanecer disponíveis');
});

test('resiliência: falha de rede (Failed to fetch) ao consultar configuracoes cai em modo local', async () => {
    const { b, ctx } = setup({ username: 'airton', name: 'Airton', role: 'ADM' });
    ctx.window.SupabaseConfig = {
        isConnected: () => true,
        getClient: () => ({
            from: () => ({
                select: () => ({
                    in: async () => ({ error: new Error('Failed to fetch') })
                })
            })
        })
    };
    b.renderAll = () => {};
    await b.loadProducoes();

    assert.equal(b.accessLoadError, '', 'Não deve travar a tela por erro de rede');
    assert.equal(b.persistenceMode, 'local');
    assert.ok(b.getUnidadesSistema().length > 0);
});

test('resiliência: ADM nunca tem upload.disabled = true e openUploadModal abre normalmente', async () => {
    const { b, ctx } = setup({ username: 'airton', name: 'Airton', role: 'ADM' });
    let modalOpened = false;
    let alertCalled = false;
    ctx.alert = () => { alertCalled = true; };
    ctx.document.getElementById = id => {
        if (id === 'modalUploadBpa') {
            return {
                classList: {
                    remove(cls) { if (cls === 'hidden') modalOpened = true; },
                    add() {}
                }
            };
        }
        return {
            id,
            style: {},
            classList: { add() {}, remove() {}, toggle() {} },
            textContent: '',
            innerHTML: '',
            disabled: false,
            appendChild() {}
        };
    };

    b.accessLoadError = 'Falha na rede';
    b.openUploadModal();
    assert.equal(alertCalled, false, 'ADM não deve receber alerta de bloqueio');
    assert.equal(modalOpened, true, 'Modal de upload deve abrir para ADM');

    // assertUploadAccess também não deve disparar erro para ADM
    assert.doesNotThrow(() => {
        b.assertUploadAccess({ cnes: '2387412', estabelecimentoNome: 'HOSPITAL MARIA SOCORRO BRANDAO' });
    });
});

test('resiliência: erro qualquer do Supabase para ADM faz fallback local transparente sem setar accessLoadError', async () => {
    const { b, ctx } = setup({ username: 'airton', name: 'Airton', role: 'ADM' });
    ctx.window.SupabaseConfig = {
        isConnected: () => true,
        getClient: () => ({
            from: () => ({
                select: () => ({
                    in: async () => ({ error: { message: '500 Internal Server Error', code: '500' } }),
                    order: async () => ({ error: { message: '500 Internal Server Error', code: '500' } })
                })
            })
        })
    };
    b.renderAll = () => {};
    await b.loadProducoes();

    assert.equal(b.accessLoadError, '', 'ADM não deve receber mensagem de erro bloqueante');
    assert.equal(b.persistenceMode, 'local', 'Deve migrar para contingência local');
    assert.ok(b.getUnidadesSistema().length > 0, 'Unidades devem continuar disponíveis');
});

test('resiliência: saveProducao sobrevive a QuotaExceededError no localStorage', async () => {
    const { b, ctx } = setup({ username: 'airton', name: 'Airton', role: 'ADM' });
    // Forçar QuotaExceededError ao tentar gravar no localStorage
    ctx.localStorage.setItem = (key, val) => {
        if (key.includes('argos_producoes_bpa')) {
            const err = new Error("Failed to execute 'setItem' on 'Storage': Setting the value of 'argos_producoes_bpa' exceeded the quota.");
            err.name = 'QuotaExceededError';
            throw err;
        }
    };
    ctx.window.SupabaseConfig = {
        isConnected: () => false
    };

    let rec = null;
    await assert.doesNotReject(async () => {
        rec = await b.saveProducao({
            nomeArquivo: 'PAECOELE.OUT',
            estabelecimentoNome: 'HOSPITAL MARIA SOCORRO BRANDAO',
            cnes: '2387412',
            competencia: '10/2026',
            tipoBpa: 'BPA-I',
            conteudo: 'CONTEUDO_GRANDE'.repeat(100),
            tamanhoBytes: 140000,
            status_auditoria: 'COM_APONTAMENTOS',
            total_apontamentos: 320
        });
    }, 'saveProducao não deve quebrar com QuotaExceededError');

    assert.ok(rec, 'Registro deve ser criado com sucesso mesmo com quota cheia');
    assert.equal(rec.nome_arquivo, 'PAECOELE.OUT');
});

test('resiliência: saveProducao recupera de PGRST204 (colunas de auditoria inexistentes no schema do Supabase)', async () => {
    const { b, ctx } = setup({ username: 'airton', name: 'Airton', role: 'ADM' });
    let attempts = 0;
    let finalInserted = null;
    ctx.window.SupabaseConfig = {
        isConnected: () => true,
        getClient: () => ({
            from: table => {
                assert.equal(table, 'producoes_bpa');
                return {
                    insert: rows => ({
                        select: async () => {
                            attempts++;
                            const row = rows[0];
                            if (row.auditado_em || row.status_auditoria) {
                                return {
                                    error: {
                                        code: 'PGRST204',
                                        message: "Could not find the 'auditado_em' column of 'producoes_bpa' in the schema cache"
                                    }
                                };
                            }
                            finalInserted = row;
                            return { data: [{ ...row, id: 'uuid-gravado-nuvem' }] };
                        }
                    })
                };
            }
        })
    };

    const rec = await b.saveProducao({
        nomeArquivo: 'PAECOELE.OUT',
        estabelecimentoNome: 'HOSPITAL MARIA SOCORRO BRANDAO',
        cnes: '2387412',
        competencia: '10/2026',
        tipoBpa: 'BPA-I',
        conteudo: 'TESTE',
        status_auditoria: 'COM_APONTAMENTOS',
        total_apontamentos: 320,
        auditado_em: new Date().toISOString()
    });

    assert.equal(attempts, 2, 'Deve ter tentado e recuperado no retry');
    assert.equal(rec.id, 'uuid-gravado-nuvem', 'Deve ter gravado com sucesso no Supabase');
    assert.equal(rec._localOnly, undefined, 'Não deve ser localOnly');
});

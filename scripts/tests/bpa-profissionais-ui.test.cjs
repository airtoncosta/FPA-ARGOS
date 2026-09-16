const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const core = require('../../code_sandbox_light_git_fe61910d_1781185357/js/bpa-audit-core.js');

const source = fs.readFileSync(path.join(__dirname, '../../code_sandbox_light_git_fe61910d_1781185357/js/bpa-module.js'), 'utf8');

function setup(user = { username: 'admin', role: 'ADM' }) {
    const store = new Map();
    const session = new Map([['argos_user', JSON.stringify(user)]]);
    const storage = m => ({ getItem: k => m.get(k) || null, setItem: (k, v) => m.set(k, v), removeItem: k => m.delete(k) });
    const ctx = {
        window: { BpaAuditCore: core },
        document: { getElementById: () => null, querySelectorAll: () => [] },
        localStorage: storage(store),
        sessionStorage: storage(session),
        console: { error() {}, warn() {}, log() {} },
        alert() {},
        confirm: () => true,
        crypto: require('node:crypto').webcrypto
    };
    vm.createContext(ctx);
    vm.runInContext(source, ctx);
    return { b: ctx.window.BpaModule, ctx };
}

function makeBpaILine(cns, proc, qtd) {
    const a = Array(349).fill(' ');
    const put = (pos, val) => [...String(val)].forEach((c, i) => a[pos - 1 + i] = c);
    put(1, '03'); // BPA-I
    put(3, '2387439'); // CNES HMI
    put(10, '202607'); // Comp
    put(16, cns); // CNS profissional (15 posições)
    put(31, '225125'); // CBO
    put(37, '20260710'); // Data
    put(45, '001');
    put(48, '01');
    put(50, proc); // Procedimento 10 digitos
    put(75, 'M');
    put(82, 'A000');
    put(86, '030');
    put(89, String(qtd).padStart(6, '0')); // Quantidade
    put(110, 'BPA');
    put(143, '19960701');
    return a.join('');
}

function makeBpaHeader(rows) {
    const a = Array(130).fill(' ');
    const put = (pos, val) => [...String(val)].forEach((c, i) => a[pos - 1 + i] = c);
    put(1, '01#BPA#');
    put(8, '202607');
    put(14, String(rows.length).padStart(6, '0'));
    put(20, '000001');
    return a.join('') + '\r\n' + rows.join('\r\n') + '\r\n';
}

test('parseBpaFile extrai CNS do profissional, quantidade total e quantidade por procedimento', () => {
    const { b } = setup();

    const cns1 = '700000000000001';
    const cns2 = '700000000000002';

    // cns1: 3 atendimentos de procA (qtd 2 cada = 6), 1 de procB (qtd 5) => total 11
    // cns2: 1 atendimento de procA (qtd 4) => total 4
    const rows = [
        makeBpaILine(cns1, '0205020046', 2),
        makeBpaILine(cns1, '0205020046', 2),
        makeBpaILine(cns1, '0205020046', 2),
        makeBpaILine(cns1, '0205020097', 5),
        makeBpaILine(cns2, '0205020046', 4)
    ];
    const text = makeBpaHeader(rows);
    const parsed = b.parseBpaFile({ name: 'PAULTRAE.JUL', size: text.length }, text);

    assert.equal(parsed.tipoBpa, 'BPA-I');
    assert.equal(parsed.totalProfissionais, 2);
    assert.equal(parsed.profissionaisDetalhados.length, 2);

    // Primeiro profissional mais produtivo (cns1)
    const prof1 = parsed.profissionaisDetalhados[0];
    assert.equal(prof1.cns, cns1);
    assert.equal(prof1.quantidade, 11);
    assert.equal(prof1.atendimentos, 4);
    assert.equal(prof1.procedimentos.length, 2);
    assert.deepEqual(JSON.parse(JSON.stringify(prof1.procedimentos)), [
        { codigo: '0205020046', quantidade: 6 },
        { codigo: '0205020097', quantidade: 5 }
    ]);

    // Segundo profissional (cns2)
    const prof2 = parsed.profissionaisDetalhados[1];
    assert.equal(prof2.cns, cns2);
    assert.equal(prof2.quantidade, 4);
    assert.equal(prof2.atendimentos, 1);
    assert.deepEqual(JSON.parse(JSON.stringify(prof2.procedimentos)), [
        { codigo: '0205020046', quantidade: 4 }
    ]);

    // HTML formatado
    assert.equal(parsed.profissionaisAmostra.length, 2);
    assert.ok(parsed.profissionaisAmostra[0].includes(cns1));
    assert.ok(parsed.profissionaisAmostra[0].includes('quantidade total: 11'));
    assert.ok(parsed.profissionaisAmostra[0].includes('0205020046'));
    assert.ok(parsed.profissionaisAmostra[0].includes('0205020097'));
});

test('parseBpaFile para BPA-C não possui CNS individual', () => {
    const { b } = setup();
    const raw = '02' + '1234567' + '202607' + '225125' + '001' + '01' + '0301010072' + '030' + '000120' + 'BPA';
    const text = '01#BPA#2026070000010000011234\r\n' + raw + '\r\n';
    const parsed = b.parseBpaFile({ name: 'PABACABAL.JUL', size: text.length }, text);

    assert.equal(parsed.tipoBpa, 'BPA-C');
    assert.equal(parsed.totalProfissionais, 0);
    assert.equal(parsed.profissionaisDetalhados.length, 0);
    assert.equal(parsed.profissionaisAmostra.length, 0);
});

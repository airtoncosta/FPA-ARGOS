/**
 * Script de Processamento e Conversão da Tabela Unificada SIGTAP (DATASUS)
 * Executado localmente ou pelo GitHub Actions do FPA ARGOS.
 */

const fs = require('fs');
const path = require('path');

const inputDir = process.argv[2] || './dados_sigtap_temp';
const outputDir = process.argv[3] || './code_sandbox_light_git_fe61910d_1781185357/sigtap_data';

if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

console.log('🚀 Iniciando processamento da Tabela Unificada SIGTAP...');
console.log(`📁 Diretório de Entrada: ${inputDir}`);
console.log(`📁 Diretório de Saída: ${outputDir}`);

// 1. Localizar arquivos descompactados (case-insensitive para compatibilidade Linux/Windows)
function findFile(dir, pattern) {
    if (!fs.existsSync(dir)) return null;
    const files = fs.readdirSync(dir);
    const found = files.find(f => f.toLowerCase() === pattern.toLowerCase());
    return found ? path.join(dir, found) : null;
}

const fileProc = findFile(inputDir, 'tb_procedimento.txt');
const fileCbo = findFile(inputDir, 'rl_procedimento_ocupacao.txt');
const fileCid = findFile(inputDir, 'rl_procedimento_cid.txt');
const fileDesc = findFile(inputDir, 'tb_descricao.txt');
const fileDescricao = findFile(inputDir, 'tb_procedimento_descricao.txt') || fileDesc;

if (!fileProc) {
    console.error('❌ ERRO: tb_procedimento.txt não encontrado no diretório especificado.');
    process.exit(1);
}

console.log('📖 Lendo tb_procedimento.txt...');
const procContent = fs.readFileSync(fileProc, 'latin1');
const procLines = procContent.split(/\r?\n/);

const sigtap = {};
let competenciaIdentificada = 'DESCONHECIDA';

for (const line of procLines) {
    if (!line || line.length < 20) continue;

    // Layout padrão DATASUS para tb_procedimento.txt:
    // CO_PROCEDIMENTO: 0..10
    // NO_PROCEDIMENTO: 10..260
    // TP_COMPLEXIDADE: 260..261
    // TP_SEXO: 261..262
    // QT_MAXIMA_EXECUCAO: 262..266
    // QT_DIAS_PERMANENCIA: 266..270
    // QT_PONTOS: 270..274
    // VL_IDADE_MINIMA: 274..278
    // VL_IDADE_MAXIMA: 278..282
    // CO_FINANCIAMENTO: 282..284
    // CO_RUBRICA: 284..290
    // DT_COMPETENCIA: 290..296 (dependendo do layout pode estar em 294..300)
    
    const co_procedimento = line.substring(0, 10).trim();
    const no_procedimento = line.substring(10, 260).trim();

    if (!co_procedimento || !no_procedimento) continue;

    const tp_complexidade = line.length >= 261 ? line.substring(260, 261).trim() : '';
    const tp_sexo = line.length >= 262 ? line.substring(261, 262).trim() : '';
    const co_financiamento = line.length >= 284 ? line.substring(282, 284).trim() : '';
    const co_rubrica = line.length >= 290 ? line.substring(284, 290).trim() : '';

    // Tentar extrair competência da linha
    if (competenciaIdentificada === 'DESCONHECIDA' && line.length >= 300) {
        const rawComp = line.substring(290, 300).match(/202[0-9]{3}/);
        if (rawComp) competenciaIdentificada = rawComp[0];
    }

    sigtap[co_procedimento] = {
        codigo: co_procedimento,
        nome: no_procedimento,
        grupo: co_procedimento.substring(0, 2),
        subgrupo: co_procedimento.substring(0, 4),
        forma: co_procedimento.substring(0, 6),
        complexidade: tp_complexidade,
        sexo: tp_sexo,
        financiamento: co_financiamento,
        rubrica: co_rubrica,
        cbos: [],
        cids: []
    };
}

console.log(`✅ ${Object.keys(sigtap).length} procedimentos carregados.`);

// 2. Processar CBOs autorizados se existir
if (fileCbo) {
    console.log('🩺 Processando rl_procedimento_ocupacao.txt (CBOs)...');
    const cboContent = fs.readFileSync(fileCbo, 'latin1');
    const cboLines = cboContent.split(/\r?\n/);
    let cboCount = 0;

    for (const line of cboLines) {
        if (!line || line.length < 16) continue;
        const codProc = line.substring(0, 10).trim();
        const codCbo = line.substring(10, 16).trim();

        if (sigtap[codProc] && codCbo) {
            sigtap[codProc].cbos.push(codCbo);
            cboCount++;
        }
    }
    console.log(`✅ ${cboCount} vínculos procedimento-CBO processados.`);
}

// 3. Processar CIDs compatíveis se existir
if (fileCid) {
    console.log('📋 Processando rl_procedimento_cid.txt (CIDs)...');
    const cidContent = fs.readFileSync(fileCid, 'latin1');
    const cidLines = cidContent.split(/\r?\n/);
    let cidCount = 0;

    for (const line of cidLines) {
        if (!line || line.length < 14) continue;
        const codProc = line.substring(0, 10).trim();
        const codCid = line.substring(10, 14).trim();
        const stPrincipal = line.length >= 15 ? line.substring(14, 15).trim() : 'S';

        if (sigtap[codProc] && codCid) {
            sigtap[codProc].cids.push({ cid: codCid, principal: stPrincipal === 'S' });
            cidCount++;
        }
    }
    console.log(`✅ ${cidCount} vínculos procedimento-CID processados.`);
}

// Se o nome do diretório contiver a competência (ex: TabelaUnificada_202608...), extrai dele:
const dirMatch = inputDir.match(/202[0-9]{3}/);
if (dirMatch) {
    competenciaIdentificada = dirMatch[0];
}

const metadata = {
    competencia: competenciaIdentificada,
    total_procedimentos: Object.keys(sigtap).length,
    atualizado_em: new Date().toISOString(),
    fonte: 'FTP DATASUS / Ministério da Saúde'
};

// Salvar arquivos consolidados
const jsonPath = path.join(outputDir, 'sigtap_vigente.json');
const metaPath = path.join(outputDir, 'sigtap_metadata.json');
const jsExportPath = path.join(outputDir, 'sigtap_dict.js');

console.log('💾 Salvando arquivos otimizados...');
fs.writeFileSync(jsonPath, JSON.stringify(sigtap), 'utf8');
fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2), 'utf8');

// Cria também uma versão JS direta para consumo instantâneo no navegador
const jsContent = `// Tabela Unificada SIGTAP — Competência ${competenciaIdentificada}
// Atualizado automaticamente em ${metadata.atualizado_em} via DATASUS FTP
window.SIGTAP_VIGENTE = ${JSON.stringify(sigtap)};
window.SIGTAP_METADATA = ${JSON.stringify(metadata)};
`;
fs.writeFileSync(jsExportPath, jsContent, 'utf8');

console.log(`🎉 Sucesso! Arquivos salvos em ${outputDir}:`);
console.log(`   - ${jsonPath} (${(fs.statSync(jsonPath).size / 1024 / 1024).toFixed(2)} MB)`);
console.log(`   - ${metaPath}`);
console.log(`   - ${jsExportPath}`);

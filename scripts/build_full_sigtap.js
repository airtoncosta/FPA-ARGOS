/**
 * Script de Geração do Catálogo Oficial SIGTAP do FPA ARGOS
 * Baixa todos os procedimentos oficiais com valores reais e metadados diretamente da API/DATASUS.
 */

const fs = require('fs');
const path = require('path');

const API_BASE = 'https://sigtap-api.vercel.app/api/v1/sigtap';
const OUT_JS = path.join(__dirname, '..', 'code_sandbox_light_git_fe61910d_1781185357', 'js', 'sigtap.js');
const OUT_DATA_DIR = path.join(__dirname, '..', 'code_sandbox_light_git_fe61910d_1781185357', 'sigtap_data');
const OUT_JSON = path.join(OUT_DATA_DIR, 'sigtap_vigente.json');
const OUT_META = path.join(OUT_DATA_DIR, 'sigtap_metadata.json');

async function fetchAllProcedimentos() {
    console.log('📡 Conectando à API oficial do SIGTAP...');
    let page = 1;
    const allProcs = [];
    let comp = '202608';

    while (true) {
        const url = `${API_BASE}/procedimentos/?page=${page}&page_size=200`;
        process.stdout.write(`📥 Baixando página ${page}... `);
        const res = await fetch(url);
        if (!res.ok) {
            console.error(`❌ Erro HTTP ${res.status} na página ${page}`);
            break;
        }
        const data = await res.json();
        if (data.competencia) comp = data.competencia;
        const results = data.results || [];
        allProcs.push(...results);
        console.log(`+${results.length} itens (Total: ${allProcs.length}/${data.count})`);

        if (!data.next || results.length === 0) break;
        page++;
    }

    console.log(`✅ Sucesso: ${allProcs.length} procedimentos baixados.`);
    return { procs: allProcs, competencia: comp };
}

async function main() {
    if (!fs.existsSync(OUT_DATA_DIR)) {
        fs.mkdirSync(OUT_DATA_DIR, { recursive: true });
    }

    const { procs, competencia } = await fetchAllProcedimentos();

    const sigtapMap = {};
    const sigtapTabela = {};

    for (const p of procs) {
        const cod = p.co_procedimento;
        const nome = p.no_procedimento || `Procedimento ${cod}`;
        const vlSa = parseFloat(p.vl_sa) || 0;
        const vlSh = parseFloat(p.vl_sh) || 0;
        const vlSp = parseFloat(p.vl_sp) || 0;

        sigtapMap[cod] = nome;
        sigtapTabela[cod] = {
            codigo: cod,
            nome: nome,
            vl_sa: vlSa,
            vl_sh: vlSh,
            vl_sp: vlSp,
            financiamento: p.financiamento || '',
            complexidade: p.tp_complexidade || '',
            sexo: p.tp_sexo || 'I',
            grupo: p.co_grupo || cod.substring(0, 2),
            subgrupo: p.co_sub_grupo || cod.substring(0, 4),
            forma: p.co_forma_organizacao || cod.substring(0, 6)
        };
    }

    const metadata = {
        competencia: competencia,
        total_procedimentos: Object.keys(sigtapTabela).length,
        atualizado_em: new Date().toISOString(),
        fonte: 'API Oficial SIGTAP / Ministério da Saúde / DATASUS',
        versao: '4.0.0'
    };

    // Salvar JSON bruto em sigtap_data
    fs.writeFileSync(OUT_JSON, JSON.stringify(sigtapTabela, null, 2), 'utf8');
    fs.writeFileSync(OUT_META, JSON.stringify(metadata, null, 2), 'utf8');

    // Subgrupos estruturais da Tabela Unificada
    const subgrupos = {
        "0101": "Ações de Promoção e Prevenção em Saúde",
        "0102": "Acolhimento com Classificação de Risco",
        "0201": "Coleta de Material",
        "0202": "Diagnóstico em Laboratório Clínico",
        "0203": "Diagnóstico por Anatomia Patológica e Citopatologia",
        "0204": "Diagnóstico por Radiologia",
        "0205": "Diagnóstico por Ultrassonografia",
        "0206": "Diagnóstico por Tomografia",
        "0207": "Diagnóstico por Ressonância Magnética",
        "0208": "Diagnóstico por Medicina Nuclear In Vivo",
        "0209": "Diagnóstico por Endoscopia",
        "0210": "Diagnóstico por Radiologia Intervencionista",
        "0211": "Métodos Diagnósticos em Especialidades",
        "0212": "Diagnóstico e Acompanhamento em Odontologia",
        "0213": "Diagnóstico e Acompanhamento em Transplantes",
        "0214": "Exames de Triagem Neonatal",
        "0301": "Consultas / Atendimentos / Acompanhamentos",
        "0302": "Fisioterapia",
        "0303": "Tratamentos Clínicos (Outras Especialidades)",
        "0304": "Tratamento em Oncologia",
        "0305": "Tratamento em Nefrologia",
        "0306": "Hemoterapia",
        "0307": "Tratamentos Odontológicos",
        "0308": "Tratamento de Lesões, Envenenamentos e Outros",
        "0309": "Terapias Especializadas",
        "0310": "Parto e Nascimento",
        "0401": "Pequenas Cirurgias e Cirurgias de Pele/Mucosa",
        "0402": "Cirurgia de Glândulas Endócrinas",
        "0403": "Cirurgia do Sistema Nervoso Central e Periférico",
        "0404": "Cirurgia das Vias Aéreas Superiores, da Cabeça e do Pescoço",
        "0405": "Cirurgia do Aparelho da Visão",
        "0406": "Cirurgia do Aparelho Circulatório",
        "0407": "Cirurgia do Aparelho Digestivo e Parede Abdominal",
        "0408": "Cirurgia do Sistema Osteomuscular",
        "0409": "Cirurgia do Aparelho Geniturinário",
        "0410": "Cirurgia de Mama",
        "0411": "Cirurgia Obstétrica",
        "0412": "Cirurgia Torácica",
        "0413": "Cirurgia Reparadora",
        "0414": "Cirurgia Bucomaxilofacial",
        "0415": "Outras Cirurgias",
        "0416": "Cirurgia em Oncologia",
        "0501": "Coleta e Processamento de Órgãos, Tecidos e Células",
        "0502": "Avaliação de Doador Vivo",
        "0503": "Transplantes",
        "0504": "Acompanhamento Pós-transplante",
        "0505": "Busca Ativa de Doadores",
        "0506": "Outros Relacionados a Transplantes",
        "0601": "Medicamentos",
        "0602": "Materiais Especiais",
        "0603": "Medicamentos para Doenças Endêmicas e Outros",
        "0604": "Componentes do Sangue e Hemoderivados",
        "0701": "Órteses, Próteses e Materiais Especiais (OPM)",
        "0702": "OPM em Odontologia",
        "0801": "Ações Relacionadas ao Estabelecimento de Saúde",
        "0802": "Ações Relacionadas ao Profissional de Saúde",
        "0803": "Ações Relacionadas ao Paciente"
    };

    // Construir sigtap.js unificado
    const jsContent = `/**
 * ARGOS — Catálogo Oficial da Tabela Unificada SIGTAP (SUS)
 * Competência Vigente: ${competencia}
 * Total de Procedimentos: ${Object.keys(sigtapTabela).length}
 * Atualizado automaticamente via API Oficial do Ministério da Saúde / DATASUS.
 */

// 1. Tabela Unificada Completa (com valores oficiais e metadados de financiamento)
const SIGTAP_TABELA = ${JSON.stringify(sigtapTabela)};

// 2. Mapa Rápido Código -> Descrição (compatibilidade com todo o sistema legado)
const SIGTAP = ${JSON.stringify(sigtapMap)};

// 3. Subgrupos Estruturais da Tabela Unificada
const SIGTAP_SUBGRUPOS = ${JSON.stringify(subgrupos, null, 4)};

// 4. Metadados Oficiais
const SIGTAP_METADATA = ${JSON.stringify(metadata, null, 4)};

// 5. Função Utilitária Global para Obtenção Confiável de Dados do Procedimento
function getSigtapProcedimento(codigo) {
    if (!codigo) return null;
    const clean = String(codigo).replace(/\\D/g, '');
    return SIGTAP_TABELA[clean] || null;
}

function getSigtapNome(codigo) {
    if (!codigo) return '';
    const clean = String(codigo).replace(/\\D/g, '');
    return SIGTAP[clean] || (SIGTAP_TABELA[clean] ? SIGTAP_TABELA[clean].nome : ('Procedimento ' + codigo));
}

function getSigtapValor(codigo, tipo = 'sa') {
    const item = getSigtapProcedimento(codigo);
    if (!item) return 0;
    if (tipo === 'sh') return item.vl_sh || 0;
    if (tipo === 'sp') return item.vl_sp || 0;
    return item.vl_sa || 0;
}

// Expor globalmente para todos os scripts do ARGOS
window.SIGTAP_TABELA = SIGTAP_TABELA;
window.SIGTAP = SIGTAP;
window.SIGTAP_SUBGRUPOS = SIGTAP_SUBGRUPOS;
window.SIGTAP_METADATA = SIGTAP_METADATA;
window.getSigtapProcedimento = getSigtapProcedimento;
window.getSigtapNome = getSigtapNome;
window.getSigtapValor = getSigtapValor;
`;

    fs.writeFileSync(OUT_JS, jsContent, 'utf8');
    console.log(`💾 Catálogo salvo em: ${OUT_JS} (${(fs.statSync(OUT_JS).size / 1024 / 1024).toFixed(2)} MB)`);
    console.log(`💾 JSON salvo em: ${OUT_JSON}`);
    console.log(`💾 Metadados salvos em: ${OUT_META}`);
    console.log('🎉 Geração do Catálogo SIGTAP concluída com sucesso!');
}

main().catch(console.error);

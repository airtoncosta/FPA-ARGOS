/**
 * ARGOS FPA — data.js
 * Dados de demonstração baseados no Consolidado Real
 * Bacabal/MA — Janeiro a Abril de 2026 — SIA/SUS
 */

const DEMO_DATA = {
    municipio: 'Bacabal',
    uf: 'MA',
    sistema: 'SIA/SUS',
    competencia: 'Janeiro a Abril de 2026',
    ano: 2026,

    /* =============================================
       RESUMO GERAL DO PERÍODO
       ============================================= */
    resumo: {
        qtdApresentada: 259964,
        qtdAprovada:    257720,
        qtdGlosada:     2244,
        valApresentado: 5435722.55,
        valAprovado:    5429301.46,
        valGlosado:     6421.09,
        pctAprovacaoQtd: 99.14,
        pctGlosaQtd:     0.86,
        totalUnidades:   21
    },

    /* =============================================
       FATURAMENTO POR MÊS
       ============================================= */
    faturamentoMensal: [
        {
            mes: '01', nomeMes: 'Janeiro', competencia: '01/2026',
            qtdApresentada: 61438, qtdAprovada: 61128, qtdGlosada: 310,
            valApresentado: 1267711.81, valAprovado: 1267332.08, valGlosado: 379.73,
            pctAprovado: 99.50
        },
        {
            mes: '02', nomeMes: 'Fevereiro', competencia: '02/2026',
            qtdApresentada: 53336, qtdAprovada: 52954, qtdGlosada: 382,
            valApresentado: 1053883.92, valAprovado: 1053314.84, valGlosado: 569.08,
            pctAprovado: 99.28
        },
        {
            mes: '03', nomeMes: 'Março', competencia: '03/2026',
            qtdApresentada: 74291, qtdAprovada: 73917, qtdGlosada: 374,
            valApresentado: 1585504.96, valAprovado: 1584834.72, valGlosado: 670.24,
            pctAprovado: 99.50
        },
        {
            mes: '04', nomeMes: 'Abril', competencia: '04/2026',
            qtdApresentada: 70899, qtdAprovada: 69721, qtdGlosada: 1178,
            valApresentado: 1528621.86, valAprovado: 1523820.02, valGlosado: 4801.84,
            pctAprovado: 99.34
        }
    ],

    /* =============================================
       UNIDADES DE SAÚDE — EFICIÊNCIA
       ============================================= */
    unidades: [
        {
            id: 'hmso', cnes: '2387412',
            nome: 'HOSPITAL MARIA SOCORRO BRANDÃO',
            tipo: 'Hospital',
            qtdApresentada: 82316, qtdAprovada: 81984, qtdGlosada: 332,
            valApresentado: 2496285.37, valAprovado: 2494691.77, valGlosado: 1593.60,
            pctAprovacaoQtd: 99.60, pctAprovacaoVal: 99.94,
            rank: 1, pctDoTotal: 45.95
        },
        {
            id: 'tfd', cnes: '0000001',
            nome: 'TFD',
            tipo: 'TFD',
            qtdApresentada: 44233, qtdAprovada: 44233, qtdGlosada: 0,
            valApresentado: 654196.95, valAprovado: 654196.95, valGlosado: 0,
            pctAprovacaoQtd: 100.00, pctAprovacaoVal: 100.00,
            rank: 4, pctDoTotal: 12.05
        },
        {
            id: 'hmi', cnes: '2387439',
            nome: 'HOSPITAL MATERNO INFANTIL',
            tipo: 'Hospital',
            qtdApresentada: 37915, qtdAprovada: 38973, qtdGlosada: 942,
            valApresentado: 719619.93, valAprovado: 717845.82, valGlosado: 1774.11,
            pctAprovacaoQtd: 97.52, pctAprovacaoVal: 99.75,
            rank: 2, pctDoTotal: 13.22
        },
        {
            id: 'lcdias', cnes: '2389114',
            nome: 'LABORATÓRIO CENTRAL DR. COELHO DIAS',
            tipo: 'Laboratório',
            qtdApresentada: 34377, qtdAprovada: 34276, qtdGlosada: 101,
            valApresentado: 708034.91, valAprovado: 178546.02, valGlosado: 0,
            pctAprovacaoQtd: 99.71, pctAprovacaoVal: 100.00,
            rank: 8, pctDoTotal: 3.29
        },
        {
            id: 'cesp', cnes: '2389122',
            nome: 'CENTRO DE ESPECIALIDADES DR. COELHO',
            tipo: 'Centro de Especialidades',
            qtdApresentada: 14052, qtdAprovada: 14052, qtdGlosada: 0,
            valApresentado: 189350.99, valAprovado: 189350.99, valGlosado: 0,
            pctAprovacaoQtd: 100.00, pctAprovacaoVal: 100.00,
            rank: 5, pctDoTotal: 3.49
        },
        {
            id: 'sae', cnes: '2389130',
            nome: 'SAE',
            tipo: 'Serviço de Atenção Especializada',
            qtdApresentada: 12403, qtdAprovada: 12403, qtdGlosada: 0,
            valApresentado: 189350.99, valAprovado: 183350.99, valGlosado: 0,
            pctAprovacaoQtd: 100.00, pctAprovacaoVal: 100.00,
            rank: 6, pctDoTotal: 3.40
        },
        {
            id: 'fisio', cnes: '2389149',
            nome: 'CENTRO DE FISIOTERAPIA',
            tipo: 'Centro de Fisioterapia',
            qtdApresentada: 6782, qtdAprovada: 6629, qtdGlosada: 153,
            valApresentado: 157804.47, valAprovado: 157242.96, valGlosado: 561.51,
            pctAprovacaoQtd: 97.74, pctAprovacaoVal: 99.64,
            rank: 9, pctDoTotal: 2.90
        },
        {
            id: 'creg', cnes: '2389157',
            nome: 'CENTRAL DE REGULAÇÃO',
            tipo: 'Central de Regulação',
            qtdApresentada: 6203, qtdAprovada: 6203, qtdGlosada: 0,
            valApresentado: 216929.80, valAprovado: 83.70, valGlosado: 0,
            pctAprovacaoQtd: 100.00, pctAprovacaoVal: 100.00,
            rank: 15, pctDoTotal: 0.00
        },
        {
            id: 'pbacabal', cnes: '2389165',
            nome: 'POLICLÍNICA DE BACABAL',
            tipo: 'Policlínica',
            qtdApresentada: 5980, qtdAprovada: 5980, qtdGlosada: 0,
            valApresentado: 216929.80, valAprovado: 216929.80, valGlosado: 0,
            pctAprovacaoQtd: 100.00, pctAprovacaoVal: 100.00,
            rank: 7, pctDoTotal: 4.00
        },
        {
            id: 'caps', cnes: '7014710',
            nome: 'CAPS',
            tipo: 'CAPS',
            qtdApresentada: 4232, qtdAprovada: 4173, qtdGlosada: 59,
            valApresentado: 55226.01, valAprovado: 55066.71, valGlosado: 159.30,
            pctAprovacaoQtd: 98.61, pctAprovacaoVal: 99.71,
            rank: 10, pctDoTotal: 1.01
        },
        {
            id: 'cta', cnes: '7083834',
            nome: 'CTA',
            tipo: 'CTA',
            qtdApresentada: 3399, qtdAprovada: 3399, qtdGlosada: 645,
            valApresentado: 18519.50, valAprovado: 14219.33, valGlosado: 2300.17,
            pctAprovacaoQtd: 100.00, pctAprovacaoVal: 76.77,
            rank: 12, pctDoTotal: 0.26
        },
        {
            id: 'capsi', cnes: '9654321',
            nome: 'CAPSI',
            tipo: 'CAPS Infantil',
            qtdApresentada: 2776, qtdAprovada: 2131, qtdGlosada: 645,
            valApresentado: 18519.50, valAprovado: 14219.33, valGlosado: 4300.17,
            pctAprovacaoQtd: 76.77, pctAprovacaoVal: 76.77,
            rank: 13, pctDoTotal: 0.26
        },
        {
            id: 'visanit', cnes: '2389173',
            nome: 'VIGILÂNCIA SANITÁRIA',
            tipo: 'Vigilância Sanitária',
            qtdApresentada: 2052, qtdAprovada: 2052, qtdGlosada: 0,
            valApresentado: 0, valAprovado: 0, valGlosado: 0,
            pctAprovacaoQtd: 100.00, pctAprovacaoVal: 0.00,
            rank: 21, pctDoTotal: 0.00
        },
        {
            id: 'savsav01', cnes: '2389181',
            nome: 'SAMU SAV 01',
            tipo: 'SAMU',
            qtdApresentada: 717, qtdAprovada: 717, qtdGlosada: 0,
            valApresentado: 25200.00, valAprovado: 25200.00, valGlosado: 0,
            pctAprovacaoQtd: 100.00, pctAprovacaoVal: 100.00,
            rank: 17, pctDoTotal: 0.46
        },
        {
            id: 'ceo', cnes: '2389200',
            nome: 'CEO',
            tipo: 'Centro de Especialidades Odontológicas',
            qtdApresentada: 658, qtdAprovada: 658, qtdGlosada: 0,
            valApresentado: 25200.00, valAprovado: 25200.00, valGlosado: 0,
            pctAprovacaoQtd: 100.00, pctAprovacaoVal: 100.00,
            rank: 11, pctDoTotal: 0.46
        },
        {
            id: 'sbv01', cnes: '2389219',
            nome: 'SAMU SBV 01',
            tipo: 'SAMU',
            qtdApresentada: 536, qtdAprovada: 536, qtdGlosada: 0,
            valApresentado: 0, valAprovado: 0, valGlosado: 0,
            pctAprovacaoQtd: 100.00, pctAprovacaoVal: 0.00,
            rank: 18, pctDoTotal: 0.00
        },
        {
            id: 'sbv02', cnes: '2389227',
            nome: 'SAMU SBV 02',
            tipo: 'SAMU',
            qtdApresentada: 494, qtdAprovada: 494, qtdGlosada: 0,
            valApresentado: 0, valAprovado: 0, valGlosado: 0,
            pctAprovacaoQtd: 100.00, pctAprovacaoVal: 0.00,
            rank: 19, pctDoTotal: 0.00
        },
        {
            id: 'sbv03', cnes: '2389235',
            nome: 'SAMU SBV 03',
            tipo: 'SAMU',
            qtdApresentada: 443, qtdAprovada: 443, qtdGlosada: 0,
            valApresentado: 0, valAprovado: 0, valGlosado: 0,
            pctAprovacaoQtd: 100.00, pctAprovacaoVal: 0.00,
            rank: 20, pctDoTotal: 0.00
        },
        {
            id: 'moto01', cnes: '2389243',
            nome: 'MOTOLÂNCIA 01',
            tipo: 'Motolância',
            qtdApresentada: 170, qtdAprovada: 170, qtdGlosada: 0,
            valApresentado: 135.00, valAprovado: 102.60, valGlosado: 32.40,
            pctAprovacaoQtd: 100.00, pctAprovacaoVal: 76.00,
            rank: 16, pctDoTotal: 0.00
        },
        {
            id: 'moto02', cnes: '2389251',
            nome: 'MOTOLÂNCIA 02',
            tipo: 'Motolância',
            qtdApresentada: 156, qtdAprovada: 144, qtdGlosada: 12,
            valApresentado: 135.00, valAprovado: 0, valGlosado: 0,
            pctAprovacaoQtd: 92.31, pctAprovacaoVal: 0.00,
            rank: 14, pctDoTotal: 0.00
        },
        {
            id: 'moto03', cnes: '2389260',
            nome: 'MOTOLÂNCIA 03',
            tipo: 'Motolância',
            qtdApresentada: 70, qtdAprovada: 70, qtdGlosada: 0,
            valApresentado: 0, valAprovado: 0, valGlosado: 0,
            pctAprovacaoQtd: 100.00, pctAprovacaoVal: 0.00,
            rank: 16, pctDoTotal: 0.00
        }
    ],

    /* =============================================
       TOP PROCEDIMENTOS (SIGTAP)
       ============================================= */
    procedimentos: [
        { 
            codigo: '0301010072', descricao: 'Consulta Médica em Atenção Especializada', qtdAprovada: 32450, valAprovado: 298540.00, valUnitario: 9.20,
            cbos: [
                { codigo: '225125', descricao: 'Médico Clínico', qtdAprovada: 20000, valAprovado: 184000.00 },
                { codigo: '225133', descricao: 'Médico Psiquiatra', qtdAprovada: 12450, valAprovado: 114540.00 }
            ]
        },
        { 
            codigo: '0202010385', descricao: 'Hemograma Completo', qtdAprovada: 28920, valAprovado: 52056.00, valUnitario: 1.80,
            cbos: [
                { codigo: '223505', descricao: 'Enfermeiro', qtdAprovada: 28920, valAprovado: 52056.00 }
            ]
        },
        { 
            codigo: '0205020143', descricao: 'Ultrassonografia Obstétrica', qtdAprovada: 18340, valAprovado: 183400.00, valUnitario: 10.00,
            cbos: [
                { codigo: '225125', descricao: 'Médico Clínico', qtdAprovada: 18340, valAprovado: 183400.00 }
            ]
        },
        { 
            codigo: '0301010030', descricao: 'Consulta de Profissionais de Nível Superior na Atenção Primária (Exceto Médico)', qtdAprovada: 17820, valAprovado: 98010.00, valUnitario: 5.50,
            cbos: [
                { codigo: '223505', descricao: 'Enfermeiro', qtdAprovada: 10000, valAprovado: 55000.00 },
                { codigo: '251510', descricao: 'Psicólogo Clínico', qtdAprovada: 7820, valAprovado: 43010.00 }
            ]
        },
        { 
            codigo: '0202010473', descricao: 'Dosagem de Glicose', qtdAprovada: 15680, valAprovado: 23520.00, valUnitario: 1.50,
            cbos: [
                { codigo: '223505', descricao: 'Enfermeiro', qtdAprovada: 15680, valAprovado: 23520.00 }
            ]
        },
        { 
            codigo: '0204030170', descricao: 'Radiografia de Tórax (PA)', qtdAprovada: 12450, valAprovado: 44820.00, valUnitario: 3.60,
            cbos: [
                { codigo: '225125', descricao: 'Médico Clínico', qtdAprovada: 12450, valAprovado: 44820.00 }
            ]
        },
        { 
            codigo: '0202060250', descricao: 'Dosagem de Hormônio Tireoestimulante (TSH)', qtdAprovada: 11230, valAprovado: 56150.00, valUnitario: 5.00,
            cbos: [
                { codigo: '223505', descricao: 'Enfermeiro', qtdAprovada: 11230, valAprovado: 56150.00 }
            ]
        },
        { 
            codigo: '0301060061', descricao: 'Atendimento de Urgência em Atenção Especializada', qtdAprovada: 10890, valAprovado: 152460.00, valUnitario: 14.00,
            cbos: [
                { codigo: '225125', descricao: 'Médico Clínico', qtdAprovada: 10890, valAprovado: 152460.00 }
            ]
        },
        { 
            codigo: '0202010295', descricao: 'Dosagem de Colesterol Total', qtdAprovada: 10450, valAprovado: 15675.00, valUnitario: 1.50,
            cbos: [
                { codigo: '223505', descricao: 'Enfermeiro', qtdAprovada: 10450, valAprovado: 15675.00 }
            ]
        },
        { 
            codigo: '0205020046', descricao: 'Ultrassonografia de Abdômen Total', qtdAprovada: 9870, valAprovado: 98700.00, valUnitario: 10.00,
            cbos: [
                { codigo: '225125', descricao: 'Médico Clínico', qtdAprovada: 9870, valAprovado: 98700.00 }
            ]
        },
        { 
            codigo: '0202050017', descricao: 'Urina Tipo I (EAS)', qtdAprovada: 9540, valAprovado: 14310.00, valUnitario: 1.50,
            cbos: [
                { codigo: '223505', descricao: 'Enfermeiro', qtdAprovada: 9540, valAprovado: 14310.00 }
            ]
        },
        { 
            codigo: '0301040036', descricao: 'Terapia em Grupo (CAPS)', qtdAprovada: 8760, valAprovado: 61320.00, valUnitario: 7.00,
            cbos: [
                { codigo: '251510', descricao: 'Psicólogo Clínico', qtdAprovada: 5000, valAprovado: 35000.00 },
                { codigo: '251605', descricao: 'Assistente Social', qtdAprovada: 3760, valAprovado: 26320.00 }
            ]
        },
        { 
            codigo: '0211020036', descricao: 'Eletrocardiograma (ECG)', qtdAprovada: 7890, valAprovado: 31560.00, valUnitario: 4.00,
            cbos: [
                { codigo: '225125', descricao: 'Médico Clínico', qtdAprovada: 7890, valAprovado: 31560.00 }
            ]
        },
        { 
            codigo: '0202080081', descricao: 'Exame Parasitológico de Fezes (EPF)', qtdAprovada: 7230, valAprovado: 14460.00, valUnitario: 2.00,
            cbos: [
                { codigo: '223505', descricao: 'Enfermeiro', qtdAprovada: 7230, valAprovado: 14460.00 }
            ]
        },
        { 
            codigo: '0301050147', descricao: 'Visita Domiciliar por Profissional de Nível Superior', qtdAprovada: 6890, valAprovado: 34450.00, valUnitario: 5.00,
            cbos: [
                { codigo: '223505', descricao: 'Enfermeiro', qtdAprovada: 4000, valAprovado: 20000.00 },
                { codigo: '225130', descricao: 'Médico de Família e Comunidade', qtdAprovada: 2890, valAprovado: 14450.00 }
            ]
        }
    ],
    cbos: [
        { 
            codigo: '225125', descricao: 'Médico Clínico', qtdAprovada: 45000, valAprovado: 620000.00,
            procedimentos: [
                { codigo: '0301010072', descricao: 'Consulta Médica em Atenção Primária', qtdAprovada: 35000, valAprovado: 450000.00 },
                { codigo: '0301060029', descricao: 'Atendimento de Urgência em Atenção Especializada', qtdAprovada: 10000, valAprovado: 170000.00 }
            ]
        },
        { 
            codigo: '225130', descricao: 'Médico de Família e Comunidade', qtdAprovada: 38000, valAprovado: 510000.00,
            procedimentos: [
                { codigo: '0301010072', descricao: 'Consulta Médica em Atenção Primária', qtdAprovada: 30000, valAprovado: 390000.00 },
                { codigo: '0301050147', descricao: 'Visita Domiciliar por Profissional de Nível Superior', qtdAprovada: 8000, valAprovado: 120000.00 }
            ]
        },
        { 
            codigo: '223505', descricao: 'Enfermeiro', qtdAprovada: 32000, valAprovado: 210000.00,
            procedimentos: [
                { codigo: '0301010048', descricao: 'Consulta de Profissional de Nível Superior na Atenção Primária (exceto médico)', qtdAprovada: 25000, valAprovado: 175000.00 },
                { codigo: '0301050147', descricao: 'Visita Domiciliar por Profissional de Nível Superior', qtdAprovada: 7000, valAprovado: 35000.00 }
            ]
        },
        { 
            codigo: '322205', descricao: 'Técnico de Enfermagem', qtdAprovada: 58000, valAprovado: 180000.00,
            procedimentos: [
                { codigo: '0301100012', descricao: 'Administração de Medicamentos na Atenção Básica', qtdAprovada: 38000, valAprovado: 100000.00 },
                { codigo: '0301100101', descricao: 'Aferição de Pressão Arterial', qtdAprovada: 20000, valAprovado: 80000.00 }
            ]
        },
        { 
            codigo: '251605', descricao: 'Assistente Social', qtdAprovada: 12000, valAprovado: 95000.00,
            procedimentos: [
                { codigo: '0301010145', descricao: 'Atendimento Coletivo por Profissional de Nível Superior', qtdAprovada: 12000, valAprovado: 95000.00 }
            ]
        },
        { 
            codigo: '251510', descricao: 'Psicólogo Clínico', qtdAprovada: 15000, valAprovado: 135000.00,
            procedimentos: [
                { codigo: '0301010145', descricao: 'Atendimento Individual em Psicoterapia', qtdAprovada: 15000, valAprovado: 135000.00 }
            ]
        },
        { 
            codigo: '223605', descricao: 'Fisioterapeuta Geral', qtdAprovada: 18000, valAprovado: 165000.00,
            procedimentos: [
                { codigo: '0302050027', descricao: 'Atendimento Fisioterapêutico nas Disfunções do Aparelho Locomotor', qtdAprovada: 18000, valAprovado: 165000.00 }
            ]
        },
        { 
            codigo: '223208', descricao: 'Cirurgião-Dentista - Clínico Geral', qtdAprovada: 8000, valAprovado: 120000.00,
            procedimentos: [
                { codigo: '0301010030', descricao: 'Consulta Odontológica', qtdAprovada: 5000, valAprovado: 75000.00 },
                { codigo: '0301120048', descricao: 'Procedimento Clínico Odontológico', qtdAprovada: 3000, valAprovado: 45000.00 }
            ]
        },
        { 
            codigo: '225133', descricao: 'Médico Psiquiatra', qtdAprovada: 6000, valAprovado: 90000.00,
            procedimentos: [
                { codigo: '0301010072', descricao: 'Consulta Médica em Atenção Especializada', qtdAprovada: 6000, valAprovado: 90000.00 }
            ]
        },
        { 
            codigo: '515105', descricao: 'Agente Comunitário de Saúde', qtdAprovada: 25000, valAprovado: 0.00,
            procedimentos: [
                { codigo: '0301050155', descricao: 'Visita Domiciliar Ativa do ACS', qtdAprovada: 25000, valAprovado: 0.00 }
            ]
        }
    ],

    /* =============================================
       EVOLUÇÃO MENSAL POR UNIDADE (para detalhes)
       ============================================= */
    evolucaoUnidade: {
        'hmso':     { jan: 650000, fev: 580000, mar: 620000, abr: 644691 },
        'hmi':      { jan: 175000, fev: 165000, mar: 185000, abr: 192845 },
        'lcdias':   { jan: 40000,  fev: 42000,  mar: 48000,  abr: 48546  },
        'cesp':     { jan: 45000,  fev: 48000,  mar: 50000,  abr: 46350  },
        'pbacabal': { jan: 52000,  fev: 55000,  mar: 58000,  abr: 51929  },
        'caps':     { jan: 13000,  fev: 13500,  mar: 14500,  abr: 14066  },
        'cta':      { jan: 3400,   fev: 3500,   mar: 3700,   abr: 3619   },
        'capsi':    { jan: 3200,   fev: 3300,   mar: 3800,   abr: 3919   }
    }
};

/**
 * Classificador de Status por % Aprovação Financeira
 */
function classificarStatus(pct) {
    if (pct >= 99)         return { status: 'EXCELENTE', label: '✅ EXCELENTE', cls: 'badge-excelente', fillCls: 'fill-excellent' };
    if (pct >= 97)         return { status: 'BOA',       label: '✔️ BOA',       cls: 'badge-boa',       fillCls: 'fill-good'      };
    if (pct >= 95)         return { status: 'REGULAR',   label: '⚠️ REGULAR',   cls: 'badge-regular',   fillCls: 'fill-regular'   };
    return                        { status: 'CRITICA',   label: '❌ CRÍTICA',   cls: 'badge-critica',   fillCls: 'fill-critical'  };
}

/**
 * Formatadores
 */
const fmt = {
    moeda: (v) => {
        if (v === null || v === undefined || isNaN(v)) return 'R$ —';
        return 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    },
    numero: (v) => {
        if (v === null || v === undefined || isNaN(v)) return '—';
        return v.toLocaleString('pt-BR');
    },
    pct: (v) => {
        if (v === null || v === undefined || isNaN(v)) return '—';
        return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
    },
    data: () => {
        const now = new Date();
        return now.toLocaleDateString('pt-BR') + ' ' + now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    }
};

// Estado da aplicação
let APP_STATE = {
    data: null,
    filteredData: null,
    activeSection: 'executivo',
    filters: { ano: 'all', mes: 'all', unidade: 'all', status: 'all' },
    chartsInstances: {}
};

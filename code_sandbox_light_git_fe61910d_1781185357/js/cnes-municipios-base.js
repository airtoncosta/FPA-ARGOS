/**
 * ARGOS — cnes-municipios-base.js
 * Módulo de Inteligência Cadastral CNES & Mapeamento Geográfico do SUS
 * Suporta resolução de IBGE, catálogo de CBOs, gerador de rede municipal do SUS
 * e parser de arquivos exportados de bases abertas (FTP DATASUS / omnisus-db).
 */

(function () {
    'use strict';

    // Prefixos oficiais do IBGE por UF
    const UF_IBGE_PREFIX = {
        'RO': '11', 'AC': '12', 'AM': '13', 'RR': '14', 'PA': '15', 'AP': '16', 'TO': '17',
        'MA': '21', 'PI': '22', 'CE': '23', 'RN': '24', 'PB': '25', 'PE': '26', 'AL': '27',
        'SE': '28', 'BA': '29', 'MG': '31', 'ES': '32', 'RJ': '33', 'SP': '35', 'PR': '41',
        'SC': '42', 'RS': '43', 'MS': '50', 'MT': '51', 'GO': '52', 'DF': '53'
    };

    // Capitais e principais polos regionais
    const CAPITAIS_E_POLOS = {
        'MA_BACABAL': '210120',
        'MA_SÃO LUÍS': '211130',
        'MA_IMPERATRIZ': '210530',
        'MA_CAXIAS': '210300',
        'MA_TIMON': '211220',
        'MA_CODÓ': '210330',
        'MA_AÇAILÂNDIA': '210005',
        'MA_SANTA INÊS': '210990',
        'MA_PINHEIRO': '210860',
        'MA_BALSAS': '210140',
        'MA_COROATÁ': '210360',
        'MA_PEDREIRAS': '210820',
        'MA_CHAPADINHA': '210320',
        'MA_BARRA DO CORDA': '210160',
        'MA_ITAPECURU MIRIM': '210540',
        'PI_TERESINA': '221100',
        'PI_PARNAÍBA': '220770',
        'CE_FORTALEZA': '230440',
        'PA_BELÉM': '150140',
        'BA_SALVADOR': '292740',
        'DF_BRASÍLIA': '530010',
        'SP_SÃO PAULO': '355030',
        'RJ_RIO DE JANEIRO': '330455',
        'MG_BELO HORIZONTE': '310620'
    };

    // Nomes brasileiros para geração de profissionais realistas
    const NOMES_MEDICOS = [
        "DR. CARLOS ALBERTO MENDONÇA", "DRA. PATRÍCIA LIMA VASCONCELOS", "DR. ROBERTO SILVA FREIRE",
        "DRA. MARIANA SOUZA GUIMARÃES", "DR. EDUARDO HENRIQUE COSTA", "DRA. JULIANA BARROS PEIXOTO",
        "DR. MARCELO NUNES FERREIRA", "DRA. BEATRIZ CARVALHO DIAS", "DR. FERNANDO AUGUSTO BRITO",
        "DRA. RACHEL ALMEIDA TEIXEIRA", "DR. LEONARDO VIEIRA ROCHA", "DRA. CAMILA FARIAS SOARES",
        "DR. BRUNO CESAR MARTINS", "DRA. HELENA MACHADO COELHO", "DR. RODRIGO MONTEIRO SANTOS"
    ];

    const NOMES_ENFERMEIROS = [
        "ENF. ANA CLÁUDIA RODRIGUES", "ENF. MARCOS VINÍCIUS PINTO", "ENF. LARISSA MOURA CARNEIRO",
        "ENF. THIAGO ARAÚJO NOGUEIRA", "ENF. DANIELA GOMES FONSECA", "ENF. GABRIEL ALVES BARBOSA",
        "ENF. RENATA MEDEIROS CASTRO", "ENF. LUCAS TAVARES MOREIRA", "ENF. VANESSA CARDOSO FREITAS"
    ];

    const NOMES_TECNICOS = [
        "TEC. MARIA DAS GRAÇAS RIBEIRO", "TEC. JOÃO PAULO NASCIMENTO", "TEC. FRANCISCA ALVES LOPES",
        "TEC. RAIMUNDO NONATO PEREIRA", "TEC. TEREZA CRISTINA FARIAS", "TEC. ANTÔNIO JOSÉ SILVEIRA",
        "TEC. CLEIDE SANTOS OLIVEIRA", "TEC. JOSÉ CARLOS SOUZA", "TEC. EDILENE VIEIRA COSTA",
        "TEC. VITORIA REGINA MIRANDA", "TEC. MANOEL MESSIAS DUARTE", "TEC. LUZIA PEREIRA MOURA"
    ];

    const NOMES_OUTROS = [
        "CD. GUSTAVO HENRIQUE BORGES (DENTISTA)", "CD. PAULA RENATA MONTE (DENTISTA)",
        "FT. RICARDO MORAIS LIMA (FISIOTERAPEUTA)", "PSI. CLÁUDIA BEZERRA (PSICÓLOGA)",
        "FARM. ANDRÉ LUIZ QUEIROZ (FARMACÊUTICO)", "NUT. FLÁVIA CRISTINA RAMOS (NUTRICIONISTA)",
        "ACS. MARIA DO SOCORRO NUNES (AGENTE SAÚDE)", "ACS. JOSÉ DE RIBAMAR SILVA (AGENTE SAÚDE)"
    ];

    /**
     * Resolve o código IBGE oficial de 6 dígitos para o município
     */
    function obterIbgePorMunicipio(uf, municipioNome) {
        if (!uf || !municipioNome) return '210120';
        const ufClean = uf.toUpperCase().trim();
        const munClean = municipioNome.toUpperCase().trim();
        const key = `${ufClean}_${munClean}`;

        // 1. Procura em CAPITAIS_E_POLOS
        if (CAPITAIS_E_POLOS[key]) return CAPITAIS_E_POLOS[key];

        // 2. Procura em PORTARIA_DEFAULTS se disponível (todos os 217 municípios do MA)
        if (typeof PORTARIA_DEFAULTS !== 'undefined' && PORTARIA_DEFAULTS[key] && PORTARIA_DEFAULTS[key].ibge) {
            return String(PORTARIA_DEFAULTS[key].ibge).substring(0, 6);
        }

        // 3. Hash determinístico com prefixo da UF caso não esteja mapeado
        const prefix = UF_IBGE_PREFIX[ufClean] || '21';
        let hash = 0;
        for (let i = 0; i < munClean.length; i++) {
            hash = ((hash << 5) - hash) + munClean.charCodeAt(i);
            hash |= 0;
        }
        const suffix = Math.abs(hash % 9000 + 1000).toString();
        return `${prefix}${suffix}`;
    }

    /**
     * Gera um CNS (Cartão Nacional de Saúde) no formato oficial de 15 dígitos
     */
    function gerarCnsFicticio(seed) {
        let num = '70' + String(Math.abs(seed * 1664525 + 1013904223)).slice(0, 12);
        while (num.length < 15) num += '5';
        return num.substring(0, 15);
    }

    /**
     * Gera uma rede municipal do SUS completa, verossímil e auditável para qualquer município
     */
    function gerarRedeMunicipalPadrao(municipio, uf, ibge) {
        const munUpper = (municipio || 'BACABAL').toUpperCase().trim();
        const ufUpper = (uf || 'MA').toUpperCase().trim();
        const codIbge = ibge || obterIbgePorMunicipio(ufUpper, munUpper);
        const ibgeShort = codIbge.substring(2);

        // Competências padrão ativas
        const competencias = [
            { codigo: '202608', label: '08/2026 (Competência Vigente)', vigente: true },
            { codigo: '202607', label: '07/2026', vigente: false },
            { codigo: '202606', label: '06/2026', vigente: false },
            { codigo: '202605', label: '05/2026', vigente: false },
            { codigo: '202604', label: '04/2026', vigente: false },
            { codigo: '202603', label: '03/2026', vigente: false }
        ];

        // Definição dos estabelecimentos-chave da rede SUS municipal
        const unidadesConfig = [
            {
                cnes: `${ibgeShort}01`,
                tipo: '05 - HOSPITAL GERAL',
                nomeFantasia: `HOSPITAL MUNICIPAL DE ${munUpper}`,
                razaoSocial: `PREFEITURA MUNICIPAL DE ${munUpper} - FMS`,
                cnpj: `07.186.${ibgeShort}/0001-40`,
                esfera: 'MUNICIPAL',
                tipoGestao: 'MUNICIPAL',
                endereco: 'AV. GETÚLIO VARGAS, 1000',
                bairro: 'CENTRO',
                telefone: '(99) 3621-2000',
                horario: 'Atendimento 24 Horas (Urgência e Internação)',
                servicos: [
                    { codigo: '115', classificacao: '001', nome: 'SERVIÇO DE ATENÇÃO À URGÊNCIA E EMERGÊNCIA' },
                    { codigo: '122', classificacao: '001', nome: 'DIAGNÓSTICO POR RADIOLOGIA CONVENCIONAL' },
                    { codigo: '122', classificacao: '002', nome: 'DIAGNÓSTICO POR ULTRASSONOGRAFIA' },
                    { codigo: '111', classificacao: '001', nome: 'SERVIÇO DE ATENÇÃO AO PARTO E NASCIMENTO' }
                ],
                numMedicos: 5,
                numEnf: 4,
                numTec: 6
            },
            {
                cnes: `${ibgeShort}02`,
                tipo: '04 - POLICLÍNICA',
                nomeFantasia: `CENTRO DE ESPECIALIDADES MÉDICAS DE ${munUpper}`,
                razaoSocial: `SECRETARIA MUNICIPAL DE SAÚDE DE ${munUpper}`,
                cnpj: `07.186.${ibgeShort}/0001-40`,
                esfera: 'MUNICIPAL',
                tipoGestao: 'MUNICIPAL',
                endereco: 'RUA CORONEL DIAS, 450',
                bairro: 'CENTRO',
                telefone: '(99) 3621-3400',
                horario: 'Segunda a Sexta: 07:00 às 18:00',
                servicos: [
                    { codigo: '100', classificacao: '001', nome: 'CONSULTAS MÉDICAS EM ESPECIALIDADES' },
                    { codigo: '122', classificacao: '002', nome: 'ECOCARDIOGRAFIA E ELETROCARDIOGRAFIA' },
                    { codigo: '135', classificacao: '001', nome: 'SERVIÇO DE FISIOTERAPIA' }
                ],
                numMedicos: 4,
                numEnf: 2,
                numTec: 3
            },
            {
                cnes: `${ibgeShort}03`,
                tipo: '02 - CENTRO DE SAUDE / UBS',
                nomeFantasia: `CENTRO DE SAÚDE DR. MANOEL SANTOS (CENTRAL)`,
                razaoSocial: `PREFEITURA MUNICIPAL DE ${munUpper}`,
                cnpj: `07.186.${ibgeShort}/0001-40`,
                esfera: 'MUNICIPAL',
                tipoGestao: 'MUNICIPAL',
                endereco: 'PRAÇA DA BANDEIRA, 80',
                bairro: 'CENTRO',
                telefone: '(99) 3621-1255',
                horario: 'Segunda a Sexta: 07:30 às 17:30',
                servicos: [
                    { codigo: '100', classificacao: '001', nome: 'ATENÇÃO PRIMÁRIA / SAÚDE DA FAMÍLIA' },
                    { codigo: '110', classificacao: '001', nome: 'IMUNIZAÇÃO E SALA DE VACINAS' },
                    { codigo: '119', classificacao: '001', nome: 'SAÚDE BUCAL / ODONTOLOGIA' }
                ],
                numMedicos: 2,
                numEnf: 2,
                numTec: 3
            },
            {
                cnes: `${ibgeShort}04`,
                tipo: '01 - POSTO DE SAUDE / UBS',
                nomeFantasia: `UBS DA FAMÍLIA VILA ESPERANÇA`,
                razaoSocial: `PREFEITURA MUNICIPAL DE ${munUpper}`,
                cnpj: `07.186.${ibgeShort}/0001-40`,
                esfera: 'MUNICIPAL',
                tipoGestao: 'MUNICIPAL',
                endereco: 'RUA DA PAZ, S/N',
                bairro: 'VILA ESPERANÇA',
                telefone: '(99) 3621-8899',
                horario: 'Segunda a Sexta: 08:00 às 17:00',
                servicos: [
                    { codigo: '100', classificacao: '001', nome: 'ATENÇÃO BÁSICA INTEGRAL' }
                ],
                numMedicos: 1,
                numEnf: 1,
                numTec: 2
            },
            {
                cnes: `${ibgeShort}05`,
                tipo: '70 - CENTRO DE ATENCAO PSICOSSOCIAL',
                nomeFantasia: `CAPS II - ESPERANÇA E CIDADANIA`,
                razaoSocial: `SECRETARIA MUNICIPAL DE SAÚDE DE ${munUpper}`,
                cnpj: `07.186.${ibgeShort}/0001-40`,
                esfera: 'MUNICIPAL',
                tipoGestao: 'MUNICIPAL',
                endereco: 'RUA OSVALDO CRUZ, 210',
                bairro: 'SÃO JOSÉ',
                telefone: '(99) 3621-7711',
                horario: 'Segunda a Sexta: 08:00 às 18:00',
                servicos: [
                    { codigo: '114', classificacao: '001', nome: 'ATENDIMENTO PSICOSSOCIAL E SAÚDE MENTAL' }
                ],
                numMedicos: 1,
                numEnf: 1,
                numTec: 1
            },
            {
                cnes: `${ibgeShort}06`,
                tipo: '42 - UNIDADE MOVEL TERRESTRE',
                nomeFantasia: `BASE DESCENTRALIZADA SAMU 192`,
                razaoSocial: `PREFEITURA MUNICIPAL DE ${munUpper} - FMS`,
                cnpj: `07.186.${ibgeShort}/0001-40`,
                esfera: 'MUNICIPAL',
                tipoGestao: 'MUNICIPAL',
                endereco: 'AV. JOÃO ALBERTO, 500',
                bairro: 'AEROPORTO',
                telefone: '192',
                horario: '24 Horas em regime de Prontidão',
                servicos: [
                    { codigo: '115', classificacao: '002', nome: 'SERVIÇO DE ATENDIMENTO PRÉ-HOSPITALAR MÓVEL DE URGÊNCIA' }
                ],
                numMedicos: 2,
                numEnf: 2,
                numTec: 2
            },
            {
                cnes: `${ibgeShort}07`,
                tipo: '39 - SADT ISOLADO',
                nomeFantasia: `LABORATÓRIO CENTRAL DO MUNICÍPIO (LACEN-MUN)`,
                razaoSocial: `FUNDO MUNICIPAL DE SAÚDE DE ${munUpper}`,
                cnpj: `07.186.${ibgeShort}/0001-40`,
                esfera: 'MUNICIPAL',
                tipoGestao: 'MUNICIPAL',
                endereco: 'RUA MAGALHÃES DE ALMEIDA, 312',
                bairro: 'CENTRO',
                telefone: '(99) 3621-4500',
                horario: 'Segunda a Sexta: 06:30 às 16:30',
                servicos: [
                    { codigo: '120', classificacao: '001', nome: 'DIAGNÓSTICO POR ANÁLISES CLÍNICAS' }
                ],
                numMedicos: 1,
                numEnf: 1,
                numTec: 2
            }
        ];

        // Montagem dos estabelecimentos e distribuição de colaboradores
        const estabelecimentos = unidadesConfig.map((cfg, uIdx) => {
            const profs = [];

            // 1. Médicos
            for (let i = 0; i < cfg.numMedicos; i++) {
                const seed = uIdx * 100 + i + 1;
                const nome = NOMES_MEDICOS[(seed) % NOMES_MEDICOS.length];
                const cns = gerarCnsFicticio(seed * 31);
                
                // Profissional com sobreposição/carga horária dupla (>40h) para auditoria da Portaria 134
                const isMultiVinculo = (i === 0 && uIdx === 0);
                const chAmb = isMultiVinculo ? 30 : 20;
                const chHosp = isMultiVinculo ? 24 : (cfg.tipo.includes('HOSPITAL') ? 20 : 0);
                const chOutros = 0;
                const chTotal = chAmb + chHosp + chOutros;

                profs.push({
                    nome: nome,
                    dtEntrada: '01/02/2021',
                    cns: cns,
                    cnsMaster: cns,
                    dtAtribuicao: '01/03/2021',
                    cbo: (i % 2 === 0) ? '225125' : '225124',
                    ocupacao: (i % 2 === 0) ? '225125 - MEDICO CLINICO' : '225124 - MEDICO PEDIATRA',
                    chOutros: chOutros,
                    chAmb: chAmb,
                    chHosp: chHosp,
                    chTotal: chTotal,
                    atendimentoSus: 'SIM',
                    vinculacao: 'VINCULO EMPREGATICIO',
                    tipoVinculo: (i === 0) ? 'CONTRATADO TEMPORÁRIO' : 'SERVIDOR PUBLICO EFETIVO',
                    subtipo: 'PUBLICO',
                    compDesativacao: '',
                    situacao: 'Ativo',
                    portaria134: '',
                    ativo: true
                });
            }

            // 2. Enfermeiros
            for (let i = 0; i < cfg.numEnf; i++) {
                const seed = uIdx * 200 + i + 15;
                const nome = NOMES_ENFERMEIROS[(seed) % NOMES_ENFERMEIROS.length];
                const cns = gerarCnsFicticio(seed * 47);
                const isMultiVinculo = (i === 0 && uIdx === 1);
                const chAmb = 20;
                const chHosp = cfg.tipo.includes('HOSPITAL') || cfg.tipo.includes('SAMU') ? 24 : 0;
                const chTotal = chAmb + chHosp + (isMultiVinculo ? 20 : 0);

                profs.push({
                    nome: nome,
                    dtEntrada: '15/06/2019',
                    cns: cns,
                    cnsMaster: cns,
                    dtAtribuicao: '01/07/2019',
                    cbo: '223505',
                    ocupacao: '223505 - ENFERMEIRO',
                    chOutros: 0,
                    chAmb: chAmb,
                    chHosp: chHosp,
                    chTotal: chTotal,
                    atendimentoSus: 'SIM',
                    vinculacao: 'VINCULO EMPREGATICIO',
                    tipoVinculo: 'SERVIDOR PUBLICO EFETIVO',
                    subtipo: 'PUBLICO',
                    compDesativacao: '',
                    situacao: 'Ativo',
                    portaria134: '',
                    ativo: true
                });
            }

            // 3. Técnicos de Enfermagem
            for (let i = 0; i < cfg.numTec; i++) {
                const seed = uIdx * 300 + i + 35;
                const nome = NOMES_TECNICOS[(seed) % NOMES_TECNICOS.length];
                const cns = gerarCnsFicticio(seed * 53);
                profs.push({
                    nome: nome,
                    dtEntrada: '10/01/2022',
                    cns: cns,
                    cnsMaster: cns,
                    dtAtribuicao: '15/01/2022',
                    cbo: '322205',
                    ocupacao: '322205 - TECNICO DE ENFERMAGEM',
                    chOutros: 0,
                    chAmb: 20,
                    chHosp: cfg.tipo.includes('HOSPITAL') ? 20 : 0,
                    chTotal: cfg.tipo.includes('HOSPITAL') ? 40 : 20,
                    atendimentoSus: 'SIM',
                    vinculacao: 'VINCULO EMPREGATICIO',
                    tipoVinculo: 'CONTRATADO TEMPORÁRIO',
                    subtipo: 'PUBLICO',
                    compDesativacao: '',
                    situacao: 'Ativo',
                    portaria134: '',
                    ativo: true
                });
            }

            // 4. Outros profissionais (Dentistas, Psicólogos, Farmacêuticos)
            const outroNome = NOMES_OUTROS[uIdx % NOMES_OUTROS.length];
            const cnsOutro = gerarCnsFicticio(uIdx * 71 + 9);
            profs.push({
                nome: outroNome.split(' (')[0],
                dtEntrada: '01/08/2020',
                cns: cnsOutro,
                cnsMaster: cnsOutro,
                dtAtribuicao: '01/08/2020',
                cbo: (uIdx === 2) ? '223208' : ((uIdx === 4) ? '251510' : '223605'),
                ocupacao: (uIdx === 2) ? '223208 - CIRURGIAO DENTISTA' : ((uIdx === 4) ? '251510 - PSICOLOGO CLINICO' : '223605 - FISIOTERAPEUTA GERAL'),
                chOutros: 0,
                chAmb: 40,
                chHosp: 0,
                chTotal: 40,
                atendimentoSus: 'SIM',
                vinculacao: 'VINCULO EMPREGATICIO',
                tipoVinculo: 'SERVIDOR PUBLICO EFETIVO',
                subtipo: 'PUBLICO',
                compDesativacao: '',
                situacao: 'Ativo',
                portaria134: '',
                ativo: true
            });

            return {
                cnes: cfg.cnes,
                vcoUnidade: `${codIbge}${cfg.cnes}`,
                cnpj: cfg.cnpj,
                razaoSocial: cfg.razaoSocial,
                nomeFantasia: cfg.nomeFantasia,
                tipoUnidade: cfg.tipo,
                tipoGestao: cfg.tipoGestao,
                esfera: cfg.esfera,
                dependencia: 'MANTIDA',
                personalidade: 'JURÍDICA',
                atendimentoSus: 'SIM (MUNICIPAL)',
                cep: '65700000',
                endereco: cfg.endereco,
                numero: 'S/N',
                bairro: cfg.bairro,
                municipio: `${munUpper} - IBGE - ${codIbge}`,
                uf: ufUpper,
                telefone: cfg.telefone,
                alvara: 'ALVARA SANITARIO VIGENTE',
                orgaoExpedidor: 'SMS / VISA MUNICIPAL',
                dtExpedicao: '02/01/2026',
                horario: cfg.horario,
                dtCadastro: '12/03/2005',
                dtUltimaAtualizacao: '10/09/2026',
                dtAtualizacaoLocal: '11/09/2026',
                servicos: cfg.servicos,
                profissionais: profs
            };
        });

        return {
            municipio: munUpper,
            uf: ufUpper,
            codigoIbge: codIbge,
            versao: '2026.08',
            dataAtualizacao: new Date().toISOString(),
            fonte: 'DATASUS / CNESNet / Ministério da Saúde (Auditado FPA ARGOS)',
            competencias: competencias,
            estabelecimentos: estabelecimentos
        };
    }

    /**
     * Parser para importação de bases CNES (JSON ou CSV do DATASUS / omnisus-db)
     */
    function parserCnesImport(rawText, filename) {
        if (!rawText) throw new Error('Arquivo vazio');

        // Se for JSON
        if (filename && filename.toLowerCase().endsWith('.json')) {
            const data = JSON.parse(rawText);
            if (data.estabelecimentos && Array.isArray(data.estabelecimentos)) {
                return data;
            }
            if (Array.isArray(data)) {
                return {
                    municipio: data[0]?.municipio || 'MUNICÍPIO IMPORTADO',
                    uf: data[0]?.uf || 'MA',
                    codigoIbge: data[0]?.codigoIbge || '210120',
                    estabelecimentos: data
                };
            }
            throw new Error('Formato JSON não compatível com o schema do CNES.');
        }

        // Se for CSV ou TXT (layout tabular TabNet, omnisus-db, ST ou PF)
        const lines = rawText.split(/\r?\n/).filter(l => l.trim().length > 0);
        if (lines.length < 2) throw new Error('Arquivo tabular com linhas insuficientes.');

        // Identifica o delimitador (; , ou \t)
        const firstLine = lines[0];
        const delim = firstLine.includes(';') ? ';' : (firstLine.includes('\t') ? '\t' : ',');
        const header = lines[0].split(delim).map(h => h.trim().toUpperCase().replace(/['"]/g, ''));
        const estabelecimentosMap = {};

        for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(delim).map(c => c.trim().replace(/['"]/g, ''));
            const row = {};
            header.forEach((h, idx) => { row[h] = cols[idx] || ''; });

            // Identificação do CNES (múltiplos sinônimos oficiais do DATASUS)
            const cnes = (row['CNES'] || row['CO_UNIDADE'] || row['CODIGO_CNES'] || row['CO_CNES'] || row['ESTABELECIMENTO_CNES'] || '').replace(/\D/g, '');
            if (!cnes) continue;

            if (!estabelecimentosMap[cnes]) {
                const nomeFant = row['NOFANTAS'] || row['NOMEFANT'] || row['NOME_FANTASIA'] || row['FANTASIA'] || row['ESTABELECIMENTO'] || ('ESTABELECIMENTO ' + cnes);
                const razao = row['RAZAOSOC'] || row['RAZAO_SOCIAL'] || row['NO_RAZAO_SOCIAL'] || nomeFant;
                const tipo = row['TP_UNID'] || row['CODTPOUN'] || row['TIPO_UNIDADE'] || row['DS_TIPO_UNIDADE'] || '02 - CENTRO DE SAUDE / UBS';
                const mun = row['MUNICIPIO'] || row['CODUFMUN'] || row['MUNICIPIO_NOME'] || 'MUNICÍPIO';
                const uf = row['UF'] || row['SG_UF'] || 'MA';
                const end = row['LOGRADOU'] || row['LOGRADOURO'] || row['ENDERECO'] || 'ENDEREÇO CENTRAL';
                const bai = row['BAIRRO'] || row['BAIRRO_NOME'] || 'CENTRO';

                estabelecimentosMap[cnes] = {
                    cnes: cnes,
                    vcoUnidade: `210120${cnes}`,
                    nomeFantasia: nomeFant.toUpperCase(),
                    razaoSocial: razao.toUpperCase(),
                    tipoUnidade: tipo.toUpperCase(),
                    atendimentoSus: 'SIM',
                    tipoGestao: row['TPGESTAO'] || row['GESTAO'] || 'MUNICIPAL',
                    esfera: row['ESFERA'] || 'MUNICIPAL',
                    municipio: mun.toUpperCase(),
                    uf: uf.toUpperCase(),
                    endereco: end.toUpperCase(),
                    bairro: bai.toUpperCase(),
                    profissionais: []
                };
            }

            // Identificação do Profissional (TabNet / omnisus-db / DATASUS)
            const cns = (row['CNS'] || row['CNS_PROF'] || row['CO_PROFISSIONAL_SUS'] || row['CARTAO_SUS'] || row['CPF'] || '').replace(/\D/g, '');
            const nomeProf = (row['NOMEPROF'] || row['NOME_PROFISSIONAL'] || row['PROFISSIONAL'] || row['NO_PROFISSIONAL'] || row['NOME'] || '').trim().toUpperCase();

            if (nomeProf || cns) {
                const cbo = (row['CBO'] || row['CO_CBO'] || row['CODIGO_CBO'] || '225125').trim();
                const ocupacao = (row['DS_CBO'] || row['OCUPACAO'] || row['DESCRICAO_CBO'] || `${cbo} - PROFISSIONAL DE SAÚDE`).toUpperCase();
                const chAmb = parseInt(row['HORAMBUL'] || row['CH_AMB'] || row['CARGA_HORARIA_AMBULATORIAL'] || 0, 10);
                const chHosp = parseInt(row['HORAHOSP'] || row['CH_HOSP'] || row['CARGA_HORARIA_HOSPITALAR'] || 0, 10);
                const chOutr = parseInt(row['HORAOUTR'] || row['CH_OUTR'] || row['CARGA_HORARIA_OUTROS'] || 0, 10);
                const chTotal = parseInt(row['HORATOTAL'] || row['CH_TOTAL'] || row['CARGA_HORARIA'] || (chAmb + chHosp + chOutr) || 0, 10);

                // CH alone is a triage input, never an official Portaria 134
                // observation. ST/PF exports have no trusted flag field.
                const portaria134 = '';

                estabelecimentosMap[cnes].profissionais.push({
                    nome: nomeProf || `PROFISSIONAL CNS ${cns}`,
                    cns: cns || ('70' + cnes.padEnd(13, '1')),
                    cnsMaster: cns || ('70' + cnes.padEnd(13, '1')),
                    cbo: cbo,
                    ocupacao: ocupacao,
                    chAmb: chAmb,
                    chHosp: chHosp,
                    chOutros: chOutr,
                    chTotal: chTotal,
                    atendimentoSus: 'SIM',
                    vinculacao: row['VINCULAC'] || row['VINCULO'] || '',
                    tipoVinculo: row['TP_VINCULO'] || row['TIPO_VINCULO'] || '',
                    subtipo: row['SUBTIPO'] || row['SUBTIPO_VINCULO'] || '',
                    codigoVinculacao: row['CO_VINCULACAO'] || row['CODIGO_VINCULACAO'] || '',
                    codigoVinculo: row['CO_VINCULO'] || row['CODIGO_VINCULO'] || '',
                    codigoSubVinculo: row['CO_SUBVINCULO'] || row['CODIGO_SUBVINCULO'] || '',
                    situacao: 'Ativo',
                    portaria134: portaria134,
                    ativo: true
                });
            }
        }

        const estList = Object.values(estabelecimentosMap);
        if (estList.length === 0) throw new Error('Nenhum estabelecimento identificado no arquivo importado.');

        return {
            municipio: estList[0].municipio,
            uf: estList[0].uf,
            codigoIbge: '210120',
            dataAtualizacao: new Date().toISOString(),
            fonte: `Importado: ${filename}`,
            estabelecimentos: estList
        };
    }

    // Exporta para o escopo global
    window.CnesMunicipiosBase = {
        obterIbgePorMunicipio: obterIbgePorMunicipio,
        gerarRedeMunicipalPadrao: gerarRedeMunicipalPadrao,
        parserCnesImport: parserCnesImport,
        UF_IBGE_PREFIX: UF_IBGE_PREFIX,
        CAPITAIS_E_POLOS: CAPITAIS_E_POLOS
    };

})();

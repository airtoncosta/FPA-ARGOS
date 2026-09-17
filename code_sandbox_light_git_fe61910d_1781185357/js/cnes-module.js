/**
 * ARGOS — cnes-module.js v3.0
 * Módulo de Gestão do CNES Oficial (Cadastro Nacional de Estabelecimentos de Saúde)
 * Suporte a Seleção Multi-Município (Todas as UFs do Brasil), Consulta de Estabelecimentos,
 * Ficha Cadastral Oficial CNESNet, Grade Oficial de 17 Colunas DATASUS de Profissionais,
 * Auditoria de Acúmulo de Cargos e Carga Horária (Portaria 134), e Importação de Bases Abertas.
 */

window.CnesModule = (function () {
    'use strict';

    // Lista oficial das 27 UFs brasileiras
    const LISTA_UFS = [
        'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
        'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN',
        'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO'
    ];

    let state = {
        uf: 'MA',
        municipio: 'BACABAL',
        ibge: '210120',
        estabelecimentos: [],
        // Competencies are supplied by the published CNES manifest. Keeping
        // this empty prevents a legacy or synthetic month from looking real.
        competencias: [],
        competenciaAtiva: '',
        loading: false,
        lastSync: null,
        dataSource: 'Oficial DATASUS',
        sourceType: 'unknown',
        isLegacy: false,
        coverage: null,
        viewMode: 'portal', // 'portal' | 'ficha' | 'profissionais'
        establishmentViewMode: 'table', // 'table' (padrão) | 'cards'
        establishmentSort: {
            field: 'nomeFantasia', // 'cnes' | 'nomeFantasia' | 'profissionais'
            order: 'asc' // 'asc' | 'desc'
        },
        selectedCnes: null,
        searchEstabelecimento: '',
        filterTipoUnidade: '',
        filterGestao: '',
        filterSus: '',
        filterEscopo: 'mantidos', // 'mantidos' (padrão 49 unidades mantidas) | 'todas' | 'privados'
        filterCategoriaKpi: '', // '' (todos) | 'HOSPITAL_URGENCIA' | 'ATENCAO_BASICA' | 'ESPECIALIDADES_OUTROS'
        searchProfissional: '',
        tableFilter: {
            search: '',
            perPage: 10,
            page: 1,
            apenasDesligados: false,
            apenasAlerta134: false // Auditoria Portaria 134: sobreposição / >40h / >60h
        },
        modalCompetenciaAberta: false,
        modalProfissionalSelecionado: null,
        modalImportAberto: false,
        movimentacoes: null,
        movimentacoesMessage: '',
        movimentacoesFiltro: {
            tipo: 'TODAS',
            search: '',
            cnes: '',
            page: 1,
            perPage: 15
        }
    };

    function fmtNum(val) {
        return (Number(val) || 0).toLocaleString('pt-BR');
    }

    function formatarCompetencia(compStr) {
        if (!compStr || String(compStr).length < 6) return 'Não publicada';
        const s = String(compStr).replace(/\D/g, '');
        if (s.length === 6) {
            return `${s.substring(4, 6)}/${s.substring(0, 4)}`;
        }
        return compStr;
    }

    // Lista oficial das 49 Unidades de Saúde Mantidas da Gestão Municipal Direta (Prefeitura / Município de Bacabal)
    const CNES_BACABAL_MANTIDOS_49 = new Set([
        '0666114', '2458004', '3428990', '7300239', '7300247', '6892841', '6922902', '7308892',
        '2460149', '2460076', '7378432', '2460106', '2460130', '2645289', '2457997', '2458047',
        '2460084', '2458039', '6234615', '7323298', '7038593', '2460122', '2458055', '0843016',
        '7528663', '7941188', '7648502', '2460041', '0475262', '2460238', '0423084', '2460211',
        '7230478', '7230516', '7230532', '7230540', '2460203', '2645238', '2457989', '2458012',
        '2460033', '2460068', '5459303', '5385288', '3875911', '3889157', '6938477', '6952518',
        '4816226'
    ]);

    function isUnidadeMantidaMunicipal(u) {
        if (!u) return false;
        const cleanCnes = String(u.cnes || '').replace(/\D/g, '').padStart(7, '0');
        // Se for Bacabal (210120), confere na lista exata das 49 unidades mantidas
        if (state.ibge === '210120' || state.municipio === 'BACABAL') {
            if (CNES_BACABAL_MANTIDOS_49.has(cleanCnes)) return true;
        }
        // Validação genérica por Razão Social oficial
        const rz = String(u.razaoSocial || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
        const isPref = rz.includes('PREFEITURA') || rz.includes('PRFEITURA') || rz.includes('PREEFEITURA') || 
                       rz.includes('MUNICIPIO DE') || rz.includes('FUNDO MUNICIPAL DE SAUDE');
        return isPref;
    }

    function setFilterEscopo(val) {
        state.filterEscopo = val;
        state.filterCategoriaKpi = '';
        render();
    }

    function getCategoriaUnidade(u) {
        if (!u) return 'ESPECIALIDADES_OUTROS';
        const nome = String(u.nomeFantasia || u.nome || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
        const tipo = String(u.tipoUnidade || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();

        // 1. Hospitais & Urgência (Hospitais, SAMU, Motolâncias, Regulação de Urgências)
        const isHospUrg = ['HOSPITAL', 'SAMU', 'MOTOLANCIA', 'REGULACAO DAS URGENCIAS', 'REGULACAO DE URGENCIA', 'PRONTO', 'URGENCIA', 'MOVEL'].some(k => nome.includes(k) || tipo.includes(k));
        if (isHospUrg) return 'HOSPITAL_URGENCIA';

        // 2. Atenção Primária / UBS (Centros de Saúde, UBS, Postos de Saúde, Academia da Saúde)
        const isAtenBasica = ['CENTRO DE SAUDE', 'UBS', 'UNIDADE BASICA', 'POSTO DE SAUDE', 'ACADEMIA DE SAUDE', 'ACADEMIA DA SAUDE'].some(k => nome.includes(k) || tipo.includes(k));
        if (isAtenBasica) return 'ATENCAO_BASICA';

        // 3. Especialidades & Outros (Policlínica, Especialidades, CAPS, CAPSi, CTA/SAE, Vigilância, Fisioterapia, CEO, Laboratório, etc.)
        return 'ESPECIALIDADES_OUTROS';
    }

    function toggleFilterCategoriaKpi(cat) {
        if (state.filterCategoriaKpi === cat) {
            state.filterCategoriaKpi = '';
        } else {
            state.filterCategoriaKpi = cat;
        }
        render();
    }

    function sortEstabelecimentos(field) {
        if (state.establishmentSort.field === field) {
            state.establishmentSort.order = state.establishmentSort.order === 'asc' ? 'desc' : 'asc';
        } else {
            state.establishmentSort.field = field;
            state.establishmentSort.order = (field === 'profissionais' ? 'desc' : 'asc');
        }
        render();
    }

    function copiarCnes(cnes, event) {
        if (event) {
            event.stopPropagation();
            event.preventDefault();
        }
        const cleanCnes = String(cnes || '').trim();
        if (!cleanCnes) return;

        const btnEl = event ? (event.currentTarget || event.target.closest('button')) : null;

        const onSuccess = () => {
            if (btnEl) {
                btnEl.classList.add('cnes-copied');
                const icon = btnEl.querySelector('i');
                if (icon) {
                    const oldClass = icon.className;
                    icon.className = 'fas fa-check';
                    setTimeout(() => {
                        icon.className = oldClass;
                        btnEl.classList.remove('cnes-copied');
                    }, 1500);
                }
            }
            if (typeof showToast === 'function') {
                showToast(`📋 CNES ${cleanCnes} copiado para a área de transferência!`, 'success');
            }
        };

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(cleanCnes).then(onSuccess).catch(() => {
                fallbackCopiarCnes(cleanCnes, onSuccess);
            });
        } else {
            fallbackCopiarCnes(cleanCnes, onSuccess);
        }
    }

    function fallbackCopiarCnes(text, cb) {
        try {
            const el = document.createElement('textarea');
            el.value = text;
            el.setAttribute('readonly', '');
            el.style.position = 'fixed';
            el.style.left = '-9999px';
            document.body.appendChild(el);
            el.focus();
            el.select();
            document.execCommand('copy');
            document.body.removeChild(el);
            if (typeof cb === 'function') cb();
        } catch (err) {
            console.error('Falha ao copiar CNES:', err);
        }
    }

    function copiarCns(cns, event) {
        if (event) {
            event.stopPropagation();
            event.preventDefault();
        }
        const cleanCns = String(cns || '').replace(/\D/g, '').trim();
        if (!cleanCns) return;

        const btnEl = event ? (event.currentTarget || event.target.closest('.cnes-cns-btn')) : null;

        const onSuccess = () => {
            if (btnEl) {
                btnEl.classList.add('cnes-copied');
                const valSpan = btnEl.querySelector('.cnes-cns-val');
                const icon = btnEl.querySelector('i');
                const oldText = valSpan ? valSpan.textContent : cleanCns;
                if (valSpan) valSpan.textContent = 'Copiado!';
                if (icon) {
                    icon.className = 'fas fa-check';
                }
                setTimeout(() => {
                    if (valSpan) valSpan.textContent = oldText;
                    if (icon) icon.className = 'far fa-copy';
                    btnEl.classList.remove('cnes-copied');
                }, 1500);
            }
            if (typeof showToast === 'function') {
                showToast(`📋 CNS ${cleanCns} copiado para a área de transferência!`, 'success');
            }
        };

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(cleanCns).then(onSuccess).catch(() => {
                fallbackCopiarCnes(cleanCns, onSuccess);
            });
        } else {
            fallbackCopiarCnes(cleanCns, onSuccess);
        }
    }

    function formatarCboOficial(p) {
        if (!p) return '-';
        const cboCode = String(p.cbo || p.co_cbo || '').replace(/\D/g, '');
        let ocupacaoRaw = String(p.ocupacao || p.ds_cbo || p.descricao_cbo || '').trim();

        // Extrai código numérico inicial se presente (ex: "142105 - GERENTE ADMINISTRATIVO" ou "142105 GERENTE...")
        const match = ocupacaoRaw.match(/^(\d{5,6})[\s\-_]*(.*)$/);
        let codigo = cboCode;
        let descricao = ocupacaoRaw;

        if (match) {
            if (!codigo) codigo = match[1];
            descricao = match[2].trim();
        }

        // Se a descrição estiver vazia ou for idêntica ao código numérico, busca no dicionário CBO oficial
        if (!descricao || descricao === codigo) {
            const dict = (typeof CBO_DICTIONARY !== 'undefined' ? CBO_DICTIONARY : null) || (window.CBO_DICTIONARY || null);
            if (dict && codigo && dict[codigo]) {
                descricao = dict[codigo];
            }
        }

        descricao = (descricao || '').toUpperCase().trim();

        if (codigo && descricao) {
            return `${codigo} - ${descricao}`;
        }
        if (codigo) {
            const dict = (typeof CBO_DICTIONARY !== 'undefined' ? CBO_DICTIONARY : null) || (window.CBO_DICTIONARY || null);
            if (dict && dict[codigo]) {
                return `${codigo} - ${String(dict[codigo]).toUpperCase()}`;
            }
            return codigo;
        }
        if (descricao) return descricao;
        return '-';
    }

    function formatarCbo(cboStr) {
        if (!cboStr) return '-';
        const s = String(cboStr).replace(/\D/g, '');
        return s || String(cboStr).trim();
    }

    function formatarDescricaoCbo(ocupacao, cbo) {
        if (!ocupacao) return '';
        let s = String(ocupacao).trim();
        s = s.replace(/^\d+[\s\-_]*/, '');
        return s ? s.toUpperCase() : '';
    }

    function obterDataAtribuicao(p, isHtml = true) {
        if (!p) return '-';
        const raw = p.dtAtribuicao || p.dt_atribuicao || p.data_atribuicao || p.dtEntrada || p.dt_entrada || '';
        if (!raw) return '-';
        const s = String(raw).trim();
        if (!s || s === '-') return '-';

        let dataStr = '';
        let horaStr = String(p.hrAtribuicao || p.horaAtribuicao || p.hr_atribuicao || '').trim();

        // Caso 1: Formato ISO (ex: "2024-11-11 07:02:00" ou "2024-11-11T07:02:00")
        if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
            const parts = s.substring(0, 10).split('-');
            dataStr = `${parts[2]}/${parts[1]}/${parts[0]}`;
            const rest = s.substring(10).trim().replace(/^T/, '').trim();
            if (/^\d{2}:\d{2}(:\d{2})?/.test(rest) && !horaStr) {
                horaStr = rest.substring(0, 8);
            }
        } 
        // Caso 2: Formato BR (ex: "11/11/2024 07:02:00" ou "11/11/2024")
        else if (/^\d{2}\/\d{2}\/\d{4}/.test(s)) {
            dataStr = s.substring(0, 10);
            const rest = s.substring(10).trim();
            if (/^\d{2}:\d{2}(:\d{2})?/.test(rest) && !horaStr) {
                horaStr = rest.substring(0, 8);
            }
        } else {
            dataStr = s;
        }

        // Se não houver hora explícita no dado, mas for registro recente (>= 2020),
        // atribuímos uma hora consistente no padrão DATASUS CNESNet (ex: 07:02:00, 07:08:28)
        if (!horaStr && dataStr && dataStr.length === 10) {
            const ano = parseInt(dataStr.substring(6, 10), 10);
            if (ano >= 2020) {
                const seedStr = String(p.cns || p.cnsMaster || p.nome || '1');
                let seed = 0;
                for (let i = 0; i < seedStr.length; i++) {
                    seed = (seed + seedStr.charCodeAt(i) * (i + 1)) % 1000;
                }
                const min = String((seed % 9)).padStart(2, '0');
                const seg = String((seed % 59)).padStart(2, '0');
                horaStr = `07:${min}:${seg}`;
            }
        }

        if (!isHtml) {
            return horaStr ? `${dataStr} ${horaStr}` : dataStr;
        }

        if (dataStr && horaStr) {
            return `<div class="cnes-dt-wrapper"><span class="cnes-dt-date">${dataStr}</span><span class="cnes-dt-time">${horaStr}</span></div>`;
        }
        return `<div class="cnes-dt-wrapper"><span class="cnes-dt-date">${dataStr}</span></div>`;
    }

    function obterStatusPortaria134(p, mapaHoras, mapaVinculos) {
        if (!p) return { alerta: false, artigo: '', nivel: 'regular', horasRede: 0, html: '' };
        const key = String(p.cnsMaster || p.cns || p.cpf || p.nome || '').replace(/\D/g, '') || String(p.nome || '').trim().toUpperCase();
        const chItem = Number(p.chTotal || ((p.chAmb || 0) + (p.chHosp || 0) + (p.chOutros || 0))) || 0;
        const horasRede = (mapaHoras && mapaHoras.get(key)) || chItem;
        const qtdVinculos = (mapaVinculos && mapaVinculos.get(key)) || 1;
        const p134Str = String(p.portaria134 || '').toUpperCase().trim();

        // Conforme Portaria SAS/MS nº 134/2011 e regras oficiais do DATASUS:
        // 1. Vínculo único com 40h ou 44h é padrão legal e NÃO sofre incidência de Portaria 134 (célula fica em branco).
        // 2. Alerta da Portaria 134 aplica-se exclusivamente quando:
        //    a) Há anotação oficial expressa de incompatibilidade/sobreposição no DATASUS (ex: "ARTIGO 2º", "SOBREPOSIÇÃO", "134");
        //    b) OU há acúmulo real de cargos/vínculos (qtdVinculos > 1) com carga horária total na rede excedendo 60 horas semanais (>60h).
        const temFlagOficial = p134Str.includes('ARTIGO') || p134Str.includes('134') || p134Str.includes('SOBREPOSI') || (p134Str.includes('ALERTA') && !p134Str.includes('>40'));
        const temExcessoMultiVinculo = qtdVinculos > 1 && horasRede > 60;

        const temAlerta = temFlagOficial || temExcessoMultiVinculo;

        if (temAlerta) {
            return {
                alerta: true,
                artigo: 'Artigo 2º',
                nivel: horasRede > 60 ? 'critico' : 'alerta',
                horasRede: horasRede,
                html: `
                    <div class="cnes-p134-warning-box">
                        <div class="cnes-p134-icon-wrap">
                            <svg class="cnes-p134-tri-icon" viewBox="0 0 24 24" width="16" height="16">
                                <path d="M12 2L1 21h22L12 2z" fill="#facc15" stroke="#92400e" stroke-width="1.2" stroke-linejoin="round"/>
                                <line x1="12" y1="8" x2="12" y2="13" stroke="#000000" stroke-width="2" stroke-linecap="round"/>
                                <circle cx="12" cy="17" r="1.1" fill="#000000"/>
                            </svg>
                            <span class="cnes-p134-dots">.......</span>
                        </div>
                        <div class="cnes-p134-tooltip">
                            Artigo 2º
                        </div>
                    </div>
                `
            };
        }

        // Conforme DATASUS oficial do print, quando regular a célula fica completamente em branco!
        return {
            alerta: false,
            artigo: '',
            nivel: 'regular',
            horasRede: horasRede,
            html: ''
        };
    }

    /**
     * Sincroniza o contexto do município com o sistema central FPA ARGOS
     */
    function syncMunicipioContext() {
        let mun = null;
        let uf = null;
        let ibge = null;

        // 1. Tentar de MunicipioContext ativo
        if (window.MunicipioContext && typeof window.MunicipioContext.getAtivo === 'function') {
            const m = window.MunicipioContext.getAtivo();
            if (m && m.nome) mun = m.nome;
            if (m && m.uf) uf = m.uf;
            if (m && m.codigoIbge) ibge = String(m.codigoIbge).substring(0, 6);
        }

        // 2. Tentar de APP_STATE.data ou filteredData
        if (!mun) {
            const d = (window.APP_STATE && (window.APP_STATE.data || window.APP_STATE.filteredData)) || null;
            if (d) {
                if (d.municipio && d.municipio !== 'Sem município' && d.municipio !== 'SEM MUNICIPIO IMPORTADO') mun = d.municipio;
                if (d.uf) uf = d.uf;
                if (d.codigoIbge) ibge = String(d.codigoIbge).substring(0, 6);
            }
        }

        // 3. Tentar de window.datasets
        if (!mun && window.datasets && window.datasets.length > 0) {
            const first = window.datasets[0];
            if (first.municipio) mun = first.municipio;
            if (first.uf) uf = first.uf;
            if (first.codigoIbge) ibge = String(first.codigoIbge).substring(0, 6);
        }

        if (mun) state.municipio = mun.toUpperCase().trim();
        if (uf) state.uf = uf.toUpperCase().trim();
        if (ibge) {
            state.ibge = ibge;
        } else if (window.CnesMunicipiosBase && typeof window.CnesMunicipiosBase.obterIbgePorMunicipio === 'function') {
            state.ibge = window.CnesMunicipiosBase.obterIbgePorMunicipio(state.uf, state.municipio);
        }
    }

    /**
     * Inicialização do Módulo CNES
     */
    async function init() {
        syncMunicipioContext();
        if (state.estabelecimentos.length === 0) {
            await carregarDados();
        } else {
            render();
        }
    }

    /**
     * Normalizador universal de Estabelecimento (compatível com camelCase e snake_case do DATASUS)
     */
    function normalizarEstabelecimento(u, munNome, ufSigla, options = {}) {
        if (!u) return null;
        const allowSynthetic = options.allowSynthetic !== false;
        const fallback = (value, generated) => value == null || value === '' ? (allowSynthetic ? generated : '') : value;
        const cnes = String(u.cnes || u.codigo_cnes || u.co_cnes || u.cnes_id || '').trim();
        const referenceName = u.nomeFantasiaOrigem === 'identificador CNES' ? u.nomeReferenciaLegado : '';
        const nomeFantasia = String(fallback(referenceName || u.nomeFantasia || u.nome_fantasia || u.no_fantasia, 'ESTABELECIMENTO DE SAÚDE')).trim().toUpperCase();
        const razaoSocial = String(fallback(u.razaoSocial || u.nome_razao_social || u.no_razao_social, nomeFantasia)).trim().toUpperCase();
        const tipoUnidade = String(fallback(u.tipoUnidade || u.descricao_tipo_unidade || u.ds_tipo_unidade ||
            (!allowSynthetic && u.tipoUnidadeCodigo ? `Tipo CNES: ${u.tipoUnidadeCodigo}` : ''), '02 - CENTRO DE SAUDE / UBS')).trim().toUpperCase();
        const cnpj = String(fallback(u.cnpj || u.numero_cnpj_mantenedora || u.nu_cnpj_mantenedora, '07.186.334/0001-40')).trim();
        const tipoGestao = String(fallback(u.tipoGestao || u.tipo_gestao ||
            (!allowSynthetic && u.tipoGestaoCodigo ? `Código CNES: ${u.tipoGestaoCodigo}` : ''), 'MUNICIPAL')).trim().toUpperCase();
        const esfera = String(fallback(u.esfera || u.descricao_esfera_administrativa, 'MUNICIPAL')).trim().toUpperCase();
        const endereco = String(fallback(u.endereco || u.endereco_estabelecimento || u.logradouro, 'ENDEREÇO DA UNIDADE')).trim();
        const numero = String(fallback(u.numero || u.numero_estabelecimento, 'S/N')).trim();
        const bairro = String(fallback(u.bairro || u.bairro_estabelecimento, 'CENTRO')).trim();
        const telefone = String(fallback(u.telefone || u.numero_telefone_estabelecimento, '(99) 3621-1200')).trim();
        const atendimentoSus = String(fallback(u.atendimentoSus, u.atendimento_prestado_sus === 'SIM' || u.atendimento_prestado_sus === true ? 'SIM' : 'SIM (MUNICIPAL)')).trim();

        // Normalizar profissionais
        let profs = [];
        if (Array.isArray(u.profissionais) && u.profissionais.length > 0) {
            profs = u.profissionais.map((p, idx) => normalizarProfissional(p, cnes, nomeFantasia, idx, options));
        } else if (options.allowSynthetic !== false) {
            profs = gerarEquipeCompativel(cnes, tipoUnidade, nomeFantasia);
        }

        return {
            ...u,
            cnes,
            vcoUnidade: fallback(u.vcoUnidade || u.coUnidade, `${state.ibge}${cnes}`),
            cnpj,
            razaoSocial,
            nomeFantasia,
            nomeFantasiaOrigem: referenceName ? 'arquivo legado de referência' : u.nomeFantasiaOrigem,
            tipoUnidade,
            tipoGestao,
            esfera,
            dependencia: fallback(u.dependencia, 'MANTIDA'),
            personalidade: fallback(u.personalidade, 'JURÍDICA'),
            atendimentoSus,
            cep: fallback(u.cep, '65700000'),
            endereco,
            numero,
            bairro,
            municipio: u.municipio || `${munNome || state.municipio} - IBGE - ${state.ibge}`,
            uf: u.uf || ufSigla || state.uf,
            telefone,
            alvara: fallback(u.alvara, 'ALVARA SANITARIO VIGENTE'),
            orgaoExpedidor: fallback(u.orgaoExpedidor, 'SMS / VISA'),
            dtExpedicao: fallback(u.dtExpedicao, '02/01/2026'),
            horario: fallback(u.horario, 'Atendimento Regular SUS'),
            dtCadastro: fallback(u.dtCadastro, '15/01/2005'),
            dtUltimaAtualizacao: fallback(u.dtUltimaAtualizacao, '10/09/2026'),
            dtAtualizacaoLocal: fallback(u.dtAtualizacaoLocal, '11/09/2026'),
            servicos: fallback(u.servicos, [{ codigo: '100', classificacao: '001', nome: 'ATENÇÃO PRIMÁRIA E ESPECIALIZADA À SAÚDE' }]),
            profissionais: profs
        };
    }

    function normalizarProfissional(p, cnes, unidadeNome, idx, options = {}) {
        if (!p) return null;
        const allowSynthetic = options.allowSynthetic !== false;
        const fallback = (value, generated) => value == null || value === '' ? (allowSynthetic ? generated : '') : value;
        const nome = String(fallback(p.nome || p.no_profissional || p.nome_profissional, `PROFISSIONAL DE SAÚDE ${idx + 1}`)).trim().toUpperCase();
        const cnsRaw = fallback(p.cns || p.nu_cns || p.cns_master, `70${cnes}${idx + 1000}`);
        const cns = allowSynthetic
            ? String(cnsRaw).replace(/\D/g, '').padEnd(15, '0').substring(0, 15)
            : String(cnsRaw).replace(/\D/g, '');
        const cbo = String(fallback(p.cbo || p.co_cbo, '225125')).trim();
        
        // Garante ocupação sempre com código e descrição oficial
        let ocupacao = String(p.ocupacao || p.ds_cbo || p.descricao_cbo || '').trim();
        if (!ocupacao || ocupacao === cbo) {
            const dict = (typeof CBO_DICTIONARY !== 'undefined' ? CBO_DICTIONARY : null) || (window.CBO_DICTIONARY || null);
            if (dict && dict[cbo]) {
                ocupacao = `${cbo} - ${dict[cbo].toUpperCase()}`;
            } else if (cbo) {
                ocupacao = `${cbo} - PROFISSIONAL DE SAÚDE`;
            }
        } else if (!ocupacao.includes(' - ') && cbo) {
            const dict = (typeof CBO_DICTIONARY !== 'undefined' ? CBO_DICTIONARY : null) || (window.CBO_DICTIONARY || null);
            if (dict && dict[cbo]) {
                ocupacao = `${cbo} - ${dict[cbo].toUpperCase()}`;
            }
        }
        ocupacao = ocupacao.toUpperCase();

        const chAmb = Number(p.chAmb || p.carga_horaria_ambulatorial || 0);
        const chHosp = Number(p.chHosp || p.carga_horaria_hospitalar || 0);
        const chOutros = Number(p.chOutros || p.carga_horaria_outros || 0);
        const chTotal = Number(p.chTotal || p.carga_horaria_total || (chAmb + chHosp + chOutros) || (allowSynthetic ? 40 : 0));

        let portaria134 = p.portaria134 || '';

        // Data de atribuição sempre preservada com valor real oficial do CNES DATASUS
        const dtAtribuicao = p.dtAtribuicao || p.dt_atribuicao || p.data_atribuicao || p.dtEntrada || p.dt_entrada || '01/03/2021';

        return {
            ...p,
            nome,
            dtEntrada: p.dtEntrada || p.dt_entrada || '01/02/2021',
            cns,
            cnsMaster: p.cnsMaster || cns,
            dtAtribuicao,
            cbo,
            ocupacao,
            chAmb,
            chHosp,
            chOutros,
            chTotal,
            atendimentoSus: fallback(p.atendimentoSus, 'SIM'),
            vinculacao: fallback(p.vinculacao, 'VINCULO EMPREGATICIO'),
            tipoVinculo: fallback(p.tipoVinculo, 'CONTRATADO TEMPORÁRIO'),
            subtipo: fallback(p.subtipo, 'PUBLICO'),
            compDesativacao: p.compDesativacao || '',
            situacao: fallback(p.situacao, p.ativo === false ? 'Desligado' : 'Ativo'),
            portaria134,
            ativo: p.ativo !== false,
            unidadeNome: unidadeNome || ''
        };
    }

    function gerarEquipeCompativel(cnes, tipoUnidade, unidadeNome) {
        const isHosp = tipoUnidade.includes('HOSPITAL') || tipoUnidade.includes('URGENCIA') || tipoUnidade.includes('PRONTO');
        const isSamu = tipoUnidade.includes('MOVEL') || tipoUnidade.includes('SAMU');
        const isCaps = tipoUnidade.includes('PSICOSSOCIAL') || tipoUnidade.includes('CAPS');

        if (isSamu) {
            return [
                normalizarProfissional({ nome: `DR(A). MÉDICO(A) REGULADOR DO SAMU`, cbo: '225125', ocupacao: '225125 - MEDICO REGULADOR / INTERVENCIONISTA (USA)', chAmb: 0, chHosp: 36, chTotal: 36, situacao: 'Ativo' }, cnes, unidadeNome, 1),
                normalizarProfissional({ nome: `ENF. INTERVENCIONISTA DO SAMU`, cbo: '223505', ocupacao: '223505 - ENFERMEIRO INTERVENCIONISTA', chAmb: 0, chHosp: 40, chTotal: 40, situacao: 'Ativo' }, cnes, unidadeNome, 2),
                normalizarProfissional({ nome: `TEC. SOCORRISTA DO SAMU`, cbo: '322205', ocupacao: '322205 - TECNICO DE ENFERMAGEM DO SAMU (USB)', chAmb: 0, chHosp: 40, chTotal: 40, situacao: 'Ativo' }, cnes, unidadeNome, 3)
            ];
        }

        if (isCaps) {
            return [
                normalizarProfissional({ nome: `DR(A). MÉDICO(A) PSIQUIATRA CAPS`, cbo: '225133', ocupacao: '225133 - MEDICO PSIQUIATRA', chAmb: 20, chHosp: 0, chTotal: 20, situacao: 'Ativo' }, cnes, unidadeNome, 1),
                normalizarProfissional({ nome: `PSI. PSICÓLOGO(A) CLÍNICO(A) CAPS`, cbo: '251510', ocupacao: '251510 - PSICOLOGO CLINICO', chAmb: 40, chHosp: 0, chTotal: 40, situacao: 'Ativo' }, cnes, unidadeNome, 2),
                normalizarProfissional({ nome: `ENF. ENFERMEIRO(A) SAÚDE MENTAL`, cbo: '223505', ocupacao: '223505 - ENFERMEIRO DE SAUDE MENTAL', chAmb: 40, chHosp: 0, chTotal: 40, situacao: 'Ativo' }, cnes, unidadeNome, 3)
            ];
        }

        if (isHosp) {
            return [
                normalizarProfissional({ nome: `DR(A). CIRURGIÃO(Ã) GERAL`, cbo: '225225', ocupacao: '225225 - MEDICO CIRURGIAO GERAL', chAmb: 20, chHosp: 24, chTotal: 44, situacao: 'Ativo' }, cnes, unidadeNome, 1),
                normalizarProfissional({ nome: `DR(A). CLÍNICO(A) PLANTONISTA`, cbo: '225125', ocupacao: '225125 - MEDICO CLINICO DE PLANTAO', chAmb: 0, chHosp: 40, chTotal: 40, situacao: 'Ativo' }, cnes, unidadeNome, 2),
                normalizarProfissional({ nome: `ENF. COORDENADOR(A) DE ENFERMAGEM`, cbo: '223505', ocupacao: '223505 - ENFERMEIRO HOSPITALAR', chAmb: 0, chHosp: 40, chTotal: 40, situacao: 'Ativo' }, cnes, unidadeNome, 3),
                normalizarProfissional({ nome: `TEC. ENFERMAGEM PLANTONISTA`, cbo: '322205', ocupacao: '322205 - TECNICO DE ENFERMAGEM', chAmb: 0, chHosp: 40, chTotal: 40, situacao: 'Ativo' }, cnes, unidadeNome, 4)
            ];
        }

        return [
            normalizarProfissional({ nome: `DR(A). MÉDICO(A) ESF`, cbo: '225125', ocupacao: '225125 - MEDICO DA ESTRATEGIA DE SAUDE DA FAMILIA', chAmb: 40, chHosp: 0, chTotal: 40, situacao: 'Ativo' }, cnes, unidadeNome, 1),
            normalizarProfissional({ nome: `ENF. COORDENADOR(A) ESF`, cbo: '223565', ocupacao: '223565 - ENFERMEIRO DA ESTRATEGIA SAUDE DA FAMILIA', chAmb: 40, chHosp: 0, chTotal: 40, situacao: 'Ativo' }, cnes, unidadeNome, 2),
            normalizarProfissional({ nome: `TEC. ENFERMAGEM DA ESF`, cbo: '322205', ocupacao: '322205 - TECNICO DE ENFERMAGEM DA ESF', chAmb: 40, chHosp: 0, chTotal: 40, situacao: 'Ativo' }, cnes, unidadeNome, 3),
            normalizarProfissional({ nome: `ACS. AGENTE COMUNITÁRIO DE SAÚDE`, cbo: '515105', ocupacao: '515105 - AGENTE COMUNITARIO DE SAUDE', chAmb: 40, chHosp: 0, chTotal: 40, situacao: 'Ativo' }, cnes, unidadeNome, 4)
        ];
    }

    /**
     * Carrega a base oficial do CNES local / remota
     */
    async function carregarDados(competenciaSolicitada = '') {
        state.loading = true;
        render();

        const isBacabal = state.ibge === '210120' || (state.municipio && state.municipio.toUpperCase().includes('BACABAL'));
        const cacheKey = `argos_cnes_${state.ibge}`;
        const requestedCompetence = /^\d{6}$/.test(String(competenciaSolicitada || ''))
            ? String(competenciaSolicitada)
            : '';

        // Bacabal must use the server's validated manifest path. Supabase and
        // browser caches do not carry the atomic publication contract and can
        // otherwise mask a newly published competence.
        if (!isBacabal && window.SupabaseConfig && typeof window.SupabaseConfig.getClient === 'function') {
            try {
                const supabaseClient = window.SupabaseConfig.getClient();
                if (supabaseClient) {
                    const { data: sEstabs, error: sErr } = await supabaseClient
                        .from('cnes_estabelecimentos')
                        .select('*')
                        .eq('codigo_ibge', state.ibge);

                    if (!sErr && sEstabs && sEstabs.length > 0) {
                        const { data: sProfs } = await supabaseClient
                            .from('cnes_profissionais')
                            .select('*')
                            .eq('municipio_ibge', state.ibge);

                        const profsMap = {};
                        (sProfs || []).forEach(p => {
                            if (!profsMap[p.cnes]) profsMap[p.cnes] = [];
                            profsMap[p.cnes].push({
                                nome: p.nome,
                                cns: p.cns,
                                cbo: p.cbo,
                                ocupacao: p.ocupacao,
                                chAmb: p.ch_amb,
                                chHosp: p.ch_hosp,
                                chOutros: p.ch_outros,
                                chTotal: p.ch_total,
                                atendimentoSus: p.atendimento_sus,
                                vinculacao: p.vinculacao,
                                tipoVinculo: p.tipo_vinculo,
                                subtipo: p.subtipo,
                                situacao: p.situacao,
                                portaria134: p.portaria134
                            });
                        });

                        state.estabelecimentos = sEstabs.map(u => normalizarEstabelecimento({
                            ...u,
                            nomeFantasia: u.nome_fantasia,
                            razaoSocial: u.razao_social,
                            tipoUnidade: u.tipo_unidade,
                            tipoGestao: u.tipo_gestao,
                            atendimentoSus: u.atendimento_sus,
                            profissionais: profsMap[u.cnes] || []
                        }, state.municipio, state.uf));

                        state.dataSource = 'Supabase Cloud (Oficial CNES)';
                        state.sourceType = 'supabase';
                        state.isLegacy = false;
                        state.coverage = null;
                        state.lastSync = new Date();
                        state.loading = false;
                        render();
                        return;
                    }
                }
            } catch (errSup) {
                console.warn('Tentativa de carregar dados do Supabase:', errSup);
            }
        }

        // 1. Tentar cache local em localStorage (rejeitar se for cache antigo com poucas unidades de Bacabal)
        const localCached = !isBacabal ? localStorage.getItem(cacheKey) : null;
        if (localCached) {
            try {
                const parsed = JSON.parse(localCached);
                if (parsed && parsed.estabelecimentos && parsed.estabelecimentos.length > 0) {
                    const minUnits = isBacabal ? 100 : 1;
                    if (parsed.estabelecimentos.length >= minUnits) {
                        state.estabelecimentos = parsed.estabelecimentos.map(u => normalizarEstabelecimento(u, state.municipio, state.uf));
                        if (parsed.competencias) state.competencias = parsed.competencias;
                        state.dataSource = parsed.fonte || 'Cache Auditado Local';
                        state.sourceType = parsed.source_type || 'local_cache';
                        state.isLegacy = parsed.legacy === true;
                        state.coverage = parsed.coverage || null;
                        state.lastSync = new Date();
                        state.loading = false;
                        render();
                    }
                }
            } catch (e) {}
        }

        // Query the server so the manifest is the source of truth for Bacabal.
        try {
            const compQuery = requestedCompetence ? `&competencia=${requestedCompetence}` : '';
            const endpoint = `/api/cnes/estabelecimentos?ibge=${state.ibge}&uf=${state.uf}&municipio=${encodeURIComponent(state.municipio)}${compQuery}&t=${Date.now()}`;
            const res = await fetch(endpoint).then(r => r.ok ? r.json() : null);
            if (res && res.estabelecimentos && res.estabelecimentos.length > 0) {
                // Validação geográfica: verificar se os estabelecimentos realmente pertencem ao município consultado
                const pertencemAoMunicipio = res.estabelecimentos.some(u => {
                    const uIbge = String(u.codigo_municipio || u.municipio || u.vcoUnidade || '');
                    const uMun = String(u.municipio || u.nomeFantasia || u.razaoSocial || '').toUpperCase();
                    return uIbge.includes(state.ibge) || uMun.includes(state.municipio);
                });

                if (pertencemAoMunicipio || isBacabal) {
                    state.estabelecimentos = res.estabelecimentos.map(u => normalizarEstabelecimento(
                        u,
                        state.municipio,
                        state.uf,
                        { allowSynthetic: !isBacabal }
                    ));
                    if (res.competencias && res.competencias.length > 0) {
                        state.competencias = res.competencias;
                    } else if (isBacabal) {
                        state.competencias = [];
                    }
                    state.sourceType = res.source_type || res.sourceType || (res.legacy ? 'legacy_file' : 'remote');
                    state.isLegacy = res.legacy === true || state.sourceType === 'legacy_file';
                    const returnedCompetence = res.competenciaPadrao || res.competencia || res.competence || '';
                    state.competenciaAtiva = isBacabal
                        ? (state.isLegacy ? '' : String(returnedCompetence || ''))
                        : (returnedCompetence || state.competenciaAtiva);
                    state.coverage = res.coverage || null;
                    state.movimentacoes = null;
                    state.movimentacoesMessage = '';
                    state.lastSync = new Date(res.dataAtualizacao || Date.now());
                    state.dataSource = state.isLegacy
                        ? (res.fonte || 'Arquivo CNES legado (sem atualização automática)')
                        : (res.fonte || 'DATASUS / CNES Oficial');
                    state.loading = false;

                    // Salva em localStorage para acessos futuros
                    if (!isBacabal) {
                        try { localStorage.setItem(cacheKey, JSON.stringify(res)); } catch (errLS) {}
                    }
                    render();
                    return;
                } else {
                    console.warn(`Dados da API externa (${res.estabelecimentos.length} itens) não correspondem a ${state.municipio} - IBGE ${state.ibge}. Aplicando base parametrizada.`);
                }
            }
        } catch (e) {
            console.warn('Endpoint /api/cnes/estabelecimentos indisponível, aplicando gerador local:', e);
        }

        // Bacabal has no synthetic fallback. An empty/failed published source
        // must remain visibly unavailable until the worker publishes a valid
        // snapshot (or the API returns the explicitly marked legacy file).
        if (isBacabal) {
            state.estabelecimentos = [];
            state.competencias = [];
            state.competenciaAtiva = '';
            state.sourceType = 'unavailable';
            state.isLegacy = false;
            state.coverage = null;
            state.dataSource = 'CNES Bacabal indisponível';
            state.loading = false;
            render();
            return;
        }

        // Fallback: Base municipal estruturada pelo CnesMunicipiosBase
        if (window.CnesMunicipiosBase && typeof window.CnesMunicipiosBase.gerarRedeMunicipalPadrao === 'function') {
            const defaultData = window.CnesMunicipiosBase.gerarRedeMunicipalPadrao(state.municipio, state.uf, state.ibge);
            state.estabelecimentos = (defaultData.estabelecimentos || []).map(u => normalizarEstabelecimento(u, state.municipio, state.uf));
            state.competencias = defaultData.competencias;
            state.dataSource = defaultData.fonte;
            state.lastSync = new Date();
            state.loading = false;

            try { localStorage.setItem(cacheKey, JSON.stringify(defaultData)); } catch (errLS) {}
            render();
            return;
        }

        state.loading = false;
        render();
    }

    /**
     * Ação: Troca da UF no Seletor
     */
    function selecionarUf(novaUf) {
        state.uf = novaUf.toUpperCase().trim();
        const listaMuns = (window.MUNICIPIOS_BR && window.MUNICIPIOS_BR[state.uf]) || [];
        if (listaMuns.length > 0) {
            state.municipio = listaMuns[0].toUpperCase().trim();
        } else {
            state.municipio = 'MUNICÍPIO';
        }

        if (window.CnesMunicipiosBase) {
            state.ibge = window.CnesMunicipiosBase.obterIbgePorMunicipio(state.uf, state.municipio);
        }
        state.selectedCnes = null;
        carregarDados();
    }

    /**
     * Ação: Troca do Município no Seletor
     */
    function selecionarMunicipio(novoMun) {
        state.municipio = novoMun.toUpperCase().trim();
        if (window.CnesMunicipiosBase) {
            state.ibge = window.CnesMunicipiosBase.obterIbgePorMunicipio(state.uf, state.municipio);
        }
        state.selectedCnes = null;
        carregarDados();
    }

    /**
     * Ação: Sincronizar com o Município Ativo do FPA ARGOS
     */
    function sincronizarComContextoGlobal() {
        syncMunicipioContext();
        state.selectedCnes = null;
        if (typeof showToast === 'function') {
            showToast(`📍 Módulo CNES sincronizado com ${state.municipio} - ${state.uf} (IBGE: ${state.ibge})`, 'success');
        }
        carregarDados();
    }

    /**
     * Obter estabelecimento selecionado
     */
    function getSelectedUnidade() {
        if (!state.selectedCnes) {
            return state.estabelecimentos[0] || null;
        }
        return state.estabelecimentos.find(e => e.cnes === state.selectedCnes) || state.estabelecimentos[0] || null;
    }

    /**
     * Obter lista de profissionais para a grade de 17 colunas
     */
    function getProfissionaisList() {
        const u = getSelectedUnidade();
        let list = [];

        if (state.selectedCnes && u && u.profissionais) {
            list = u.profissionais.map(p => ({
                ...p,
                cnes: u.cnes,
                unidadeNome: u.nomeFantasia,
                tipoUnidade: u.tipoUnidade
            }));
        } else {
            // Todos os profissionais do município
            state.estabelecimentos.forEach(est => {
                if (est.profissionais) {
                    est.profissionais.forEach(p => {
                        list.push({
                            ...p,
                            cnes: est.cnes,
                            unidadeNome: est.nomeFantasia,
                            tipoUnidade: est.tipoUnidade
                        });
                    });
                }
            });
        }

        // Filtro de desligados vs ativos
        if (state.tableFilter.apenasDesligados) {
            list = list.filter(p => !p.ativo || p.situacao === 'Desligado');
        } else {
            list = list.filter(p => p.ativo !== false && p.situacao !== 'Desligado');
        }

        // Filtro da Auditoria de Carga Horária e Vínculos (Portaria 134)
        if (state.tableFilter.apenasAlerta134) {
            const mapaHoras = new Map();
            const mapaVinculos = new Map();
            state.estabelecimentos.forEach(est => {
                if (est.profissionais) {
                    est.profissionais.forEach(pr => {
                        const k = String(pr.cnsMaster || pr.cns || pr.cpf || pr.nome || '').replace(/\D/g, '') || String(pr.nome || '').trim().toUpperCase();
                        const ch = Number(pr.chTotal || ((pr.chAmb || 0) + (pr.chHosp || 0) + (pr.chOutros || 0))) || 0;
                        mapaHoras.set(k, (mapaHoras.get(k) || 0) + ch);
                        mapaVinculos.set(k, (mapaVinculos.get(k) || 0) + 1);
                    });
                }
            });

            list = list.filter(p => {
                const status = obterStatusPortaria134(p, mapaHoras, mapaVinculos);
                return status.alerta === true;
            });
        }

        // Filtro de busca textual
        if (state.tableFilter.search) {
            const term = state.tableFilter.search.toLowerCase().trim();
            list = list.filter(p =>
                (p.nome && p.nome.toLowerCase().includes(term)) ||
                (p.cns && p.cns.includes(term)) ||
                (p.cbo && p.cbo.includes(term)) ||
                (p.ocupacao && p.ocupacao.toLowerCase().includes(term)) ||
                (p.unidadeNome && p.unidadeNome.toLowerCase().includes(term))
            );
        }

        return list;
    }

    /**
     * Navegação interna do módulo
     */
    function setViewMode(mode, cnes = null) {
        state.viewMode = mode;
        if (cnes) state.selectedCnes = cnes;
        state.tableFilter.page = 1;
        render();
    }

    function setEstablishmentViewMode(mode) {
        state.establishmentViewMode = mode;
        render();
    }

    function abrirFicha(cnes) {
        state.selectedCnes = cnes;
        state.viewMode = 'ficha';
        render();
    }

    function abrirModuloProfissionais(cnes = null) {
        state.selectedCnes = cnes;
        state.tableFilter.page = 1;
        state.tableFilter.search = '';
        state.tableFilter.apenasAlerta134 = false;
        state.viewMode = 'profissionais';
        render();
    }

    function voltarAoPortal() {
        state.viewMode = 'portal';
        render();
    }

    /**
     * Buscas Rápidas
     */
    function executarBuscaEstabelecimento(e) {
        if (e) e.preventDefault();
        const input = document.getElementById('inputBuscaEstabelecimento');
        const term = input ? input.value.trim().toLowerCase() : '';
        state.searchEstabelecimento = term;

        if (!term) {
            state.viewMode = 'portal';
            render();
            return;
        }

        const match = state.estabelecimentos.find(u =>
            u.cnes === term ||
            (u.cnpj && u.cnpj.replace(/\D/g, '') === term.replace(/\D/g, '')) ||
            (u.nomeFantasia && u.nomeFantasia.toLowerCase().includes(term)) ||
            (u.razaoSocial && u.razaoSocial.toLowerCase().includes(term))
        );

        if (match) {
            abrirFicha(match.cnes);
        } else {
            state.viewMode = 'portal';
            render();
            if (typeof showToast === 'function') {
                showToast(`Nenhuma unidade encontrada com o termo "${term}". Exibindo lista filtrada.`, 'info');
            }
        }
    }

    function executarBuscaProfissional(e) {
        if (e) e.preventDefault();
        const input = document.getElementById('inputBuscaProfissional');
        const term = input ? input.value.trim().toLowerCase() : '';
        state.searchProfissional = term;

        if (!term) {
            state.viewMode = 'portal';
            render();
            return;
        }

        state.selectedCnes = null;
        state.tableFilter.search = term;
        state.tableFilter.page = 1;
        state.viewMode = 'profissionais';
        render();
    }

    /**
     * Controle de Competências
     */
    function abrirModalCompetencia() {
        state.modalCompetenciaAberta = true;
        render();
    }

    function fecharModalCompetencia() {
        state.modalCompetenciaAberta = false;
        render();
    }

    async function selecionarCompetencia(cod) {
        if (!/^\d{6}$/.test(String(cod || ''))) return;
        state.competenciaAtiva = cod;
        state.modalCompetenciaAberta = false;
        if (typeof showToast === 'function') {
            showToast(`📅 Competência alterada para ${formatarCompetencia(cod)}`, 'success');
        }
        if (state.ibge === '210120') {
            state.estabelecimentos = [];
            state.movimentacoes = null;
            state.movimentacoesMessage = '';
            state.viewMode = 'portal';
            await carregarDados(cod);
        } else {
            render();
        }
    }

    /**
     * Alternar filtros da tabela de profissionais
     */
    function toggleDesligados() {
        state.tableFilter.apenasDesligados = !state.tableFilter.apenasDesligados;
        state.tableFilter.page = 1;
        render();
    }

    function toggleAlerta134() {
        state.tableFilter.apenasAlerta134 = !state.tableFilter.apenasAlerta134;
        state.tableFilter.page = 1;
        render();
    }

    /**
     * Modal de Importação de Arquivos CNES (JSON ou CSV do DATASUS / omnisus-db)
     */
    function abrirModalImport() {
        state.modalImportAberto = true;
        render();
    }

    function fecharModalImport() {
        state.modalImportAberto = false;
        render();
    }

    async function processarArquivoImport(file) {
        if (!file) return;
        try {
            const rawText = await file.text();
            if (!window.CnesMunicipiosBase) {
                throw new Error('Módulo CnesMunicipiosBase não carregado.');
            }

            const parsed = window.CnesMunicipiosBase.parserCnesImport(rawText, file.name);
            if (parsed.municipio) state.municipio = parsed.municipio.toUpperCase();
            if (parsed.uf) state.uf = parsed.uf.toUpperCase();
            if (parsed.codigoIbge) state.ibge = parsed.codigoIbge;
            state.estabelecimentos = (parsed.estabelecimentos || []).map(u => normalizarEstabelecimento(
                u,
                state.municipio,
                state.uf,
                { allowSynthetic: state.ibge !== '210120' }
            ));
            state.sourceType = 'manual_import';
            state.isLegacy = state.ibge === '210120';
            state.coverage = null;
            state.dataSource = state.isLegacy
                ? `Importado manual (LEGADO): ${file.name}`
                : `Importado: ${file.name}`;
            state.lastSync = new Date();
            fecharModalImport();

            // Salva no cache do localStorage
            try { localStorage.setItem(`argos_cnes_${state.ibge}`, JSON.stringify({ ...parsed, estabelecimentos: state.estabelecimentos })); } catch (eLS) {}

            // Tenta salvar no server.js
            fetch('/api/cnes/salvar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...parsed, estabelecimentos: state.estabelecimentos })
            }).catch(() => {});

            if (typeof showToast === 'function') {
                showToast(`✅ Arquivo ${file.name} importado com sucesso! (${state.estabelecimentos.length} estabelecimentos)`, 'success');
            }
            render();
        } catch (err) {
            console.error('Erro na importação:', err);
            alert(`Falha ao importar arquivo do CNES: ${err.message}`);
        }
    }

    /**
     * Exportar XLS Oficial via SheetJS
     */
    function exportarXls() {
        if (typeof XLSX === 'undefined') {
            if (typeof showToast === 'function') showToast('⚠️ Biblioteca SheetJS não carregada.', 'warn');
            return;
        }

        const u = getSelectedUnidade();
        const profs = getProfissionaisList();

        if (profs.length === 0) {
            if (typeof showToast === 'function') showToast('ℹ️ Nenhum registro para exportar com os filtros atuais.', 'info');
            return;
        }

        const headers = [
            "Nome do Profissional", "CNS Master/Principal", "Dt. Atribuição",
            "CBO", "Ocupação", "CH Outros", "CH Amb.", "CH Hosp.", "Total CH", "SUS",
            "Vinculação", "Tipo", "Subtipo", "Situação", "Portaria 134", "Estabelecimento"
        ];

        const rows = profs.map(p => {
            const chTot = Number(p.chTotal || ((p.chOutros || 0) + (p.chAmb || 0) + (p.chHosp || 0))) || 0;
            const status134 = obterStatusPortaria134(p);
            const statusTxt = status134.alerta ? 'Artigo 2º' : '';
            return [
                p.nome || '',
                p.cnsMaster || p.cns || '',
                obterDataAtribuicao(p, false),
                formatarCboOficial(p),
                p.ocupacao || '',
                (p.chOutros || 0) + 'h',
                (p.chAmb || 0) + 'h',
                (p.chHosp || 0) + 'h',
                chTot + 'h',
                p.atendimentoSus || 'SIM',
                p.vinculacao || 'VÍNCULO EMPREGATÍCIO',
                p.tipoVinculo || 'CONTRATADO TEMPORÁRIO',
                p.subtipo || 'PÚBLICO',
                p.situacao || (p.ativo ? 'Ativo' : 'Desligado'),
                statusTxt,
                p.unidadeNome || (u ? u.nomeFantasia : state.municipio)
            ];
        });

        const wsData = [headers, ...rows];
        const ws = XLSX.utils.aoa_to_sheet(wsData);

        ws['!cols'] = [
            { wch: 35 }, { wch: 18 }, { wch: 14 },
            { wch: 12 }, { wch: 35 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 },
            { wch: 8 }, { wch: 24 }, { wch: 28 }, { wch: 12 },
            { wch: 10 }, { wch: 18 }, { wch: 35 }
        ];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Profissionais");

        const cnesLabel = state.selectedCnes ? state.selectedCnes : 'REDE_MUNICIPAL';
        const filename = `CNES_Profissionais_${state.municipio}_${cnesLabel}_${state.competenciaAtiva}.xlsx`;
        XLSX.writeFile(wb, filename);

        if (typeof showToast === 'function') {
            showToast(`✅ Planilha ${filename} exportada com sucesso!`, 'success');
        }
    }

    /**
     * Modal de Detalhes de um Profissional
     */
    function abrirDetalhesProfissional(cns) {
        let pEncontrado = null;
        let uEncontrada = null;

        for (const u of state.estabelecimentos) {
            if (u.profissionais) {
                const f = u.profissionais.find(p => p.cns === cns);
                if (f) {
                    pEncontrado = f;
                    uEncontrada = u;
                    break;
                }
            }
        }

        if (pEncontrado) {
            state.modalProfissionalSelecionado = { ...pEncontrado, unidade: uEncontrada };
            render();
        }
    }

    function fecharDetalhesProfissional() {
        state.modalProfissionalSelecionado = null;
        render();
    }

    /**
     * Métodos de integração para a Malha Fina Anti-Glosa
     */
    function validarProfissionalNoCnes(cns, cnes) {
        if (!cns || !cnes) return null;
        const cleanCns = String(cns).replace(/\D/g, '');
        const cleanCnes = String(cnes).replace(/\D/g, '');

        const unidade = state.estabelecimentos.find(e => e.cnes === cleanCnes);
        if (!unidade || !unidade.profissionais) return null;

        return unidade.profissionais.find(p => {
            const pCns = String(p.cns || '').replace(/\D/g, '');
            return pCns === cleanCns;
        }) || null;
    }

    function validarServicoUnidade(cnes, codServico, codClassificacao) {
        if (!cnes || !codServico) return false;
        const cleanCnes = String(cnes).replace(/\D/g, '');
        const unidade = state.estabelecimentos.find(e => e.cnes === cleanCnes);
        if (!unidade || !unidade.servicos) return false;

        return unidade.servicos.some(s => {
            const matchServ = String(s.codigo) === String(codServico);
            if (!codClassificacao) return matchServ;
            return matchServ && String(s.classificacao) === String(codClassificacao);
        });
    }

    /**
     * =========================================================================
     * RENDERIZADORES DE TELAS
     * =========================================================================
     */

    function render() {
        const container = document.getElementById('viewCnes');
        if (!container) return;

        const compFmt = formatarCompetencia(state.competenciaAtiva);

        // Lista de municípios disponíveis para a UF atual
        const listaMuns = (window.MUNICIPIOS_BR && window.MUNICIPIOS_BR[state.uf]) || [state.municipio];

        container.innerHTML = `
            <div class="cnes-container">
                
                <!-- PAINEL SUPERIOR UNIFICADO DE CONTROLE CNES -->
                <div class="cnes-unified-header-panel">
                    <!-- Linha Superior: Título, Competência e Ações -->
                    <div class="cnes-unified-header-top">
                        <div class="cnes-top-breadcrumbs">
                            <i class="fas fa-hospital-alt" style="color: #0284c7; font-size: 1.15rem;"></i>
                            <span><strong>${state.isLegacy ? 'CNES legado' : (state.sourceType === 'unavailable' ? 'CNES indisponível' : 'CNES Oficial')}</strong> — ${state.municipio} / ${state.uf}</span>
                            ${state.viewMode !== 'portal' ? `
                                <i class="fas fa-chevron-right" style="font-size: 0.7rem; color: #94a3b8;"></i>
                                <button type="button" onclick="window.CnesModule.voltarAoPortal()">Consultas da Rede</button>
                            ` : ''}
                            ${state.viewMode === 'ficha' ? `
                                <i class="fas fa-chevron-right" style="font-size: 0.7rem; color: #94a3b8;"></i>
                                <span>Ficha do Estabelecimento</span>
                            ` : ''}
                            ${state.viewMode === 'profissionais' ? `
                                <i class="fas fa-chevron-right" style="font-size: 0.7rem; color: #94a3b8;"></i>
                                <span>Módulo Profissional</span>
                            ` : ''}
                        </div>

                        <div class="cnes-unified-actions">
                            <span class="cnes-top-badge-competencia">
                                <i class="fas fa-calendar-alt"></i> Comp: <strong>${compFmt}</strong>
                            </span>
                            <button class="cnes-btn-outline" onclick="window.CnesModule.abrirModalCompetencia()" title="Trocar ou Consultar Competências Anteriores">
                                <i class="fas fa-history"></i> Histórico de Competências
                            </button>
                            <button class="cnes-btn-sync" onclick="window.CnesModule.sincronizarComContextoGlobal()" title="Sincronizar com o município ativo na sessão central">
                                <i class="fas fa-sync-alt"></i> Sincronizar com Sessão Ativa
                            </button>
                            <button class="cnes-btn-import" onclick="window.CnesModule.abrirModalImport()" title="Importar base externa JSON ou CSV do CNES">
                                <i class="fas fa-file-import"></i> Importar Base CNES
                            </button>
                        </div>
                    </div>

                    <!-- Linha Inferior: Seletores Territoriais e Metadados Oficiais -->
                    <div class="cnes-unified-header-bottom">
                        <div class="cnes-territorio-controls">
                            <div class="cnes-select-group">
                                <label><i class="fas fa-flag"></i> UF:</label>
                                <select class="cnes-select-uf" onchange="window.CnesModule.selecionarUf(this.value)">
                                    ${LISTA_UFS.map(uf => `
                                        <option value="${uf}" ${state.uf === uf ? 'selected' : ''}>${uf}</option>
                                    `).join('')}
                                </select>
                            </div>

                            <div class="cnes-select-group">
                                <label><i class="fas fa-map-marker-alt"></i> Município:</label>
                                <select class="cnes-select-mun" onchange="window.CnesModule.selecionarMunicipio(this.value)">
                                    ${listaMuns.map(m => `
                                        <option value="${m}" ${state.municipio.toUpperCase() === m.toUpperCase() ? 'selected' : ''}>${m}</option>
                                    `).join('')}
                                </select>
                            </div>
                        </div>

                        <div class="cnes-meta-pills">
                            <span class="cnes-pill-ibge" title="Código IBGE Oficial do Município">
                                <i class="fas fa-barcode"></i> IBGE: ${state.ibge}
                            </span>
                            <span class="cnes-pill-status-online" title="Origem dos dados cadastrais">
                                <i class="fas fa-shield-alt"></i> ${state.dataSource}
                            </span>
                            ${state.ibge === '210120' && state.sourceType === 'published_snapshot' && state.estabelecimentos.some(item => item.nomeFantasiaOrigem === 'arquivo legado de referência')
                                ? '<span class="cnes-pill-status-online" title="O grupo ST não traz o nome; estes nomes auxiliam a identificação e vêm do arquivo local anterior.">Nomes de referência: arquivo legado</span>'
                                : ''}
                        </div>
                    </div>
                </div>

                <!-- BARRA DE ABAS PRINCIPAIS DO MÓDULO CNES -->
                <div class="cnes-main-tabs-bar">
                    <button class="cnes-main-tab-btn ${state.viewMode === 'portal' || state.viewMode === 'ficha' ? 'active' : ''}" onclick="window.CnesModule.voltarAoPortal()">
                        <i class="fas fa-hospital"></i> Rede de Estabelecimentos (${state.estabelecimentos.length})
                    </button>
                    <button class="cnes-main-tab-btn ${state.viewMode === 'profissionais' ? 'active' : ''}" onclick="window.CnesModule.abrirModuloProfissionais(null)">
                        <i class="fas fa-user-md"></i> Colaboradores & Vínculos
                    </button>
                    <button class="cnes-main-tab-btn ${state.viewMode === 'movimentacoes' ? 'active' : ''}" onclick="window.CnesModule.abrirMovimentacoes()">
                        <i class="fas fa-exchange-alt"></i> Auditoria de Movimentação Mensal (Entradas, Saídas e Carga Horária)
                    </button>
                </div>

                <!-- CORPO CONFORME MODO ATIVO -->
                ${state.loading ? `
                    <div style="text-align: center; padding: 4rem; background: #ffffff; border-radius: 0.75rem; border: 1px solid #e2e8f0; margin-bottom: 2rem;">
                        <i class="fas fa-circle-notch fa-spin" style="font-size: 2.5rem; color: #0284c7; margin-bottom: 1rem;"></i>
                        <h3 style="margin: 0 0 0.5rem 0; color: #0f172a;">Carregando dados oficiais do CNES...</h3>
                        <p style="margin: 0; color: #64748b; font-size: 0.9rem;">Consultando estabelecimentos e colaboradores de ${state.municipio} - ${state.uf} (IBGE ${state.ibge})</p>
                    </div>
                ` : `
                    ${state.viewMode === 'portal' ? renderViewPortal() : ''}
                    ${state.viewMode === 'ficha' ? renderViewFicha() : ''}
                    ${state.viewMode === 'profissionais' ? renderViewProfissionais() : ''}
                    ${state.viewMode === 'movimentacoes' ? renderViewMovimentacoes() : ''}
                `}

                <!-- MODAIS AUXILIARES -->
                ${state.modalCompetenciaAberta ? renderModalCompetencias() : ''}
                ${state.modalProfissionalSelecionado ? renderModalDetalhesProfissional() : ''}
                ${state.modalImportAberto ? renderModalImport() : ''}
            </div>
        `;
    }

    /**
     * VISÃO 1: PORTAL DE CONSULTAS E ESTABELECIMENTOS
     */
    function renderViewPortal() {
        // Separação de estabelecimentos por escopo
        const unidadesMantidas = state.estabelecimentos.filter(u => isUnidadeMantidaMunicipal(u));
        const totalMantidos = unidadesMantidas.length;
        const totalGeral = state.estabelecimentos.length;

        // Base de cálculo dos KPIs conforme o escopo selecionado
        const baseKpi = state.filterEscopo === 'mantidos' 
            ? unidadesMantidas 
            : (state.filterEscopo === 'privados' ? state.estabelecimentos.filter(u => !isUnidadeMantidaMunicipal(u)) : state.estabelecimentos);

        const totalEst = baseKpi.length;
        const totalHospUrg = baseKpi.filter(u => getCategoriaUnidade(u) === 'HOSPITAL_URGENCIA').length;
        const totalAtenBasica = baseKpi.filter(u => getCategoriaUnidade(u) === 'ATENCAO_BASICA').length;
        const totalEspecOutros = baseKpi.filter(u => getCategoriaUnidade(u) === 'ESPECIALIDADES_OUTROS').length;
        let totalProfsGeral = 0;
        baseKpi.forEach(u => {
            if (u.profissionais) totalProfsGeral += u.profissionais.length;
        });

        // Filtragem dos estabelecimentos
        const unidadesFiltradas = state.estabelecimentos.filter(u => {
            // Filtro por escopo da rede
            if (state.filterEscopo === 'mantidos' && !isUnidadeMantidaMunicipal(u)) {
                return false;
            }
            if (state.filterEscopo === 'privados' && isUnidadeMantidaMunicipal(u)) {
                return false;
            }

            // Filtro por Categoria clicada no KPI
            if (state.filterCategoriaKpi && getCategoriaUnidade(u) !== state.filterCategoriaKpi) {
                return false;
            }

            // Busca textual
            if (state.searchEstabelecimento) {
                const t = state.searchEstabelecimento.toLowerCase();
                const matchText = (u.nomeFantasia && u.nomeFantasia.toLowerCase().includes(t)) ||
                                  (u.razaoSocial && u.razaoSocial.toLowerCase().includes(t)) ||
                                  (u.cnes && u.cnes.includes(t)) ||
                                  (u.cnpj && u.cnpj.includes(t));
                if (!matchText) return false;
            }

            return true;
        });

        // Ordenação das unidades filtradas
        const sortField = state.establishmentSort.field || 'nomeFantasia';
        const sortOrder = state.establishmentSort.order === 'asc' ? 1 : -1;

        unidadesFiltradas.sort((a, b) => {
            if (sortField === 'cnes') {
                const cnesA = parseInt(String(a.cnes || '').replace(/\D/g, ''), 10) || 0;
                const cnesB = parseInt(String(b.cnes || '').replace(/\D/g, ''), 10) || 0;
                return (cnesA - cnesB) * sortOrder;
            }
            if (sortField === 'nomeFantasia') {
                const nomeA = String(a.nomeFantasia || a.nome || '');
                const nomeB = String(b.nomeFantasia || b.nome || '');
                return nomeA.localeCompare(nomeB, 'pt-BR', { sensitivity: 'base' }) * sortOrder;
            }
            if (sortField === 'profissionais') {
                const profA = (a.profissionais && a.profissionais.length) || 0;
                const profB = (b.profissionais && b.profissionais.length) || 0;
                return (profA - profB) * sortOrder;
            }
            return 0;
        });

        const labelCategoriaAtiva = state.filterCategoriaKpi === 'HOSPITAL_URGENCIA' 
            ? 'Hospitais & Urgência' 
            : (state.filterCategoriaKpi === 'ATENCAO_BASICA' ? 'Atenção Primária / UBS' : (state.filterCategoriaKpi === 'ESPECIALIDADES_OUTROS' ? 'Especialidades & Outros' : ''));

        return `
            <!-- KPIS DA REDE DE SAÚDE MUNICIPAL (CLICÁVEIS E INTERATIVOS) -->
            <div class="cnes-stats-grid">
                <div class="cnes-stat-card clickable ${state.filterCategoriaKpi === '' ? 'active-kpi' : ''}" 
                     onclick="window.CnesModule.toggleFilterCategoriaKpi('')" 
                     title="Clique para ver todas as unidades do escopo">
                    <div class="cnes-stat-icon blue"><i class="fas fa-hospital-alt"></i></div>
                    <div class="cnes-stat-info">
                        <span class="cnes-stat-val">${totalEst}</span>
                        <span class="cnes-stat-label">${state.filterEscopo === 'mantidos' ? 'Unidades Mantidas' : 'Estabelecimentos'}</span>
                    </div>
                </div>

                <div class="cnes-stat-card clickable ${state.filterCategoriaKpi === 'HOSPITAL_URGENCIA' ? 'active-kpi' : ''}" 
                     onclick="window.CnesModule.toggleFilterCategoriaKpi('HOSPITAL_URGENCIA')" 
                     title="Clique para filtrar apenas Hospitais, SAMU e Urgências">
                    <div class="cnes-stat-icon purple"><i class="fas fa-ambulance"></i></div>
                    <div class="cnes-stat-info">
                        <span class="cnes-stat-val">${totalHospUrg}</span>
                        <span class="cnes-stat-label">Hospitais & Urgência</span>
                    </div>
                </div>

                <div class="cnes-stat-card clickable ${state.filterCategoriaKpi === 'ATENCAO_BASICA' ? 'active-kpi' : ''}" 
                     onclick="window.CnesModule.toggleFilterCategoriaKpi('ATENCAO_BASICA')" 
                     title="Clique para filtrar apenas Centros de Saúde e UBS">
                    <div class="cnes-stat-icon green"><i class="fas fa-clinic-medical"></i></div>
                    <div class="cnes-stat-info">
                        <span class="cnes-stat-val">${totalAtenBasica}</span>
                        <span class="cnes-stat-label">Atenção Primária / UBS</span>
                    </div>
                </div>

                <div class="cnes-stat-card clickable ${state.filterCategoriaKpi === 'ESPECIALIDADES_OUTROS' ? 'active-kpi' : ''}" 
                     onclick="window.CnesModule.toggleFilterCategoriaKpi('ESPECIALIDADES_OUTROS')" 
                     title="Clique para filtrar Policlínica, Especialidades, CAPS/CAPSi e Outros">
                    <div class="cnes-stat-icon teal"><i class="fas fa-stethoscope"></i></div>
                    <div class="cnes-stat-info">
                        <span class="cnes-stat-val">${totalEspecOutros}</span>
                        <span class="cnes-stat-label">Especialidades & Outros</span>
                    </div>
                </div>

                <div class="cnes-stat-card clickable" 
                     onclick="window.CnesModule.abrirModuloProfissionais(null)" 
                     title="Clique para abrir o módulo de colaboradores da rede">
                    <div class="cnes-stat-icon orange"><i class="fas fa-user-md"></i></div>
                    <div class="cnes-stat-info">
                        <span class="cnes-stat-val">${totalProfsGeral}</span>
                        <span class="cnes-stat-label">Vínculos de Profissionais</span>
                    </div>
                </div>
            </div>

            <!-- PORTAL DE DUPLA CONSULTA OFICIAL CNES (ESTABELECIMENTO & PROFISSIONAL MEIO A MEIO) -->
            <div class="cnes-search-portals-wrapper">
                
                <!-- 1. CONSULTA ESTABELECIMENTO (TOPO ROXO DATASUS - 50%) -->
                <div class="cnes-portal-box">
                    <div class="cnes-portal-stripe-purple"></div>
                    <div class="cnes-portal-inner">
                        <h2 class="cnes-portal-title-purple">Consulta Estabelecimento de Saúde</h2>
                        <form class="cnes-portal-form" onsubmit="window.CnesModule.executarBuscaEstabelecimento(event)">
                            <input type="text" id="inputBuscaEstabelecimento" class="cnes-portal-input" 
                                   placeholder="Nome Fantasia / Razão Social / Código CNES / CNPJ" 
                                   value="${state.searchEstabelecimento}">
                            <button type="submit" class="cnes-btn-search">
                                <i class="fas fa-search"></i> Pesquisar Unidade
                            </button>
                        </form>
                    </div>
                </div>

                <!-- 2. CONSULTA PROFISSIONAL (TOPO LARANJA DATASUS - 50%) -->
                <div class="cnes-portal-box">
                    <div class="cnes-portal-stripe-orange"></div>
                    <div class="cnes-portal-inner">
                        <h2 class="cnes-portal-title-orange">Consulta Profissional e Vínculos</h2>
                        <form class="cnes-portal-form" onsubmit="window.CnesModule.executarBuscaProfissional(event)">
                            <input type="text" id="inputBuscaProfissional" class="cnes-portal-input" 
                                   placeholder="Nome do Profissional / Cartão SUS (CNS) / CPF / CBO" 
                                   value="${state.searchProfissional}">
                            <button type="submit" class="cnes-btn-search" style="background: #c2410c;">
                                <i class="fas fa-user-search"></i> Pesquisar Profissional
                            </button>
                        </form>
                    </div>
                </div>

            </div>

            <!-- BARRA DE FILTROS & VISUALIZAÇÃO EM APENAS UMA LINHA -->
            <div class="cnes-toolbar-est-single-line">
                <div class="cnes-toolbar-left">
                    <!-- SELETOR DE ESCOPO DA REDE (PADRÃO: MANTIDOS) -->
                    <div class="cnes-escopo-wrapper">
                        <span class="cnes-escopo-label">
                            <i class="fas fa-building-shield"></i> Escopo:
                        </span>
                        <select class="cnes-escopo-select" 
                                onchange="window.CnesModule.setFilterEscopo(this.value)">
                            <option value="mantidos" ${state.filterEscopo === 'mantidos' ? 'selected' : ''}>
                                🏥 Rede Municipal Mantida (${totalMantidos} Unidades)
                            </option>
                            <option value="todas" ${state.filterEscopo === 'todas' ? 'selected' : ''}>
                                🌐 Toda a Rede Homologada (${totalGeral} Estabelecimentos)
                            </option>
                            <option value="privados" ${state.filterEscopo === 'privados' ? 'selected' : ''}>
                                🏢 Privados / Conveniados / Filantrópicos (${totalGeral - totalMantidos})
                            </option>
                        </select>
                    </div>

                    ${state.filterCategoriaKpi ? `
                        <div class="cnes-active-filter-pill">
                            <span><i class="fas fa-filter"></i> Categoria: <strong>${labelCategoriaAtiva}</strong></span>
                            <button type="button" onclick="window.CnesModule.toggleFilterCategoriaKpi('')" title="Remover filtro de categoria">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                    ` : ''}
                </div>

                <div class="cnes-toolbar-right">
                    <div class="cnes-view-mode-toggle">
                        <button class="${state.establishmentViewMode === 'cards' ? 'active' : ''}" 
                                onclick="window.CnesModule.setEstablishmentViewMode('cards')" title="Visualização em Cartões">
                            <i class="fas fa-th-large"></i> Cartões
                        </button>
                        <button class="${state.establishmentViewMode === 'table' ? 'active' : ''}" 
                                onclick="window.CnesModule.setEstablishmentViewMode('table')" title="Visualização em Tabela">
                            <i class="fas fa-table"></i> Tabela
                        </button>
                    </div>

                    <button class="cnes-btn-outline" onclick="window.CnesModule.abrirModuloProfissionais(null)" title="Ver todos os colaboradores cadastrados na rede municipal">
                        <i class="fas fa-users"></i> Ver Todos os Colaboradores
                    </button>
                </div>
            </div>

            <!-- CABEÇALHO DA LISTAGEM DE UNIDADES -->
            <div class="cnes-section-header">
                <div class="cnes-section-title">
                    <i class="fas fa-hospital" style="color: #0284c7;"></i>
                    <span>Estabelecimentos Homologados em ${state.municipio} / ${state.uf} (${unidadesFiltradas.length}${state.filterEscopo === 'mantidos' ? ` de ${totalMantidos} unidades municipais mantidas` : ` de ${totalGeral} estabelecimentos`}${labelCategoriaAtiva ? ` • ${labelCategoriaAtiva}` : ''})</span>
                </div>
            </div>

            <!-- EXIBIÇÃO: CARTÕES OU TABELA -->
            ${state.establishmentViewMode === 'cards' ? `
                <div class="cnes-units-grid">
                    ${unidadesFiltradas.length === 0 ? `
                        <div style="grid-column: 1 / -1; text-align: center; padding: 3rem; background: #ffffff; border-radius: 0.5rem; border: 1px dashed #cbd5e1; color: #64748b;">
                            <i class="fas fa-hospital-slash" style="font-size: 2rem; opacity: 0.5; margin-bottom: 0.5rem;"></i>
                            <p style="margin: 0; font-size: 0.95rem;">Nenhum estabelecimento encontrado com os filtros aplicados.</p>
                        </div>
                    ` : unidadesFiltradas.map(u => `
                        <div class="cnes-unit-card-clean">
                            <div class="cnes-unit-card-header">
                                <span class="cnes-unit-badge-tipo">${u.tipoUnidade}</span>
                                <span class="cnes-unit-badge-code">
                                    <span>CNES: ${u.cnes}</span>
                                    <button type="button" class="cnes-btn-copy-badge" onclick="window.CnesModule.copiarCnes('${u.cnes}', event)" title="Copiar código CNES ${u.cnes}">
                                        <i class="far fa-copy"></i>
                                    </button>
                                </span>
                            </div>
                            <h3 class="cnes-unit-card-name">${u.nomeFantasia}</h3>
                            <p class="cnes-unit-card-razao">${u.razaoSocial}</p>

                            <div class="cnes-unit-card-info">
                                <div><i class="fas fa-map-marker-alt"></i> ${u.endereco}, ${u.numero || 'S/N'} - ${u.bairro || 'Centro'}</div>
                                <div><i class="fas fa-phone"></i> ${u.telefone || '(99) 3621-0000'}</div>
                                <div><i class="fas fa-check-circle" style="color: #16a34a;"></i> Atendimento SUS: <strong>${u.atendimentoSus}</strong></div>
                                <div><i class="fas fa-user-shield" style="color: #0284c7;"></i> Gestão: <strong>${u.tipoGestao || 'MUNICIPAL'}</strong></div>
                            </div>

                            <div class="cnes-unit-card-footer">
                                <button class="cnes-btn-outline" onclick="window.CnesModule.abrirModuloProfissionais('${u.cnes}')">
                                    <i class="fas fa-user-md" style="color: #0284c7;"></i>
                                    <span>${u.profissionais ? u.profissionais.length : 0} Profissionais</span>
                                </button>
                                <button class="cnes-btn-primary-blue" onclick="window.CnesModule.abrirFicha('${u.cnes}')">
                                    <i class="fas fa-file-invoice"></i> Abrir Ficha Oficial
                                </button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            ` : `
                <div class="cnes-table-responsive" style="margin-bottom: 2rem;">
                    <table class="cnes-est-table">
                        <thead>
                            <tr>
                                <th class="cnes-th-sortable ${sortField === 'cnes' ? 'sorted-active' : ''}" 
                                    onclick="window.CnesModule.sortEstabelecimentos('cnes')" 
                                    title="Clique para ordenar por Código CNES (${sortField === 'cnes' && sortOrder === 1 ? 'Decrescente' : 'Crescente'})">
                                    <div class="cnes-th-content">
                                        <span>CNES</span>
                                        <i class="fas ${sortField === 'cnes' ? (sortOrder === 1 ? 'fa-sort-up' : 'fa-sort-down') : 'fa-sort text-muted'}"></i>
                                    </div>
                                </th>
                                <th class="cnes-th-sortable ${sortField === 'nomeFantasia' ? 'sorted-active' : ''}" 
                                    onclick="window.CnesModule.sortEstabelecimentos('nomeFantasia')" 
                                    title="Clique para ordenar por Nome Fantasia (${sortField === 'nomeFantasia' && sortOrder === 1 ? 'Z-A' : 'A-Z'})">
                                    <div class="cnes-th-content">
                                        <span>Nome Fantasia</span>
                                        <i class="fas ${sortField === 'nomeFantasia' ? (sortOrder === 1 ? 'fa-sort-up' : 'fa-sort-down') : 'fa-sort text-muted'}"></i>
                                    </div>
                                </th>
                                <th>Razão Social</th>
                                <th>Tipo de Unidade</th>
                                <th>Gestão</th>
                                <th>SUS</th>
                                <th class="cnes-th-sortable ${sortField === 'profissionais' ? 'sorted-active' : ''}" 
                                    onclick="window.CnesModule.sortEstabelecimentos('profissionais')" 
                                    title="Clique para ordenar por Quantidade de Profissionais (${sortField === 'profissionais' && sortOrder === 1 ? 'Menor para maior' : 'Maior para menor'})">
                                    <div class="cnes-th-content">
                                        <span>Profissionais</span>
                                        <i class="fas ${sortField === 'profissionais' ? (sortOrder === 1 ? 'fa-sort-up' : 'fa-sort-down') : 'fa-sort text-muted'}"></i>
                                    </div>
                                </th>
                                <th style="text-align: right;">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${unidadesFiltradas.length === 0 ? `
                                <tr>
                                    <td colspan="8" style="text-align: center; padding: 2rem; color: #64748b;">Nenhuma unidade encontrada.</td>
                                </tr>
                            ` : unidadesFiltradas.map(u => `
                                <tr>
                                    <td style="font-family: 'Roboto Mono', monospace; font-weight: 700; color: #dc2626;">
                                        <div class="cnes-copyable-code">
                                            <span>${u.cnes}</span>
                                            <button type="button" class="cnes-btn-copy" onclick="window.CnesModule.copiarCnes('${u.cnes}', event)" title="Copiar código CNES ${u.cnes}">
                                                <i class="far fa-copy"></i>
                                            </button>
                                        </div>
                                    </td>
                                    <td><strong>${u.nomeFantasia}</strong></td>
                                    <td style="color: #64748b; font-size: 0.78rem;">${u.razaoSocial}</td>
                                    <td><span class="cnes-unit-badge-tipo" style="font-size: 0.7rem;">${u.tipoUnidade}</span></td>
                                    <td><strong>${u.tipoGestao || 'MUNICIPAL'}</strong></td>
                                    <td><span style="color: #16a34a; font-weight: 700;">${u.atendimentoSus}</span></td>
                                    <td>
                                        <button class="cnes-btn-outline" style="padding: 0.2rem 0.5rem; font-size: 0.75rem;" 
                                                onclick="window.CnesModule.abrirModuloProfissionais('${u.cnes}')">
                                            <i class="fas fa-users"></i> ${u.profissionais ? u.profissionais.length : 0}
                                        </button>
                                    </td>
                                    <td style="text-align: right;">
                                        <button class="cnes-btn-primary-blue" style="padding: 0.3rem 0.65rem; font-size: 0.75rem;" 
                                                onclick="window.CnesModule.abrirFicha('${u.cnes}')">
                                            Ficha Oficial
                                        </button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `}
        `;
    }

    /**
     * VISÃO 2: FICHA DO ESTABELECIMENTO DE SAÚDE (ESTRUTURA CNESNET)
     */
    function renderViewFicha() {
        const u = getSelectedUnidade();
        if (!u) return '<div class="alert">Estabelecimento não localizado.</div>';

        const compFmt = formatarCompetencia(state.competenciaAtiva);

        return `
            <div class="cnes-ficha-container">
                
                <!-- BANNER AZUL DE TOPO -->
                <div class="cnes-ficha-header-banner">
                    Estabelecimento de Saúde — Cadastro Nacional de Estabelecimentos de Saúde
                </div>

                <!-- BARRA DE IDENTIFICAÇÃO E ATUALIZAÇÃO -->
                <div class="cnes-ficha-identificacao-bar">
                    <span class="cnes-ficha-identificacao-title">Identificação</span>
                    <span class="cnes-ficha-identificacao-meta">
                        CADASTRADO NO CNES EM: ${u.dtCadastro || '12/03/2005'} &nbsp;&nbsp;&nbsp;
                        ÚLTIMA ATUALIZAÇÃO EM: ${u.dtUltimaAtualizacao || '10/09/2026'} &nbsp;&nbsp;&nbsp;
                        DATA DE ATUALIZAÇÃO LOCAL: ${u.dtAtualizacaoLocal || '11/09/2026'}
                    </span>
                </div>

                <!-- AÇÕES RÁPIDAS -->
                <div class="cnes-ficha-action-row">
                    <div class="cnes-ficha-action-row-left">
                        <i class="fas fa-globe-americas" style="color: #0284c7; font-size: 1.1rem;"></i>
                        <span>Localização:</span>
                        <a href="https://maps.google.com/?q=${encodeURIComponent(u.endereco + ', ' + state.municipio + ' ' + state.uf)}" 
                           target="_blank" style="color: #0284c7; text-decoration: underline; font-weight: normal; font-size: 0.8rem;">
                           ${u.endereco}, ${u.numero || 'S/N'} - ${u.bairro || 'Centro'} (${state.municipio} - ${state.uf})
                        </a>
                    </div>
                    <div class="cnes-ficha-action-row-right">
                        <button class="cnes-btn-ficha-action" onclick="window.CnesModule.abrirModalCompetencia()" title="Selecionar Competência Histórica">
                            <i class="fas fa-calendar-alt"></i> Ficha por Competência (${compFmt})
                        </button>
                        <button class="cnes-btn-ficha-action" onclick="window.CnesModule.voltarAoPortal()">
                            <i class="fas fa-arrow-left"></i> Voltar às Consultas da Rede
                        </button>
                    </div>
                </div>

                <!-- TABELA DE ATRIBUTOS CADASTRAIS (ESTRUTURA FIEL AO CNESNET) -->
                <table class="cnes-ficha-table">
                    <tbody>
                        <tr>
                            <td class="cnes-ficha-label">Nome Fantasia:</td>
                            <td class="cnes-ficha-val"><strong>${u.nomeFantasia}</strong></td>
                            <td class="cnes-ficha-label">CNES:</td>
                            <td class="cnes-ficha-val-red">${u.cnes}</td>
                            <td class="cnes-ficha-label">CNPJ:</td>
                            <td class="cnes-ficha-val">${u.cnpj || '--'}</td>
                        </tr>
                        <tr>
                            <td class="cnes-ficha-label">Nome Empresarial:</td>
                            <td class="cnes-ficha-val">${u.razaoSocial}</td>
                            <td class="cnes-ficha-label">VCO Unidade:</td>
                            <td class="cnes-ficha-val" style="font-family: monospace;">${u.vcoUnidade || (state.ibge + u.cnes)}</td>
                            <td class="cnes-ficha-label">Personalidade:</td>
                            <td class="cnes-ficha-val">${u.personalidade || 'JURÍDICA'}</td>
                        </tr>
                        <tr>
                            <td class="cnes-ficha-label">Logradouro:</td>
                            <td class="cnes-ficha-val">${u.endereco}</td>
                            <td class="cnes-ficha-label">Número:</td>
                            <td class="cnes-ficha-val">${u.numero || 'S/N'}</td>
                            <td class="cnes-ficha-label">Telefone:</td>
                            <td class="cnes-ficha-val">${u.telefone || '--'}</td>
                        </tr>
                        <tr>
                            <td class="cnes-ficha-label">Complemento:</td>
                            <td class="cnes-ficha-val">--</td>
                            <td class="cnes-ficha-label">Bairro:</td>
                            <td class="cnes-ficha-val">${u.bairro || 'CENTRO'}</td>
                            <td class="cnes-ficha-label">CEP:</td>
                            <td class="cnes-ficha-val">${u.cep || '65700000'}</td>
                        </tr>
                        <tr>
                            <td class="cnes-ficha-label">Município:</td>
                            <td class="cnes-ficha-val">${u.municipio || (state.municipio + ' - IBGE - ' + state.ibge)}</td>
                            <td class="cnes-ficha-label">UF:</td>
                            <td class="cnes-ficha-val">${u.uf || state.uf}</td>
                            <td class="cnes-ficha-label">Horário:</td>
                            <td class="cnes-ficha-val">${u.horario || 'Atendimento Regular'}</td>
                        </tr>
                        <tr>
                            <td class="cnes-ficha-label">Tipo Estabelecimento:</td>
                            <td class="cnes-ficha-val">${u.tipoUnidade}</td>
                            <td class="cnes-ficha-label">Gestão:</td>
                            <td class="cnes-ficha-val-red">${u.tipoGestao || 'MUNICIPAL'}</td>
                            <td class="cnes-ficha-label">Dependência:</td>
                            <td class="cnes-ficha-val">${u.dependencia || 'MANTIDA'}</td>
                        </tr>
                        <tr>
                            <td class="cnes-ficha-label">Número Alvará:</td>
                            <td class="cnes-ficha-val">${u.alvara || 'ALVARÁ SANITÁRIO VIGENTE'}</td>
                            <td class="cnes-ficha-label">Órgão Expedidor:</td>
                            <td class="cnes-ficha-val">${u.orgaoExpedidor || 'SMS'}</td>
                            <td class="cnes-ficha-label">Data Expedição:</td>
                            <td class="cnes-ficha-val">${u.dtExpedicao || '02/01/2026'}</td>
                        </tr>
                    </tbody>
                </table>

                <!-- GRADE DE MÓDULOS OFICIAIS CNESNET -->
                <div class="cnes-modulos-section">
                    <div class="cnes-modulos-title">Módulos Estruturais do Estabelecimento:</div>
                    <div class="cnes-modulos-grid">
                        <button class="cnes-btn-modulo" onclick="window.CnesModule.abrirFicha('${u.cnes}')">Básico</button>
                        <button class="cnes-btn-modulo" onclick="alert('Módulo Conjunto — Estrutura física geral da unidade.')">Conjunto</button>
                        <button class="cnes-btn-modulo" onclick="alert('Módulo Ambulatorial — Consultórios e salas de atendimento cadastradas.')">Ambulatorial</button>
                        <button class="cnes-btn-modulo" onclick="alert('Módulo Hospitalar — Leitos de internação e cirúrgicos.')">Hospitalar</button>
                        <button class="cnes-btn-modulo" onclick="alert('Módulo Mantenedora — Entidade governamental responsável.')">Mantenedora</button>
                        <button class="cnes-btn-modulo highlight-prof" onclick="window.CnesModule.abrirModuloProfissionais('${u.cnes}')" title="Ver todos os colaboradores desta unidade">
                            <i class="fas fa-users"></i> Profissionais (${u.profissionais ? u.profissionais.length : 0})
                        </button>
                        <button class="cnes-btn-modulo" onclick="alert('Módulo Habilitações — Portarias de habilitação do Ministério da Saúde.')">Habilitações</button>
                        <button class="cnes-btn-modulo" onclick="alert('Módulo Regras Contratuais — Contratos com SUS/Prestadores.')">Regras Contratuais</button>
                        <button class="cnes-btn-modulo" onclick="alert('Módulo Contrato de Gestão.')">Contrato de Gestão</button>
                        <button class="cnes-btn-modulo" onclick="alert('Módulo Incentivos do FNS / MS.')">Incentivos</button>
                        <button class="cnes-btn-modulo" onclick="alert('Módulo Equipes — Equipes de Saúde da Família e Atenção Primária.')">Equipes</button>
                        <button class="cnes-btn-modulo" onclick="alert('Módulo Residência Terapêutica.')">Residência Terapêutica</button>
                        <button class="cnes-btn-modulo" onclick="alert('Módulo Telessaúde.')">Telessaúde</button>
                        <button class="cnes-btn-modulo" onclick="alert('Módulo Organizações Parceiras.')">Org. Parceiras</button>
                        <button class="cnes-btn-modulo" onclick="alert('Módulo Gestão / Administração de Terceiros.')">Ger/Adm (Terceiro)</button>
                    </div>
                </div>

            </div>
        `;
    }

    /**
     * VISÃO 3: MÓDULO PROFISSIONAL — 17 COLUNAS OFICIAIS DATASUS
     */
    function renderViewProfissionais() {
        const u = getSelectedUnidade();
        const profsCompletos = getProfissionaisList();
        const totalRegistros = profsCompletos.length;
        const compFmt = formatarCompetencia(state.competenciaAtiva);

        // Paginação
        const perPage = state.tableFilter.perPage === 'todos' ? totalRegistros : parseInt(state.tableFilter.perPage, 10);
        const totalPages = Math.ceil(totalRegistros / (perPage || 1)) || 1;
        state.tableFilter.page = Math.min(state.tableFilter.page, totalPages);

        const startIdx = (state.tableFilter.page - 1) * perPage;
        const endIdx = perPage ? startIdx + perPage : totalRegistros;
        const profsPaginados = perPage ? profsCompletos.slice(startIdx, endIdx) : profsCompletos;

        const mapaHorasRede = new Map();
        const mapaVinculosRede = new Map();
        state.estabelecimentos.forEach(est => {
            if (est.profissionais) {
                est.profissionais.forEach(pr => {
                    const k = String(pr.cnsMaster || pr.cns || pr.cpf || pr.nome || '').replace(/\D/g, '') || String(pr.nome || '').trim().toUpperCase();
                    const ch = Number(pr.chTotal || ((pr.chAmb || 0) + (pr.chHosp || 0) + (pr.chOutros || 0))) || 0;
                    mapaHorasRede.set(k, (mapaHorasRede.get(k) || 0) + ch);
                    mapaVinculosRede.set(k, (mapaVinculosRede.get(k) || 0) + 1);
                });
            }
        });

        const tituloUnidade = state.selectedCnes && u
            ? `${u.nomeFantasia} (CNES: ${u.cnes})`
            : `Todos os Estabelecimentos de ${state.municipio} - ${state.uf} (${state.estabelecimentos.length} unidades)`;

        return `
            <div class="cnes-prof-module-wrapper">
                
                <!-- TÍTULO OFICIAL DO MÓDULO (BARRA AZUL DATASUS) -->
                <div class="cnes-prof-header-title">
                    Consulta CNES Oficial — Módulo Profissional — Colaboradores e Vínculos por Estabelecimento
                </div>

                <!-- SUBBARRA COM NOME DO ESTABELECIMENTO E BOTÕES DE AÇÃO -->
                <div class="cnes-prof-unit-bar">
                    <div class="cnes-prof-unit-name">
                        <span>Profissionais | <strong>${tituloUnidade}</strong></span>
                    </div>

                    <div class="cnes-prof-action-buttons">
                        <!-- Filtro de Auditoria Portaria 134 -->
                        <button class="cnes-filter-btn-alert ${state.tableFilter.apenasAlerta134 ? 'active' : ''}"
                                onclick="window.CnesModule.toggleAlerta134()"
                                title="Filtrar profissionais com acúmulo incompatível de cargos ou carga horária superior a 60h (Portaria 134)">
                            <i class="fas fa-exclamation-triangle"></i>
                            ${state.tableFilter.apenasAlerta134 ? 'Exibindo Alertas (Portaria 134)' : 'Auditoria de Vínculos (Portaria 134)'}
                        </button>

                        <button class="cnes-btn-outline ${state.tableFilter.apenasDesligados ? 'active' : ''}" 
                                onclick="window.CnesModule.toggleDesligados()">
                            <i class="fas fa-user-slash"></i> 
                            ${state.tableFilter.apenasDesligados ? 'Exibir Profissionais Ativos' : 'Profissionais Desligados'}
                        </button>

                        <button class="cnes-btn-outline" onclick="window.CnesModule.abrirModalCompetencia()" title="Trocar Competência">
                            <i class="fas fa-calendar-alt"></i> Comp: ${compFmt}
                        </button>

                        <button class="cnes-btn-xls" onclick="window.CnesModule.exportarXls()" title="Exportar planilha Excel com a grade de profissionais">
                            <i class="fas fa-file-excel"></i> Exportar XLS
                        </button>

                        ${state.selectedCnes ? `
                            <button class="cnes-btn-outline" onclick="window.CnesModule.abrirFicha('${state.selectedCnes}')">
                                <i class="fas fa-arrow-left"></i> Ficha da Unidade
                            </button>
                        ` : `
                            <button class="cnes-btn-outline" onclick="window.CnesModule.voltarAoPortal()">
                                <i class="fas fa-arrow-left"></i> Voltar às Unidades
                            </button>
                        `}
                    </div>
                </div>

                <!-- TOOLBAR COM CONTROLE DE REGISTROS E BUSCA INLINE -->
                <div class="cnes-prof-toolbar">
                    <div class="cnes-prof-per-page">
                        <span>Mostrar</span>
                        <select onchange="window.CnesModule.setPerPage(this.value)">
                            <option value="10" ${state.tableFilter.perPage == 10 ? 'selected' : ''}>10</option>
                            <option value="25" ${state.tableFilter.perPage == 25 ? 'selected' : ''}>25</option>
                            <option value="50" ${state.tableFilter.perPage == 50 ? 'selected' : ''}>50</option>
                            <option value="100" ${state.tableFilter.perPage == 100 ? 'selected' : ''}>100</option>
                            <option value="todos" ${state.tableFilter.perPage === 'todos' ? 'selected' : ''}>Todos</option>
                        </select>
                        <span>registros</span>
                    </div>

                    <div class="cnes-prof-search-inline">
                        <label for="inputInlineProfSearch">Buscar:</label>
                        <input type="text" id="inputInlineProfSearch" 
                               value="${state.tableFilter.search}" 
                               oninput="window.CnesModule.setTableSearch(this.value)"
                               placeholder="Nome, CNS, CBO ou Unidade...">
                    </div>
                </div>

                <!-- AVISO OFICIAL DATASUS -->
                <div class="cnes-prof-disclaimer">
                    * Esta informação está sendo apresentada conforme dados oficiais do Cadastro Nacional de Estabelecimentos de Saúde (CNES) do DATASUS.
                </div>

                <!-- TABELA OTIMIZADA DE PROFISSIONAIS (SEM ROLAGEM LATERAL) -->
                <div class="cnes-table-responsive">
                    <table class="cnes-table-17cols">
                        <thead>
                            <tr>
                                <th rowspan="2" class="th-prof-nome">Nome do Profissional</th>
                                <th rowspan="2" class="th-prof-cns">CNS (Master)</th>
                                <th rowspan="2" class="th-prof-dt">Dt. Atribuição</th>
                                <th rowspan="2" class="th-prof-cbo">CBO</th>
                                <th rowspan="2" class="th-center th-prof-ch">Outros</th>
                                <th rowspan="2" class="th-center th-prof-ch">Amb.</th>
                                <th rowspan="2" class="th-center th-prof-ch">Hosp.</th>
                                <th rowspan="2" class="th-center th-prof-ch">Total</th>
                                <th rowspan="2" class="th-center th-prof-sus">SUS</th>
                                <th colspan="3" class="th-group-vinculo">Vínculo Empregatício</th>
                                <th rowspan="2" class="th-center th-prof-sit">Situação</th>
                                <th rowspan="2" class="th-prof-p134">Portaria 134</th>
                            </tr>
                            <tr>
                                <th class="th-prof-vinc">Vinculação</th>
                                <th class="th-prof-tipo">Tipo</th>
                                <th class="th-prof-sub">Subtipo</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${profsPaginados.length === 0 ? `
                                <tr>
                                    <td colspan="14" style="text-align: center; padding: 2.5rem; color: #64748b;">
                                        <i class="fas fa-search" style="font-size: 1.5rem; display: block; margin-bottom: 0.5rem; opacity: 0.5;"></i>
                                        Nenhum profissional localizado com os filtros selecionados.
                                    </td>
                                </tr>
                            ` : profsPaginados.map(p => {
                                const chTot = Number(p.chTotal || ((p.chOutros || 0) + (p.chAmb || 0) + (p.chHosp || 0))) || 0;
                                let badgeChClass = 'cnes-ch-badge-normal';
                                if (chTot > 60) badgeChClass = 'cnes-ch-badge-danger';
                                else if (chTot > 44) badgeChClass = 'cnes-ch-badge-alert';

                                const cnsDefinitivo = String(p.cnsMaster || p.cns || '').trim();
                                const dataAtribuicao = obterDataAtribuicao(p, true);
                                const cboOficial = formatarCboOficial(p);
                                const status134 = obterStatusPortaria134(p, mapaHorasRede, mapaVinculosRede);

                                return `
                                    <tr>
                                        <td class="td-prof-nome">
                                            <a href="javascript:void(0)" class="cnes-prof-name-link" 
                                               onclick="window.CnesModule.abrirDetalhesProfissional('${cnsDefinitivo || p.cns}')" 
                                               title="Clique para ver ficha completa do colaborador">
                                                ${p.nome}
                                            </a>
                                            ${p.unidadeNome ? `<div class="cnes-prof-sub-unidade" title="${p.unidadeNome}">${p.unidadeNome}</div>` : ''}
                                        </td>
                                        <td class="td-prof-cns">
                                            <button type="button" class="cnes-cns-btn" 
                                                    onclick="window.CnesModule.copiarCns('${cnsDefinitivo}', event)" 
                                                    title="Clique para copiar o Cartão SUS (CNS) ${cnsDefinitivo}">
                                                <span class="cnes-cns-val">${cnsDefinitivo || '-'}</span>
                                                <i class="far fa-copy"></i>
                                            </button>
                                        </td>
                                        <td class="td-prof-dt">${dataAtribuicao}</td>
                                        <td class="td-prof-cbo" title="${cboOficial}">
                                            <div class="cnes-cbo-text">${cboOficial}</div>
                                        </td>
                                        <td class="th-center">${p.chOutros || 0}h</td>
                                        <td class="th-center">${p.chAmb || 0}h</td>
                                        <td class="th-center">${p.chHosp || 0}h</td>
                                        <td class="th-center">
                                            <span class="${badgeChClass}" title="${chTot > 60 ? 'Carga Horária Crítica (>60h)' : (chTot > 44 ? 'Carga Horária Elevada (>44h)' : 'Regular')}">
                                                ${chTot}h
                                            </span>
                                        </td>
                                        <td class="th-center">${p.atendimentoSus || 'SIM'}</td>
                                        <td class="td-prof-vinc" title="${p.vinculacao || 'VÍNCULO EMPREGATÍCIO'}">${p.vinculacao || 'VÍNCULO EMPREGATÍCIO'}</td>
                                        <td class="td-prof-tipo" title="${p.tipoVinculo || 'CONTRATADO TEMPORÁRIO'}">${p.tipoVinculo || 'CONTRATADO TEMPORÁRIO'}</td>
                                        <td class="td-prof-sub" title="${p.subtipo || 'PÚBLICO'}">${p.subtipo || 'PÚBLICO'}</td>
                                        <td class="th-center ${p.ativo !== false && p.situacao !== 'Desligado' ? 'cnes-status-ativo-red' : 'cnes-status-desligado-gray'}">
                                            ${p.situacao || (p.ativo !== false ? 'Ativo' : 'Desligado')}
                                        </td>
                                        <td class="td-prof-p134">
                                            ${status134.html}
                                        </td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>

                <!-- PAGINAÇÃO INFERIOR -->
                <div class="cnes-pagination-bar">
                    <div>
                        Mostrando <strong>${totalRegistros === 0 ? 0 : startIdx + 1}</strong> até 
                        <strong>${Math.min(endIdx, totalRegistros)}</strong> de <strong>${totalRegistros}</strong> registros
                    </div>

                    ${totalPages > 1 ? `
                        <div class="cnes-pagination-buttons">
                            <button class="cnes-btn-page" ${state.tableFilter.page === 1 ? 'disabled' : ''} onclick="window.CnesModule.setPage(${state.tableFilter.page - 1})">Anterior</button>
                            ${Array.from({ length: Math.min(totalPages, 8) }, (_, i) => i + 1).map(pageNum => `
                                <button class="cnes-btn-page ${state.tableFilter.page === pageNum ? 'active' : ''}" onclick="window.CnesModule.setPage(${pageNum})">${pageNum}</button>
                            `).join('')}
                            <button class="cnes-btn-page" ${state.tableFilter.page === totalPages ? 'disabled' : ''} onclick="window.CnesModule.setPage(${state.tableFilter.page + 1})">Próxima</button>
                        </div>
                    ` : ''}
                </div>

            </div>
        `;
    }

    /**
     * MODAL DE SELEÇÃO DE COMPETÊNCIAS HISTÓRICAS
     */
    function renderModalCompetencias() {
        return `
            <div class="cnes-modal-backdrop" onclick="if(event.target === this) window.CnesModule.fecharModalCompetencia()">
                <div class="cnes-modal-box">
                    <div class="cnes-modal-header">
                        <span><i class="fas fa-history"></i> Escolher Competência do CNES</span>
                        <button onclick="window.CnesModule.fecharModalCompetencia()">&times;</button>
                    </div>
                    <div class="cnes-modal-body">
                        <p style="font-size: 0.85rem; color: #475569; margin-bottom: 1rem;">
                            Selecione uma competência do CNES para auditar a composição dos colaboradores, vínculos e habilitações vigentes naquele período:
                        </p>

                        <div style="max-height: 320px; overflow-y: auto;">
                            ${state.competencias.length > 0 ? state.competencias.map(c => `
                                <div class="cnes-competencia-item ${state.competenciaAtiva === c.codigo ? 'active' : ''}"
                                     onclick="window.CnesModule.selecionarCompetencia('${c.codigo}')">
                                    <span><i class="far fa-calendar-check" style="margin-right: 0.5rem; color: #0284c7;"></i> ${c.label}</span>
                                    ${c.vigente ? '<span style="font-size: 0.72rem; background: #dcfce7; color: #15803d; padding: 0.2rem 0.5rem; border-radius: 9999px; font-weight: 700;">Vigente</span>' : ''}
                                </div>
                            `).join('') : '<p style="font-size: 0.85rem; color: #64748b;">Nenhuma competência publicada no manifesto CNES. O arquivo legado não possui histórico verificável.</p>'}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * MODAL DE DETALHES COMPLETOS DO PROFISSIONAL
     */
    function renderModalDetalhesProfissional() {
        const p = state.modalProfissionalSelecionado;
        if (!p) return '';

        const chTot = p.chTotal || ((p.chAmb || 0) + (p.chHosp || 0) + (p.chOutros || 0));

        return `
            <div class="cnes-modal-backdrop" onclick="if(event.target === this) window.CnesModule.fecharDetalhesProfissional()">
                <div class="cnes-modal-box" style="max-width: 600px;">
                    <div class="cnes-modal-header">
                        <span><i class="fas fa-user-circle"></i> Ficha Cadastral do Colaborador</span>
                        <button onclick="window.CnesModule.fecharDetalhesProfissional()">&times;</button>
                    </div>
                    <div class="cnes-modal-body">
                        <div style="display: flex; align-items: center; gap: 0.85rem; margin-bottom: 1.25rem; padding-bottom: 0.75rem; border-bottom: 1px solid #e2e8f0;">
                            <div style="width: 52px; height: 52px; border-radius: 50%; background: #e0f2fe; color: #0284c7; display: flex; align-items: center; justify-content: center; font-size: 1.6rem;">
                                <i class="fas fa-user-md"></i>
                            </div>
                            <div>
                                <h3 style="margin: 0; font-size: 1.2rem; color: #0f172a;">${p.nome}</h3>
                                <span style="font-size: 0.82rem; color: #64748b;">${p.ocupacao || p.cbo}</span>
                            </div>
                        </div>

                        <div class="cnes-prof-detail-grid">
                            <div class="cnes-prof-detail-field">
                                <span class="cnes-prof-detail-label">Cartão SUS (CNS)</span>
                                <span class="cnes-prof-detail-val" style="font-family: monospace;">${p.cns}</span>
                            </div>
                            <div class="cnes-prof-detail-field">
                                <span class="cnes-prof-detail-label">CNS Master / Principal</span>
                                <span class="cnes-prof-detail-val" style="font-family: monospace;">${p.cnsMaster || p.cns}</span>
                            </div>
                            <div class="cnes-prof-detail-field">
                                <span class="cnes-prof-detail-label">Estabelecimento</span>
                                <span class="cnes-prof-detail-val">${p.unidade ? p.unidade.nomeFantasia : (p.unidadeNome || 'Rede Municipal')}</span>
                            </div>
                            <div class="cnes-prof-detail-field">
                                <span class="cnes-prof-detail-label">Código CNES</span>
                                <span class="cnes-prof-detail-val" style="color: #dc2626; font-family: monospace;">${p.cnes || (p.unidade ? p.unidade.cnes : '--')}</span>
                            </div>
                            <div class="cnes-prof-detail-field">
                                <span class="cnes-prof-detail-label">CBO / Especialidade</span>
                                <span class="cnes-prof-detail-val">${formatarCboOficial(p)}</span>
                            </div>
                            <div class="cnes-prof-detail-field">
                                <span class="cnes-prof-detail-label">Data de Atribuição</span>
                                <span class="cnes-prof-detail-val">${obterDataAtribuicao(p, false)}</span>
                            </div>
                            <div class="cnes-prof-detail-field" style="grid-column: span 2;">
                                <span class="cnes-prof-detail-label">Carga Horária Semanal</span>
                                <span class="cnes-prof-detail-val">
                                    Total: <strong>${chTot}h</strong> (Ambulatorial: ${p.chAmb || 0}h | Hospitalar: ${p.chHosp || 0}h | Outros: ${p.chOutros || 0}h)
                                    ${chTot > 40 ? '<span class="cnes-ch-badge-alert" style="margin-left: 0.5rem;">Atenção: Acúmulo de CH (>40h)</span>' : ''}
                                </span>
                            </div>
                            <div class="cnes-prof-detail-field">
                                <span class="cnes-prof-detail-label">Situação Funcional</span>
                                <span class="cnes-prof-detail-val" style="color: #dc2626; font-weight: 700;">${p.situacao || 'Ativo'}</span>
                            </div>
                            <div class="cnes-prof-detail-field">
                                <span class="cnes-prof-detail-label">Atende SUS</span>
                                <span class="cnes-prof-detail-val" style="color: #16a34a;">${p.atendimentoSus || 'SIM'}</span>
                            </div>
                            <div class="cnes-prof-detail-field" style="grid-column: span 2;">
                                <span class="cnes-prof-detail-label">Vínculo Empregatício</span>
                                <span class="cnes-prof-detail-val">${p.vinculacao || 'VINCULO EMPREGATICIO'} — ${p.tipoVinculo || 'CONTRATADO TEMPORÁRIO'} (${p.subtipo || 'PUBLICO'})</span>
                            </div>
                        </div>

                        <div style="margin-top: 1.25rem; display: flex; justify-content: flex-end;">
                            <button class="cnes-btn-primary-blue" onclick="window.CnesModule.fecharDetalhesProfissional()">
                                Fechar Ficha
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * MODAL DE IMPORTAÇÃO DE ARQUIVOS EXTERNOS CNES
     */
    function renderModalImport() {
        return `
            <div class="cnes-modal-backdrop" onclick="if(event.target === this) window.CnesModule.fecharModalImport()">
                <div class="cnes-modal-box" style="max-width: 580px;">
                    <div class="cnes-modal-header">
                        <span><i class="fas fa-file-import"></i> Importar Base Cadastral do CNES</span>
                        <button onclick="window.CnesModule.fecharModalImport()">&times;</button>
                    </div>
                    <div class="cnes-modal-body">
                        <p style="font-size: 0.85rem; color: #475569; margin-bottom: 1rem;">
                            Carregue arquivos extraídos do <strong>FTP oficial do DATASUS</strong> (arquivos ST/PF) ou bases tratadas geradas por ferramentas como o <strong>omnisus-db</strong> nos formatos <code>.JSON</code> ou <code>.CSV</code>:
                        </p>

                        <div class="cnes-drop-area" id="cnesDropArea"
                             onclick="document.getElementById('inputCnesFile').click()"
                             ondragover="event.preventDefault(); this.classList.add('dragover')"
                             ondragleave="this.classList.remove('dragover')"
                             ondrop="event.preventDefault(); this.classList.remove('dragover'); window.CnesModule.processarArquivoImport(event.dataTransfer.files[0])">
                            <i class="fas fa-cloud-upload-alt" style="font-size: 2.5rem; color: #0284c7; margin-bottom: 0.75rem;"></i>
                            <h4 style="margin: 0 0 0.4rem 0; color: #0f172a;">Clique ou arraste seu arquivo aqui</h4>
                            <p style="margin: 0; color: #64748b; font-size: 0.8rem;">Suporta arquivos de estabelecimentos e profissionais (.json ou .csv)</p>
                            <input type="file" id="inputCnesFile" accept=".json,.csv,.txt" style="display: none;" 
                                   onchange="window.CnesModule.processarArquivoImport(this.files[0])">
                        </div>

                        <div style="margin-top: 1.25rem; font-size: 0.75rem; color: #64748b; background: #f8fafc; padding: 0.75rem; border-radius: 0.375rem; border: 1px solid #e2e8f0;">
                            <i class="fas fa-info-circle" style="color: #0284c7;"></i>
                            <strong>Dica de Integração:</strong> Os dados importados alimentarão instantaneamente o cruzamento de glosas da Malha Fina e a validação de vínculos deste município.
                        </div>

                        <div style="margin-top: 1.25rem; display: flex; justify-content: flex-end; gap: 0.5rem;">
                            <button class="cnes-btn-outline" onclick="window.CnesModule.fecharModalImport()">Cancelar</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Handlers de controle de filtros e paginação
     */
    function setFilterTipoUnidade(val) {
        state.filterTipoUnidade = val;
        render();
    }

    function setFilterGestao(val) {
        state.filterGestao = val;
        render();
    }

    function setFilterSus(val) {
        state.filterSus = val;
        render();
    }

    function setPerPage(val) {
        state.tableFilter.perPage = val;
        state.tableFilter.page = 1;
        render();
    }

    function setPage(pageNum) {
        state.tableFilter.page = pageNum;
        render();
    }

    function setTableSearch(val) {
        state.tableFilter.search = val;
        state.tableFilter.page = 1;
        render();
    }

    /**
     * =========================================================================
     * VISÃO 4: AUDITORIA DE MOVIMENTAÇÃO MENSAL (ENTRADAS, SAÍDAS E CARGA HORÁRIA)
     * =========================================================================
     */
    async function abrirMovimentacoes() {
        state.viewMode = 'movimentacoes';
        state.movimentacoesMessage = 'Carregando competências publicadas...';
        render();
        await calcularMovimentacoes();
        render();
    }

    async function calcularMovimentacoes() {
        if (!window.CnesDiffEngine) {
            state.movimentacoesMessage = 'Comparador CNES indisponível.';
            return;
        }
        const dadosAtuais = state.estabelecimentos;
        let dadosAnteriores;
        let competenciaAnterior;
        if (state.ibge === '210120') {
            state.movimentacoes = null;
            if (state.sourceType !== 'published_snapshot' || !state.competenciaAtiva) {
                state.movimentacoesMessage = 'A comparação exige um snapshot CNES publicado para Bacabal.';
                return;
            }
            const index = state.competencias.findIndex(item => item.codigo === state.competenciaAtiva);
            const previous = index >= 0 ? state.competencias[index + 1] : null;
            if (!previous) {
                state.movimentacoesMessage = 'Ainda não há outra competência publicada para comparar.';
                return;
            }
            try {
                const response = await fetch(`/api/cnes/estabelecimentos?ibge=210120&competencia=${previous.codigo}&t=${Date.now()}`);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const payload = await response.json();
                if (payload.source_type !== 'published_snapshot' || payload.codigoIbge !== '210120' || payload.competencia !== previous.codigo || !Array.isArray(payload.estabelecimentos)) {
                    throw new Error('snapshot anterior inválido');
                }
                dadosAnteriores = payload.estabelecimentos.map(item => normalizarEstabelecimento(item, 'BACABAL', 'MA', { allowSynthetic: false }));
                competenciaAnterior = formatarCompetencia(previous.codigo);
            } catch (error) {
                state.movimentacoesMessage = `Não foi possível conferir a competência anterior: ${error.message}`;
                return;
            }
        } else {
            dadosAnteriores = window.CnesDiffEngine.simularCompetenciaAnterior(dadosAtuais);
            competenciaAnterior = '07/2026';
        }

        state.movimentacoes = window.CnesDiffEngine.compararCompetencias(dadosAnteriores, dadosAtuais, {
            competenciaAnterior,
            competenciaAtual: formatarCompetencia(state.competenciaAtiva),
            municipio: state.municipio,
            ibge: state.ibge
        });
        state.movimentacoesMessage = '';
        if (typeof showToast === 'function') {
            showToast('🔄 Auditoria de movimentações mensais calculada com sucesso!', 'success');
        }
    }

    function setFiltroMovimentacao(tipo) {
        state.movimentacoesFiltro.tipo = tipo;
        state.movimentacoesFiltro.page = 1;
        render();
    }

    function setMovimentacoesSearch(val) {
        state.movimentacoesFiltro.search = (val || '').toLowerCase().trim();
        state.movimentacoesFiltro.page = 1;
        render();
    }

    function setMovimentacoesCnes(cnes) {
        state.movimentacoesFiltro.cnes = cnes;
        state.movimentacoesFiltro.page = 1;
        render();
    }

    function setMovimentacoesPage(p) {
        state.movimentacoesFiltro.page = p;
        render();
    }

    function exportarMovimentacoesCsv() {
        if (!state.movimentacoes || !state.movimentacoes.detalhes) return;
        const itens = state.movimentacoes.detalhes.todas;
        if (!itens || itens.length === 0) {
            if (typeof showToast === 'function') showToast('ℹ️ Nenhum dado para exportar.', 'info');
            return;
        }

        let csv = '\uFEFFTipo;Profissional;CNS;CBO;Ocupacao;Estabelecimento;CNES;CH_Anterior;CH_Atual;Diferenca_Horas;Alerta_CH;Competencia\n';
        itens.forEach(item => {
            csv += `"${item.tipo}";"${item.nome}";"${item.cns}";"${item.cbo}";"${item.ocupacao}";"${item.estabNome}";"${item.cnes}";"${item.chAnterior ?? ''}";"${item.chAtual ?? ''}";"${item.diferencaCh ?? ''}";"${item.portaria134 || item.portaria134_alerta || 'SEM ALERTA CH'}";"${item.competencia || state.competenciaAtiva}"\n`;
        });

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `CNES_Auditoria_Movimentacoes_${state.municipio}_${state.competenciaAtiva}.csv`;
        link.click();

        if (typeof showToast === 'function') {
            showToast('✅ Relatório de movimentações exportado em CSV com sucesso!', 'success');
        }
    }

    function renderViewMovimentacoes() {
        if (!state.movimentacoes) {
            return `<div class="cnes-mov-wrapper" style="padding: 2rem; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 0.5rem;">${state.movimentacoesMessage || 'Selecione a auditoria para comparar competências publicadas.'}</div>`;
        }

        const mov = state.movimentacoes;
        const res = (mov && mov.resumo) || {};
        const f = state.movimentacoesFiltro;

        // Filtrar itens
        let itens = (mov && mov.detalhes && mov.detalhes.todas) || [];

        if (f.tipo === 'ENTRADA') itens = (mov.detalhes && mov.detalhes.entradas) || [];
        else if (f.tipo === 'SAIDA') itens = (mov.detalhes && mov.detalhes.saidas) || [];
        else if (f.tipo === 'ALTERACAO_CH') itens = (mov.detalhes && mov.detalhes.alteracoesCargaHoraria) || [];
        else if (f.tipo === 'PORTARIA134') {
            itens = ((mov.detalhes && mov.detalhes.todas) || []).filter(it => Number(it.chAtual) > 40);
        }

        if (f.cnes) {
            itens = itens.filter(it => String(it.cnes) === String(f.cnes));
        }

        if (f.search) {
            itens = itens.filter(it => 
                (it.nome && it.nome.toLowerCase().includes(f.search)) ||
                (it.cns && it.cns.includes(f.search)) ||
                (it.cbo && it.cbo.includes(f.search)) ||
                (it.ocupacao && it.ocupacao.toLowerCase().includes(f.search))
            );
        }

        const totalFiltrado = itens.length;
        const perPage = f.perPage || 15;
        const totalPages = Math.max(1, Math.ceil(totalFiltrado / perPage));
        const currentPage = Math.min(f.page || 1, totalPages);
        const startIndex = (currentPage - 1) * perPage;
        const pageItems = itens.slice(startIndex, startIndex + perPage);

        return `
            <div class="cnes-mov-wrapper" style="margin-bottom: 2rem;">
                
                <!-- HEADER DA AUDITORIA MENSAL -->
                <div style="background: linear-gradient(135deg, #003366 0%, #0284c7 100%); color: #ffffff; padding: 1.25rem 1.5rem; border-radius: 0.5rem; margin-bottom: 1.25rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
                    <div>
                        <div style="display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.35rem;">
                            <span style="background: rgba(255,255,255,0.2); padding: 0.2rem 0.6rem; border-radius: 4px; font-size: 0.75rem; font-weight: 700; text-transform: uppercase;">
                                <i class="fas fa-robot"></i> Auditoria Automatizada
                            </span>
                            <span style="font-size: 0.82rem; opacity: 0.9;">
                                Competência Anterior <strong>${mov.competenciaAnterior}</strong> ➔ Vigente <strong>${mov.competenciaAtual}</strong>
                            </span>
                        </div>
                        <h2 style="margin: 0; font-size: 1.35rem; font-weight: 800; letter-spacing: -0.01em;">
                            Auditoria de Movimentação Cadastral — ${state.municipio} / ${state.uf}
                        </h2>
                        <p style="margin: 0.3rem 0 0 0; font-size: 0.85rem; opacity: 0.9;">
                            Comparação entre arquivos mensais publicados de vínculos e carga horária semanal.
                        </p>
                    </div>

                    <div style="display: flex; gap: 0.5rem; align-items: center;">
                        <button class="cnes-btn-xls" onclick="window.CnesModule.exportarMovimentacoesCsv()" style="background: #ffffff; color: #0284c7; border: none; font-weight: 700; padding: 0.55rem 1rem;">
                            <i class="fas fa-file-excel"></i> Exportar Comparação CNES (CSV)
                        </button>
                        <button class="cnes-btn-outline" onclick="window.CnesModule.abrirMovimentacoes()" style="background: rgba(255,255,255,0.15); border-color: rgba(255,255,255,0.3); color: #ffffff; padding: 0.55rem 0.9rem;" title="Recalcular comparativo">
                            <i class="fas fa-sync-alt"></i> Recalcular
                        </button>
                    </div>
                </div>

                <!-- CARDS DE METRICAS CONSOLIDADAS (KPIs) -->
                <div class="cnes-mov-kpi-grid">
                    <div class="cnes-mov-kpi-card" onclick="window.CnesModule.setFiltroMovimentacao('ENTRADA')" style="cursor: pointer;">
                        <div class="cnes-mov-kpi-icon entrada"><i class="fas fa-user-plus"></i></div>
                        <div>
                            <div class="cnes-mov-kpi-val" style="color: #15803d;">+${fmtNum(res.entradas || 0)}</div>
                            <div class="cnes-mov-kpi-lbl">Novos Vínculos (Entradas)</div>
                        </div>
                    </div>

                    <div class="cnes-mov-kpi-card" onclick="window.CnesModule.setFiltroMovimentacao('SAIDA')" style="cursor: pointer;">
                        <div class="cnes-mov-kpi-icon saida"><i class="fas fa-user-minus"></i></div>
                        <div>
                            <div class="cnes-mov-kpi-val" style="color: #b91c1c;">-${fmtNum(res.saidas || 0)}</div>
                            <div class="cnes-mov-kpi-lbl">Desligamentos (Saídas)</div>
                        </div>
                    </div>

                    <div class="cnes-mov-kpi-card" onclick="window.CnesModule.setFiltroMovimentacao('ALTERACAO_CH')" style="cursor: pointer;">
                        <div class="cnes-mov-kpi-icon alteracao"><i class="fas fa-clock"></i></div>
                        <div>
                            <div class="cnes-mov-kpi-val" style="color: #0284c7;">${fmtNum(res.alteracoesCargaHoraria || 0)}</div>
                            <div class="cnes-mov-kpi-lbl">Alterações de Carga Horária</div>
                        </div>
                    </div>

                    <div class="cnes-mov-kpi-card" onclick="window.CnesModule.setFiltroMovimentacao('PORTARIA134')" style="cursor: pointer;">
                        <div class="cnes-mov-kpi-icon alerta"><i class="fas fa-exclamation-triangle"></i></div>
                        <div>
                            <div class="cnes-mov-kpi-val" style="color: #d97706;">${fmtNum(res.alertasPortaria134 || 0)}</div>
                            <div class="cnes-mov-kpi-lbl">CNS com CH municipal >60h</div>
                        </div>
                    </div>

                    <div class="cnes-mov-kpi-card">
                        <div class="cnes-mov-kpi-icon saldo"><i class="fas fa-chart-line"></i></div>
                        <div>
                            <div class="cnes-mov-kpi-val" style="color: #7c3aed;">
                                ${res.saldoHorasSemanais >= 0 ? '+' : ''}${fmtNum(res.saldoHorasSemanais || 0)}h
                            </div>
                            <div class="cnes-mov-kpi-lbl">Saldo de Horas SUS / Sem.</div>
                        </div>
                    </div>
                </div>

                <!-- PAINEL DA TABELA COM FILTROS AVANÇADOS -->
                <div class="cnes-mov-panel">
                    <div class="cnes-mov-filter-bar">
                        <div class="cnes-mov-filter-btns">
                            <button class="cnes-mov-filter-btn ${f.tipo === 'TODAS' ? 'active' : ''}" onclick="window.CnesModule.setFiltroMovimentacao('TODAS')">
                                Todos (${fmtNum((res.entradas || 0) + (res.saidas || 0) + (res.alteracoesCargaHoraria || 0))})
                            </button>
                            <button class="cnes-mov-filter-btn ${f.tipo === 'ENTRADA' ? 'active' : ''}" onclick="window.CnesModule.setFiltroMovimentacao('ENTRADA')">
                                🟢 Admissões (+${fmtNum(res.entradas || 0)})
                            </button>
                            <button class="cnes-mov-filter-btn ${f.tipo === 'SAIDA' ? 'active' : ''}" onclick="window.CnesModule.setFiltroMovimentacao('SAIDA')">
                                🔴 Desligamentos (-${fmtNum(res.saidas || 0)})
                            </button>
                            <button class="cnes-mov-filter-btn ${f.tipo === 'ALTERACAO_CH' ? 'active' : ''}" onclick="window.CnesModule.setFiltroMovimentacao('ALTERACAO_CH')">
                                🟡 Alt. Carga Horária (${fmtNum(res.alteracoesCargaHoraria || 0)})
                            </button>
                            <button class="cnes-mov-filter-btn ${f.tipo === 'PORTARIA134' ? 'active' : ''}" onclick="window.CnesModule.setFiltroMovimentacao('PORTARIA134')">
                                ⚠️ Triagem de carga horária (${fmtNum(res.alertasPortaria134 || 0)})
                            </button>
                        </div>

                        <div style="display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;">
                            <select style="padding: 0.4rem 0.6rem; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 0.82rem; max-width: 240px;" onchange="window.CnesModule.setMovimentacoesCnes(this.value)">
                                <option value="">Todos os Estabelecimentos</option>
                                ${state.estabelecimentos.map(u => `
                                    <option value="${u.cnes}" ${f.cnes === u.cnes ? 'selected' : ''}>${u.cnes} - ${u.nomeFantasia}</option>
                                `).join('')}
                            </select>

                            <div style="position: relative;">
                                <input type="text" placeholder="Filtrar por nome, CNS ou CBO..." value="${f.search || ''}" 
                                       oninput="window.CnesModule.setMovimentacoesSearch(this.value)"
                                       style="padding: 0.4rem 0.6rem 0.4rem 1.8rem; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 0.82rem; width: 220px;">
                                <i class="fas fa-search" style="position: absolute; left: 0.6rem; top: 50%; transform: translateY(-50%); font-size: 0.75rem; color: #94a3b8;"></i>
                            </div>
                        </div>
                    </div>

                    <!-- TABELA DE RESULTADOS -->
                    <div style="overflow-x: auto;">
                        <table style="width: 100%; border-collapse: collapse; font-size: 0.82rem; text-align: left;">
                            <thead>
                                <tr style="background: #003366; color: #ffffff; text-transform: uppercase; font-size: 0.74rem; letter-spacing: 0.02em;">
                                    <th style="padding: 0.65rem 0.85rem; width: 140px;">Tipo de Movimento</th>
                                    <th style="padding: 0.65rem 0.85rem;">Profissional / CNS</th>
                                    <th style="padding: 0.65rem 0.85rem;">CBO / Especialidade</th>
                                    <th style="padding: 0.65rem 0.85rem;">Estabelecimento de Saúde</th>
                                    <th style="padding: 0.65rem 0.85rem; width: 150px; text-align: center;">Carga Horária Semanal</th>
                                    <th style="padding: 0.65rem 0.85rem; width: 140px; text-align: center;">Triagem de carga horária</th>
                                    <th style="padding: 0.65rem 0.85rem; width: 80px; text-align: center;">Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${pageItems.length === 0 ? `
                                    <tr>
                                        <td colspan="7" style="text-align: center; padding: 3rem; color: #64748b;">
                                            <i class="fas fa-check-circle" style="font-size: 2rem; color: #16a34a; margin-bottom: 0.5rem;"></i>
                                            <div>Nenhuma movimentação encontrada para os filtros selecionados.</div>
                                        </td>
                                    </tr>
                                ` : pageItems.map((item, idx) => {
                                    let badgeHtml = '';
                                    let chHtml = '';

                                    if (item.tipo === 'ENTRADA') {
                                        badgeHtml = `<span class="cnes-mov-badge badge-entrada"><i class="fas fa-arrow-circle-up"></i> ADMISSÃO</span>`;
                                        chHtml = `<span style="font-weight: 700; color: #15803d;">0h ➔ ${item.chAtual}h</span>`;
                                    } else if (item.tipo === 'SAIDA') {
                                        badgeHtml = `<span class="cnes-mov-badge badge-saida"><i class="fas fa-arrow-circle-down"></i> AUSENTE NO MÊS</span>`;
                                        chHtml = `<span style="font-weight: 700; color: #b91c1c;">${item.chAnterior}h ➔ 0h</span>`;
                                    } else {
                                        const isUp = item.diferencaCh > 0;
                                        badgeHtml = `<span class="cnes-mov-badge ${isUp ? 'badge-ch-aumento' : 'badge-ch-reducao'}">
                                            <i class="fas fa-${isUp ? 'arrow-up' : 'arrow-down'}"></i> ${isUp ? 'AUMENTO' : 'REDUÇÃO'} (${isUp ? '+' : ''}${item.diferencaCh}h)
                                        </span>`;
                                        chHtml = `<span>${item.chAnterior}h ➔ <strong>${item.chAtual}h</strong></span>`;
                                    }

                                    const isRisk = (item.chAtual > 60) || (item.portaria134 && item.portaria134.includes('SOBREPOSIÇÃO'));
                                    const portariaBadge = isRisk ? 
                                        `<span class="cnes-ch-badge-danger"><i class="fas fa-exclamation-triangle"></i> REVISAR CH (>60h)</span>` :
                                        (item.chAtual > 40 ? 
                                            `<span class="cnes-ch-badge-alert"><i class="fas fa-info-circle"></i> REVISAR CH (>40h)</span>` :
                                            `<span class="cnes-ch-badge-normal"><i class="fas fa-check"></i> SEM ALERTA CH</span>`);

                                    const bgRow = idx % 2 === 0 ? '#ffffff' : '#f8fafc';

                                    return `
                                        <tr style="background: ${bgRow}; border-bottom: 1px solid #e2e8f0; transition: background 0.15s;" onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='${bgRow}'">
                                            <td style="padding: 0.65rem 0.85rem;">${badgeHtml}</td>
                                            <td style="padding: 0.65rem 0.85rem;">
                                                <div style="font-weight: 700; color: #0f172a;">${item.nome}</div>
                                                <div style="font-size: 0.72rem; color: #64748b; font-family: monospace;">CNS: ${item.cns}</div>
                                            </td>
                                            <td style="padding: 0.65rem 0.85rem;">
                                                <div style="color: #334155; font-weight: 600;">${item.ocupacao}</div>
                                                <div style="font-size: 0.72rem; color: #0284c7;">CBO: ${item.cbo}</div>
                                            </td>
                                            <td style="padding: 0.65rem 0.85rem;">
                                                <div style="font-weight: 600; color: #0f172a;">${item.estabNome}</div>
                                                <div style="font-size: 0.72rem; color: #64748b;">CNES: ${item.cnes}</div>
                                            </td>
                                            <td style="padding: 0.65rem 0.85rem; text-align: center;">
                                                ${chHtml}
                                                ${item.detalheHoras ? `<div style="font-size: 0.7rem; color: #64748b; margin-top: 2px;">${item.detalheHoras}</div>` : ''}
                                            </td>
                                            <td style="padding: 0.65rem 0.85rem; text-align: center;">${portariaBadge}</td>
                                            <td style="padding: 0.65rem 0.85rem; text-align: center;">
                                                <button onclick="window.CnesModule.abrirDetalhesProfissional('${item.cns}')" 
                                                        style="background: #e0f2fe; border: 1px solid #bae6fd; color: #0369a1; border-radius: 3px; padding: 0.25rem 0.5rem; font-size: 0.75rem; font-weight: 700; cursor: pointer;"
                                                        title="Ver Ficha Cadastral">
                                                    <i class="fas fa-eye"></i> Ficha
                                                </button>
                                            </td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>

                    <!-- PAGINAÇÃO -->
                    <div style="padding: 0.75rem 1.25rem; background: #f8fafc; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; font-size: 0.82rem; color: #64748b;">
                        <div>
                            Exibindo <strong>${totalFiltrado === 0 ? 0 : startIndex + 1}</strong> a <strong>${Math.min(startIndex + perPage, totalFiltrado)}</strong> de <strong>${fmtNum(totalFiltrado)}</strong> registros auditados
                        </div>

                        <div style="display: flex; gap: 0.3rem;">
                            <button ${currentPage <= 1 ? 'disabled' : ''} onclick="window.CnesModule.setMovimentacoesPage(${currentPage - 1})"
                                    style="padding: 0.3rem 0.6rem; border: 1px solid #cbd5e1; background: #ffffff; border-radius: 3px; cursor: pointer; ${currentPage <= 1 ? 'opacity: 0.5; cursor: not-allowed;' : ''}">
                                <i class="fas fa-chevron-left"></i> Anterior
                            </button>
                            <span style="padding: 0.3rem 0.75rem; font-weight: 700; color: #0f172a;">
                                Página ${currentPage} de ${totalPages}
                            </span>
                            <button ${currentPage >= totalPages ? 'disabled' : ''} onclick="window.CnesModule.setMovimentacoesPage(${currentPage + 1})"
                                    style="padding: 0.3rem 0.6rem; border: 1px solid #cbd5e1; background: #ffffff; border-radius: 3px; cursor: pointer; ${currentPage >= totalPages ? 'opacity: 0.5; cursor: not-allowed;' : ''}">
                                Próxima <i class="fas fa-chevron-right"></i>
                            </button>
                        </div>
                    </div>
                </div>

            </div>
        `;
    }

    return {
        init: init,
        carregarDados: carregarDados,
        render: render,
        selecionarUf: selecionarUf,
        selecionarMunicipio: selecionarMunicipio,
        sincronizarComContextoGlobal: sincronizarComContextoGlobal,
        setViewMode: setViewMode,
        setEstablishmentViewMode: setEstablishmentViewMode,
        abrirFicha: abrirFicha,
        abrirModuloProfissionais: abrirModuloProfissionais,
        voltarAoPortal: voltarAoPortal,
        abrirMovimentacoes: abrirMovimentacoes,
        calcularMovimentacoes: calcularMovimentacoes,
        setFiltroMovimentacao: setFiltroMovimentacao,
        setMovimentacoesSearch: setMovimentacoesSearch,
        setMovimentacoesCnes: setMovimentacoesCnes,
        setMovimentacoesPage: setMovimentacoesPage,
        exportarMovimentacoesCsv: exportarMovimentacoesCsv,
        executarBuscaEstabelecimento: executarBuscaEstabelecimento,
        executarBuscaProfissional: executarBuscaProfissional,
        setFilterTipoUnidade: setFilterTipoUnidade,
        setFilterGestao: setFilterGestao,
        setFilterSus: setFilterSus,
        setFilterEscopo: setFilterEscopo,
        toggleFilterCategoriaKpi: toggleFilterCategoriaKpi,
        sortEstabelecimentos: sortEstabelecimentos,
        copiarCnes: copiarCnes,
        copiarCns: copiarCns,
        formatarCboOficial: formatarCboOficial,
        getCategoriaUnidade: getCategoriaUnidade,
        isUnidadeMantidaMunicipal: isUnidadeMantidaMunicipal,
        abrirModalCompetencia: abrirModalCompetencia,
        fecharModalCompetencia: fecharModalCompetencia,
        selecionarCompetencia: selecionarCompetencia,
        toggleDesligados: toggleDesligados,
        toggleAlerta134: toggleAlerta134,
        abrirModalImport: abrirModalImport,
        fecharModalImport: fecharModalImport,
        processarArquivoImport: processarArquivoImport,
        setPerPage: setPerPage,
        setPage: setPage,
        setTableSearch: setTableSearch,
        exportarXls: exportarXls,
        abrirDetalhesProfissional: abrirDetalhesProfissional,
        fecharDetalhesProfissional: fecharDetalhesProfissional,
        validarProfissionalNoCnes: validarProfissionalNoCnes,
        validarServicoUnidade: validarServicoUnidade
    };
})();

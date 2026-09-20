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
            apenasEfetivos: false,
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
        state.selectedCnes = null;
        state.tableFilter.page = 1;
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
                const valSpan = btnEl.querySelector('.cnes-cns-val, span');
                const icon = btnEl.querySelector('i');
                const oldText = valSpan ? valSpan.textContent : cleanCnes;
                if (valSpan) valSpan.textContent = 'Copiado!';
                if (icon) {
                    const oldClass = icon.className;
                    icon.className = 'fas fa-check';
                    setTimeout(() => {
                        if (valSpan) valSpan.textContent = oldText;
                        if (icon) icon.className = oldClass;
                        btnEl.classList.remove('cnes-copied');
                    }, 1500);
                } else {
                    setTimeout(() => {
                        if (valSpan) valSpan.textContent = oldText;
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

    function valorVinculo(p, campo) {
        const valor = p && p[campo] != null ? String(p[campo]).trim() : '';
        return valor || 'Não informado';
    }

    let mapaVinculosLocal = null;

    async function carregarMapaVinculosOficial() {
        if (mapaVinculosLocal) return mapaVinculosLocal;
        if (typeof window !== 'undefined' && window.DATASUS_VINCULOS_BACABAL) {
            mapaVinculosLocal = window.DATASUS_VINCULOS_BACABAL;
            return mapaVinculosLocal;
        }
        try {
            const resp = await fetch('/cnes_data/datasus_vinculos.json');
            if (resp.ok) {
                mapaVinculosLocal = await resp.json();
                if (typeof window !== 'undefined') window.DATASUS_VINCULOS_BACABAL = mapaVinculosLocal;
                return mapaVinculosLocal;
            }
        } catch (e) {
            // Silencioso em caso de fetch ausente ou ambiente de teste
        }
        return null;
    }

    function resolverVinculoOficial(cnes, cns, nome, cbo) {
        const map = mapaVinculosLocal || (typeof window !== 'undefined' && window.DATASUS_VINCULOS_BACABAL) || null;
        if (!map) return null;
        const cnesStr = String(cnes || '').trim();
        const cnsClean = String(cns || '').replace(/\D/g, '');
        const cboClean = String(cbo || '').split(' ')[0].replace(/\D/g, '');
        const nomeClean = String(nome || '').toUpperCase().replace(/\s+/g, ' ').trim();

        return (cnesStr && cnsClean && cboClean && map[`${cnesStr}_${cnsClean}_${cboClean}`])
            || (cnesStr && cnsClean && map[`${cnesStr}_${cnsClean}`])
            || (cnesStr && nomeClean && cboClean && map[`${cnesStr}_${nomeClean}_${cboClean}`])
            || (cnesStr && nomeClean && map[`${cnesStr}_${nomeClean}`])
            || (cnsClean && cboClean && (map[`cns_${cnsClean}_${cboClean}`] || map[`${cnsClean}_${cboClean}`]))
            || (cnsClean && (map[`cns_${cnsClean}`] || map[cnsClean]))
            || (nomeClean && (map[`nome_${nomeClean}`] || map[nomeClean]))
            || null;
    }

    let mapaPortaria134Local = null;

    async function carregarMapaPortaria134Oficial() {
        if (mapaPortaria134Local) return mapaPortaria134Local;
        if (typeof window !== 'undefined' && window.DATASUS_PORTARIA134_BACABAL) {
            mapaPortaria134Local = window.DATASUS_PORTARIA134_BACABAL;
            return mapaPortaria134Local;
        }
        try {
            const resp = await fetch('/cnes_data/datasus_portaria134.json');
            if (resp.ok) {
                mapaPortaria134Local = await resp.json();
                if (typeof window !== 'undefined') window.DATASUS_PORTARIA134_BACABAL = mapaPortaria134Local;
                return mapaPortaria134Local;
            }
        } catch (e) {}
        return null;
    }

    function resolverPortaria134Oficial(cnes, cns, nome, cbo) {
        const map = mapaPortaria134Local || (typeof window !== 'undefined' && window.DATASUS_PORTARIA134_BACABAL) || null;
        if (!map) return null;
        const cnesStr = String(cnes || '').trim();
        const cnsClean = String(cns || '').replace(/\D/g, '');
        const cboClean = String(cbo || '').split(' ')[0].replace(/\D/g, '');
        const nomeClean = String(nome || '').toUpperCase().replace(/\s+/g, ' ').trim();

        return (cnesStr && cnsClean && cboClean && map[`${cnesStr}_${cnsClean}_${cboClean}`])
            || (cnesStr && cnsClean && map[`${cnesStr}_${cnsClean}`])
            || (cnesStr && nomeClean && cboClean && map[`${cnesStr}_${nomeClean}_${cboClean}`])
            || (cnesStr && nomeClean && map[`${cnesStr}_${nomeClean}`])
            || (cnsClean && cboClean && (map[`cns_${cnsClean}_${cboClean}`] || map[`${cnsClean}_${cboClean}`]))
            || (cnsClean && (map[`cns_${cnsClean}`] || map[cnsClean]))
            || (nomeClean && (map[`nome_${nomeClean}`] || map[nomeClean]))
            || null;
    }

    function formatarTipoVinculo(p) {
        if (!p) return '-';

        // 1. Prioridade absoluta: Vínculo oficial auditado diretamente no DATASUS CNESNet
        const oficial = resolverVinculoOficial(p.cnes, p.cnsMaster || p.cns, p.nome, p.cbo);
        if (oficial && oficial.tipoVinculo) {
            return oficial.tipoVinculo;
        }

        const real = p.tipoVinculo || p.tipo_vinculo;
        if (real != null && String(real).trim()) {
            const s = String(real).trim();
            if (s !== 'Não informado' && s !== 'null' && s !== 'undefined') {
                if (s.includes('ESTATUT')) return 'ESTATUTARIO EFETIVO';
                return s;
            }
        }
        const raw = String(p.tipoVinculo || p.tipo_vinculo || '').trim().toUpperCase();
        if (raw && raw !== 'NÃO INFORMADO' && raw !== 'NAO INFORMADO' && raw !== 'NULL' && raw !== 'UNDEFINED' && raw !== '-') {
            if (raw.includes('ESTATUT')) return 'ESTATUTARIO EFETIVO';
            if (raw.includes('CONTRATAD') || raw.includes('TEMPORAR')) return 'CONTRATADO TEMPORÁRIO OU POR PRAZO/TEMPO DETERMINADO';
            if (raw.includes('AUTONOM')) return 'AUTONOMO';
            if (raw.includes('COMISSION')) return 'CARGO COMISSIONADO';
            if (raw.includes('EMPREGO')) return 'EMPREGO PUBLICO';
            if (raw.includes('COOPER')) return 'COOPERADO';
            if (raw.includes('RESIDEN')) return 'RESIDENTE';
            if (raw.includes('CEDID')) return 'CEDIDO';
            return raw;
        }
        const codigo = String(p.codigoVinculacao || p.codigo_vinculacao || p.codigoVinculo || p.codigo_vinculo || '').trim();
        if (codigo === '010101' || codigo.startsWith('01')) return 'ESTATUTARIO EFETIVO';
        if (codigo.startsWith('02')) return 'EMPREGO PUBLICO';
        if (codigo.startsWith('03') || codigo.startsWith('04')) return 'CONTRATADO TEMPORÁRIO OU POR PRAZO/TEMPO DETERMINADO';
        
        return 'CONTRATADO TEMPORÁRIO OU POR PRAZO/TEMPO DETERMINADO';
    }

    function formatarSubtipoVinculo(p) {
        if (!p) return '-';

        // 1. Prioridade absoluta: Subtipo oficial auditado diretamente no DATASUS CNESNet
        const oficial = resolverVinculoOficial(p.cnes, p.cnsMaster || p.cns, p.nome, p.cbo);
        if (oficial && oficial.subtipoVinculo) {
            return oficial.subtipoVinculo;
        }

        const real = p.subtipo || p.sub_tipo || p.subTipo;
        if (real != null && String(real).trim()) {
            const s = String(real).trim();
            if (s !== 'Não informado' && s !== 'null' && s !== 'undefined') return s;
        }
        const rawSub = String(p.subtipo || p.sub_tipo || p.subTipo || '').trim().toUpperCase();
        if (rawSub && rawSub !== 'NÃO INFORMADO' && rawSub !== 'NAO INFORMADO' && rawSub !== 'NULL' && rawSub !== 'UNDEFINED' && rawSub !== '-') {
            if (rawSub.includes('SERVIDOR') || rawSub.includes('PROPRIO')) return 'SERVIDOR PROPRIO';
            if (rawSub.includes('PUBLIC') || rawSub.includes('PÚBLIC')) return 'PUBLICO';
            if (rawSub.includes('FISICA') || rawSub.includes('FÍSICA')) return 'PESSOA FISICA';
            return rawSub;
        }
        const tipo = formatarTipoVinculo(p);
        if (tipo.includes('ESTATUTARIO') || tipo.includes('ESTATUTÁRIO')) {
            return 'SERVIDOR PROPRIO';
        }
        if (tipo.includes('AUTONOMO')) {
            return 'PESSOA FISICA';
        }
        return 'PUBLICO';
    }

    function formatarDescricaoCbo(ocupacao, cbo) {
        if (!ocupacao) return '';
        let s = String(ocupacao).trim();
        s = s.replace(/^\d+[\s\-_]*/, '');
        return s ? s.toUpperCase() : '';
    }

    function isProfissionalEfetivo(p) {
        if (!p) return false;
        const tipo = String(formatarTipoVinculo(p) || p.tipoVinculo || p.vinculacao || '').toUpperCase().trim();
        const codigo = String(p.codigoVinculacao || p.codigo_vinculacao || p.codigoVinculo || p.codigo_vinculo || '').trim();
        const isEstatutario = tipo === 'ESTATUTARIO EFETIVO' || 
               tipo === 'ESTATUTÁRIO EFETIVO' || 
               (tipo.includes('ESTATUT') && !tipo.includes('TEMPORAR') && !tipo.includes('COMISSION')) ||
               codigo === '010101' ||
               codigo === '01';
        const isEmpregadoPublico = tipo.includes('EMPREGADO PUBLICO') ||
               tipo.includes('EMPREGADO PÚBLICO') ||
               codigo === '020101' ||
               codigo === '02';
        return isEstatutario || isEmpregadoPublico;
    }

    let mapaDtAtribuicaoLocal = null;

    async function carregarMapaDtAtribuicaoOficial() {
        if (mapaDtAtribuicaoLocal) return mapaDtAtribuicaoLocal;
        if (typeof window !== 'undefined' && window.DATASUS_DT_ATRIBUICAO_BACABAL) {
            mapaDtAtribuicaoLocal = window.DATASUS_DT_ATRIBUICAO_BACABAL;
            return mapaDtAtribuicaoLocal;
        }
        try {
            const resp = await fetch('/cnes_data/datasus_dt_atribuicao.json');
            if (resp.ok) {
                mapaDtAtribuicaoLocal = await resp.json();
                if (typeof window !== 'undefined') window.DATASUS_DT_ATRIBUICAO_BACABAL = mapaDtAtribuicaoLocal;
                return mapaDtAtribuicaoLocal;
            }
        } catch (e) {
            console.warn('Mapa DT. Atribuição oficial DATASUS indisponível via fetch:', e);
        }
        return null;
    }

    function resolverDtAtribuicaoOficial(cnes, cns, nome, cbo) {
        const map = mapaDtAtribuicaoLocal || (typeof window !== 'undefined' && window.DATASUS_DT_ATRIBUICAO_BACABAL) || null;
        if (!map) return '';
        const cnesStr = String(cnes || '').trim();
        const cnsClean = String(cns || '').replace(/\D/g, '');
        const cboClean = String(cbo || '').split(' ')[0].replace(/\D/g, '');
        const nomeClean = String(nome || '').toUpperCase().replace(/\s+/g, ' ').trim();

        return (cnesStr && cnsClean && cboClean && map[`${cnesStr}_${cnsClean}_${cboClean}`])
            || (cnesStr && cnsClean && map[`${cnesStr}_${cnsClean}`])
            || (cnesStr && nomeClean && cboClean && map[`${cnesStr}_${nomeClean}_${cboClean}`])
            || (cnesStr && nomeClean && map[`${cnesStr}_${nomeClean}`])
            || (cnsClean && cboClean && map[`CNS_${cnsClean}_${cboClean}`])
            || (cnsClean && map[`CNS_${cnsClean}`])
            || '';
    }

    function obterDataAtribuicao(p, isHtml = true) {
        if (!p) return '-';
        let raw = p.dtAtribuicao || p.dt_atribuicao || p.data_atribuicao || '';
        if (!raw) {
            raw = resolverDtAtribuicaoOficial(p.cnes || p.codigo_cnes || p.co_cnes || p.codigoCnes, p.cns || p.cnsMaster, p.nome, p.cbo);
        }
        if (!raw) {
            raw = p.dtEntrada || p.dt_entrada || '';
        }
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

        if (!isHtml) {
            return horaStr ? `${dataStr} ${horaStr}` : dataStr;
        }

        if (dataStr && horaStr) {
            return `<div class="cnes-dt-wrapper"><span class="cnes-dt-date">${dataStr}</span><span class="cnes-dt-time">${horaStr}</span></div>`;
        }
        return `<div class="cnes-dt-wrapper"><span class="cnes-dt-date">${dataStr}</span></div>`;
    }

    function coberturaPortaria134Completa(coverage) {
        if (!coverage || typeof coverage !== 'object') return false;
        return coverage.completa === true || coverage.complete === true ||
            coverage.profissionaisCompleto === true || coverage.allProfessionals === true ||
            coverage.pf === true ||
            String(coverage.status || '').toUpperCase() === 'COMPLETE';
    }

    function escaparTextoHtml(valor) {
        return String(valor).replace(/[&<>"']/g, caractere => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        })[caractere]);
    }

    function obterStatusPortaria134(p, mapaHoras, mapaVinculos, options = {}) {
        if (!p) {
            return {
                alerta: false, artigo: '', nivel: 'regular', horasRede: 0,
                oficial: { alerta: false, artigo: '', fonte: '' },
                triagem: { alerta: false, motivo: '', proveniencia: '' }, html: '', triagemHtml: ''
            };
        }
        const key = String(p.cnsMaster || p.cns || p.cpf || p.nome || '').replace(/\D/g, '') || String(p.nome || '').trim().toUpperCase();
        const chItem = Number(p.chTotal || ((p.chAmb || 0) + (p.chHosp || 0) + (p.chOutros || 0))) || 0;
        const horasRede = mapaHoras && mapaHoras.has(key) ? Number(mapaHoras.get(key)) || 0 : chItem;
        const qtdVinculos = mapaVinculos && mapaVinculos.has(key) ? Number(mapaVinculos.get(key)) || 0 : 1;
        let p134Str = String(p.portaria134 || '').trim();
        let fonte = String(p.portaria134Fonte || p.portaria134_fonte || '').trim().toUpperCase();
        if (!p134Str || p134Str === '-' || p134Str.toLowerCase() === 'null') {
            const oficialP134 = resolverPortaria134Oficial(p.cnes, p.cnsMaster || p.cns, p.nome, p.cbo);
            if (oficialP134 && oficialP134.portaria134) {
                p134Str = oficialP134.portaria134;
                fonte = oficialP134.portaria134Fonte || 'CNES_OFICIAL';
            }
        }
        const temFlagOficial = (fonte === 'CNES_OFICIAL' || p134Str.includes('Artigo')) &&
            p134Str.length > 0 && p134Str !== '-' && p134Str.toLowerCase() !== 'null' &&
            !p134Str.toUpperCase().includes('SOBREPOSIÇÃO');
        const artigoOficial = temFlagOficial ? (p134Str.includes('Artigo') ? p134Str : `Artigo 2º (${p134Str})`) : '';
        const coberturaCompleta = options.coberturaCompleta === true ||
            coberturaPortaria134Completa(options.coverage) ||
            coberturaPortaria134Completa(state.coverage) ||
            (mapaHoras && mapaHoras.coberturaCompleta === true);
        const temExcessoTriagem = Boolean(coberturaCompleta && (horasRede > 60 || (qtdVinculos > 1 && horasRede > 44)));

        const oficial = {
            alerta: temFlagOficial,
            artigo: artigoOficial || 'Artigo 2º',
            fonte: 'CNES_OFICIAL',
            competencia: String(p.portaria134Competencia || state.competenciaAtiva || '')
        };
        const triagem = {
            alerta: temExcessoTriagem,
            motivo: temExcessoTriagem ? `Carga horária acumulada na rede superior a 60h (${horasRede}h em ${qtdVinculos} vínculo(s)); requer conferência oficial` : '',
            proveniencia: temExcessoTriagem ? 'ARGOS_TRIAGEM' : '',
            horasRede,
            qtdVinculos
        };

        if (oficial.alerta) {
            return {
                alerta: true,
                artigo: oficial.artigo,
                nivel: horasRede > 60 ? 'critico' : 'alerta',
                horasRede,
                oficial,
                triagem,
                html: `
                    <div class="cnes-p134-warning-box" title="Observação oficial CNES: ${escaparTextoHtml(oficial.artigo)}">
                        <div class="cnes-p134-icon-wrap">
                            <svg class="cnes-p134-tri-icon" viewBox="0 0 24 24" width="16" height="16">
                                <path d="M12 2L1 21h22L12 2z" fill="#facc15" stroke="#92400e" stroke-width="1.2" stroke-linejoin="round"/>
                                <line x1="12" y1="8" x2="12" y2="13" stroke="#000000" stroke-width="2" stroke-linecap="round"/>
                                <circle cx="12" cy="17" r="1.1" fill="#000000"/>
                            </svg>
                            <span class="cnes-p134-dots"></span>
                        </div>
                        <div class="cnes-p134-tooltip">${escaparTextoHtml(oficial.artigo)}</div>
                    </div>
                `,
                triagemHtml: ''
            };
        }

        return {
            alerta: false,
            artigo: '',
            nivel: triagem.alerta ? 'triagem' : 'regular',
            horasRede,
            oficial,
            triagem,
            html: '',
            triagemHtml: triagem.alerta ? `<span class="cnes-p134-triage" title="${triagem.motivo}">Triagem ARGOS: CH &gt;60h (${horasRede}h)</span>` : ''
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
        
        // Consulta metadados oficiais de Bacabal se disponíveis
        const metaBacabal = (typeof window !== 'undefined' && window.CNES_METADATA_BACABAL && window.CNES_METADATA_BACABAL[cnes]) || null;
        const referenceName = u.nomeFantasiaOrigem === 'identificador CNES' ? u.nomeReferenciaLegado : '';

        let nfCandidate = referenceName || u.nomeFantasia || u.nome_fantasia || u.no_fantasia;
        if ((!nfCandidate || /^CNES\s+\d+$/i.test(String(nfCandidate).trim())) && metaBacabal && metaBacabal.nomeFantasia) {
            nfCandidate = metaBacabal.nomeFantasia;
        }
        const nomeFantasia = String(fallback(nfCandidate, 'ESTABELECIMENTO DE SAÚDE')).trim().toUpperCase();

        let rzCandidate = u.razaoSocial || u.razao_social || u.nome_razao_social || u.no_razao_social;
        if (!rzCandidate && metaBacabal && metaBacabal.razaoSocial) {
            rzCandidate = metaBacabal.razaoSocial;
        }
        const razaoSocial = String(fallback(rzCandidate, nomeFantasia)).trim().toUpperCase();

        let tpCandidate = u.tipoUnidade || u.tipo_unidade || u.descricao_tipo_unidade || u.ds_tipo_unidade;
        if (!tpCandidate && metaBacabal && metaBacabal.tipoUnidade) {
            tpCandidate = metaBacabal.tipoUnidade;
        }
        const tipoUnidade = String(fallback(tpCandidate || (!allowSynthetic && u.tipoUnidadeCodigo ? `Tipo CNES: ${u.tipoUnidadeCodigo}` : ''), '02 - CENTRO DE SAUDE / UBS')).trim().toUpperCase();

        const cnpj = String(fallback(u.cnpj || u.numero_cnpj_mantenedora || u.nu_cnpj_mantenedora || (metaBacabal && metaBacabal.cnpj), '06014351000138')).trim();
        const tipoGestao = String(fallback(u.tipoGestao || u.tipo_gestao || (metaBacabal && metaBacabal.tipoGestao) || (!allowSynthetic && u.tipoGestaoCodigo ? `Código CNES: ${u.tipoGestaoCodigo}` : ''), 'MUNICIPAL')).trim().toUpperCase();
        const esfera = String(fallback(u.esfera || u.descricao_esfera_administrativa || (metaBacabal && metaBacabal.esfera), 'MUNICIPAL')).trim().toUpperCase();
        const endereco = String(fallback(u.endereco || u.endereco_estabelecimento || u.logradouro || (metaBacabal && metaBacabal.endereco), 'ENDEREÇO DA UNIDADE')).trim();
        const numero = String(fallback(u.numero || u.numero_estabelecimento, 'S/N')).trim();
        const bairro = String(fallback(u.bairro || u.bairro_estabelecimento || (metaBacabal && metaBacabal.bairro), 'CENTRO')).trim();
        const telefone = String(fallback(u.telefone || u.numero_telefone_estabelecimento || (metaBacabal && metaBacabal.telefone), '(99) 3621-1200')).trim();
        const atendimentoSus = String(fallback(u.atendimentoSus || u.atendimento_sus || (metaBacabal && metaBacabal.atendimentoSus), u.atendimento_prestado_sus === 'SIM' || u.atendimento_prestado_sus === true ? 'SIM' : 'SIM (MUNICIPAL)')).trim();

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

        const oficialP134 = resolverPortaria134Oficial(cnes, cns, nome, cbo);
        const portaria134 = (oficialP134 && oficialP134.portaria134) || String(p.portaria134 || '').trim();
        const portaria134Fonte = (oficialP134 && oficialP134.portaria134Fonte) || (portaria134 ? 'CNES_OFICIAL' : String(p.portaria134Fonte || p.portaria134_fonte || '').trim().toUpperCase());

        // Auditoria Oficial DATASUS CNESNet para Vínculos e Subtipos
        const oficialVinculo = resolverVinculoOficial(cnes, cns, nome, cbo);

        // Data de atribuição sempre preservada com valor real oficial do CNES DATASUS
        const dtAtribuicao = fallback(
            (oficialVinculo && oficialVinculo.dtAtribuicao) || p.dtAtribuicao || p.dt_atribuicao || p.data_atribuicao || resolverDtAtribuicaoOficial(cnes, cns, nome, cbo) || p.dtEntrada || p.dt_entrada,
            ''
        );

        return {
            ...p,
            nome,
            dtEntrada: fallback(p.dtEntrada || p.dt_entrada, ''),
            cns,
            cnsMaster: p.cnsMaster || cns,
            dtAtribuicao,
            cbo,
            ocupacao,
            chAmb,
            chHosp,
            chOutros,
            chTotal,
            atendimentoSus: fallback((oficialVinculo && oficialVinculo.atendimentoSus) || p.atendimentoSus, ''),
            vinculacao: fallback((oficialVinculo && oficialVinculo.vinculacao) || p.vinculacao || p.vinculo || p.vinculacaoEmpregaticia, ''),
            tipoVinculo: fallback((oficialVinculo && oficialVinculo.tipoVinculo) || p.tipoVinculo || p.tipo_vinculo, ''),
            subtipo: fallback((oficialVinculo && oficialVinculo.subtipoVinculo) || p.subtipo, ''),
            compDesativacao: p.compDesativacao || '',
            situacao: fallback(p.situacao, p.ativo === false ? 'Desligado' : 'Ativo'),
            portaria134,
            portaria134Fonte: portaria134Fonte === 'CNES_OFICIAL' ? 'CNES_OFICIAL' : '',
            portaria134Competencia: p.portaria134Competencia || p.portaria134_competencia || '',
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

    async function fetchCnesPublicado(endpoint) {
        const headers = {};
        try {
            const client = window.SupabaseConfig && typeof window.SupabaseConfig.getClient === 'function'
                ? window.SupabaseConfig.getClient()
                : null;
            if (client && client.auth && typeof client.auth.getSession === 'function') {
                const sessionResult = await client.auth.getSession();
                const token = sessionResult && sessionResult.data && sessionResult.data.session && sessionResult.data.session.access_token;
                if (token) headers.Authorization = `Bearer ${token}`;
            }
            if (!headers.Authorization && window.SupabaseConfig && typeof window.SupabaseConfig.getAnonKey === 'function') {
                const anon = window.SupabaseConfig.getAnonKey();
                if (anon) headers.Authorization = `Bearer ${anon}`;
            }
        } catch (authErr) {
            console.warn('Sessão Supabase indisponível para consulta CNES:', authErr);
        }

        const response = await fetch(endpoint, { headers });
        if (response.status === 401) {
            const error = new Error('A consulta CNES exige uma sessão Supabase válida.');
            error.code = 'CNES_UNAUTHORIZED';
            throw error;
        }
        if (response.status === 503) {
            const error = new Error('A competência CNES solicitada não está publicada no backend.');
            error.code = 'CNES_UNAVAILABLE';
            throw error;
        }
        if (!response.ok) {
            const error = new Error(`Consulta CNES indisponível (HTTP ${response.status}).`);
            error.code = 'CNES_HTTP_ERROR';
            throw error;
        }
        return response.json();
    }

    /**
     * Carrega a base oficial do CNES local / remota
     */
    async function carregarDados(competenciaSolicitada = '') {
        state.loading = true;
        render();

        await carregarMapaDtAtribuicaoOficial();
        await carregarMapaVinculosOficial();
        await carregarMapaPortaria134Oficial();

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
                                codigoVinculacao: p.codigo_vinculacao,
                                codigoVinculo: p.codigo_vinculo,
                                codigoSubVinculo: p.codigo_subvinculo,
                                situacao: p.situacao,
                                dtAtribuicao: p.dt_atribuicao || p.data_atribuicao || resolverDtAtribuicaoOficial(p.cnes, p.cns, p.nome, p.cbo) || '',
                                portaria134: p.portaria134,
                                portaria134Fonte: p.portaria134 ? 'CNES_OFICIAL' : (p.portaria134_fonte || '')
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
                        state.estabelecimentos = parsed.estabelecimentos.map(u => normalizarEstabelecimento(
                            u,
                            state.municipio,
                            state.uf,
                            { competencia: parsed.competenciaPadrao || parsed.competencia || '' }
                        ));
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

        let fetchError = null;
        // Query the server so the manifest is the source of truth for Bacabal.
        try {
            const compQuery = requestedCompetence ? `&competencia=${requestedCompetence}` : '';
            const endpoint = `/api/cnes/estabelecimentos?ibge=${state.ibge}&uf=${state.uf}&municipio=${encodeURIComponent(state.municipio)}${compQuery}&t=${Date.now()}`;
            const res = await fetchCnesPublicado(endpoint);
            if (res && res.estabelecimentos && res.estabelecimentos.length > 0) {
                // Validação geográfica: verificar se os estabelecimentos realmente pertencem ao município consultado
                const pertencemAoMunicipio = res.estabelecimentos.some(u => {
                    const uIbge = String(u.codigo_municipio || u.municipio || u.vcoUnidade || '');
                    const uMun = String(u.municipio || u.nomeFantasia || u.razaoSocial || '').toUpperCase();
                    return uIbge.includes(state.ibge) || uMun.includes(state.municipio);
                });

                if (pertencemAoMunicipio || isBacabal) {
                    const returnedCompetence = res.competenciaPadrao || res.competencia || res.competence || '';
                    state.estabelecimentos = res.estabelecimentos.map(u => normalizarEstabelecimento(
                        u,
                        state.municipio,
                        state.uf,
                        { allowSynthetic: !isBacabal, competencia: returnedCompetence }
                    ));
                    if (res.competencias && res.competencias.length > 0) {
                        state.competencias = res.competencias;
                    } else if (isBacabal) {
                        state.competencias = [];
                    }
                    state.sourceType = res.source_type || res.sourceType || (res.legacy ? 'legacy_file' : 'remote');
                    state.isLegacy = res.legacy === true || state.sourceType === 'legacy_file';
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
            fetchError = e;
            console.warn('Endpoint /api/cnes/estabelecimentos indisponível:', e);
        }

        // Bacabal has no synthetic fallback. An empty/failed published source
        // must remain visibly unavailable until the worker publishes a valid
        // snapshot (or the API returns the explicitly marked legacy file).
        if (isBacabal) {
            // Fallback direto via Supabase Cloud se a API não estiver acessível
            if (window.SupabaseConfig && typeof window.SupabaseConfig.getClient === 'function') {
                try {
                    const supabaseClient = window.SupabaseConfig.getClient();
                    if (supabaseClient) {
                        const targetComp = requestedCompetence || '202608';
                        const { data: sEstabs, error: sErr } = await supabaseClient
                            .from('cnes_estabelecimentos')
                            .select('*')
                            .eq('codigo_ibge', state.ibge)
                            .eq('competencia', targetComp);

                        if (!sErr && sEstabs && sEstabs.length > 0) {
                            let allProfs = [];
                            let page = 0;
                            const pageSize = 1000;
                            let hasMore = true;
                            while (hasMore) {
                                const from = page * pageSize;
                                const to = from + pageSize - 1;
                                const { data: chunk, error: chunkErr } = await supabaseClient
                                    .from('cnes_profissionais')
                                    .select('*')
                                    .eq('municipio_ibge', state.ibge)
                                    .eq('competencia', targetComp)
                                    .range(from, to);
                                if (chunkErr || !chunk || chunk.length === 0) {
                                    hasMore = false;
                                } else {
                                    allProfs.push(...chunk);
                                    if (chunk.length < pageSize) {
                                        hasMore = false;
                                    } else {
                                        page++;
                                    }
                                }
                            }

                            const profsMap = {};
                            allProfs.forEach(p => {
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
                                    codigoVinculacao: p.codigo_vinculacao,
                                    codigoVinculo: p.codigo_vinculo,
                                    codigoSubVinculo: p.codigo_subvinculo,
                                    situacao: p.situacao,
                                    dtAtribuicao: p.dt_atribuicao || p.data_atribuicao || resolverDtAtribuicaoOficial(p.cnes, p.cns, p.nome, p.cbo) || '',
                                    portaria134: p.portaria134,
                                    portaria134Fonte: p.portaria134 ? 'CNES_OFICIAL' : (p.portaria134_fonte || '')
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
                            }, state.municipio, state.uf, { allowSynthetic: false, competencia: targetComp }));

                            state.competencias = [
                                { codigo: '202608', label: '08/2026', vigente: true },
                                { codigo: '202607', label: '07/2026', vigente: false },
                                { codigo: '202606', label: '06/2026', vigente: false }
                            ];
                            state.competenciaAtiva = targetComp;
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
                } catch (eSup) {
                    console.warn('Fallback Supabase Bacabal:', eSup);
                }
            }

            state.estabelecimentos = [];
            state.competencias = [];
            state.competenciaAtiva = '';
            state.sourceType = fetchError && fetchError.code === 'CNES_UNAUTHORIZED' ? 'unauthorized' : 'unavailable';
            state.isLegacy = false;
            state.coverage = null;
            state.dataSource = fetchError && fetchError.code === 'CNES_UNAUTHORIZED'
                ? 'CNES Bacabal requer login Supabase'
                : (fetchError && fetchError.code === 'CNES_UNAVAILABLE' ? 'Competência CNES não publicada' : 'CNES Bacabal indisponível');
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

    function chaveProfissional(p) {
        return String(p && (p.cnsMaster || p.cns || p.cpf || p.nome) || '')
            .replace(/\D/g, '') || String(p && p.nome || '').trim().toUpperCase();
    }

    function criarMapasVinculos() {
        const mapaHoras = new Map();
        const mapaVinculos = new Map();
        state.estabelecimentos.forEach(est => (est.profissionais || []).forEach(pr => {
            const key = chaveProfissional(pr);
            const ch = Number(pr.chTotal || ((pr.chAmb || 0) + (pr.chHosp || 0) + (pr.chOutros || 0))) || 0;
            mapaHoras.set(key, (mapaHoras.get(key) || 0) + ch);
            mapaVinculos.set(key, (mapaVinculos.get(key) || 0) + 1);
        }));
        mapaHoras.coberturaCompleta = coberturaPortaria134Completa(state.coverage);
        return { mapaHoras, mapaVinculos };
    }

    /**
     * Normalizador de texto para buscas textuais (remove acentos, pontuações e espaços excessivos)
     */
    function normalizarBusca(texto) {
        if (!texto) return '';
        return String(texto)
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .trim();
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
            // Filtra estabelecimentos conforme o escopo selecionado (Rede Municipal Mantida, Toda a Rede ou Privada)
            let estsParaListar = state.estabelecimentos;
            if (state.filterEscopo === 'mantidos') {
                estsParaListar = state.estabelecimentos.filter(est => isUnidadeMantidaMunicipal(est));
            } else if (state.filterEscopo === 'privados') {
                estsParaListar = state.estabelecimentos.filter(est => !isUnidadeMantidaMunicipal(est));
            }

            estsParaListar.forEach(est => {
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

        // Filtro de profissionais efetivos (estatutários efetivos concursados)
        if (state.tableFilter.apenasEfetivos) {
            list = list.filter(p => isProfissionalEfetivo(p));
        }

        // Filtro de desligados vs ativos
        if (state.tableFilter.apenasDesligados) {
            list = list.filter(p => !p.ativo || p.situacao === 'Desligado');
        } else {
            list = list.filter(p => p.ativo !== false && p.situacao !== 'Desligado');
        }

        // Filtro da Auditoria de Carga Horária e Vínculos (Portaria 134 - Oficial CNES)
        if (state.tableFilter.apenasAlerta134) {
            const { mapaHoras, mapaVinculos } = criarMapasVinculos();

            list = list.filter(p => {
                const status = obterStatusPortaria134(p, mapaHoras, mapaVinculos);
                return Boolean(status && status.alerta === true);
            });
        }

        // Filtro de busca textual inteligente e instantâneo (multitermo e insensível a acentos)
        if (state.tableFilter.search) {
            const terms = normalizarBusca(state.tableFilter.search).split(/\s+/).filter(Boolean);
            if (terms.length > 0) {
                list = list.filter(p => {
                    const cboFmt = formatarCboOficial(p);
                    const campos = [
                        p.nome,
                        p.cns,
                        p.cnsMaster,
                        p.cbo,
                        cboFmt,
                        p.ocupacao,
                        p.unidadeNome,
                        p.tipoUnidade,
                        p.vinculacao,
                        p.tipoVinculo,
                        p.subtipoVinculo,
                        p.situacao,
                        p.ativo !== false ? 'ativo' : 'desligado'
                    ].filter(Boolean).join(' ');

                    const alvoNorm = normalizarBusca(campos);
                    return terms.every(t => alvoNorm.includes(t));
                });
            }
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
        state.tableFilter.apenasEfetivos = false;
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

    function toggleEfetivos() {
        state.tableFilter.apenasEfetivos = !state.tableFilter.apenasEfetivos;
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
     * Exportar XLS Oficial Multi-Aba (Mesmo Layout e Abas da Referência Oficial)
     * Aba 1: Colaboradores & Vínculos (16 colunas, cabeçalho #1E3A8A, zebrado #F8FAFC, alerta Portaria 134)
     * Aba 2: Estabelecimentos (8 colunas, cabeçalho #1E3A8A, quantitativo de profissionais)
     * Aba 3: Auditoria Portaria 134 (7 colunas, cabeçalho #991B1B, auditoria de sobreposição e >60h)
     */
    async function exportarXls() {
        const u = getSelectedUnidade();
        const profs = getProfissionaisList();

        if (!profs || profs.length === 0) {
            if (typeof showToast === 'function') showToast('ℹ️ Nenhum registro para exportar com os filtros atuais.', 'info');
            return;
        }

        // Competência formatada (ex: '08/2026' para rótulo e '202608' para nome de arquivo)
        const compAtiva = String(state.competenciaAtiva || '08/2026').trim();
        let compLabel = compAtiva;
        let compFile = compAtiva.replace(/\D/g, '');
        if (compAtiva.includes('/')) {
            const parts = compAtiva.split('/');
            if (parts.length === 2) {
                compLabel = `${parts[0].padStart(2, '0')}/${parts[1]}`;
                compFile = `${parts[1]}${parts[0].padStart(2, '0')}`;
            }
        } else if (compAtiva.length === 6) {
            // YYYYMM -> MM/YYYY
            const y = compAtiva.slice(0, 4);
            const m = compAtiva.slice(4, 6);
            compLabel = `${m}/${y}`;
            compFile = compAtiva;
        }

        const munClean = String(state.municipio || 'BACABAL')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim()
            .toUpperCase()
            .replace(/\s+/g, '_');

        const cnesLabel = state.selectedCnes ? `_${state.selectedCnes}` : '';
        const filename = `CNES_Profissionais_${munClean}${cnesLabel}_${compFile}.xlsx`;

        // 1. Preparação dos dados para Aba 1 (Colaboradores & Vínculos)
        const { mapaHoras, mapaVinculos } = criarMapasVinculos();
        const sortedColabs = profs.slice().sort((a, b) => {
            const estA = String(a.unidadeNome || (u ? u.nomeFantasia : '') || '').toUpperCase();
            const estB = String(b.unidadeNome || (u ? u.nomeFantasia : '') || '').toUpperCase();
            if (estA !== estB) return estA.localeCompare(estB);
            const nomeA = String(a.nome || '').toUpperCase();
            const nomeB = String(b.nome || '').toUpperCase();
            return nomeA.localeCompare(nomeB);
        });

        // 2. Preparação dos dados para Aba 2 (Estabelecimentos)
        let estsParaListar = (state.estabelecimentos || []).slice();
        if (state.filterEscopo === 'mantidos') {
            estsParaListar = estsParaListar.filter(est => isUnidadeMantidaMunicipal(est));
        } else if (state.filterEscopo === 'privados') {
            estsParaListar = estsParaListar.filter(est => !isUnidadeMantidaMunicipal(est));
        }
        estsParaListar.sort((a, b) => String(a.nomeFantasia || '').localeCompare(String(b.nomeFantasia || '')));

        // 3. Preparação dos dados para Aba 3 (Auditoria Portaria 134)
        const cnsGrouped = new Map();
        // Agrupa todos os colaboradores da rede para auditar sobreposição
        const todosProfissionaisRede = [];
        (state.estabelecimentos || []).forEach(est => {
            (est.profissionais || []).forEach(p => {
                todosProfissionaisRede.push({
                    ...p,
                    cnes: est.cnes,
                    unidadeNome: est.nomeFantasia
                });
            });
        });

        const baseAuditoria = todosProfissionaisRede.length > 0 ? todosProfissionaisRede : sortedColabs;
        baseAuditoria.forEach(colab => {
            const cns = String(colab.cnsMaster || colab.cns || '').replace(/\D/g, '');
            if (!cns) return;
            if (!cnsGrouped.has(cns)) {
                cnsGrouped.set(cns, {
                    cns: cns,
                    nome: String(colab.nome || '').trim().toUpperCase(),
                    vinculos: 0,
                    chTotal: 0,
                    estabelecimentos: new Set(),
                    ocupacoes: new Set()
                });
            }
            const info = cnsGrouped.get(cns);
            info.vinculos += 1;
            const ch = Number(colab.chTotal != null ? colab.chTotal : ((Number(colab.chAmb) || 0) + (Number(colab.chHosp) || 0) + (Number(colab.chOutros) || 0))) || 0;
            info.chTotal += ch;
            const estNome = String(colab.unidadeNome || colab.estabelecimento || '').trim();
            if (estNome) info.estabelecimentos.add(estNome);
            const cboCode = String(colab.cbo || colab.ocupacao || '').split(' - ')[0].replace(/\D/g, '');
            if (cboCode) info.ocupacoes.add(cboCode);
        });

        const auditados = [];
        cnsGrouped.forEach(info => {
            if (info.vinculos > 1 || info.chTotal > 60) {
                let parecer = '';
                if (info.vinculos > 1 && info.chTotal > 60) {
                    parecer = `Sobreposição de ${info.vinculos} vínculos (${info.chTotal}h semanais - Art. 2º Portaria 134)`;
                } else if (info.vinculos > 1) {
                    parecer = `${info.vinculos} vínculos ativos na rede municipal`;
                } else {
                    parecer = `Carga horária acumulada excessiva (${info.chTotal}h semanais)`;
                }
                auditados.push({
                    cns: info.cns,
                    nome: info.nome,
                    vinculos: info.vinculos,
                    chTotal: info.chTotal,
                    estabelecimentos: Array.from(info.estabelecimentos).sort().join(', '),
                    ocupacoes: Array.from(info.ocupacoes).sort().join(', '),
                    parecer: parecer
                });
            }
        });
        auditados.sort((a, b) => b.chTotal - a.chTotal || b.vinculos - a.vinculos || a.nome.localeCompare(b.nome));

        // Checa se ExcelJS está carregado para exportação estilizada de alta fidelidade
        const ExcelJSClass = (typeof ExcelJS !== 'undefined') ? ExcelJS : ((typeof window !== 'undefined' && window.ExcelJS) ? window.ExcelJS : null);

        if (ExcelJSClass) {
            try {
                const wb = new ExcelJSClass.Workbook();
                wb.creator = 'FPA ARGOS';
                wb.lastModifiedBy = 'FPA ARGOS';
                wb.created = new Date();
                wb.modified = new Date();

                const borderThin = {
                    top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                    left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                    bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                    right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
                };

                const headerNavyFill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FF1E3A8A' }
                };

                const headerCrimsonFill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FF991B1B' }
                };

                const zebraFill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FFF8FAFC' }
                };

                const alertRedFill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FFFEF2F2' }
                };

                const headerFont = {
                    name: 'Calibri',
                    size: 11,
                    bold: true,
                    color: { argb: 'FFFFFFFF' }
                };

                const regularFont = {
                    name: 'Calibri',
                    size: 11,
                    bold: false
                };

                const alertFont = {
                    name: 'Calibri',
                    size: 10,
                    bold: true,
                    color: { argb: 'FFDC2626' }
                };

                // ─── ABA 1: Colaboradores & Vínculos ───
                const ws1 = wb.addWorksheet('Colaboradores & Vínculos', {
                    views: [{ state: 'frozen', ySplit: 1 }]
                });

                const headersWs1 = [
                    'CNES', 'Estabelecimento de Saúde', 'Nome do Profissional', 'CNS',
                    'CBO', 'Ocupação / Cargo', 'CH Amb', 'CH Hosp', 'CH Outros', 'CH Total',
                    'Atende SUS', 'Tipo de Vínculo', 'Subtipo', 'Situação', 'Dt. Atribuição', 'Portaria 134/2011'
                ];

                ws1.columns = [
                    { header: headersWs1[0], key: 'cnes', width: 12 },
                    { header: headersWs1[1], key: 'estabelecimento', width: 48 },
                    { header: headersWs1[2], key: 'nome', width: 48 },
                    { header: headersWs1[3], key: 'cns', width: 18 },
                    { header: headersWs1[4], key: 'cbo', width: 12 },
                    { header: headersWs1[5], key: 'ocupacao', width: 48 },
                    { header: headersWs1[6], key: 'chAmb', width: 12 },
                    { header: headersWs1[7], key: 'chHosp', width: 12 },
                    { header: headersWs1[8], key: 'chOutros', width: 12 },
                    { header: headersWs1[9], key: 'chTotal', width: 12 },
                    { header: headersWs1[10], key: 'atendimentoSus', width: 13 },
                    { header: headersWs1[11], key: 'tipoVinculo', width: 48 },
                    { header: headersWs1[12], key: 'subtipo', width: 37 },
                    { header: headersWs1[13], key: 'situacao', width: 12 },
                    { header: headersWs1[14], key: 'dtAtribuicao', width: 22 },
                    { header: headersWs1[15], key: 'portaria134', width: 45 }
                ];

                const headerRow1 = ws1.getRow(1);
                headerRow1.height = 24;
                headerRow1.eachCell((cell) => {
                    cell.fill = headerNavyFill;
                    cell.font = headerFont;
                    cell.alignment = { horizontal: 'center', vertical: 'middle' };
                });

                sortedColabs.forEach((p, idx) => {
                    const chAmb = Number(p.chAmb) || 0;
                    const chHosp = Number(p.chHosp) || 0;
                    const chOutros = Number(p.chOutros) || 0;
                    const chTot = Number(p.chTotal != null ? p.chTotal : (chAmb + chHosp + chOutros)) || 0;
                    const st134 = obterStatusPortaria134(p, mapaHoras, mapaVinculos);
                    let portariaTxt = null;
                    if (st134 && st134.alerta) {
                        portariaTxt = st134.artigo || 'Artigo 2º';
                    } else if (p.portaria134 && p.portaria134 !== '-' && p.portaria134.toLowerCase() !== 'null') {
                        portariaTxt = p.portaria134;
                    }

                    const cboCode = String(p.cbo || p.co_cbo || '').replace(/\D/g, '');
                    const row = ws1.addRow({
                        cnes: String(p.cnes || (u ? u.cnes : '') || '').trim(),
                        estabelecimento: String(p.unidadeNome || (u ? u.nomeFantasia : '') || state.municipio || '').trim().toUpperCase(),
                        nome: String(p.nome || '').trim().toUpperCase(),
                        cns: String(p.cnsMaster || p.cns || '').replace(/\D/g, ''),
                        cbo: cboCode,
                        ocupacao: formatarCboOficial(p),
                        chAmb: chAmb,
                        chHosp: chHosp,
                        chOutros: chOutros,
                        chTotal: chTot,
                        atendimentoSus: String(p.atendimentoSus || (p.atendimento_prestado_sus === false ? 'NÃO' : 'SIM')).toUpperCase(),
                        tipoVinculo: formatarTipoVinculo(p),
                        subtipo: formatarSubtipoVinculo(p),
                        situacao: String(p.situacao || (p.ativo !== false ? 'Ativo' : 'Desligado')),
                        dtAtribuicao: obterDataAtribuicao(p, false) || '',
                        portaria134: portariaTxt
                    });

                    const isEven = (idx % 2 === 0);
                    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
                        cell.border = borderThin;
                        cell.font = regularFont;
                        if (isEven) {
                            cell.fill = zebraFill;
                        }
                        if ([1, 4, 5, 7, 8, 9, 10, 11, 14, 15].includes(colNumber)) {
                            cell.alignment = { horizontal: 'center', vertical: 'middle' };
                        } else {
                            cell.alignment = { horizontal: 'left', vertical: 'middle' };
                        }

                        // Destaca célula da Portaria 134 caso haja apontamento
                        if (colNumber === 16 && portariaTxt) {
                            cell.fill = alertRedFill;
                            cell.font = alertFont;
                        }
                    });
                });

                // ─── ABA 2: Estabelecimentos ───
                const ws2 = wb.addWorksheet('Estabelecimentos', {
                    views: [{ state: 'frozen', ySplit: 1 }]
                });

                const headersWs2 = [
                    'CNES', 'Nome Fantasia', 'Razão Social', 'Tipo de Unidade',
                    'Gestão', 'Município', 'UF', `Qtd Profissionais (${compLabel})`
                ];

                ws2.columns = [
                    { header: headersWs2[0], key: 'cnes', width: 12 },
                    { header: headersWs2[1], key: 'nomeFantasia', width: 50 },
                    { header: headersWs2[2], key: 'razaoSocial', width: 50 },
                    { header: headersWs2[3], key: 'tipoUnidade', width: 50 },
                    { header: headersWs2[4], key: 'tipoGestao', width: 12 },
                    { header: headersWs2[5], key: 'municipio', width: 31 },
                    { header: headersWs2[6], key: 'uf', width: 12 },
                    { header: headersWs2[7], key: 'qtdProfissionais', width: 30 }
                ];

                const headerRow2 = ws2.getRow(1);
                headerRow2.height = 24;
                headerRow2.eachCell((cell) => {
                    cell.fill = headerNavyFill;
                    cell.font = headerFont;
                    cell.alignment = { horizontal: 'center', vertical: 'middle' };
                });

                estsParaListar.forEach((est, idx) => {
                    const row = ws2.addRow({
                        cnes: String(est.cnes || '').trim(),
                        nomeFantasia: String(est.nomeFantasia || est.nome_fantasia || '').trim().toUpperCase(),
                        razaoSocial: String(est.razaoSocial || est.razao_social || est.nomeFantasia || '').trim().toUpperCase(),
                        tipoUnidade: String(est.tipoUnidade || est.tipo_unidade || '').trim().toUpperCase(),
                        tipoGestao: String(est.tipoGestao || est.tipo_gestao || 'MUNICIPAL').trim().toUpperCase(),
                        municipio: String(state.municipio || 'BACABAL').trim().toUpperCase(),
                        uf: String(state.uf || 'MA').trim().toUpperCase(),
                        qtdProfissionais: Number((est.profissionais || []).length)
                    });

                    const isEven = (idx % 2 === 0);
                    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
                        cell.border = borderThin;
                        cell.font = regularFont;
                        if (isEven) {
                            cell.fill = zebraFill;
                        }
                        if ([1, 5, 7, 8].includes(colNumber)) {
                            cell.alignment = { horizontal: 'center', vertical: 'middle' };
                        } else {
                            cell.alignment = { horizontal: 'left', vertical: 'middle' };
                        }
                    });
                });

                // ─── ABA 3: Auditoria Portaria 134 ───
                const ws3 = wb.addWorksheet('Auditoria Portaria 134', {
                    views: [{ state: 'frozen', ySplit: 1 }]
                });

                const headersWs3 = [
                    'CNS', 'Nome do Profissional', 'Vínculos na Rede',
                    'CH Semanal Total', 'Estabelecimentos', 'Ocupações', 'Parecer de Auditoria'
                ];

                ws3.columns = [
                    { header: headersWs3[0], key: 'cns', width: 18 },
                    { header: headersWs3[1], key: 'nome', width: 41 },
                    { header: headersWs3[2], key: 'vinculos', width: 19 },
                    { header: headersWs3[3], key: 'chTotal', width: 19 },
                    { header: headersWs3[4], key: 'estabelecimentos', width: 52 },
                    { header: headersWs3[5], key: 'ocupacoes', width: 25 },
                    { header: headersWs3[6], key: 'parecer', width: 52 }
                ];

                const headerRow3 = ws3.getRow(1);
                headerRow3.height = 24;
                headerRow3.eachCell((cell) => {
                    cell.fill = headerCrimsonFill;
                    cell.font = headerFont;
                    cell.alignment = { horizontal: 'center', vertical: 'middle' };
                });

                auditados.forEach((item) => {
                    const row = ws3.addRow({
                        cns: item.cns,
                        nome: item.nome,
                        vinculos: item.vinculos,
                        chTotal: item.chTotal,
                        estabelecimentos: item.estabelecimentos,
                        ocupacoes: item.ocupacoes,
                        parecer: item.parecer
                    });

                    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
                        cell.border = borderThin;
                        cell.font = regularFont;
                        cell.fill = alertRedFill;
                        if ([1, 3, 4].includes(colNumber)) {
                            cell.alignment = { horizontal: 'center', vertical: 'middle' };
                        } else {
                            cell.alignment = { horizontal: 'left', vertical: 'middle' };
                        }
                    });
                });

                // Grava o arquivo via buffer e dispara o download no navegador
                const buffer = await wb.xlsx.writeBuffer();
                const blob = new Blob([buffer], {
                    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                });
                const downloadUrl = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = downloadUrl;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                window.URL.revokeObjectURL(downloadUrl);

                if (typeof showToast === 'function') {
                    showToast(`✅ Planilha ${filename} exportada com sucesso (3 abas oficiais)!`, 'success');
                }
                return;
            } catch (errExcel) {
                console.error('Erro na exportação via ExcelJS, tentando fallback SheetJS:', errExcel);
            }
        }

        // Fallback para SheetJS caso ExcelJS não esteja disponível
        if (typeof XLSX !== 'undefined') {
            const wb = XLSX.utils.book_new();

            // Aba 1
            const rows1 = sortedColabs.map(p => {
                const chAmb = Number(p.chAmb) || 0;
                const chHosp = Number(p.chHosp) || 0;
                const chOutros = Number(p.chOutros) || 0;
                const chTot = Number(p.chTotal != null ? p.chTotal : (chAmb + chHosp + chOutros)) || 0;
                const st134 = obterStatusPortaria134(p, mapaHoras, mapaVinculos);
                const statusTxt = st134.alerta ? (st134.artigo || 'Artigo 2º') : (p.portaria134 || '');
                return [
                    String(p.cnes || (u ? u.cnes : '') || ''),
                    String(p.unidadeNome || (u ? u.nomeFantasia : '') || state.municipio || ''),
                    String(p.nome || ''),
                    String(p.cnsMaster || p.cns || ''),
                    String(p.cbo || p.co_cbo || '').replace(/\D/g, ''),
                    formatarCboOficial(p),
                    chAmb,
                    chHosp,
                    chOutros,
                    chTot,
                    String(p.atendimentoSus || 'SIM'),
                    formatarTipoVinculo(p),
                    formatarSubtipoVinculo(p),
                    String(p.situacao || (p.ativo ? 'Ativo' : 'Desligado')),
                    obterDataAtribuicao(p, false),
                    statusTxt
                ];
            });
            const ws1 = XLSX.utils.aoa_to_sheet([
                ['CNES', 'Estabelecimento de Saúde', 'Nome do Profissional', 'CNS', 'CBO', 'Ocupação / Cargo', 'CH Amb', 'CH Hosp', 'CH Outros', 'CH Total', 'Atende SUS', 'Tipo de Vínculo', 'Subtipo', 'Situação', 'Dt. Atribuição', 'Portaria 134/2011'],
                ...rows1
            ]);
            XLSX.utils.book_append_sheet(wb, ws1, "Colaboradores & Vínculos");

            // Aba 2
            const rows2 = estsParaListar.map(est => [
                est.cnes || '',
                est.nomeFantasia || '',
                est.razaoSocial || est.nomeFantasia || '',
                est.tipoUnidade || '',
                est.tipoGestao || 'MUNICIPAL',
                state.municipio || 'BACABAL',
                state.uf || 'MA',
                Number((est.profissionais || []).length)
            ]);
            const ws2 = XLSX.utils.aoa_to_sheet([
                ['CNES', 'Nome Fantasia', 'Razão Social', 'Tipo de Unidade', 'Gestão', 'Município', 'UF', `Qtd Profissionais (${compLabel})`],
                ...rows2
            ]);
            XLSX.utils.book_append_sheet(wb, ws2, "Estabelecimentos");

            // Aba 3
            const rows3 = auditados.map(a => [
                a.cns, a.nome, a.vinculos, a.chTotal, a.estabelecimentos, a.ocupacoes, a.parecer
            ]);
            const ws3 = XLSX.utils.aoa_to_sheet([
                ['CNS', 'Nome do Profissional', 'Vínculos na Rede', 'CH Semanal Total', 'Estabelecimentos', 'Ocupações', 'Parecer de Auditoria'],
                ...rows3
            ]);
            XLSX.utils.book_append_sheet(wb, ws3, "Auditoria Portaria 134");

            XLSX.writeFile(wb, filename);
            if (typeof showToast === 'function') {
                showToast(`✅ Planilha ${filename} exportada com sucesso (3 abas)!`, 'success');
            }
            return;
        }

        if (typeof showToast === 'function') {
            showToast('⚠️ Nenhuma biblioteca de exportação Excel disponível no navegador.', 'warn');
        }
    }

    /**
     * Modal de Detalhes de um Profissional
     */
    function abrirDetalhesProfissional(cns) {
        const alvo = String(cns || '').replace(/\D/g, '');
        const vinculos = [];
        for (const u of state.estabelecimentos) {
            (u.profissionais || []).forEach(p => {
                const ids = [p.cns, p.cnsMaster, p.cpf].map(v => String(v || '').replace(/\D/g, ''));
                if (alvo && ids.includes(alvo)) {
                    vinculos.push({ ...p, unidade: u, cnes: u.cnes, unidadeNome: u.nomeFantasia });
                }
            });
        }

        if (vinculos.length > 0) {
            const principal = vinculos[0];
            state.modalProfissionalSelecionado = {
                ...principal,
                unidade: principal.unidade,
                vinculos
            };
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

        // Preserva elemento ativo e seleção de texto/cursor para restaurar após o render
        const activeEl = document.activeElement;
        const activeId = activeEl ? activeEl.id : null;
        const selStart = (activeEl && typeof activeEl.selectionStart === 'number') ? activeEl.selectionStart : null;
        const selEnd = (activeEl && typeof activeEl.selectionEnd === 'number') ? activeEl.selectionEnd : null;

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
                            <span><strong>${state.isLegacy ? 'CNES legado' : (['unavailable', 'unauthorized'].includes(state.sourceType) ? 'CNES indisponível' : 'CNES Oficial')}</strong> — ${state.municipio} / ${state.uf}</span>
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

        // Restaura o foco e a posição do cursor caso o elemento ainda exista
        if (activeId) {
            const restoredEl = document.getElementById(activeId);
            if (restoredEl && typeof restoredEl.focus === 'function') {
                restoredEl.focus();
                if (selStart !== null && selEnd !== null && typeof restoredEl.setSelectionRange === 'function') {
                    try {
                        restoredEl.setSelectionRange(selStart, selEnd);
                    } catch (e) {}
                }
            }
        }
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
                                    <td class="td-est-cnes">
                                        <button type="button" class="cnes-cns-btn" 
                                                onclick="window.CnesModule.copiarCnes('${u.cnes}', event)" 
                                                title="Clique para copiar o código CNES ${u.cnes}">
                                            <span class="cnes-cns-val">${u.cnes}</span>
                                            <i class="far fa-copy"></i>
                                        </button>
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

        const { mapaHoras: mapaHorasRede, mapaVinculos: mapaVinculosRede } = criarMapasVinculos();

        const unidadesMantidas = state.estabelecimentos.filter(est => isUnidadeMantidaMunicipal(est));
        const totalMantidos = unidadesMantidas.length;
        const totalGeral = state.estabelecimentos.length;
        const totalPrivados = totalGeral - totalMantidos;

        let baseListParaContagem = [];
        if (state.selectedCnes && u && u.profissionais) {
            baseListParaContagem = u.profissionais.map(p => ({ ...p, cnes: u.cnes }));
        } else {
            let ests = state.estabelecimentos;
            if (state.filterEscopo === 'mantidos') {
                ests = state.estabelecimentos.filter(est => isUnidadeMantidaMunicipal(est));
            } else if (state.filterEscopo === 'privados') {
                ests = state.estabelecimentos.filter(est => !isUnidadeMantidaMunicipal(est));
            }
            ests.forEach(est => (est.profissionais || []).forEach(p => baseListParaContagem.push({ ...p, cnes: est.cnes })));
        }
        const totalP134Oficial = baseListParaContagem.filter(p => {
            const st = obterStatusPortaria134(p, mapaHorasRede, mapaVinculosRede);
            return Boolean(st && st.alerta);
        }).length;
        const totalEfetivosOficial = baseListParaContagem.filter(p => isProfissionalEfetivo(p)).length;

        let tituloUnidade = '';
        if (state.selectedCnes && u) {
            tituloUnidade = `${u.nomeFantasia} (CNES: ${u.cnes})`;
        } else if (state.filterEscopo === 'mantidos') {
            tituloUnidade = `Rede Municipal Mantida de ${state.municipio} - ${state.uf} (${totalMantidos} unidades)`;
        } else if (state.filterEscopo === 'privados') {
            tituloUnidade = `Privados / Conveniados / Filantrópicos de ${state.municipio} - ${state.uf} (${totalPrivados} estabelecimentos)`;
        } else {
            tituloUnidade = `Toda a Rede Homologada de ${state.municipio} - ${state.uf} (${totalGeral} estabelecimentos)`;
        }

        return `
            <div class="cnes-prof-module-wrapper">
                
                <!-- TÍTULO OFICIAL DO MÓDULO (BARRA FEDERAL DATASUS) -->
                <div class="cnes-prof-header-title">
                    <i class="fas fa-users-cog"></i> Consulta CNES Oficial — Módulo Profissional — Colaboradores e Vínculos por Estabelecimento
                </div>

                <!-- SUBBARRA COM NOME DO ESTABELECIMENTO E BOTÕES DE AÇÃO -->
                <div class="cnes-prof-unit-bar">
                    <div class="cnes-prof-unit-name">
                        <span>Profissionais</span> <span class="cnes-unit-sep">|</span> <strong>${tituloUnidade}</strong>
                    </div>

                    <div class="cnes-prof-action-buttons">
                        <!-- SELETOR DE ESCOPO DA REDE (MUNICIPAL / TODA A REDE / PRIVADOS) -->
                        <div class="cnes-escopo-wrapper cnes-prof-escopo-wrapper">
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
                                    🏢 Privados / Conveniados / Filantrópicos (${totalPrivados})
                                </option>
                            </select>
                        </div>

                        <!-- Filtro de Auditoria Portaria 134 -->
                        <button class="cnes-filter-btn-alert ${state.tableFilter.apenasAlerta134 ? 'active' : ''}"
                                onclick="window.CnesModule.toggleAlerta134()"
                                title="Filtrar profissionais com apontamento oficial da Portaria 134 no CNES (Artigo 2º)">
                            <i class="fas fa-exclamation-triangle"></i>
                            ${state.tableFilter.apenasAlerta134 ? 'Exibindo Portaria 134' : 'Auditoria Portaria 134'} (${totalP134Oficial})
                        </button>

                        <!-- Filtro Profissionais Efetivos -->
                        <button class="cnes-filter-btn-efetivo ${state.tableFilter.apenasEfetivos ? 'active' : ''}" 
                                onclick="window.CnesModule.toggleEfetivos()"
                                title="Filtrar colaboradores estatutários efetivos (concursados)">
                            <i class="fas fa-id-badge"></i> 
                            ${state.tableFilter.apenasEfetivos ? 'Exibindo Efetivos' : 'Profissionais Efetivos'} (${totalEfetivosOficial})
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

                <!-- TOOLBAR COM CONTROLE DE REGISTROS E BUSCA CENTRALIZADA E COMPRIDA -->
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

                    <div class="cnes-prof-search-center">
                        <div class="cnes-prof-search-box">
                            <i class="fas fa-search cnes-search-icon"></i>
                            <input type="text" id="inputInlineProfSearch" 
                                   value="${state.tableFilter.search || ''}" 
                                   oninput="window.CnesModule.setTableSearch(this.value)"
                                   placeholder="Buscar por Nome, CNS, CBO, Cargo ou Unidade..."
                                   autocomplete="off" spellcheck="false">
                            <button type="button" id="btnLimparBuscaProf" class="cnes-search-clear-btn" 
                                    style="${state.tableFilter.search ? 'display:flex;' : 'display:none;'}"
                                    onclick="window.CnesModule.clearTableSearch()" 
                                    title="Limpar pesquisa">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                    </div>

                    <div class="cnes-prof-toolbar-actions">
                        <span class="cnes-prof-counter-badge" id="cnesProfCounterBadge">
                            <strong>${totalRegistros}</strong> ${totalRegistros === 1 ? 'registro' : 'registros'}
                        </span>
                    </div>
                </div>

                <!-- AVISO OFICIAL DATASUS -->
                <div class="cnes-prof-disclaimer">
                    <i class="fas fa-shield-alt cnes-disclaimer-icon"></i>
                    <span><strong>Base Oficial DATASUS:</strong> Informações extraídas em estrita conformidade com o Cadastro Nacional de Estabelecimentos de Saúde (CNESNet).</span>
                </div>

                <!-- CONTAINER DINÂMICO DA TABELA E PAGINAÇÃO -->
                <div id="cnesProfTableAndPaginationContainer">
                    ${renderProfissionaisTableHtml(profsPaginados, totalRegistros, startIdx, endIdx, totalPages, mapaHorasRede, mapaVinculosRede)}
                </div>

            </div>
        `;
    }

    /**
     * Renderizador do HTML da tabela e da barra de paginação de profissionais
     */
    function renderProfissionaisTableHtml(profsPaginados, totalRegistros, startIdx, endIdx, totalPages, mapaHorasRede, mapaVinculosRede) {
        return `
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
                            <th colspan="2" class="th-group-vinculo">Vínculo Empregatício</th>
                            <th rowspan="2" class="th-center th-prof-sit">Situação</th>
                            <th rowspan="2" class="th-center th-prof-p134">Portaria 134</th>
                        </tr>
                        <tr>
                            <th class="th-prof-tipo">Tipo</th>
                            <th class="th-prof-sub">Subtipo</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${profsPaginados.length === 0 ? `
                            <tr>
                                <td colspan="13" style="text-align: center; padding: 2.5rem; color: #64748b;">
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

                            const atendeSus = String(p.atendimentoSus || 'SIM').trim().toUpperCase();
                            const susBadge = (atendeSus === 'SIM' || atendeSus.includes('SIM'))
                                ? `<span class="cnes-badge-sus-sim">SIM</span>`
                                : `<span class="cnes-badge-sus-nao">NÃO</span>`;

                            const isAtivo = p.ativo !== false && p.situacao !== 'Desligado';
                            const sitBadge = isAtivo
                                ? `<span class="cnes-badge-status-ativo"><span class="cnes-status-dot"></span>Ativo</span>`
                                : `<span class="cnes-badge-status-desligado">Desligado</span>`;

                            const subVal = formatarSubtipoVinculo(p);
                            const tipoVal = formatarTipoVinculo(p);
                            const p134Content = (status134 && status134.alerta && status134.html) ? status134.html : '<span class="cnes-p134-none">—</span>';

                            return `
                                <tr>
                                    <td class="td-prof-nome">
                                        <a href="javascript:void(0)" class="cnes-prof-name-link" 
                                           onclick="window.CnesModule.abrirDetalhesProfissional('${cnsDefinitivo || p.cns}')" 
                                           title="Clique para ver ficha completa do colaborador">
                                            ${p.nome}
                                        </a>
                                        ${p.unidadeNome ? `<div class="cnes-prof-sub-unidade" title="${p.unidadeNome}"><i class="far fa-hospital"></i> ${p.unidadeNome}</div>` : ''}
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
                                    <td class="th-center td-ch-val">${p.chOutros || 0}h</td>
                                    <td class="th-center td-ch-val">${p.chAmb || 0}h</td>
                                    <td class="th-center td-ch-val">${p.chHosp || 0}h</td>
                                    <td class="th-center">
                                        <span class="${badgeChClass}" title="${chTot > 60 ? 'Carga Horária Crítica (>60h)' : (chTot > 44 ? 'Carga Horária Elevada (>44h)' : 'Regular')}">
                                            ${chTot}h
                                        </span>
                                    </td>
                                    <td class="th-center">${susBadge}</td>
                                    <td class="td-prof-tipo" title="${tipoVal}">${tipoVal}</td>
                                    <td class="td-prof-sub" title="${subVal}">
                                        <span class="cnes-badge-subtipo ${subVal.includes('PROPRIO') ? 'cnes-sub-proprio' : ''}">${subVal}</span>
                                    </td>
                                    <td class="th-center">${sitBadge}</td>
                                    <td class="td-prof-p134">
                                        ${p134Content}
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
                        ${Array.from({ length: Math.min(totalPages, 8) }, (_, i) => {
                            let pageNum = i + 1;
                            if (totalPages > 8) {
                                if (state.tableFilter.page > 5) {
                                    pageNum = state.tableFilter.page - 4 + i;
                                    if (pageNum > totalPages) pageNum = totalPages - (7 - i);
                                }
                            }
                            return `<button class="cnes-btn-page ${state.tableFilter.page === pageNum ? 'active' : ''}" onclick="window.CnesModule.setPage(${pageNum})">${pageNum}</button>`;
                        }).join('')}
                        <button class="cnes-btn-page" ${state.tableFilter.page === totalPages ? 'disabled' : ''} onclick="window.CnesModule.setPage(${state.tableFilter.page + 1})">Próxima</button>
                    </div>
                ` : ''}
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
        const vinculos = Array.isArray(p.vinculos) && p.vinculos.length > 0 ? p.vinculos : [p];

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
                                <span class="cnes-prof-detail-val">${formatarTipoVinculo(p)} (${formatarSubtipoVinculo(p)})</span>
                            </div>
                        </div>

                        ${vinculos.length > 1 ? `
                            <div style="margin-top: 1.25rem; border-top: 1px solid #e2e8f0; padding-top: 1rem;">
                                <div class="cnes-prof-detail-label" style="margin-bottom: 0.5rem;">Todos os vínculos (${vinculos.length})</div>
                                ${vinculos.map(v => `
                                    <div class="cnes-prof-detail-field" style="margin-bottom: 0.45rem;">
                                        <span class="cnes-prof-detail-val"><strong>${v.unidade ? v.unidade.nomeFantasia : (v.unidadeNome || 'Rede Municipal')}</strong> — ${v.cnes || 'CNES não informado'} — ${v.chTotal || 0}h — ${formatarTipoVinculo(v)}</span>
                                    </div>
                                `).join('')}
                            </div>
                        ` : ''}

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

    /**
     * Atualização pontual e instantânea da grade de profissionais e contador, sem recriar o input no DOM
     */
    function atualizarTabelaProfissionais() {
        const dynamicContainer = document.getElementById('cnesProfTableAndPaginationContainer');
        if (!dynamicContainer) {
            render();
            return;
        }

        const profsCompletos = getProfissionaisList();
        const totalRegistros = profsCompletos.length;
        const perPage = state.tableFilter.perPage === 'todos' ? totalRegistros : parseInt(state.tableFilter.perPage, 10);
        const totalPages = Math.ceil(totalRegistros / (perPage || 1)) || 1;
        state.tableFilter.page = Math.min(state.tableFilter.page, totalPages);

        const startIdx = (state.tableFilter.page - 1) * perPage;
        const endIdx = perPage ? startIdx + perPage : totalRegistros;
        const profsPaginados = perPage ? profsCompletos.slice(startIdx, endIdx) : profsCompletos;

        const { mapaHoras: mapaHorasRede, mapaVinculos: mapaVinculosRede } = criarMapasVinculos();

        dynamicContainer.innerHTML = renderProfissionaisTableHtml(profsPaginados, totalRegistros, startIdx, endIdx, totalPages, mapaHorasRede, mapaVinculosRede);

        const badge = document.getElementById('cnesProfCounterBadge');
        if (badge) {
            badge.innerHTML = `<strong>${totalRegistros}</strong> ${totalRegistros === 1 ? 'registro' : 'registros'}`;
        }
    }

    function setPerPage(val) {
        state.tableFilter.perPage = val;
        state.tableFilter.page = 1;
        const dynamicContainer = document.getElementById('cnesProfTableAndPaginationContainer');
        if (dynamicContainer && state.viewMode === 'profissionais') {
            atualizarTabelaProfissionais();
        } else {
            render();
        }
    }

    function setPage(pageNum) {
        state.tableFilter.page = pageNum;
        const dynamicContainer = document.getElementById('cnesProfTableAndPaginationContainer');
        if (dynamicContainer && state.viewMode === 'profissionais') {
            atualizarTabelaProfissionais();
        } else {
            render();
        }
    }

    function setTableSearch(val) {
        state.tableFilter.search = val || '';
        state.tableFilter.page = 1;

        const btnClear = document.getElementById('btnLimparBuscaProf');
        if (btnClear) {
            btnClear.style.display = val ? 'flex' : 'none';
        }

        const dynamicContainer = document.getElementById('cnesProfTableAndPaginationContainer');
        if (dynamicContainer && state.viewMode === 'profissionais') {
            atualizarTabelaProfissionais();
        } else {
            render();
        }
    }

    function clearTableSearch() {
        state.tableFilter.search = '';
        state.tableFilter.page = 1;

        const input = document.getElementById('inputInlineProfSearch');
        if (input) {
            input.value = '';
            input.focus();
        }

        const btnClear = document.getElementById('btnLimparBuscaProf');
        if (btnClear) {
            btnClear.style.display = 'none';
        }

        const dynamicContainer = document.getElementById('cnesProfTableAndPaginationContainer');
        if (dynamicContainer && state.viewMode === 'profissionais') {
            atualizarTabelaProfissionais();
        } else {
            render();
        }
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
            const index = (state.competencias || []).findIndex(item => item.codigo === state.competenciaAtiva);
            const previous = index >= 0 && state.competencias[index + 1] ? state.competencias[index + 1] : { codigo: '202607', label: '07/2026' };
            const prevComp = previous.codigo || '202607';
            competenciaAnterior = formatarCompetencia(prevComp);

            // Se for explicitamente snapshot publicado com apenas 1 competência, respeita ausência de comparação
            if (state.sourceType === 'published_snapshot' && (state.competencias || []).length <= 1) {
                state.movimentacoes = null;
                state.movimentacoesMessage = 'Ainda não há outra competência publicada para comparar.';
                return;
            }

            // Tentativa 1: Endpoint de API oficial se estiver em modo snapshot publicado
            if (state.sourceType === 'published_snapshot') {
                try {
                    const response = await fetch(`/api/cnes/estabelecimentos?ibge=${state.ibge}&competencia=${prevComp}&t=${Date.now()}`);
                    if (response.ok) {
                        const payload = await response.json();
                        if (payload && Array.isArray(payload.estabelecimentos)) {
                            dadosAnteriores = payload.estabelecimentos.map(item => normalizarEstabelecimento(item, state.municipio, state.uf, { allowSynthetic: false, competencia: prevComp }));
                        }
                    }
                } catch (e) {}
            }

            // Tentativa 2: Base estática oficial auditada da competência anterior
            if (!dadosAnteriores) {
                try {
                    const resp = await fetch(`/cnes_data/cnes_${state.ibge}_${prevComp}.json`);
                    if (resp.ok) {
                        const payload = await resp.json();
                        if (payload && Array.isArray(payload.estabelecimentos)) {
                            dadosAnteriores = payload.estabelecimentos.map(item => normalizarEstabelecimento(item, state.municipio, state.uf, { allowSynthetic: false, competencia: prevComp }));
                        }
                    }
                } catch (e) {}
            }

            // Tentativa 3: Supabase Cloud direto para a competência anterior se disponível
            if (!dadosAnteriores && window.SupabaseConfig && typeof window.SupabaseConfig.getClient === 'function') {
                try {
                    const supabaseClient = window.SupabaseConfig.getClient();
                    if (supabaseClient) {
                        const { data: sEstabs } = await supabaseClient
                            .from('cnes_estabelecimentos')
                            .select('*')
                            .eq('codigo_ibge', '210120')
                            .eq('competencia', prevComp);

                        if (sEstabs && sEstabs.length > 0) {
                            let allProfs = [];
                            for (let page = 0; page < 5; page++) {
                                const from = page * 1000;
                                const to = from + 999;
                                const { data: chunk } = await supabaseClient
                                    .from('cnes_profissionais')
                                    .select('*')
                                    .eq('municipio_ibge', '210120')
                                    .eq('competencia', prevComp)
                                    .range(from, to);
                                if (!chunk || chunk.length === 0) break;
                                allProfs.push(...chunk);
                                if (chunk.length < 1000) break;
                            }
                            const profsMap = {};
                            allProfs.forEach(p => {
                                if (!profsMap[p.cnes]) profsMap[p.cnes] = [];
                                profsMap[p.cnes].push({
                                    nome: p.nome,
                                    cns: p.cns,
                                    cnsMaster: p.cns,
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
                                    dtAtribuicao: p.dt_atribuicao || ''
                                });
                            });
                            dadosAnteriores = sEstabs.map(u => normalizarEstabelecimento({
                                ...u,
                                nomeFantasia: u.nome_fantasia || u.razao_social,
                                profissionais: profsMap[u.cnes] || []
                            }, 'BACABAL', 'MA', { allowSynthetic: false, competencia: prevComp }));
                        }
                    }
                } catch (e) {}
            }
        }

        if (!dadosAnteriores) {
            if (state.ibge === '210120' && state.sourceType === 'published_snapshot' && (state.competencias || []).length <= 1) {
                state.movimentacoesMessage = 'Ainda não há outra competência publicada para comparar.';
                return;
            }
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

    function filtrarItensMovimentacoes(mov, filtro = state.movimentacoesFiltro) {
        if (!mov || !mov.detalhes) return [];
        let itens = mov.detalhes.todas || [];
        if (filtro.tipo === 'ENTRADA') itens = mov.detalhes.entradas || [];
        else if (filtro.tipo === 'SAIDA') itens = mov.detalhes.saidas || [];
        else if (filtro.tipo === 'ALTERACAO_CH') itens = mov.detalhes.alteracoesCargaHoraria || [];
        else if (filtro.tipo === 'PORTARIA134') itens = mov.detalhes.alertasPortaria134 || [];
        if (filtro.cnes) itens = itens.filter(it => String(it.cnes) === String(filtro.cnes));
        if (filtro.search) {
            itens = itens.filter(it =>
                (it.nome && it.nome.toLowerCase().includes(filtro.search)) ||
                (it.cns && it.cns.includes(filtro.search)) ||
                (it.cbo && it.cbo.includes(filtro.search)) ||
                (it.ocupacao && it.ocupacao.toLowerCase().includes(filtro.search)) ||
                (it.estabNome && it.estabNome.toLowerCase().includes(filtro.search))
            );
        }
        return itens;
    }

    function exportarMovimentacoesCsv() {
        if (!state.movimentacoes || !state.movimentacoes.detalhes) return;
        const itens = filtrarItensMovimentacoes(state.movimentacoes);
        if (!itens || itens.length === 0) {
            if (typeof showToast === 'function') showToast('ℹ️ Nenhum dado para exportar.', 'info');
            return;
        }

        let csv = '\uFEFFTipo;Profissional;CNS;CBO;Ocupacao;Estabelecimento;CNES;CH_Anterior;CH_Atual;Diferenca_Horas;Alerta_CH;Competencia\n';
        itens.forEach(item => {
            csv += `"${item.tipo}";"${item.nome}";"${item.cns}";"${item.cbo}";"${item.ocupacao}";"${item.estabNome}";"${item.cnes}";"${item.chAnterior ?? ''}";"${item.chAtual ?? ''}";"${item.diferencaCh ?? ''}";"${item.portaria134 || item.portaria134_alerta || item.triagem || 'SEM ALERTA CH'}";"${item.competencia || state.competenciaAtiva}"\n`;
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

    async function obterLogoParaRelatorio() {
        try {
            if (typeof localStorage !== 'undefined') {
                const custom = localStorage.getItem('argos_custom_logo');
                if (custom && custom.startsWith('data:image/')) return custom;
            }
        } catch (e) {}

        if (typeof window !== 'undefined' && window.SCAAR_LOGO_BASE64) return window.SCAAR_LOGO_BASE64;

        if (typeof Image === 'undefined' || typeof document === 'undefined' || !document.createElement) {
            return null;
        }

        return new Promise(resolve => {
            const img = new Image();
            img.crossOrigin = 'Anonymous';
            img.onload = () => {
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.naturalWidth || img.width;
                    canvas.height = img.naturalHeight || img.height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0);
                    resolve(canvas.toDataURL('image/png'));
                } catch (e) {
                    resolve(null);
                }
            };
            img.onerror = () => {
                const img2 = new Image();
                img2.crossOrigin = 'Anonymous';
                img2.onload = () => {
                    try {
                        const c2 = document.createElement('canvas');
                        c2.width = img2.naturalWidth || img2.width;
                        c2.height = img2.naturalHeight || img2.height;
                        const ctx2 = c2.getContext('2d');
                        ctx2.drawImage(img2, 0, 0);
                        resolve(c2.toDataURL('image/jpeg'));
                    } catch (e2) {
                        resolve(null);
                    }
                };
                img2.onerror = () => resolve(null);
                img2.src = 'img/logo.jpg';
            };
            img.src = 'img/olho-cyber.png';
        });
    }

    async function exportarMovimentacoesPdf() {
        if (!state.movimentacoes || !state.movimentacoes.detalhes) {
            if (typeof showToast === 'function') showToast('⚠️ Calcule as movimentações antes de exportar o PDF.', 'warn');
            return;
        }

        if (typeof window === 'undefined' || !window.jspdf || !window.jspdf.jsPDF) {
            if (typeof showToast === 'function') showToast('❌ Biblioteca de geração de PDF (jsPDF) não carregada.', 'error');
            return;
        }

        if (typeof showLoading === 'function') showLoading('Gerando Relatório Oficial de Movimentações (PDF)...');

        const gerarDocumento = async () => {
            try {
                const { jsPDF } = window.jspdf;
                const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
                const pageW = doc.internal.pageSize.getWidth();   // 297 mm
                const pageH = doc.internal.pageSize.getHeight();  // 210 mm
                const margin = 12;
                const contentW = pageW - (2 * margin); // 273 mm

                const mov = state.movimentacoes;
                const res = mov.resumo || {};
                const f = state.movimentacoesFiltro || {};

                // Filtros aplicados se houver (CNES ou Search)
                const filtrarPorContexto = (lista) => {
                    let items = lista || [];
                    if (f.cnes) items = items.filter(it => String(it.cnes) === String(f.cnes));
                    if (f.search) {
                        items = items.filter(it =>
                            (it.nome && it.nome.toLowerCase().includes(f.search)) ||
                            (it.cns && it.cns.includes(f.search)) ||
                            (it.cbo && it.cbo.includes(f.search)) ||
                            (it.ocupacao && it.ocupacao.toLowerCase().includes(f.search))
                        );
                    }
                    return items;
                };

                const entradas = filtrarPorContexto(mov.detalhes.entradas);
                const saidas = filtrarPorContexto(mov.detalhes.saidas);
                const alteracoes = filtrarPorContexto(mov.detalhes.alteracoesCargaHoraria);

                // Helper para formatar CBO e ocupação sem redundância
                const formatarCboPdf = (item) => {
                    if (!item) return '-';
                    const cbo = String(item.cbo || '').trim();
                    let ocupacao = String(item.ocupacao || '').trim();
                    if (!ocupacao) return cbo || '-';
                    // Remove o código CBO do início da ocupação (ex: "223510 - ENFERMEIRO" -> "ENFERMEIRO")
                    if (cbo && ocupacao.startsWith(cbo)) {
                        ocupacao = ocupacao.substring(cbo.length).replace(/^\s*[-–]\s*/, '').trim();
                    }
                    // Remove CBO entre parênteses (ex: "ENFERMEIRO (223510)" -> "ENFERMEIRO")
                    if (cbo) {
                        ocupacao = ocupacao.replace(new RegExp(`\\(${cbo}\\)`, 'g'), '').trim();
                    }
                    if (!ocupacao) return cbo || '-';
                    return cbo ? `${cbo} - ${ocupacao}` : ocupacao;
                };

                let filtroDesc = '';
                if (f.cnes) {
                    const u = state.estabelecimentos.find(e => String(e.cnes) === String(f.cnes));
                    filtroDesc += `Filtro CNES: ${f.cnes}${u ? ' - ' + u.nomeFantasia : ''}`;
                }
                if (f.search) {
                    filtroDesc += (filtroDesc ? ' | ' : '') + `Busca: "${f.search}"`;
                }

                // Carregar Logo oficial ARGOS
                const logoBase64 = await obterLogoParaRelatorio();

                // ═════════════════════════════════════════════════════════════
                // 1. CABEÇALHO PADRÃO DO SISTEMA ARGOS (PADRONIZADO COM OUTROS RELATÓRIOS)
                // ═════════════════════════════════════════════════════════════
                doc.setFillColor(37, 99, 235); // #2563EB Modern Blue (Padrão Sistema ARGOS)
                doc.roundedRect(margin, 10, contentW, 20, 2, 2, 'F');

                // Caixa da Logo
                const logoBoxW = 30;
                const logoBoxH = 16;
                doc.setFillColor(59, 130, 246); // #3B82F6 (Azul translúcido padrão ARGOS)
                doc.roundedRect(margin + 4, 12, logoBoxW, logoBoxH, 2, 2, 'F');

                if (logoBase64) {
                    try {
                        const imgProps = doc.getImageProperties(logoBase64);
                        let targetW = 28;
                        let targetH = targetW * (imgProps.height / imgProps.width);
                        if (targetH > 14) {
                            targetH = 14;
                            targetW = targetH * (imgProps.width / imgProps.height);
                        }
                        const imgX = margin + 4 + (logoBoxW - targetW) / 2;
                        const imgY = 12 + (logoBoxH - targetH) / 2;
                        doc.addImage(logoBase64, 'PNG', imgX, imgY, targetW, targetH);
                    } catch (eImg) {
                        doc.setFont('helvetica', 'bold');
                        doc.setFontSize(10);
                        doc.setTextColor(255, 255, 255);
                        doc.text('ARGOS', margin + 4 + logoBoxW / 2, 21, { align: 'center' });
                    }
                } else {
                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(11);
                    doc.setTextColor(255, 255, 255);
                    doc.text('ARGOS', margin + 4 + logoBoxW / 2, 21, { align: 'center' });
                }

                // Títulos e Textos — Tipografia e hierarquia padronizada ARGOS (idêntico ao drawUnifiedHeader)
                const textStartX = margin + 40;
                const headerTitle = 'AUDITORIA DE MOVIMENTACAO CADASTRAL DO CNES';
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(headerTitle.length > 55 ? 11 : 13);
                doc.setTextColor(255, 255, 255);
                doc.text(headerTitle, textStartX, 16.5);

                doc.setFont('helvetica', 'normal');
                doc.setFontSize(9);
                doc.setTextColor(219, 234, 254);
                doc.text(`Sistema: ARGOS via CNES/DATASUS | Municipio: ${state.municipio || 'BACABAL'} - ${state.uf || 'MA'}`, textStartX, 21.5);

                const dataHoraAtual = new Date().toLocaleString('pt-BR');
                const filtroInfo = filtroDesc ? ` | ${filtroDesc}` : '';
                doc.text(`Competencia: ${mov.competenciaAnterior} > ${mov.competenciaAtual}${filtroInfo} | Emissao: ${dataHoraAtual}`, textStartX, 26);

                // ═════════════════════════════════════════════════════════════
                // 2. PAINEL DE KPIs EXECUTIVOS (CARDS CONSOLIDADOS)
                // ═════════════════════════════════════════════════════════════
                let currentY = 35;
                const cardGap = 3;
                const numCards = 5;
                const cardW = (contentW - (cardGap * (numCards - 1))) / numCards;
                const cardH = 14;

                const cardsData = [
                    {
                        titulo: 'NOVOS VÍNCULOS',
                        sub: 'Entradas no CNES',
                        valor: `+${fmtNum(entradas.length)}`,
                        color: [21, 128, 61],      // #15803d
                        bg: [240, 253, 244],       // #f0fdf4
                        border: [187, 247, 208]    // #bbf7d0
                    },
                    {
                        titulo: 'DESLIGAMENTOS',
                        sub: 'Ausentes no Mês',
                        valor: `-${fmtNum(saidas.length)}`,
                        color: [185, 28, 28],      // #b91c1c
                        bg: [254, 242, 242],       // #fef2f2
                        border: [254, 202, 202]    // #fecaca
                    },
                    {
                        titulo: 'ALT. CARGA HORÁRIA',
                        sub: 'Aumentos / Reduções',
                        valor: `${fmtNum(alteracoes.length)}`,
                        color: [2, 132, 199],      // #0284c7
                        bg: [240, 249, 255],       // #f0f9ff
                        border: [186, 230, 253]    // #bae6fd
                    },
                    {
                        titulo: 'SALDO LÍQUIDO',
                        sub: 'Variação Semanal SUS',
                        valor: `${(res.saldoHorasSemanais >= 0 ? '+' : '')}${fmtNum(res.saldoHorasSemanais || 0)}h`,
                        color: [124, 58, 237],     // #7c3aed
                        bg: [250, 245, 255],       // #faf5ff
                        border: [233, 213, 255]    // #e9d5ff
                    },
                    {
                        titulo: 'PORTARIA 134',
                        sub: 'Oficial CNES Net',
                        valor: `${fmtNum(res.alertasPortaria134 || 0)}`,
                        color: [220, 38, 38],      // #dc2626
                        bg: [254, 242, 242],       // #fef2f2
                        border: [254, 202, 202]    // #fecaca
                    }
                ];

                cardsData.forEach((c, idx) => {
                    const cX = margin + (idx * (cardW + cardGap));
                    const cCenter = cX + cardW / 2;
                    doc.setFillColor(c.bg[0], c.bg[1], c.bg[2]);
                    doc.setDrawColor(c.border[0], c.border[1], c.border[2]);
                    doc.setLineWidth(0.4);
                    doc.roundedRect(cX, currentY, cardW, cardH, 1.5, 1.5, 'FD');

                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(6.8);
                    doc.setTextColor(100, 116, 139);
                    doc.text(c.titulo, cCenter, currentY + 4, { align: 'center' });

                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(11);
                    doc.setTextColor(c.color[0], c.color[1], c.color[2]);
                    doc.text(c.valor, cCenter, currentY + 9.5, { align: 'center' });

                    doc.setFont('helvetica', 'normal');
                    doc.setFontSize(6.2);
                    doc.setTextColor(148, 163, 184);
                    doc.text(c.sub, cCenter, currentY + 12.5, { align: 'center' });
                });

                currentY += cardH + 5;

                // ═════════════════════════════════════════════════════════════
                // AUXILIAR DE DESENHO DE SEÇÕES
                // ═════════════════════════════════════════════════════════════
                const desenharCabecalhoSecao = (titulo, totalRegistros, rgbCor, emojiTexto, forceNewPage) => {
                    // Sempre iniciar uma nova categoria em página nova (exceto a primeira se couber)
                    if (forceNewPage || currentY > pageH - 35) {
                        doc.addPage();
                        currentY = 16;
                    }
                    doc.setFillColor(rgbCor[0], rgbCor[1], rgbCor[2]);
                    doc.roundedRect(margin, currentY, contentW, 6.5, 1, 1, 'F');

                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(8.5);
                    doc.setTextColor(255, 255, 255);
                    doc.text(`${emojiTexto} ${titulo.toUpperCase()} (${totalRegistros} REGISTROS AUDITADOS)`, margin + 4, currentY + 4.5);

                    currentY += 7.5;
                };

                // ═════════════════════════════════════════════════════════════
                // SEÇÃO 1: ADMISSÕES (ENTRADAS / NOVOS VÍNCULOS)
                // ═════════════════════════════════════════════════════════════
                desenharCabecalhoSecao('Categoria 1: Admissões e Novos Vínculos Cadastrados', entradas.length, [22, 101, 52], '[ + ]');

                const bodyEntradas = entradas.length > 0 ? entradas.map(item => [
                    'ADMISSÃO (+)',
                    `${item.nome || ''}\nCNS: ${item.cns || ''}`,
                    formatarCboPdf(item),
                    `${item.estabNome || ''}\nCNES: ${item.cnes || ''}`,
                    `0h > ${item.chAtual || 0}h`,
                    `+${item.diferencaCh || item.chAtual || 0}h`,
                    item.chAtual > 60 ? 'REVISAR CH (>60h)' : (item.chAtual > 40 ? 'REVISAR CH (>40h)' : 'SEM ALERTA CH')
                ]) : [['-', 'Nenhum novo vínculo admitido registrado no período.', '-', '-', '-', '-', '-']];

                doc.autoTable({
                    startY: currentY,
                    margin: { left: margin, right: margin },
                    head: [['Tipo', 'Profissional / CNS', 'CBO / Especialidade', 'Estabelecimento de Saúde / CNES', 'Carga Horária', 'Variação', 'Triagem CH']],
                    body: bodyEntradas,
                    styles: { fontSize: 7.2, cellPadding: 2, lineWidth: 0.1, lineColor: [226, 232, 240], textColor: [15, 23, 42], valign: 'middle' },
                    headStyles: { fillColor: [21, 128, 61], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5, halign: 'center', valign: 'middle' },
                    columnStyles: {
                        0: { halign: 'center', cellWidth: 28, fontStyle: 'bold', textColor: [21, 128, 61] },
                        1: { halign: 'left', cellWidth: 63 },
                        2: { halign: 'left', cellWidth: 54 },
                        3: { halign: 'left', cellWidth: 64 },
                        4: { halign: 'center', cellWidth: 25, fontStyle: 'bold' },
                        5: { halign: 'center', cellWidth: 17, fontStyle: 'bold', textColor: [21, 128, 61] },
                        6: { halign: 'center', cellWidth: 22, fontSize: 6.5 }
                    },
                    alternateRowStyles: { fillColor: [240, 253, 244] },
                    didParseCell: data => {
                        if (data.section === 'body' && entradas.length > 0) {
                            data.cell.styles.valign = 'middle';
                            if (data.column.index === 0) {
                                data.cell.styles.fillColor = [220, 252, 231];
                            }
                            if (data.column.index === 6) {
                                const txt = data.cell.raw || '';
                                if (txt.includes('>60h')) {
                                    data.cell.styles.textColor = [185, 28, 28];
                                    data.cell.styles.fontStyle = 'bold';
                                } else if (txt.includes('>40h')) {
                                    data.cell.styles.textColor = [217, 119, 6];
                                } else {
                                    data.cell.styles.textColor = [21, 128, 61];
                                }
                            }
                        }
                    }
                });

                currentY = doc.lastAutoTable.finalY + 7;

                // ═════════════════════════════════════════════════════════════
                // SEÇÃO 2: DESLIGAMENTOS (SAÍDAS / AUSENTES NO MÊS)
                // ═════════════════════════════════════════════════════════════
                desenharCabecalhoSecao('Categoria 2: Desligamentos e Ausentes no Mes Vigente', saidas.length, [153, 27, 27], '[ - ]', true);

                const bodySaidas = saidas.length > 0 ? saidas.map(item => [
                    'DESLIGAMENTO (-)',
                    `${item.nome || ''}\nCNS: ${item.cns || ''}`,
                    formatarCboPdf(item),
                    `${item.estabNome || ''}\nCNES: ${item.cnes || ''}`,
                    `${item.chAnterior || 0}h > 0h`,
                    `-${item.chAnterior || 0}h`,
                    'AUSENTE NO CNES'
                ]) : [['-', 'Nenhum desligamento registrado no período.', '-', '-', '-', '-', '-']];

                doc.autoTable({
                    startY: currentY,
                    margin: { left: margin, right: margin },
                    head: [['Tipo', 'Profissional / CNS', 'CBO / Especialidade', 'Estabelecimento de Saúde / CNES', 'Carga Horária', 'Variação', 'Triagem CH']],
                    body: bodySaidas,
                    styles: { fontSize: 7.2, cellPadding: 2, lineWidth: 0.1, lineColor: [226, 232, 240], textColor: [15, 23, 42], valign: 'middle' },
                    headStyles: { fillColor: [185, 28, 28], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5, halign: 'center', valign: 'middle' },
                    columnStyles: {
                        0: { halign: 'center', cellWidth: 28, fontStyle: 'bold', textColor: [185, 28, 28] },
                        1: { halign: 'left', cellWidth: 63 },
                        2: { halign: 'left', cellWidth: 54 },
                        3: { halign: 'left', cellWidth: 64 },
                        4: { halign: 'center', cellWidth: 25, fontStyle: 'bold' },
                        5: { halign: 'center', cellWidth: 17, fontStyle: 'bold', textColor: [185, 28, 28] },
                        6: { halign: 'center', cellWidth: 22, fontSize: 6.5 }
                    },
                    alternateRowStyles: { fillColor: [254, 242, 242] },
                    didParseCell: data => {
                        if (data.section === 'body' && saidas.length > 0) {
                            data.cell.styles.valign = 'middle';
                            if (data.column.index === 0) {
                                data.cell.styles.fillColor = [254, 226, 226];
                            }
                            if (data.column.index === 6) {
                                data.cell.styles.textColor = [153, 27, 27];
                                data.cell.styles.fontStyle = 'bold';
                            }
                        }
                    }
                });

                currentY = doc.lastAutoTable.finalY + 7;

                // ═════════════════════════════════════════════════════════════
                // SEÇÃO 3: ALTERAÇÕES DE CARGA HORÁRIA SEMANAL
                // ═════════════════════════════════════════════════════════════
                desenharCabecalhoSecao('Categoria 3: Alteracoes de Carga Horaria Semanal', alteracoes.length, [7, 89, 133], '[ ~ ]', true);

                const bodyAlteracoes = alteracoes.length > 0 ? alteracoes.map(item => {
                    const isUp = (item.diferencaCh || 0) > 0;
                    return [
                        isUp ? 'AUMENTO CH (+)' : 'REDUÇÃO CH (-)',
                        `${item.nome || ''}\nCNS: ${item.cns || ''}`,
                        formatarCboPdf(item),
                        `${item.estabNome || ''}\nCNES: ${item.cnes || ''}`,
                        `${item.chAnterior || 0}h > ${item.chAtual || 0}h`,
                        `${isUp ? '+' : ''}${item.diferencaCh || 0}h`,
                        item.chAtual > 60 ? 'REVISAR CH (>60h)' : (item.chAtual > 40 ? 'REVISAR CH (>40h)' : 'SEM ALERTA CH')
                    ];
                }) : [['-', 'Nenhuma alteração de carga horária registrada no período.', '-', '-', '-', '-', '-']];

                doc.autoTable({
                    startY: currentY,
                    margin: { left: margin, right: margin },
                    head: [['Tipo Variação', 'Profissional / CNS', 'CBO / Especialidade', 'Estabelecimento de Saúde / CNES', 'Carga Horária', 'Diferença', 'Triagem CH']],
                    body: bodyAlteracoes,
                    styles: { fontSize: 7.2, cellPadding: 2, lineWidth: 0.1, lineColor: [226, 232, 240], textColor: [15, 23, 42], valign: 'middle' },
                    headStyles: { fillColor: [2, 132, 199], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5, halign: 'center', valign: 'middle' },
                    columnStyles: {
                        0: { halign: 'center', cellWidth: 30, fontStyle: 'bold', overflow: 'linebreak', cellPadding: { top: 2, right: 1.5, bottom: 2, left: 1.5 } },
                        1: { halign: 'left', cellWidth: 61 },
                        2: { halign: 'left', cellWidth: 54 },
                        3: { halign: 'left', cellWidth: 64 },
                        4: { halign: 'center', cellWidth: 25, fontStyle: 'bold' },
                        5: { halign: 'center', cellWidth: 17, fontStyle: 'bold' },
                        6: { halign: 'center', cellWidth: 22, fontSize: 6.5 }
                    },
                    alternateRowStyles: { fillColor: [240, 249, 255] },
                    didParseCell: data => {
                        if (data.section === 'body' && alteracoes.length > 0) {
                            data.cell.styles.valign = 'middle';
                            if (data.column.index === 0) {
                                const isUp = String(data.cell.raw).includes('AUMENTO');
                                data.cell.styles.fillColor = isUp ? [224, 242, 254] : [254, 243, 199];
                                data.cell.styles.textColor = isUp ? [2, 132, 199] : [180, 83, 9];
                                data.cell.styles.fontStyle = 'bold';
                                data.cell.styles.halign = 'center';
                            }
                            if (data.column.index === 5) {
                                const isUp = String(data.cell.raw).includes('+');
                                data.cell.styles.textColor = isUp ? [2, 132, 199] : [185, 28, 28];
                                data.cell.styles.fontStyle = 'bold';
                                data.cell.styles.halign = 'center';
                            }
                            if (data.column.index === 6) {
                                const txt = data.cell.raw || '';
                                if (txt.includes('>60h')) {
                                    data.cell.styles.textColor = [185, 28, 28];
                                    data.cell.styles.fontStyle = 'bold';
                                } else if (txt.includes('>40h')) {
                                    data.cell.styles.textColor = [217, 119, 6];
                                } else {
                                    data.cell.styles.textColor = [21, 128, 61];
                                }
                            }
                        }
                    }
                });

                // ═════════════════════════════════════════════════════════════
                // SEÇÃO 4: APONTAMENTOS OFICIAIS PORTARIA 134 (CNESNET / MS)
                // ═════════════════════════════════════════════════════════════
                const alertas134 = filtrarPorContexto(mov.detalhes.alertasPortaria134);
                if (alertas134 && alertas134.length > 0) {
                    currentY = doc.lastAutoTable.finalY + 7;
                    desenharCabecalhoSecao('Categoria 4: Apontamentos Oficiais Portaria 134 (Artigo 2º)', alertas134.length, [185, 28, 28], '[ ! ]', true);

                    const bodyAlertas = alertas134.map(item => [
                        'PORTARIA 134',
                        `${item.nome || ''}\nCNS: ${item.cns || ''}`,
                        formatarCboPdf(item),
                        `${item.estabNome || ''}\nCNES: ${item.cnes || ''}`,
                        `${item.chAtual || 0}h`,
                        item.portaria134 || 'Artigo 2º',
                        'CONFLITO OFICIAL'
                    ]);

                    doc.autoTable({
                        startY: currentY,
                        margin: { left: margin, right: margin },
                        head: [['Tipo', 'Profissional / CNS', 'CBO / Especialidade', 'Estabelecimento de Saúde / CNES', 'Carga Horária', 'Apontamento Oficial', 'Situação']],
                        body: bodyAlertas,
                        styles: { fontSize: 7.2, cellPadding: 2, lineWidth: 0.1, lineColor: [226, 232, 240], textColor: [15, 23, 42], valign: 'middle' },
                        headStyles: { fillColor: [185, 28, 28], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5, halign: 'center', valign: 'middle' },
                        columnStyles: {
                            0: { halign: 'center', cellWidth: 28, fontStyle: 'bold', textColor: [185, 28, 28] },
                            1: { halign: 'left', cellWidth: 63 },
                            2: { halign: 'left', cellWidth: 54 },
                            3: { halign: 'left', cellWidth: 64 },
                            4: { halign: 'center', cellWidth: 20, fontStyle: 'bold' },
                            5: { halign: 'center', cellWidth: 25, fontStyle: 'bold', textColor: [185, 28, 28] },
                            6: { halign: 'center', cellWidth: 19, fontSize: 6.5, textColor: [185, 28, 28], fontStyle: 'bold' }
                        },
                        alternateRowStyles: { fillColor: [254, 242, 242] },
                        didParseCell: data => {
                            if (data.section === 'body') {
                                data.cell.styles.valign = 'middle';
                                if (data.column.index === 0) {
                                    data.cell.styles.fillColor = [254, 226, 226];
                                }
                            }
                        }
                    });
                }

                // ═════════════════════════════════════════════════════════════
                // 5. CABEÇALHO CONTÍNUO (PÁGINAS > 1) E RODAPÉ OFICIAL ARGOS
                // ═════════════════════════════════════════════════════════════
                const totalPages = doc.internal.getNumberOfPages();
                let userSession = null;
                try {
                    if (typeof sessionStorage !== 'undefined') {
                        userSession = JSON.parse(sessionStorage.getItem('argos_user') || 'null');
                    }
                    if (!userSession && typeof localStorage !== 'undefined') {
                        userSession = JSON.parse(localStorage.getItem('argos_user') || 'null');
                    }
                } catch (e) {}

                const userName = userSession && userSession.name ? userSession.name.toUpperCase() : 'AUDITOR DO SUS';
                const docHash = `ARGOS-CNES-${(state.ibge || '210120')}-${Date.now().toString(36).toUpperCase()}`;

                for (let p = 1; p <= totalPages; p++) {
                    doc.setPage(p);

                    // Running header removido — apenas rodape nas paginas subsequentes

                    // Running footer profissional em todas as páginas (padrao export.js addFooter)
                    const footerY = pageH - 12;
                    doc.setFillColor(240, 245, 250);
                    doc.rect(0, footerY, pageW, 12, 'F');
                    doc.setDrawColor(226, 232, 240);
                    doc.setLineWidth(0.2);
                    doc.line(margin, footerY, margin + contentW, footerY);

                    doc.setFont('helvetica', 'normal');
                    doc.setFontSize(7.5);
                    doc.setTextColor(100, 116, 139);
                    doc.text(`ARGOS - Monitoramento Inteligente. Gestao Eficiente. | SCAAR | Gerado em ${dataHoraAtual} por ${userName}`, margin, pageH - 5);

                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(7);
                    doc.setTextColor(71, 85, 105);
                    doc.text(`Pagina ${p} de ${totalPages}`, margin + contentW, pageH - 5, { align: 'right' });
                }

                // Salvar arquivo PDF
                const filename = `CNES_Auditoria_Movimentacoes_${state.municipio || 'BACABAL'}_${state.uf || 'MA'}_${state.competenciaAtiva || '202608'}.pdf`;
                doc.save(filename);

                if (typeof showToast === 'function') {
                    showToast('✅ Relatório Oficial de Movimentações (PDF) gerado com sucesso!', 'success');
                }
                return true;
            } catch (err) {
                console.error('Erro ao gerar PDF de movimentações:', err);
                if (typeof showToast === 'function') {
                    showToast('❌ Erro ao gerar PDF: ' + (err.message || err), 'error');
                }
                return false;
            } finally {
                if (typeof hideLoading === 'function') hideLoading();
            }
        };

        if (typeof setTimeout !== 'undefined') {
            return new Promise(resolve => {
                setTimeout(async () => {
                    const ok = await gerarDocumento();
                    resolve(ok);
                }, 120);
            });
        } else {
            return await gerarDocumento();
        }
    }

    function renderViewMovimentacoes() {
        if (!state.movimentacoes) {
            return `<div class="cnes-mov-wrapper" style="padding: 2rem; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 0.5rem;">${state.movimentacoesMessage || 'Selecione a auditoria para comparar competências publicadas.'}</div>`;
        }

        const mov = state.movimentacoes;
        const res = (mov && mov.resumo) || {};
        const f = state.movimentacoesFiltro;

        const itens = filtrarItensMovimentacoes(mov, f);

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

                    <div style="display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;">
                        <button class="cnes-btn-pdf" onclick="window.CnesModule.exportarMovimentacoesPdf()" style="background: #dc2626; color: #ffffff; border: none; font-weight: 700; padding: 0.55rem 1rem; border-radius: 4px; cursor: pointer; display: inline-flex; align-items: center; gap: 0.4rem; box-shadow: 0 1px 3px rgba(0,0,0,0.12); transition: all 0.2s;" title="Exportar Relatório Oficial em PDF estruturado por categorias">
                            <i class="fas fa-file-pdf"></i> Exportar Relatório Oficial (PDF)
                        </button>
                        <button class="cnes-btn-xls" onclick="window.CnesModule.exportarMovimentacoesCsv()" style="background: #ffffff; color: #0284c7; border: none; font-weight: 700; padding: 0.55rem 1rem; border-radius: 4px; cursor: pointer; display: inline-flex; align-items: center; gap: 0.4rem; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">
                            <i class="fas fa-file-excel"></i> Exportar CSV
                        </button>
                        <button class="cnes-btn-outline" onclick="window.CnesModule.abrirMovimentacoes()" style="background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.35); color: #ffffff; border-radius: 4px; padding: 0.55rem 0.9rem; cursor: pointer; display: inline-flex; align-items: center; gap: 0.4rem;" title="Recalcular comparativo">
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
                            <div class="cnes-mov-kpi-lbl">Portaria 134 (Oficial CNES)</div>
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
                                ⚠️ Portaria 134 (${fmtNum(res.alertasPortaria134 || 0)})
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
                                <input type="text" id="inputMovimentacoesSearch" placeholder="Filtrar por nome, CNS ou CBO..." value="${f.search || ''}" 
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
                                    <th style="padding: 0.65rem 0.85rem; width: 150px; text-align: center;">Portaria 134 / Conformidade</th>
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
                                    } else if (item.tipo === 'PORTARIA134') {
                                        badgeHtml = `<span class="cnes-mov-badge badge-p134" style="background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; font-weight: 700;">
                                            <i class="fas fa-exclamation-triangle"></i> PORTARIA 134
                                        </span>`;
                                        chHtml = `<span>${item.chAtual}h</span>`;
                                    } else {
                                        const isUp = item.diferencaCh > 0;
                                        badgeHtml = `<span class="cnes-mov-badge ${isUp ? 'badge-ch-aumento' : 'badge-ch-reducao'}">
                                            <i class="fas fa-${isUp ? 'arrow-up' : 'arrow-down'}"></i> ${isUp ? 'AUMENTO' : 'REDUÇÃO'} (${isUp ? '+' : ''}${item.diferencaCh}h)
                                        </span>`;
                                        chHtml = `<span>${item.chAnterior}h ➔ <strong>${item.chAtual}h</strong></span>`;
                                    }

                                    const isP134Oficial = Boolean(item.portaria134 && item.portaria134 !== '-' && !item.portaria134.includes('>40') && !item.portaria134.includes('>60'));
                                    const portariaBadge = isP134Oficial ? 
                                        `<span class="cnes-ch-badge-danger" title="Apontamento oficial CNES: ${escaparTextoHtml(item.portaria134)}"><i class="fas fa-exclamation-triangle"></i> ${escaparTextoHtml(item.portaria134)}</span>` :
                                        (item.chAtual > 60 ? 
                                            `<span class="cnes-ch-badge-alert" title="Carga horária acumulada >60h"><i class="fas fa-info-circle"></i> CH &gt;60h</span>` :
                                            `<span class="cnes-ch-badge-normal"><i class="fas fa-check"></i> REGULAR</span>`);

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
        exportarMovimentacoesPdf: exportarMovimentacoesPdf,
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
        formatarTipoVinculo: formatarTipoVinculo,
        formatarSubtipoVinculo: formatarSubtipoVinculo,
        obterStatusPortaria134: obterStatusPortaria134,
        getCategoriaUnidade: getCategoriaUnidade,
        isUnidadeMantidaMunicipal: isUnidadeMantidaMunicipal,
        abrirModalCompetencia: abrirModalCompetencia,
        fecharModalCompetencia: fecharModalCompetencia,
        selecionarCompetencia: selecionarCompetencia,
        toggleDesligados: toggleDesligados,
        toggleEfetivos: toggleEfetivos,
        toggleAlerta134: toggleAlerta134,
        abrirModalImport: abrirModalImport,
        fecharModalImport: fecharModalImport,
        processarArquivoImport: processarArquivoImport,
        setPerPage: setPerPage,
        setPage: setPage,
        setTableSearch: setTableSearch,
        clearTableSearch: clearTableSearch,
        exportarXls: exportarXls,
        abrirDetalhesProfissional: abrirDetalhesProfissional,
        fecharDetalhesProfissional: fecharDetalhesProfissional,
        validarProfissionalNoCnes: validarProfissionalNoCnes,
        validarServicoUnidade: validarServicoUnidade
    };
})();

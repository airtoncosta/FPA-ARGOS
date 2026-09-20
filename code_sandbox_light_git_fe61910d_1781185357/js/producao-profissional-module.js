/**
 * FPA-ARGOS - Módulo: Espelho de Produção (Produtividade Profissional / CNS)
 * Monitoramento, auditoria e acompanhamento da produtividade médica por CNS,
 * detalhamento dos códigos de procedimentos SUS/SIGTAP, quantidades e valores por unidade.
 * Compatível tanto com BPA-I (individualizado com CNS) quanto BPA-C (consolidado por CBO).
 */
window.ProducaoProfissionalModule = {
    storageKey: 'argos_producoes_profissionais_cns',
    records: [],
    sigtapCache: null,
    cnesCache: null,
    expandedProfs: new Set(),
    filtros: {
        unidade: '',
        competencia: '',
        ordenacao: 'maior_qtd',
        busca: ''
    },
    initialized: false,

    async init() {
        this.bindEvents();
        await this.loadBases();
        await this.loadData();
        this.initialized = true;
    },

    bindEvents() {
        if (this.eventsBound) return;
        this.eventsBound = true;

        const selUnidade = document.getElementById('selProfUnidade');
        if (selUnidade) {
            selUnidade.addEventListener('change', (e) => {
                this.filtros.unidade = e.target.value;
                this.render();
            });
        }

        const selComp = document.getElementById('selProfCompetencia');
        if (selComp) {
            selComp.addEventListener('change', (e) => {
                this.filtros.competencia = e.target.value;
                this.render();
            });
        }

        const selOrd = document.getElementById('selProfOrdenacao');
        if (selOrd) {
            selOrd.addEventListener('change', (e) => {
                this.filtros.ordenacao = e.target.value;
                this.render();
            });
        }

        const inputBusca = document.getElementById('inputProfBusca');
        if (inputBusca) {
            inputBusca.addEventListener('input', (e) => {
                this.filtros.busca = e.target.value.trim().toLowerCase();
                this.render();
            });
        }
    },

    async loadBases() {
        // Carrega base SIGTAP vigente para obter nomes e valores dos procedimentos
        if (!this.sigtapCache && typeof fetch === 'function') {
            try {
                const res = await fetch('/sigtap_data/sigtap_vigente.json').catch(() => null);
                if (res && res.ok) {
                    const txt = await res.text();
                    this.sigtapCache = JSON.parse(txt.replace(/^\uFEFF/, ''));
                }
            } catch (e) {
                console.warn('SIGTAP data fetch falhou:', e);
            }
        }

        if (this.cnesCache && Array.isArray(this.cnesCache.estabelecimentos) && this.cnesCache.estabelecimentos.length > 0) {
            return;
        }
        if (typeof window !== 'undefined' && window.ArgosCnesBase && Array.isArray(window.ArgosCnesBase.estabelecimentos)) {
            this.cnesCache = window.ArgosCnesBase;
            return;
        }
        if (typeof window !== 'undefined' && window.BpaModule?.cnesBaseCache && Array.isArray(window.BpaModule.cnesBaseCache.estabelecimentos)) {
            this.cnesCache = window.BpaModule.cnesBaseCache;
            window.ArgosCnesBase = this.cnesCache;
            return;
        }

        // Carrega base CNES para associar nomes de profissionais e ocupações aos CNS
        // Injeta cabeçalhos de autorização exigidos pelo servidor
        if (!this.cnesCache && typeof fetch === 'function') {
            try {
                const headers = {};
                if (typeof window !== 'undefined' && window.SupabaseConfig) {
                    if (typeof window.SupabaseConfig.getClient === 'function') {
                        const client = window.SupabaseConfig.getClient();
                        if (client && client.auth && typeof client.auth.getSession === 'function') {
                            const sessionResult = await client.auth.getSession().catch(() => null);
                            const token = sessionResult?.data?.session?.access_token;
                            if (token) headers.Authorization = `Bearer ${token}`;
                        }
                    }
                    if (!headers.Authorization && typeof window.SupabaseConfig.getAnonKey === 'function') {
                        const anon = window.SupabaseConfig.getAnonKey();
                        if (anon) headers.Authorization = `Bearer ${anon}`;
                    }
                }
                const res = await fetch('/api/cnes/bacabal', { headers }).catch(() => null);
                if (res && res.ok) {
                    const txt = await res.text();
                    this.cnesCache = JSON.parse(txt.replace(/^\uFEFF/, ''));
                    if (typeof window !== 'undefined') window.ArgosCnesBase = this.cnesCache;
                }
            } catch (e) {
                console.warn('CNES data fetch falhou:', e);
            }
        }
    },

    getSigtapItem(codigo) {
        if (!this.sigtapCache || !codigo) return null;
        return this.sigtapCache[codigo] || null;
    },

    lookupProfissional(cns, cnes = '') {
        const cleanCns = String(cns || '').replace(/\D/g, '');
        if (!cleanCns) return null;
        const cleanCnes = String(cnes || '').replace(/\D/g, '');

        const estabs = [];
        try {
            if (typeof window !== 'undefined' && window.CnesModule && window.CnesModule.state && Array.isArray(window.CnesModule.state.estabelecimentos)) {
                estabs.push(...window.CnesModule.state.estabelecimentos);
            }
        } catch (e) {}
        if (this.cnesCache && Array.isArray(this.cnesCache.estabelecimentos)) {
            estabs.push(...this.cnesCache.estabelecimentos);
        }
        if (typeof window !== 'undefined' && window.ArgosCnesBase && Array.isArray(window.ArgosCnesBase.estabelecimentos)) {
            estabs.push(...window.ArgosCnesBase.estabelecimentos);
        }
        if (typeof window !== 'undefined' && window.BpaModule && window.BpaModule.cnesBaseCache && Array.isArray(window.BpaModule.cnesBaseCache.estabelecimentos)) {
            estabs.push(...window.BpaModule.cnesBaseCache.estabelecimentos);
        }

        let found = null;
        let unitFound = null;
        let vinculadoUnidade = true;

        // 1. Tenta buscar primeiro na própria unidade (cnes) informada
        if (cleanCnes) {
            const unit = estabs.find(est => String(est.cnes || '').replace(/\D/g, '') === cleanCnes);
            if (unit && Array.isArray(unit.profissionais)) {
                const p = unit.profissionais.find(x => String(x.cns || x.cnsMaster || '').replace(/\D/g, '') === cleanCns);
                if (p) {
                    found = p;
                    unitFound = unit;
                    vinculadoUnidade = true;
                }
            }
        }

        // 2. Se não achou na unidade específica, procura em qualquer unidade cadastrada no município
        if (!found) {
            for (const u of estabs) {
                if (Array.isArray(u.profissionais)) {
                    const p = u.profissionais.find(x => String(x.cns || x.cnsMaster || '').replace(/\D/g, '') === cleanCns);
                    if (p) {
                        found = p;
                        unitFound = u;
                        vinculadoUnidade = cleanCnes ? false : true;
                        break;
                    }
                }
            }
        }

        if (found) {
            const cboCode = String(found.cbo || '').trim();
            const cboDescDict = (typeof CBO_DICTIONARY !== 'undefined' && CBO_DICTIONARY[cboCode])
                || (typeof window !== 'undefined' && window.CBO_DICTIONARY && window.CBO_DICTIONARY[cboCode])
                || '';
            const ocupacao = found.ocupacao || (cboDescDict ? `${cboCode} - ${cboDescDict}` : (cboCode ? `CBO ${cboCode}` : ''));

            let vinculoInfo = null;
            if (typeof window !== 'undefined' && window.DATASUS_VINCULOS_BACABAL) {
                const map = window.DATASUS_VINCULOS_BACABAL;
                vinculoInfo = (cleanCnes && cboCode && map[`${cleanCnes}_${cleanCns}_${cboCode}`])
                    || (cleanCnes && map[`${cleanCnes}_${cleanCns}`])
                    || (cboCode && (map[`${cleanCns}_${cboCode}`] || map[`cns_${cleanCns}_${cboCode}`]))
                    || map[`cns_${cleanCns}`]
                    || map[cleanCns]
                    || null;
            }

            return {
                ...found,
                nome: found.nome || '',
                cns: cleanCns,
                cbo: cboCode,
                ocupacao: ocupacao,
                vinculadoUnidade: vinculadoUnidade,
                cnesUnidade: unitFound ? String(unitFound.cnes || '').replace(/\D/g, '') : cleanCnes,
                nomeUnidade: unitFound ? (unitFound.nomeFantasia || unitFound.nome || '') : '',
                vinculoOficial: vinculoInfo
            };
        }

        return null;
    },

    lookupProfissionaisByCbo(cbo, cnes = '', unidadeNome = '') {
        const cleanCbo = String(cbo || '').trim();
        const cleanCnes = String(cnes || '').replace(/\D/g, '');
        const normNome = String(unidadeNome || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
        if (!cleanCbo) return [];

        const estabs = [];
        if (typeof window !== 'undefined' && window.CnesModule && window.CnesModule.state && Array.isArray(window.CnesModule.state.estabelecimentos)) {
            estabs.push(...window.CnesModule.state.estabelecimentos);
        }
        if (this.cnesCache && Array.isArray(this.cnesCache.estabelecimentos)) {
            estabs.push(...this.cnesCache.estabelecimentos);
        }
        if (typeof window !== 'undefined' && window.BpaModule && window.BpaModule.cnesBaseCache && Array.isArray(window.BpaModule.cnesBaseCache.estabelecimentos)) {
            estabs.push(...window.BpaModule.cnesBaseCache.estabelecimentos);
        }

        // Busca unidade
        let matchedUnits = estabs.filter(est => {
            const estCnes = String(est.cnes || '').replace(/\D/g, '');
            if (cleanCnes && estCnes && estCnes === cleanCnes) return true;
            const estNome = String(est.nomeFantasia || est.nome || est.razaoSocial || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
            if (normNome && estNome && (estNome === normNome || estNome.includes(normNome) || normNome.includes(estNome))) return true;
            return false;
        });

        if (matchedUnits.length === 0) matchedUnits = estabs;

        const profsFound = [];
        for (const est of matchedUnits) {
            if (Array.isArray(est.profissionais)) {
                for (const p of est.profissionais) {
                    if (String(p.cbo || '').trim() === cleanCbo) {
                        if (!profsFound.some(f => (f.cns || f.nome) === (p.cns || p.nome))) {
                            profsFound.push(p);
                        }
                    }
                }
            }
        }
        return profsFound;
    },

    /**
     * Salva o registro dos profissionais ao enviar uma nova remessa de produção BPA
     */
    recordProducaoProfissionais(producaoRecord, producaoData) {
        if (!producaoRecord) return;
        const cnes = producaoRecord.cnes || producaoData?.cnes || '';
        const unidade = producaoRecord.estabelecimento_nome || producaoData?.estabelecimentoNome || 'UNIDADE NÃO INFORMADA';
        const competencia = producaoRecord.competencia || producaoData?.competencia || '';
        const producaoId = producaoRecord.id;
        const rawContent = producaoRecord.conteudo_arquivo || producaoData?.conteudo || '';

        // Carrega registros existentes
        let saved = [];
        try {
            saved = JSON.parse(localStorage.getItem(this.storageKey) || '[]');
        } catch (e) {
            saved = [];
        }

        // Remove registros antigos vinculados à mesma produção (idempotência / reenvio)
        saved = saved.filter(r => r.producao_id !== producaoId);

        // Agregação unificada determinística
        const auditCore = (typeof window !== 'undefined' && window.BpaAuditCore) ? window.BpaAuditCore : (typeof globalThis !== 'undefined' && globalThis.BpaAuditCore ? globalThis.BpaAuditCore : null);

        if (rawContent && auditCore) {
            try {
                const parsed = auditCore.parse(rawContent);
                const profRecords = this.aggregateProfissionais(parsed.records, cnes, unidade, competencia, producaoId, producaoRecord.nome_arquivo);
                saved.push(...profRecords);
            } catch (e) {
                console.error('Falha ao agregar profissionais da remessa BPA:', e);
            }
        } else if (Array.isArray(producaoData?.profissionaisDetalhados) && producaoData.profissionaisDetalhados.length > 0) {
            // Fallback caso não haja conteúdo de arquivo bruto
            for (const p of producaoData.profissionaisDetalhados) {
                const info = this.lookupProfissional(p.cns, cnes);
                const nome = p.nome || info?.nome || (p.cns ? `Profissional CNS ${p.cns}` : (p.cboDesc || `CBO ${p.cbo}`));
                const cboDesc = p.cboDesc || info?.ocupacao || (p.cbo ? ('CBO ' + p.cbo) : 'Ocupação SUS');

                let totalValor = 0;
                const procsWithValues = (p.procedimentos || []).map(pr => {
                    const sig = this.getSigtapItem(pr.codigo);
                    const vlUnit = (sig && typeof sig.vl_sa === 'number') ? sig.vl_sa : 0;
                    const vlTot = vlUnit * pr.quantidade;
                    totalValor += vlTot;
                    return {
                        codigo: pr.codigo,
                        nome: sig?.nome || `Procedimento ${pr.codigo}`,
                        quantidade: pr.quantidade,
                        valorUnitario: vlUnit,
                        valorTotal: vlTot
                    };
                });

                saved.push({
                    id: 'prof_prod_' + Math.random().toString(36).substring(2, 10),
                    producao_id: producaoId,
                    cns: p.cns || p.cnsDisplay || (p.cbo ? `CBO ${p.cbo}` : 'N/D'),
                    nome,
                    cbo: p.cbo || '',
                    cboDesc,
                    cnes,
                    estabelecimento_nome: unidade,
                    competencia,
                    nome_arquivo: producaoRecord.nome_arquivo || producaoData?.nomeArquivo || '',
                    totalQuantidade: p.quantidade || 0,
                    totalAtendimentos: p.atendimentos || Math.max(1, p.quantidade || 0),
                    totalValor: Number(totalValor.toFixed(2)),
                    procedimentos: procsWithValues,
                    vinculoConfirmado: info?.vinculadoUnidade ?? true,
                    vinculoAlerta: !info?.vinculadoUnidade,
                    criado_em: new Date().toISOString()
                });
            }
        }

        try {
            localStorage.setItem(this.storageKey, JSON.stringify(saved));
        } catch (e) {
            console.error('Erro ao persistir produção dos profissionais:', e);
        }

        this.records = saved;
        if (this.initialized) {
            this.populateFilterOptions();
            this.render();
        }
    },

    /**
     * Agregação determinística oficial:
     * - Atendimentos: pacientes únicos na mesma data (BPA-I) ou procedimentos consolidados (BPA-C).
     * - Quantidade: soma aritmética de procedimentos executados para fins de faturamento.
     * - CNES: cruzamento com a base de estabelecimentos e alerta de vínculo.
     */
    aggregateProfissionais(records, cnes, unidade, competencia, producaoId, nomeArquivo) {
        if (!Array.isArray(records) || records.length === 0) return [];
        const profMap = new Map();

        for (const r of records) {
            const isBpaI = r.tipo === 'BPA-I' || (r.cnsProfissional && String(r.cnsProfissional).trim().length > 0);
            let cns = String(r.cnsProfissional || '').trim();
            const cbo = String(r.cbo || '').trim();
            const qty = /^\d+$/.test(r.quantidade) ? Number(r.quantidade) : 1;

            let key = cns;
            let isConsolidadoBpaC = false;

            if (!isBpaI || !key) {
                // BPA-C Consolidado por CBO
                isConsolidadoBpaC = true;
                key = cbo ? `CBO_${cbo}` : 'SEM_CBO';
            }

            if (!profMap.has(key)) {
                let nome = '';
                let cboDesc = '';
                let membrosEquipe = [];
                let vinculoConfirmado = false;
                let vinculoAlerta = false;

                if (!isConsolidadoBpaC) {
                    const info = this.lookupProfissional(key, cnes);
                    if (info) {
                        nome = info.nome || `Profissional CNS ${key}`;
                        cboDesc = info.ocupacao || (cbo ? `CBO ${cbo}` : '');
                        vinculoConfirmado = !!info.vinculadoUnidade;
                        vinculoAlerta = !info.vinculadoUnidade;
                    } else {
                        nome = `Profissional CNS ${key}`;
                        cboDesc = cbo ? `CBO ${cbo}` : 'Ocupação SUS';
                        vinculoConfirmado = false;
                        vinculoAlerta = true;
                    }
                } else {
                    // BPA-C Consolidado por CBO
                    const resolvedProfs = this.lookupProfissionaisByCbo(cbo, cnes, unidade);
                    if (resolvedProfs.length === 1) {
                        nome = `${resolvedProfs[0].nome} (Consolidado CBO ${cbo})`;
                        cboDesc = resolvedProfs[0].ocupacao || `CBO ${cbo}`;
                        membrosEquipe = resolvedProfs.map(p => ({ nome: p.nome, cns: p.cns, ocupacao: p.ocupacao }));
                    } else if (resolvedProfs.length > 1) {
                        const ocupLabel = resolvedProfs[0].ocupacao?.split('-')[1]?.trim() || 'Especializada';
                        nome = `Equipe de ${ocupLabel} (${resolvedProfs.length} no CNES)`;
                        cboDesc = resolvedProfs[0].ocupacao || `CBO ${cbo}`;
                        membrosEquipe = resolvedProfs.map(p => ({ nome: p.nome, cns: p.cns, ocupacao: p.ocupacao }));
                    } else {
                        nome = `Produção Consolidada (CBO ${cbo})`;
                        cboDesc = `CBO ${cbo}`;
                    }
                    vinculoConfirmado = true;
                    vinculoAlerta = false;
                }

                profMap.set(key, {
                    cns: isConsolidadoBpaC ? (cbo ? `Consolidado CBO ${cbo}` : 'BPA-C') : key,
                    cnsDisplay: isConsolidadoBpaC ? (cbo ? `CBO ${cbo}` : 'BPA-C') : key,
                    nome,
                    cbo,
                    cboDesc,
                    membrosEquipe,
                    vinculoConfirmado,
                    vinculoAlerta,
                    totalQuantidade: 0,
                    totalAtendimentosConsolidado: 0,
                    atendimentosSet: new Set(),
                    procsMap: new Map(),
                    isConsolidadoBpaC
                });
            }

            const item = profMap.get(key);
            item.totalQuantidade += qty;

            if (isConsolidadoBpaC) {
                // No BPA-C, a quantidade expressa os atendimentos consolidados
                item.totalAtendimentosConsolidado += qty;
            } else {
                // No BPA-I, o atendimento único é definido pelo paciente na data do atendimento
                const dt = String(r.dataAtendimento || '').trim();
                const pac = String(r.cnsPaciente || r.cpfPaciente || '').trim();
                const folhaSeq = `${r.folha || '0'}_${r.sequencia || '0'}`;
                const encKey = pac ? `${pac}_${dt || 'DATA_ND'}` : `${folhaSeq}_${dt || 'DATA_ND'}`;
                item.atendimentosSet.add(encKey);
            }

            if (r.procedimento) {
                item.procsMap.set(r.procedimento, (item.procsMap.get(r.procedimento) || 0) + qty);
            }
        }

        const result = [];
        for (const [key, item] of profMap.entries()) {
            let totalValor = 0;
            const procsWithValues = [...item.procsMap.entries()].map(([codigo, quantidade]) => {
                const sig = this.getSigtapItem(codigo);
                const vlUnit = (sig && typeof sig.vl_sa === 'number') ? sig.vl_sa : 0;
                const vlTot = vlUnit * quantidade;
                totalValor += vlTot;
                return {
                    codigo,
                    nome: sig?.nome || `Procedimento ${codigo}`,
                    quantidade,
                    valorUnitario: vlUnit,
                    valorTotal: vlTot
                };
            }).sort((a, b) => b.quantidade - a.quantidade);

            // Calcula total de atendimentos de acordo com a modalidade
            const totalAtendimentos = item.isConsolidadoBpaC
                ? item.totalAtendimentosConsolidado
                : Math.max(1, item.atendimentosSet.size);

            result.push({
                id: 'prof_prod_' + Math.random().toString(36).substring(2, 10),
                producao_id: producaoId,
                cns: item.cns,
                cnsDisplay: item.cnsDisplay,
                nome: item.nome,
                cbo: item.cbo,
                cboDesc: item.cboDesc,
                cnes,
                estabelecimento_nome: unidade,
                competencia,
                nome_arquivo: nomeArquivo || '',
                totalQuantidade: item.totalQuantidade,
                totalAtendimentos,
                totalValor: Number(totalValor.toFixed(2)),
                procedimentos: procsWithValues,
                membrosEquipe: item.membrosEquipe || [],
                vinculoConfirmado: item.vinculoConfirmado,
                vinculoAlerta: item.vinculoAlerta,
                isConsolidadoBpaC: item.isConsolidadoBpaC,
                criado_em: new Date().toISOString()
            });
        }
        return result;
    },

    extractProfissionaisFromRecords(records, cnes, unidade, competencia, producaoId, nomeArquivo) {
        return this.aggregateProfissionais(records, cnes, unidade, competencia, producaoId, nomeArquivo);
    },

    /**
     * Remove todos os registros vinculados a uma produção BPA excluída (expurgo em cascata)
     */
    removeProducao(producaoId) {
        if (!producaoId) return;
        let saved = [];
        try {
            saved = JSON.parse(localStorage.getItem(this.storageKey) || '[]');
        } catch (e) {
            saved = [];
        }
        saved = saved.filter(r => r.producao_id !== producaoId);
        this.records = (this.records || []).filter(r => r.producao_id !== producaoId);

        try {
            localStorage.setItem(this.storageKey, JSON.stringify(saved));
        } catch (e) {
            console.error('Erro ao salvar após exclusão de produção:', e);
        }

        if (this.initialized) {
            this.populateFilterOptions();
            this.render();
        }
    },

    /**
     * Higienização completa dos dados de produtividade profissional
     */
    clearAllData() {
        try {
            localStorage.removeItem(this.storageKey);
        } catch (e) {}
        this.records = [];
        this.filtros = {
            unidade: '',
            competencia: '',
            ordenacao: 'maior_qtd',
            busca: ''
        };
        if (this.initialized) {
            this.populateFilterOptions();
            this.render();
        }
    },

    async loadData(forceSyncWithBpa = false) {
        let loaded = [];
        try {
            const str = localStorage.getItem(this.storageKey);
            if (str) loaded = JSON.parse(str);
        } catch (e) {
            loaded = [];
        }

        // Sincronização com produções do BPA (sempre verifica se há produções adicionadas)
        const existingBpa = this.getExistingBpaProductions();
        const validBpaIds = new Set(existingBpa.map(b => b.id));

        // EXPURGO ATIVO DE ÓRFÃOS: remove do Espelho registros de produções que já foram deletadas do BPA
        if (existingBpa.length > 0) {
            loaded = loaded.filter(r => validBpaIds.has(r.producao_id));
        }

        const knownProducaoIds = new Set(loaded.map(r => r.producao_id));
        const auditCore = (typeof window !== 'undefined' && window.BpaAuditCore) ? window.BpaAuditCore : (typeof globalThis !== 'undefined' && globalThis.BpaAuditCore ? globalThis.BpaAuditCore : null);

        for (const bpa of existingBpa) {
            if (bpa.conteudo_arquivo && (!knownProducaoIds.has(bpa.id) || forceSyncWithBpa)) {
                try {
                    if (auditCore) {
                        const parsed = auditCore.parse(bpa.conteudo_arquivo);
                        const extracted = this.aggregateProfissionais(
                            parsed.records,
                            bpa.cnes,
                            bpa.estabelecimento_nome,
                            bpa.competencia,
                            bpa.id,
                            bpa.nome_arquivo
                        );
                        // Remove anteriores desta produção
                        loaded = loaded.filter(r => r.producao_id !== bpa.id);
                        loaded.push(...extracted);
                    }
                } catch (e) {
                    console.warn('Erro ao processar produção BPA:', e);
                }
            }
        }

        try {
            localStorage.setItem(this.storageKey, JSON.stringify(loaded));
        } catch (e) {}

        // Enriquecimento e re-resolução de nomes de profissionais que possam ter ficado pendentes
        for (const item of loaded) {
            // Se for BPA-C ou consolidado sem médicos resolvidos, tenta resolver com a base CNES carregada
            if ((!item.nome || item.nome.includes('Identificado pelo CNS') || item.nome.startsWith('Equipe / CBO') || item.cns.startsWith('Consolidado CBO') || item.cns.startsWith('CBO_')) && item.cbo) {
                const matchProfs = this.lookupProfissionaisByCbo(item.cbo, item.cnes, item.estabelecimento_nome);
                if (matchProfs.length === 1) {
                    item.nome = `${matchProfs[0].nome} (Consolidado CBO ${item.cbo})`;
                    item.cns = matchProfs[0].cns;
                    item.cboDesc = matchProfs[0].ocupacao || item.cboDesc;
                    item.membrosEquipe = matchProfs.map(p => ({ nome: p.nome, cns: p.cns, ocupacao: p.ocupacao }));
                } else if (matchProfs.length > 1) {
                    const ocupLabel = matchProfs[0].ocupacao?.split('-')[1]?.trim() || 'Especializada';
                    item.nome = `Equipe de ${ocupLabel} (${matchProfs.length} no CNES)`;
                    item.cns = `CBO ${item.cbo} (${matchProfs.length} CNS vinculados)`;
                    item.cboDesc = matchProfs[0].ocupacao || item.cboDesc;
                    item.membrosEquipe = matchProfs.map(p => ({ nome: p.nome, cns: p.cns, ocupacao: p.ocupacao }));
                }
            }
            if (!item.nome || item.nome.includes('Identificado pelo CNS') || item.nome.startsWith('Profissional CNS')) {
                const info = this.lookupProfissional(item.cns, item.cnes);
                if (info && info.nome) {
                    item.nome = info.nome;
                    if (info.ocupacao) item.cboDesc = info.ocupacao;
                    item.vinculoConfirmado = !!info.vinculadoUnidade;
                    item.vinculoAlerta = !info.vinculadoUnidade;
                }
            }
            // Enriquecer nomes de procedimentos se o cache SIGTAP foi carregado
            if (this.sigtapCache && Array.isArray(item.procedimentos)) {
                let recalculate = false;
                item.procedimentos.forEach(p => {
                    const sig = this.getSigtapItem(p.codigo);
                    if (sig) {
                        if (!p.nome || p.nome.startsWith('Procedimento ')) p.nome = sig.nome;
                        if (typeof sig.vl_sa === 'number' && (!p.valorUnitario || p.valorUnitario === 0)) {
                            p.valorUnitario = sig.vl_sa;
                            p.valorTotal = p.valorUnitario * p.quantidade;
                            recalculate = true;
                        }
                    }
                });
                if (recalculate) {
                    item.totalValor = Number(item.procedimentos.reduce((sum, p) => sum + (p.valorTotal || 0), 0).toFixed(2));
                }
            }
        }

        this.records = loaded;
        this.populateFilterOptions();
        this.render();
    },

    getExistingBpaProductions() {
        const prods = [];
        try {
            if (window.BpaModule && Array.isArray(window.BpaModule.producoes) && window.BpaModule.producoes.length > 0) {
                prods.push(...window.BpaModule.producoes);
            }
            if (window.BpaModule && typeof window.BpaModule.readLocalProducoes === 'function') {
                prods.push(...window.BpaModule.readLocalProducoes());
            }
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k && k.startsWith('argos_producoes_bpa')) {
                    try {
                        const items = JSON.parse(localStorage.getItem(k) || '[]');
                        if (Array.isArray(items)) prods.push(...items);
                    } catch (e) {}
                }
            }
        } catch (e) {}
        const unique = new Map();
        prods.forEach(p => { if (p && p.id && !unique.has(p.id)) unique.set(p.id, p); });
        return [...unique.values()];
    },

    populateFilterOptions() {
        const selUnidade = document.getElementById('selProfUnidade');
        const selComp = document.getElementById('selProfCompetencia');

        if (selUnidade) {
            const currentVal = selUnidade.value;
            const unidadesSet = new Set();
            this.records.forEach(r => {
                if (r.estabelecimento_nome) unidadesSet.add(r.estabelecimento_nome.trim().toUpperCase());
            });

            // Complementa com a lista oficial de unidades do sistema se disponível
            if (window.BpaModule && typeof window.BpaModule.getUnidadesSistema === 'function') {
                window.BpaModule.getUnidadesSistema().forEach(u => {
                    if (u.nome) unidadesSet.add(u.nome.trim().toUpperCase());
                });
            }

            const sortedUnidades = [...unidadesSet].sort();
            let opts = '<option value="">Todas as Unidades</option>';
            sortedUnidades.forEach(u => {
                const selected = u === currentVal ? 'selected' : '';
                opts += `<option value="${u}" ${selected}>${u}</option>`;
            });
            selUnidade.innerHTML = opts;
        }

        if (selComp) {
            const currentVal = selComp.value;
            const compSet = new Set();
            this.records.forEach(r => {
                if (r.competencia) compSet.add(r.competencia.trim());
            });

            // Default competencies
            ['06/2026', '07/2026', '08/2026'].forEach(c => compSet.add(c));

            const sortedComp = [...compSet].sort().reverse();
            let opts = '<option value="">Todas as Competências</option>';
            sortedComp.forEach(c => {
                const selected = c === currentVal ? 'selected' : '';
                opts += `<option value="${c}" ${selected}>${c}</option>`;
            });
            selComp.innerHTML = opts;
        }
    },

    getFilteredAndAggregatedProfissionais() {
        const { unidade, competencia, ordenacao, busca } = this.filtros;

        // 1. Filtrar registros brutos
        const filtered = this.records.filter(r => {
            if (unidade && String(r.estabelecimento_nome || '').trim().toUpperCase() !== unidade.trim().toUpperCase()) {
                return false;
            }
            if (competencia && String(r.competencia || '').trim() !== competencia.trim()) {
                return false;
            }
            if (busca) {
                const term = busca.toLowerCase();
                const matchNome = (r.nome || '').toLowerCase().includes(term);
                const matchCns = (r.cns || '').includes(term);
                const matchCbo = (r.cboDesc || '').toLowerCase().includes(term) || (r.cbo || '').includes(term);
                const matchProc = (r.procedimentos || []).some(p => p.codigo.includes(term) || (p.nome || '').toLowerCase().includes(term));
                if (!matchNome && !matchCns && !matchCbo && !matchProc) return false;
            }
            return true;
        });

        // 2. Consolidar por CNS (agregação de mesmo profissional entre remessas filtradas)
        const profMap = new Map();
        for (const r of filtered) {
            const key = r.cns || r.nome;
            if (!profMap.has(key)) {
                profMap.set(key, {
                    cns: r.cns,
                    nome: r.nome || 'Profissional',
                    cbo: r.cbo || '',
                    cboDesc: r.cboDesc || 'Profissional de Saúde',
                    membrosEquipe: r.membrosEquipe || [],
                    unidades: new Set(),
                    competencias: new Set(),
                    totalQuantidade: 0,
                    totalAtendimentos: 0,
                    totalValor: 0,
                    procsMap: new Map(),
                    isConsolidadoBpaC: r.isConsolidadoBpaC
                });
            }
            const agg = profMap.get(key);
            if (r.membrosEquipe && r.membrosEquipe.length > 0 && (!agg.membrosEquipe || agg.membrosEquipe.length === 0)) {
                agg.membrosEquipe = r.membrosEquipe;
            }
            if (r.vinculoConfirmado) agg.vinculoConfirmado = true;
            if (r.vinculoAlerta && !agg.vinculoConfirmado) agg.vinculoAlerta = true;
            if (r.estabelecimento_nome) agg.unidades.add(r.estabelecimento_nome);
            if (r.competencia) agg.competencias.add(r.competencia);
            agg.totalQuantidade += (r.totalQuantidade || 0);
            agg.totalAtendimentos += (r.totalAtendimentos || 0);
            agg.totalValor += (r.totalValor || 0);

            // Consolidação de procedimentos
            (r.procedimentos || []).forEach(p => {
                if (!agg.procsMap.has(p.codigo)) {
                    agg.procsMap.set(p.codigo, {
                        codigo: p.codigo,
                        nome: p.nome,
                        quantidade: 0,
                        valorUnitario: p.valorUnitario || 0,
                        valorTotal: 0
                    });
                }
                const procAgg = agg.procsMap.get(p.codigo);
                procAgg.quantidade += p.quantidade;
                procAgg.valorTotal += (p.valorTotal || (p.valorUnitario * p.quantidade) || 0);
                if (!procAgg.nome || procAgg.nome.startsWith('Procedimento ')) procAgg.nome = p.nome;
            });
        }

        // 3. Converter para array formatado com percentuais
        const list = [...profMap.values()].map(prof => {
            const procsList = [...prof.procsMap.values()].map(p => {
                const pct = prof.totalQuantidade > 0 ? ((p.quantidade / prof.totalQuantidade) * 100).toFixed(1) : '0';
                return { ...p, percentual: pct };
            }).sort((a, b) => b.quantidade - a.quantidade);

            return {
                cns: prof.cns,
                nome: prof.nome,
                cbo: prof.cbo,
                cboDesc: prof.cboDesc,
                membrosEquipe: prof.membrosEquipe || [],
                unidades: [...prof.unidades],
                unidadesFormatadas: [...prof.unidades].join(' • ') || 'Unidade Principal',
                competencias: [...prof.competencias].join(', ') || '-',
                totalQuantidade: prof.totalQuantidade,
                totalAtendimentos: prof.totalAtendimentos,
                totalValor: Number(prof.totalValor.toFixed(2)),
                totalValorFormatado: prof.totalValor > 0 ? `R$ ${prof.totalValor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'R$ 0,00',
                procedimentos: procsList,
                vinculoConfirmado: prof.vinculoConfirmado,
                vinculoAlerta: prof.vinculoAlerta,
                isConsolidadoBpaC: prof.isConsolidadoBpaC
            };
        });

        // 4. Ordenação analítica (quem produz mais vs quem produz menos)
        if (ordenacao === 'maior_qtd') {
            list.sort((a, b) => b.totalQuantidade - a.totalQuantidade);
        } else if (ordenacao === 'menor_qtd') {
            list.sort((a, b) => a.totalQuantidade - b.totalQuantidade);
        } else if (ordenacao === 'maior_valor') {
            list.sort((a, b) => b.totalValor - a.totalValor);
        } else if (ordenacao === 'menor_valor') {
            list.sort((a, b) => a.totalValor - b.totalValor);
        } else if (ordenacao === 'nome_az') {
            list.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
        }

        return list;
    },

    render() {
        const profissionais = this.getFilteredAndAggregatedProfissionais();

        // 1. Atualizar KPIs
        const totalProfs = profissionais.length;
        const totalProcs = profissionais.reduce((sum, p) => sum + p.totalQuantidade, 0);
        const totalAtends = profissionais.reduce((sum, p) => sum + p.totalAtendimentos, 0);
        const totalValorSigtap = profissionais.reduce((sum, p) => sum + p.totalValor, 0);
        const media = totalProfs > 0 ? (totalProcs / totalProfs).toFixed(1) : '0';
        const topProdutor = profissionais.length > 0 ? profissionais.slice().sort((a, b) => b.totalQuantidade - a.totalQuantidade)[0] : null;

        const elKpiAtivos = document.getElementById('kpiProfTotalAtivos');
        const elKpiProcs = document.getElementById('kpiProfTotalProcedimentos');
        const elKpiMedia = document.getElementById('kpiProfMediaPorProf');
        const elKpiTop = document.getElementById('kpiProfTopProdutor');
        const elKpiTopQtd = document.getElementById('kpiProfTopProdutorQtd');
        const elTotalRanking = document.getElementById('labelTotalProfRanking');

        if (elKpiAtivos) elKpiAtivos.textContent = totalProfs.toLocaleString('pt-BR');
        if (elKpiProcs) elKpiProcs.textContent = totalProcs.toLocaleString('pt-BR');
        if (elKpiMedia) elKpiMedia.textContent = Number(media).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
        if (elKpiTop) elKpiTop.textContent = topProdutor ? topProdutor.nome : '-';
        if (elKpiTopQtd) elKpiTopQtd.textContent = topProdutor ? `${topProdutor.totalAtendimentos.toLocaleString('pt-BR')} atends (${topProdutor.totalQuantidade.toLocaleString('pt-BR')} procs)` : '0 atendimentos';
        if (elTotalRanking) elTotalRanking.textContent = `${totalProfs} profissional(is)`;

        // 2. Renderizar Ranking de Produtividade (Barras Visuais)
        this.renderRankingBarras(profissionais);

        // 3. Renderizar Lista Detalhada
        this.renderListaProfissionais(profissionais);
    },

    renderRankingBarras(profissionais) {
        const container = document.getElementById('containerRankingBarras');
        if (!container) return;

        if (profissionais.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 1.5rem; color: #94a3b8; font-size: 0.85rem;">
                    Nenhuma produção médica individual encontrada com os filtros selecionados.
                </div>`;
            return;
        }

        // Pega o maior produtor do grupo para servir de referência (100%)
        const maxQtd = Math.max(...profissionais.map(p => p.totalQuantidade), 1);

        // Exibe os profissionais em barras comparativas
        let html = '';
        profissionais.forEach((p, index) => {
            const pct = Math.min(Math.round((p.totalQuantidade / maxQtd) * 100), 100);
            const posicao = index + 1;
            const medalha = posicao === 1 ? '🥇 ' : posicao === 2 ? '🥈 ' : posicao === 3 ? '🥉 ' : `#${posicao} `;

            // Cores dinâmicas de acordo com a faixa de produtividade
            let barColor = '#0284c7';
            if (pct >= 80) barColor = '#0284c7'; // Líder / Alta
            else if (pct >= 40) barColor = '#059669'; // Boa produtividade
            else if (pct >= 15) barColor = '#d97706'; // Média
            else barColor = '#64748b'; // Baixa produção

            html += `
                <div style="display: flex; flex-direction: column; gap: 4px; padding: 0.4rem 0.6rem; border-radius: 0.5rem; background: #f8fafc; border: 1px solid #f1f5f9;">
                    <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.82rem;">
                        <div style="font-weight: 700; color: #1e293b; display: flex; align-items: center; gap: 6px;">
                            <span style="font-size: 0.85rem;">${medalha}</span>
                            <span>${p.nome}</span>
                            <span style="font-size: 0.72rem; color: #64748b; font-weight: 500;">(${p.cboDesc})</span>
                        </div>
                        <div style="font-weight: 800; color: #0f172a; font-size: 0.85rem;">
                            <span style="color: #0369a1;">${p.totalAtendimentos.toLocaleString('pt-BR')} atends</span>
                            <span style="margin: 0 4px; color: #cbd5e1;">•</span>
                            <span style="color: #475569;">${p.totalQuantidade.toLocaleString('pt-BR')} procs</span>
                            ${p.totalValor > 0 ? `<span style="margin-left: 8px; font-weight: 600; color: #16a34a; font-size: 0.76rem;">• ${p.totalValorFormatado}</span>` : ''}
                        </div>
                    </div>
                    <div style="height: 8px; width: 100%; background: #e2e8f0; border-radius: 9999px; overflow: hidden; position: relative;">
                        <div style="height: 100%; width: ${pct}%; background: ${barColor}; border-radius: 9999px; transition: width 0.4s ease;"></div>
                    </div>
                </div>`;
        });

        container.innerHTML = html;
    },

    renderListaProfissionais(profissionais) {
        const container = document.getElementById('containerProfissionaisLista');
        if (!container) return;

        if (profissionais.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 3rem; color: #64748b;">
                    <i class="fas fa-inbox" style="font-size: 2.5rem; color: #cbd5e1; margin-bottom: 0.75rem; display: block;"></i>
                    <h4 style="font-weight: 700; color: #1e293b; margin-bottom: 0.35rem;">Nenhuma produção localizada</h4>
                    <p style="font-size: 0.82rem; margin: 0;">Envie arquivos de produção no menu <strong>Produções BPA</strong> para carregar a produtividade dos profissionais.</p>
                </div>`;
            return;
        }

        let html = '';
        profissionais.forEach((p, index) => {
            const safeKey = String(p.cns || p.nome).replace(/[^a-zA-Z0-9_]/g, '_');
            const isExpanded = this.expandedProfs.has(safeKey);
            const chevronIcon = isExpanded ? 'fa-chevron-up' : 'fa-chevron-down';
            const displayStyle = isExpanded ? 'block' : 'none';

            let procsTableRows = '';
            (p.procedimentos || []).forEach(proc => {
                const vlUnitStr = proc.valorUnitario > 0 ? `R$ ${proc.valorUnitario.toFixed(2).replace('.', ',')}` : 'R$ 0,00';
                const vlTotStr = proc.valorTotal > 0 ? `R$ ${proc.valorTotal.toFixed(2).replace('.', ',')}` : 'R$ 0,00';

                procsTableRows += `
                    <tr style="border-bottom: 1px solid #f1f5f9; font-size: 0.8rem;">
                        <td style="padding: 0.6rem 0.75rem; font-weight: 700;">
                            <code style="background: #f1f5f9; color: #0284c7; padding: 2px 6px; border-radius: 4px; font-size: 0.78rem;">${proc.codigo}</code>
                        </td>
                        <td style="padding: 0.6rem 0.75rem; color: #1e293b; font-weight: 500;">
                            ${proc.nome}
                        </td>
                        <td style="padding: 0.6rem 0.75rem; text-align: center; font-weight: 700; color: #0284c7;">
                            ${proc.quantidade.toLocaleString('pt-BR')}
                        </td>
                        <td style="padding: 0.6rem 0.75rem; text-align: center; color: #64748b;">
                            <div style="display: flex; align-items: center; justify-content: center; gap: 4px;">
                                <div style="width: 45px; height: 6px; background: #e2e8f0; border-radius: 9999px; overflow: hidden;">
                                    <div style="height: 100%; width: ${proc.percentual}%; background: #0284c7;"></div>
                                </div>
                                <span style="font-size: 0.72rem;">${proc.percentual}%</span>
                            </div>
                        </td>
                        <td style="padding: 0.6rem 0.75rem; text-align: right; color: #475569;">
                            ${vlUnitStr}
                        </td>
                        <td style="padding: 0.6rem 0.75rem; text-align: right; font-weight: 700; color: #16a34a;">
                            ${vlTotStr}
                        </td>
                    </tr>`;
            });

            const cnsBadge = p.cns && !p.cns.startsWith('Consolidado') && !p.cns.startsWith('CBO')
                ? `<span style="font-size: 0.72rem; background: #e0f2fe; color: #0369a1; padding: 1px 6px; border-radius: 4px; font-weight: 700;">CNS: ${p.cns}</span>`
                : `<span style="font-size: 0.72rem; background: #ecfdf5; color: #059669; padding: 1px 6px; border-radius: 4px; font-weight: 700;"><i class="fas fa-layer-group"></i> ${p.cns || 'BPA-C'}</span>`;

            let vinculoBadge = '';
            if (p.isConsolidadoBpaC) {
                vinculoBadge = `<span style="font-size: 0.7rem; background: #f1f5f9; color: #475569; padding: 2px 7px; border-radius: 9999px; font-weight: 700;"><i class="fas fa-layer-group"></i> Coletivo CBO</span>`;
            } else if (p.vinculoConfirmado) {
                vinculoBadge = `<span style="font-size: 0.7rem; background: #dcfce7; color: #166534; padding: 2px 7px; border-radius: 9999px; font-weight: 700;" title="Vínculo confirmado no CNES desta unidade na competência consultada"><i class="fas fa-check-circle"></i> CNES Regular</span>`;
            } else if (p.vinculoAlerta) {
                vinculoBadge = `<span style="font-size: 0.7rem; background: #fef9c3; color: #854d0e; padding: 2px 7px; border-radius: 9999px; font-weight: 700; border: 1px solid #fde047;" title="Atenção: CNS não consta cadastrado como ativo no CNES desta unidade na competência. Risco de glosa no DATASUS."><i class="fas fa-exclamation-triangle"></i> Sem Vínculo CNES</span>`;
            }

            let equipeCallout = '';
            if (p.membrosEquipe && p.membrosEquipe.length > 0) {
                const listProfs = p.membrosEquipe.map(m => `
                    <span style="display: inline-flex; align-items: center; gap: 4px; background: #e0f2fe; color: #0369a1; padding: 2px 8px; border-radius: 9999px; font-size: 0.72rem; font-weight: 600;">
                        <i class="fas fa-user-md"></i> ${m.nome} (CNS: ${m.cns})
                    </span>
                `).join(' ');
                equipeCallout = `
                    <div style="margin: 0.75rem 0; padding: 0.6rem 0.85rem; background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 0.5rem;">
                        <div style="font-size: 0.75rem; font-weight: 700; color: #0369a1; margin-bottom: 0.35rem;">
                            <i class="fas fa-info-circle"></i> Profissionais cadastrados no CNES para esta especialidade na unidade (${p.membrosEquipe.length}):
                        </div>
                        <div style="display: flex; flex-wrap: wrap; gap: 6px;">${listProfs}</div>
                    </div>`;
            }

            html += `
                <div class="bpa-prof-card" style="border: 1px solid #e2e8f0; border-radius: 0.65rem; background: #ffffff; overflow: hidden; box-shadow: 0 1px 2px rgba(0,0,0,0.03);">
                    <!-- TOPO DO CARD DO PROFISSIONAL -->
                    <div onclick="window.ProducaoProfissionalModule.toggleExpand('${safeKey}')" style="padding: 1rem 1.25rem; display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 1rem; cursor: pointer; user-select: none; background: #ffffff; transition: background 0.15s ease;">
                        <div style="display: flex; align-items: center; gap: 1rem; min-width: 250px;">
                            <div style="width: 42px; height: 42px; border-radius: 50%; background: #f0fdf4; border: 1px solid #bbf7d0; color: #16a34a; display: flex; align-items: center; justify-content: center; font-size: 1.1rem;">
                                <i class="fas fa-user-md"></i>
                            </div>
                            <div>
                                <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                                    <span style="font-weight: 800; color: #0f172a; font-size: 0.95rem;">${p.nome}</span>
                                    ${cnsBadge}
                                    ${vinculoBadge}
                                </div>
                                <div style="font-size: 0.78rem; color: #64748b; margin-top: 2px;">
                                    <span><i class="fas fa-stethoscope"></i> ${p.cboDesc}</span>
                                    <span style="margin: 0 4px;">•</span>
                                    <span><i class="fas fa-hospital"></i> ${p.unidadesFormatadas}</span>
                                </div>
                            </div>
                        </div>

                        <div style="display: flex; align-items: center; gap: 1.25rem; margin-left: auto; flex-wrap: wrap;">
                            <div style="text-align: right;">
                                <div style="font-size: 0.72rem; color: #64748b; text-transform: uppercase; font-weight: 600;">Atendimentos</div>
                                <div style="font-size: 1.15rem; font-weight: 800; color: #0f172a;">
                                    ${p.totalAtendimentos.toLocaleString('pt-BR')} <span style="font-size: 0.72rem; font-weight: 600; color: #64748b;">pacientes</span>
                                </div>
                            </div>

                            <div style="text-align: right;">
                                <div style="font-size: 0.72rem; color: #64748b; text-transform: uppercase; font-weight: 600;">Procedimentos</div>
                                <div style="font-size: 1.15rem; font-weight: 800; color: #0284c7;">
                                    ${p.totalQuantidade.toLocaleString('pt-BR')} <span style="font-size: 0.72rem; font-weight: 600; color: #64748b;">produzidos</span>
                                </div>
                            </div>

                            <div style="text-align: right;">
                                <div style="font-size: 0.72rem; color: #64748b; text-transform: uppercase; font-weight: 600;">Valor SIGTAP</div>
                                <div style="font-size: 1.1rem; font-weight: 800; color: #16a34a;">
                                    ${p.totalValorFormatado}
                                </div>
                            </div>

                            <button type="button" class="btn btn-sm btn-secondary" style="border-radius: 9999px; padding: 0.35rem 0.75rem; font-size: 0.75rem; display: flex; align-items: center; gap: 6px;">
                                <span>Procedimentos (${p.procedimentos.length})</span>
                                <i class="fas ${chevronIcon}"></i>
                            </button>
                        </div>
                    </div>

                    <!-- TABELA EXPANSÍVEL DE PROCEDIMENTOS -->
                    <div id="prof_details_${safeKey}" style="display: ${displayStyle}; padding: 0 1.25rem 1.25rem; border-top: 1px dashed #e2e8f0; background: #fafafa;">
                        <div style="margin: 0.75rem 0 0.5rem; font-weight: 700; font-size: 0.78rem; color: #334155; display: flex; justify-content: space-between; align-items: center;">
                            <span><i class="fas fa-list-ol" style="color: #0284c7;"></i> Procedimentos Realizados (${p.cns || p.nome}):</span>
                            <span style="color: #64748b; font-weight: 500;">Competência(s): ${p.competencias}</span>
                        </div>
                        ${equipeCallout}

                        <div style="overflow-x: auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 0.5rem;">
                            <table style="width: 100%; border-collapse: collapse; text-align: left;">
                                <thead>
                                    <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0; font-size: 0.72rem; color: #64748b; text-transform: uppercase;">
                                        <th style="padding: 0.5rem 0.75rem;">Código SIGTAP</th>
                                        <th style="padding: 0.5rem 0.75rem;">Descrição do Procedimento</th>
                                        <th style="padding: 0.5rem 0.75rem; text-align: center;">Quantidade</th>
                                        <th style="padding: 0.5rem 0.75rem; text-align: center;">% na Produção</th>
                                        <th style="padding: 0.5rem 0.75rem; text-align: right;">Valor Unit.</th>
                                        <th style="padding: 0.5rem 0.75rem; text-align: right;">Total R$</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${procsTableRows}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>`;
        });

        container.innerHTML = html;
    },

    toggleExpand(key) {
        if (this.expandedProfs.has(key)) {
            this.expandedProfs.delete(key);
        } else {
            this.expandedProfs.add(key);
        }
        const el = document.getElementById(`prof_details_${key}`);
        if (el) {
            el.style.display = this.expandedProfs.has(key) ? 'block' : 'none';
        }
        this.render();
    },

    toggleExpandAll(expand = true) {
        const profs = this.getFilteredAndAggregatedProfissionais();
        if (expand) {
            profs.forEach(p => {
                const safeKey = String(p.cns || p.nome).replace(/[^a-zA-Z0-9_]/g, '_');
                this.expandedProfs.add(safeKey);
            });
        } else {
            this.expandedProfs.clear();
        }
        this.render();
    },

    exportCSV() {
        const profs = this.getFilteredAndAggregatedProfissionais();
        if (profs.length === 0) {
            alert('Nenhuma produção de profissional para exportar.');
            return;
        }

        const rows = [
            ['CNS', 'Profissional', 'CBO', 'Ocupacao', 'Unidade', 'Competencias', 'Codigo_Procedimento', 'Procedimento_Nome', 'Quantidade', 'Valor_Unitario_RS', 'Valor_Total_RS']
        ];

        profs.forEach(p => {
            (p.procedimentos || []).forEach(proc => {
                rows.push([
                    p.cns,
                    p.nome,
                    p.cbo,
                    p.cboDesc,
                    p.unidadesFormatadas,
                    p.competencias,
                    proc.codigo,
                    proc.nome,
                    proc.quantidade,
                    (proc.valorUnitario || 0).toFixed(2).replace('.', ','),
                    (proc.valorTotal || 0).toFixed(2).replace('.', ',')
                ]);
            });
        });

        const csvContent = '\uFEFF' + rows.map(r => r.map(col => `"${String(col || '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `producao_profissional_cns_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
};

// Precarregamento automático de bases e dados em segundo plano
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const autoInitProducaoProf = () => {
        if (window.ProducaoProfissionalModule) {
            window.ProducaoProfissionalModule.loadBases().then(() => {
                window.ProducaoProfissionalModule.loadData();
            }).catch(e => console.warn('Falha no pré-carregamento de Produção Profissional:', e));
        }
    };
    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', autoInitProducaoProf);
    } else {
        autoInitProducaoProf();
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = window.ProducaoProfissionalModule;
}

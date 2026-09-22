/* Pente Fino ARGOS: Auditoria Anti-Glosa determinística, validação em 5 regras e certificação de envio SIA/SUS. */
(function(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    }
    if (typeof root !== 'undefined') {
        root.PenteFinoEngine = api;
        root.MalhaFinaEngine = api; // Alias garantindo 100% de retrocompatibilidade
    }
})(typeof window !== 'undefined' ? window : globalThis, function() {
    'use strict';

    let ultimoResultado = null;
    let executando = false;
    let paginaAtual = 0;
    let filtroAtual = '';
    const tamanhoPagina = 75;

    const rotulo = v => String(v || '').replace(/_/g, ' ').toLowerCase().replace(/^./, c => c.toUpperCase());
    const escapar = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const fmtMoeda = v => {
        const n = typeof v === 'number' ? v : Number(v);
        return Number.isFinite(n) ? n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—';
    };
    const fmtTotal = v => v === null || v === undefined ? 'Não disponível' : fmtMoeda(v);

    async function carregarJson(url, sha256Esperado) {
        const r = await fetch(url, { cache: 'no-store' });
        if (!r.ok) throw new Error('HTTP ' + r.status + ' ao carregar ' + url);
        const body = await r.text();
        if (sha256Esperado && typeof window !== 'undefined' && window.crypto?.subtle) {
            const digest = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(body));
            const actual = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
            if (actual !== sha256Esperado) throw new Error('SHA-256 do arquivo diverge do manifesto.');
        }
        return JSON.parse(body.replace(/^\uFEFF/, ''));
    }

    async function cnesPublishedEntries() {
        const entries = {};
        try {
            const auto = await carregarJson('cnes_data/auto/manifest.json');
            if (auto?.scope?.municipality_ibge !== '210120' || !auto.competencies || Array.isArray(auto.competencies)) return entries;
            for (const [cm, item] of Object.entries(auto.competencies)) {
                const relative = String(item?.snapshot?.path || '');
                if (!/^\d{4}(0[1-9]|1[0-2])$/.test(cm) || item?.status !== 'published' || !new RegExp('^snapshots/' + cm + '/rev-[0-9]+-[a-f0-9]{64}\\.json$').test(relative)) continue;
                if (!/^[a-f0-9]{64}$/.test(String(item.snapshot.sha256 || ''))) continue;
                const valid = item.coverage?.st === true && item.coverage?.pf === true && item.counts?.quarantined === 0;
                entries[cm] = {
                    url: 'cnes_data/auto/' + relative,
                    fonte: 'DATASUS CNES ST/PF (PySUS FTP origin)',
                    oficial: true,
                    completo: valid,
                    cobertura: { profissionais: item.coverage?.pf === true && item.counts?.quarantined === 0, servicos: item.coverage?.services === true, habilitacoes: item.coverage?.habilitations === true },
                    sha256: item.snapshot.sha256
                };
            }
        } catch (_error) {
            /* Sem publicação automática; usa somente manifesto legado. */
        }
        return entries;
    }

    let aliasesCache = null;

    function normalizarCompAAAAMM(valor) {
        const s = String(valor || '').trim();
        let m = s.match(/^(\d{4})[-\/]?(\d{2})$/);
        if (m && /^\d{4}(0[1-9]|1[0-2])$/.test(m[1] + m[2])) return m[1] + m[2];
        m = s.match(/^(0[1-9]|1[0-2])\/(\d{4})$/);
        if (m) return m[2] + m[1];
        const d = s.replace(/\D/g, '');
        if (/^\d{4}(0[1-9]|1[0-2])$/.test(d)) return d;
        return '';
    }

    // Cabeçalhos de sessão para a API CNES (mesmo padrão do menu CNES e do anexo de produção).
    async function cabecalhosCnesAutorizados() {
        const headers = {};
        try {
            const g = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : {});
            const supa = g.SupabaseConfig;
            const client = supa && typeof supa.getClient === 'function' ? supa.getClient() : null;
            if (client && client.auth && typeof client.auth.getSession === 'function') {
                const sessionResult = await client.auth.getSession().catch(() => null);
                const token = sessionResult && sessionResult.data && sessionResult.data.session && sessionResult.data.session.access_token;
                if (token) headers.Authorization = `Bearer ${token}`;
            }
            if (!headers.Authorization && supa && typeof supa.getAnonKey === 'function') {
                const anon = supa.getAnonKey();
                if (anon) headers.Authorization = `Bearer ${anon}`;
            }
        } catch (_) {}
        return headers;
    }

    // Base CNES pela API autorizada (mesmo canal do menu CNES & Vínculos e do anexo de produção).
    // O acesso estático direto (/cnes_data/*) é bloqueado com 403 sob server.js.
    async function carregarBaseCnesViaApi(cm) {
        const r = await fetch(`/api/cnes/bacabal?competencia=${cm}`, { cache: 'no-store', headers: await cabecalhosCnesAutorizados() });
        if (!r.ok) throw new Error('HTTP ' + r.status + ' na API CNES');
        const data = await r.json();
        if (String(data.codigoIbge || '') !== '210120') throw new Error('Snapshot CNES da API fora do escopo Bacabal.');
        const declared = normalizarCompAAAAMM(data.competencia || '');
        if (declared !== cm) throw new Error('Competência interna da base diverge da solicitada.');
        if (!Array.isArray(data.estabelecimentos)) throw new Error('Resposta da API CNES sem estabelecimentos.');
        const publicado = data.source_type === 'published_snapshot' || data.sourceType === 'published_snapshot';
        const coberturaApi = data.coverage || {};
        const countsApi = data.counts || {};
        const completo = publicado
            ? (coberturaApi.st === true && coberturaApi.pf === true && countsApi.quarantined === 0)
            : true;
        const cobertura = publicado
            ? { profissionais: coberturaApi.pf === true && countsApi.quarantined === 0, servicos: coberturaApi.services === true, habilitacoes: coberturaApi.habilitacoes === true }
            : { profissionais: true, servicos: true, habilitacoes: true };
        return {
            ...data,
            competencia: declared,
            fonte: 'API CNES autorizada (/api/cnes/bacabal)' + (publicado ? ' — snapshot publicado' : ' — base legada'),
            oficial: true,
            completo,
            cobertura
        };
    }

    function normalizarMapaAliases(data) {
        const mapa = data && data.municipio_ibge === '210120' && data.aliases && typeof data.aliases === 'object' ? data.aliases : {};
        const normalizado = {};
        for (const [atual, lista] of Object.entries(mapa)) {
            const principal = String(atual).replace(/\D/g, '');
            const historicos = [...new Set((Array.isArray(lista) ? lista : [lista]).map(x => String(x ?? '').replace(/\D/g, '')).filter(x => /^\d{7}$/.test(x) && x !== principal))];
            if (/^\d{7}$/.test(principal) && historicos.length) normalizado[principal] = historicos;
        }
        return normalizado;
    }

    async function carregarAliasesVersionados() {
        if (aliasesCache) return aliasesCache;
        aliasesCache = {};
        try {
            const data = await carregarJson('cnes_data/cnes_aliases_210120.json');
            Object.assign(aliasesCache, normalizarMapaAliases(data));
            if (Object.keys(aliasesCache).length) return aliasesCache;
        } catch (_) {}
        try {
            const r = await fetch('/api/cnes/aliases?ibge=210120', { cache: 'no-store', headers: await cabecalhosCnesAutorizados() });
            if (!r.ok) throw new Error('HTTP ' + r.status + ' na API de aliases');
            Object.assign(aliasesCache, normalizarMapaAliases(await r.json()));
        } catch (_) {}
        return aliasesCache;
    }

    function fontesVivasCnes() {
        const fontes = [];
        try {
            const g = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : {});
            const estado = g.CnesModule?.state;
            if (estado && Array.isArray(estado.estabelecimentos) && estado.estabelecimentos.length) {
                fontes.push({ estabelecimentos: estado.estabelecimentos, competencia: normalizarCompAAAAMM(estado.competenciaAtiva || estado.competencia || ''), origem: 'Menu CNES & Vínculos (vínculos vigentes em tempo de execução)' });
            }
            const argos = g.ArgosCnesBase;
            if (argos && Array.isArray(argos.estabelecimentos) && argos.estabelecimentos.length) {
                fontes.push({ estabelecimentos: argos.estabelecimentos, competencia: normalizarCompAAAAMM(argos.competencia || ''), origem: 'Cache CNES vigente (tempo de execução)' });
            }
            const ppc = g.ProducaoProfissionalModule?.cnesCache;
            if (ppc && Array.isArray(ppc.estabelecimentos) && ppc.estabelecimentos.length) {
                fontes.push({ estabelecimentos: ppc.estabelecimentos, competencia: normalizarCompAAAAMM(ppc.competencia || ''), origem: 'Cache de produção (tempo de execução)' });
            }
        } catch (_) {}
        return fontes;
    }

    // Enriquecimento auditável da base CNES da competência (contrato: mesma fonte do menu CNES & Vínculos).
    // 1. Aliases históricos versionados (identidade de unidade, sem alterar fatos cadastrais).
    // 2. Vínculos vigentes das fontes vivas SOMENTE da mesma competência (aditivo; fail-closed preservado).
    async function enriquecerBaseCnes(cm, baseCnes, sources) {
        const dig = v => String(v ?? '').replace(/\D/g, '');
        const unidades = Array.isArray(baseCnes.estabelecimentos) ? baseCnes.estabelecimentos : [];
        const porCodigo = new Map();
        for (const u of unidades) {
            if (dig(u.cnes)) porCodigo.set(dig(u.cnes), u);
        }
        const aliases = await carregarAliasesVersionados();
        let aliasesAplicados = 0;
        for (const [principal, historicos] of Object.entries(aliases)) {
            const alvo = porCodigo.get(principal);
            if (!alvo) continue;
            alvo.aliases = [...new Set([...(Array.isArray(alvo.aliases) ? alvo.aliases.map(String) : []), ...historicos])];
            for (const h of historicos) if (!porCodigo.has(h)) porCodigo.set(h, alvo);
            aliasesAplicados++;
        }
        if (aliasesAplicados > 0) {
            sources.push({ tipo: 'CNES aliases', competencia: cm, estado: 'Aplicados', fonte: 'cnes_data/cnes_aliases_210120.json (códigos históricos versionados)' });
        }
        const vivas = fontesVivasCnes().filter(f => f.competencia && f.competencia === cm);
        let vinculosAdicionados = 0;
        for (const fonte of vivas) {
            for (const u of (fonte.estabelecimentos || [])) {
                const alvo = porCodigo.get(dig(u.cnes));
                if (!alvo || !Array.isArray(u.profissionais)) continue;
                alvo.profissionais = Array.isArray(alvo.profissionais) ? alvo.profissionais : [];
                const conhecidos = new Set(alvo.profissionais.map(p => dig(p.cns || p.cnsMaster)));
                for (const p of u.profissionais) {
                    const cns = dig(p.cns || p.cnsMaster);
                    if (cns && !conhecidos.has(cns)) {
                        conhecidos.add(cns);
                        alvo.profissionais.push({ cns: p.cns || p.cnsMaster, cnsMaster: p.cnsMaster || p.cns, cbo: p.cbo, nome: p.nome, fonteViva: true });
                        vinculosAdicionados++;
                    }
                }
            }
        }
        if (vinculosAdicionados > 0) {
            sources.push({ tipo: 'CNES vínculos vigentes', competencia: cm, estado: `${vinculosAdicionados} vínculo(s) incorporado(s)`, fonte: vivas.map(v => v.origem).filter((v, i, a) => a.indexOf(v) === i).join('; ') });
        }
    }

    async function loadBases(competencias) {
        let manifest, sources = [];
        try {
            manifest = await carregarJson('audit_data/manifest.json');
        } catch (e) {
            manifest = { cnes: {}, sigtap: {} };
            sources.push({ tipo: 'Manifesto legado', competencia: '', estado: 'Indisponível', fonte: e.message });
        }
        const legadoCnes = { ...(manifest.cnes || {}) };
        manifest.cnes = { ...legadoCnes, ...await cnesPublishedEntries() };
        const bases = {};
        await Promise.all(competencias.filter(Boolean).map(async cm => {
            bases[cm] = {};
            // CNES: estático fundido -> API autorizada (mesmo canal do anexo/menu) -> estático legado.
            const candidatosCnes = [];
            if (manifest.cnes?.[cm]) candidatosCnes.push({ origem: 'static', item: manifest.cnes[cm] });
            candidatosCnes.push({ origem: 'api' });
            if (legadoCnes[cm] && legadoCnes[cm].url !== manifest.cnes?.[cm]?.url) candidatosCnes.push({ origem: 'static', item: legadoCnes[cm] });
            for (const cand of candidatosCnes) {
                try {
                    if (cand.origem === 'api') {
                        bases[cm].cnes = await carregarBaseCnesViaApi(cm);
                    } else {
                        const data = await carregarJson(cand.item.url, cand.item.sha256);
                        const declared = data.competencia || data.versao?.replace(/\D/g, '');
                        if (declared !== cm) throw new Error('Competência interna da base diverge da solicitada.');
                        bases[cm].cnes = { ...data, competencia: declared, fonte: cand.item.fonte, oficial: cand.item.oficial === true, completo: cand.item.completo === true, cobertura: cand.item.cobertura || {} };
                    }
                    try {
                        const mapa = (typeof window !== 'undefined' && window.DATASUS_VINCULOS_BACABAL) || await carregarJson('cnes_data/datasus_vinculos.json');
                        bases[cm].cnes.mapaVinculos = mapa;
                        if (typeof window !== 'undefined') window.DATASUS_VINCULOS_BACABAL = mapa;
                    } catch (_) {}
                    sources.push({ tipo: 'CNES', competencia: cm, estado: bases[cm].cnes.oficial ? 'Carregado' : 'Origem não validada', fonte: bases[cm].cnes.fonte });
                    break;
                } catch (e) {
                    sources.push({ tipo: 'CNES', competencia: cm, estado: 'Indisponível', fonte: (cand.origem === 'api' ? 'API CNES autorizada' : (cand.item.url || 'base local')) + ': ' + e.message });
                }
            }
            // SIGTAP: tentativa única pela relação oficial da competência.
            const itemSigtap = manifest.sigtap?.[cm];
            if (!itemSigtap) {
                sources.push({ tipo: 'SIGTAP local', competencia: cm, estado: 'Sem base local', fonte: 'Base desta competência ausente' });
            } else {
                try {
                    const data = await carregarJson(itemSigtap.url, itemSigtap.sha256);
                    const declared = data.competencia || data.versao?.replace(/\D/g, '');
                    if (declared !== cm) throw new Error('Competência interna da base diverge da solicitada.');
                    bases[cm].sigtap = { ...data, competencia: declared, fonte: itemSigtap.fonte, oficial: itemSigtap.oficial === true, completo: itemSigtap.completo === true, cobertura: itemSigtap.cobertura || {} };
                    sources.push({ tipo: 'SIGTAP', competencia: cm, estado: itemSigtap.oficial ? 'Carregado' : 'Origem não validada', fonte: itemSigtap.fonte || itemSigtap.url });
                } catch (e) {
                    sources.push({ tipo: 'SIGTAP', competencia: cm, estado: 'Indisponível', fonte: e.message });
                }
            }
            if (bases[cm].cnes) {
                await enriquecerBaseCnes(cm, bases[cm].cnes, sources);
            }
        }));
        return { bases, sources };
    }

    async function calcularHash(texto) {
        if (typeof window === 'undefined' || !window.crypto?.subtle) return 'Indisponível';
        const bytes = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
        return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
    }

    function mascararCns(cns) {
        const s = String(cns ?? '').trim();
        if (!s) return '—';
        const num = s.replace(/\D/g, '');
        if (num.length === 15) {
            return num.slice(0, 3) + '*********' + num.slice(-3);
        }
        if (s.length > 6) {
            return s.slice(0, 3) + '*'.repeat(s.length - 6) + s.slice(-3);
        }
        return s;
    }

    const RULES = {
        regra1_lotacao_cnes: {
            id: 1,
            codigo: 'regra1_lotacao_cnes',
            titulo: 'Lotação do Profissional no CNES',
            descricao: 'O profissional identificado está lotado e ativo no estabelecimento de saúde na competência do atendimento.',
            regrasCore: ['VINCULO_PROFISSIONAL', 'UNIDADE_CNES', 'BASE_CNES']
        },
        regra2_cbo_procedimento: {
            id: 2,
            codigo: 'regra2_cbo_procedimento',
            titulo: 'CBO Habilitado ao Procedimento',
            descricao: 'Aqueles procedimentos estão habilitados àquele CBO conforme a tabela oficial do SIGTAP.',
            regrasCore: ['CBO_SIGTAP', 'CBO_FORMATO', 'CBOS']
        },
        regra3_cid_procedimento: {
            id: 3,
            codigo: 'regra3_cid_procedimento',
            titulo: 'CID Habilitado ao Procedimento',
            descricao: 'O CID diagnosticado está habilitado para o procedimento na tabela do SIGTAP.',
            regrasCore: ['CID', 'CID_FORMATO', 'CIDS']
        },
        regra4_servico_classificacao: {
            id: 4,
            codigo: 'regra4_servico_classificacao',
            titulo: 'Serviço e Classificação no SIGTAP',
            descricao: 'Esses serviços e classificações estão habilitados no SIGTAP para o procedimento.',
            regrasCore: ['BASE_SIGTAP', 'PROCEDIMENTO_VIGENTE', 'SERVICO_INFORMADO', 'SERVICO_CLASSIFICACAO']
        },
        regra5_cns_profissional: {
            id: 5,
            codigo: 'regra5_cns_profissional',
            titulo: 'Cartão SUS (CNS) do Profissional',
            descricao: 'O cartão SUS do profissional está correto e atende ao cálculo do dígito verificador módulo 11.',
            regrasCore: ['CNS_PROFISSIONAL']
        }
    };

    /**
     * Classifica os apontamentos da auditoria nas 5 Regras Anti-Glosa solicitadas:
     * 1. Lotação do profissional no estabelecimento (CNES)
     * 2. Habilitação CBO x Procedimento (SIGTAP)
     * 3. Habilitação CID x Procedimento (SIGTAP)
     * 4. Habilitação Serviços e Classificações no SIGTAP
     * 5. Validação estrutural do Cartão SUS do profissional (CNS)
     */
    function classificar5Regras(resultadoAuditoria) {
        if (!resultadoAuditoria || typeof resultadoAuditoria !== 'object') {
            return {
                regra1_lotacao_cnes: { id: 1, codigo: 'regra1_lotacao_cnes', ok: false, glosas: [], totalGlosas: 0, status: 'NAO_VERIFICADO', titulo: RULES.regra1_lotacao_cnes.titulo, descricao: RULES.regra1_lotacao_cnes.descricao },
                regra2_cbo_procedimento: { id: 2, codigo: 'regra2_cbo_procedimento', ok: false, glosas: [], totalGlosas: 0, status: 'NAO_VERIFICADO', titulo: RULES.regra2_cbo_procedimento.titulo, descricao: RULES.regra2_cbo_procedimento.descricao },
                regra3_cid_procedimento: { id: 3, codigo: 'regra3_cid_procedimento', ok: false, glosas: [], totalGlosas: 0, status: 'NAO_VERIFICADO', titulo: RULES.regra3_cid_procedimento.titulo, descricao: RULES.regra3_cid_procedimento.descricao },
                regra4_servico_classificacao: { id: 4, codigo: 'regra4_servico_classificacao', ok: false, glosas: [], totalGlosas: 0, status: 'NAO_VERIFICADO', titulo: RULES.regra4_servico_classificacao.titulo, descricao: RULES.regra4_servico_classificacao.descricao },
                regra5_cns_profissional: { id: 5, codigo: 'regra5_cns_profissional', ok: false, glosas: [], totalGlosas: 0, status: 'NAO_VERIFICADO', titulo: RULES.regra5_cns_profissional.titulo, descricao: RULES.regra5_cns_profissional.descricao },
                outrasGlosas: [],
                bloqueadoresGlobais: [],
                podeEnviarSemGlosa: false,
                parecer: {
                    podeEnviarSemGlosa: false,
                    status: 'BLOQUEADO',
                    totalGlosas: 1,
                    regrasComGlosa: ['Auditoria Inconclusiva'],
                    mensagem: 'Auditoria não realizada ou dados ausentes.'
                }
            };
        }

        const findings = Array.isArray(resultadoAuditoria.findings) ? resultadoAuditoria.findings : [];
        const checks = resultadoAuditoria.checks || {};

        const regrasClassificadas = {};
        const allMappedRuleKeys = new Set();

        for (const [chave, rDef] of Object.entries(RULES)) {
            rDef.regrasCore.forEach(k => allMappedRuleKeys.add(k));
            const achados = findings.filter(f => rDef.regrasCore.includes(f.regra));

            // Prioridade de estado da regra: NAO_CONFORME, NAO_VERIFICADO, ALERTA, CONFORME, NAO_APLICAVEL
            let estado = 'CONFORME';
            if (achados.some(f => f.status === 'NAO_CONFORME')) {
                estado = 'NAO_CONFORME';
            } else if (achados.some(f => f.status === 'NAO_VERIFICADO')) {
                estado = 'NAO_VERIFICADO';
            } else if (achados.some(f => f.status === 'ALERTA')) {
                estado = 'ALERTA';
            } else {
                let hasConforme = false;
                let hasNaoAplicavel = false;
                for (const k of rDef.regrasCore) {
                    const c = checks[k];
                    if (c?.CONFORME > 0) hasConforme = true;
                    if (c?.NAO_APLICAVEL > 0) hasNaoAplicavel = true;
                }
                if (hasConforme) estado = 'CONFORME';
                else if (hasNaoAplicavel) estado = 'NAO_APLICAVEL';
                else estado = 'CONFORME';
            }

            const ok = estado === 'CONFORME' || estado === 'NAO_APLICAVEL';
            const glosas = achados.filter(f => ['NAO_CONFORME', 'NAO_VERIFICADO', 'ALERTA'].includes(f.status));

            regrasClassificadas[chave] = {
                id: rDef.id,
                codigo: rDef.codigo,
                titulo: rDef.titulo,
                descricao: rDef.descricao,
                status: estado,
                ok: ok,
                glosas: glosas,
                totalGlosas: glosas.length
            };
        }

        // Bloqueadores globais: ESTRUTURA, ARQUIVO, DUPLICIDADE e quaisquer achados não mapeados com falha/alerta/pendência
        const bloqueadoresGlobais = findings.filter(f =>
            (!allMappedRuleKeys.has(f.regra) || ['ESTRUTURA', 'ARQUIVO', 'DUPLICIDADE'].includes(f.regra)) &&
            ['NAO_CONFORME', 'NAO_VERIFICADO', 'ALERTA'].includes(f.status)
        );

        // Se o status da auditoria for INCONCLUSIVO ou NAO_CONFORME e não houver achados na lista
        if (resultadoAuditoria.status && resultadoAuditoria.status !== 'CONFORME' && findings.length === 0) {
            bloqueadoresGlobais.push({
                regra: 'ESTRUTURA',
                status: 'NAO_CONFORME',
                mensagem: 'Status geral da auditoria não conforme: ' + resultadoAuditoria.status
            });
        }

        const parecer = avaliarParecerFinal({
            ...regrasClassificadas,
            outrasGlosas: bloqueadoresGlobais,
            bloqueadoresGlobais: bloqueadoresGlobais
        });

        return {
            ...regrasClassificadas,
            outrasGlosas: bloqueadoresGlobais,
            bloqueadoresGlobais: bloqueadoresGlobais,
            podeEnviarSemGlosa: parecer.podeEnviarSemGlosa,
            parecer: parecer
        };
    }

    // Apontamento sem estado explícito é tratado como glosa (fail-closed conservador).
    function ehGlosaConfirmada(apontamento) {
        const estado = apontamento?.status;
        return estado !== 'NAO_VERIFICADO' && estado !== 'ALERTA';
    }

    function avaliarParecerFinal(regras, globalBlockers = []) {
        const chaves = ['regra1_lotacao_cnes', 'regra2_cbo_procedimento', 'regra3_cid_procedimento', 'regra4_servico_classificacao', 'regra5_cns_profissional'];
        let totalGlosas = 0;
        let totalPendencias = 0;
        const regrasComGlosa = [];
        const regrasComPendencia = [];

        for (const chave of chaves) {
            const r = regras?.[chave];
            if (r && !r.ok) {
                const apontamentos = Array.isArray(r.glosas) && r.glosas.length ? r.glosas : [{}];
                const glosas = apontamentos.filter(ehGlosaConfirmada).length;
                const pendencias = apontamentos.length - glosas;
                totalGlosas += glosas;
                totalPendencias += pendencias;
                if (glosas > 0) regrasComGlosa.push(r.titulo || chave);
                if (pendencias > 0) regrasComPendencia.push(r.titulo || chave);
            }
        }

        const blockers = [
            ...(Array.isArray(globalBlockers) ? globalBlockers : []),
            ...(Array.isArray(regras?.outrasGlosas) ? regras.outrasGlosas : []),
            ...(Array.isArray(regras?.bloqueadoresGlobais) ? regras.bloqueadoresGlobais : [])
        ];
        const uniqueBlockers = [...new Set(blockers)];
        const glosasGlobais = uniqueBlockers.filter(ehGlosaConfirmada).length;
        const pendenciasGlobais = uniqueBlockers.length - glosasGlobais;
        if (glosasGlobais > 0) {
            totalGlosas += glosasGlobais;
            regrasComGlosa.push('Bloqueios Globais / Estruturais');
        }
        if (pendenciasGlobais > 0) {
            totalPendencias += pendenciasGlobais;
            regrasComPendencia.push('Pendências Globais / Verificação incompleta');
        }

        const podeEnviar = totalGlosas === 0 && totalPendencias === 0;
        const status = podeEnviar ? 'APROVADO' : (totalGlosas > 0 ? 'BLOQUEADO' : 'INCONCLUSIVO');
        const mensagem = podeEnviar
            ? 'Pode enviar a produção sem glosa'
            : (totalGlosas > 0
                ? `Foram detectadas ${totalGlosas} ocorrência(s) de glosa nas regras do Pente Fino.` + (totalPendencias > 0 ? ` Além disso, ${totalPendencias} pendência(s) exigem conferência.` : '')
                : `Auditoria inconclusiva: ${totalPendencias} pendência(s) exigem conferência antes do envio sem glosa. Nenhuma glosa definitiva foi confirmada.`);

        return {
            podeEnviarSemGlosa: podeEnviar,
            status: status,
            totalGlosas: totalGlosas,
            totalPendencias: totalPendencias,
            regrasComGlosa: regrasComGlosa,
            regrasComPendencia: regrasComPendencia,
            mensagem: mensagem
        };
    }

    /**
     * Executa a auditoria completa e gera o diagnóstico estruturado com as 5 regras
     */
    async function auditar5Regras(parsedOuTexto, bases) {
        const core = (typeof window !== 'undefined' && window.BpaAuditCore) ? window.BpaAuditCore : (typeof globalThis !== 'undefined' && globalThis.BpaAuditCore ? globalThis.BpaAuditCore : null);
        if (!core) throw new Error('BpaAuditCore não está carregado.');

        let parsed = parsedOuTexto;
        if (typeof parsedOuTexto === 'string') {
            parsed = core.parse(parsedOuTexto);
        }

        const resultadoCore = core.audit(parsed, bases || {});
        const classificacao = classificar5Regras(resultadoCore);

        return {
            ...resultadoCore,
            classificacao5Regras: classificacao,
            podeEnviarSemGlosa: classificacao.podeEnviarSemGlosa,
            parecerFinal: classificacao.parecer
        };
    }

    function obterOuCriarModalResultados() {
        let m = document.getElementById('modalMalhaFinaResultados');
        if (!m) {
            m = document.createElement('div');
            m.id = 'modalMalhaFinaResultados';
            m.className = 'mf-modal-results-overlay hidden';
            m.setAttribute('role', 'dialog');
            m.setAttribute('aria-modal', 'true');
            m.setAttribute('aria-label', 'Diagnóstico Pente Fino da Produção BPA');
            m.innerHTML = '<div class="mf-modal-results-wrapper"><button type="button" class="mf-btn-close" onclick="PenteFinoEngine.fecharModalResultados()" aria-label="Fechar diagnóstico">×</button><div id="malhaFinaResultadosContent" aria-live="polite"></div></div>';
            document.body.appendChild(m);
        }
        m.classList.remove('hidden');
        return document.getElementById('malhaFinaResultadosContent');
    }

    /**
     * Execução canônica única da auditoria de produção BPA.
     * Processa arquivo, bases da competência, SIGTAP API, audita e registra o resultado oficial.
     */
    async function executarAuditoria(selected, onProgress = () => {}) {
        const text = selected?.conteudo ?? selected?.conteudo_arquivo;
        if (typeof text !== 'string' || !text.trim()) {
            throw new Error('Selecione um arquivo BPA válido para auditar com o Pente Fino.');
        }
        const core = (typeof window !== 'undefined' && window.BpaAuditCore) ? window.BpaAuditCore : (typeof globalThis !== 'undefined' && globalThis.BpaAuditCore ? globalThis.BpaAuditCore : null);
        if (!core) throw new Error('BpaAuditCore não está carregado.');

        onProgress({ fase: 'bases', mensagem: 'Lendo arquivo e carregando bases oficiais da competência...' });
        const parsed = core.parse(text);
        const comps = [...new Set(parsed.records.map(r => core.competencia(r.competencia)))];
        const { bases, sources } = await loadBases(comps);

        const apiRecords = parsed.records.filter(r => !bases[r.competencia]?.sigtap);
        const sigtapApi = (typeof window !== 'undefined' && window.SigtapAuditApi) ? window.SigtapAuditApi : (typeof globalThis !== 'undefined' && globalThis.SigtapAuditApi ? globalThis.SigtapAuditApi : null);
        if (apiRecords.length && sigtapApi) {
            onProgress({ fase: 'sigtap', mensagem: 'Buscando relacionamentos oficiais de CBO, CID, serviços e habilitações no SIGTAP...' });
            const api = await sigtapApi.load(apiRecords);
            for (const [cm, sigtap] of Object.entries(api.bases)) {
                if (!bases[cm]) bases[cm] = {};
                bases[cm].sigtap = sigtap;
            }
            sources.push(...api.sources);
        }

        onProgress({ fase: '5regras', mensagem: 'Passando o Pente Fino ARGOS nas 5 regras anti-glosa...' });
        const computed = await auditar5Regras(parsed, bases);
        computed.arquivo = selected.nomeArquivo || selected.nome_arquivo || 'BPA';
        computed.sources = sources;
        computed.fingerprint = await calcularHash(text);

        ultimoResultado = computed;

        const bpaMod = (typeof window !== 'undefined' && window.BpaModule) ? window.BpaModule : (typeof globalThis !== 'undefined' && globalThis.BpaModule ? globalThis.BpaModule : null);
        if (bpaMod) {
            if (typeof bpaMod.setAuditResult === 'function') {
                bpaMod.setAuditResult(computed);
            } else {
                bpaMod.auditApproval = {
                    fingerprint: computed.fingerprint,
                    approvedAt: Date.now(),
                    podeEnviarSemGlosa: computed.podeEnviarSemGlosa === true,
                    status: computed.podeEnviarSemGlosa ? 'CONFORME' : 'COM_APONTAMENTOS',
                    totalApontamentos: computed.naoConformidades || computed.totalGlosas || 0,
                    detalhes: computed
                };
                if (typeof bpaMod.atualizarEstadoBotaoEnvio === 'function') {
                    bpaMod.atualizarEstadoBotaoEnvio();
                }
            }
        }

        return computed;
    }

    async function executar(dados) {
        if (executando) return;
        const bpaMod = (typeof window !== 'undefined' && window.BpaModule) ? window.BpaModule : null;
        const selected = dados || bpaMod?.filePendingUpload;
        const text = selected?.conteudo ?? selected?.conteudo_arquivo;
        if (typeof text !== 'string' || !text.trim()) {
            if (typeof alert !== 'undefined') alert('Selecione um arquivo BPA exportado para auditar.');
            return;
        }

        executando = true;
        ultimoResultado = null;
        paginaAtual = 0;
        filtroAtual = '';
        const box = obterOuCriarModalResultados();
        box.innerHTML = '<div class="mf-audit-summary"><h2>Iniciando Pente Fino Anti-Glosa...</h2><p>Lendo arquivo e carregando bases oficiais da competência.</p></div>';

        try {
            const computed = await executarAuditoria(selected, ({ mensagem }) => {
                box.innerHTML = `<div class="mf-audit-summary"><h2>Processando Pente Fino...</h2><p>${escapar(mensagem)}</p></div>`;
            });
            renderizarResultados();
            return computed;
        } catch (e) {
            box.innerHTML = '<div class="mf-audit-summary mf-inconclusivo"><h2>Auditoria do Pente Fino não concluída</h2><p>' + escapar(e.message) + '</p></div>';
        } finally {
            executando = false;
        }
        return ultimoResultado;
    }

    /**
     * Executa a auditoria com a exibição do Modal Holográfico 3D do Pente Fino ARGOS
     */
    async function executarComAnimacao3D(dados) {
        const bpaMod = (typeof window !== 'undefined' && window.BpaModule) ? window.BpaModule : null;
        const selected = dados || bpaMod?.filePendingUpload;
        const text = selected?.conteudo ?? selected?.conteudo_arquivo;
        if (typeof text !== 'string' || !text.trim()) {
            if (typeof alert !== 'undefined') alert('Selecione um arquivo BPA válido para auditar com o Pente Fino.');
            return;
        }

        if (typeof window !== 'undefined' && window.PenteFino3DRenderer) {
            return window.PenteFino3DRenderer.abrirScanner(selected, (atualizarProgresso) => {
                return executarAuditoria(selected, atualizarProgresso);
            });
        } else {
            return executar(dados);
        }
    }

    function renderizarResultados() {
        if (!ultimoResultado) return;
        const r = ultimoResultado;
        const box = obterOuCriarModalResultados();
        const c5 = r.classificacao5Regras || classificar5Regras(r);
        const podeEnviar = c5.podeEnviarSemGlosa;

        const temGlosas = (r.naoConformidades || 0) > 0;
        const temPendencias = ((r.naoVerificados || 0) + (r.alertas || 0)) > 0;
        const bannerHtml = podeEnviar
            ? `<div class="mf-audit-summary mf-conforme" style="background: linear-gradient(135deg, rgba(6, 78, 59, 0.9), rgba(6, 95, 70, 0.95)); border: 1px solid #10b981; color: #ecfdf5; box-shadow: 0 10px 25px -5px rgba(16, 185, 129, 0.4);">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem;">
                    <span class="mf-badge" style="background: #10b981; color: #022c22; font-weight: 800;">PENTE FINO ARGOS · APROVADO</span>
                    <span style="font-size: 0.85rem; font-weight: 600; color: #a7f3d0;"><i class="fas fa-check-circle"></i> 100% Conforme</span>
                </div>
                <h2 style="font-size: 1.4rem; margin: 0 0 0.4rem 0; color: #ffffff; display: flex; align-items: center; gap: 0.6rem;">
                    <i class="fas fa-shield-check" style="color: #34d399;"></i> Pode enviar a produção sem glosa
                </h2>
                <p style="margin: 0; opacity: 0.95; font-size: 0.92rem;">
                    O <strong>Pente Fino ARGOS</strong> realizou a varredura completa nas 5 regras determinísticas. Nenhuma glosa foi encontrada no lote <strong>${escapar(r.arquivo)}</strong> (${r.totalLinhas} registros reais).
                </p>
               </div>`
            : (!temGlosas && temPendencias
            ? `<div class="mf-audit-summary mf-nao_conforme" style="background: linear-gradient(135deg, rgba(69, 41, 10, 0.9), rgba(120, 72, 10, 0.95)); border: 1px solid #f59e0b; color: #fffbeb; box-shadow: 0 10px 25px -5px rgba(245, 158, 11, 0.4);">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem;">
                    <span class="mf-badge" style="background: #f59e0b; color: #451a03; font-weight: 800;">PENTE FINO ARGOS · VERIFICAÇÃO INCOMPLETA</span>
                    <span style="font-size: 0.85rem; font-weight: 600; color: #fde68a;"><i class="fas fa-exclamation-triangle"></i> Conferência Requerida</span>
                </div>
                <h2 style="font-size: 1.4rem; margin: 0 0 0.4rem 0; color: #ffffff; display: flex; align-items: center; gap: 0.6rem;">
                    <i class="fas fa-search" style="color: #fbbf24;"></i> Nenhuma glosa confirmada, mas há pendências a conferir
                </h2>
                <p style="margin: 0; opacity: 0.95; font-size: 0.92rem;">
                    Foram registradas <strong>${(r.naoVerificados || 0) + (r.alertas || 0)}</strong> pendência(s) de verificação no arquivo <strong>${escapar(r.arquivo)}</strong>. Confira os pontos abaixo antes do envio sem glosa — ou envie para recepção integrada.
                </p>
               </div>`
            : `<div class="mf-audit-summary mf-nao_conforme" style="background: linear-gradient(135deg, rgba(69, 10, 10, 0.9), rgba(127, 29, 29, 0.95)); border: 1px solid #ef4444; color: #fef2f2; box-shadow: 0 10px 25px -5px rgba(239, 68, 68, 0.4);">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem;">
                    <span class="mf-badge" style="background: #ef4444; color: #450a0a; font-weight: 800;">PENTE FINO ARGOS · GLOSAS APONTADAS</span>
                    <span style="font-size: 0.85rem; font-weight: 600; color: #fecaca;"><i class="fas fa-exclamation-triangle"></i> Atenção Requerida</span>
                </div>
                <h2 style="font-size: 1.4rem; margin: 0 0 0.4rem 0; color: #ffffff; display: flex; align-items: center; gap: 0.6rem;">
                    <i class="fas fa-ban" style="color: #f87171;"></i> Foram encontradas não-conformidades de glosa
                </h2>
                <p style="margin: 0; opacity: 0.95; font-size: 0.92rem;">
                    Foram apontadas <strong>${r.naoConformidades}</strong> glosas no arquivo <strong>${escapar(r.arquivo)}</strong>. Corrija os pontos indicados abaixo antes do envio oficial para evitar rejeição no SIA/SUS.
                </p>
               </div>`);

        // Cards das 5 Regras Anti-Glosa
        const cards5RegrasHtml = `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 0.75rem; margin: 1rem 0;">
                ${[c5.regra1_lotacao_cnes, c5.regra2_cbo_procedimento, c5.regra3_cid_procedimento, c5.regra4_servico_classificacao, c5.regra5_cns_profissional].map(rg => `
                    <div style="background: ${rg.ok ? 'rgba(6, 78, 59, 0.25)' : 'rgba(127, 29, 29, 0.25)'}; border: 1px solid ${rg.ok ? 'rgba(52, 211, 153, 0.3)' : 'rgba(248, 113, 113, 0.3)'}; border-radius: 0.5rem; padding: 0.75rem; display: flex; flex-direction: column; gap: 0.35rem;">
                        <div style="display: flex; align-items: center; justify-content: space-between;">
                            <span style="font-size: 0.7rem; font-weight: 700; text-transform: uppercase; color: ${rg.ok ? '#34d399' : '#f87171'};">Regra ${rg.id}</span>
                            <span style="font-size: 0.75rem; font-weight: 800; padding: 2px 6px; border-radius: 4px; background: ${rg.ok ? '#065f46' : '#991b1b'}; color: #fff;">
                                ${rg.ok ? '<i class="fas fa-check"></i> OK' : '<i class="fas fa-times"></i> GLOSA'}
                            </span>
                        </div>
                        <strong style="font-size: 0.85rem; color: #f1f5f9;">${rg.titulo}</strong>
                        <span style="font-size: 0.72rem; color: #94a3b8; line-height: 1.25;">${rg.descricao}</span>
                        ${!rg.ok ? `<div style="font-size: 0.7rem; color: #fca5a5; font-weight: 600; margin-top: 0.25rem;">${rg.totalGlosas} registro(s) afetado(s)</div>` : ''}
                    </div>
                `).join('')}
            </div>
        `;

        const visible = r.findings.filter(f => !filtroAtual || f.status === filtroAtual);
        const pages = Math.max(1, Math.ceil(visible.length / tamanhoPagina));
        paginaAtual = Math.min(paginaAtual, pages - 1);

        box.innerHTML = bannerHtml + cards5RegrasHtml +
            `<div class="mf-kpis-grid">
                <div class="mf-kpi-card"><div><span class="kpi-lbl">Não conformidades (Glosas)</span><strong class="kpi-val" style="color: ${r.naoConformidades > 0 ? '#ef4444' : '#10b981'};">${r.naoConformidades}</strong></div></div>
                <div class="mf-kpi-card"><div><span class="kpi-lbl">Não verificados</span><strong class="kpi-val">${r.naoVerificados}</strong></div></div>
                <div class="mf-kpi-card"><div><span class="kpi-lbl">Alertas</span><strong class="kpi-val">${r.alertas}</strong></div></div>
                <div class="mf-kpi-card"><div><span class="kpi-lbl">Registros Conformes</span><strong class="kpi-val">${r.registrosConformes} / ${r.totalLinhas}</strong></div></div>
                <div class="mf-kpi-card mf-kpi-financial"><div><span class="kpi-lbl">Valor de referência (SA)</span><strong class="kpi-val">${fmtTotal(r.registrosValorizados ? r.valorReferenciaSa : null)}</strong><small>Base SIGTAP da competência</small></div></div>
                <div class="mf-kpi-card mf-kpi-financial"><div><span class="kpi-lbl">Valor sob Risco de Glosa</span><strong class="kpi-val" style="color: ${r.valorNaoConformeSa > 0 ? '#ef4444' : '#94a3b8'};">${fmtTotal(r.registrosValorizados ? r.valorNaoConformeSa : null)}</strong><small>Referência linhas não-conformes</small></div></div>
            </div>` +
            `<details class="mf-audit-bases" open><summary>Bases e Cobertura das Verificações</summary><ul>` +
            r.sources.map(s => '<li><strong>' + escapar(s.tipo + ' ' + s.competencia) + '</strong>: ' + escapar(s.estado) + ' — ' + escapar(s.fonte) + '</li>').join('') +
            `</ul></details>` +
            `<div class="mf-table-section">
                <div class="mf-table-header">
                    <h3>Diagnóstico Linha a Linha</h3>
                    <select aria-label="Filtrar diagnóstico" onchange="PenteFinoEngine.filtrar(this.value)">` +
                    [['', 'Todos'], ['NAO_CONFORME', 'Não conformidades (Glosas)'], ['NAO_VERIFICADO', 'Não verificados'], ['ALERTA', 'Alertas']].map(([v, l]) => `<option value="${v}" ${filtroAtual === v ? 'selected' : ''}>${l}</option>`).join('') +
                    `</select>
                    <button type="button" class="btn-mf-export-excel" onclick="PenteFinoEngine.exportarExcel()">Exportar Diagnóstico</button>
                </div>
                <div class="mf-table-wrapper">
                    <table class="mf-table">
                        <thead>
                            <tr>
                                <th>Linha / Competência</th>
                                <th>Resultado / Regra</th>
                                <th>CNES / CNS Profissional</th>
                                <th>Procedimento</th>
                                <th>Valor SA</th>
                                <th>Diagnóstico</th>
                                <th>Esperado / Encontrado</th>
                            </tr>
                        </thead>
                        <tbody>` +
                        visible.slice(paginaAtual * tamanhoPagina, (paginaAtual + 1) * tamanhoPagina).map(f => `
                            <tr>
                                <td>${f.linha}<br>${escapar(f.competencia)}</td>
                                <td>${escapar(rotulo(f.status))}<br><strong>${escapar(rotulo(f.regra))}</strong></td>
                                <td>${escapar(f.cnes)}<br>${escapar(mascararCns(f.cns))}</td>
                                <td>${escapar(f.procedimento)}</td>
                                <td class="mf-value-cell">${fmtMoeda(f.valorSa)}</td>
                                <td>${escapar(f.mensagem)}</td>
                                <td>${escapar(f.esperado)}<br>${escapar(f.encontrado)}</td>
                            </tr>
                        `).join('') +
                        (visible.length ? '' : '<tr><td colspan="7">Nenhum apontamento neste filtro.</td></tr>') +
                        `</tbody>
                    </table>
                </div>
                <div class="mf-audit-pagination">
                    <button type="button" onclick="PenteFinoEngine.pagina(-1)" ${paginaAtual === 0 ? 'disabled' : ''}>Anterior</button>
                    <span>Página ${paginaAtual + 1} de ${pages} • ${visible.length} apontamentos</span>
                    <button type="button" onclick="PenteFinoEngine.pagina(1)" ${paginaAtual + 1 === pages ? 'disabled' : ''}>Próxima</button>
                </div>
            </div>
            <p class="mf-audit-footnote">Pente Fino ARGOS emitido em ${escapar(new Date(r.geradoEm).toLocaleString('pt-BR'))} • SHA-256 do arquivo: ${escapar(r.fingerprint)}</p>`;
    }

    function exportarExcel() {
        if (!ultimoResultado) return;
        const data = ultimoResultado.findings.map(f => Object.fromEntries(Object.entries({ ...f, cns: mascararCns(f.cns) }).map(([k, v]) => [k, typeof v === 'string' && /^[=+@-]/.test(v) ? "'" + v : v])));
        if (typeof window !== 'undefined' && window.XLSX) {
            const wb = window.XLSX.utils.book_new();
            window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.json_to_sheet(data), 'Diagnostico_Pente_Fino');
            window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.json_to_sheet(ultimoResultado.sources), 'Bases');
            window.XLSX.writeFile(wb, 'Pente_Fino_BPA_' + Date.now() + '.xlsx');
        } else if (typeof window !== 'undefined') {
            const blob = new Blob([JSON.stringify(ultimoResultado, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob), a = document.createElement('a');
            a.href = url;
            a.download = 'Pente_Fino_BPA.json';
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        }
    }

    return {
        executar,
        executarComAnimacao3D,
        executarAuditoria,
        auditar5Regras,
        classificar5Regras,
        avaliarParecerFinal,
        renderizarResultados,
        exportarExcel,
        mascararCns,
        getUltimoResultado: () => ultimoResultado,
        fecharModalResultados: () => document.getElementById('modalMalhaFinaResultados')?.classList.add('hidden'),
        pagina: delta => { paginaAtual += delta; renderizarResultados(); },
        filtrar: valor => { filtroAtual = valor; paginaAtual = 0; renderizarResultados(); },
        loadBases
    };
});

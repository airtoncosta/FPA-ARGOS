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

    async function loadBases(competencias) {
        let manifest, sources = [];
        try {
            manifest = await carregarJson('audit_data/manifest.json');
        } catch (e) {
            manifest = { cnes: {}, sigtap: {} };
            sources.push({ tipo: 'Manifesto legado', competencia: '', estado: 'Indisponível', fonte: e.message });
        }
        manifest.cnes = { ...(manifest.cnes || {}), ...await cnesPublishedEntries() };
        const bases = {};
        await Promise.all(competencias.filter(Boolean).map(async cm => {
            bases[cm] = {};
            await Promise.all(['cnes', 'sigtap'].map(async type => {
                const item = manifest[type]?.[cm];
                if (!item) {
                    sources.push({ tipo: type.toUpperCase() + ' local', competencia: cm, estado: 'Sem base local', fonte: 'Base desta competência ausente' });
                    return;
                }
                try {
                    const data = await carregarJson(item.url, item.sha256);
                    const declared = data.competencia || data.versao?.replace(/\D/g, '');
                    if (declared !== cm) throw new Error('Competência interna da base diverge da solicitada.');
                    if (type === 'cnes' && item.url.startsWith('cnes_data/auto/') && String(data.codigoIbge) !== '210120') throw new Error('Snapshot CNES automático fora do escopo Bacabal.');
                    bases[cm][type] = { ...data, competencia: declared, fonte: item.fonte, oficial: item.oficial === true, completo: item.completo === true, cobertura: item.cobertura || {} };
                    sources.push({ tipo: type.toUpperCase(), competencia: cm, estado: item.oficial ? 'Carregado' : 'Origem não validada', fonte: item.fonte || item.url });
                } catch (e) {
                    sources.push({ tipo: type.toUpperCase(), competencia: cm, estado: 'Indisponível', fonte: e.message });
                }
            }));
        }));
        return { bases, sources };
    }

    async function calcularHash(texto) {
        if (typeof window === 'undefined' || !window.crypto?.subtle) return 'Indisponível';
        const bytes = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
        return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
    }

    /**
     * Classifica os apontamentos da auditoria nas 5 Regras Anti-Glosa solicitadas:
     * 1. Lotação do profissional no estabelecimento (CNES)
     * 2. Habilitação CBO x Procedimento (SIGTAP)
     * 3. Habilitação CID x Procedimento (SIGTAP)
     * 4. Habilitação Serviços e Classificações no CNES
     * 5. Validação estrutural do Cartão SUS do profissional (CNS)
     */
    function classificar5Regras(resultadoAuditoria) {
        if (!resultadoAuditoria || typeof resultadoAuditoria !== 'object') {
            return {
                regra1_lotacao_cnes: { ok: false, glosas: [], total: 0, titulo: 'Lotação do Profissional no CNES' },
                regra2_cbo_procedimento: { ok: false, glosas: [], total: 0, titulo: 'CBO Habilitado ao Procedimento' },
                regra3_cid_procedimento: { ok: false, glosas: [], total: 0, titulo: 'CID Habilitado ao Procedimento' },
                regra4_servico_classificacao: { ok: false, glosas: [], total: 0, titulo: 'Serviço e Classificação no CNES' },
                regra5_cns_profissional: { ok: false, glosas: [], total: 0, titulo: 'Cartão SUS (CNS) do Profissional' },
                podeEnviarSemGlosa: false
            };
        }

        const findings = Array.isArray(resultadoAuditoria.findings) ? resultadoAuditoria.findings : [];

        const isGlosa = status => status === 'NAO_CONFORME' || status === 'NAO_VERIFICADO';

        // Filtro por regra
        const glosasRegra1 = findings.filter(f => isGlosa(f.status) && ['VINCULO_PROFISSIONAL', 'UNIDADE_CNES', 'BASE_CNES'].includes(f.regra));
        const glosasRegra2 = findings.filter(f => isGlosa(f.status) && ['CBO_SIGTAP', 'CBO_FORMATO', 'BASE_SIGTAP'].includes(f.regra));
        const glosasRegra3 = findings.filter(f => isGlosa(f.status) && ['CID', 'CID_FORMATO'].includes(f.regra));
        const glosasRegra4 = findings.filter(f => isGlosa(f.status) && ['SERVICO_CNES', 'SERVICO_CLASSIFICACAO', 'SERVICO_INFORMADO', 'HABILITACAO'].includes(f.regra));
        const glosasRegra5 = findings.filter(f => isGlosa(f.status) && ['CNS_PROFISSIONAL'].includes(f.regra));

        // Outras possíveis não conformidades estruturais críticas
        const outrasGlosas = findings.filter(f => isGlosa(f.status) && !['VINCULO_PROFISSIONAL', 'UNIDADE_CNES', 'BASE_CNES', 'CBO_SIGTAP', 'CBO_FORMATO', 'BASE_SIGTAP', 'CID', 'CID_FORMATO', 'SERVICO_CNES', 'SERVICO_CLASSIFICACAO', 'SERVICO_INFORMADO', 'HABILITACAO', 'CNS_PROFISSIONAL'].includes(f.regra));

        const regra1 = {
            id: 1,
            codigo: 'regra1_lotacao_cnes',
            titulo: 'Lotação do Profissional no CNES',
            descricao: 'O profissional identificado está lotado e ativo no estabelecimento de saúde na competência do atendimento.',
            ok: glosasRegra1.length === 0,
            glosas: glosasRegra1,
            totalGlosas: glosasRegra1.length
        };

        const regra2 = {
            id: 2,
            codigo: 'regra2_cbo_procedimento',
            titulo: 'CBO Habilitado ao Procedimento',
            descricao: 'Aqueles procedimentos estão habilitados àquele CBO conforme a tabela oficial do SIGTAP.',
            ok: glosasRegra2.length === 0,
            glosas: glosasRegra2,
            totalGlosas: glosasRegra2.length
        };

        const regra3 = {
            id: 3,
            codigo: 'regra3_cid_procedimento',
            titulo: 'CID Habilitado ao Procedimento',
            descricao: 'O CID diagnosticado está habilitado para o procedimento na tabela do SIGTAP.',
            ok: glosasRegra3.length === 0,
            glosas: glosasRegra3,
            totalGlosas: glosasRegra3.length
        };

        const regra4 = {
            id: 4,
            codigo: 'regra4_servico_classificacao',
            titulo: 'Serviço e Classificação no CNES',
            descricao: 'Esses serviços e classificações estão habilitados no CNES do estabelecimento para o procedimento.',
            ok: glosasRegra4.length === 0,
            glosas: glosasRegra4,
            totalGlosas: glosasRegra4.length
        };

        const regra5 = {
            id: 5,
            codigo: 'regra5_cns_profissional',
            titulo: 'Cartão SUS (CNS) do Profissional',
            descricao: 'O cartão SUS do profissional está correto e atende ao cálculo do dígito verificador módulo 11.',
            ok: glosasRegra5.length === 0,
            glosas: glosasRegra5,
            totalGlosas: glosasRegra5.length
        };

        const parecer = avaliarParecerFinal({
            regra1_lotacao_cnes: regra1,
            regra2_cbo_procedimento: regra2,
            regra3_cid_procedimento: regra3,
            regra4_servico_classificacao: regra4,
            regra5_cns_profissional: regra5,
            outrasGlosas: outrasGlosas
        });

        return {
            regra1_lotacao_cnes: regra1,
            regra2_cbo_procedimento: regra2,
            regra3_cid_procedimento: regra3,
            regra4_servico_classificacao: regra4,
            regra5_cns_profissional: regra5,
            outrasGlosas: outrasGlosas,
            podeEnviarSemGlosa: parecer.podeEnviarSemGlosa,
            parecer: parecer
        };
    }

    function avaliarParecerFinal(regras) {
        const chaves = ['regra1_lotacao_cnes', 'regra2_cbo_procedimento', 'regra3_cid_procedimento', 'regra4_servico_classificacao', 'regra5_cns_profissional'];
        let totalGlosas = 0;
        let regrasComGlosa = [];

        for (const chave of chaves) {
            const r = regras[chave];
            if (r && !r.ok) {
                totalGlosas += (r.totalGlosas || r.glosas?.length || 1);
                regrasComGlosa.push(r.titulo || chave);
            }
        }

        if (Array.isArray(regras.outrasGlosas) && regras.outrasGlosas.length > 0) {
            totalGlosas += regras.outrasGlosas.length;
            regrasComGlosa.push('Outras Inconsistências Estruturais');
        }

        const podeEnviar = totalGlosas === 0;

        return {
            podeEnviarSemGlosa: podeEnviar,
            status: podeEnviar ? 'APROVADO' : 'GLOSA_DETECTADA',
            totalGlosas: totalGlosas,
            regrasComGlosa: regrasComGlosa,
            mensagem: podeEnviar ? 'Pode enviar a produção sem glosa' : `Foram detectadas ${totalGlosas} ocorrências de glosa que impedem a aprovação imediata.`
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
            const core = window.BpaAuditCore;
            const parsed = core.parse(text);
            const comps = [...new Set(parsed.records.map(r => core.competencia(r.competencia)))];
            const { bases, sources } = await loadBases(comps);

            const apiRecords = parsed.records.filter(r => !bases[r.competencia]?.sigtap);
            if (apiRecords.length && window.SigtapAuditApi) {
                box.innerHTML = '<div class="mf-audit-summary"><h2>Consultando SIGTAP por competência...</h2><p>Buscando relacionamentos oficiais de CBO, CID, serviços e habilitações.</p></div>';
                const api = await window.SigtapAuditApi.load(apiRecords);
                for (const [cm, sigtap] of Object.entries(api.bases)) {
                    if (!bases[cm]) bases[cm] = {};
                    bases[cm].sigtap = sigtap;
                }
                sources.push(...api.sources);
            }

            const computed = await auditar5Regras(parsed, bases);
            computed.arquivo = selected.nomeArquivo || selected.nome_arquivo || 'BPA';
            computed.sources = sources;
            computed.fingerprint = await calcularHash(text);

            ultimoResultado = computed;
            renderizarResultados();
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
            window.PenteFino3DRenderer.abrirScanner(selected, async (atualizarProgresso) => {
                const core = window.BpaAuditCore;
                const parsed = core.parse(text);
                const comps = [...new Set(parsed.records.map(r => core.competencia(r.competencia)))];
                
                atualizarProgresso({ fase: 'bases', mensagem: 'Carregando bases CNES e SIGTAP da competência...' });
                const { bases, sources } = await loadBases(comps);

                const apiRecords = parsed.records.filter(r => !bases[r.competencia]?.sigtap);
                if (apiRecords.length && window.SigtapAuditApi) {
                    atualizarProgresso({ fase: 'sigtap', mensagem: 'Cruzando procedimentos, CBOs e CIDs no SIGTAP...' });
                    const api = await window.SigtapAuditApi.load(apiRecords);
                    for (const [cm, sigtap] of Object.entries(api.bases)) {
                        if (!bases[cm]) bases[cm] = {};
                        bases[cm].sigtap = sigtap;
                    }
                    sources.push(...api.sources);
                }

                atualizarProgresso({ fase: '5regras', mensagem: 'Passando o Pente Fino ARGOS nas 5 regras anti-glosa...' });
                const computed = await auditar5Regras(parsed, bases);
                computed.arquivo = selected.nomeArquivo || selected.nome_arquivo || 'BPA';
                computed.sources = sources;
                computed.fingerprint = await calcularHash(text);
                ultimoResultado = computed;

                return computed;
            });
        } else {
            // Fallback caso o renderizador 3D ainda não esteja montado
            return executar(dados);
        }
    }

    function renderizarResultados() {
        if (!ultimoResultado) return;
        const r = ultimoResultado;
        const box = obterOuCriarModalResultados();
        const c5 = r.classificacao5Regras || classificar5Regras(r);
        const podeEnviar = c5.podeEnviarSemGlosa;

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
               </div>`;

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
                                <td>${escapar(f.cnes)}<br>${escapar(f.cns)}</td>
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
        const data = ultimoResultado.findings.map(f => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, typeof v === 'string' && /^[=+@-]/.test(v) ? "'" + v : v])));
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
        auditar5Regras,
        classificar5Regras,
        avaliarParecerFinal,
        exportarExcel,
        getUltimoResultado: () => ultimoResultado,
        fecharModalResultados: () => document.getElementById('modalMalhaFinaResultados')?.classList.add('hidden'),
        pagina: delta => { paginaAtual += delta; renderizarResultados(); },
        filtrar: valor => { filtroAtual = valor; paginaAtual = 0; renderizarResultados(); },
        loadBases
    };
});

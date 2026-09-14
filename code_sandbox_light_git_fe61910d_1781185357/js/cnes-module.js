/**
 * ARGOS — cnes-module.js v2.0
 * Módulo de Gestão do CNES Oficial (Cadastro Nacional de Estabelecimentos de Saúde)
 * System Design Corporativo SUS / SIGTAP & CNESNet Oficial DATASUS
 * Suporte a consulta de Estabelecimentos, Profissionais, Ficha Oficial,
 * Grade de 17 Colunas, Histórico de Competências Anteriores e Exportação XLS.
 */

window.CnesModule = (function () {
    'use strict';

    let state = {
        municipio: 'BACABAL',
        uf: 'MA',
        ibge: '210120',
        estabelecimentos: [],
        competencias: [
            { codigo: '202608', label: '08/2026 (Competência Vigente)', vigente: true },
            { codigo: '202607', label: '07/2026', vigente: false },
            { codigo: '202606', label: '06/2026', vigente: false },
            { codigo: '202605', label: '05/2026', vigente: false },
            { codigo: '202604', label: '04/2026', vigente: false },
            { codigo: '202603', label: '03/2026', vigente: false },
            { codigo: '202602', label: '02/2026', vigente: false },
            { codigo: '202601', label: '01/2026', vigente: false },
            { codigo: '202512', label: '12/2025', vigente: false },
            { codigo: '202511', label: '11/2025', vigente: false }
        ],
        competenciaAtiva: '202608',
        loading: false,
        lastSync: null,
        viewMode: 'portal', // 'portal' | 'ficha' | 'profissionais'
        selectedCnes: null,
        searchEstabelecimento: '',
        searchProfissional: '',
        tableFilter: {
            search: '',
            perPage: 10,
            page: 1,
            apenasDesligados: false
        },
        modalCompetenciaAberta: false,
        modalProfissionalSelecionado: null
    };

    function fmtNum(val) {
        return (Number(val) || 0).toLocaleString('pt-BR');
    }

    function formatarCompetencia(compStr) {
        if (!compStr || compStr.length < 6) return compStr;
        const s = String(compStr).replace(/\D/g, '');
        if (s.length === 6) {
            return `${s.substring(4, 6)}/${s.substring(0, 4)}`;
        }
        return compStr;
    }

    /**
     * Sincroniza o contexto do município com o sistema central
     */
    function syncMunicipioContext() {
        const d = (window.APP_STATE && (window.APP_STATE.data || window.APP_STATE.filteredData)) || null;
        if (d) {
            if (d.municipio && d.municipio !== 'Sem município' && d.municipio !== 'SEM MUNICIPIO IMPORTADO') {
                state.municipio = d.municipio.toUpperCase().trim();
            }
            if (d.uf) state.uf = d.uf.toUpperCase().trim();
            if (d.codigoIbge) state.ibge = String(d.codigoIbge).substring(0, 6);
        }
        if (window.MunicipioContext && typeof window.MunicipioContext.getAtivo === 'function') {
            const m = window.MunicipioContext.getAtivo();
            if (m && m.nome) state.municipio = m.nome.toUpperCase().trim();
            if (m && m.uf) state.uf = m.uf.toUpperCase().trim();
            if (m && m.codigoIbge) state.ibge = String(m.codigoIbge).substring(0, 6);
        }
    }

    /**
     * Inicialização do Módulo CNES
     */
    async function init() {
        if (state.estabelecimentos.length === 0) {
            await carregarDados();
        } else {
            render();
        }
    }

    /**
     * Carrega a base oficial do CNES local/remota
     */
    async function carregarDados() {
        state.loading = true;
        syncMunicipioContext();

        try {
            const res = await fetch('/api/cnes/bacabal').then(r => r.ok ? r.json() : null);
            if (res && res.estabelecimentos && res.estabelecimentos.length > 0) {
                state.estabelecimentos = res.estabelecimentos;
                if (res.competencias && res.competencias.length > 0) {
                    state.competencias = res.competencias;
                }
                state.lastSync = new Date(res.dataAtualizacao || Date.now());
                state.loading = false;
                render();
                return;
            }
        } catch (e) {
            console.warn('Endpoint local falhou, tentando arquivo estático:', e);
        }

        try {
            const resStatic = await fetch('cnes_data/cnes_bacabal.json').then(r => r.ok ? r.json() : null);
            if (resStatic && resStatic.estabelecimentos) {
                state.estabelecimentos = resStatic.estabelecimentos;
                if (resStatic.competencias && resStatic.competencias.length > 0) {
                    state.competencias = resStatic.competencias;
                }
                state.lastSync = new Date(resStatic.dataAtualizacao || Date.now());
                state.loading = false;
                render();
                return;
            }
        } catch (errStatic) {
            console.warn('Fallback estático falhou:', errStatic);
        }

        state.loading = false;
        render();
    }

    /**
     * Obter estabelecimento atualmente selecionado
     */
    function getSelectedUnidade() {
        if (!state.selectedCnes) {
            // Padrão: Hospital Socorro Brandão se nada selecionado
            return state.estabelecimentos.find(e => e.cnes === '2458055') || state.estabelecimentos[0] || null;
        }
        return state.estabelecimentos.find(e => e.cnes === state.selectedCnes) || state.estabelecimentos[0] || null;
    }

    /**
     * Obter lista de profissionais para a tabela de 17 colunas
     */
    function getProfissionaisList() {
        const u = getSelectedUnidade();
        let list = [];

        if (state.selectedCnes && u && u.profissionais) {
            list = u.profissionais.map(p => ({ ...p, cnes: u.cnes, unidadeNome: u.nomeFantasia }));
        } else {
            // Todos os profissionais do município
            state.estabelecimentos.forEach(est => {
                if (est.profissionais) {
                    est.profissionais.forEach(p => {
                        list.push({ ...p, cnes: est.cnes, unidadeNome: est.nomeFantasia });
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

        // Filtro de busca textual na tabela
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

    function abrirFicha(cnes) {
        state.selectedCnes = cnes;
        state.viewMode = 'ficha';
        render();
    }

    function abrirModuloProfissionais(cnes = null) {
        if (cnes) state.selectedCnes = cnes;
        state.tableFilter.page = 1;
        state.tableFilter.search = '';
        state.viewMode = 'profissionais';
        render();
    }

    function voltarAoPortal() {
        state.viewMode = 'portal';
        render();
    }

    /**
     * Ações de Busca dos Portais
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

        // Localizar estabelecimento exato
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
                showToast(`Nenhuma unidade encontrada com o termo "${term}". Exibindo todas.`, 'info');
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

        // Consultar profissional em todas as unidades
        state.selectedCnes = null; // Abrange o município
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

    function selecionarCompetencia(cod) {
        state.competenciaAtiva = cod;
        state.modalCompetenciaAberta = false;
        if (typeof showToast === 'function') {
            showToast(`📅 Competência alterada para ${formatarCompetencia(cod)}`, 'success');
        }
        render();
    }

    /**
     * Alternar filtro de profissionais desligados
     */
    function toggleDesligados() {
        state.tableFilter.apenasDesligados = !state.tableFilter.apenasDesligados;
        state.tableFilter.page = 1;
        render();
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
            "Nome", "Dt.Entrada", "CNS", "* CNS Master/Principal", "Dt. Atribuição", 
            "CBO", "CH Outros", "CH Amb.", "CH Hosp.", "Total", "SUS", 
            "Vinculação", "Tipo", "Subtipo", "Comp. Desativação", "Situação", "Portaria 134", "Estabelecimento"
        ];

        const rows = profs.map(p => [
            p.nome || '',
            p.dtEntrada || '',
            p.cns || '',
            p.cnsMaster || '',
            p.dtAtribuicao || '',
            p.ocupacao || p.cbo || '',
            (p.chOutros || 0) + 'Hs.',
            (p.chAmb || 0) + 'Hs.',
            (p.chHosp || 0) + 'Hs.',
            (p.chTotal || 0) + 'Hs.',
            p.atendimentoSus || 'SIM',
            p.vinculacao || 'VINCULO EMPREGATICIO',
            p.tipoVinculo || 'CONTRATADO TEMPORÁRIO',
            p.subtipo || 'PUBLICO',
            p.compDesativacao || '',
            p.situacao || (p.ativo ? 'Ativo' : 'Desligado'),
            p.portaria134 || '',
            p.unidadeNome || (u ? u.nomeFantasia : 'MUNICÍPIO DE BACABAL')
        ]);

        const wsData = [headers, ...rows];
        const ws = XLSX.utils.aoa_to_sheet(wsData);

        // Larguras das colunas
        ws['!cols'] = [
            { wch: 35 }, { wch: 12 }, { wch: 18 }, { wch: 18 }, { wch: 14 },
            { wch: 32 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 },
            { wch: 8 }, { wch: 24 }, { wch: 32 }, { wch: 12 }, { wch: 16 },
            { wch: 10 }, { wch: 12 }, { wch: 35 }
        ];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Profissionais");

        const cnesLabel = state.selectedCnes ? state.selectedCnes : 'TODOS';
        const filename = `CNES_Profissionais_${cnesLabel}_${state.competenciaAtiva}.xlsx`;
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

        container.innerHTML = `
            <div class="cnes-container">
                
                <!-- TOP NAVBAR COM BREADCRUMBS E COMPETÊNCIA -->
                <div class="cnes-top-nav">
                    <div class="cnes-top-breadcrumbs">
                        <i class="fas fa-hospital-alt" style="color: #0284c7;"></i>
                        <span><strong>CNES Oficial</strong> — ${state.municipio} / ${state.uf}</span>
                        ${state.viewMode !== 'portal' ? `
                            <i class="fas fa-chevron-right" style="font-size: 0.7rem; color: #94a3b8;"></i>
                            <button type="button" onclick="window.CnesModule.voltarAoPortal()">Consultas</button>
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

                    <div style="display: flex; align-items: center; gap: 0.75rem;">
                        <span class="cnes-top-badge-competencia">
                            <i class="fas fa-calendar-alt"></i> Comp: <strong>${compFmt}</strong>
                        </span>
                        <button class="cnes-btn-outline" onclick="window.CnesModule.abrirModalCompetencia()" title="Trocar ou Consultar Competências Anteriores">
                            <i class="fas fa-history"></i> Histórico de Competências
                        </button>
                    </div>
                </div>

                <!-- CORPO CONFORME MODO ATIVO -->
                ${state.viewMode === 'portal' ? renderViewPortal() : ''}
                ${state.viewMode === 'ficha' ? renderViewFicha() : ''}
                ${state.viewMode === 'profissionais' ? renderViewProfissionais() : ''}

                <!-- MODAIS AUXILIARES -->
                ${state.modalCompetenciaAberta ? renderModalCompetencias() : ''}
                ${state.modalProfissionalSelecionado ? renderModalDetalhesProfissional() : ''}
            </div>
        `;
    }

    /**
     * VISÃO 1: PORTAL DE CONSULTAS (IMAGEM 2)
     */
    function renderViewPortal() {
        const unidadesFiltradas = state.estabelecimentos.filter(u => {
            if (!state.searchEstabelecimento) return true;
            const t = state.searchEstabelecimento.toLowerCase();
            return u.nomeFantasia.toLowerCase().includes(t) ||
                   u.razaoSocial.toLowerCase().includes(t) ||
                   u.cnes.includes(t);
        });

        return `
            <!-- PORTAL DE DUPLA CONSULTA OFICIAL CNES -->
            <div class="cnes-search-portals-wrapper">
                
                <!-- 1. CONSULTA ESTABELECIMENTO (TOPO ROXO) -->
                <div class="cnes-portal-box">
                    <div class="cnes-portal-stripe-purple"></div>
                    <div class="cnes-portal-inner">
                        <h2 class="cnes-portal-title-purple">Consulta Estabelecimento</h2>
                        <form class="cnes-portal-form" onsubmit="window.CnesModule.executarBuscaEstabelecimento(event)">
                            <input type="text" id="inputBuscaEstabelecimento" class="cnes-portal-input" 
                                   placeholder="Nome Fantasia/Nome Empresarial/CNES/CNPJ/CPF" 
                                   value="${state.searchEstabelecimento}">
                            <button type="submit" class="cnes-btn-search">
                                <i class="fas fa-search"></i> Pesquisar
                            </button>
                        </form>
                    </div>
                </div>

                <!-- 2. CONSULTA PROFISSIONAL (TOPO LARANJA) -->
                <div class="cnes-portal-box">
                    <div class="cnes-portal-stripe-orange"></div>
                    <div class="cnes-portal-inner">
                        <h2 class="cnes-portal-title-orange">Consulta Profissional</h2>
                        <form class="cnes-portal-form" onsubmit="window.CnesModule.executarBuscaProfissional(event)">
                            <input type="text" id="inputBuscaProfissional" class="cnes-portal-input" 
                                   placeholder="Nome Profissional/CPF/CNS" 
                                   value="${state.searchProfissional}">
                            <button type="submit" class="cnes-btn-search">
                                <i class="fas fa-search"></i> Pesquisar
                            </button>
                        </form>
                    </div>
                </div>

            </div>

            <!-- LISTAGEM LIMPA DOS ESTABELECIDOS DO MUNICÍPIO -->
            <div class="cnes-section-header">
                <div class="cnes-section-title">
                    <i class="fas fa-hospital" style="color: #0284c7;"></i>
                    <span>Estabelecimentos Homologados em ${state.municipio} (${unidadesFiltradas.length})</span>
                </div>
                <div>
                    <button class="cnes-btn-outline" onclick="window.CnesModule.abrirModuloProfissionais(null)" title="Ver todos os colaboradores do município">
                        <i class="fas fa-users"></i> Ver Todos os Colaboradores do Município
                    </button>
                </div>
            </div>

            <div class="cnes-units-grid">
                ${unidadesFiltradas.map(u => `
                    <div class="cnes-unit-card-clean">
                        <div class="cnes-unit-card-header">
                            <span class="cnes-unit-badge-tipo">${u.tipoUnidade}</span>
                            <span class="cnes-unit-badge-code">CNES: ${u.cnes}</span>
                        </div>
                        <h3 class="cnes-unit-card-name">${u.nomeFantasia}</h3>
                        <p class="cnes-unit-card-razao">${u.razaoSocial}</p>

                        <div class="cnes-unit-card-info">
                            <div><i class="fas fa-map-marker-alt"></i> ${u.endereco}, ${u.numero || 'S/N'} - ${u.bairro || 'Centro'}</div>
                            <div><i class="fas fa-phone"></i> ${u.telefone || '(99) 3621-0000'}</div>
                            <div><i class="fas fa-check-circle" style="color: #16a34a;"></i> Atendimento SUS: <strong>${u.atendimentoSus}</strong></div>
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
        `;
    }

    /**
     * VISÃO 2: FICHA DO ESTABELECIMENTO DE SAÚDE (IMAGEM 3)
     */
    function renderViewFicha() {
        const u = getSelectedUnidade();
        if (!u) return '<div class="alert">Estabelecimento não localizado.</div>';

        const compFmt = formatarCompetencia(state.competenciaAtiva);

        return `
            <div class="cnes-ficha-container">
                
                <!-- BANNER AZUL DE TOPO -->
                <div class="cnes-ficha-header-banner">
                    Estabelecimento de Saúde
                </div>

                <!-- BARRA DE IDENTIFICAÇÃO E ATUALIZAÇÃO -->
                <div class="cnes-ficha-identificacao-bar">
                    <span class="cnes-ficha-identificacao-title">Identificação</span>
                    <span class="cnes-ficha-identificacao-meta">
                        CADASTRADO NO CNES EM: ${u.dtCadastro || '9/11/2003'} &nbsp;&nbsp;&nbsp;
                        ÚLTIMA ATUALIZAÇÃO EM: ${u.dtUltimaAtualizacao || '11/9/2026'} &nbsp;&nbsp;&nbsp;
                        DATA DE ATUALIZAÇÃO LOCAL: ${u.dtAtualizacaoLocal || '5/8/2026'}
                    </span>
                </div>

                <!-- AÇÕES RÁPIDAS (EXIBIR FICHA POR COMPETÊNCIA / ATUAL) -->
                <div class="cnes-ficha-action-row">
                    <div class="cnes-ficha-action-row-left">
                        <i class="fas fa-globe-americas" style="color: #0284c7; font-size: 1.1rem;"></i>
                        <span>Veja onde se localiza:</span>
                        <a href="https://maps.google.com/?q=${encodeURIComponent(u.endereco + ', ' + state.municipio + ' ' + state.uf)}" 
                           target="_blank" style="color: #0284c7; text-decoration: underline; font-weight: normal; font-size: 0.8rem;">
                           ${u.endereco}, ${u.numero || 'S/N'}
                        </a>
                    </div>
                    <div class="cnes-ficha-action-row-right">
                        <button class="cnes-btn-ficha-action" onclick="window.CnesModule.abrirModalCompetencia()" title="Selecionar Competência Histórica">
                            <i class="fas fa-calendar-alt"></i> Exibir Ficha Reduzida por Competência (${compFmt})
                        </button>
                        <button class="cnes-btn-ficha-action" onclick="window.CnesModule.selecionarCompetencia('202608')">
                            Exibir Ficha Reduzida Atual
                        </button>
                        <button class="cnes-btn-ficha-action" onclick="window.CnesModule.voltarAoPortal()">
                            <i class="fas fa-arrow-left"></i> Voltar às Consultas
                        </button>
                    </div>
                </div>

                <!-- TABELA DE ATRIBUTOS CADASTRAIS (ESTRUTURA EXATA DA IMAGEM 3) -->
                <table class="cnes-ficha-table">
                    <tbody>
                        <tr>
                            <td class="cnes-ficha-label">Nome:</td>
                            <td class="cnes-ficha-val"><strong>${u.nomeFantasia}</strong></td>
                            <td class="cnes-ficha-label">CNES:</td>
                            <td class="cnes-ficha-val-red">${u.cnes}</td>
                            <td class="cnes-ficha-label">CNPJ:</td>
                            <td class="cnes-ficha-val">${u.cnpj || '--'}</td>
                        </tr>
                        <tr>
                            <td class="cnes-ficha-label">Nome Empresarial:</td>
                            <td class="cnes-ficha-val">${u.razaoSocial}</td>
                            <td class="cnes-ficha-label">CPF:</td>
                            <td class="cnes-ficha-val">--</td>
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
                            <td class="cnes-ficha-val">${u.horario || 'Sempre aberto'}</td>
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
                            <td class="cnes-ficha-val">${u.alvara || 'ALVARA'}</td>
                            <td class="cnes-ficha-label">Órgão Expedidor:</td>
                            <td class="cnes-ficha-val">${u.orgaoExpedidor || 'SMS'}</td>
                            <td class="cnes-ficha-label">Data Expedição:</td>
                            <td class="cnes-ficha-val">${u.dtExpedicao || '03/01/2026'}</td>
                        </tr>
                    </tbody>
                </table>

                <!-- GRADE DE MÓDULOS OFICIAIS (15 BOTÕES EXATOS DA IMAGEM 3) -->
                <div class="cnes-modulos-section">
                    <div class="cnes-modulos-title">Módulos do Estabelecimento:</div>
                    <div class="cnes-modulos-grid">
                        <button class="cnes-btn-modulo" onclick="window.CnesModule.abrirFicha('${u.cnes}')">Básico</button>
                        <button class="cnes-btn-modulo" onclick="alert('Módulo Conjunto — Registro geral da estrutura.')">Conjunto</button>
                        <button class="cnes-btn-modulo" onclick="alert('Módulo Ambulatorial — Consultórios e salas de atendimento.')">Ambulatorial</button>
                        <button class="cnes-btn-modulo" onclick="alert('Módulo Hospitalar — Leitos e internação.')">Hospitalar</button>
                        <button class="cnes-btn-modulo" onclick="alert('Módulo Mantenedora — Prefeitura Municipal.')">Mantenedora</button>
                        <button class="cnes-btn-modulo highlight-prof" onclick="window.CnesModule.abrirModuloProfissionais('${u.cnes}')" title="Ver todos os colaboradores">
                            <i class="fas fa-users"></i> Profissionais (${u.profissionais ? u.profissionais.length : 0})
                        </button>
                        <button class="cnes-btn-modulo" onclick="alert('Módulo Habilitações do Ministério da Saúde.')">Habilitações</button>
                        <button class="cnes-btn-modulo" onclick="alert('Módulo Regras Contratuais.')">Regras Contratuais</button>
                        <button class="cnes-btn-modulo" onclick="alert('Módulo Contrato de Gestão.')">Contrato de Gestão</button>
                        <button class="cnes-btn-modulo" onclick="alert('Módulo Incentivos do FNS / MS.')">Incentivos</button>
                        <button class="cnes-btn-modulo" onclick="alert('Módulo Equipes de Saúde cadastradas.')">Equipes</button>
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
     * VISÃO 3: MÓDULO PROFISSIONAL — 17 COLUNAS (IMAGEM 4)
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

        const tituloUnidade = state.selectedCnes && u
            ? `${u.nomeFantasia} (CNES: ${u.cnes})`
            : `Todos os Estabelecimentos de ${state.municipio} - ${state.uf}`;

        return `
            <div class="cnes-prof-module-wrapper">
                
                <!-- TÍTULO OFICIAL DO MÓDULO (BARRA AZUL DATASUS) -->
                <div class="cnes-prof-header-title">
                    Consulta Estabelecimento - Modulo Profissional - Profissionais por Estabelecimento
                </div>

                <!-- SUBBARRA COM NOME DO ESTABELECIMENTO E BOTÕES DE AÇÃO -->
                <div class="cnes-prof-unit-bar">
                    <div class="cnes-prof-unit-name">
                        <span>Profissionais | <strong>${tituloUnidade}</strong></span>
                    </div>

                    <div class="cnes-prof-action-buttons">
                        <button class="cnes-btn-outline ${state.tableFilter.apenasDesligados ? 'active' : ''}" 
                                onclick="window.CnesModule.toggleDesligados()">
                            <i class="fas fa-user-slash"></i> 
                            ${state.tableFilter.apenasDesligados ? 'Exibir Profissionais Ativos' : 'Profissionais Desligados'}
                        </button>

                        <button class="cnes-btn-outline" onclick="window.CnesModule.abrirModalCompetencia()" title="Trocar Competência">
                            <i class="fas fa-calendar-alt"></i> Profissionais por Competência (${compFmt})
                        </button>

                        <button class="cnes-btn-xls" onclick="window.CnesModule.exportarXls()" title="Exportar planilha Excel completa">
                            <i class="fas fa-file-excel"></i> Exportar XLS
                        </button>

                        ${state.selectedCnes ? `
                            <button class="cnes-btn-outline" onclick="window.CnesModule.abrirFicha('${state.selectedCnes}')">
                                <i class="fas fa-arrow-left"></i> Ficha da Unidade
                            </button>
                        ` : ''}
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
                            <option value="todos" ${state.tableFilter.perPage === 'todos' ? 'selected' : ''}>Todos</option>
                        </select>
                        <span>registros</span>
                    </div>

                    <div class="cnes-prof-search-inline">
                        <label for="inputInlineProfSearch">Buscar:</label>
                        <input type="text" id="inputInlineProfSearch" 
                               value="${state.tableFilter.search}" 
                               oninput="window.CnesModule.setTableSearch(this.value)"
                               placeholder="Nome, CNS ou CBO...">
                    </div>
                </div>

                <!-- AVISO OFICIAL VERMELHO DO DATASUS -->
                <div class="cnes-prof-disclaimer">
                    * Esta informação está sendo apresentada apenas para conhecimento do profissional.
                </div>

                <!-- TABELA OFICIAL DE 17 COLUNAS -->
                <div class="cnes-table-responsive">
                    <table class="cnes-table-17cols">
                        <thead>
                            <tr>
                                <th rowspan="2" style="min-width: 200px;">Nome</th>
                                <th rowspan="2">Dt.Entrada</th>
                                <th rowspan="2">CNS</th>
                                <th rowspan="2">* CNS Master/Principal</th>
                                <th rowspan="2">Dt. Atribuição</th>
                                <th rowspan="2" style="min-width: 180px;">CBO</th>
                                <th rowspan="2" class="th-center">CH Outros</th>
                                <th rowspan="2" class="th-center">CH Amb.</th>
                                <th rowspan="2" class="th-center">CH Hosp.</th>
                                <th rowspan="2" class="th-center">Total</th>
                                <th rowspan="2" class="th-center">SUS</th>
                                <th colspan="3" class="th-group-vinculo">Vínculo Empregatício</th>
                                <th rowspan="2">Comp. Desativação</th>
                                <th rowspan="2" class="th-center">Situação</th>
                                <th rowspan="2">Portaria 134</th>
                            </tr>
                            <tr>
                                <th>Vinculação</th>
                                <th>Tipo</th>
                                <th>Subtipo</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${profsPaginados.length === 0 ? `
                                <tr>
                                    <td colspan="17" style="text-align: center; padding: 2rem; color: #64748b;">
                                        <i class="fas fa-search" style="font-size: 1.5rem; display: block; margin-bottom: 0.5rem; opacity: 0.5;"></i>
                                        Nenhum profissional localizado com os filtros selecionados.
                                    </td>
                                </tr>
                            ` : profsPaginados.map(p => `
                                <tr>
                                    <td>
                                        <a href="javascript:void(0)" class="cnes-prof-name-link" 
                                           onclick="window.CnesModule.abrirDetalhesProfissional('${p.cns}')" 
                                           title="Clique para ver ficha do colaborador">
                                            ${p.nome}
                                        </a>
                                    </td>
                                    <td>${p.dtEntrada || ''}</td>
                                    <td style="font-family: 'Roboto Mono', monospace;">${p.cns}</td>
                                    <td style="font-family: 'Roboto Mono', monospace;">${p.cnsMaster || ''}</td>
                                    <td>${p.dtAtribuicao || ''}</td>
                                    <td title="${p.ocupacao}">${p.ocupacao || p.cbo}</td>
                                    <td style="text-align: center;">${p.chOutros || 0}Hs.</td>
                                    <td style="text-align: center;">${p.chAmb || 0}Hs.</td>
                                    <td style="text-align: center;">${p.chHosp || 0}Hs.</td>
                                    <td style="text-align: center; font-weight: 700;">${p.chTotal || ((p.chOutros || 0) + (p.chAmb || 0) + (p.chHosp || 0))}Hs.</td>
                                    <td style="text-align: center;">${p.atendimentoSus || 'SIM'}</td>
                                    <td>${p.vinculacao || 'VINCULO EMPREGATICIO'}</td>
                                    <td>${p.tipoVinculo || 'CONTRATADO TEMPORÁRIO'}</td>
                                    <td>${p.subtipo || 'PUBLICO'}</td>
                                    <td>${p.compDesativacao || ''}</td>
                                    <td class="${p.ativo !== false && p.situacao !== 'Desligado' ? 'cnes-status-ativo-red' : 'cnes-status-desligado-gray'}">
                                        ${p.situacao || (p.ativo !== false ? 'Ativo' : 'Desligado')}
                                    </td>
                                    <td>${p.portaria134 || ''}</td>
                                </tr>
                            `).join('')}
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
                            ${Array.from({ length: totalPages }, (_, i) => i + 1).map(pageNum => `
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
                            Selecione uma competência anterior para consultar a composição dos colaboradores, vínculos e habilitações vigentes naquele período:
                        </p>

                        <div style="max-height: 320px; overflow-y: auto;">
                            ${state.competencias.map(c => `
                                <div class="cnes-competencia-item ${state.competenciaAtiva === c.codigo ? 'active' : ''}"
                                     onclick="window.CnesModule.selecionarCompetencia('${c.codigo}')">
                                    <span><i class="far fa-calendar-check" style="margin-right: 0.5rem; color: #0284c7;"></i> ${c.label}</span>
                                    ${c.vigente ? '<span style="font-size: 0.72rem; background: #dcfce7; color: #15803d; padding: 0.2rem 0.5rem; border-radius: 9999px; font-weight: 700;">Vigente</span>' : ''}
                                </div>
                            `).join('')}
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

        return `
            <div class="cnes-modal-backdrop" onclick="if(event.target === this) window.CnesModule.fecharDetalhesProfissional()">
                <div class="cnes-modal-box" style="max-width: 580px;">
                    <div class="cnes-modal-header">
                        <span><i class="fas fa-user-circle"></i> Ficha Cadastral do Colaborador</span>
                        <button onclick="window.CnesModule.fecharDetalhesProfissional()">&times;</button>
                    </div>
                    <div class="cnes-modal-body">
                        <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1.25rem; padding-bottom: 0.75rem; border-bottom: 1px solid #e2e8f0;">
                            <div style="width: 48px; height: 48px; border-radius: 50%; background: #e0f2fe; color: #0284c7; display: flex; align-items: center; justify-content: center; font-size: 1.5rem;">
                                <i class="fas fa-user-md"></i>
                            </div>
                            <div>
                                <h3 style="margin: 0; font-size: 1.15rem; color: #0f172a;">${p.nome}</h3>
                                <span style="font-size: 0.8rem; color: #64748b;">${p.ocupacao || p.cbo}</span>
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
                                <span class="cnes-prof-detail-label">Estabelecimento de Saúde</span>
                                <span class="cnes-prof-detail-val">${p.unidade ? p.unidade.nomeFantasia : 'Hospital Socorro Brandão'}</span>
                            </div>
                            <div class="cnes-prof-detail-field">
                                <span class="cnes-prof-detail-label">Código CNES</span>
                                <span class="cnes-prof-detail-val" style="color: #dc2626; font-family: monospace;">${p.cnes || (p.unidade ? p.unidade.cnes : '2458055')}</span>
                            </div>
                            <div class="cnes-prof-detail-field">
                                <span class="cnes-prof-detail-label">CBO / Especialidade</span>
                                <span class="cnes-prof-detail-val">${p.cbo}</span>
                            </div>
                            <div class="cnes-prof-detail-field">
                                <span class="cnes-prof-detail-label">Data de Atribuição</span>
                                <span class="cnes-prof-detail-val">${p.dtAtribuicao || '01/06/2007'}</span>
                            </div>
                            <div class="cnes-prof-detail-field">
                                <span class="cnes-prof-detail-label">Carga Horária Semanal</span>
                                <span class="cnes-prof-detail-val">${p.chTotal || 40} horas (Amb: ${p.chAmb || 0}h / Hosp: ${p.chHosp || 0}h)</span>
                            </div>
                            <div class="cnes-prof-detail-field">
                                <span class="cnes-prof-detail-label">Situação Funcional</span>
                                <span class="cnes-prof-detail-val" style="color: #dc2626; font-weight: 700;">${p.situacao || 'Ativo'}</span>
                            </div>
                            <div class="cnes-prof-detail-field" style="grid-column: span 2;">
                                <span class="cnes-prof-detail-label">Vínculo Empregatício</span>
                                <span class="cnes-prof-detail-val">${p.vinculacao || 'VINCULO EMPREGATICIO'} — ${p.tipoVinculo || 'CONTRATADO TEMPORÁRIO'}</span>
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
     * Handlers de controle da tabela
     */
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

    return {
        init: init,
        carregarDados: carregarDados,
        render: render,
        setViewMode: setViewMode,
        abrirFicha: abrirFicha,
        abrirModuloProfissionais: abrirModuloProfissionais,
        voltarAoPortal: voltarAoPortal,
        executarBuscaEstabelecimento: executarBuscaEstabelecimento,
        executarBuscaProfissional: executarBuscaProfissional,
        abrirModalCompetencia: abrirModalCompetencia,
        fecharModalCompetencia: fecharModalCompetencia,
        selecionarCompetencia: selecionarCompetencia,
        toggleDesligados: toggleDesligados,
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

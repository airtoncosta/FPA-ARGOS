const fs = require('fs');
const path = require('path');

const gitFile = path.join(__dirname, 'index_from_git.html');
let html = fs.readFileSync(gitFile, 'utf8');

// 1. Add Produção Profissional CNS to sidebar nav
const sidebarTarget = `            <li class="nav-item" data-section="producoes-bpa">
                <i class="fas fa-file-medical-alt"></i><span>Produções BPA</span>
            </li>`;

const sidebarReplacement = `            <li class="nav-item" data-section="producoes-bpa">
                <i class="fas fa-file-medical-alt"></i><span>Produções BPA</span>
            </li>
            <li class="nav-item" data-section="producao-profissional-cns">
                <i class="fas fa-user-md"></i><span>Produção Profissional CNS</span>
            </li>`;

html = html.replace(sidebarTarget, sidebarReplacement);

// 2. Add bpaProfissionaisAmostra and scrollable box to modalUploadBpa
const modalTarget = `                        <!-- Detalhes da Leitura e Amostra de Procedimentos (Raio-X) -->
                        <div id="bpaRaioXContent" class="bpa-raiox-box" style="margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px dashed #cbd5e1; font-size: 0.8rem; text-align: left;">
                            <div id="bpaTipoExplicacao" style="font-weight: 600; color: #1e293b; margin-bottom: 0.45rem;"></div>
                            <div id="bpaProcedimentosAmostra" style="color: #475569; line-height: 1.4;"></div>
                        </div>`;

const modalReplacement = `                        <!-- Detalhes da Leitura, Procedimentos e Profissionais (Raio-X) -->
                        <div id="bpaRaioXContent" class="bpa-raiox-box" style="margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px dashed #cbd5e1; font-size: 0.8rem; text-align: left; max-height: 250px; overflow-y: auto;">
                            <div id="bpaTipoExplicacao" style="font-weight: 600; color: #1e293b; margin-bottom: 0.45rem;"></div>
                            <div id="bpaProcedimentosAmostra" style="color: #475569; line-height: 1.4;"></div>
                            <div id="bpaProfissionaisAmostra" style="color: #475569; line-height: 1.4; margin-top: 0.6rem; padding-top: 0.6rem; border-top: 1px dashed #cbd5e1;"></div>
                        </div>`;

html = html.replace(modalTarget, modalReplacement);

// 3. Add the new content section for producao-profissional-cns right before </main> or after section-producoes-bpa
const bpaSectionEnd = `        </section>

        <!-- ===== SEÇÃO CNES & VÍNCULOS ===== -->`;

const newSectionHtml = `        </section>

        <!-- ===== SEÇÃO PRODUÇÃO PROFISSIONAL CNS ===== -->
        <section id="section-producao-profissional-cns" class="content-section">
            <div class="section-header" style="display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-start; gap: 1rem; margin-bottom: 1.5rem;">
                <div>
                    <div style="display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.25rem;">
                        <h2 style="font-size: 1.5rem; font-weight: 700; color: #0f172a; margin: 0;">
                            <i class="fas fa-user-md" style="color: #0284c7;"></i> Produção Profissional CNS
                        </h2>
                        <span class="section-badge" style="background: #e0f2fe; color: #0369a1; padding: 0.25rem 0.6rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 700;">Auditoria SUS & Produtividade</span>
                    </div>
                    <p style="color: #64748b; font-size: 0.875rem; margin: 0;">
                        Acompanhamento detalhado da produção individual por profissional (CNS), procedimentos realizados, quantidades e valores SIGTAP em cada unidade.
                    </p>
                </div>
                <div style="display: flex; gap: 0.5rem; align-items: center;">
                    <button type="button" class="btn btn-secondary" onclick="window.ProducaoProfissionalModule.loadData(true)" title="Recarregar e sincronizar produções">
                        <i class="fas fa-sync-alt"></i> Atualizar
                    </button>
                    <button type="button" class="btn btn-primary" onclick="window.ProducaoProfissionalModule.exportCSV()" style="background: #0284c7; border-color: #0284c7;">
                        <i class="fas fa-file-csv"></i> Exportar CSV
                    </button>
                    <button type="button" class="btn btn-secondary" onclick="window.print()" title="Imprimir espelho de produção médica">
                        <i class="fas fa-print"></i> Imprimir
                    </button>
                </div>
            </div>

            <!-- FILTROS DO MÓDULO -->
            <div class="bpa-card" style="background: #ffffff; border-radius: 0.75rem; padding: 1.25rem; margin-bottom: 1.5rem; box-shadow: 0 1px 3px rgba(0,0,0,0.05); border: 1px solid #e2e8f0;">
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; align-items: flex-end;">
                    <div>
                        <label style="display: block; font-size: 0.75rem; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 0.35rem;">
                            <i class="fas fa-hospital" style="color: #0284c7;"></i> Unidade de Saúde
                        </label>
                        <select id="selProfUnidade" class="form-control" style="width: 100%; padding: 0.5rem 0.75rem; border: 1px solid #cbd5e1; border-radius: 0.5rem; font-size: 0.85rem; background: #f8fafc;">
                            <option value="">Todas as Unidades</option>
                        </select>
                    </div>

                    <div>
                        <label style="display: block; font-size: 0.75rem; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 0.35rem;">
                            <i class="fas fa-calendar-alt" style="color: #0284c7;"></i> Competência (Mês/Ano)
                        </label>
                        <select id="selProfCompetencia" class="form-control" style="width: 100%; padding: 0.5rem 0.75rem; border: 1px solid #cbd5e1; border-radius: 0.5rem; font-size: 0.85rem; background: #f8fafc;">
                            <option value="">Todas as Competências</option>
                        </select>
                    </div>

                    <div>
                        <label style="display: block; font-size: 0.75rem; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 0.35rem;">
                            <i class="fas fa-sort-amount-down" style="color: #0284c7;"></i> Classificação / Produtividade
                        </label>
                        <select id="selProfOrdenacao" class="form-control" style="width: 100%; padding: 0.5rem 0.75rem; border: 1px solid #cbd5e1; border-radius: 0.5rem; font-size: 0.85rem; background: #f8fafc;">
                            <option value="maior_qtd">🏆 Maior Produção (Quem produz mais)</option>
                            <option value="menor_qtd">📉 Menor Produção (Quem produz menos)</option>
                            <option value="maior_valor">💰 Maior Valor Financeiro (SIGTAP R$)</option>
                            <option value="menor_valor">🪙 Menor Valor Financeiro (SIGTAP R$)</option>
                            <option value="nome_az">🔤 Nome do Profissional (A - Z)</option>
                        </select>
                    </div>

                    <div>
                        <label style="display: block; font-size: 0.75rem; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 0.35rem;">
                            <i class="fas fa-search" style="color: #0284c7;"></i> Buscar Profissional / CNS / Código
                        </label>
                        <div style="position: relative;">
                            <input type="text" id="inputProfBusca" placeholder="Nome, CNS ou procedimento..." class="form-control" style="width: 100%; padding: 0.5rem 0.75rem 0.5rem 2rem; border: 1px solid #cbd5e1; border-radius: 0.5rem; font-size: 0.85rem;">
                            <i class="fas fa-search" style="position: absolute; left: 0.7rem; top: 50%; transform: translateY(-50%); color: #94a3b8; font-size: 0.8rem;"></i>
                        </div>
                    </div>
                </div>
            </div>

            <!-- KPIS EXECUTIVOS -->
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; margin-bottom: 1.5rem;">
                <div class="bpa-card" style="background: #ffffff; border-radius: 0.75rem; padding: 1.25rem; border: 1px solid #e2e8f0; display: flex; align-items: center; gap: 1rem;">
                    <div style="width: 48px; height: 48px; border-radius: 12px; background: #e0f2fe; color: #0284c7; display: flex; align-items: center; justify-content: center; font-size: 1.25rem;">
                        <i class="fas fa-user-md"></i>
                    </div>
                    <div>
                        <div style="font-size: 0.75rem; font-weight: 600; color: #64748b; text-transform: uppercase;">Profissionais Ativos</div>
                        <div id="kpiProfTotalAtivos" style="font-size: 1.5rem; font-weight: 800; color: #0f172a;">0</div>
                        <div style="font-size: 0.72rem; color: #0284c7;">com produção registrada</div>
                    </div>
                </div>

                <div class="bpa-card" style="background: #ffffff; border-radius: 0.75rem; padding: 1.25rem; border: 1px solid #e2e8f0; display: flex; align-items: center; gap: 1rem;">
                    <div style="width: 48px; height: 48px; border-radius: 12px; background: #dcfce7; color: #16a34a; display: flex; align-items: center; justify-content: center; font-size: 1.25rem;">
                        <i class="fas fa-stethoscope"></i>
                    </div>
                    <div>
                        <div style="font-size: 0.75rem; font-weight: 600; color: #64748b; text-transform: uppercase;">Total de Atendimentos</div>
                        <div id="kpiProfTotalProcedimentos" style="font-size: 1.5rem; font-weight: 800; color: #0f172a;">0</div>
                        <div style="font-size: 0.72rem; color: #16a34a;">procedimentos executados</div>
                    </div>
                </div>

                <div class="bpa-card" style="background: #ffffff; border-radius: 0.75rem; padding: 1.25rem; border: 1px solid #e2e8f0; display: flex; align-items: center; gap: 1rem;">
                    <div style="width: 48px; height: 48px; border-radius: 12px; background: #fef3c7; color: #d97706; display: flex; align-items: center; justify-content: center; font-size: 1.25rem;">
                        <i class="fas fa-chart-line"></i>
                    </div>
                    <div>
                        <div style="font-size: 0.75rem; font-weight: 600; color: #64748b; text-transform: uppercase;">Média por Profissional</div>
                        <div id="kpiProfMediaPorProf" style="font-size: 1.5rem; font-weight: 800; color: #0f172a;">0</div>
                        <div style="font-size: 0.72rem; color: #d97706;">atendimentos / médico</div>
                    </div>
                </div>

                <div class="bpa-card" style="background: #ffffff; border-radius: 0.75rem; padding: 1.25rem; border: 1px solid #e2e8f0; display: flex; align-items: center; gap: 1rem;">
                    <div style="width: 48px; height: 48px; border-radius: 12px; background: #fae8ff; color: #a855f7; display: flex; align-items: center; justify-content: center; font-size: 1.25rem;">
                        <i class="fas fa-trophy"></i>
                    </div>
                    <div style="min-width: 0; flex: 1;">
                        <div style="font-size: 0.75rem; font-weight: 600; color: #64748b; text-transform: uppercase;">Top Produtor</div>
                        <div id="kpiProfTopProdutor" style="font-size: 1rem; font-weight: 800; color: #0f172a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">-</div>
                        <div id="kpiProfTopProdutorQtd" style="font-size: 0.72rem; color: #a855f7; font-weight: 600;">0 atendimentos</div>
                    </div>
                </div>
            </div>

            <!-- RANKING VISUAL E COMPARATIVO (QUEM PRODUZ MAIS / QUEM PRODUZ MENOS) -->
            <div class="bpa-card" style="background: #ffffff; border-radius: 0.75rem; padding: 1.25rem; margin-bottom: 1.5rem; border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                    <div>
                        <h3 style="font-size: 1rem; font-weight: 700; color: #0f172a; margin: 0; display: flex; align-items: center; gap: 0.5rem;">
                            <i class="fas fa-chart-bar" style="color: #0284c7;"></i> Ranking de Produtividade dos Profissionais
                        </h3>
                        <p style="font-size: 0.76rem; color: #64748b; margin: 0.2rem 0 0;">
                            Comparativo direto do volume de produção médica entre os profissionais do período selecionado.
                        </p>
                    </div>
                    <span id="labelTotalProfRanking" style="font-size: 0.78rem; font-weight: 700; color: #0284c7; background: #e0f2fe; padding: 0.2rem 0.6rem; border-radius: 9999px;">0 profissionais</span>
                </div>
                <div id="containerRankingBarras" style="display: flex; flex-direction: column; gap: 0.75rem;">
                    <!-- Preenchido dinamicamente com barras comparativas de produtividade -->
                </div>
            </div>

            <!-- LISTAGEM ANALÍTICA COMPLETA DE PROFISSIONAIS E PROCEDIMENTOS -->
            <div class="bpa-card" style="background: #ffffff; border-radius: 0.75rem; padding: 1.25rem; border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; padding-bottom: 0.75rem; border-bottom: 1px solid #f1f5f9;">
                    <div>
                        <h3 style="font-size: 1rem; font-weight: 700; color: #0f172a; margin: 0;">
                            <i class="fas fa-list-alt" style="color: #0284c7;"></i> Detalhamento Individual de Profissionais e Códigos de Procedimento
                        </h3>
                        <p style="font-size: 0.76rem; color: #64748b; margin: 0.2rem 0 0;">
                            Clique em cada profissional para expandir o espelho de procedimentos, quantidades e valores SIGTAP.
                        </p>
                    </div>
                    <div style="display: flex; gap: 0.5rem;">
                        <button type="button" class="btn btn-sm btn-secondary" onclick="window.ProducaoProfissionalModule.toggleExpandAll(true)">
                            <i class="fas fa-angle-double-down"></i> Expandir Todos
                        </button>
                        <button type="button" class="btn btn-sm btn-secondary" onclick="window.ProducaoProfissionalModule.toggleExpandAll(false)">
                            <i class="fas fa-angle-double-up"></i> Recolher
                        </button>
                    </div>
                </div>

                <div id="containerProfissionaisLista" style="display: flex; flex-direction: column; gap: 0.75rem;">
                    <div style="text-align: center; padding: 2.5rem; color: #94a3b8;">
                        <i class="fas fa-spinner fa-spin" style="font-size: 1.5rem; color: #0284c7; margin-bottom: 0.5rem;"></i>
                        <p>Carregando produções por profissional...</p>
                    </div>
                </div>
            </div>
        </section>

        <!-- ===== SEÇÃO CNES & VÍNCULOS ===== -->`;

html = html.replace(bpaSectionEnd, newSectionHtml);

// 4. Add script tag at the bottom before app.js or closing body
const scriptTarget = `    <script src="js/bpa-module.js"></script>`;
const scriptReplacement = `    <script src="js/bpa-module.js"></script>
    <script src="js/producao-profissional-module.js"></script>`;

html = html.replace(scriptTarget, scriptReplacement);

const outputPath = path.join(__dirname, '../code_sandbox_light_git_fe61910d_1781185357/index.html');
fs.writeFileSync(outputPath, html, 'utf8');
console.log('Successfully written clean index.html! Bytes:', html.length);
console.log('Ufffd count:', (html.match(/\uFFFD/g) || []).length);

/* ==========================================================================
   PENTE FINO ARGOS 3D RENDERER — MOTOR DE SCANNER HOLOGRÁFICO
   Animação mecânica de cima para baixo com feixe laser e validação em 5 passos
   ========================================================================== */

(function(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    }
    if (typeof root !== 'undefined') {
        root.PenteFino3DRenderer = api;
    }
})(typeof window !== 'undefined' ? window : globalThis, function() {
    'use strict';

    let audioCtx = null;
    let ultimoC5 = null;
    const CODIGOS_REGRAS = [
        'regra1_lotacao_cnes',
        'regra2_cbo_procedimento',
        'regra3_cid_procedimento',
        'regra4_servico_classificacao',
        'regra5_cns_profissional'
    ];

    // Síntese de áudio para feedback tátil/holográfico de alta tecnologia
    function playBeep(freq = 880, type = 'sine', duration = 0.08) {
        try {
            if (!audioCtx && (window.AudioContext || window.webkitAudioContext)) {
                audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (!audioCtx || audioCtx.state === 'suspended') {
                audioCtx?.resume();
            }
            if (audioCtx) {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.type = type;
                osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
                gain.gain.setValueAtTime(0.04, audioCtx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
                osc.connect(gain);
                gain.connect(audioCtx.destination);
                osc.start();
                osc.stop(audioCtx.currentTime + duration);
            }
        } catch (_e) {
            /* Navegadores com autoplay bloqueado continuam silenciosamente */
        }
    }

    function playSuccessChord() {
        setTimeout(() => playBeep(523.25, 'sine', 0.2), 0);
        setTimeout(() => playBeep(659.25, 'sine', 0.25), 100);
        setTimeout(() => playBeep(783.99, 'triangle', 0.35), 200);
        setTimeout(() => playBeep(1046.50, 'triangle', 0.5), 300);
    }

    function obterOuCriarModal() {
        let modal = document.getElementById('modalPenteFino3D');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'modalPenteFino3D';
            modal.className = 'pf3d-modal-overlay hidden';
            modal.setAttribute('role', 'dialog');
            modal.setAttribute('aria-modal', 'true');
            modal.setAttribute('aria-label', 'Pente Fino ARGOS 3D Anti-Glosa');
            modal.innerHTML = `
                <div class="pf3d-modal-container">
                    <div class="pf3d-cyber-grid" aria-hidden="true"></div>
                    
                    <!-- Header -->
                    <div class="pf3d-header">
                        <div class="pf3d-title-group">
                            <div class="pf3d-badge-header">
                                <i class="fas fa-shield-halved" style="color: #38bdf8;"></i>
                                Pente Fino ARGOS · Anti-Glosa DATASUS
                            </div>
                            <h2>
                                <span style="background: linear-gradient(90deg, #38bdf8, #818cf8); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">
                                    Auditoria 3D da Produção BPA
                                </span>
                            </h2>
                        </div>
                        <button type="button" class="pf3d-btn-close" onclick="PenteFino3DRenderer.fechar()" title="Fechar Scanner">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>

                    <!-- Corpo: Visor 3D e HUD 5 Regras -->
                    <div class="pf3d-body">
                        <!-- Visor 3D do Pente Fino -->
                        <div class="pf3d-viewport-card" id="pf3dViewport">
                            <img src="img/pente-fino-argos-3d.jpg" alt="Pente Fino ARGOS 3D" class="pf3d-comb-image-bg" id="pf3dCombBg">
                            <div class="pf3d-laser-beam" id="pf3dLaserBeam"></div>
                            
                            <!-- Selo Holográfico ARGOS gravado no pente -->
                            <div class="pf3d-comb-branding">
                                <i class="fas fa-radar" style="color: #38bdf8; font-size: 0.75rem;"></i>
                                <span class="pf3d-comb-branding-text">ARGOS 3D PRECISION</span>
                            </div>
                        </div>

                        <!-- Coluna HUD das 5 Regras -->
                        <div class="pf3d-hud-column">
                            <div class="pf3d-hud-title">
                                <span>Verificação das 5 Regras Anti-Glosa</span>
                                <span id="pf3dFileMeta" style="color: #38bdf8; font-family: monospace; font-size: 0.75rem;">LENDO DADOS...</span>
                            </div>

                            <!-- Regra 1: Lotação CNES -->
                            <div class="pf3d-rule-item" id="pfRule1">
                                <div class="pf3d-rule-info">
                                    <div class="pf3d-rule-name">1. Lotação do Profissional no CNES</div>
                                    <div class="pf3d-rule-desc">Verifica se o profissional possui vínculo ativo no estabelecimento de saúde.</div>
                                </div>
                                <div class="pf3d-rule-badge badge-pending" id="pfBadge1">
                                    <i class="fas fa-clock"></i> Pendente
                                </div>
                            </div>

                            <!-- Regra 2: CBO x Procedimento -->
                            <div class="pf3d-rule-item" id="pfRule2">
                                <div class="pf3d-rule-info">
                                    <div class="pf3d-rule-name">2. CBO Habilitado ao Procedimento</div>
                                    <div class="pf3d-rule-desc">Confronta se a ocupação é autorizada para o procedimento no SIGTAP.</div>
                                </div>
                                <div class="pf3d-rule-badge badge-pending" id="pfBadge2">
                                    <i class="fas fa-clock"></i> Pendente
                                </div>
                            </div>

                            <!-- Regra 3: CID x Procedimento -->
                            <div class="pf3d-rule-item" id="pfRule3">
                                <div class="pf3d-rule-info">
                                    <div class="pf3d-rule-name">3. CID Habilitado ao Procedimento</div>
                                    <div class="pf3d-rule-desc">Valida se o código de diagnóstico consta no rol compatível do SIGTAP.</div>
                                </div>
                                <div class="pf3d-rule-badge badge-pending" id="pfBadge3">
                                    <i class="fas fa-clock"></i> Pendente
                                </div>
                            </div>

                            <!-- Regra 4: Serviço e Classificação -->
                            <div class="pf3d-rule-item" id="pfRule4">
                                <div class="pf3d-rule-info">
                                    <div class="pf3d-rule-name">4. Serviço e Classificação (SIGTAP)</div>
                                    <div class="pf3d-rule-desc">Confronta se o serviço e classificação informados conferem com os habilitados no SIGTAP.</div>
                                </div>
                                <div class="pf3d-rule-badge badge-pending" id="pfBadge4">
                                    <i class="fas fa-clock"></i> Pendente
                                </div>
                            </div>

                            <!-- Regra 5: CNS do Profissional -->
                            <div class="pf3d-rule-item" id="pfRule5">
                                <div class="pf3d-rule-info">
                                    <div class="pf3d-rule-name">5. Cartão SUS (CNS) do Profissional</div>
                                    <div class="pf3d-rule-desc">Conferência matemática do dígito verificador módulo 11 do Cartão SUS.</div>
                                </div>
                                <div class="pf3d-rule-badge badge-pending" id="pfBadge5">
                                    <i class="fas fa-clock"></i> Pendente
                                </div>
                            </div>

                            <!-- Espaço para o Painel de Parecer Final -->
                            <div id="pf3dFinalContainer"></div>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        }
        return modal;
    }

    function resetarHud(nomeArquivo, totalLinhas) {
        const metaEl = document.getElementById('pf3dFileMeta');
        if (metaEl) {
            metaEl.textContent = `${nomeArquivo} (${totalLinhas || '—'} reg.)`;
        }

        for (let i = 1; i <= 5; i++) {
            const ruleEl = document.getElementById(`pfRule${i}`);
            const badgeEl = document.getElementById(`pfBadge${i}`);
            if (ruleEl) {
                ruleEl.className = 'pf3d-rule-item';
                ruleEl.classList.remove('pf3d-rule-clickable');
                ruleEl.removeAttribute('role');
                ruleEl.removeAttribute('tabindex');
                ruleEl.removeAttribute('title');
                ruleEl.onclick = null;
                ruleEl.onkeydown = null;
                ruleEl.style.cursor = '';
            }
            if (badgeEl) {
                badgeEl.className = 'pf3d-rule-badge badge-pending';
                badgeEl.innerHTML = '<i class="fas fa-clock"></i> Pendente';
            }
        }

        const finalCont = document.getElementById('pf3dFinalContainer');
        if (finalCont) {
            finalCont.innerHTML = '';
        }

        // Restaura animação do laser e fundo
        const laser = document.getElementById('pf3dLaserBeam');
        if (laser) {
            laser.style.display = 'block';
            laser.style.background = 'linear-gradient(90deg, transparent 0%, #38bdf8 30%, #818cf8 50%, #38bdf8 70%, transparent 100%)';
            laser.style.boxShadow = '0 0 15px #38bdf8, 0 0 30px #818cf8';
        }
        const imgBg = document.getElementById('pf3dCombBg');
        if (imgBg) {
            imgBg.style.filter = 'contrast(1.15) saturate(1.2)';
            imgBg.style.transform = 'scale(1)';
        }
    }

    function atualizarEstadoRegra(indice, status, confirmadas = 0, pendencias = 0) {
        const ruleEl = document.getElementById(`pfRule${indice}`);
        const badgeEl = document.getElementById(`pfBadge${indice}`);
        if (!ruleEl || !badgeEl) return;
        const codigoRegra = CODIGOS_REGRAS[indice - 1] || '';

        const limparClique = () => {
            ruleEl.classList.remove('pf3d-rule-clickable');
            ruleEl.removeAttribute('role');
            ruleEl.removeAttribute('tabindex');
            ruleEl.removeAttribute('title');
            ruleEl.onclick = null;
            ruleEl.onkeydown = null;
            ruleEl.style.cursor = '';
        };

        if (status === 'scanning') {
            limparClique();
            ruleEl.className = 'pf3d-rule-item status-scanning';
            badgeEl.className = 'pf3d-rule-badge badge-scanning';
            badgeEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Varrendo...';
            playBeep(440 + indice * 80, 'sine', 0.06);
        } else if (status === 'ok') {
            limparClique();
            ruleEl.className = 'pf3d-rule-item status-ok';
            badgeEl.className = 'pf3d-rule-badge badge-ok';
            badgeEl.innerHTML = '<i class="fas fa-check-circle"></i> Conforme';
            playBeep(660 + indice * 60, 'triangle', 0.08);
        } else if (status === 'glosa') {
            const soPendencia = confirmadas === 0;
            ruleEl.className = 'pf3d-rule-item ' + (soPendencia ? 'status-aviso' : 'status-glosa') + ' pf3d-rule-clickable';
            badgeEl.className = 'pf3d-rule-badge ' + (soPendencia ? 'badge-aviso' : 'badge-glosa');
            badgeEl.innerHTML = soPendencia
                ? `<i class="fas fa-exclamation-triangle"></i> A conferir (${pendencias})`
                : `<i class="fas fa-times-circle"></i> Glosa (${confirmadas})`;
            ruleEl.style.cursor = 'pointer';
            ruleEl.setAttribute('role', 'button');
            ruleEl.setAttribute('tabindex', '0');
            ruleEl.setAttribute('title', soPendencia ? `Clique para ver as ${pendencias} linha(s) a conferir` : `Clique para ver as ${confirmadas} linha(s) com glosa`);
            ruleEl.onclick = () => abrirDiagnosticoCompleto(codigoRegra);
            ruleEl.onkeydown = (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    abrirDiagnosticoCompleto(codigoRegra);
                }
            };
            playBeep(240, 'sawtooth', 0.15);
        }
    }

    /**
     * Inicia a experiência de auditoria holográfica 3D
     */
    async function abrirScanner(arquivoDados, execAuditFn) {
        const modal = obterOuCriarModal();
        const nomeArquivo = arquivoDados?.nomeArquivo || arquivoDados?.nome_arquivo || 'Produção BPA';
        resetarHud(nomeArquivo, arquivoDados?.linhas || arquivoDados?.totalLinhas);
        modal.classList.remove('hidden');

        // Executa a auditoria real em segundo plano
        let auditResult = null;
        try {
            auditResult = await execAuditFn((info) => {
                // Notificações de progresso preliminar
                const metaEl = document.getElementById('pf3dFileMeta');
                if (metaEl && info.mensagem) metaEl.textContent = info.mensagem;
            });
        } catch (err) {
            console.error('Erro na execução do Pente Fino:', err);
            const finalCont = document.getElementById('pf3dFinalContainer');
            if (finalCont) {
                finalCont.innerHTML = `
                    <div class="pf3d-final-panel pf3d-final-warning">
                        <div class="pf3d-final-text">
                            <h3><i class="fas fa-exclamation-triangle"></i> Falha no Processamento</h3>
                            <p>${err.message || 'Não foi possível concluir a leitura do arquivo.'}</p>
                        </div>
                    </div>
                `;
            }
            return;
        }

        const c5 = auditResult?.classificacao5Regras || window.PenteFinoEngine.classificar5Regras(auditResult);
        ultimoC5 = c5;
        const regrasArray = [
            c5.regra1_lotacao_cnes,
            c5.regra2_cbo_procedimento,
            c5.regra3_cid_procedimento,
            c5.regra4_servico_classificacao,
            c5.regra5_cns_profissional
        ];

        // Animação sequencial com descida do pente fino
        for (let i = 0; i < 5; i++) {
            const num = i + 1;
            atualizarEstadoRegra(num, 'scanning');
            await new Promise(r => setTimeout(r, 450));

            const reg = regrasArray[i];
            if (reg.ok) {
                atualizarEstadoRegra(num, 'ok');
            } else {
                const engine = (typeof window !== 'undefined' && window.PenteFinoEngine) ? window.PenteFinoEngine : null;
                const resumo = engine && typeof engine.resumoRegra === 'function'
                    ? engine.resumoRegra(reg)
                    : { confirmadas: (reg.glosas || []).filter(g => g.status === 'NAO_CONFORME').length, pendencias: (reg.glosas || []).filter(g => g.status !== 'NAO_CONFORME').length };
                atualizarEstadoRegra(num, 'glosa', resumo.confirmadas, resumo.pendencias);
            }
            await new Promise(r => setTimeout(r, 200));
        }

        // Conclusão e Parecer Final
        const finalCont = document.getElementById('pf3dFinalContainer');
        const podeEnviar = c5.podeEnviarSemGlosa === true;
        const parecerStatus = c5.parecer?.status || (podeEnviar ? 'APROVADO' : 'BLOQUEADO');
        const totalGlosas = c5.parecer?.totalGlosas ?? 0;
        const totalPendencias = c5.parecer?.totalPendencias ?? 0;

        const laser = document.getElementById('pf3dLaserBeam');
        const imgBg = document.getElementById('pf3dCombBg');

        if (podeEnviar) {
            // Sucesso Total: Efeito visual verde neon e acorde sonoro de aprovação
            playSuccessChord();
            if (laser) {
                laser.style.background = 'linear-gradient(90deg, transparent 0%, #10b981 30%, #34d399 50%, #10b981 70%, transparent 100%)';
                laser.style.boxShadow = '0 0 25px #10b981, 0 0 50px #34d399';
            }
            if (imgBg) {
                imgBg.style.filter = 'contrast(1.2) saturate(1.3) hue-rotate(60deg)';
                imgBg.style.transform = 'scale(1.04)';
            }

            finalCont.innerHTML = `
                <div class="pf3d-final-panel pf3d-final-success">
                    <div class="pf3d-final-text">
                        <h3>
                            <i class="fas fa-circle-check" style="color: #34d399;"></i>
                            PODE ENVIAR A PRODUÇÃO SEM GLOSA
                        </h3>
                        <p>
                            O Pente Fino ARGOS auditou 100% dos ${auditResult.totalLinhas} atendimentos nas 5 regras oficiais. Nenhuma glosa encontrada.
                        </p>
                    </div>
                    <div class="pf3d-actions">
                        <button type="button" class="btn-pf3d-send" onclick="PenteFino3DRenderer.confirmarEnvioDireto()">
                            <i class="fas fa-paper-plane"></i> Confirmar e Enviar Produção
                        </button>
                    </div>
                </div>
            `;

            // Marca visual no modal original de envio BPA
            const btnEnviarPrincipal = document.getElementById('btnConfirmarUploadBpa') || document.getElementById('btnConfirmarEnvioBpa') || document.querySelector('.btn-bpa-submit');
            if (btnEnviarPrincipal) {
                btnEnviarPrincipal.style.boxShadow = '0 0 20px rgba(16, 185, 129, 0.7)';
                btnEnviarPrincipal.style.border = '2px solid #34d399';
            }
        } else if (parecerStatus === 'INCONCLUSIVO') {
            // Verificação incompleta: nenhuma glosa definitiva, mas há pendências a conferir (âmbar).
            if (laser) {
                laser.style.background = 'linear-gradient(90deg, transparent 0%, #f59e0b 30%, #fbbf24 50%, #f59e0b 70%, transparent 100%)';
                laser.style.boxShadow = '0 0 25px #f59e0b, 0 0 50px #fbbf24';
            }

            finalCont.innerHTML = `
                <div class="pf3d-final-panel pf3d-final-warning">
                    <div class="pf3d-final-text">
                        <h3>
                            <i class="fas fa-exclamation-triangle" style="color: #f59e0b;"></i>
                            VERIFICAÇÃO INCOMPLETA NO PENTE FINO
                        </h3>
                        <p>
                            Nenhuma glosa definitiva foi confirmada, mas ${totalPendencias} pendência(s) exigem conferência antes do envio sem glosa. A auditoria foi registrada para rastreabilidade e você pode conferir as pendências ou enviar para recepção integrada.
                        </p>
                    </div>
                    <div class="pf3d-actions" style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                        <button type="button" class="btn-pf3d-secondary" onclick="PenteFino3DRenderer.abrirDiagnosticoCompleto()">
                            <i class="fas fa-list-check"></i> Ver Pendências
                        </button>
                        <button type="button" class="btn-pf3d-secondary" style="background: linear-gradient(135deg, #f59e0b, #d97706); box-shadow: 0 0 15px rgba(245, 158, 11, 0.4); border: none;" onclick="PenteFino3DRenderer.confirmarEnvioDireto()">
                            <i class="fas fa-shield-alt"></i> Enviar para Recepção Integrada
                        </button>
                    </div>
                </div>
            `;
        } else {
            // Glosa Detectada: Efeito vermelho/alerta
            if (laser) {
                laser.style.background = 'linear-gradient(90deg, transparent 0%, #ef4444 30%, #f87171 50%, #ef4444 70%, transparent 100%)';
                laser.style.boxShadow = '0 0 25px #ef4444, 0 0 50px #f87171';
            }
            if (imgBg) {
                imgBg.style.filter = 'contrast(1.2) saturate(1.3) hue-rotate(300deg)';
            }

            finalCont.innerHTML = `
                <div class="pf3d-final-panel pf3d-final-warning">
                    <div class="pf3d-final-text">
                        <h3>
                            <i class="fas fa-ban" style="color: #f87171;"></i>
                            GLOSAS DETECTADAS NO PENTE FINO
                        </h3>
                        <p>
                            Foram confirmadas ${totalGlosas} glosa(s) no lote${totalPendencias > 0 ? `, além de ${totalPendencias} pendência(s) a conferir` : ''}. Corrija os pontos indicados no diagnóstico antes do envio oficial para evitar rejeição no SIA/SUS — ou envie com apontamentos para recepção integrada.
                        </p>
                    </div>
                    <div class="pf3d-actions" style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                        <button type="button" class="btn-pf3d-secondary" onclick="PenteFino3DRenderer.abrirDiagnosticoCompleto()">
                            <i class="fas fa-list-check"></i> Ver Linhas com Glosa
                        </button>
                        <button type="button" class="btn-pf3d-secondary" style="background: linear-gradient(135deg, #f59e0b, #d97706); box-shadow: 0 0 15px rgba(245, 158, 11, 0.4); border: none;" onclick="PenteFino3DRenderer.confirmarEnvioDireto()">
                            <i class="fas fa-shield-alt"></i> Confirmar Envio com Apontamentos
                        </button>
                    </div>
                </div>
            `;
        }
    }

    function fechar() {
        if (typeof document === 'undefined') return;
        const modal = document.getElementById('modalPenteFino3D');
        if (modal) {
            modal.classList.add('hidden');
        }
    }

    function confirmarEnvioDireto() {
        fechar();
        const bpa = (typeof window !== 'undefined' && window.BpaModule) ? window.BpaModule : (typeof globalThis !== 'undefined' && globalThis.BpaModule ? globalThis.BpaModule : null);
        if (bpa && typeof bpa.handleFormSubmit === 'function') {
            return bpa.handleFormSubmit();
        } else if (typeof document !== 'undefined') {
            const btnEnvio = document.getElementById('btnConfirmarUploadBpa') || document.getElementById('btnConfirmarEnvioBpa');
            if (btnEnvio) btnEnvio.click();
        }
    }

    function abrirDiagnosticoCompleto(filtroRegra) {
        fechar();
        const engine = (typeof window !== 'undefined' && window.PenteFinoEngine) ? window.PenteFinoEngine : (typeof globalThis !== 'undefined' && globalThis.PenteFinoEngine ? globalThis.PenteFinoEngine : null);
        if (engine && filtroRegra && typeof engine.filtrarRegra === 'function') {
            engine.filtrarRegra(filtroRegra);
            return;
        }
        if (engine && typeof engine.renderizarResultados === 'function') {
            engine.renderizarResultados();
        } else if (typeof document !== 'undefined') {
            const box = document.getElementById('modalMalhaFinaResultados');
            if (box) box.classList.remove('hidden');
        }
    }

    return {
        abrirScanner,
        fechar,
        confirmarEnvioDireto,
        abrirDiagnosticoCompleto
    };
});

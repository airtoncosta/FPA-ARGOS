$filePath = "c:\Users\Controle\.gemini\antigravity-ide\scratch\FPA-ARGOS\code_sandbox_light_git_fe61910d_1781185357\js\bpa-module.js"
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$content = [System.IO.File]::ReadAllText($filePath, $utf8NoBom)

# Bloco 1: Substituir detalhes até formatFileSize
$startMarker1 = "const detalhes = [...procedures].map(([codigo, quantidade]) => ({codigo, quantidade}));"
$endMarker1 = "formatFileSize(bytes) {"

$pos1 = $content.IndexOf($startMarker1)
$posEnd1 = $content.IndexOf($endMarker1, $pos1)

if ($pos1 -eq -1 -or $posEnd1 -eq -1) {
    Write-Output "ERROR: Marker 1 not found (pos1=$pos1, posEnd1=$posEnd1)"
    exit 1
}

$replacement1 = @"
const detalhes = [...procedures].map(([codigo, quantidade]) => ({codigo, quantidade}));
        detalhes.sort((a, b) => b.quantidade - a.quantidade);

        // Agrupamento deterministico por Profissional (CNS)
        const profMap = new Map();
        for (const r of records) {
            const cns = String(r.cnsProfissional || '').trim();
            if (!cns) continue;
            const qty = /^\d+$/.test(r.quantidade) ? Number(r.quantidade) : 1;
            if (!profMap.has(cns)) {
                profMap.set(cns, {
                    cns,
                    cbo: r.cbo || '',
                    cbos: new Set(r.cbo ? [r.cbo] : []),
                    totalQuantidade: 0,
                    totalAtendimentos: 0,
                    procedimentosMap: new Map()
                });
            }
            const prof = profMap.get(cns);
            prof.totalQuantidade += qty;
            prof.totalAtendimentos += 1;
            if (r.cbo) prof.cbos.add(r.cbo);
            if (r.procedimento) {
                const procQty = (prof.procedimentosMap.get(r.procedimento) || 0) + qty;
                prof.procedimentosMap.set(r.procedimento, procQty);
            }
        }

        const profissionaisDetalhados = [...profMap.values()].map(prof => {
            const info = this.lookupProfissional ? this.lookupProfissional(prof.cns, cnes) : null;
            const nome = info?.nome || '';
            const cboDesc = info?.ocupacao || (prof.cbo ? ('CBO ' + prof.cbo) : '');
            const procedimentos = [...prof.procedimentosMap.entries()]
                .sort((a, b) => b[1] - a[1])
                .map(([codigo, quantidade]) => ({ codigo, quantidade }));
            return {
                cns: prof.cns,
                nome,
                cbo: [...prof.cbos].join(', ') || prof.cbo,
                cboDesc,
                quantidade: prof.totalQuantidade,
                atendimentos: prof.totalAtendimentos,
                procedimentos
            };
        }).sort((a, b) => b.quantidade - a.quantidade);

        const profissionaisAmostra = this.formatProfissionaisAmostra(profissionaisDetalhados);

        return {
            nomeArquivo: file?.name || '', estabelecimentoNome: unit?.nome || '', cnes, cnesList,
            competencia, competenciasAtendimento: competencies, competenciaFormatada: this.formatCompetenciaLabel(competencia),
            tipoBpa: count02 && count03 ? 'AMBOS' : count03 ? 'BPA-I' : 'BPA-C',
            tipoExplicacao: records.length + ' registros reais: ' + count02 + ' BPA-C e ' + count03 + ' BPA-I. ' + (parsed.issues.length ? 'Há pontos de estrutura para conferir na auditoria.' : 'Execute a auditoria para verificar as regras e bases da competência.'),
            count02, count03, totalLinhas: records.length,
            totalAtendimentos: detalhes.reduce((n, p) => n + p.quantidade, 0),
            valorTotalEstimado: null, valorTotalFormatado: 'Disponível após auditoria da competência',
            procedimentosDetalhados: detalhes,
            procedimentosAmostra: detalhes.slice(0, 5).map(p => '• <code>' + p.codigo + '</code> — quantidade: ' + p.quantidade),
            profissionaisDetalhados,
            profissionaisAmostra,
            totalProfissionais: profissionaisDetalhados.length,
            tamanhoBytes: file?.size || 0, tamanhoFormatado: this.formatFileSize(file?.size || 0),
            conteudo: textContent
        };
    },

    formatProfissionaisAmostra(profissionaisDetalhados) {
        if (!Array.isArray(profissionaisDetalhados) || !profissionaisDetalhados.length) return [];
        return profissionaisDetalhados.map(prof => {
            const nomeStr = prof.nome ? (' <strong style="color: #0f172a;">' + prof.nome + '</strong>') : '';
            const cboStr = prof.cboDesc 
                ? (' <span style="color: #64748b; font-size: 0.76rem;">(' + prof.cboDesc + ')</span>') 
                : (prof.cbo ? (' <span style="color: #64748b; font-size: 0.76rem;">(CBO: ' + prof.cbo + ')</span>') : '');

            let procsHtml = '';
            if (prof.procedimentos && prof.procedimentos.length > 0) {
                const badges = prof.procedimentos.map(p => 
                    '<span style="display: inline-flex; align-items: center; gap: 4px; background: #ffffff; border: 1px solid #cbd5e1; padding: 2px 6px; border-radius: 4px; margin: 2px 4px 2px 0; font-size: 0.76rem;">' +
                    '<code>' + p.codigo + '</code>: <strong style="color: #0284c7;">' + p.quantidade + '</strong>' +
                    '</span>'
                ).join(' ');
                procsHtml = '<div style="margin-top: 3px; padding-left: 1.1rem; color: #475569; font-size: 0.76rem;">↳ Produção do profissional: ' + badges + '</div>';
            }

            return '<div style="margin-bottom: 0.5rem; line-height: 1.45;">' +
                '• CNS <code style="background: #e0f2fe; color: #0369a1; padding: 1px 5px; border-radius: 3px; font-weight: 700;">' + prof.cns + '</code>' + nomeStr + cboStr + ' — <strong>quantidade total: ' + prof.quantidade + '</strong>' +
                procsHtml +
                '</div>';
        });
    },

    lookupProfissional(cns, cnes = '') {
        const cleanCns = String(cns || '').replace(/\D/g, '');
        if (!cleanCns) return null;

        try {
            if (typeof window !== 'undefined' && window.CnesModule && window.CnesModule.state && Array.isArray(window.CnesModule.state.estabelecimentos)) {
                const estabs = window.CnesModule.state.estabelecimentos;
                if (cnes) {
                    const u = estabs.find(est => String(est.cnes || '').replace(/\D/g, '') === String(cnes).replace(/\D/g, ''));
                    if (u && Array.isArray(u.profissionais)) {
                        const found = u.profissionais.find(p => String(p.cns || p.cnsMaster || '').replace(/\D/g, '') === cleanCns);
                        if (found) return found;
                    }
                }
                for (const u of estabs) {
                    if (Array.isArray(u.profissionais)) {
                        const found = u.profissionais.find(p => String(p.cns || p.cnsMaster || '').replace(/\D/g, '') === cleanCns);
                        if (found) return found;
                    }
                }
            }
        } catch (e) {}

        try {
            if (typeof localStorage !== 'undefined') {
                const cacheKeys = ['argos_cnes_210120', 'cnes_bacabal_cache_v2', 'argos_cnes_base'];
                for (const k of cacheKeys) {
                    const raw = localStorage.getItem(k);
                    if (raw) {
                        const parsed = JSON.parse(raw);
                        const estabs = parsed.estabelecimentos || (Array.isArray(parsed) ? parsed : []);
                        if (Array.isArray(estabs)) {
                            for (const u of estabs) {
                                if (Array.isArray(u.profissionais)) {
                                    const found = u.profissionais.find(p => String(p.cns || p.cnsMaster || '').replace(/\D/g, '') === cleanCns);
                                    if (found) return found;
                                }
                            }
                        }
                    }
                }
            }
        } catch (e) {}

        return null;
    },

    async enrichProfissionaisNames(parsed) {
        if (!parsed || !parsed.profissionaisDetalhados || !parsed.profissionaisDetalhados.length) return;
        const hasMissing = parsed.profissionaisDetalhados.some(p => !p.nome);
        if (!hasMissing) return;

        try {
            if (!this.cnesBaseCache && typeof fetch === 'function') {
                const res = await fetch('/cnes_data/cnes_bacabal.json').catch(() => null);
                if (res && res.ok) {
                    this.cnesBaseCache = await res.json();
                }
            }
            if (this.cnesBaseCache && Array.isArray(this.cnesBaseCache.estabelecimentos)) {
                let updated = false;
                for (const prof of parsed.profissionaisDetalhados) {
                    if (!prof.nome) {
                        for (const u of this.cnesBaseCache.estabelecimentos) {
                            if (Array.isArray(u.profissionais)) {
                                const found = u.profissionais.find(p => String(p.cns || p.cnsMaster || '').replace(/\D/g, '') === prof.cns);
                                if (found) {
                                    prof.nome = found.nome || '';
                                    prof.cboDesc = found.ocupacao || prof.cboDesc;
                                    updated = true;
                                    break;
                                }
                            }
                        }
                    }
                }
                if (updated && this.filePendingUpload === parsed) {
                    parsed.profissionaisAmostra = this.formatProfissionaisAmostra(parsed.profissionaisDetalhados);
                    const elProfs = document.getElementById('bpaProfissionaisAmostra');
                    if (elProfs) {
                        elProfs.innerHTML = '<strong style="color: #1e293b; display: block; margin-bottom: 0.35rem;"><i class="fas fa-user-md" style="color: #0284c7;"></i> Profissionais Identificados no Arquivo (CNS):</strong>' + parsed.profissionaisAmostra.join('');
                    }
                }
            }
        } catch (e) {}
    },

    
"@

$part1 = $content.Substring(0, $pos1)
$part2 = $content.Substring($posEnd1)
$content = $part1 + $replacement1 + $part2

# Bloco 2: Atualizar handleFileSelect para renderizar os profissionais
$startMarker2 = "const elExplicacao = document.getElementById('bpaTipoExplicacao');"
$endMarker2 = "document.getElementById('inputBpaEstabelecimento').value = parsed.estabelecimentoNome;"

$pos2 = $content.IndexOf($startMarker2)
$posEnd2 = $content.IndexOf($endMarker2, $pos2)

if ($pos2 -eq -1 -or $posEnd2 -eq -1) {
    Write-Output "ERROR: Marker 2 not found (pos2=$pos2, posEnd2=$posEnd2)"
    exit 1
}

$replacement2 = @"
const elExplicacao = document.getElementById('bpaTipoExplicacao');
            const elAmostra = document.getElementById('bpaProcedimentosAmostra');
            const elProfs = document.getElementById('bpaProfissionaisAmostra');
            if (elExplicacao) elExplicacao.innerHTML = parsed.tipoExplicacao;
            if (elAmostra) {
                if (parsed.procedimentosAmostra && parsed.procedimentosAmostra.length > 0) {
                    elAmostra.innerHTML = '<strong>Principais Procedimentos no Arquivo:</strong><br>' + parsed.procedimentosAmostra.join('<br>');
                } else {
                    elAmostra.innerHTML = '<em>Estrutura padrão de faturamento reconhecida com sucesso.</em>';
                }
            }
            if (elProfs) {
                if (parsed.profissionaisAmostra && parsed.profissionaisAmostra.length > 0) {
                    elProfs.innerHTML = '<strong style="color: #1e293b; display: block; margin-bottom: 0.35rem;"><i class="fas fa-user-md" style="color: #0284c7;"></i> Profissionais Identificados no Arquivo (CNS):</strong>' + parsed.profissionaisAmostra.join('');
                    elProfs.style.display = 'block';
                } else if (parsed.tipoBpa === 'BPA-C') {
                    elProfs.innerHTML = '<strong style="color: #1e293b; display: block; margin-bottom: 0.25rem;"><i class="fas fa-user-md" style="color: #64748b;"></i> Profissionais no Arquivo (CNS):</strong><em style="color: #64748b; font-size: 0.76rem;">Produção Consolidada (BPA-C): o layout oficial DATASUS consolida os atendimentos por CBO (sem CNS individual de profissional).</em>';
                    elProfs.style.display = 'block';
                } else {
                    elProfs.innerHTML = '<strong style="color: #1e293b; display: block; margin-bottom: 0.25rem;"><i class="fas fa-user-md" style="color: #64748b;"></i> Profissionais no Arquivo (CNS):</strong><em style="color: #64748b; font-size: 0.76rem;">Nenhum profissional com CNS individual identificado.</em>';
                    elProfs.style.display = 'block';
                }
            } else if (elAmostra && parsed.profissionaisAmostra && parsed.profissionaisAmostra.length > 0) {
                elAmostra.innerHTML += '<div style="margin-top: 0.6rem; padding-top: 0.6rem; border-top: 1px dashed #cbd5e1;"><strong style="color: #1e293b; display: block; margin-bottom: 0.35rem;"><i class="fas fa-user-md" style="color: #0284c7;"></i> Profissionais Identificados no Arquivo (CNS):</strong>' + parsed.profissionaisAmostra.join('') + '</div>';
            }

            // Tenta enriquecer nomes de profissionais via CNES
            this.enrichProfissionaisNames(parsed);

            
"@

$part1 = $content.Substring(0, $pos2)
$part2 = $content.Substring($posEnd2)
$content = $part1 + $replacement2 + $part2

# Bloco 3: Limpar bpaProfissionaisAmostra no openUploadModal
$startMarker3 = "document.getElementById('btnConfirmarUploadBpa').disabled = true;"
$pos3 = $content.IndexOf($startMarker3)
if ($pos3 -ne -1) {
    $replacement3 = "document.getElementById('btnConfirmarUploadBpa').disabled = true;`r`n        const elProfsInit = document.getElementById('bpaProfissionaisAmostra');`r`n        if (elProfsInit) elProfsInit.innerHTML = '';"
    $part1 = $content.Substring(0, $pos3)
    $part2 = $content.Substring($pos3 + $startMarker3.Length)
    $content = $part1 + $replacement3 + $part2
}

[System.IO.File]::WriteAllText($filePath, $content, $utf8NoBom)
Write-Output "BPA-MODULE SUCCESSFULLY UPDATED VIA INDEX"

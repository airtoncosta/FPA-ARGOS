const fs = require('fs');
const path = require('path');

const basePath = path.join(__dirname, '../code_sandbox_light_git_fe61910d_1781185357');
const gitFile = path.join(__dirname, 'bpa_module_from_git.js');
let content = fs.readFileSync(gitFile, 'utf8');

// 1. In parseBpaFile(file, textContent):
// After sorting procedimentos:
// const detalhes = [...procedures].map(([codigo, quantidade]) => ({codigo, quantidade}));
// detalhes.sort((a, b) => b.quantidade - a.quantidade);
const target1 = `        const detalhes = [...procedures].map(([codigo, quantidade]) => ({codigo, quantidade}));
        detalhes.sort((a, b) => b.quantidade - a.quantidade);`;

const replacement1 = `        const detalhes = [...procedures].map(([codigo, quantidade]) => ({codigo, quantidade}));
        detalhes.sort((a, b) => b.quantidade - a.quantidade);

        // Agrupamento deterministico por Profissional (CNS)
        const profMap = new Map();
        for (const r of records) {
            const cns = String(r.cnsProfissional || '').trim();
            if (!cns) continue;
            const qty = /^\\d+$/.test(r.quantidade) ? Number(r.quantidade) : 1;
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

        const profissionaisAmostra = this.formatProfissionaisAmostra(profissionaisDetalhados);`;

content = content.replace(target1, replacement1);

// 2. In return object of parseBpaFile:
const target2 = `            procedimentosDetalhados: detalhes,
            procedimentosAmostra: detalhes.slice(0, 5).map(p => "• <code>" + p.codigo + "</code> — quantidade: " + p.quantidade),
            tamanhoBytes: file?.size || 0, tamanhoFormatado: this.formatFileSize(file?.size || 0),`;

const replacement2 = `            procedimentosDetalhados: detalhes,
            procedimentosAmostra: detalhes.slice(0, 5).map(p => "• <code>" + p.codigo + "</code> — quantidade: " + p.quantidade),
            profissionaisDetalhados,
            profissionaisAmostra,
            totalProfissionais: profissionaisDetalhados.length,
            tamanhoBytes: file?.size || 0, tamanhoFormatado: this.formatFileSize(file?.size || 0),`;

content = content.replace(target2, replacement2);

// 3. Add helper methods formatProfissionaisAmostra, lookupProfissional, enrichProfissionaisNames
const target3 = `            conteudo: textContent
        };
    },

    formatFileSize(bytes) {`;

const replacement3 = `            conteudo: textContent
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
                procsHtml = '<div style="margin-top: 3px; padding-left: 1.1rem; color: #475569; font-size: 0.76rem;">\\u21B3 Produção do profissional: ' + badges + '</div>';
            }

            return '<div style="margin-bottom: 0.5rem; line-height: 1.45;">• CNS <code style="background: #e0f2fe; color: #0369a1; padding: 1px 5px; border-radius: 3px; font-weight: 700;">' + prof.cns + '</code>' + nomeStr + cboStr + ' — <strong>quantidade total: ' + prof.quantidade + '</strong>' + procsHtml + '</div>';
        });
    },

    lookupProfissional(cns, cnes = '') {
        const cleanCns = String(cns || '').replace(/\\D/g, '');
        if (!cleanCns) return null;

        try {
            if (typeof window !== 'undefined' && window.CnesModule && window.CnesModule.state && Array.isArray(window.CnesModule.state.estabelecimentos)) {
                const estabs = window.CnesModule.state.estabelecimentos;
                if (cnes) {
                    const u = estabs.find(est => String(est.cnes || '').replace(/\\D/g, '') === String(cnes).replace(/\\D/g, ''));
                    if (u && Array.isArray(u.profissionais)) {
                        const found = u.profissionais.find(p => String(p.cns || p.cnsMaster || '').replace(/\\D/g, '') === cleanCns);
                        if (found) return found;
                    }
                }
                for (const u of estabs) {
                    if (Array.isArray(u.profissionais)) {
                        const found = u.profissionais.find(p => String(p.cns || p.cnsMaster || '').replace(/\\D/g, '') === cleanCns);
                        if (found) return found;
                    }
                }
            }
            if (this.cnesBaseCache && Array.isArray(this.cnesBaseCache.estabelecimentos)) {
                for (const u of this.cnesBaseCache.estabelecimentos) {
                    if (Array.isArray(u.profissionais)) {
                        const found = u.profissionais.find(p => String(p.cns || p.cnsMaster || '').replace(/\\D/g, '') === cleanCns);
                        if (found) return found;
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
                                const found = u.profissionais.find(p => String(p.cns || p.cnsMaster || '').replace(/\\D/g, '') === prof.cns);
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

    formatFileSize(bytes) {`;

content = content.replace(target3, replacement3);

// 4. In openUploadModal: reset bpaProfissionaisAmostra
const target4 = `        document.getElementById('btnConfirmarUploadBpa').disabled = true;

        if (prefillEstab) {`;

const replacement4 = `        document.getElementById('btnConfirmarUploadBpa').disabled = true;
        const elProfsInit = document.getElementById('bpaProfissionaisAmostra');
        if (elProfsInit) elProfsInit.innerHTML = '';

        if (prefillEstab) {`;

content = content.replace(target4, replacement4);

// 5. In handleFileSelect: render bpaProfissionaisAmostra and call enrichProfissionaisNames
const target5 = `            if (elAmostra) {
                if (parsed.procedimentosAmostra && parsed.procedimentosAmostra.length > 0) {
                    elAmostra.innerHTML = '<strong>Principais Procedimentos no Arquivo:</strong><br>' + parsed.procedimentosAmostra.join('<br>');
                } else {
                    elAmostra.innerHTML = '<em>Estrutura padrão de faturamento reconhecida com sucesso.</em>';
                }
            }

            document.getElementById('inputBpaEstabelecimento').value = parsed.estabelecimentoNome;`;

const replacement5 = `            if (elAmostra) {
                if (parsed.procedimentosAmostra && parsed.procedimentosAmostra.length > 0) {
                    elAmostra.innerHTML = '<strong>Principais Procedimentos no Arquivo:</strong><br>' + parsed.procedimentosAmostra.join('<br>');
                } else {
                    elAmostra.innerHTML = '<em>Estrutura padrão de faturamento reconhecida com sucesso.</em>';
                }
            }
            const elProfs = document.getElementById('bpaProfissionaisAmostra');
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

            document.getElementById('inputBpaEstabelecimento').value = parsed.estabelecimentoNome;`;

content = content.replace(target5, replacement5);

// 6. In saveProducao: notify ProducaoProfissionalModule
const target6 = `        // Salvar localmente
        this.producoes.unshift(newRecord);
        localStorage.setItem(this.storageKey, JSON.stringify(this.producoes));`;

const replacement6 = `        // Notificar o modulo de Producao Profissional CNS
        try {
            if (window.ProducaoProfissionalModule && typeof window.ProducaoProfissionalModule.recordProducaoProfissionais === 'function') {
                window.ProducaoProfissionalModule.recordProducaoProfissionais(newRecord, producaoData);
            }
        } catch (e) {
            console.warn('Falha ao sincronizar com ProducaoProfissionalModule:', e);
        }

        // Salvar localmente
        this.producoes.unshift(newRecord);
        localStorage.setItem(this.storageKey, JSON.stringify(this.producoes));`;

content = content.replace(target6, replacement6);

fs.writeFileSync(path.join(basePath, 'js/bpa-module.js'), content, 'utf8');
console.log('Successfully written clean bpa-module.js! Bytes:', content.length);
console.log('Ufffd count:', (content.match(/\uFFFD/g) || []).length);

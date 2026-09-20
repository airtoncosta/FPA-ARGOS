/**
 * ARGOS — Módulo Especialista de Auditoria de Vínculos e Movimentação Mensal do CNES
 * CnesDiffEngine: Compara competências e detecta:
 *  - Entradas (Novos vínculos / Admissões)
 *  - Saídas (Desligamentos / Exonerações)
 *  - Alterações de Carga Horária semanal (Ambulatorial, Hospitalar, Outros, Total)
 *  - Alertas de Conformidade da Portaria MS nº 134/2016 (>40h / >60h)
 */

(function(window) {
    'use strict';

    const CnesDiffEngine = {
        /**
         * Compara dois conjuntos de estabelecimentos ou listas de profissionais
         * @param {Array} dadosAnteriores - Estabelecimentos da competência anterior
         * @param {Array} dadosAtuais - Estabelecimentos da competência atual
         * @param {Object} options - { competenciaAnterior, competenciaAtual, municipio, ibge }
         * @returns {Object} Resultado detalhado do diff
         */
        compararCompetencias(dadosAnteriores = [], dadosAtuais = [], options = {}) {
            const compAnt = options.competenciaAnterior || 'ANTERIOR';
            const compAtu = options.competenciaAtual || 'ATUAL';

            // The published ST/PF worker supplies a stable identity for each
            // employment link. CNS + CBO alone can represent several links.
            const identity = (cnes, cns, cbo, p) => p.linkIdentity ||
                [cnes, cns, cbo, p.codigoVinculacao || '', p.codigoVinculo || '', p.codigoSubVinculo || ''].join('_');
            const observacaoOficial = p => {
                let fonte = String(p.portaria134Fonte || p.portaria134_fonte || '').trim().toUpperCase();
                let texto = String(p.portaria134 || '').trim();
                if ((!texto || texto === '-') && typeof window !== 'undefined' && window.DATASUS_PORTARIA134_BACABAL) {
                    const map = window.DATASUS_PORTARIA134_BACABAL;
                    const cnesStr = String(p.cnes || '').trim();
                    const cnsClean = String(p.cns || p.cnsMaster || '').replace(/\D/g, '');
                    const cboClean = String(p.cbo || '').split(' ')[0].replace(/\D/g, '');
                    const nomeClean = String(p.nome || '').toUpperCase().replace(/\s+/g, ' ').trim();
                    const found = (cnesStr && cnsClean && cboClean && map[`${cnesStr}_${cnsClean}_${cboClean}`])
                        || (cnesStr && cnsClean && map[`${cnesStr}_${cnsClean}`])
                        || (cnesStr && nomeClean && cboClean && map[`${cnesStr}_${nomeClean}_${cboClean}`])
                        || (cnesStr && nomeClean && map[`${cnesStr}_${nomeClean}`])
                        || (cnsClean && map[`cns_${cnsClean}`])
                        || null;
                    if (found && found.portaria134) {
                        texto = found.portaria134;
                        fonte = found.portaria134Fonte || 'CNES_OFICIAL';
                    }
                }
                const isOficial = (fonte === 'CNES_OFICIAL' || texto.includes('Artigo')) &&
                    texto.length > 0 && texto !== '-' && texto.toLowerCase() !== 'null' &&
                    !texto.toUpperCase().includes('SOBREPOSIÇÃO');
                return isOficial ? (texto.includes('Artigo') ? texto : 'Artigo 2º') : '';
            };
            const mapaAnterior = new Map();
            const profsPorCnsAnt = new Map(); // Para rastrear trocas de unidade

            (dadosAnteriores || []).forEach(estab => {
                const cnes = String(estab.cnes || estab.codigo_cnes || '').trim();
                const estabNome = String(estab.nomeFantasia || estab.razaoSocial || `UNIDADE ${cnes}`).trim();
                (estab.profissionais || []).forEach(p => {
                    const cns = String(p.cns || p.cnsMaster || '').trim();
                    const cbo = String(p.cbo || '').trim();
                    const key = identity(cnes, cns, cbo, p);
                    const item = {
                        ...p,
                        cnes,
                        estabNome,
                        cns,
                        cbo,
                        chTotal: Number(p.chTotal || (p.chAmb || 0) + (p.chHosp || 0) + (p.chOutros || 0) || 0)
                    };
                    mapaAnterior.set(key, item);

                    if (!profsPorCnsAnt.has(cns)) profsPorCnsAnt.set(cns, []);
                    profsPorCnsAnt.get(cns).push(item);
                });
            });

            // Indexar profissionais da competência atual
            const mapaAtual = new Map();
            const profsPorCnsAtu = new Map();

            (dadosAtuais || []).forEach(estab => {
                const cnes = String(estab.cnes || estab.codigo_cnes || '').trim();
                const estabNome = String(estab.nomeFantasia || estab.razaoSocial || `UNIDADE ${cnes}`).trim();
                (estab.profissionais || []).forEach(p => {
                    const cns = String(p.cns || p.cnsMaster || '').trim();
                    const cbo = String(p.cbo || '').trim();
                    const key = identity(cnes, cns, cbo, p);
                    const item = {
                        ...p,
                        cnes,
                        estabNome,
                        cns,
                        cbo,
                        chTotal: Number(p.chTotal || (p.chAmb || 0) + (p.chHosp || 0) + (p.chOutros || 0) || 0)
                    };
                    mapaAtual.set(key, item);

                    if (!profsPorCnsAtu.has(cns)) profsPorCnsAtu.set(cns, []);
                    profsPorCnsAtu.get(cns).push(item);
                });
            });

            const entradas = [];
            const saidas = [];
            const alteracoesCargaHoraria = [];
            const alertasPortaria134 = [];

            // 1. Identificar Entradas e Alterações
            mapaAtual.forEach((pAtual, key) => {
                if (!mapaAnterior.has(key)) {
                    // Novo vínculo detectado
                    const transferidoDe = profsPorCnsAnt.get(pAtual.cns);
                    entradas.push({
                        tipo: 'ENTRADA',
                        tipoBadge: 'badge-entrada',
                        descricaoTipo: 'Vínculo presente apenas no mês atual',
                        cnes: pAtual.cnes,
                        estabNome: pAtual.estabNome,
                        cns: pAtual.cns,
                        cbo: pAtual.cbo,
                        nome: pAtual.nome,
                        ocupacao: pAtual.ocupacao || `${pAtual.cbo} - PROFISSIONAL DE SAÚDE`,
                        chAmb: pAtual.chAmb || 0,
                        chHosp: pAtual.chHosp || 0,
                        chOutros: pAtual.chOutros || 0,
                        chAtual: pAtual.chTotal,
                        chAnterior: null,
                        diferencaCh: pAtual.chTotal,
                        vinculacao: pAtual.vinculacao || '',
                        observacao: transferidoDe ? `Constava em outra unidade no mês anterior (${transferidoDe[0].estabNome})` : 'Não constava na competência anterior',
                        competencia: compAtu
                    });
                } else {
                    // Já existia: verificar alteração de carga horária
                    const pAnt = mapaAnterior.get(key);
                    const difTotal = pAtual.chTotal - pAnt.chTotal;
                    const difAmb = (pAtual.chAmb || 0) - (pAnt.chAmb || 0);
                    const difHosp = (pAtual.chHosp || 0) - (pAnt.chHosp || 0);

                    if (difTotal !== 0 || difAmb !== 0 || difHosp !== 0) {
                        const portariaAlerta = observacaoOficial(pAtual);
                        const triagemCh = !portariaAlerta && pAtual.chTotal > 40
                            ? `Triagem CH (>40h): ${pAtual.chTotal}h; sem observação oficial CNES`
                            : '';
                        alteracoesCargaHoraria.push({
                            tipo: 'ALTERACAO_CH',
                            tipoBadge: difTotal > 0 ? 'badge-ch-aumento' : 'badge-ch-reducao',
                            descricaoTipo: difTotal > 0 ? `Aumento de Carga (+${difTotal}h)` : `Redução de Carga (${difTotal}h)`,
                            cnes: pAtual.cnes,
                            estabNome: pAtual.estabNome,
                            cns: pAtual.cns,
                            cbo: pAtual.cbo,
                            nome: pAtual.nome,
                            ocupacao: pAtual.ocupacao || `${pAtual.cbo} - PROFISSIONAL DE SAÚDE`,
                            chAnterior: pAnt.chTotal,
                            chAtual: pAtual.chTotal,
                            diferencaCh: difTotal,
                            detalheHoras: `Amb: ${pAnt.chAmb || 0}h ➔ ${pAtual.chAmb || 0}h | Hosp: ${pAnt.chHosp || 0}h ➔ ${pAtual.chHosp || 0}h`,
                            portaria134: portariaAlerta,
                            triagem: triagemCh,
                            competencia: compAtu
                        });
                    }
                }

                // CH/counting from ST/PF is only a local triage signal. It is
                // never promoted to an official Portaria 134 observation.
                const oficial = observacaoOficial(pAtual);
                if (oficial && !alertasPortaria134.some(a => a.cns === pAtual.cns && a.cnes === pAtual.cnes && a.cbo === pAtual.cbo)) {
                    const vinculosAtuaisCns = profsPorCnsAtu.get(pAtual.cns) || [];
                    const pAnt = mapaAnterior.get(key);
                    alertasPortaria134.push({
                        tipo: 'PORTARIA134',
                        tipoBadge: 'badge-p134',
                        descricaoTipo: 'Portaria 134 / Artigo 2º (Oficial CNES)',
                        cnes: pAtual.cnes,
                        estabNome: pAtual.estabNome,
                        cns: pAtual.cns,
                        cbo: pAtual.cbo,
                        nome: pAtual.nome,
                        ocupacao: pAtual.ocupacao || `${pAtual.cbo} - PROFISSIONAL DE SAÚDE`,
                        chAmb: pAtual.chAmb || 0,
                        chHosp: pAtual.chHosp || 0,
                        chOutros: pAtual.chOutros || 0,
                        chAtual: pAtual.chTotal,
                        chAnterior: pAnt ? pAnt.chTotal : null,
                        diferencaCh: pAnt ? (pAtual.chTotal - pAnt.chTotal) : 0,
                        totalHoras: vinculosAtuaisCns.reduce((acc, v) => acc + (v.chTotal || 0), 0),
                        vinculos: vinculosAtuaisCns.map(v => `${v.estabNome} (${v.chTotal}h)`).join(' + '),
                        portaria134: oficial,
                        fonte: 'CNES_OFICIAL',
                        competencia: compAtu,
                        alerta: oficial,
                        grauRisco: 'OBSERVAÇÃO OFICIAL CNES'
                    });
                }
            });

            // 2. Identificar Saídas (estava na anterior mas não na atual)
            mapaAnterior.forEach((pAnt, key) => {
                if (!mapaAtual.has(key)) {
                    saidas.push({
                        tipo: 'SAIDA',
                        tipoBadge: 'badge-saida',
                        descricaoTipo: 'Vínculo ausente no mês atual',
                        cnes: pAnt.cnes,
                        estabNome: pAnt.estabNome,
                        cns: pAnt.cns,
                        cbo: pAnt.cbo,
                        nome: pAnt.nome,
                        ocupacao: pAnt.ocupacao || `${pAnt.cbo} - PROFISSIONAL DE SAÚDE`,
                        chAnterior: pAnt.chTotal,
                        chAtual: 0,
                        diferencaCh: -pAnt.chTotal,
                        vinculacao: pAnt.vinculacao || '',
                        observacao: 'Não consta no CNES da competência atual',
                        competencia: compAtu
                    });
                }
            });

            // Estatísticas consolidadas
            const saldoVinculos = entradas.length - saidas.length;
            const saldoHorasSemanais = 
                entradas.reduce((s, e) => s + e.chAtual, 0) -
                saidas.reduce((s, e) => s + e.chAnterior, 0) +
                alteracoesCargaHoraria.reduce((s, a) => s + a.diferencaCh, 0);

            return {
                competenciaAnterior: compAnt,
                competenciaAtual: compAtu,
                totalAnterior: mapaAnterior.size,
                totalAtual: mapaAtual.size,
                resumo: {
                    entradas: entradas.length,
                    saidas: saidas.length,
                    alteracoesCargaHoraria: alteracoesCargaHoraria.length,
                    saldoVinculos,
                    saldoHorasSemanais,
                    alertasPortaria134: alertasPortaria134.length
                },
                detalhes: {
                    entradas,
                    saidas,
                    alteracoesCargaHoraria,
                    alertasPortaria134,
                    todas: [...entradas, ...saidas, ...alteracoesCargaHoraria].sort((a, b) => a.nome.localeCompare(b.nome))
                }
            };
        },

        /**
         * Gera uma demonstração de competência anterior para municípios que têm apenas a base atual,
         * permitindo auditar e demonstrar imediatamente a ferramenta de movimentações.
         */
        simularCompetenciaAnterior(estabelecimentosAtuais = []) {
            if (!estabelecimentosAtuais || estabelecimentosAtuais.length === 0) return [];

            return estabelecimentosAtuais.map((estab, eIdx) => {
                const profs = (estab.profissionais || []).map((p, pIdx) => {
                    // Simular pequenas variações realistas em 8% dos profissionais para demonstração auditada
                    const hash = (eIdx * 17 + pIdx * 31) % 100;
                    if (hash === 5) {
                        // Profissional que tinha menos horas
                        return { ...p, chTotal: Math.max(20, (p.chTotal || 40) - 20), chAmb: Math.max(20, (p.chAmb || 40) - 20) };
                    }
                    if (hash === 12) {
                        // Profissional que tinha mais horas
                        return { ...p, chTotal: (p.chTotal || 40) + 20, chHosp: (p.chHosp || 0) + 20 };
                    }
                    if (hash === 95) {
                        // Não existia na anterior (será uma entrada)
                        return null;
                    }
                    return { ...p };
                }).filter(Boolean);

                // Adicionar 1 profissional simulado que saiu (saída) a cada 10 unidades
                if (eIdx % 10 === 0 && profs.length > 0) {
                    profs.push({
                        nome: `DR(A). PROFISSIONAL DESLIGADO EM 07/2026`,
                        cns: `70210120000${eIdx + 1}999`,
                        cbo: '225125',
                        ocupacao: '225125 - MEDICO CLINICO',
                        chAmb: 20,
                        chHosp: 0,
                        chOutros: 0,
                        chTotal: 20,
                        situacao: 'Desligado',
                        vinculacao: 'CONTRATADO TEMPORÁRIO'
                    });
                }

                return {
                    ...estab,
                    profissionais: profs
                };
            });
        }
    };

    window.CnesDiffEngine = CnesDiffEngine;
})(window);

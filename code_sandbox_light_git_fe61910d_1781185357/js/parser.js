function cleanUnitName(str) {
    if (!str) return '';
    return str.replace(/&l[0-9a-zA-Z.]+/gi, '')
              .replace(/\(s[0-9a-zA-Z.]+/gi, '')
              .replace(/\([0-9]+[a-zA-Z]/gi, '')
              .replace(/[^A-Za-z0-9ÁÉÍÓÚÂÊÔÃÕÇáéíóúâêôãõç\s\-\/\.,\(\)]/g, '')
              .replace(/\s{2,}/g, ' ')
              .replace(/^[-\s]+|[-\s]+$/g, '')
              .trim();
}

const Parser = {

    /**
     * Processa conteúdo TXT/CSV da Síntese SIA/SUS
     * Detecta o formato automaticamente e extrai os dados
     */
    parseTXT(content) {
        const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        
        // Tentar CSV primeiro se as primeiras linhas contiverem ponto-e-vírgula (separador comum no Brasil)
        if (this.isCSVFormat(lines)) {
            try {
                const csvResult = this.parseCSV(content);
                if (csvResult && csvResult.unidades && csvResult.unidades.length > 0) {
                    return csvResult;
                }
            } catch(e) {
                // Falhou no CSV, tenta fixed width abaixo
            }
        }
        
        return this.parseFixedWidth(lines);
    },

    isCSVFormat(lines) {
        // Checar apenas as primeiras linhas para ver se é delimitado por ponto e vírgula
        // Não usar vírgula solta pois confunde com as casas decimais brasileiras!
        const sample = lines.slice(0, 5).join('');
        return sample.includes(';');
    },

    /**
     * Parse CSV (separado por ; ou ,)
     * Formato típico do DATASUS
     */
    parseCSV(content) {
        const sep = content.includes(';') ? ';' : ',';
        const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        
        if (lines.length < 2) return null;

        const headers = lines[0].split(sep).map(h => h.replace(/['"]/g, '').trim().toLowerCase());
        const rows = [];
        
        for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(sep).map(c => c.replace(/['"]/g, '').trim());
            if (cols.length < 3) continue;
            
            const row = {};
            headers.forEach((h, idx) => {
                row[h] = cols[idx] || '';
            });
            rows.push(row);
        }

        return this.normalizeRows(rows, headers);
    },

    /**
     * Parse largura fixa (formato legado DATASUS / Relatório de Síntese)
     */
    parseFixedWidth(lines) {
        const data = {
            municipio: '',
            uf: '',
            sistema: 'SIA/SUS',
            competencia: '',
            ano: '',
            unidades: [],
            faturamentoMensal: [],
            resumo: {
                qtdApresentada: 0, qtdAprovada: 0, qtdGlosada: 0,
                valApresentado: 0, valAprovado: 0, valGlosado: 0,
                pctAprovacaoQtd: 0, pctGlosaQtd: 0, totalUnidades: 0
            },
            procedimentos: [],
            cbos: [],
            linhas: []
        };

        let currentUnidade = null;
        let procMap = {};
        let cboMap = {};
        let mesMap = {};

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // Detectar Municipio e UF
            if (line.includes('SISTEMA DE INFORMACOES AMBULATORIAIS')) {
                const parts = line.split('SISTEMA DE INFORMACOES AMBULATORIAIS');
                if (parts.length > 0) {
                    const munUF = parts[0].trim();
                    if (munUF.length > 2) {
                        data.uf = munUF.slice(-2);
                        data.municipio = munUF.slice(0, -2).trim();
                    }
                }
            }

            // Detectar Competência
            // Ex: 03/06/2026             SINTESE DA PRODUCAO - JAN/2026                 12:23:42
            if (line.includes('SINTESE DA PRODUCAO')) {
                const match = line.match(/-\s*([A-Z]{3}\/\d{4})/i);
                if (match && !data.competencia) {
                    data.competencia = match[1];
                    data.ano = match[1].split('/')[1];
                }
            }

            if (line.includes('UNIDADE  :')) {
                const parts = line.split('-');
                if (parts.length >= 2) {
                    const cnesStr = line.substring(line.indexOf(':')+1, line.indexOf('-')).trim();
                    const nomeStr = cleanUnitName(parts.slice(1).join('-').trim());

                    if (!currentUnidade || currentUnidade.cnes !== cnesStr) {
                        currentUnidade = {
                            id: 'u_' + cnesStr,
                            cnes: cnesStr,
                            nome: nomeStr,
                            tipo: 'Unidade',
                            qtdApresentada: 0, qtdAprovada: 0, qtdGlosada: 0,
                            valApresentado: 0, valAprovado: 0, valGlosado: 0,
                            pctAprovacaoQtd: 0, pctAprovacaoVal: 0, pctDoTotal: 0, rank: 0
                        };
                        data.unidades.push(currentUnidade);
                    }
                }
            }

            // Detectar linha de procedimento
            // Ex: 01/2026 001 01 010103002-9 251605       1       0,00       1       0,00 APROVADO TOTALMENTE
            // Ex: 01/2026 080 01 021106010-0 225125       1       3,37       0       0,00 PROCED.JA INFORMADO EM BPA-C
            if (line.match(/^\d{2}\/\d{4}\s+\d{3}/)) {
                // Como algumas colunas (ex: CBO) podem vir vazias, usamos match para pegar os últimos 4 números antes do texto
                // A regex procura 4 grupos de números (qtd apres, val apres, qtd aprov, val aprov) seguidos por qualquer texto que comece com letra (SITUAÇÃO/GLOSA)
                const numMatch = line.match(/([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+([A-Za-z].*)$/);
                
                if (numMatch && currentUnidade) {
                    const textBeforeNumbers = line.substring(0, numMatch.index).trim();
                    const tokens = textBeforeNumbers.split(/\s+/);
                    const cmp = tokens[0] || 'Desconhecida';
                    let proc = '';
                    let cboCode = '';
                    if (tokens.length >= 5) {
                        proc = tokens[3];
                        cboCode = tokens[4];
                    } else if (tokens.length === 4) {
                        proc = tokens[3];
                    } else if (tokens.length === 3) {
                        proc = tokens[2];
                    } else {
                        proc = tokens[1] || '0000000000';
                    }
                    
                    const qtPrz = parseFloat(numMatch[1].replace(/\./g, '').replace(',', '.'));
                    const vlPrz = parseFloat(numMatch[2].replace(/\./g, '').replace(',', '.'));
                    const qtApvd = parseFloat(numMatch[3].replace(/\./g, '').replace(',', '.'));
                    const vlApvd = parseFloat(numMatch[4].replace(/\./g, '').replace(',', '.'));

                    const qtGlos = qtPrz - qtApvd;
                    const vlGlos = vlPrz - vlApvd;

                    // Acumular na Unidade
                    currentUnidade.qtdApresentada += qtPrz;
                    currentUnidade.qtdAprovada += qtApvd;
                    currentUnidade.qtdGlosada += qtGlos;
                    currentUnidade.valApresentado += vlPrz;
                    currentUnidade.valAprovado += vlApvd;
                    currentUnidade.valGlosado += vlGlos;

                    // Acumular no Resumo Geral
                    data.resumo.qtdApresentada += qtPrz;
                    data.resumo.qtdAprovada += qtApvd;
                    data.resumo.qtdGlosada += qtGlos;
                    data.resumo.valApresentado += vlPrz;
                    data.resumo.valAprovado += vlApvd;
                    data.resumo.valGlosado += vlGlos;

                    // Salvar Linha Fato
                    data.linhas.push({
                        uId: currentUnidade.id,
                        uCnes: currentUnidade.cnes,
                        uNome: currentUnidade.nome,
                        proc: proc,
                        cbo: cboCode,
                        mes: cmp.split('/')[0],
                        cmp: cmp,
                        qtdApresentada: qtPrz,
                        qtdAprovada: qtApvd,
                        qtdGlosada: qtGlos,
                        valApresentado: vlPrz,
                        valAprovado: vlApvd,
                        valGlosado: vlGlos
                    });

                    // Acumular no Mês
                    if (!mesMap[cmp]) {
                        mesMap[cmp] = {
                            mes: cmp.split('/')[0], nomeMes: cmp, competencia: cmp,
                            qtdApresentada: 0, qtdAprovada: 0, qtdGlosada: 0,
                            valApresentado: 0, valAprovado: 0, valGlosado: 0, pctAprovado: 0,
                            valoresPorUnidade: {}
                        };
                    }
                    mesMap[cmp].qtdApresentada += qtPrz;
                    mesMap[cmp].qtdAprovada += qtApvd;
                    mesMap[cmp].qtdGlosada += qtGlos;
                    mesMap[cmp].valApresentado += vlPrz;
                    mesMap[cmp].valAprovado += vlApvd;
                    mesMap[cmp].valGlosado += vlGlos;

                    if (!mesMap[cmp].valoresPorUnidade[currentUnidade.id]) {
                        mesMap[cmp].valoresPorUnidade[currentUnidade.id] = { valApresentado: 0, valAprovado: 0, valGlosado: 0, qtdApresentada: 0, qtdAprovada: 0, qtdGlosada: 0 };
                    }
                    mesMap[cmp].valoresPorUnidade[currentUnidade.id].qtdApresentada += qtPrz;
                    mesMap[cmp].valoresPorUnidade[currentUnidade.id].qtdAprovada += qtApvd;
                    mesMap[cmp].valoresPorUnidade[currentUnidade.id].qtdGlosada += qtGlos;
                    mesMap[cmp].valoresPorUnidade[currentUnidade.id].valApresentado += vlPrz;
                    mesMap[cmp].valoresPorUnidade[currentUnidade.id].valAprovado += vlApvd;
                    mesMap[cmp].valoresPorUnidade[currentUnidade.id].valGlosado += vlGlos;

                    // Acumular no Procedimento
                    if (!procMap[proc]) {
                        const cleanCode = proc.replace(/\D/g, '');
                        const desc = (window.SIGTAP && window.SIGTAP[cleanCode]) || ('Procedimento ' + proc);
                        procMap[proc] = {
                            codigo: proc,
                            descricao: desc,
                            qtdAprovada: 0, valAprovado: 0, valUnitario: 0,
                            cbos: {},
                            valoresPorUnidade: {}
                        };
                    }
                    procMap[proc].qtdAprovada += qtApvd;
                    procMap[proc].valAprovado += vlApvd;
                    if (vlApvd > 0 && qtApvd > 0) {
                        procMap[proc].valUnitario = vlApvd / qtApvd;
                    }
                    if (!procMap[proc].valoresPorUnidade[currentUnidade.id]) {
                        procMap[proc].valoresPorUnidade[currentUnidade.id] = { valAprovado: 0, qtdAprovada: 0 };
                    }
                    procMap[proc].valoresPorUnidade[currentUnidade.id].valAprovado += vlApvd;
                    procMap[proc].valoresPorUnidade[currentUnidade.id].qtdAprovada += qtApvd;

                    if (cboCode && cboCode.match(/^[a-zA-Z0-9]{6}$/)) {
                        if (!procMap[proc].cbos[cboCode]) {
                            const descCbo = (window.CBO_DICTIONARY && window.CBO_DICTIONARY[cboCode]) || ('Profissão CBO ' + cboCode);
                            procMap[proc].cbos[cboCode] = {
                                codigo: cboCode,
                                descricao: descCbo,
                                qtdAprovada: 0,
                                valAprovado: 0
                            };
                        }
                        procMap[proc].cbos[cboCode].qtdAprovada += qtApvd;
                        procMap[proc].cbos[cboCode].valAprovado += vlApvd;
                    }

                    // Acumular no CBO
                    if (cboCode && cboCode.match(/^[a-zA-Z0-9]{6}$/)) {
                        if (!cboMap[cboCode]) {
                            const descCbo = (window.CBO_DICTIONARY && window.CBO_DICTIONARY[cboCode]) || ('Profissão CBO ' + cboCode);
                            cboMap[cboCode] = {
                                codigo: cboCode,
                                descricao: descCbo,
                                qtdAprovada: 0, valAprovado: 0,
                                procedimentos: {},
                                valoresPorUnidade: {}
                            };
                        }
                        cboMap[cboCode].qtdAprovada += qtApvd;
                        cboMap[cboCode].valAprovado += vlApvd;
                        
                        if (!cboMap[cboCode].valoresPorUnidade[currentUnidade.id]) {
                            cboMap[cboCode].valoresPorUnidade[currentUnidade.id] = { valAprovado: 0, qtdAprovada: 0 };
                        }
                        cboMap[cboCode].valoresPorUnidade[currentUnidade.id].valAprovado += vlApvd;
                        cboMap[cboCode].valoresPorUnidade[currentUnidade.id].qtdAprovada += qtApvd;

                        if (!cboMap[cboCode].procedimentos[proc]) {
                            const cleanCode = proc.replace(/\D/g, '');
                            const descProc = (window.SIGTAP && window.SIGTAP[cleanCode]) || ('Procedimento ' + proc);
                            cboMap[cboCode].procedimentos[proc] = {
                                codigo: proc,
                                descricao: descProc,
                                qtdAprovada: 0,
                                valAprovado: 0
                            };
                        }
                        cboMap[cboCode].procedimentos[proc].qtdAprovada += qtApvd;
                        cboMap[cboCode].procedimentos[proc].valAprovado += vlApvd;
                    }
                }
            }
        }

        // Finalizar cálculos
        data.unidades.forEach(u => {
            u.pctAprovacaoQtd = u.qtdApresentada > 0 ? (u.qtdAprovada / u.qtdApresentada * 100) : 0;
            u.pctAprovacaoVal = u.valApresentado > 0 ? (u.valAprovado / u.valApresentado * 100) : (u.qtdAprovada > 0 ? 100 : 0);
            if (u.valAprovado > 0 && u.valApresentado === 0) u.pctAprovacaoVal = 100;
        });

        const totalAprov = data.resumo.valAprovado;
        data.unidades.sort((a,b) => b.valAprovado - a.valAprovado);
        data.unidades.forEach((u, i) => {
            u.rank = i + 1;
            u.pctDoTotal = totalAprov > 0 ? (u.valAprovado / totalAprov * 100) : 0;
        });

        data.resumo.totalUnidades = data.unidades.length;
        data.resumo.pctAprovacaoQtd = data.resumo.qtdApresentada > 0 ? (data.resumo.qtdAprovada / data.resumo.qtdApresentada * 100) : 0;
        data.resumo.pctGlosaQtd = data.resumo.qtdApresentada > 0 ? (data.resumo.qtdGlosada / data.resumo.qtdApresentada * 100) : 0;

        data.faturamentoMensal = Object.values(mesMap);
        data.faturamentoMensal.forEach(m => {
            m.pctAprovado = m.valApresentado > 0 ? (m.valAprovado / m.valApresentado * 100) : (m.valAprovado > 0 ? 100 : 0);
        });

        data.procedimentos = Object.values(procMap).map(p => {
            p.cbos = Object.values(p.cbos || {}).sort((a,b) => b.valAprovado - a.valAprovado);
            return p;
        }).sort((a,b) => b.valAprovado - a.valAprovado);
        data.cbos = Object.values(cboMap).map(c => {
            c.procedimentos = Object.values(c.procedimentos || {}).sort((a,b) => b.valAprovado - a.valAprovado);
            return c;
        }).sort((a,b) => b.valAprovado - a.valAprovado);

        return data.unidades.length > 0 ? data : null;
    },

    /**
     * Normalizar linhas para o formato interno
     */
    normalizeRows(rows, headers) {
        const unidades = [];
        const meses = [];
        
        // Mapear nomes de colunas possíveis
        const colMap = {
            nome: ['unidade', 'unidade de saúde', 'nome', 'estabelecimento'],
            qtdApres: ['qtd. apresentada', 'qtd apresentada', 'apresentada', 'qt_apresentada'],
            qtdAprov: ['qtd. aprovada', 'qtd aprovada', 'aprovada', 'qt_aprovada'],
            qtdGlos:  ['qtd. glosada', 'qtd glosada', 'glosada', 'qt_glosada'],
            valApres: ['valor apresentado', 'vl_apresentado', 'valor apresentado (r$)'],
            valAprov: ['valor aprovado', 'vl_aprovado', 'valor aprovado (r$)'],
            valGlos:  ['valor glosado', 'vl_glosado', 'valor glosado (r$)'],
            pctAprov: ['% aprovação', '% aprovado', 'pct_aprovacao', '% aprovação (r$)'],
            cnes:     ['cnes', 'co_cnes'],
            mes:      ['mês', 'mes', 'competência', 'competencia']
        };

        const findCol = (row, aliases) => {
            for (const alias of aliases) {
                const key = Object.keys(row).find(k => k.toLowerCase().includes(alias));
                if (key) return row[key];
            }
            return null;
        };

        const parseNum = (v) => {
            if (!v) return 0;
            return parseFloat(String(v).replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '')) || 0;
        };

        for (const row of rows) {
            const nome = findCol(row, colMap.nome);
            const mes  = findCol(row, colMap.mes);
            
            if (!nome && !mes) continue;

            if (mes) {
                // Linha de mês
                meses.push({
                    nomeMes: mes,
                    competencia: mes,
                    qtdApresentada: parseNum(findCol(row, colMap.qtdApres)),
                    qtdAprovada:    parseNum(findCol(row, colMap.qtdAprov)),
                    qtdGlosada:     parseNum(findCol(row, colMap.qtdGlos)),
                    valApresentado: parseNum(findCol(row, colMap.valApres)),
                    valAprovado:    parseNum(findCol(row, colMap.valAprov)),
                    valGlosado:     parseNum(findCol(row, colMap.valGlos)),
                    pctAprovado:    parseNum(findCol(row, colMap.pctAprov))
                });
            } else if (nome) {
                // Linha de unidade
                const qtdApres = parseNum(findCol(row, colMap.qtdApres));
                const qtdAprov = parseNum(findCol(row, colMap.qtdAprov));
                const valAprov = parseNum(findCol(row, colMap.valAprov));
                const pctVal   = parseNum(findCol(row, colMap.pctAprov));
                
                unidades.push({
                    id: cleanUnitName(nome).toLowerCase().replace(/\s+/g, '_'),
                    cnes: findCol(row, colMap.cnes) || '',
                    nome: cleanUnitName(nome).toUpperCase(),
                    qtdApresentada: qtdApres,
                    qtdAprovada:    qtdAprov,
                    qtdGlosada:     qtdApres - qtdAprov,
                    valApresentado: parseNum(findCol(row, colMap.valApres)),
                    valAprovado:    valAprov,
                    valGlosado:     parseNum(findCol(row, colMap.valGlos)),
                    pctAprovacaoQtd: qtdApres > 0 ? (qtdAprov / qtdApres * 100) : 0,
                    pctAprovacaoVal: pctVal || (qtdApres > 0 ? (qtdAprov / qtdApres * 100) : 0),
                    rank: 0,
                    pctDoTotal: 0
                });
            }
        }

        // Calcular ranks e % do total
        const totalAprov = unidades.reduce((s, u) => s + u.valAprovado, 0);
        unidades.sort((a, b) => b.valAprovado - a.valAprovado);
        unidades.forEach((u, i) => {
            u.rank = i + 1;
            u.pctDoTotal = totalAprov > 0 ? (u.valAprovado / totalAprov * 100) : 0;
        });

        // Calcular resumo
        const resumo = {
            qtdApresentada: unidades.reduce((s, u) => s + u.qtdApresentada, 0),
            qtdAprovada:    unidades.reduce((s, u) => s + u.qtdAprovada, 0),
            qtdGlosada:     unidades.reduce((s, u) => s + u.qtdGlosada, 0),
            valApresentado: unidades.reduce((s, u) => s + u.valApresentado, 0),
            valAprovado:    unidades.reduce((s, u) => s + u.valAprovado, 0),
            valGlosado:     unidades.reduce((s, u) => s + u.valGlosado, 0),
            totalUnidades:  unidades.length
        };
        resumo.pctAprovacaoQtd = resumo.qtdApresentada > 0 ? (resumo.qtdAprovada / resumo.qtdApresentada * 100) : 0;
        resumo.pctGlosaQtd     = resumo.qtdApresentada > 0 ? (resumo.qtdGlosada  / resumo.qtdApresentada * 100) : 0;

        return {
            municipio: 'Importado',
            competencia: 'Arquivo importado',
            resumo,
            unidades,
            faturamentoMensal: meses,
            procedimentos: []
        };
    },

    extractNumbers(line) {
        const matches = line.match(/[\d.,]+/g) || [];
        return matches.map(m => parseFloat(m.replace(/\./g, '').replace(',', '.'))).filter(n => !isNaN(n));
    }
};

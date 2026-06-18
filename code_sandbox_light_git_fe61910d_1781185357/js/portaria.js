/**
 * ARGOS FPA — portaria.js
 * Módulo para gerenciamento, importação e consulta da Portaria de Teto MAC
 */

// Tetos estáticos padrões para municípios do Maranhão (Portaria GM/MS 10.146/2026)
const PORTARIA_DEFAULTS = {
    "MA_BACABAL": {
        uf: "MA",
        ibge: "210120",
        name: "BACABAL",
        gestao: "Municipal",
        tetoMacSemSamu: 20902405.15,
        samu: 2856945.00,
        total: 23759350.15
    },
    "MA_SÃO LUÍS": {
        uf: "MA",
        ibge: "211130",
        name: "SÃO LUÍS",
        gestao: "Municipal",
        tetoMacSemSamu: 476325747.85,
        samu: 8960839.68,
        total: 485286587.53
    },
    "MA_IMPERATRIZ": {
        uf: "MA",
        ibge: "210530",
        name: "IMPERATRIZ",
        gestao: "Municipal",
        tetoMacSemSamu: 73438693.81,
        samu: 5383833.00,
        total: 78822526.81
    },
    "MA_CAXIAS": {
        uf: "MA",
        ibge: "210300",
        name: "CAXIAS",
        gestao: "Municipal",
        tetoMacSemSamu: 57273399.90,
        samu: 4030111.80,
        total: 61303511.70
    },
    "MA_CODÓ": {
        uf: "MA",
        ibge: "210330",
        name: "CODÓ",
        gestao: "Municipal",
        tetoMacSemSamu: 15444290.00,
        samu: 2448810.00,
        total: 17893100.00
    },
    "MA_AÇAILÂNDIA": {
        uf: "MA",
        ibge: "210005",
        name: "AÇAILÂNDIA",
        gestao: "Municipal",
        tetoMacSemSamu: 15263345.37,
        samu: 1866956.52,
        total: 17130301.89
    },
    "MA_BACABEIRA": {
        uf: "MA",
        ibge: "210125",
        name: "BACABEIRA",
        gestao: "Municipal",
        tetoMacSemSamu: 913214.77,
        samu: 444517.32,
        total: 1357732.09
    },
    "MA_BALSAS": {
        uf: "MA",
        ibge: "210140",
        name: "BALSAS",
        gestao: "Municipal",
        tetoMacSemSamu: 13536525.03,
        samu: 1313130.00,
        total: 14849655.03
    },
    "MA_BARRA DO CORDA": {
        uf: "MA",
        ibge: "210160",
        name: "BARRA DO CORDA",
        gestao: "Municipal",
        tetoMacSemSamu: 10192276.58,
        samu: 1455090.00,
        total: 11647366.58
    },
    "MA_BARREIRINHAS": {
        uf: "MA",
        ibge: "210170",
        name: "BARREIRINHAS",
        gestao: "Municipal",
        tetoMacSemSamu: 2149335.94,
        samu: 0.00,
        total: 2149335.94
    },
    "MA_SÃO LUÍS GONZAGA DO MARANHÃO": {
        uf: "MA",
        ibge: "211140",
        name: "SÃO LUÍS GONZAGA DO MARANHÃO",
        gestao: "Municipal",
        tetoMacSemSamu: 1246298.74,
        samu: 0.00,
        total: 1246298.74
    },
    "MA_VIANA": {
        uf: "MA",
        ibge: "211280",
        name: "VIANA",
        gestao: "Municipal",
        tetoMacSemSamu: 4272667.41,
        samu: 0.00,
        total: 4272667.41
    },
    "MA_ZÉ DOCA": {
        uf: "MA",
        ibge: "211400",
        name: "ZÉ DOCA",
        gestao: "Municipal",
        tetoMacSemSamu: 4417707.04,
        samu: 0.00,
        total: 4417707.04
    },
    "MA_ROSÁRIO": {
        uf: "MA",
        ibge: "210960",
        name: "ROSÁRIO",
        gestao: "Municipal",
        tetoMacSemSamu: 2738497.86,
        samu: 0.00,
        total: 2738497.86
    }
};

const PortariaModule = {
    /**
     * Remove acentos de uma string para comparação normalizada
     */
    _normalizeStr(str) {
        if (!str) return '';
        return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
    },

    /**
     * Busca os limites da portaria para o município ativo e guarda no estado global
     */
    async loadPortariaForMunicipio(municipio, uf) {
        if (!municipio || !uf) {
            APP_STATE.portariaData = null;
            return null;
        }

        const key = `${uf.toUpperCase()}_${municipio.toUpperCase()}`;

        try {
            // 1. Tentar IndexedDB (que pode ter sido populado via upload de PDF ou sync da nuvem)
            const dbData = await AppDB.getItem('PORTARIA_DB') || {};
            let match = dbData[key];

            // 2. Fallback para dados estáticos padrões (busca exata)
            if (!match) {
                match = PORTARIA_DEFAULTS[key];
            }

            // 3. Fallback com normalização de acentos (ex: ROSARIO -> ROSÁRIO)
            if (!match) {
                const normalizedKey = this._normalizeStr(`${uf}_${municipio}`);
                // Buscar no IndexedDB com normalização
                for (const [k, v] of Object.entries(dbData)) {
                    if (this._normalizeStr(k) === normalizedKey) {
                        match = v;
                        break;
                    }
                }
                // Buscar nos defaults com normalização
                if (!match) {
                    for (const [k, v] of Object.entries(PORTARIA_DEFAULTS)) {
                        if (this._normalizeStr(k) === normalizedKey) {
                            match = v;
                            break;
                        }
                    }
                }
            }

            APP_STATE.portariaData = match || null;
            return match || null;
        } catch (e) {
            console.error("Erro ao carregar limite do teto MAC:", e);
            APP_STATE.portariaData = PORTARIA_DEFAULTS[key] || null;
            return APP_STATE.portariaData;
        }
    },

    /**
     * Auxiliar de parse numérico
     */
    _parseNum(str) {
        if (!str) return 0;
        return parseFloat(str.replace(/\./g, '').replace(',', '.')) || 0;
    },

    /**
     * Processa o arquivo PDF de Portaria de forma incremental
     */
    async parsePDF(file, onProgress = () => {}) {
        const arrayBuffer = await file.arrayBuffer();
        
        // Inicializa o leitor de PDF (pdf.js)
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const totalPages = pdf.numPages;
        const municipalities = {};

        for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
            onProgress(`Processando página ${pageNum} de ${totalPages}...`);
            const page = await pdf.getPage(pageNum);
            const textContent = await page.getTextContent();
            
            // Reconstrução de linhas por posicionamento Y
            const items = textContent.items.map(item => ({
                text: item.str,
                x: item.transform[4],
                y: item.transform[5]
            }));

            // Ordena os itens: Y de cima para baixo (descendente), X da esquerda para a direita (ascendente)
            items.sort((a, b) => {
                if (Math.abs(a.y - b.y) < 3) {
                    return a.x - b.x;
                }
                return b.y - a.y;
            });

            // Agrupa itens em linhas físicas
            const lineGroups = [];
            items.forEach(item => {
                if (lineGroups.length === 0) {
                    lineGroups.push([item]);
                } else {
                    const lastGroup = lineGroups[lineGroups.length - 1];
                    const lastItem = lastGroup[0];
                    if (Math.abs(item.y - lastItem.y) < 3) {
                        lastGroup.push(item);
                    } else {
                        lineGroups.push([item]);
                    }
                }
            });

            // Une as strings
            const lineStrings = lineGroups.map(group => {
                return group.sort((a, b) => a.x - b.x).map(i => i.text.trim()).join(' ').trim();
            }).filter(l => l.length > 0);

            // Variáveis de controle para linhas quebradas em múltiplas linhas físicas
            let pendingUF = null;
            let pendingIBGE = null;
            let pendingName = null;

            lineStrings.forEach(line => {
                // Pular cabeçalhos e totais
                if (line.includes('Total') || line.includes('ANEXO') || line.includes('TETO MAC') || line.includes('DOU - Imprensa')) return;

                // Caso 1: Linha completa do município
                // Ex: "AC 120001 ACRELÂNDIA Municipal 464.912,91 0,00 464.912,91"
                const fullMatch = line.match(/^([A-Z]{2})\s+(\d{6})\s+(.+?)\s+(Estadual|Municipal)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)$/i);
                if (fullMatch) {
                    const uf = fullMatch[1].toUpperCase();
                    const ibge = fullMatch[2];
                    const name = fullMatch[3].trim().toUpperCase();
                    const gestao = fullMatch[4];
                    const teto = this._parseNum(fullMatch[5]);
                    const samu = this._parseNum(fullMatch[6]);
                    const total = this._parseNum(fullMatch[7]);

                    municipalities[`${uf}_${name}`] = { uf, ibge, name, gestao, tetoMacSemSamu: teto, samu, total };
                    pendingUF = null; pendingIBGE = null; pendingName = null;
                    return;
                }

                // Caso 2: Linha quebrada - Primeira parte (UF IBGE NOME_PARCIAL)
                // Ex: "AC 120035 MARECHAL"
                const startMatch = line.match(/^([A-Z]{2})\s+(\d{6})\s+(.+)$/i);
                if (startMatch) {
                    pendingUF = startMatch[1].toUpperCase();
                    pendingIBGE = startMatch[2];
                    pendingName = startMatch[3].trim().toUpperCase();
                    return;
                }

                // Caso 3: Linha quebrada - Segunda parte (NOME_PARCIAL_RESTO GESTÃO NÚMEROS)
                // Ex: "THAUMATURGO Municipal 165.427,68 0,00 165.427,68"
                const endMatch = line.match(/^(.+?)\s+(Estadual|Municipal)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)$/i);
                if (endMatch && pendingUF && pendingIBGE) {
                    const namePart = endMatch[1].trim().toUpperCase();
                    const fullName = `${pendingName} ${namePart}`;
                    const gestao = endMatch[2];
                    const teto = this._parseNum(endMatch[3]);
                    const samu = this._parseNum(endMatch[4]);
                    const total = this._parseNum(endMatch[5]);

                    municipalities[`${pendingUF}_${fullName}`] = {
                        uf: pendingUF,
                        ibge: pendingIBGE,
                        name: fullName,
                        gestao,
                        tetoMacSemSamu: teto,
                        samu,
                        total
                    };
                    pendingUF = null; pendingIBGE = null; pendingName = null;
                }
            });
        }

        return municipalities;
    }
};

window.PortariaModule = PortariaModule;

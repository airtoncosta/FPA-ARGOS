/**
 * DATASUS & FNS AUDITOR — fns_client.js
 * Cliente oficial de integração com a API REST do Fundo Nacional de Saúde (FNS)
 */

const https = require('https');

class FnsClient {
    constructor() {
        this.baseUrl = 'https://consultafns.saude.gov.br/recursos';
        this.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json, text/plain, */*'
        };
    }

    _get(path, queryParams = {}) {
        return new Promise((resolve, reject) => {
            const qs = new URLSearchParams(queryParams).toString();
            const url = `${this.baseUrl}/${path}${qs ? '?' + qs : ''}`;
            
            https.get(url, { headers: this.headers }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        try {
                            resolve(JSON.parse(data));
                        } catch (e) {
                            reject(new Error(`Falha ao parsear JSON: ${e.message}`));
                        }
                    } else {
                        reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 200)}`));
                    }
                });
            }).on('error', reject);
        });
    }

    /**
     * Consulta repasses consolidados por Bloco de Financiamento e Grupo de Ação
     * @param {string|number} coMunicipioIbge Código IBGE de 6 dígitos (ex: 210120)
     * @param {string|number} ano Ano de competência (ex: 2026)
     * @param {string} [sgUf='MA'] Sigla da UF
     */
    async getRepasseBloco(coMunicipioIbge, ano, sgUf = 'MA') {
        const res = await this._get('consulta-consolidada/repasse-bloco', {
            page: 1,
            count: 50,
            ano: String(ano),
            sgUf: sgUf.toUpperCase(),
            coMunicipioIbge: String(coMunicipioIbge)
        });
        return res.resultado || [];
    }

    /**
     * Obtém informações da Unidade Gestora / FMS (CNPJ, esfera, dirigente)
     * @param {string|number} coMunicipioIbge Código IBGE de 6 dígitos
     * @param {string|number} ano Ano
     * @param {string} [sgUf='MA'] Sigla da UF
     */
    async getEntidadeFms(coMunicipioIbge, ano, sgUf = 'MA') {
        const res = await this._get('consulta-detalhada/entidades', {
            page: 1,
            count: 10,
            ano: String(ano),
            estado: sgUf.toUpperCase(),
            municipio: String(coMunicipioIbge)
        });
        const dados = res.resultado && res.resultado.dados ? res.resultado.dados : [];
        return dados[0] || null;
    }

    /**
     * Consulta detalhada de ações, emendas parlamentares, portarias e SAMU
     * @param {string|number} coMunicipioIbge Código IBGE de 6 dígitos
     * @param {string|number} ano Ano
     * @param {string} [cpfCnpjUg] CNPJ da Unidade Gestora
     * @param {string} [sgUf='MA'] Sigla da UF
     */
    async getDetalheAcoes(coMunicipioIbge, ano, cpfCnpjUg = null, sgUf = 'MA') {
        if (!cpfCnpjUg) {
            const ent = await this.getEntidadeFms(coMunicipioIbge, ano, sgUf);
            if (ent && ent.cpfCnpj) {
                cpfCnpjUg = ent.cpfCnpj;
            }
        }

        const params = {
            page: 1,
            count: 100,
            ano: String(ano),
            estado: sgUf.toUpperCase(),
            municipio: String(coMunicipioIbge)
        };
        if (cpfCnpjUg) params.cpfCnpjUg = cpfCnpjUg;

        const res = await this._get('consulta-detalhada/detalhe-acao', params);
        return res.resultado && res.resultado.dados ? res.resultado.dados : [];
    }
}

// Execução via CLI direta
if (require.main === module) {
    const args = process.argv.slice(2);
    const ibge = args[0] || '210120';
    const ano = args[1] || '2026';
    const uf = args[2] || 'MA';

    const client = new FnsClient();

    console.log(`\nConsultando FNS para IBGE ${ibge} (${uf}) - Exercício ${ano}...`);

    (async () => {
        try {
            const entidade = await client.getEntidadeFms(ibge, ano, uf);
            if (entidade) {
                console.log(`\nEntidade: ${entidade.razaoSocial} | CNPJ: ${entidade.cpfCnpjFormatado}`);
            }

            const blocos = await client.getRepasseBloco(ibge, ano, uf);
            console.log(`\n=== REPASSES POR BLOCO E GRUPO (${ano}) ===`);
            let totalGeral = 0;

            blocos.forEach(b => {
                console.log(`\n[Bloco ${b.codigo}] ${b.nome} -> R$ ${b.vlTotal.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`);
                totalGeral += b.vlTotal;
                if (b.repasses) {
                    b.repasses.forEach(r => {
                        console.log(`   * ${r.nome}: R$ ${r.vlTotal.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`);
                    });
                }
            });
            console.log(`\n>>> TOTAL CONSOLIDADO PAGO: R$ ${totalGeral.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`);

            const acoes = await client.getDetalheAcoes(ibge, ano, entidade ? entidade.cpfCnpj : null, uf);
            console.log(`\n=== DESTAQUES DA MÉDIA E ALTA COMPLEXIDADE (MAC) ===`);
            const macAcoes = acoes.filter(a => (a.grupoAcao && a.grupoAcao.nome.includes('COMPLEXIDADE')) || (a.componenteBloco && a.componenteBloco.nome.includes('COMPLEXIDADE')));
            
            macAcoes.forEach(a => {
                console.log(`- ${a.descricao} -> R$ ${Number(a.valorLiquido).toLocaleString('pt-BR', {minimumFractionDigits: 2})}`);
            });

        } catch (err) {
            console.error('Erro na consulta FNS:', err.message);
        }
    })();
}

module.exports = FnsClient;

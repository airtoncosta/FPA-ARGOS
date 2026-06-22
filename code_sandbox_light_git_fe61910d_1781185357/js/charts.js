/**
 * ARGOS — charts.js
 * Módulo de gráficos Chart.js — Identidade Visual SUS
 */

const ARGOS_COLORS = {
    blue:    '#1565C0',
    blueMid: '#1976D2',
    sky:     '#42A5F5',
    skyAlpha:'rgba(66,165,245,0.15)',
    green:   '#2E7D32',
    greenMid:'#43A047',
    greenAlpha:'rgba(46,125,50,0.15)',
    teal:    '#00796B',
    orange:  '#E65100',
    orangeAlpha:'rgba(230,81,0,0.15)',
    red:     '#C62828',
    redAlpha:'rgba(198,40,40,0.15)',
    purple:  '#6A1B9A',
    indigo:  '#283593',
    yellow:  '#F9A825',
    gray:    '#94A3B8',

    palette: [
        '#1565C0','#2E7D32','#E65100','#6A1B9A','#00796B',
        '#C62828','#283593','#F9A825','#0277BD','#558B2F',
        '#AD1457','#00838F','#4E342E','#37474F','#7B1FA2'
    ],

    statusColors: {
        EXCELENTE: '#2E7D32',
        BOA:       '#0277BD',
        REGULAR:   '#E65100',
        CRITICA:   '#C62828'
    }
};

// Função para quebrar strings longas de forma inteligente para uso nas labels do Chart.js
function splitChartLabel(text, maxLineLength = 40) {
    if (!text || text.length <= maxLineLength) return text;
    const words = text.split(' ');
    const lines = [];
    let currentLine = words[0];
    for (let i = 1; i < words.length; i++) {
        if (currentLine.length + 1 + words[i].length <= maxLineLength) {
            currentLine += ' ' + words[i];
        } else {
            lines.push(currentLine);
            currentLine = words[i];
        }
    }
    lines.push(currentLine);
    return lines;
}

// Configurações globais Chart.js
Chart.defaults.font.family = "'Inter', 'Segoe UI', system-ui, sans-serif";
Chart.defaults.font.size = 11;
Chart.defaults.color = '#64748B';
Chart.defaults.plugins.legend.labels.usePointStyle = true;
Chart.defaults.plugins.legend.labels.padding = 16;

const ChartModule = {

    /**
     * Destrói instância existente antes de recriar
     */
    destroy(canvasId) {
        const existing = APP_STATE.chartsInstances[canvasId];
        if (existing) { existing.destroy(); delete APP_STATE.chartsInstances[canvasId]; }
    },

    get(canvasId) {
        return document.getElementById(canvasId);
    },

    save(canvasId, instance) {
        APP_STATE.chartsInstances[canvasId] = instance;
    },

    /**
     * Evolução Mensal — Linha dupla (Valor Apresentado x Aprovado x Glosado)
     */
    renderEvolucaoMensal(data) {
        const id = 'chartEvolucaoMensal';
        this.destroy(id);
        const ctx = this.get(id);
        if (!ctx) return;

        const meses = data.faturamentoMensal;
        const labels = meses.map(m => m.nomeMes);

        const chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Valor Apresentado',
                        data: meses.map(m => m.valApresentado),
                        borderColor: ARGOS_COLORS.blue,
                        backgroundColor: 'transparent',
                        borderWidth: 2.5,
                        borderDash: [6, 4],
                        pointBackgroundColor: ARGOS_COLORS.blue,
                        pointRadius: 5,
                        tension: 0.35, fill: false
                    },
                    {
                        label: 'Valor Aprovado',
                        data: meses.map(m => m.valAprovado),
                        borderColor: ARGOS_COLORS.green,
                        backgroundColor: ARGOS_COLORS.greenAlpha,
                        borderWidth: 2.5,
                        pointBackgroundColor: ARGOS_COLORS.green,
                        pointRadius: 5,
                        tension: 0.35, fill: true
                    },
                    {
                        label: 'Valor Glosado',
                        data: meses.map(m => m.valGlosado),
                        borderColor: ARGOS_COLORS.red,
                        backgroundColor: ARGOS_COLORS.redAlpha,
                        borderWidth: 2,
                        pointBackgroundColor: ARGOS_COLORS.red,
                        pointRadius: 4,
                        tension: 0.35, fill: true
                    }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { position: 'top' },
                    tooltip: {
                        callbacks: {
                            label: ctx => {
                                const val = fmt.moeda(ctx.parsed.y);
                                if (ctx.datasetIndex === 2) {
                                    const apresent = ctx.chart.data.datasets[0].data[ctx.dataIndex];
                                    const pct = apresent > 0 ? (ctx.parsed.y / apresent * 100).toFixed(2) : 0;
                                    return `${ctx.dataset.label}: ${val} (${pct}% do Apresentado)`;
                                }
                                return `${ctx.dataset.label}: ${val}`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        position: 'left',
                        ticks: { callback: v => 'R$' + (v/1000).toFixed(0) + 'k', color: '#334155', font: { weight: '600' } },
                        grid: { color: 'rgba(0,0,0,.05)' }
                    },
                    x: { grid: { display: false }, ticks: { color: '#334155', font: { weight: '600' } } }
                }
            }
        });
        this.save(id, chart);
    },

    /**
     * Participação por Unidade — Pizza
     */
    renderParticipacaoUnidade(data) {
        const id = 'chartParticipacaoUnidade';
        this.destroy(id);
        const ctx = this.get(id);
        if (!ctx) return;

        const top8 = [...data.unidades]
            .filter(u => u.valAprovado > 0)
            .sort((a,b) => b.valAprovado - a.valAprovado)
            .slice(0, 7);

        const outros = data.unidades
            .filter(u => !top8.includes(u))
            .reduce((s, u) => s + u.valAprovado, 0);

        const labels = [...top8.map(u => u.nome), 'Demais Unidades'];
        const values = [...top8.map(u => u.valAprovado), outros];

        const chart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels,
                datasets: [{
                    data: values,
                    backgroundColor: ARGOS_COLORS.palette,
                    borderWidth: 2,
                    borderColor: '#fff',
                    hoverOffset: 8
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'left', labels: { font: { size: 10 } } },
                    tooltip: {
                        callbacks: {
                            label: ctx => `${ctx.label}: ${fmt.moeda(ctx.parsed)} (${(ctx.parsed / values.reduce((a,b)=>a+b,0) * 100).toFixed(1)}%)`
                        }
                    }
                },
                cutout: '62%'
            }
        });
        this.save(id, chart);
    },

    /**
     * Produção Mensal — Quantidade (Evolução Temporal)
     */
    renderProducaoMensal(data) {
        const id = 'chartProducaoMensal';
        this.destroy(id);
        const ctx = this.get(id);
        if (!ctx) return;

        const meses = data.faturamentoMensal;

        const chart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: meses.map(m => m.nomeMes),
                datasets: [
                    {
                        type: 'bar',
                        label: 'Apresentados',
                        data: meses.map(m => m.qtdApresentada),
                        backgroundColor: ARGOS_COLORS.blueMid,
                        borderRadius: 4,
                        barPercentage: 0.7,
                        categoryPercentage: 0.85
                    },
                    {
                        type: 'bar',
                        label: 'Aprovados',
                        data: meses.map(m => m.qtdAprovada),
                        backgroundColor: ARGOS_COLORS.green,
                        borderRadius: 4,
                        barPercentage: 0.7,
                        categoryPercentage: 0.85
                    },
                    {
                        type: 'bar',
                        label: 'Glosados',
                        data: meses.map(m => m.qtdGlosada),
                        backgroundColor: ARGOS_COLORS.red,
                        borderRadius: 4,
                        barPercentage: 0.7,
                        categoryPercentage: 0.85
                    }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: { 
                    legend: { 
                        position: 'top',
                        labels: { 
                            usePointStyle: true, 
                            boxWidth: 8, 
                            padding: 20, 
                            font: { size: 12, weight: '500', family: "'Inter', sans-serif" } 
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(255, 255, 255, 0.98)',
                        titleColor: '#0f172a',
                        bodyColor: '#334155',
                        borderColor: '#cbd5e1',
                        borderWidth: 1,
                        padding: 12,
                        boxPadding: 4,
                        usePointStyle: true,
                        callbacks: {
                            label: function(ctx) {
                                let label = ctx.dataset.label || '';
                                if (label) { label += ': '; }
                                if (ctx.parsed.y !== null) { label += fmt.numero(ctx.parsed.y); }
                                return label;
                            }
                        }
                    }
                },
                scales: {
                    y: { 
                        beginAtZero: true,
                        ticks: { callback: v => fmt.numero(v), color: '#64748b', font: { size: 11 } }, 
                        grid: { color: '#f1f5f9', drawBorder: false } 
                    },
                    x: { 
                        grid: { display: false }, 
                        ticks: { color: '#475569', font: { weight: '600', size: 11 } } 
                    }
                }
            }
        });
        this.save(id, chart);
    },

    /**
     * Top 10 Unidades — Barras horizontais
     */
    renderTopUnidades(data) {
        const id = 'chartTopUnidades';
        this.destroy(id);
        const ctx = this.get(id);
        if (!ctx) return;

        const top10 = [...data.unidades]
            .filter(u => u.valAprovado > 0)
            .sort((a,b) => b.valAprovado - a.valAprovado)
            .slice(0, 10);

        const chart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: top10.map(u => splitChartLabel(u.nome, 40)),
                datasets: [{
                    label: 'Valor Aprovado',
                    data: top10.map(u => u.valAprovado),
                    backgroundColor: ARGOS_COLORS.palette.slice(0, 10),
                    borderRadius: 6
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: ctx => fmt.moeda(ctx.parsed.x) } }
                },
                scales: {
                    x: { ticks: { callback: v => 'R$' + (v/1000).toFixed(0) + 'k' } },
                    y: { ticks: { font: { size: 10 }, color: '#334155' }, grid: { display: false } }
                }
            }
        });
        this.save(id, chart);
    },

    /**
     * Faturamento mensal — Área
     */
    renderFaturamentoMensal(data) {
        const id = 'chartFaturamentoMensal';
        this.destroy(id);
        const ctx = this.get(id);
        if (!ctx) return;

        const meses = data.faturamentoMensal;

        const chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: meses.map(m => m.nomeMes),
                datasets: [
                    {
                        label: 'Valor Apresentado',
                        data: meses.map(m => m.valApresentado),
                        borderColor: ARGOS_COLORS.blue,
                        backgroundColor: 'transparent',
                        fill: false, tension: 0.4, borderWidth: 2,
                        borderDash: [6,3],
                        pointBackgroundColor: ARGOS_COLORS.blue, pointRadius: 4,
                        order: 1
                    },
                    {
                        label: 'Valor Aprovado',
                        data: meses.map(m => m.valAprovado),
                        borderColor: ARGOS_COLORS.green,
                        backgroundColor: ARGOS_COLORS.greenAlpha,
                        fill: true, tension: 0.4, borderWidth: 3,
                        pointBackgroundColor: ARGOS_COLORS.green, pointRadius: 6,
                        order: 2
                    }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { position: 'top' } },
                scales: {
                    y: { ticks: { callback: v => 'R$' + (v/1000).toFixed(0) + 'k', color: '#334155', font: { weight: '600' } } },
                    x: { grid: { display: false }, ticks: { color: '#334155', font: { weight: '600' } } }
                }
            }
        });
        this.save(id, chart);
    },

    /**
     * Eficiência — Barra horizontal (% aprovação)
     */
    renderEficienciaBar(data) {
        const id = 'chartEficienciaBar';
        this.destroy(id);
        const ctx = this.get(id);
        if (!ctx) return;

        const sorted = [...data.unidades]
            .filter(u => u.valApresentado > 0)
            .sort((a,b) => b.pctAprovacaoVal - a.pctAprovacaoVal);

        const colors = sorted.map(u => {
            const s = classificarStatus(u.pctAprovacaoVal);
            return ARGOS_COLORS.statusColors[s.status];
        });

        const chart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: sorted.map(u => u.nome.length > 25 ? u.nome.substring(0,23) + '…' : u.nome),
                datasets: [{
                    label: '% Aprovação Financeira',
                    data: sorted.map(u => u.pctAprovacaoVal),
                    backgroundColor: colors,
                    borderRadius: 4
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: ctx => fmt.pct(ctx.parsed.x) } }
                },
                scales: {
                    x: { min: 70, max: 101, ticks: { callback: v => v + '%' } },
                    y: { ticks: { font: { size: 9.5 } }, grid: { display: false } }
                }
            }
        });
        this.save(id, chart);
    },

    /**
     * Status distribuição — Rosca
     */
    renderStatusDist(data) {
        const id = 'chartStatusDist';
        this.destroy(id);
        const ctx = this.get(id);
        if (!ctx) return;

        const counts = { EXCELENTE: 0, BOA: 0, REGULAR: 0, CRITICA: 0 };
        data.unidades.forEach(u => {
            const s = classificarStatus(u.pctAprovacaoVal);
            counts[s.status]++;
        });

        const chart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['✅ Excelente', '✔️ Boa', '⚠️ Regular', '❌ Crítica'],
                datasets: [{
                    data: [counts.EXCELENTE, counts.BOA, counts.REGULAR, counts.CRITICA],
                    backgroundColor: ['#2E7D32','#0277BD','#E65100','#C62828'],
                    borderWidth: 3, borderColor: '#fff', hoverOffset: 8
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom' } },
                cutout: '60%'
            }
        });
        this.save(id, chart);
    },

    /**
     * Glosas por unidade
     */
    renderGlosasUnidades(data) {
        const id = 'chartGlosasUnidades';
        this.destroy(id);
        const ctx = this.get(id);
        if (!ctx) return;

        const com = [...data.unidades]
            .filter(u => u.valGlosado > 0)
            .sort((a,b) => b.valGlosado - a.valGlosado)
            .slice(0, 8);

        const chart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: com.map(u => u.nome.length > 18 ? u.nome.substring(0,16) + '…' : u.nome),
                datasets: [{
                    label: 'Valor Glosado',
                    data: com.map(u => u.valGlosado),
                    backgroundColor: '#D32F2F',
                    borderRadius: 5
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: ctx => fmt.moeda(ctx.parsed.x) } }
                },
                scales: {
                    x: { ticks: { callback: v => 'R$' + v.toFixed(0) } },
                    y: { grid: { display: false } }
                }
            }
        });
        this.save(id, chart);
    },

    /**
     * Glosas mensal
     */
    renderGlosasMensal(data) {
        const id = 'chartGlosasMensal';
        this.destroy(id);
        const ctx = this.get(id);
        if (!ctx) return;

        const meses = data.faturamentoMensal;

        const chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: meses.map(m => m.nomeMes),
                datasets: [
                    {
                        label: 'Valor Glosado',
                        data: meses.map(m => m.valGlosado),
                        borderColor: ARGOS_COLORS.red,
                        backgroundColor: ARGOS_COLORS.redAlpha,
                        fill: true, tension: 0.4, borderWidth: 2.5,
                        pointBackgroundColor: ARGOS_COLORS.red, pointRadius: 5
                    },
                    {
                        label: 'Qtd. Glosada',
                        data: meses.map(m => m.qtdGlosada),
                        borderColor: ARGOS_COLORS.orange,
                        backgroundColor: ARGOS_COLORS.orangeAlpha,
                        fill: true, tension: 0.4, borderWidth: 2,
                        pointBackgroundColor: ARGOS_COLORS.orange, pointRadius: 4,
                        yAxisID: 'y2'
                    }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { position: 'top' } },
                scales: {
                    y: { ticks: { callback: v => 'R$' + v.toFixed(0), color: '#334155', font: { weight: '600' } } },
                    y2: { position: 'right', grid: { display: false } },
                    x: { grid: { display: false }, ticks: { color: '#334155', font: { weight: '600' } } }
                }
            }
        });
        this.save(id, chart);
    },

    /**
     * Procedimentos — Barras horizontais
     */
    renderProcedimentos(data) {
        const id = 'chartProcedimentos';
        this.destroy(id);
        const ctx = this.get(id);
        if (!ctx) return;

        const top15 = data.procedimentos.slice(0, 15);

        const chart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: top15.map(p => p.descricao.length > 30 ? p.descricao.substring(0,28) + '…' : p.descricao),
                datasets: [{
                    label: 'Valor Aprovado',
                    data: top15.map(p => p.valAprovado),
                    backgroundColor: ARGOS_COLORS.palette,
                    borderRadius: 4
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: ctx => fmt.moeda(ctx.parsed.x) } }
                },
                scales: {
                    x: { ticks: { callback: v => 'R$' + (v/1000).toFixed(0) + 'k' } },
                    y: { ticks: { font: { size: 9 } }, grid: { display: false } }
                }
            }
        });
        this.save(id, chart);
    },

    /**
     * Regulação — Barras agrupadas (oferta x produção)
     */
    renderRegulacao(data) {
        const id = 'chartRegulacao';
        this.destroy(id);
        const ctx = this.get(id);
        if (!ctx) return;

        const top8 = [...data.unidades]
            .filter(u => u.qtdAprovada > 0)
            .sort((a,b) => b.qtdAprovada - a.qtdAprovada)
            .slice(0, 8);

        const chart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: top8.map(u => u.nome.length > 18 ? u.nome.substring(0,16) + '…' : u.nome),
                datasets: [
                    {
                        label: 'Produção Esperada',
                        data: top8.map(u => Math.round(u.qtdApresentada * 1.02)),
                        backgroundColor: 'rgba(25,118,210,0.3)',
                        borderColor: ARGOS_COLORS.blue,
                        borderWidth: 1.5,
                        borderRadius: 4
                    },
                    {
                        label: 'Produção Realizada',
                        data: top8.map(u => u.qtdAprovada),
                        backgroundColor: ARGOS_COLORS.green,
                        borderRadius: 4
                    }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { position: 'top' } },
                scales: {
                    y: { ticks: { callback: v => fmt.numero(v), color: '#334155', font: { weight: '600' } } },
                    x: { grid: { display: false }, ticks: { color: '#334155', font: { weight: '600' } } }
                }
            }
        });
        this.save(id, chart);
    },

    /**
     * Detalhe da unidade — Linha
     */
    renderUnidadeDetalhe(unidadeId, data) {
        const id = 'chartUnidadeDetalhe';
        this.destroy(id);
        const ctx = this.get(id);
        if (!ctx) return;

        const evo = data.evolucaoUnidade && data.evolucaoUnidade[unidadeId];
        const labels = data.faturamentoMensal.map(m => m.nomeMes);
        let values;

        if (evo) {
            values = [evo.jan || 0, evo.fev || 0, evo.mar || 0, evo.abr || 0];
        } else {
            const u = data.unidades.find(u => u.id === unidadeId);
            values = labels.map(() => u ? Math.round(u.valAprovado / labels.length * (0.9 + Math.random() * 0.2)) : 0);
        }

        const chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: 'Valor Aprovado',
                    data: values,
                    borderColor: ARGOS_COLORS.blue,
                    backgroundColor: ARGOS_COLORS.skyAlpha,
                    fill: true, tension: 0.4, borderWidth: 3,
                    pointBackgroundColor: ARGOS_COLORS.blue, pointRadius: 6
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { ticks: { callback: v => 'R$' + (v/1000).toFixed(0) + 'k', color: '#334155', font: { weight: '600' } } },
                    x: { grid: { display: false }, ticks: { color: '#334155', font: { weight: '600' } } }
                }
            }
        });
        this.save(id, chart);
    },

    /**
     * CBO — Pizza / Rosca
     */
    renderCbo(data) {
        const id = 'chartCbo';
        this.destroy(id);
        const ctx = this.get(id);
        if (!ctx || !data.cbos || !data.cbos.length) return;

        const top8 = [...data.cbos]
            .filter(c => c.valAprovado > 0)
            .sort((a,b) => b.valAprovado - a.valAprovado)
            .slice(0, 7);

        const outros = data.cbos
            .filter(c => !top8.includes(c))
            .reduce((s, c) => s + c.valAprovado, 0);

        const labels = [...top8.map(c => c.descricao.length > 25 ? c.descricao.substring(0,23) + '…' : c.descricao)];
        const values = [...top8.map(c => c.valAprovado)];

        if (outros > 0) {
            labels.push('Demais Ocupações');
            values.push(outros);
        }

        const chart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels,
                datasets: [{
                    data: values,
                    backgroundColor: ARGOS_COLORS.palette,
                    borderWidth: 2,
                    borderColor: '#fff',
                    hoverOffset: 8
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'right', labels: { font: { size: 10 } } },
                    tooltip: {
                        callbacks: {
                            label: ctx => `${ctx.label}: ${fmt.moeda(ctx.parsed)} (${(ctx.parsed / values.reduce((a,b)=>a+b,0) * 100).toFixed(1)}%)`
                        }
                    }
                },
                cutout: '62%'
            }
        });
        this.save(id, chart);
    },

    /**
     * Monitoramento do Teto MAC — Comparação do Faturamento Aprovado com o Teto Mensal
     */
    renderTetoMacMensal(data) {
        const id = 'chartTetoMacMensal';
        this.destroy(id);
        const ctx = this.get(id);
        if (!ctx) return;

        const portaria = APP_STATE.portariaData;
        if (!portaria) return;

        const tetoAnual = portaria.tetoMacSemSamu;
        const tetoMensal = tetoAnual / 12;

        // Filtrar meses para não exibir informações anteriores a JAN/2026
        const meses = data.faturamentoMensal.filter(m => {
            if (!m.competencia) return false;
            const parts = m.competencia.split('/');
            const year = parseInt(parts[parts.length - 1], 10);
            return year >= 2026;
        });
        
        const labels = meses.map(m => m.nomeMes);
        const aprovados = meses.map(m => m.valAprovado);

        // Acumulado Executado
        let acumulado = 0;
        const acumulados = aprovados.map(v => { acumulado += v; return acumulado; });

        // Cores dinâmicas das barras (verde se >= teto mensal, vermelho se < teto)
        const backgroundColors = aprovados.map(val => 
            val >= tetoMensal ? 'rgba(46, 125, 50, 0.75)' : 'rgba(198, 40, 40, 0.75)'
        );
        const borderColors = aprovados.map(val => 
            val >= tetoMensal ? 'rgba(46, 125, 50, 1)' : 'rgba(198, 40, 40, 1)'
        );

        const chart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Produção Aprovada',
                        data: aprovados,
                        backgroundColor: backgroundColors,
                        borderColor: borderColors,
                        borderWidth: 1.5,
                        borderRadius: 4,
                        barThickness: 32,
                        yAxisID: 'y',
                        order: 2
                    },
                    {
                        label: 'Teto MAC Mensal',
                        data: labels.map(() => tetoMensal),
                        type: 'line',
                        borderColor: '#dc2626',
                        borderWidth: 0,
                        borderDash: [6, 4],
                        pointRadius: 0,
                        backgroundColor: 'transparent',
                        fill: false,
                        yAxisID: 'y',
                        order: 0
                    }
                ]
            },
            options: {
                layout: { padding: { bottom: 20 } },
                responsive: true, maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: ctx => {
                                const val = fmt.moeda(ctx.parsed.y);
                                if (ctx.datasetIndex === 0) {
                                    const diff = ctx.parsed.y - tetoMensal;
                                    const percent = ((ctx.parsed.y / tetoMensal) * 100).toFixed(1);
                                    if (diff > 0) {
                                        return `${ctx.dataset.label}: ${val} (Excedeu em ${fmt.moeda(diff)} / ${percent}%)`;
                                    } else {
                                        return `${ctx.dataset.label}: ${val} (${percent}% do teto mensal)`;
                                    }
                                }
                                return `${ctx.dataset.label}: ${val}`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        position: 'left',
                        title: { display: true, text: 'Mensal (R$)', font: { size: 10, weight: '600' }, color: '#64748b' },
                        ticks: { callback: v => 'R$' + (v/1000).toFixed(0) + 'k', color: '#334155', font: { size: 10, weight: '600' } },
                        grid: { color: 'rgba(0,0,0,.05)' }
                    },
                    x: { grid: { display: false }, ticks: { color: '#334155', font: { weight: '600' } } }
                }
            },
            plugins: [{
                id: 'horizontalTetoMacLine',
                beforeDraw(chart) {
                    const { ctx, chartArea: { left, right }, scales: { y } } = chart;
                    const yPos = y.getPixelForValue(tetoMensal);
                    
                    ctx.save();
                    ctx.beginPath();
                    ctx.moveTo(left, yPos);
                    ctx.lineTo(right, yPos);
                    ctx.lineWidth = 2.5;
                    ctx.strokeStyle = '#dc2626';
                    ctx.setLineDash([6, 4]);
                    ctx.stroke();
                    ctx.restore();
                }
            }, {
                id: 'datalabelsBottom',
                afterDraw(chart, args, pluginOptions) {
                    const { ctx } = chart;
                    chart.data.datasets.forEach((dataset, i) => {
                        if (i === 0) { // Produção Aprovada
                            const meta = chart.getDatasetMeta(i);
                            meta.data.forEach((bar, index) => {
                                const val = dataset.data[index];
                                if (val > 0) {
                                    ctx.save();
                                    ctx.fillStyle = '#1e293b';
                                    ctx.font = 'bold 10px Inter, sans-serif';
                                    ctx.textAlign = 'center';
                                    ctx.textBaseline = 'top';
                                    const text = 'R$ ' + (val/1000).toFixed(1) + 'k';
                                    ctx.fillText(text, bar.x, chart.scales.x.bottom + 2);
                                    ctx.restore();
                                }
                            });
                        }
                    });
                }
            }]
        });
        this.save(id, chart);
    },

    /**
     * Renderiza todos os gráficos de uma vez
     */
    renderAll(data) {
        this.renderEvolucaoMensal(data);
        this.renderParticipacaoUnidade(data);
        this.renderProducaoMensal(data);
        this.renderTopUnidades(data);
        this.renderFaturamentoMensal(data);
        this.renderEficienciaBar(data);
        this.renderStatusDist(data);
        this.renderGlosasUnidades(data);
        this.renderGlosasMensal(data);
        this.renderProcedimentos(data);
        this.renderRegulacao(data);
        this.renderCbo(data);
        this.renderTopProcedimentosExec(data);
        this.renderTopProfissionaisExec(data);
        this.renderTetoMacMensal(data);
    },

    /**
     * Top 10 Procedimentos (Executivo)
     */
    renderTopProcedimentosExec(data) {
        const id = 'chartTopProcedimentosExec';
        this.destroy(id);
        const ctx = this.get(id);
        if (!ctx || !data.procedimentos) return;

        const top10 = [...data.procedimentos]
            .filter(p => p.valAprovado > 0)
            .sort((a,b) => b.valAprovado - a.valAprovado)
            .slice(0, 10);

        const chart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: top10.map(p => splitChartLabel(p.descricao, 35)),
                datasets: [{
                    label: 'Valor Aprovado',
                    data: top10.map(p => p.valAprovado),
                    backgroundColor: ARGOS_COLORS.blue,
                    borderRadius: 4
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: ctx => fmt.moeda(ctx.parsed.x) } }
                },
                scales: {
                    x: { ticks: { callback: v => 'R$' + (v/1000).toFixed(0) + 'k' } },
                    y: { ticks: { font: { size: 9 }, autoSkip: false, color: '#334155' }, grid: { display: false } }
                }
            }
        });
        this.save(id, chart);
    },

    /**
     * Top 20 Profissionais/CBO (Executivo)
     */
    renderTopProfissionaisExec(data) {
        const id = 'chartTopProfissionaisExec';
        this.destroy(id);
        const ctx = this.get(id);
        if (!ctx || !data.cbos) return;

        const top20 = [...data.cbos]
            .filter(c => c.valAprovado > 0)
            .sort((a,b) => b.valAprovado - a.valAprovado)
            .slice(0, 20);

        const chart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: top20.map(c => splitChartLabel(c.descricao, 35)),
                datasets: [{
                    label: 'Valor Aprovado',
                    data: top20.map(c => c.valAprovado),
                    backgroundColor: ARGOS_COLORS.green,
                    borderRadius: 4
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: ctx => fmt.moeda(ctx.parsed.x) } }
                },
                scales: {
                    x: { ticks: { callback: v => 'R$' + (v/1000).toFixed(0) + 'k' } },
                    y: { ticks: { font: { size: 9 }, autoSkip: false }, grid: { display: false } }
                }
            }
        });
        this.save(id, chart);
    }
};

window.toggleEvolucaoDataset = function(index, el) {
    const chart = AppCharts.get('chartEvolucaoMensal');
    if (!chart) return;
    
    const isVisible = chart.isDatasetVisible(index);
    if (isVisible) {
        chart.hide(index);
        el.style.opacity = '0.4';
        el.style.textDecoration = 'line-through';
    } else {
        chart.show(index);
        el.style.opacity = '1';
        el.style.textDecoration = 'none';
    }
};

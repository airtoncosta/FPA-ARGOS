/**
 * ARGOS FPA — export.js
 * Exportação PDF profissional e Excel gerencial
 * Secretaria Municipal de Saúde — Bacabal/MA
 */

/* =========================================================
   EXPORTAÇÃO PDF
   ========================================================= */
const PDFExport = {

    /**
     * Exportar relatório executivo completo
     */
    exportExecutivo() {
        const d = window.getReportFilteredData() || APP_STATE.data;
        if (!d) { showToast('⚠️ Carregue os dados antes de exportar.', 'warn'); return; }

        showLoading('Gerando PDF...');

        setTimeout(async () => {
            try {
                // Usar logo SCAAR em Base64 para total compatibilidade offline (CORS/protocolo file://)
                const scaarImg = window.SCAAR_LOGO_BASE64 || null;

                const { jsPDF } = window.jspdf;
                // MODO PAISAGEM
                const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

                const pageW = doc.internal.pageSize.getWidth();
                const pageH = doc.internal.pageSize.getHeight();
                const margin = 14;

                let y = 10;
                
                // Helper para controlar quebras de página
                let currentPageHasContent = false;
                const ensureNewPage = () => {
                    if (currentPageHasContent) {
                        doc.addPage();
                        y = 15;
                        currentPageHasContent = false;
                    }
                };

                // ── PÁGINA 1: CAPA, RESUMO GERAL (KPIs) E FATURAMENTO MENSAL ──
                
                // ── TÍTULO E HEADER BOX (Capa / Identificação) ──
                const chkCapa = document.getElementById('chkCapa')?.checked ?? true;
                if (chkCapa) {
                    await this.drawUnifiedHeader(doc, d, 'RELATÓRIO EXECUTIVO DE PRODUÇÃO E FATURAMENTO AMBULATORIAL', pageW, margin);
                    y = 36;
                    currentPageHasContent = true;
                } else {
                    y = 15;
                }

                // ── KPI CARDS (Resumo Geral) ──
                const chkResumo = document.getElementById('chkResumo')?.checked ?? true;
                if (chkResumo) {
                    y = this.drawCards(doc, d, y, pageW, margin);
                    currentPageHasContent = true;
                }

                // ── FATURAMENTO POR MÊS ──
                const chkFaturamento = document.getElementById('chkFaturamento')?.checked ?? true;
                if (chkFaturamento && d.faturamentoMensal.length > 0) {
                    if (y > pageH - 45) { 
                        doc.addPage(); 
                        y = 15; 
                    } else { 
                        y += 6; 
                    }
                    y += 10;
                    
                    const getMesExtenso = (mm_aaaa) => {
                        const [mm, aaaa] = mm_aaaa.split('/');
                        const meses = {'01':'Janeiro','02':'Fevereiro','03':'Março','04':'Abril','05':'Maio','06':'Junho','07':'Julho','08':'Agosto','09':'Setembro','10':'Outubro','11':'Novembro','12':'Dezembro'};
                        return (meses[mm] || mm) + '/' + aaaa;
                    };
                    const rowsFat = d.faturamentoMensal.map(m => [
                        getMesExtenso(m.nomeMes),
                        this.formatN(m.qtdApresentada),
                        this.formatN(m.qtdAprovada),
                        this.formatN(m.qtdGlosada),
                        this.formatM(m.valApresentado),
                        this.formatM(m.valAprovado),
                        this.formatM(m.valGlosado),
                        this.formatP(m.pctAprovado)
                    ]);

                    const tot = {
                        qtdApres: d.faturamentoMensal.reduce((s,m) => s + m.qtdApresentada, 0),
                        qtdAprov: d.faturamentoMensal.reduce((s,m) => s + m.qtdAprovada, 0),
                        qtdGlos:  d.faturamentoMensal.reduce((s,m) => s + m.qtdGlosada, 0),
                        valApres: d.faturamentoMensal.reduce((s,m) => s + m.valApresentado, 0),
                        valAprov: d.faturamentoMensal.reduce((s,m) => s + m.valAprovado, 0),
                        valGlos:  d.faturamentoMensal.reduce((s,m) => s + m.valGlosado, 0),
                    };
                    const pctTot = tot.qtdApres > 0 ? (tot.qtdAprov / tot.qtdApres * 100) : 0;
                    rowsFat.push(['TOTAL GERAL', this.formatN(tot.qtdApres), this.formatN(tot.qtdAprov), this.formatN(tot.qtdGlos), this.formatM(tot.valApres), this.formatM(tot.valAprov), this.formatM(tot.valGlos), this.formatP(pctTot)]);

                    doc.autoTable({
                        startY: y,
                        margin: { left: margin, right: margin },
                        head: [['Mês', 'Qtd. Apresentada', 'Qtd. Aprovada', 'Qtd. Glosada', 'Valor Apresentado', 'Valor Aprovado', 'Valor Glosado', '% Aprovado']],
                        body: rowsFat,
                        styles: { fontSize: 8.5, halign: 'center', lineWidth: 0, textColor: 0 },
                        headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold', halign: 'center' },
                        columnStyles: { 0: { halign: 'left', fontStyle: 'bold' } },
                        alternateRowStyles: { fillColor: [235, 240, 246] },
                        didParseCell: data => {
                            if (data.row.index === rowsFat.length - 1) {
                                data.cell.styles.fillColor = [30, 64, 175];
                                data.cell.styles.textColor = 255;
                                data.cell.styles.fontStyle = 'bold';
                                data.cell.styles.fontSize = 10;
                            }
                        },
                        didDrawPage: data => this.drawTableCard(doc, data, 'FATURAMENTO APROVADO POR MÊS')
                    });

                    y = doc.lastAutoTable.finalY + 8;
                    currentPageHasContent = true;
                }

                // ── PÁGINA 2: EFICIÊNCIA DE FATURAMENTO POR UNIDADE (Rank e todas as unidades) ──
                const chkEficiencia = document.getElementById('chkEficiencia')?.checked ?? true;
                if (chkEficiencia && d.unidades.length > 0) {
                    ensureNewPage();
                    y += 10;

                    const rowsEf = [...d.unidades]
                        .sort((a,b) => b.valAprovado - a.valAprovado)
                        .map((u, i) => {
                            const s = classificarStatus(u.pctAprovacaoVal);
                            return [
                                (i + 1) + 'º',
                                this.cleanPCL(u.nome),
                                this.formatN(u.qtdApresentada),
                                this.formatN(u.qtdAprovada),
                                this.formatP(u.pctAprovacaoQtd),
                                this.formatM(u.valApresentado),
                                this.formatM(u.valAprovado),
                                this.formatM(u.valGlosado),
                                this.formatP(u.pctAprovacaoVal),
                                s.status
                            ];
                        });

                    const rowCount = rowsEf.length;
                    const useCompact = rowCount > 20;
                    const fontSize = useCompact ? (rowCount > 30 ? 6.0 : 6.8) : 7.5;
                    const cellPadding = useCompact ? (rowCount > 30 ? 1.0 : 1.5) : 2.2;

                    doc.autoTable({
                        startY: y,
                        margin: { left: margin, right: margin },
                        head: [['Rank', 'Unidade de Saúde', 'Qtd. Apresentada', 'Qtd. Aprovada', '% Qtd.', 'Valor Apresentado', 'Valor Aprovado', 'Glosa (R$)', '% Fin.', 'Status']],
                        body: rowsEf,
                        styles: { fontSize: fontSize, cellPadding: cellPadding, halign: 'center', lineWidth: 0, textColor: 0 },
                        headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold', halign: 'center' },
                        columnStyles: {
                            0: { halign: 'center', fontStyle: 'bold', cellWidth: 10 },
                            1: { halign: 'left', cellWidth: 80 },
                            2: { halign: 'right', cellWidth: 22 },
                            3: { halign: 'right', cellWidth: 22 },
                            4: { halign: 'center', cellWidth: 18 },
                            5: { halign: 'right', cellWidth: 27 },
                            6: { halign: 'right', cellWidth: 27 },
                            7: { halign: 'right', cellWidth: 22 },
                            8: { halign: 'center', cellWidth: 18 },
                            9: { halign: 'center', fontStyle: 'bold', cellWidth: 23 }
                        },
                        alternateRowStyles: { fillColor: [235, 240, 246] },
                        didParseCell: data => {
                            if (data.column.index === 9 && data.section === 'body') {
                                const val = data.cell.raw;
                                if (val === 'EXCELENTE') { data.cell.styles.textColor = [27, 94, 32]; data.cell.styles.fontStyle = 'bold'; }
                                else if (val === 'BOA') { data.cell.styles.textColor = [2, 119, 189]; data.cell.styles.fontStyle = 'bold'; }
                                else if (val === 'REGULAR') { data.cell.styles.textColor = [230, 81, 0]; data.cell.styles.fontStyle = 'bold'; }
                                else if (val === 'CRITICA') { data.cell.styles.textColor = [183, 28, 28]; data.cell.styles.fontStyle = 'bold'; }
                            }
                        },
                        didDrawPage: data => this.drawTableCard(doc, data, 'EFICIÊNCIA DE FATURAMENTO POR UNIDADE')
                    });

                    y = doc.lastAutoTable.finalY + 8;
                    currentPageHasContent = true;
                }

                // ── PÁGINA 3: TOP PROCEDIMENTOS E CBO (Um acima do outro, na mesma página) ──
                const chkProcedimentos = document.getElementById('chkProcedimentos')?.checked ?? true;
                const chkCbo = document.getElementById('chkCbo')?.checked ?? true;

                const hasProc = chkProcedimentos && d.procedimentos && d.procedimentos.length > 0;
                const hasCbo = chkCbo && d.cbos && d.cbos.length > 0;

                if (hasProc || hasCbo) {
                    ensureNewPage();
                    y += 10;

                    const tableWidth = pageW - 2 * margin; // Largura total
                    let finalY1 = y;
                    let finalY2 = y;
                    
                    const bothActive = hasProc && hasCbo;
                    
                    // Se ambas as tabelas estiverem ativas, usamos um estilo mais compacto (font 6.5, padding 1.0)
                    // para garantir que caibam juntas sem estourar. Caso contrário, usamos tamanho normal.
                    const fontSize = bothActive ? 6.5 : 7.5;
                    const cellPadding = bothActive ? 1.1 : 2.0;
                    const spacing = bothActive ? 12 : 8;

                    // Top 15 Procedimentos
                    if (hasProc) {
                        const rowsProc = d.procedimentos.slice(0, 15).map((p, i) => [
                            i + 1,
                            p.codigo,
                            p.descricao,
                            this.formatN(p.qtdAprovada),
                            this.formatM(p.valAprovado),
                            p.valUnitario ? this.formatM(p.valUnitario) : '—'
                        ]);

                        doc.autoTable({
                            startY: y,
                            margin: { left: margin, right: margin },
                            tableWidth: tableWidth,
                            head: [['#', 'Código', 'Descrição', 'Qtd. Aprovada', 'Valor Aprovado', 'Valor Unitário']],
                            body: rowsProc,
                            styles: { fontSize: fontSize, cellPadding: cellPadding, halign: 'center', lineWidth: 0, textColor: 0 },
                            headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold', halign: 'center' },
                            columnStyles: {
                                0: { halign: 'center', fontStyle: 'bold', cellWidth: 10 },
                                1: { halign: 'center', cellWidth: 25 },
                                2: { halign: 'left', cellWidth: 144 },
                                3: { halign: 'right', cellWidth: 25 },
                                4: { halign: 'right', cellWidth: 35 },
                                5: { halign: 'right', cellWidth: 30 }
                            },
                            alternateRowStyles: { fillColor: [235, 240, 246] },
                            didDrawPage: data => this.drawTableCard(doc, data, 'TOP PROCEDIMENTOS')
                        });

                        finalY1 = doc.lastAutoTable.finalY;
                        y = finalY1 + spacing;
                    }

                    // Top 15 CBOs
                    if (hasCbo) {
                        const rowsCbo = d.cbos.slice(0, 15).map((c, i) => [
                            i + 1,
                            c.codigo,
                            c.descricao,
                            this.formatN(c.qtdAprovada),
                            this.formatM(c.valAprovado)
                        ]);

                        doc.autoTable({
                            startY: y,
                            margin: { left: margin, right: margin },
                            tableWidth: tableWidth,
                            head: [['#', 'Código CBO', 'Descrição/Profissão', 'Qtd. Aprovada', 'Valor Aprovado']],
                            body: rowsCbo,
                            styles: { fontSize: fontSize, cellPadding: cellPadding, halign: 'center', lineWidth: 0, textColor: 0 },
                            headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold', halign: 'center' },
                            columnStyles: {
                                0: { halign: 'center', fontStyle: 'bold', cellWidth: 10 },
                                1: { halign: 'center', cellWidth: 30 },
                                2: { halign: 'left', cellWidth: 159 },
                                3: { halign: 'right', cellWidth: 30 },
                                4: { halign: 'right', cellWidth: 40 }
                            },
                            alternateRowStyles: { fillColor: [235, 240, 246] },
                            didDrawPage: data => this.drawTableCard(doc, data, 'OCUPAÇÕES E PROFISSÕES (CBO)')
                        });

                        finalY2 = doc.lastAutoTable.finalY;
                    }

                    y = Math.max(finalY1, finalY2) + 8;
                    currentPageHasContent = true;
                }

                // ── PÁGINA 4 E SEGUINTES: GLOSAS, AUDITORIA, REGULAÇÃO ──
                let hasPage4Content = false;

                // ── MÓDULO DE GLOSAS ──
                const chkGlosas = document.getElementById('chkGlosas')?.checked ?? true;
                if (chkGlosas) {
                    const comGlosa = d.unidades.filter(u => u.valGlosado > 0);
                    if (comGlosa.length > 0) {
                        if (!hasPage4Content) { ensureNewPage(); hasPage4Content = true; }
                        y += 10;

                        const sortedGlosas = [...comGlosa].sort((a,b) => b.valGlosado - a.valGlosado);
                        const totalGlos = sortedGlosas.reduce((s, u) => s + u.valGlosado, 0);
                        const rowsGlos = sortedGlosas.map((u, i) => {
                            const pct = totalGlos > 0 ? (u.valGlosado / totalGlos * 100) : 0;
                            const impacto = u.valApresentado > 0 ? (u.valGlosado / u.valApresentado * 100) : 0;
                            return [
                                i + 1,
                                this.cleanPCL(u.nome),
                                this.formatN(u.qtdGlosada),
                                this.formatM(u.valGlosado),
                                this.formatP(pct),
                                this.formatP(impacto)
                            ];
                        });

                        doc.autoTable({
                            startY: y,
                            margin: { left: margin, right: margin },
                            head: [['#', 'Unidade', 'Qtd. Glosada', 'Valor Glosado', '% da Glosa Total', 'Impacto (%)']],
                            body: rowsGlos,
                            styles: { fontSize: 7.5, halign: 'center', lineWidth: 0, textColor: 0 },
                            headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold', halign: 'center' },
                            columnStyles: {
                                0: { halign: 'center', fontStyle: 'bold', cellWidth: 10 },
                                1: { halign: 'left', cellWidth: 110 }
                            },
                            alternateRowStyles: { fillColor: [235, 240, 246] },
                            didDrawPage: data => this.drawTableCard(doc, data, 'DETALHAMENTO DE GLOSAS POR UNIDADE')
                        });

                        y = doc.lastAutoTable.finalY + 8;
                        currentPageHasContent = true;
                    }
                }

                // ── AUDITORIA INTELIGENTE ──
                const chkAuditoria = document.getElementById('chkAuditoria')?.checked ?? true;
                if (chkAuditoria) {
                    const alertas = gerarAlertasAuditoria(d);
                    if (alertas.length > 0) {
                        if (!hasPage4Content) { ensureNewPage(); hasPage4Content = true; }
                        else if (y > pageH - 45) { doc.addPage(); y = 15; } else { y += 6; }
                        y += 10;

                        const rowsAudit = alertas.map(a => [
                            a.severidadeLabel,
                            a.tipo,
                            a.unidade || '—',
                            a.competencia || d.competencia || '—',
                            a.descricao,
                            a.valor > 0 ? this.formatM(a.valor) : '—'
                        ]);

                        doc.autoTable({
                            startY: y,
                            margin: { left: margin, right: margin },
                            head: [['Severidade', 'Tipo', 'Unidade', 'Competência', 'Descrição', 'Valor Impactado']],
                            body: rowsAudit,
                            styles: { fontSize: 7, halign: 'center', lineWidth: 0, textColor: 0 },
                            headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold', halign: 'center' },
                            columnStyles: {
                                0: { halign: 'center', fontStyle: 'bold', cellWidth: 25 },
                                1: { halign: 'left', cellWidth: 35 },
                                2: { halign: 'left', cellWidth: 45 },
                                4: { halign: 'left', cellWidth: 80 }
                            },
                            alternateRowStyles: { fillColor: [235, 240, 246] },
                            didDrawPage: data => this.drawTableCard(doc, data, 'REGISTRO DE OCORRÊNCIAS AUDITADAS')
                        });

                        y = doc.lastAutoTable.finalY + 8;
                        currentPageHasContent = true;
                    }
                }

                // ── REGULAÇÃO (SCAAR) ──
                const chkRegulacao = document.getElementById('chkRegulacao')?.checked ?? true;
                if (chkRegulacao && d.unidades.length > 0) {
                    if (!hasPage4Content) { ensureNewPage(); hasPage4Content = true; }
                    else if (y > pageH - 45) { doc.addPage(); y = 15; } else { y += 6; }
                    y += 10;

                    const rowsReg = [...d.unidades]
                        .sort((a,b) => b.qtdAprovada - a.qtdAprovada)
                        .slice(0, 15)
                        .map(u => {
                            const meta = Math.round(u.qtdApresentada * 1.02);
                            const exec = u.qtdAprovada > 0 ? (u.qtdAprovada / meta * 100) : 0;
                            const diff = u.qtdAprovada - meta;
                            const label = exec >= 98 ? 'Meta Atingida' : exec >= 95 ? 'Parcial' : 'Abaixo';
                            return [
                                this.cleanPCL(u.nome),
                                this.formatN(meta),
                                this.formatN(u.qtdAprovada),
                                this.formatP(exec),
                                (diff >= 0 ? '+' : '') + this.formatN(diff),
                                label
                            ];
                        });

                    doc.autoTable({
                        startY: y,
                        margin: { left: margin, right: margin },
                        head: [['Unidade', 'Produção Esperada', 'Produção Realizada', '% Execução', 'Diferença', 'Status Regulação']],
                        body: rowsReg,
                        styles: { fontSize: 7.5, halign: 'center', lineWidth: 0, textColor: 0 },
                        headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold', halign: 'center' },
                        columnStyles: {
                            0: { halign: 'left', cellWidth: 100 }
                        },
                        alternateRowStyles: { fillColor: [235, 240, 246] },
                        didDrawPage: data => this.drawTableCard(doc, data, 'MONITORAMENTO DE PRODUÇÃO VS META')
                    });

                    y = doc.lastAutoTable.finalY + 8;
                    currentPageHasContent = true;
                }

                // ── RODAPÉ ──
                const totalPages = doc.internal.getNumberOfPages();
                for (let i = 1; i <= totalPages; i++) {
                    doc.setPage(i);
                    this.addFooter(doc, pageW, pageH, i, totalPages, scaarImg);
                }

                // A logomarca já é adicionada dinamicamente na página 1 no drawUnifiedHeader

                doc.save(`ARGOS_Executivo_${d.municipio || (APP_STATE.data && APP_STATE.data.municipio) || 'Bacabal'}_${d.ano || '2026'}.pdf`);
                showToast('✅ PDF exportado com sucesso!', 'success');
            } catch(e) {
                console.error(e);
                showToast('❌ Erro ao gerar PDF: ' + e.message, 'error');
            } finally {
                hideLoading();
            }
        }, 800);
    },

    exportTetoMacPDF() {
        const d = APP_STATE.filteredData || APP_STATE.data;
        const portaria = APP_STATE.portariaData;
        if (!d || !portaria) { showToast('⚠️ Carregue os dados e a Portaria antes de exportar.', 'warn'); return; }

        showLoading('Gerando PDF do Teto MAC...');

        setTimeout(async () => {
            try {
                const scaarImg = window.SCAAR_LOGO_BASE64 || null;
                const { jsPDF } = window.jspdf;

                const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
                const pageW = doc.internal.pageSize.getWidth();
                const pageH = doc.internal.pageSize.getHeight();
                const margin = 14;
                let y = 36; // Header usa até y=30 mais ou menos

                await this.drawUnifiedHeader(doc, d, 'Dashboard Executivo — Monitoramento do Teto MAC', pageW, margin);

                // Elemento a ser capturado
                const element = document.getElementById('tetoMacSection');
                if (!element) throw new Error('Seção do Teto MAC não encontrada.');

                // Esconder o botão de PDF temporariamente para não sair na impressão
                const btnExport = document.getElementById('btnExportTetoMacPDF');
                const btnDisplayOriginal = btnExport ? btnExport.style.display : '';
                if (btnExport) btnExport.style.display = 'none';

                // Esconder a tabela temporariamente para não sair na pág 1
                const tableContainer = document.querySelector('#tetoMacSection .table-container');
                const tcDisplayOriginal = tableContainer ? tableContainer.style.display : '';
                if (tableContainer) tableContainer.style.display = 'none';

                // Aumentar a altura do gráfico temporariamente para preencher melhor o PDF
                const chartCanvas = document.getElementById('chartTetoMacMensal');
                const chartDiv = chartCanvas ? chartCanvas.parentElement : null;
                const originalHeight = chartDiv ? chartDiv.style.height : '';
                let chartInstance = null;
                if (window.Chart) {
                    chartInstance = Chart.getChart('chartTetoMacMensal');
                }
                
                if (chartDiv) {
                    chartDiv.style.height = '500px';
                    if (chartInstance) {
                        chartInstance.resize();
                        chartInstance.update('none');
                    }
                }

                // Capturar com html2canvas
                const canvas = await html2canvas(element, { 
                    scale: 3, 
                    useCORS: true, 
                    backgroundColor: '#ffffff' 
                });

                // Restaurar estado original
                if (btnExport) btnExport.style.display = btnDisplayOriginal;
                if (tableContainer) tableContainer.style.display = tcDisplayOriginal;
                if (chartDiv) {
                    chartDiv.style.height = originalHeight || '280px';
                    if (chartInstance) {
                        chartInstance.resize();
                        chartInstance.update('none');
                    }
                }

                const imgData = canvas.toDataURL('image/jpeg', 0.98);

                // Calcular dimensões para caber na página (descontando header e footer)
                const maxW = pageW - margin * 2;
                const maxH = pageH - y - 15; // 15mm para o footer

                let imgW = maxW;
                let imgH = (canvas.height / canvas.width) * imgW;

                // Redimensionar caso passe da altura máxima (para caber em 1 página)
                if (imgH > maxH) {
                    imgH = maxH;
                    imgW = (canvas.width / canvas.height) * imgH;
                }

                // Centralizar horizontalmente se ficou menor que a largura máxima
                const xPos = margin + (maxW - imgW) / 2;

                doc.addImage(imgData, 'JPEG', xPos, y, imgW, imgH);

                // Adicionar o rodapé da página 1
                this.addFooter(doc, pageW, pageH, 1, 2, scaarImg);

                // ==== PÁGINA 2: Tabela Analítica ====
                doc.addPage('a4', 'landscape');
                await this.drawUnifiedHeader(doc, d, 'Detalhamento Mensal da Execução do Teto MAC', pageW, margin);
                
                const tableRows = [];
                const tRowsDOM = document.querySelectorAll('#tbodyTetoMacMensal tr');
                tRowsDOM.forEach(tr => {
                    const tds = tr.querySelectorAll('td');
                    if (tds.length === 8) {
                        tableRows.push([
                            tds[0].textContent.trim(),
                            tds[1].textContent.trim(),
                            tds[2].textContent.trim(),
                            tds[3].textContent.trim(),
                            tds[4].textContent.trim(),
                            tds[5].textContent.trim(),
                            tds[6].textContent.trim(),
                            tds[7].textContent.trim().replace(/^(🟢|🟡|🔴|⚠️|✔)\s*/, '') // Limpar emoji do texto
                        ]);
                    } else if (tds.length === 1) { // Linha "Sem dados"
                        tableRows.push([{ content: tds[0].textContent.trim(), colSpan: 8, styles: { halign: 'center' } }]);
                    }
                });

                doc.autoTable({
                    startY: 36,
                    margin: { left: margin, right: margin },
                    head: [['Competência', 'Teto Mensal', 'Produção Aprovada', 'Situação do Mês', 'Saldo Acumulado MAC', '% Alcance', 'Prod. Acumulada', 'Status']],
                    body: tableRows,
                    styles: { fontSize: 8, halign: 'center', lineWidth: 0.1, lineColor: [200, 200, 200], textColor: 0 },
                    headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold', halign: 'center' },
                    columnStyles: {
                        0: { fontStyle: 'bold', halign: 'center' },
                        1: { halign: 'center' },
                        2: { halign: 'center' },
                        3: { halign: 'center', fontStyle: 'bold' },
                        4: { halign: 'center', fontStyle: 'bold' },
                        5: { halign: 'center', fontStyle: 'bold' },
                        6: { halign: 'center' },
                        7: { halign: 'center', fontStyle: 'bold' }
                    },
                    alternateRowStyles: { fillColor: [245, 248, 250] },
                    didParseCell: data => {
                        // Colorir a coluna de Situação (3), Saldo Acumulado MAC (4) e Status (7)
                        if (data.section === 'body') {
                            const txt = data.cell.raw || '';
                            if (data.column.index === 3 || data.column.index === 4) {
                                if (String(txt).includes('-')) data.cell.styles.textColor = [220, 38, 38];
                                else if (String(txt).includes('+') || String(txt).replace(/[R$\s.,]/g,'') !== '00') data.cell.styles.textColor = [5, 150, 105];
                            }
                            if (data.column.index === 7) {
                                if (String(txt).includes('BAIXO') || String(txt).includes('EXTRAPOLOU')) data.cell.styles.textColor = [220, 38, 38];
                                else if (String(txt).includes('MODERADO')) data.cell.styles.textColor = [217, 119, 6];
                                else data.cell.styles.textColor = [5, 150, 105];
                            }
                        }
                    }
                });

                this.addFooter(doc, pageW, pageH, 2, 2, scaarImg);

                doc.save(`ARGOS_Teto_MAC_${d.municipio || (APP_STATE.data && APP_STATE.data.municipio) || 'Bacabal'}_${d.ano || '2026'}.pdf`);
                showToast('✅ PDF do Teto MAC exportado com sucesso!', 'success');
            } catch(e) {
                console.error(e);
                showToast('❌ Erro ao gerar PDF do Teto MAC: ' + e.message, 'error');
            } finally {
                hideLoading();
            }
        }, 800);
    },

    async drawUnifiedHeader(doc, d, title, pageW, margin) {
        // Obter Município e UF com segurança
        const mun = d.municipio || (window.datasets && window.datasets[0] && window.datasets[0].municipio) || (APP_STATE.data && APP_STATE.data.municipio) || 'Bacabal';
        const uf = d.uf || (window.datasets && window.datasets[0] && window.datasets[0].uf) || (APP_STATE.data && APP_STATE.data.uf) || 'MA';

        // Obter Filtros Ativos
        const f = APP_STATE.filters;
        let activeFilters = [];
        if (f.unidade && f.unidade !== 'all') {
            const el = document.getElementById('filterUnidade');
            const name = el ? el.options[el.selectedIndex]?.text : f.unidade;
            activeFilters.push(`Unidade: ${name}`);
        }
        if (f.mes && f.mes !== 'all') {
            const el = document.getElementById('filterMes');
            const name = el ? el.options[el.selectedIndex]?.text : f.mes;
            activeFilters.push(`Mês: ${name}`);
        }
        if (f.ano && f.ano !== 'all') {
            activeFilters.push(`Ano: ${f.ano}`);
        }
        if (f.procedimento && f.procedimento !== 'all') {
            activeFilters.push(`Procedimento: ${f.procedimento}`);
        }
        if (f.cbo && f.cbo !== 'all') {
            activeFilters.push(`CBO: ${f.cbo}`);
        }
        if (f.status && f.status !== 'all') {
            activeFilters.push(`Status: ${f.status}`);
        }
        const filterText = activeFilters.length > 0 ? ` | Filtro Ativo: ${activeFilters.join(', ')}` : '';

        // Bloco principal
        doc.setFillColor(37, 99, 235); // #2563EB Modern Blue
        doc.roundedRect(margin, 10, pageW - 2*margin, 20, 2, 2, 'F');
        
        // Placeholder da logo
        doc.setFillColor(59, 130, 246); // Lighter blue to give a modern translucent feel
        doc.roundedRect(margin + 4, 12, 30, 16, 2, 2, 'F');
        
        // Títulos
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(title.length > 55 ? 11 : 13);
        doc.setTextColor(255, 255, 255);
        doc.text(title.toUpperCase(), margin + 40, 16.5);
        
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(219, 234, 254);
        doc.text(`Sistema: ARGOS FPA via Síntese SIA/SUS | Município: ${mun} - ${uf}`, margin + 40, 21.5);
        doc.text(`Competência: ${d.competencia}${filterText}`, margin + 40, 26);

        // Adicionar logo ativa
        const customLogo = localStorage.getItem('argos_custom_logo');
        if (customLogo) {
            await new Promise((resolve) => {
                const img = new Image();
                img.src = customLogo;
                img.onload = () => {
                    let targetW = 28;
                    let targetH = 28 * (img.height / img.width);
                    if (targetH > 14) {
                        targetH = 14;
                        targetW = 14 * (img.width / img.height);
                    }
                    doc.addImage(img, 'PNG', margin + 4 + (30 - targetW)/2, 12 + (16 - targetH)/2, targetW, targetH);
                    resolve();
                };
                img.onerror = () => resolve();
            });
        }
    },

    exportProcedimentosPDF() {
        const d = APP_STATE.filteredData || APP_STATE.data;
        if (!d) { showToast('⚠️ Carregue os dados antes de exportar.', 'warn'); return; }

        showLoading('Gerando PDF de Procedimentos...');

        setTimeout(async () => {
            try {
                const scaarImg = window.SCAAR_LOGO_BASE64 || null;
                const { jsPDF } = window.jspdf;

                const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
                const pageW = doc.internal.pageSize.getWidth();
                const pageH = doc.internal.pageSize.getHeight();
                const margin = 14;

                await this.drawUnifiedHeader(doc, d, 'Relatório de Procedimentos Realizados', pageW, margin);

                const rows = [];
                const rowsDOM = document.querySelectorAll('#tableProcedimentos tbody tr.proc-row');
                
                const parseQtd = (str) => parseInt(str.replace(/\./g, '')) || 0;
                const parseMoeda = (str) => parseFloat(str.replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.')) || 0;
                const parsePct = (str) => parseFloat(str.replace('%', '').replace(',', '.')) || 0;

                let totalQtd = 0;
                let totalVal = 0;
                let totalPct = 0;

                rowsDOM.forEach((row) => {
                    if (row.style.display === 'none') return;
                    
                    const cells = row.querySelectorAll('td');
                    if (cells.length >= 7) {
                        const qtd = parseQtd(cells[3].textContent.trim());
                        const val = parseMoeda(cells[4].textContent.trim());
                        const pct = parsePct(cells[6].textContent.trim());

                        totalQtd += qtd;
                        totalVal += val;
                        totalPct += pct;

                        rows.push([
                            cells[0].textContent.trim(),
                            cells[1].textContent.trim().replace(/[\u2011\s]+/g, '-'),
                            cells[2].textContent.trim(),
                            cells[3].textContent.trim(),
                            cells[4].textContent.trim(),
                            cells[5].textContent.trim(),
                            cells[6].textContent.trim(),
                        ]);
                    }
                });

                // Adicionar linha de total
                rows.push([
                    'TOTAL',
                    '',
                    '',
                    totalQtd.toLocaleString('pt-BR'),
                    'R$ ' + totalVal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
                    '',
                    totalPct.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%'
                ]);

                doc.autoTable({
                    startY: 45,
                    margin: { left: margin, right: margin },
                    head: [['#', 'Código', 'Descrição', 'Qtd. Aprovada', 'Valor Aprovado (R$)', 'Valor Unitário (R$)', '% do Total']],
                    body: rows,
                    styles: { fontSize: 7.5, halign: 'center', lineWidth: 0, textColor: 0 },
                    headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold', halign: 'center' },
                    columnStyles: {
                        0: { halign: 'center', fontStyle: 'bold', cellWidth: 18 },
                        1: { halign: 'center', cellWidth: 30 },
                        2: { halign: 'left', cellWidth: 110 }
                    },
                    alternateRowStyles: { fillColor: [235, 240, 246] },
                    didParseCell: data => {
                        if (data.row.index === rows.length - 1) {
                            data.cell.styles.fillColor = [30, 64, 175];
                            data.cell.styles.textColor = 255;
                            data.cell.styles.fontStyle = 'bold';
                            data.cell.styles.fontSize = 9.5;
                        }
                    },
                    didDrawPage: data => this.drawTableCard(doc, data, 'TODOS OS PROCEDIMENTOS')
                });

                const totalPages = doc.internal.getNumberOfPages();
                for (let i = 1; i <= totalPages; i++) {
                    doc.setPage(i);
                    this.addFooter(doc, pageW, pageH, i, totalPages, scaarImg);
                }

                doc.save(`ARGOS_Procedimentos_${d.municipio || (APP_STATE.data && APP_STATE.data.municipio) || 'Bacabal'}_${d.ano || '2026'}.pdf`);
                showToast('✅ PDF de Procedimentos exportado com sucesso!', 'success');
            } catch(e) {
                console.error(e);
                showToast('❌ Erro ao gerar PDF de Procedimentos: ' + e.message, 'error');
            } finally {
                hideLoading();
            }
        }, 800);
    },

    exportCboPDF() {
        const d = APP_STATE.filteredData || APP_STATE.data;
        if (!d) { showToast('⚠️ Carregue os dados antes de exportar.', 'warn'); return; }

        showLoading('Gerando PDF de Profissionais...');

        setTimeout(async () => {
            try {
                const scaarImg = window.SCAAR_LOGO_BASE64 || null;
                const { jsPDF } = window.jspdf;

                const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
                const pageW = doc.internal.pageSize.getWidth();
                const pageH = doc.internal.pageSize.getHeight();
                const margin = 14;

                await this.drawUnifiedHeader(doc, d, 'Relatório de Produção Consolidada por Profissão (CBO)', pageW, margin);

                const rows = [];
                const rowsDOM = document.querySelectorAll('#tableCbo tbody tr.cbo-row');
                
                const parseQtd = (str) => parseInt(str.replace(/\./g, '')) || 0;
                const parseMoeda = (str) => parseFloat(str.replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.')) || 0;
                const parsePct = (str) => parseFloat(str.replace('%', '').replace(',', '.')) || 0;

                let totalQtd = 0;
                let totalVal = 0;
                let totalPct = 0;

                rowsDOM.forEach((row) => {
                    if (row.style.display === 'none') return;
                    
                    const cells = row.querySelectorAll('td');
                    if (cells.length >= 6) {
                        const qtd = parseQtd(cells[3].textContent.trim());
                        const val = parseMoeda(cells[4].textContent.trim());
                        const pct = parsePct(cells[5].textContent.trim());

                        totalQtd += qtd;
                        totalVal += val;
                        totalPct += pct;

                        rows.push([
                            cells[0].textContent.trim(),
                            cells[1].textContent.trim(),
                            cells[2].textContent.trim(),
                            cells[3].textContent.trim(),
                            cells[4].textContent.trim(),
                            cells[5].textContent.trim(),
                        ]);
                    }
                });

                // Adicionar linha de total
                rows.push([
                    'TOTAL',
                    '',
                    '',
                    totalQtd.toLocaleString('pt-BR'),
                    'R$ ' + totalVal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
                    totalPct.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%'
                ]);

                doc.autoTable({
                    startY: 45,
                    margin: { left: margin, right: margin },
                    head: [['#', 'Código CBO', 'Profissão / Especialidade', 'Qtd. Aprovada', 'Valor Aprovado (R$)', '% do Faturamento']],
                    body: rows,
                    styles: { fontSize: 7.5, halign: 'center', lineWidth: 0, textColor: 0 },
                    headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold', halign: 'center' },
                    columnStyles: {
                        0: { halign: 'center', fontStyle: 'bold', cellWidth: 18 },
                        1: { halign: 'center', cellWidth: 35 },
                        2: { halign: 'left', cellWidth: 120 }
                    },
                    alternateRowStyles: { fillColor: [235, 240, 246] },
                    didParseCell: data => {
                        if (data.row.index === rows.length - 1) {
                            data.cell.styles.fillColor = [30, 64, 175];
                            data.cell.styles.textColor = 255;
                            data.cell.styles.fontStyle = 'bold';
                            data.cell.styles.fontSize = 9.5;
                        }
                    },
                    didDrawPage: data => this.drawTableCard(doc, data, 'OCUPAÇÕES E PROFISSÕES (CBO)')
                });

                const totalPages = doc.internal.getNumberOfPages();
                for (let i = 1; i <= totalPages; i++) {
                    doc.setPage(i);
                    this.addFooter(doc, pageW, pageH, i, totalPages, scaarImg);
                }

                doc.save(`ARGOS_Profissionais_${d.municipio || (APP_STATE.data && APP_STATE.data.municipio) || 'Bacabal'}_${d.ano || '2026'}.pdf`);
                showToast('✅ PDF de Profissionais exportado com sucesso!', 'success');
            } catch(e) {
                console.error(e);
                showToast('❌ Erro ao gerar PDF de Profissionais: ' + e.message, 'error');
            } finally {
                hideLoading();
            }
        }, 800);
    },

    exportUnidadesPDF() {
        const d = APP_STATE.filteredData || APP_STATE.data;
        if (!d) { showToast('⚠️ Carregue os dados antes de exportar.', 'warn'); return; }

        showLoading('Gerando PDF de Unidades...');

        setTimeout(async () => {
            try {
                const scaarImg = window.SCAAR_LOGO_BASE64 || null;
                const { jsPDF } = window.jspdf;

                const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
                const pageW = doc.internal.pageSize.getWidth();
                const pageH = doc.internal.pageSize.getHeight();
                const margin = 14;

                await this.drawUnifiedHeader(doc, d, 'Relatório de Unidades Executoras', pageW, margin);

                const rows = [];
                const rowsDOM = document.querySelectorAll('#tableUnidades tbody tr');
                
                const parseQtd = (str) => parseInt(str.replace(/\./g, '')) || 0;
                const parseMoeda = (str) => parseFloat(str.replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.')) || 0;

                let totalQtd = 0;
                let totalVal = 0;

                rowsDOM.forEach((row) => {
                    if (row.style.display === 'none') return;
                    
                    const cells = row.querySelectorAll('td');
                    if (cells.length >= 6) {
                        const qtd = parseQtd(cells[2].textContent.trim());
                        const val = parseMoeda(cells[3].textContent.trim());
                        
                        // Remover emojis e caracteres estranhos do status
                        const cleanStatusText = cells[5].textContent.trim()
                            .replace(/[✅✔️⚠️❌]+/g, '')
                            .trim();

                        totalQtd += qtd;
                        totalVal += val;

                        rows.push([
                            cells[0].textContent.trim(),
                            cells[1].textContent.trim(),
                            cells[2].textContent.trim(),
                            cells[3].textContent.trim(),
                            cells[4].textContent.trim(),
                            cleanStatusText,
                        ]);
                    }
                });

                // Adicionar linha de total
                rows.push([
                    'TOTAL',
                    '',
                    totalQtd.toLocaleString('pt-BR'),
                    'R$ ' + totalVal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
                    '',
                    ''
                ]);

                const rowCount = rows.length; // Inclui a linha de total
                const useCompactLayout = rowCount <= 25;
                const dynamicFontSize = useCompactLayout ? 7.0 : 7.5;
                const dynamicCellPadding = useCompactLayout ? 1.6 : 2.5;

                doc.autoTable({
                    startY: 45,
                    margin: { left: margin, right: margin },
                    head: [['#', 'Unidade de Saúde', 'Qtd. Aprovada', 'Valor Aprovado (R$)', '% Aprovação', 'Status']],
                    body: rows,
                    styles: { 
                        fontSize: dynamicFontSize, 
                        cellPadding: dynamicCellPadding, 
                        halign: 'center', 
                        lineWidth: 0, 
                        textColor: 0 
                    },
                    headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold', halign: 'center' },
                    columnStyles: {
                        0: { halign: 'center', fontStyle: 'bold', cellWidth: 18 },
                        1: { halign: 'left', cellWidth: 120 }
                    },
                    alternateRowStyles: { fillColor: [235, 240, 246] },
                    didParseCell: data => {
                        if (data.row.index === rows.length - 1) {
                            data.cell.styles.fillColor = [30, 64, 175];
                            data.cell.styles.textColor = 255;
                            data.cell.styles.fontStyle = 'bold';
                            data.cell.styles.fontSize = 9.5;
                        }
                    },
                    didDrawPage: data => this.drawTableCard(doc, data, 'PAINEL DE UNIDADES EXECUTORAS')
                });

                const totalPages = doc.internal.getNumberOfPages();
                for (let i = 1; i <= totalPages; i++) {
                    doc.setPage(i);
                    this.addFooter(doc, pageW, pageH, i, totalPages, scaarImg);
                }

                doc.save(`ARGOS_Unidades_${d.municipio || (APP_STATE.data && APP_STATE.data.municipio) || 'Bacabal'}_${d.ano || '2026'}.pdf`);
                showToast('✅ PDF de Unidades exportado com sucesso!', 'success');
            } catch(e) {
                console.error(e);
                showToast('❌ Erro ao gerar PDF de Unidades: ' + e.message, 'error');
            } finally {
                hideLoading();
            }
        }, 800);
    },

    exportEficienciaPDF() {
        const d = APP_STATE.filteredData || APP_STATE.data;
        if (!d) { showToast('⚠️ Carregue os dados antes de exportar.', 'warn'); return; }

        showLoading('Gerando PDF de Eficiência...');

        setTimeout(async () => {
            try {
                const scaarImg = window.SCAAR_LOGO_BASE64 || null;
                const { jsPDF } = window.jspdf;

                const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
                const pageW = doc.internal.pageSize.getWidth();
                const pageH = doc.internal.pageSize.getHeight();
                const margin = 14;

                await this.drawUnifiedHeader(doc, d, 'Relatório de Eficiência de Faturamento por Unidade', pageW, margin);

                const rows = [];
                const rowsDOM = document.querySelectorAll('#tableEficiencia tbody tr');
                
                let totalQtdApres = 0, totalQtdAprov = 0, totalValApres = 0, totalValAprov = 0, totalGlosado = 0;

                const parseQtd = (str) => parseInt(str.replace(/\./g, '')) || 0;
                const parseMoeda = (str) => parseFloat(str.replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.')) || 0;

                rowsDOM.forEach((row) => {
                    if (row.style.display === 'none') return;
                    
                    const cells = row.querySelectorAll('td');
                    if (cells.length >= 10) {
                        const qtdApres = parseQtd(cells[2].textContent.trim());
                        const qtdAprov = parseQtd(cells[3].textContent.trim());
                        const valApres = parseMoeda(cells[5].textContent.trim());
                        const valAprov = parseMoeda(cells[6].textContent.trim());
                        const glosado = parseMoeda(cells[8].textContent.trim());
                        
                        const cleanStatusText = cells[9].textContent.trim()
                            .replace(/[✅✔️⚠️❌]+/g, '')
                            .trim();

                        const strongEl = cells[1].querySelector('strong');
                        let nameOnly = strongEl ? strongEl.textContent.trim() : cells[1].textContent.trim().split('·')[0].trim();
                        let cnesMatch = cells[1].textContent.match(/CNES:\s*(\d+)/i);
                        let cnes = cnesMatch ? cnesMatch[1] : '';

                        totalQtdApres += qtdApres;
                        totalQtdAprov += qtdAprov;
                        totalValApres += valApres;
                        totalValAprov += valAprov;
                        totalGlosado += glosado;

                        rows.push([
                            cells[0].textContent.trim(),
                            cnes,
                            nameOnly,
                            cells[2].textContent.trim(),
                            cells[3].textContent.trim(),
                            cells[4].textContent.trim(),
                            cells[5].textContent.trim(),
                            cells[6].textContent.trim(),
                            cells[7].textContent.trim(),
                            cells[8].textContent.trim(),
                            cleanStatusText
                        ]);
                    }
                });

                // Adicionar linha de total
                const totalPctQtd = totalQtdApres > 0 ? (totalQtdAprov / totalQtdApres * 100) : 0;
                const totalPctFin = totalValApres > 0 ? (totalValAprov / totalValApres * 100) : 0;

                rows.push([
                    { content: 'TOTAL', colSpan: 3, styles: { halign: 'center' } },
                    totalQtdApres.toLocaleString('pt-BR'),
                    totalQtdAprov.toLocaleString('pt-BR'),
                    totalPctQtd.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%',
                    'R$ ' + totalValApres.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
                    'R$ ' + totalValAprov.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
                    totalPctFin.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%',
                    'R$ ' + totalGlosado.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
                    ''
                ]);

                const rowCount = rows.length;
                const useCompactLayout = rowCount > 15;
                const dynamicFontSize = rowCount > 25 ? 6.0 : (useCompactLayout ? 6.5 : 7.5);
                const dynamicCellPadding = rowCount > 25 ? 0.8 : (useCompactLayout ? 1.0 : 2.0);

                doc.autoTable({
                    startY: 45,
                    margin: { left: margin, right: margin },
                    head: [['RANK', 'CNES', 'Unidade de Saúde', 'Qtd. Apresentada', 'Qtd. Aprovada', '% Qtd.', 'Valor Apresentado', 'Valor Aprovado', '% Fin.', 'Glosa (R$)', 'Status']],
                    body: rows,
                    styles: { 
                        fontSize: dynamicFontSize, 
                        cellPadding: dynamicCellPadding, 
                        halign: 'center', 
                        lineWidth: 0, 
                        textColor: 0 
                    },
                    headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold', halign: 'center' },
                    columnStyles: {
                        0: { cellWidth: 12, fontStyle: 'bold' },
                        1: { cellWidth: 16 },
                        2: { }, // Auto width
                        3: { cellWidth: 22 },
                        4: { cellWidth: 22 },
                        5: { cellWidth: 15 },
                        6: { cellWidth: 26 },
                        7: { cellWidth: 26 },
                        8: { cellWidth: 15 },
                        9: { cellWidth: 20 },
                        10: { cellWidth: 22, fontStyle: 'bold' }
                    },
                    alternateRowStyles: { fillColor: [235, 240, 246] },
                    didParseCell: data => {
                        if (data.row.index === rows.length - 1) {
                            data.cell.styles.fillColor = [30, 64, 175];
                            data.cell.styles.textColor = 255;
                            data.cell.styles.fontStyle = 'bold';
                            data.cell.styles.fontSize = useCompactLayout ? 10.0 : 11.5;
                        } else if (data.column.index === 10 && data.section === 'body') {
                            const val = data.cell.raw;
                            if (val === 'EXCELENTE') { data.cell.styles.textColor = [27, 94, 32]; data.cell.styles.fontStyle = 'bold'; }
                            else if (val === 'BOA') { data.cell.styles.textColor = [2, 119, 189]; data.cell.styles.fontStyle = 'bold'; }
                            else if (val === 'REGULAR') { data.cell.styles.textColor = [230, 81, 0]; data.cell.styles.fontStyle = 'bold'; }
                            else if (val === 'CRITICA') { data.cell.styles.textColor = [183, 28, 28]; data.cell.styles.fontStyle = 'bold'; }
                        }
                    },
                    didDrawPage: data => this.drawTableCard(doc, data, 'EFICIÊNCIA DE FATURAMENTO POR UNIDADE')
                });

                const totalPages = doc.internal.getNumberOfPages();
                for (let i = 1; i <= totalPages; i++) {
                    doc.setPage(i);
                    this.addFooter(doc, pageW, pageH, i, totalPages, scaarImg);
                }

                doc.save(`ARGOS_Eficiencia_${d.municipio || (APP_STATE.data && APP_STATE.data.municipio) || 'Bacabal'}_${d.ano || '2026'}.pdf`);
                showToast('✅ PDF de Eficiência exportado com sucesso!', 'success');
            } catch(e) {
                console.error(e);
                showToast('❌ Erro ao gerar PDF de Eficiência: ' + e.message, 'error');
            } finally {
                hideLoading();
            }
        }, 800);
    },

    drawCards(doc, d, y, pageW, margin) {
        const gap = 4;
        const totalW = pageW - 2 * margin;
        const rowHeight = 24;
        const r = d.resumo;

        // --- ROW 1: 4 Cards ---
        const r1Cards = 4;
        const cardW1 = (totalW - (r1Cards - 1) * gap) / r1Cards;
        const cards1 = [
            { 
                lbl: 'PROCEDIMENTOS\nAPROVADOS', val: this.formatN(r.qtdAprovada), 
                trend: `${this.formatP(r.pctAprovacaoQtd)} de aprovação`, trendColor: [46, 125, 50],
                bc: [27, 94, 32], icbg: [220, 252, 231], iconType: 'check'
            },
            { 
                lbl: 'PROCEDIMENTOS\nAPRESENTADOS', val: this.formatN(r.qtdApresentada), 
                trend: 'Total acumulado', trendColor: [100, 116, 139],
                bc: [37, 99, 235], icbg: [219, 234, 254], iconType: 'list'
            },
            { 
                lbl: 'UNIDADES\nPRODUTORAS', val: d.unidades.length.toString(), 
                trend: `${d.municipio || (APP_STATE.data && APP_STATE.data.municipio) || 'Bacabal'} / ${d.uf || (APP_STATE.data && APP_STATE.data.uf) || 'MA'}`, trendColor: [100, 116, 139],
                bc: [67, 56, 202], icbg: [224, 231, 255], iconType: 'building'
            },
            { 
                lbl: 'TAXA DE GLOSA', val: this.formatP(r.pctGlosaQtd), 
                trend: '% de procedimentos glosados', trendColor: [220, 38, 38], valColor: [220, 38, 38],
                bc: [220, 38, 38], icbg: [254, 226, 226], iconType: 'percent'
            }
        ];

        // --- ROW 2: 5 Cards ---
        const y2 = y + rowHeight + gap;
        const r2Cards = 5;
        const cardW2 = (totalW - (r2Cards - 1) * gap) / r2Cards;
        const cards2 = [
            { 
                lbl: 'VALOR APROVADO', val: this.formatM(r.valAprovado), 
                trend: 'Faturamento líquido', trendColor: [100, 116, 139], valColor: [15, 23, 42],
                bc: [22, 163, 74], icbg: [220, 252, 231], iconType: 'money'
            },
            { 
                lbl: 'VALOR APRESENTADO', val: this.formatM(r.valApresentado), 
                trend: 'Total bruto produzido', trendColor: [100, 116, 139], valColor: [15, 23, 42],
                bc: [37, 99, 235], icbg: [219, 234, 254], iconType: 'money'
            },
            { 
                lbl: 'TAXA DE APROVAÇÃO', val: this.formatP(r.pctAprovacaoQtd), 
                trendColor: [100, 116, 139], valColor: [22, 163, 74],
                bc: [13, 148, 136], icbg: [204, 251, 241], iconType: 'percent', isProg: true
            },
            { 
                lbl: 'PROCEDIMENTOS\nGLOSADOS', val: this.formatN(r.qtdGlosada), 
                trend: `${this.formatP(r.pctGlosaQtd)} de glosa`, trendColor: [234, 88, 12], valColor: [15, 23, 42],
                bc: [220, 38, 38], icbg: [254, 226, 226], iconType: 'cross'
            },
            { 
                lbl: 'VALOR GLOSADO', val: this.formatM(r.valGlosado), 
                trend: 'Valor não aprovado', trendColor: [100, 116, 139], valColor: [15, 23, 42],
                bc: [234, 88, 12], icbg: [255, 237, 213], iconType: 'money'
            }
        ];

        const drawCard = (c, i, cx, cy, cardW) => {
            doc.setDrawColor(226, 232, 240);
            doc.setFillColor(255, 255, 255);
            doc.roundedRect(cx, cy, cardW, rowHeight, 3, 3, 'FD');
            
            const icS = 14;
            const icX = cx + 5;
            const icY = cy + (rowHeight - icS) / 2;
            doc.setFillColor(...c.icbg);
            doc.roundedRect(icX, icY, icS, icS, 2.5, 2.5, 'F');
            
            doc.setDrawColor(...c.bc);
            doc.setLineWidth(1.2);
            if (c.iconType === 'list') {
                doc.line(icX + 4, icY + 4.5, icX + 10, icY + 4.5);
                doc.line(icX + 4, icY + 7, icX + 10, icY + 7);
                doc.line(icX + 4, icY + 9.5, icX + 10, icY + 9.5);
            } else if (c.iconType === 'check') {
                doc.line(icX + 3.5, icY + 7.5, icX + 6, icY + 10);
                doc.line(icX + 6, icY + 10, icX + 10.5, icY + 4.5);
            } else if (c.iconType === 'cross') {
                doc.line(icX + 4, icY + 4, icX + 10, icY + 10);
                doc.line(icX + 10, icY + 4, icX + 4, icY + 10);
            } else if (c.iconType === 'building') {
                doc.setLineWidth(1);
                doc.rect(icX + 3.5, icY + 3.5, 7, 7.5);
                doc.rect(icX + 5.5, icY + 8, 3, 3);
            } else if (c.iconType === 'percent') {
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(15);
                doc.setTextColor(...c.bc);
                doc.text('%', icX + 7, icY + 10.5, { align: 'center' });
            } else if (c.iconType === 'money') {
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(11);
                doc.setTextColor(...c.bc);
                doc.text('R$', icX + 7, icY + 9.5, { align: 'center' });
            }
            
            const textX = icX + icS + 3.5;
            
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(6.5);
            doc.setTextColor(100, 116, 139);
            const isMultiLine = c.lbl.includes('\n');
            doc.text(c.lbl, textX, cy + (isMultiLine ? 6 : 7.5));
            
            doc.setFontSize(cardW < 60 ? 10 : 13);
            doc.setTextColor(...(c.valColor || [15, 23, 42]));
            doc.text(c.val, textX, cy + 15.5);
            
            if (c.isProg) {
                doc.setFillColor(226, 232, 240);
                doc.roundedRect(textX, cy + 18.5, cardW - (textX - cx) - 5, 2.5, 1, 1, 'F');
                doc.setFillColor(22, 163, 74);
                const pW = (cardW - (textX - cx) - 5) * (r.pctAprovacaoQtd / 100);
                if (pW > 0) doc.roundedRect(textX, cy + 18.5, pW, 2.5, 1, 1, 'F');
            } else {
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(6.5);
                doc.setTextColor(...c.trendColor);
                doc.text(c.trend, textX, cy + 20);
            }
        };

        cards1.forEach((c, i) => drawCard(c, i, margin + i * (cardW1 + gap), y, cardW1));
        cards2.forEach((c, i) => drawCard(c, i, margin + i * (cardW2 + gap), y2, cardW2));

        return y2 + rowHeight + 8;
    },

    addSectionTitle(doc, title, y, pageW) {
        // Not used anymore for tables, kept if needed elsewhere
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(30, 30, 30);
        doc.text(title, pageW / 2, y + 2, { align: 'center' });
    },

    cleanPCL(str) {
        if (typeof str !== 'string') return str;
        return str.replace(/&l1o5\.45C/g, '')
                  .replace(/\(s0p16\.66H/g, '')
                  .replace(/\s{2,}/g, ' ')
                  .replace(/^[-\s]+|[-\s]+$/g, '')
                  .trim();
    },

    drawTableCard(doc, data, title) {
        const isFirst = data.pageNumber === 1;
        
        const sY = data.settings.startY != null ? data.settings.startY : 20;
        let marginTop = 20;
        if (data.settings.margin && data.settings.margin.top != null) {
            marginTop = data.settings.margin.top;
        }

        const startY = isFirst ? sY - 10 : marginTop - 2;
        const endY = (data.cursor && data.cursor.y != null) ? data.cursor.y + 2 : startY + 20;
        const h = Math.max(endY - startY, 5); // Ensure positive height
        
        doc.setDrawColor(226, 232, 240); // slate-200
        doc.setLineWidth(0.5);
        
        let marginL = 14;
        if (data.settings.margin && data.settings.margin.left != null) {
            marginL = data.settings.margin.left;
        }
        
        const pageW = doc.internal.pageSize.getWidth();
        const w = (data.table && data.table.width != null) ? data.table.width : (pageW - marginL * 2);
        
        try {
            doc.roundedRect(marginL - 2, startY, w + 4, h, 3, 3, 'S');
            
            if (isFirst) {
                // Icon
                doc.setFillColor(30, 64, 175); // blue-800
                doc.roundedRect(marginL + 2, sY - 8, 3.5, 3.5, 0.5, 0.5, 'F');
                
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(9);
                doc.setTextColor(30, 41, 59); // slate-800
                doc.text(title, marginL + 8, sY - 5);
            }
        } catch (e) {
            console.error("Error drawing table card:", e, { marginL, startY, w, h, sY });
        }
    },

    addFooter(doc, pageW, pageH, pageNum, totalPages, scaarImg) {
        doc.setFillColor(240, 245, 250);
        doc.rect(0, pageH - 12, pageW, 12, 'F');
        
        if (scaarImg) {
            try {
                // Desenha a logo com 14mm de largura por 7mm de altura
                doc.addImage(scaarImg, 'PNG', 14, pageH - 9.5, 14, 7);
            } catch (e) {
                console.error("Erro ao desenhar logo do rodapé:", e);
            }
        }

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(100, 116, 139);
        
        // Empurra o texto para a direita do logo
        const textX = scaarImg ? 32 : 14;
        doc.text(`Emitido em ${fmt.data()} | ARGOS FPA - Monitoramento Inteligente. Gestão Eficiente. | SCAAR — Controle, Avaliação, Auditoria e Regulação`, textX, pageH - 5);
        doc.text(`Página ${pageNum} de ${totalPages}`, pageW - 14, pageH - 5, { align: 'right' });
    },

    formatN: v => v != null ? v.toLocaleString('pt-BR') : '—',
    formatM: v => v != null ? 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—',
    formatP: v => v != null ? v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%' : '—'
};

/* =========================================================
   EXPORTAÇÃO EXCEL
   ========================================================= */
const ExcelExport = {

    export() {
        const d = window.getReportFilteredData() || APP_STATE.data;
        if (!d) { showToast('⚠️ Carregue os dados antes de exportar.', 'warn'); return; }

        showLoading('Gerando Excel...');

        setTimeout(() => {
            try {
                const wb = XLSX.utils.book_new();

                // ── ABA 1: RESUMO (Resumo Geral KPIs) ──
                const chkResumo = document.getElementById('chkResumo')?.checked ?? true;
                if (chkResumo) {
                    this.addResumo(wb, d);
                }

                // ── ABA 2: FATURAMENTO MENSAL ──
                const chkFaturamento = document.getElementById('chkFaturamento')?.checked ?? true;
                if (chkFaturamento && d.faturamentoMensal.length > 0) {
                    this.addFaturamentoMensal(wb, d);
                }

                // ── ABA 3: UNIDADES & EFICIÊNCIA ──
                const chkEficiencia = document.getElementById('chkEficiencia')?.checked ?? true;
                if (chkEficiencia && d.unidades.length > 0) {
                    this.addUnidades(wb, d);
                    this.addEficiencia(wb, d);
                }

                // ── ABA 4: PROCEDIMENTOS ──
                const chkProcedimentos = document.getElementById('chkProcedimentos')?.checked ?? true;
                if (chkProcedimentos && d.procedimentos.length > 0) {
                    this.addProcedimentos(wb, d);
                }

                // ── ABA CBO: OCUPAÇÕES (CBO) ──
                const chkCbo = document.getElementById('chkCbo')?.checked ?? true;
                if (chkCbo && d.cbos && d.cbos.length > 0) {
                    this.addCbo(wb, d);
                }

                // ── ABA 5: GLOSAS ──
                const chkGlosas = document.getElementById('chkGlosas')?.checked ?? true;
                if (chkGlosas) {
                    this.addGlosas(wb, d);
                }

                // ── ABA 6: AUDITORIA ──
                const chkAuditoria = document.getElementById('chkAuditoria')?.checked ?? true;
                if (chkAuditoria) {
                    this.addAuditoria(wb, d);
                }

                // ── ABA 7: REGULAÇÃO ──
                const chkRegulacao = document.getElementById('chkRegulacao')?.checked ?? true;
                if (chkRegulacao && d.unidades.length > 0) {
                    this.addRegulacao(wb, d);
                }

                XLSX.writeFile(wb, `ARGOS_${d.municipio || (APP_STATE.data && APP_STATE.data.municipio) || 'Bacabal'}_${d.competencia?.replace(/\s/g, '_') || d.ano}.xlsx`);
                showToast('✅ Excel exportado com sucesso!', 'success');
            } catch(e) {
                console.error(e);
                showToast('❌ Erro ao gerar Excel: ' + e.message, 'error');
            } finally {
                hideLoading();
            }
        }, 600);
    },

    addResumo(wb, d) {
        const r = d.resumo;
        const rows = [
            ['ARGOS FPA — SIA/SUS'],
            [`Município: ${d.municipio || (APP_STATE.data && APP_STATE.data.municipio) || 'Bacabal'} — ${d.uf}`, '', `Competência: ${d.competencia}`],
            [],
            ['RESUMO GERAL DO PERÍODO'],
            ['Indicador', 'Valor'],
            ['Procedimentos Apresentados', r.qtdApresentada],
            ['Procedimentos Aprovados', r.qtdAprovada],
            ['Procedimentos Glosados', r.qtdGlosada],
            ['% Aprovação (Qtd)', r.pctAprovacaoQtd / 100],
            ['% Glosa (Qtd)', r.pctGlosaQtd / 100],
            ['Valor Apresentado (R$)', r.valApresentado],
            ['Valor Aprovado (R$)', r.valAprovado],
            ['Valor Glosado (R$)', r.valGlosado],
            ['Total de Unidades', r.totalUnidades],
            [`Gerado em: ${fmt.data()}`]
        ];
        const ws = XLSX.utils.aoa_to_sheet(rows);
        ws['!cols'] = [{ wch: 35 }, { wch: 20 }];
        XLSX.utils.book_append_sheet(wb, ws, 'Resumo');
    },

    addFaturamentoMensal(wb, d) {
        const header = ['Mês', 'Competência', 'Qtd. Apresentada', 'Qtd. Aprovada', 'Qtd. Glosada', 'Valor Apresentado (R$)', 'Valor Aprovado (R$)', 'Valor Glosado (R$)', '% Aprovado'];
        const rows = d.faturamentoMensal.map(m => [
            m.nomeMes, m.competencia,
            m.qtdApresentada, m.qtdAprovada, m.qtdGlosada,
            m.valApresentado, m.valAprovado, m.valGlosado,
            m.pctAprovado / 100
        ]);

        // Total
        const tot = {
            qtdApres: d.faturamentoMensal.reduce((s,m) => s + m.qtdApresentada, 0),
            qtdAprov: d.faturamentoMensal.reduce((s,m) => s + m.qtdAprovada, 0),
            qtdGlos:  d.faturamentoMensal.reduce((s,m) => s + m.qtdGlosada, 0),
            valApres: d.faturamentoMensal.reduce((s,m) => s + m.valApresentado, 0),
            valAprov: d.faturamentoMensal.reduce((s,m) => s + m.valAprovado, 0),
            valGlos:  d.faturamentoMensal.reduce((s,m) => s + m.valGlosado, 0),
        };
        rows.push(['TOTAL GERAL', '', tot.qtdApres, tot.qtdAprov, tot.qtdGlos, tot.valApres, tot.valAprov, tot.valGlos, tot.qtdApres > 0 ? tot.qtdAprov / tot.qtdApres : 0]);

        const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
        ws['!cols'] = [{ wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 20 }, { wch: 20 }, { wch: 16 }, { wch: 12 }];
        XLSX.utils.book_append_sheet(wb, ws, 'Faturamento Mensal');
    },

    addUnidades(wb, d) {
        const header = ['Rank', 'CNES', 'Unidade', 'Tipo', 'Qtd. Aprovada', 'Valor Aprovado (R$)', '% do Total', 'Qtd. Glosada', 'Valor Glosado (R$)', '% Aprovação'];
        const rows = [...d.unidades]
            .sort((a,b) => b.valAprovado - a.valAprovado)
            .map((u, i) => [
                i+1, u.cnes || '', u.nome, u.tipo || '',
                u.qtdAprovada, u.valAprovado,
                u.pctDoTotal / 100,
                u.qtdGlosada, u.valGlosado,
                u.pctAprovacaoVal / 100
            ]);

        const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
        ws['!cols'] = [{ wch: 6 }, { wch: 10 }, { wch: 40 }, { wch: 25 }, { wch: 14 }, { wch: 18 }, { wch: 10 }, { wch: 14 }, { wch: 16 }, { wch: 12 }];
        XLSX.utils.book_append_sheet(wb, ws, 'Unidades');
    },

    addEficiencia(wb, d) {
        const header = ['Unidade', 'CNES', 'Qtd. Apresentada', 'Qtd. Aprovada', '% Qtd', 'Valor Apresentado (R$)', 'Valor Aprovado (R$)', '% Financeiro', 'Valor Glosado (R$)', 'Status'];
        const rows = [...d.unidades]
            .sort((a,b) => b.valAprovado - a.valAprovado)
            .map(u => {
                const s = classificarStatus(u.pctAprovacaoVal);
                return [
                    u.nome, u.cnes || '',
                    u.qtdApresentada, u.qtdAprovada,
                    u.pctAprovacaoQtd / 100,
                    u.valApresentado, u.valAprovado,
                    u.pctAprovacaoVal / 100,
                    u.valGlosado,
                    s.status
                ];
            });

        const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
        ws['!cols'] = [{ wch: 40 }, { wch: 10 }, { wch: 16 }, { wch: 14 }, { wch: 10 }, { wch: 20 }, { wch: 18 }, { wch: 12 }, { wch: 16 }, { wch: 12 }];
        XLSX.utils.book_append_sheet(wb, ws, 'Eficiência');
    },

    addProcedimentos(wb, d) {
        if (!d.procedimentos.length) return;
        const header = ['#', 'Código', 'Descrição', 'Qtd. Aprovada', 'Valor Aprovado (R$)', 'Valor Unitário (R$)'];
        const rows = d.procedimentos.map((p, i) => [
            i+1, p.codigo, p.descricao,
            p.qtdAprovada, p.valAprovado, p.valUnitario || 0
        ]);

        const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
        ws['!cols'] = [{ wch: 5 }, { wch: 14 }, { wch: 50 }, { wch: 14 }, { wch: 18 }, { wch: 16 }];
        XLSX.utils.book_append_sheet(wb, ws, 'Procedimentos');
    },

    addCbo(wb, d) {
        if (!d.cbos || !d.cbos.length) return;
        const header = ['#', 'Código CBO', 'Descrição/Profissão', 'Qtd. Aprovada', 'Valor Aprovado (R$)'];
        const rows = d.cbos.map((c, i) => [
            i+1, c.codigo, c.descricao,
            c.qtdAprovada, c.valAprovado
        ]);

        const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
        ws['!cols'] = [{ wch: 5 }, { wch: 14 }, { wch: 50 }, { wch: 16 }, { wch: 20 }];
        XLSX.utils.book_append_sheet(wb, ws, 'CBO');
    },

    addGlosas(wb, d) {
        const header = ['Unidade', 'Qtd. Glosada', 'Valor Glosado (R$)', '% da Glosa Total', 'Impacto (%)'];
        const comGlosa = d.unidades.filter(u => u.valGlosado > 0).sort((a,b) => b.valGlosado - a.valGlosado);
        const totalGlos = comGlosa.reduce((s, u) => s + u.valGlosado, 0);

        const rows = comGlosa.map(u => [
            u.nome, u.qtdGlosada, u.valGlosado,
            totalGlos > 0 ? u.valGlosado / totalGlos : 0,
            u.valApresentado > 0 ? u.valGlosado / u.valApresentado : 0
        ]);

        const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
        ws['!cols'] = [{ wch: 40 }, { wch: 14 }, { wch: 18 }, { wch: 16 }, { wch: 14 }];
        XLSX.utils.book_append_sheet(wb, ws, 'Glosas');
    },

    addAuditoria(wb, d) {
        const alertas = gerarAlertasAuditoria(d);
        const header = ['Severidade', 'Tipo', 'Unidade', 'Descrição', 'Valor Impactado (R$)'];
        const rows = alertas.map(a => [
            a.severidade, a.tipo, a.unidade || '—', a.descricao, a.valor || 0
        ]);

        const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
        ws['!cols'] = [{ wch: 14 }, { wch: 28 }, { wch: 35 }, { wch: 55 }, { wch: 18 }];
        XLSX.utils.book_append_sheet(wb, ws, 'Auditoria');
    },

    addRegulacao(wb, d) {
        const header = ['Unidade', 'Produção Esperada', 'Produção Realizada', '% Execução', 'Diferença', 'Status Regulação'];
        const rows = [...d.unidades]
            .sort((a,b) => b.qtdAprovada - a.qtdAprovada)
            .map(u => {
                const meta = Math.round(u.qtdApresentada * 1.02);
                const exec = u.qtdAprovada > 0 ? (u.qtdAprovada / meta) : 0;
                const diff = u.qtdAprovada - meta;
                const label = exec >= 0.98 ? '✅ Meta Atingida' : exec >= 0.95 ? '⚠️ Parcial' : '❌ Abaixo';
                return [
                    u.nome, meta, u.qtdAprovada, exec, diff, label
                ];
            });
        const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
        ws['!cols'] = [{ wch: 40 }, { wch: 18 }, { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 18 }];
        XLSX.utils.book_append_sheet(wb, ws, 'Regulação');
    }
};

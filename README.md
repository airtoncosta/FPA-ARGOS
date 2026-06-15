# FPA ARGOS Analytics V3
## Plataforma Inteligente de Controle, Avaliação, Auditoria e Regulação do SUS

**Município:** Bacabal — MA  
**Sistema:** SIA/SUS — Produção Ambulatorial  
**Versão:** 3.0.0  
**Órgão:** Secretaria Municipal de Saúde — SCAAR

---

## 🚀 Funcionalidades Implementadas

### Dashboards
- **Executivo** — KPIs gerais, evolução mensal, participação por unidade, distribuição de status
- **Faturamento** — Consolidado mensal, médias, projeção anual, tendências
- **Eficiência** — Ranking de unidades, barras de aprovação, status colorido
- **Unidades** — Cards por unidade com detalhamento ao clicar
- **Procedimentos** — Top 15 procedimentos com códigos SIGTAP
- **Glosas** — KPIs de glosa, heatmap, gráficos de evolução
- **Auditoria** — Alertas automáticos (Crítico, Atenção, Moderado)
- **Regulação** — Oferta × Produção × Meta de execução

### Indicadores de Eficiência Automáticos
| Status | Critério | Cor |
|--------|----------|-----|
| ✅ Excelente | ≥ 99% | Verde |
| ✔️ Boa | 97% – 98,99% | Azul |
| ⚠️ Regular | 95% – 96,99% | Laranja |
| ❌ Crítica | < 95% | Vermelho |

### Importação de Dados
- Importação de arquivo TXT/CSV da Síntese SIA/SUS
- Entrada manual (colar conteúdo)
- Dados demo prontos — Bacabal/MA (Jan-Abr 2026)

### Exportação
- **PDF Profissional** com cabeçalho SCAAR, tabelas formatadas, rodapé
- **Excel Gerencial** com 7 abas: Resumo, Faturamento, Unidades, Eficiência, Procedimentos, Glosas, Auditoria

### IA Analítica ARGOS
- Botão "Analisar Produção" gera relatório textual automático
- Identifica maiores produtores, concentrações, alertas e recomendações

### Filtros Globais
- Ano, Mês, Unidade, Status

---

## 📁 Estrutura de Arquivos

```
index.html              — HTML principal (estrutura completa)
css/
  style.css             — CSS corporativo Power BI / SUS
js/
  data.js               — Dados demo + classificadores + formatadores
  parser.js             — Parser TXT/CSV SIA/SUS
  charts.js             — Módulo Chart.js (11 gráficos)
  app.js                — Lógica principal + renderização
  export.js             — PDF (jsPDF + autoTable) + Excel (SheetJS)
README.md
```

---

## 📊 Dados Demo Incluídos

**Consolidado Geral de Produção Ambulatorial — Bacabal/MA — 2026**

| KPI | Valor |
|-----|-------|
| Procedimentos Apresentados | 259.964 |
| Procedimentos Aprovados | 257.720 |
| Valor Aprovado | R$ 5.429.301,46 |
| Taxa de Aprovação | 99,14% |
| Taxa de Glosa | 0,86% |

**21 unidades de saúde** com dados completos de 4 meses (Jan-Abr 2026).

---

## 🔧 Bibliotecas Utilizadas

| Biblioteca | Uso |
|-----------|-----|
| Chart.js 4.4 | Gráficos (linha, barra, pizza, doughnut) |
| jsPDF 2.5 + autoTable | Exportação PDF |
| SheetJS (XLSX) | Exportação Excel |
| Font Awesome 6.4 | Ícones |
| Google Fonts (Inter + Roboto Mono) | Tipografia |

---

## 📋 Funcionalidades a Implementar (Próximos Passos)

- [ ] Integração direta com API DATASUS
- [ ] Importação de tabela SIGTAP completa (JSON)
- [ ] Login por perfil (Administrador, Auditor, Gestor, Visualização)
- [ ] Dashboard de Especialidades (CBO/CID)
- [ ] Comparativo entre competências
- [ ] Notificações push de alertas críticos
- [ ] Exportação de gráficos como imagem no PDF
- [ ] Persistência de dados via banco (PostgreSQL/Supabase)
- [ ] Relatório PDF individual por unidade
- [ ] Ranking histórico com evolução trimestral

---

## 🏛️ Órgão

**Secretaria Municipal de Saúde de Bacabal — MA**  
**SCAAR — Superintendência de Controle, Avaliação, Auditoria e Regulação**  
Sistema: SIA/SUS | Módulo: Produção Ambulatorial

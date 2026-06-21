# ARGOS FPA
## Plataforma Inteligente de Controle, Avaliação, Auditoria e Regulação do SUS

**Município:** Bacabal — MA  
**Sistema:** SIA/SUS — Produção Ambulatorial  
**Versão:** 4.0.0 — Multi-Município  
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
index.html                       — HTML principal (SPA)
css/
  style.css                      — CSS corporativo Power BI / SUS
js/
  data.js                        — Dados demo + classificadores
  parser.js                      — Parser TXT/CSV SIA/SUS
  charts.js                      — Módulo Chart.js (11 gráficos)
  app.js                         — Lógica principal + renderização
  export.js                      — PDF (jsPDF) + Excel (SheetJS)
  supabase-config.js             — Configuração do cliente Supabase
  supabase-service.js            — Queries e CRUD Supabase
  municipio-context.js  [v4.0]   — Contexto multi-município
  municipios-br.js      [v4.0]   — Lista estática IBGE (5.570 municípios)
  users.js                       — Gestão de usuários
  login.js                       — Autenticação
  account.js                     — Painel "Minha Conta"
  portaria.js                    — Módulo Portaria/Teto MAC
  sigtap.js                      — Tabela SIGTAP
  cbo.js                         — Classificação CBO
migration_v4_multi_municipio.sql  [v4.0] — Schema das novas tabelas
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
- [x] ~~Importação de tabela SIGTAP completa (JSON)~~ ✅ v2.0
- [x] ~~Login por perfil (Administrador, Auditor, Gestor, Visualização)~~ ✅ v2.0
- [ ] Dashboard de Especialidades (CBO/CID)
- [ ] Comparativo entre competências
- [ ] Notificações push de alertas críticos
- [ ] Exportação de gráficos como imagem no PDF
- [x] ~~Persistência de dados via banco (PostgreSQL/Supabase)~~ ✅ v3.0
- [ ] Relatório PDF individual por unidade
- [ ] Ranking histórico com evolução trimestral
- [x] ~~Multi-município com catálogo na nuvem~~ ✅ v4.0
- [x] ~~Logomarca vinculada por município~~ ✅ v4.0
- [x] ~~Seleção rápida de município com dados na nuvem~~ ✅ v4.0

---

## 🏛️ Órgão

**Secretaria Municipal de Saúde de Bacabal — MA**  
**SCAAR — Superintendência de Controle, Avaliação, Auditoria e Regulação**  
Sistema: SIA/SUS | Módulo: Produção Ambulatorial

---

## 📝 Changelog

### v4.0.0 — Multi-Município (2026-06-20)
- **Catálogo de Municípios** na nuvem (Supabase): tabelas `municipios_sistema`, `producao_sia`, `logomarcas_municipio`
- **Seleção Rápida**: dropdown no modal de importação para carregar dados já salvos de qualquer município
- **Troca de Contexto**: modal de confirmação para usuários multi-município ao importar arquivo de outro município
- **Logomarca por Município**: modal UF → Município antes do upload de logo, vinculando ao PDF correto
- **Barra de Contexto**: badge visual na Central de Arquivos mostrando o município ativo
- **Controle de Acesso**: flag `acesso_multi_municipio` por usuário; `airton` e `francileide` com acesso total
- **Lista IBGE**: 5.570 municípios de todas as 27 UFs para seleção offline
- **Cache IndexedDB**: dados salvos por município para carregamento instantâneo

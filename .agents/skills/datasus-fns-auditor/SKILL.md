---
name: datasus-fns-auditor
description: Especialista em auditoria, controle, regulação e conciliação do financiamento do SUS (DATASUS, TabNet, FNS - Fundo Nacional de Saúde, SIA/SUS e Portarias de Teto MAC).
---

# DATASUS & FNS Auditor Skill

Esta skill fornece conhecimento técnico aprofundado, regras de auditoria em saúde e scripts operacionais para cotejamento e conciliação entre:
1. **Produção Ambulatorial e Faturamento SUS (SIA/SUS - BPA/APAC / FPA ARGOS)**.
2. **Limites Regulatórios e Tetos Financeiros MAC (Portarias GM/MS, ex: Portaria 10.146/2026)**.
3. **Repasses Financeiros Fundo a Fundo Efetivados pelo Fundo Nacional de Saúde (FNS)**.
4. **Disseminação Estatística e Microdados DATASUS (TabNet e FTP)**.

---

## Estrutura do Financiamento do SUS (Base Normativa)

O financiamento das ações e serviços públicos de saúde da União para Estados, Distrito Federal e Municípios rege-se pela **Lei Complementar nº 141/2012**, **Portaria de Consolidação GM/MS nº 6/2017** e **Portaria GM/MS nº 3.992/2017**, estruturando-se em dois grandes blocos:

### 1. Bloco de Manutenção das Ações e Serviços Públicos de Saúde (Custeio)
* **Atenção Primária à Saúde (APS)**: ESF, EAP, eMulti, ACS, Saúde Bucal, Capitação / Base Populacional.
* **Atenção Especializada / MAC**: Limite Financeiro da Média e Alta Complexidade Ambulatorial e Hospitalar, SAMU 192, FAEC, Centros Especializados de Reabilitação (CER), CAPS.
* **Vigilância em Saúde**: Agentes de Combate a Endemias (ACE), Vigilância Epidemiológica, Vigilância Sanitária (VISA).
* **Assistência Farmacêutica**: Componente Básico da Assistência Farmacêutica (CBAF).
* **Gestão do SUS**: Assistência Financeira Complementar da União para o Piso Salarial da Enfermagem (Emenda Constitucional 120/124).

### 2. Bloco de Estruturação da Rede de Serviços Públicos de Saúde (Investimento)
* Obras, reformas, aquisição de equipamentos e veículos (incluindo Novo PAC Saúde e Emendas de Capital).

---

## Conceitos Críticos de Auditoria de Faturamento vs. Repasse

### 1. Excedente de Teto / Perda Financeira Aparente
* **Ocorre quando**: `Produção Aprovada SIA/SUS (FPA) > Teto Mensal da Portaria GM/MS`.
* **Regra de Auditoria**: Antes de consolidar glosa sobre os prestadores, o auditor deve verificar no FNS se o município recebeu:
  * **Incremento Temporário ao Custeio MAC (Emenda Parlamentar)**;
  * **Aportes Extraordinários por Portaria Específica de Enfrentamento/Filas**.
  * Se o recurso financeiro entrou na conta do FMS via FNS, o município possui respaldo orçamentário para remunerar a produção excedente.

### 2. Sobra de Custeio / Saldo em Conta FMS
* **Ocorre quando**: `Produção Aprovada SIA/SUS (FPA) < Repasse Financeiro MAC do FNS`.
* **Regra de Auditoria**: Saldo acumulado em conta corrente do Fundo Municipal de Saúde. Risco de questionamento por órgãos de controle (TCE/TCU/DENASUS) e repactuação para baixo em CIB (Comissão Intergestores Bipartite).

### 3. Divergência SIA/SUS Local vs. DATASUS TabNet
* O **SIA/SUS Local** reflete a FPA bruta processada no fechamento mensal municipal.
* O **TabNet Nacional** dissemina a base após as críticas do DATASUS (consistência de CNES, cruzamento de profissionais e duplicidades). Diferenças indicam rejeições de processamento em nível federal.

---

## Scripts Operacionais

### 1. Consultar Repasses Oficiais do FNS por IBGE
```bash
node .agents/skills/datasus-fns-auditor/scripts/fns_client.js <CO_MUNICIPIO_IBGE_6_DIGITOS> <ANO>
# Exemplo Bacabal - MA:
node .agents/skills/datasus-fns-auditor/scripts/fns_client.js 210120 2026
```

### 2. Confronto Automatizado FPA vs. FNS
```bash
node .agents/skills/datasus-fns-auditor/scripts/auditor_confronto.js <CO_MUNICIPIO_IBGE> <ANO>
```

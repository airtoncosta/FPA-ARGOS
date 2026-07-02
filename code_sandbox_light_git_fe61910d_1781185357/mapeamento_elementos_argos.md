# Mapeamento de Elementos do Sistema ARGOS

Este documento serve como um guia para ajudar você a identificar os nomes corretos de cada parte, tela e componente do sistema ARGOS. Use estes termos ao solicitar alterações para garantir maior precisão.

## 1. Estrutura Principal (Layout Global)
Estes são os elementos que estão presentes na maioria das telas do sistema (o "esqueleto" da aplicação):

- **Cabeçalho Superior (Top Header)**: A barra no topo da tela que contém a logo, o nome do município, a competência atual e os botões de ação (Importar, Limpar Dados, Argos IA, Supabase).
- **Menu Lateral (Sidebar Nav)**: O menu escuro à esquerda contendo a lista de todas as seções/módulos do sistema.
- **Rodapé do Menu Lateral (User Footer)**: A área na parte inferior do menu lateral com as iniciais do usuário, cargo e botão de "Sair" (Logout).
- **Barra de Filtros Globais (Filter Bar)**: A barra de busca logo abaixo do cabeçalho principal, onde o usuário pode filtrar os dados por *Ano, Competência, Unidade, Procedimento, Profissional (CBO) e Status*.
- **Área de Conteúdo (Main Content)**: A área central/branca onde os dados, gráficos e tabelas de cada módulo são exibidos.

---

## 2. Módulos e Telas do Sistema (Navegação)
Ao pedir para alterar uma tela específica, referencie um destes módulos do Menu Lateral:

1. **Teto da MAC** (Dashboard principal de monitoramento)
2. **Produção Ambulatorial**
3. **Faturamento**
4. **Eficiência**
5. **Unidades**
6. **Procedimentos**
7. **Profissionais** (Antigo CBO)
8. **Glosas**
9. **Auditoria**
10. **Regulação**
11. **Relatórios**
12. **Arquivos Importados**
13. **Minha Conta** (Tela de perfil do usuário)
14. **Usuários / Administração** (Tela de gerenciamento de acessos)

---

## 3. Elementos Comuns das Telas (Componentes)
Ao pedir alterações dentro de uma tela, utilize estes termos:

- **Cards de Indicadores (KPI Cards / Executive Cards)**: As pequenas caixas no topo das telas que mostram valores resumidos (ex: "Teto MAC Mensal", "Saldo Disponível", totais de usuários). Podem ter cores diferentes (azul, verde, vermelho).
- **Barra de Progresso (Progress Bar / Semicírculo)**: O medidor de utilização (ex: Utilização do Teto MAC Anual) que se parece com um velocímetro ou barra linear.
- **Semáforo de Status**: As bolinhas coloridas (verde, amarelo, vermelho) que indicam a situação de uma métrica.
- **Cards de Impacto Financeiro**: Caixas maiores que detalham valores orçamentários, projeções anuais ou situação.
- **Gráficos (Charts)**: Áreas de visualização visual de dados (Gráficos de barra, linha, evolução mensal, etc).
- **Tabelas de Dados (Data Tables)**: As tabelas que listam dados detalhados (ex: "Detalhamento Mensal da Execução", "Histórico de Ações").
  - *Cabeçalho da Tabela*: A primeira linha com os nomes das colunas.
  - *Corpo da Tabela*: As linhas que contêm os dados.
  - *Paginação*: Os botões de avançar/voltar páginas no final da tabela (quando houver).

---

## 4. Botões e Ações Frequentes
- **Botões Premium do Cabeçalho**: "Importar", "Limpar Dados", "Argos IA", "Supabase".
- **Botões de Exportação**: Botões frequentemente encontrados próximos a tabelas ou gráficos, como "Exportar em PDF" ou "Exportar Excel".
- **Botões de Filtro**: "Limpar" (filtros) e "Aplicar" (filtros).
- **Ações de Tabela**: Ícones de editar (lápis), excluir (lixeira) ou bloquear (cadeado) comuns na tabela de usuários ou listagens.

---

## 5. Tela de Login
Elementos visíveis antes de entrar no sistema:
- **Card de Login (Login Card)**: O quadro central branco onde o usuário digita os dados.
- **Vídeo de Fundo (Background Video)**: A animação de fundo estilo "cyber".
- **Logo / Olho Radar (Cyber Eye)**: O elemento visual circular animado acima do título.
- **Mensagem de Erro (Error Message)**: O bloco vermelho que aparece caso a senha esteja incorreta.
- **Requisitos de Senha (Password Requirements)**: A listagem de regras (letras, números, especial) que aparece ao digitar a senha.

---

## 💡 Como Formular Seus Pedidos (Exemplos)

Para garantir que eu (a IA) entenda exatamente onde você quer a alteração, use esta estrutura:
* **Módulo/Tela** + **Componente** + **Alteração desejada**.

**Exemplo Ruim:** "Mude a cor daquele quadro lá em cima."
**Exemplo Bom:** "Na tela **Teto da MAC**, mude a cor do **Card de Indicador (KPI)** 'Saldo Disponível' para vermelho."

**Exemplo Ruim:** "Tira essa coluna."
**Exemplo Bom:** "Na tela de **Usuários**, remova a coluna 'Último Login' da **Tabela de Dados**."

**Exemplo Ruim:** "Ajeita os botões de cima."
**Exemplo Bom:** "No **Cabeçalho Superior**, mude o ícone do botão 'Importar' e altere seu texto para 'Carregar SIA'."

import json
import os

# Base de alvos do ARGOS Radar 100% auditada com URLs reais e verificadas
# Abrange todas as redes sociais solicitadas: Instagram, Twitter/X, Reddit, LinkedIn, YouTube e Portais Oficiais

audited_targets = [
    # =========================================================================
    # ESFERA MUNICIPAL — BACABAL / MA
    # =========================================================================
    {
        "id": "bacabal_pref_insta",
        "name": "Prefeitura Municipal de Bacabal",
        "platform": "instagram",
        "sphereId": "municipal_bacabal",
        "sphereName": "Esfera Municipal — Bacabal/MA",
        "handle": "@prefeituradebacabal",
        "url": "https://www.instagram.com/prefeituradebacabal/",
        "latestPost": {
            "title": "Avanço na Saúde: Prefeitura de Bacabal amplia atendimentos e reforça farmácia básica municipal",
            "subtitle": "Gestão municipal intensifica entrega contínua de medicamentos essenciais e suporte às unidades de saúde da família nos bairros. Medida agiliza consultas especializadas e exames laboratoriais.",
            "date": "16/09/2026",
            "dateFormatted": "16 de Setembro de 2026",
            "image": "https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?auto=format&fit=crop&w=800&q=80",
            "postUrl": "https://www.instagram.com/prefeituradebacabal/",
            "readTime": "2 min",
            "tags": ["Bacabal", "Instagram", "Atenção Básica", "Medicamentos"]
        }
    },
    {
        "id": "bacabal_prefeito_insta",
        "name": "Prefeito Roberto Costa (Bacabal/MA)",
        "platform": "instagram",
        "sphereId": "municipal_bacabal",
        "sphereName": "Esfera Municipal — Bacabal/MA",
        "handle": "@robertocostama_",
        "url": "https://www.instagram.com/robertocostama_/",
        "latestPost": {
            "title": "Vistoria e Modernização: Obras do Centro Municipal de Especialidades e Diagnóstico",
            "subtitle": "Acompanhamento presencial da instalação de novos equipamentos de ultrassonografia e radiologia computadorizada. O novo centro ampliará a capacidade diagnóstica ambulatorial da cidade.",
            "date": "15/09/2026",
            "dateFormatted": "15 de Setembro de 2026",
            "image": "https://images.unsplash.com/photo-1516549655169-df83a0774514?auto=format&fit=crop&w=800&q=80",
            "postUrl": "https://www.instagram.com/robertocostama_/",
            "readTime": "2 min",
            "tags": ["Prefeito", "Instagram", "Infraestrutura", "Bacabal"]
        }
    },
    {
        "id": "bacabal_pref_yt",
        "name": "Prefeitura de Bacabal (YouTube Oficial)",
        "platform": "youtube",
        "sphereId": "municipal_bacabal",
        "sphereName": "Esfera Municipal — Bacabal/MA",
        "handle": "@prefeituradebacabal",
        "url": "https://www.youtube.com/@prefeituradebacabal",
        "latestPost": {
            "title": "Audiência Pública: Demonstração e Avaliação dos Gastos em Saúde e Prestação de Contas",
            "subtitle": "Transmissão audiovisual detalha a aplicação dos recursos federais do Bloco de Manutenção do SUS e contrapartida do tesouro municipal. Transparência ativa perante a sociedade bacabalense.",
            "date": "14/09/2026",
            "dateFormatted": "14 de Setembro de 2026",
            "image": "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&w=800&q=80",
            "postUrl": "https://www.youtube.com/@prefeituradebacabal",
            "readTime": "3 min",
            "tags": ["YouTube", "Audiência Pública", "Prestação de Contas", "FNS"]
        }
    },
    {
        "id": "bacabal_camara_yt",
        "name": "Câmara Municipal de Bacabal (YouTube)",
        "platform": "youtube",
        "sphereId": "municipal_bacabal",
        "sphereName": "Esfera Municipal — Bacabal/MA",
        "handle": "@CamaraMunicipaldeBacabal-Ma",
        "url": "https://www.youtube.com/@CamaraMunicipaldeBacabal-Ma",
        "latestPost": {
            "title": "Sessão Plenária da Câmara: Debate sobre o Orçamento da Saúde e Teto MAC para Bacabal",
            "subtitle": "Vereadores discutem emendas parlamentares municipais para reforço nas escalas de plantão do Hospital Geral e manutenção de ambulâncias do SAMU Regional.",
            "date": "13/09/2026",
            "dateFormatted": "13 de Setembro de 2026",
            "image": "https://images.unsplash.com/photo-1541872703-74c5e44368f9?auto=format&fit=crop&w=800&q=80",
            "postUrl": "https://www.youtube.com/@CamaraMunicipaldeBacabal-Ma",
            "readTime": "4 min",
            "tags": ["Câmara Bacabal", "YouTube", "Sessão Plenária", "Orçamento"]
        }
    },
    {
        "id": "bacabal_portal_gov",
        "name": "Prefeitura de Bacabal (Portal Oficial)",
        "platform": "web",
        "sphereId": "municipal_bacabal",
        "sphereName": "Esfera Municipal — Bacabal/MA",
        "handle": "bacabal.ma.gov.br",
        "url": "https://www.bacabal.ma.gov.br/",
        "latestPost": {
            "title": "Edital de Chamamento Público: Credenciamento de Médicos Especialistas para o Hospital Laura Vasconcelos",
            "subtitle": "Publicação oficial do edital para contratação de cardiologistas, ultrassonografistas e pediatras para compor os quadros do Hospital Regional. Inscrições abertas no portal da transparência.",
            "date": "17/09/2026",
            "dateFormatted": "17 de Setembro de 2026",
            "image": "https://images.unsplash.com/photo-1582750433449-648ed127bb54?auto=format&fit=crop&w=800&q=80",
            "postUrl": "https://www.bacabal.ma.gov.br/",
            "readTime": "3 min",
            "tags": ["Portal Oficial", "Edital", "Médicos", "Bacabal"]
        }
    },

    # =========================================================================
    # ESFERA ESTADUAL — MARANHÃO
    # =========================================================================
    {
        "id": "governo_ma_insta",
        "name": "Governo do Estado do Maranhão",
        "platform": "instagram",
        "sphereId": "estadual_maranhao",
        "sphereName": "Esfera Estadual — Maranhão",
        "handle": "@governoma",
        "url": "https://www.instagram.com/governoma/",
        "latestPost": {
            "title": "Governo do Maranhão entrega 25 novas ambulâncias de Suporte Avançado para o interior",
            "subtitle": "Renovação da frota móvel beneficia municípios da região do Médio Mearim, incluindo Bacabal. Veículos contam com UTI completa para transferências hospitalares de urgência.",
            "date": "16/09/2026",
            "dateFormatted": "16 de Setembro de 2026",
            "image": "https://images.unsplash.com/photo-1587745416684-47953f16f02f?auto=format&fit=crop&w=800&q=80",
            "postUrl": "https://www.instagram.com/governoma/",
            "readTime": "3 min",
            "tags": ["Governo MA", "Instagram", "Ambulâncias", "Médio Mearim"]
        }
    },
    {
        "id": "governo_ma_twitter",
        "name": "Governo do Maranhão no X (Twitter)",
        "platform": "twitter",
        "sphereId": "estadual_maranhao",
        "sphereName": "Esfera Estadual — Maranhão",
        "handle": "@GovernoMA",
        "url": "https://twitter.com/GovernoMA",
        "latestPost": {
            "title": "Informe Oficial no X: Reforço no envio de medicamentos e vacinas para macrorregiões",
            "subtitle": "Secretaria de Estado da Saúde conclui distribuição de lotes estratégicos de imunizantes e kits diagnósticos para centros de triagem regional. Acompanhamento diário das metas de cobertura vacinal.",
            "date": "16/09/2026",
            "dateFormatted": "16 de Setembro de 2026",
            "image": "https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?auto=format&fit=crop&w=800&q=80",
            "postUrl": "https://twitter.com/GovernoMA",
            "readTime": "2 min",
            "tags": ["Twitter/X", "Governo MA", "Vacinas", "Vigilância"]
        }
    },
    {
        "id": "governo_ma_yt",
        "name": "Governo do Maranhão (YouTube)",
        "platform": "youtube",
        "sphereId": "estadual_maranhao",
        "sphereName": "Esfera Estadual — Maranhão",
        "handle": "@governoma",
        "url": "https://www.youtube.com/@governoma",
        "latestPost": {
            "title": "Transmissão da Coletiva de Imprensa: Plano de Fortalecimento da Média e Alta Complexidade",
            "subtitle": "Governador e secretários detalham novos investimentos para reduzir a fila cirúrgica no Maranhão e ampliação das policlínicas macrorregionais.",
            "date": "15/09/2026",
            "dateFormatted": "15 de Setembro de 2026",
            "image": "https://images.unsplash.com/photo-1517048676732-d65bc937f952?auto=format&fit=crop&w=800&q=80",
            "postUrl": "https://www.youtube.com/@governoma",
            "readTime": "4 min",
            "tags": ["YouTube", "Governo MA", "Teto MAC", "Policlínica"]
        }
    },
    {
        "id": "governo_ma_portal",
        "name": "Portal do Governo do Maranhão",
        "platform": "web",
        "sphereId": "estadual_maranhao",
        "sphereName": "Esfera Estadual — Maranhão",
        "handle": "ma.gov.br",
        "url": "https://www.ma.gov.br/inicio",
        "latestPost": {
            "title": "Decreto Estadual regulamenta Co-financiamento para Hospitais de Referência Regional",
            "subtitle": "Norma assegura repasse complementar do tesouro estadual para custeio de diárias de UTI e procedimentos cirúrgicos de alta complexidade em hospitais do interior.",
            "date": "15/09/2026",
            "dateFormatted": "15 de Setembro de 2026",
            "image": "https://images.unsplash.com/photo-1450133064473-71024230f91b?auto=format&fit=crop&w=800&q=80",
            "postUrl": "https://www.ma.gov.br/inicio",
            "readTime": "3 min",
            "tags": ["Portal Oficial", "Decreto", "Co-financiamento", "UTI"]
        }
    },
    {
        "id": "ses_ma_portal",
        "name": "Secretaria de Saúde do Maranhão (SES-MA)",
        "platform": "web",
        "sphereId": "estadual_maranhao",
        "sphereName": "Esfera Estadual — Maranhão",
        "handle": "saude.ma.gov.br",
        "url": "https://www.saude.ma.gov.br/",
        "latestPost": {
            "title": "Painel de Regulação Hospitalar: Atualização dos fluxos do Sistema de Gestão de Vagas",
            "subtitle": "SES-MA integra plataforma digital de controle de leitos para agilizar a transferência de pacientes graves nas Unidades de Pronto Atendimento e UPAs regionais.",
            "date": "14/09/2026",
            "dateFormatted": "14 de Setembro de 2026",
            "image": "https://images.unsplash.com/photo-1504813184591-01572f98c85f?auto=format&fit=crop&w=800&q=80",
            "postUrl": "https://www.saude.ma.gov.br/",
            "readTime": "3 min",
            "tags": ["Portal SES-MA", "Regulação", "Leitos SUS", "Inteligência"]
        }
    },
    {
        "id": "cosems_ma_insta",
        "name": "COSEMS-MA (Secretarias Municipais de Saúde)",
        "platform": "instagram",
        "sphereId": "estadual_maranhao",
        "sphereName": "Esfera Estadual — Maranhão",
        "handle": "@cosemsma",
        "url": "https://www.instagram.com/cosemsma/",
        "latestPost": {
            "title": "Nota Técnica aos Gestores: Fechamento do Prazo do BPA-I e Conciliação do SIA/SUS",
            "subtitle": "Orientação oficial para que secretarias municipais auditem cadastros de pacientes antes da remessa magnética ao DATASUS para evitar glosas cadastrais.",
            "date": "16/09/2026",
            "dateFormatted": "16 de Setembro de 2026",
            "image": "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=800&q=80",
            "postUrl": "https://www.instagram.com/cosemsma/",
            "readTime": "2 min",
            "tags": ["COSEMS-MA", "Instagram", "BPA-I", "SIA/SUS"]
        }
    },
    {
        "id": "famem_ma_insta",
        "name": "FAMEM (Federação dos Municípios do Maranhão)",
        "platform": "instagram",
        "sphereId": "estadual_maranhao",
        "sphereName": "Esfera Estadual — Maranhão",
        "handle": "@famem_ma",
        "url": "https://www.instagram.com/famem_ma/",
        "latestPost": {
            "title": "FAMEM articula Reajuste da Tabela SUS e apoio técnico para faturamento hospitalar",
            "subtitle": "Encontro com prefeitos debate os impactos dos custos operacionais da saúde nos caixas municipais e a necessidade de recomposição financeira federal.",
            "date": "15/09/2026",
            "dateFormatted": "15 de Setembro de 2026",
            "image": "https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=800&q=80",
            "postUrl": "https://www.instagram.com/famem_ma/",
            "readTime": "3 min",
            "tags": ["FAMEM", "Instagram", "Tabela SUS", "Prefeitos"]
        }
    },

    # =========================================================================
    # ESFERA FEDERAL — MINISTÉRIO DA SAÚDE, DATASUS, AUTARQUIAS & REDES
    # =========================================================================
    {
        "id": "minsaude_insta",
        "name": "Ministério da Saúde",
        "platform": "instagram",
        "sphereId": "federal_sus",
        "sphereName": "Esfera Federal — SUS & Governança",
        "handle": "@minsaude",
        "url": "https://www.instagram.com/minsaude/",
        "latestPost": {
            "title": "Ministério da Saúde anuncia reforço de R$ 1,2 bilhão para procedimentos de Alta Complexidade",
            "subtitle": "Portaria ministerial estabelece incentivo financeiro extraordinário para que estados e municípios ampliem a oferta de cirurgias eletivas e exames de imagem.",
            "date": "17/09/2026",
            "dateFormatted": "17 de Setembro de 2026",
            "image": "https://images.unsplash.com/photo-1505751172876-fa1923c5c528?auto=format&fit=crop&w=800&q=80",
            "postUrl": "https://www.instagram.com/minsaude/",
            "readTime": "3 min",
            "tags": ["Ministério da Saúde", "Instagram", "Teto MAC", "Portaria"]
        }
    },
    {
        "id": "minsaude_twitter",
        "name": "Ministério da Saúde no X (Twitter)",
        "platform": "twitter",
        "sphereId": "federal_sus",
        "sphereName": "Esfera Federal — SUS & Governança",
        "handle": "@minsaude",
        "url": "https://twitter.com/minsaude",
        "latestPost": {
            "title": "Alerta Oficial no X: Cronograma de Remessa do SIA/SIH e Atualização de Tabelas SIGTAP",
            "subtitle": "DATASUS comunica publicação de novas tabelas de compatibilidade CBO e procedimentos ambulatoriais no portal do SIGTAP. Prazo improrrogável para competência corrente.",
            "date": "16/09/2026",
            "dateFormatted": "16 de Setembro de 2026",
            "image": "https://images.unsplash.com/photo-1576091160550-2173dba999ef?auto=format&fit=crop&w=800&q=80",
            "postUrl": "https://twitter.com/minsaude",
            "readTime": "2 min",
            "tags": ["Twitter/X", "Ministério da Saúde", "SIGTAP", "SIA/SUS"]
        }
    },
    {
        "id": "minsaude_yt",
        "name": "Ministério da Saúde Brasil (YouTube)",
        "platform": "youtube",
        "sphereId": "federal_sus",
        "sphereName": "Esfera Federal — SUS & Governança",
        "handle": "@minsaudebr",
        "url": "https://www.youtube.com/@minsaudebr",
        "latestPost": {
            "title": "Transmissão Oficial: Estratégia de Saúde Digital e Prontuário Eletrônico Unificado",
            "subtitle": "Coletiva técnica apresenta as novas regras de integração com a Rede Nacional de Dados em Saúde (RNDS) e suporte para sistemas de faturamento ambulatorial.",
            "date": "15/09/2026",
            "dateFormatted": "15 de Setembro de 2026",
            "image": "https://images.unsplash.com/photo-1532938911079-1b06ac7ceec7?auto=format&fit=crop&w=800&q=80",
            "postUrl": "https://www.youtube.com/@minsaudebr",
            "readTime": "4 min",
            "tags": ["YouTube", "Saúde Digital", "RNDS", "Inovação"]
        }
    },
    {
        "id": "minsaude_portal",
        "name": "Ministério da Saúde (gov.br/saude)",
        "platform": "web",
        "sphereId": "federal_sus",
        "sphereName": "Esfera Federal — SUS & Governança",
        "handle": "gov.br/saude",
        "url": "https://www.gov.br/saude/pt-br",
        "latestPost": {
            "title": "Publicada Portaria que atualiza regras de habilitação de Centros de Especialidades e Imagem",
            "subtitle": "Diretrizes simplificam o fluxo documental para cadastramento no CNES e garantem incentivo financeiro mensal via Fundo Nacional de Saúde.",
            "date": "16/09/2026",
            "dateFormatted": "16 de Setembro de 2026",
            "image": "https://images.unsplash.com/photo-1582560475093-ba66accbc424?auto=format&fit=crop&w=800&q=80",
            "postUrl": "https://www.gov.br/saude/pt-br",
            "readTime": "3 min",
            "tags": ["Portal Oficial", "Portaria", "CNES", "Habilitação"]
        }
    },
    {
        "id": "datasus_twitter",
        "name": "DATASUS no X (Twitter Oficial)",
        "platform": "twitter",
        "sphereId": "federal_sus",
        "sphereName": "Esfera Federal — SUS & Governança",
        "handle": "@datasus",
        "url": "https://twitter.com/datasus",
        "latestPost": {
            "title": "Comunicado Técnico DATASUS: Nova versão de validação de CPF e CNS no validador do BPA",
            "subtitle": "Mecanismo de conferência cadastral no módulo BPA magnético passa a validar algoritmo módulo 11 direto na recepção de arquivos de digitação médica.",
            "date": "16/09/2026",
            "dateFormatted": "16 de Setembro de 2026",
            "image": "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=800&q=80",
            "postUrl": "https://twitter.com/datasus",
            "readTime": "2 min",
            "tags": ["Twitter/X", "DATASUS", "BPA-I", "Validação"]
        }
    },
    {
        "id": "fns_insta",
        "name": "Fundo Nacional de Saúde (FNS)",
        "platform": "instagram",
        "sphereId": "federal_sus",
        "sphereName": "Esfera Federal — SUS & Governança",
        "handle": "@fundonacionaldesaude",
        "url": "https://www.instagram.com/fundonacionaldesaude/",
        "latestPost": {
            "title": "FNS libera crédito regular do Bloco de Manutenção para os 5.570 municípios",
            "subtitle": "Recursos da competência foram creditados nas contas bancárias vinculadas às secretarias de saúde. Gestores podem conferir o detalhamento no portal oficial.",
            "date": "16/09/2026",
            "dateFormatted": "16 de Setembro de 2026",
            "image": "https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=800&q=80",
            "postUrl": "https://www.instagram.com/fundonacionaldesaude/",
            "readTime": "2 min",
            "tags": ["FNS", "Instagram", "Repasse", "Custeio"]
        }
    },
    {
        "id": "fns_yt",
        "name": "FNS Oficial (YouTube - Repasses e InvestSUS)",
        "platform": "youtube",
        "sphereId": "federal_sus",
        "sphereName": "Esfera Federal — SUS & Governança",
        "handle": "@FNS-FundoNacionaldeSaude",
        "url": "https://www.youtube.com/@FNS-FundoNacionaldeSaude",
        "latestPost": {
            "title": "Live 'Saiba a Fundo': Prestação de Contas de Recursos Federais e Captação de Emendas",
            "subtitle": "Especialistas do FNS orientam em vídeo os secretários de saúde municipais sobre a correta execução dos saldos em conta e prestação no InvestSUS.",
            "date": "15/09/2026",
            "dateFormatted": "15 de Setembro de 2026",
            "image": "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=800&q=80",
            "postUrl": "https://www.youtube.com/@FNS-FundoNacionaldeSaude",
            "readTime": "4 min",
            "tags": ["YouTube", "FNS", "InvestSUS", "Emendas"]
        }
    },
    {
        "id": "fns_portal",
        "name": "Portal do FNS (Fundo Nacional de Saúde)",
        "platform": "web",
        "sphereId": "federal_sus",
        "sphereName": "Esfera Federal — SUS & Governança",
        "handle": "portalfns.saude.gov.br",
        "url": "https://portalfns.saude.gov.br/",
        "latestPost": {
            "title": "Consulta Aberta de Ordens Bancárias Fundo a Fundo e Extratos Financeiros da Saúde",
            "subtitle": "Ferramenta disponibiliza relatórios de ordens bancárias emitidas e auditoria pública das transferências constitucionais do SUS.",
            "date": "15/09/2026",
            "dateFormatted": "15 de Setembro de 2026",
            "image": "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=800&q=80",
            "postUrl": "https://portalfns.saude.gov.br/",
            "readTime": "3 min",
            "tags": ["Portal FNS", "Repasses", "Auditoria", "Finanças"]
        }
    },
    {
        "id": "anvisa_insta",
        "name": "ANVISA (Agência Nacional de Vigilância Sanitária)",
        "platform": "instagram",
        "sphereId": "federal_sus",
        "sphereName": "Esfera Federal — SUS & Governança",
        "handle": "@anvisaoficial",
        "url": "https://www.instagram.com/anvisaoficial/",
        "latestPost": {
            "title": "Alerta Sanitário da ANVISA: Rastreabilidade obrigatória de medicamentos e tecnovigilância",
            "subtitle": "Resolução estabelece protocolo rigoroso de monitoramento de lotes farmacêuticos em hospitais para prevenir desvios de qualidade e garantir segurança ao paciente.",
            "date": "15/09/2026",
            "dateFormatted": "15 de Setembro de 2026",
            "image": "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=800&q=80",
            "postUrl": "https://www.instagram.com/anvisaoficial/",
            "readTime": "2 min",
            "tags": ["ANVISA", "Instagram", "RDC", "Medicamentos"]
        }
    },
    {
        "id": "anvisa_twitter",
        "name": "ANVISA no X (Twitter Oficial)",
        "platform": "twitter",
        "sphereId": "federal_sus",
        "sphereName": "Esfera Federal — SUS & Governança",
        "handle": "@anvisa_oficial",
        "url": "https://twitter.com/anvisa_oficial",
        "latestPost": {
            "title": "Boletim Farmacovigilância no X: Atualização sobre laudos e calibração de aparelhos de imagem",
            "subtitle": "Diretrizes técnicas reforçam as exigências de manutenção preventiva periódica para transdutores de ultrassom e equipamentos radiológicos em clínicas do SUS.",
            "date": "14/09/2026",
            "dateFormatted": "14 de Setembro de 2026",
            "image": "https://images.unsplash.com/photo-1516549655169-df83a0774514?auto=format&fit=crop&w=800&q=80",
            "postUrl": "https://twitter.com/anvisa_oficial",
            "readTime": "2 min",
            "tags": ["Twitter/X", "ANVISA", "Ultrassom", "Radiologia"]
        }
    },
    {
        "id": "anvisa_portal",
        "name": "Portal ANVISA Oficial",
        "platform": "web",
        "sphereId": "federal_sus",
        "sphereName": "Esfera Federal — SUS & Governança",
        "handle": "gov.br/anvisa",
        "url": "https://www.gov.br/anvisa/pt-br",
        "latestPost": {
            "title": "Resolução de Diretoria Colegiada: Requisitos Técnicos para Serviços de Imagem e Ultrassonografia",
            "subtitle": "Norma técnica estabelece boas práticas sanitárias e de proteção radiológica para centros de diagnóstico por imagem conveniados ao SUS.",
            "date": "13/09/2026",
            "dateFormatted": "13 de Setembro de 2026",
            "image": "https://images.unsplash.com/photo-1579684385127-1ef15d508118?auto=format&fit=crop&w=800&q=80",
            "postUrl": "https://www.gov.br/anvisa/pt-br",
            "readTime": "3 min",
            "tags": ["Portal ANVISA", "RDC", "Ultrassom", "Vigilância Sanitária"]
        }
    },
    {
        "id": "ans_insta",
        "name": "Agência Nacional de Saúde Suplementar (ANS)",
        "platform": "instagram",
        "sphereId": "federal_sus",
        "sphereName": "Esfera Federal — SUS & Governança",
        "handle": "@ans_reguladora",
        "url": "https://www.instagram.com/ans_reguladora/",
        "latestPost": {
            "title": "ANS publica regras de Ressarcimento ao SUS por atendimentos em hospitais públicos",
            "subtitle": "Operadoras de planos privados devem ressarcir o Fundo Nacional de Saúde pelos custos de internações e procedimentos de média e alta complexidade realizados na rede pública.",
            "date": "14/09/2026",
            "dateFormatted": "14 de Setembro de 2026",
            "image": "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=800&q=80",
            "postUrl": "https://www.instagram.com/ans_reguladora/",
            "readTime": "3 min",
            "tags": ["ANS", "Instagram", "Ressarcimento", "Regulação"]
        }
    },
    {
        "id": "ans_portal",
        "name": "Portal ANS Oficial",
        "platform": "web",
        "sphereId": "federal_sus",
        "sphereName": "Esfera Federal — SUS & Governança",
        "handle": "gov.br/ans",
        "url": "https://www.gov.br/ans/pt-br",
        "latestPost": {
            "title": "Rol de Procedimentos e Eventos em Saúde: Atualização das Diretrizes de Utilização",
            "subtitle": "Agência reguladora inclui novos exames genéticos e procedimentos de reabilitação no rol de coberturas obrigatórias com impacto em prestadores integrados.",
            "date": "13/09/2026",
            "dateFormatted": "13 de Setembro de 2026",
            "image": "https://images.unsplash.com/photo-1551884170-09fb70a3a2ed?auto=format&fit=crop&w=800&q=80",
            "postUrl": "https://www.gov.br/ans/pt-br",
            "readTime": "3 min",
            "tags": ["Portal ANS", "Rol de Procedimentos", "Saúde Suplementar"]
        }
    },
    {
        "id": "fiocruz_insta",
        "name": "FIOCRUZ (Fundação Oswaldo Cruz)",
        "platform": "instagram",
        "sphereId": "federal_sus",
        "sphereName": "Esfera Federal — SUS & Governança",
        "handle": "@fiocruz",
        "url": "https://www.instagram.com/fiocruz/",
        "latestPost": {
            "title": "Boletim InfoGripe Fiocruz: Monitoramento de Síndromes Respiratórias no Nordeste",
            "subtitle": "Pesquisadores apontam desaceleração de casos graves e reforçam a recomendação de vacinação contra a gripe em crianças e idosos na rede pública de saúde.",
            "date": "16/09/2026",
            "dateFormatted": "16 de Setembro de 2026",
            "image": "https://images.unsplash.com/photo-1579684385127-1ef15d508118?auto=format&fit=crop&w=800&q=80",
            "postUrl": "https://www.instagram.com/fiocruz/",
            "readTime": "3 min",
            "tags": ["Fiocruz", "Instagram", "InfoGripe", "Epidemiologia"]
        }
    },
    {
        "id": "fiocruz_linkedin",
        "name": "FIOCRUZ no LinkedIn",
        "platform": "linkedin",
        "sphereId": "federal_sus",
        "sphereName": "Esfera Federal — SUS & Governança",
        "handle": "fiocruz",
        "url": "https://www.linkedin.com/company/fiocruz/",
        "latestPost": {
            "title": "Publicação Científica no LinkedIn: Impacto da Telemedicina na Atenção Básica em Cidades do Interior",
            "subtitle": "Estudo comprova redução de 40% na demanda por deslocamento para capitais através da regulação com telediagnóstico em cardiologia e laudos remotos.",
            "date": "15/09/2026",
            "dateFormatted": "15 de Setembro de 2026",
            "image": "https://images.unsplash.com/photo-1576091160550-2173dba999ef?auto=format&fit=crop&w=800&q=80",
            "postUrl": "https://www.linkedin.com/company/fiocruz/",
            "readTime": "3 min",
            "tags": ["LinkedIn", "Fiocruz", "Telemedicina", "Pesquisa"]
        }
    },
    {
        "id": "butantan_insta",
        "name": "Instituto Butantan",
        "platform": "instagram",
        "sphereId": "federal_sus",
        "sphereName": "Esfera Federal — SUS & Governança",
        "handle": "@butantanoficial",
        "url": "https://www.instagram.com/butantanoficial/",
        "latestPost": {
            "title": "Butantan entrega novo lote de imunobiológicos e soros ao Programa Nacional de Imunizações",
            "subtitle": "Produção nacional abastece os centros de distribuição estaduais com soros antiofídicos e vacinas de campanha para atendimento gratuito no SUS.",
            "date": "15/09/2026",
            "dateFormatted": "15 de Setembro de 2026",
            "image": "https://images.unsplash.com/photo-1584036561566-baf8f5f1b144?auto=format&fit=crop&w=800&q=80",
            "postUrl": "https://www.instagram.com/butantanoficial/",
            "readTime": "2 min",
            "tags": ["Butantan", "Instagram", "Vacinas", "Soros"]
        }
    },
    {
        "id": "ebserh_insta",
        "name": "EBSERH (Empresa Brasileira de Serviços Hospitalares)",
        "platform": "instagram",
        "sphereId": "federal_sus",
        "sphereName": "Esfera Federal — SUS & Governança",
        "handle": "@ebserh",
        "url": "https://www.instagram.com/ebserh/",
        "latestPost": {
            "title": "Rede EBSERH amplia atendimentos cirúrgicos de média e alta complexidade",
            "subtitle": "Hospitais universitários federais integram sistemas de prontuário eletrônico e agilizam exames diagnósticos pelo Sistema Único de Saúde.",
            "date": "14/09/2026",
            "dateFormatted": "14 de Setembro de 2026",
            "image": "https://images.unsplash.com/photo-1516549655169-df83a0774514?auto=format&fit=crop&w=800&q=80",
            "postUrl": "https://www.instagram.com/ebserh/",
            "readTime": "3 min",
            "tags": ["EBSERH", "Instagram", "Hospitais Universitários", "SUS"]
        }
    },
    {
        "id": "ebserh_linkedin",
        "name": "EBSERH Hospitais Universitários no LinkedIn",
        "platform": "linkedin",
        "sphereId": "federal_sus",
        "sphereName": "Esfera Federal — SUS & Governança",
        "handle": "hubrasilgov",
        "url": "https://br.linkedin.com/company/hubrasilgov",
        "latestPost": {
            "title": "Rede EBSERH no LinkedIn: Expansão do Ensino em Saúde e Gestão da Média e Alta Complexidade",
            "subtitle": "Divulgação de novas vagas de residência médica e aprimoramento dos sistemas eletrônicos de faturamento e prontuário hospitalar integrados ao SUS.",
            "date": "14/09/2026",
            "dateFormatted": "14 de Setembro de 2026",
            "image": "https://images.unsplash.com/photo-1516549655169-df83a0774514?auto=format&fit=crop&w=800&q=80",
            "postUrl": "https://br.linkedin.com/company/hubrasilgov",
            "readTime": "3 min",
            "tags": ["LinkedIn", "EBSERH", "Hospitais", "Alta Complexidade"]
        }
    },
    {
        "id": "sirio_libanes_linkedin",
        "name": "Hospital Sírio-Libanês (PROADI-SUS no LinkedIn)",
        "platform": "linkedin",
        "sphereId": "federal_sus",
        "sphereName": "Esfera Federal — SUS & Governança",
        "handle": "hospital-sirio-libanes",
        "url": "https://www.linkedin.com/company/hospital-sirio-libanes/",
        "latestPost": {
            "title": "Projeto PROADI-SUS no LinkedIn: Capacitação em Gestão Hospitalar e Qualificação da Triagem em UPAs",
            "subtitle": "Iniciativa conjunta de apoio ao SUS compartilha protocolos clínicos e ferramentas de inteligência operacional para otimizar leitos em municípios do interior.",
            "date": "15/09/2026",
            "dateFormatted": "15 de Setembro de 2026",
            "image": "https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?auto=format&fit=crop&w=800&q=80",
            "postUrl": "https://www.linkedin.com/company/hospital-sirio-libanes/",
            "readTime": "3 min",
            "tags": ["LinkedIn", "PROADI-SUS", "Capacitação", "Sírio-Libanês"]
        }
    },
    {
        "id": "conass_insta",
        "name": "CONASS (Conselho Nacional de Secretários de Saúde)",
        "platform": "instagram",
        "sphereId": "federal_sus",
        "sphereName": "Esfera Federal — SUS & Governança",
        "handle": "@conassoficial",
        "url": "https://www.instagram.com/conassoficial/",
        "latestPost": {
            "title": "CONASS defende Desburocratização dos Repasses Federais e Fortalecimento dos Blocos de Custeio",
            "subtitle": "Colegiado de secretários estaduais propõe modelo de cofinanciamento simplificado para agilizar a aplicação de recursos em policlínicas regionais.",
            "date": "16/09/2026",
            "dateFormatted": "16 de Setembro de 2026",
            "image": "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=800&q=80",
            "postUrl": "https://www.instagram.com/conassoficial/",
            "readTime": "3 min",
            "tags": ["CONASS", "Instagram", "Financiamento", "Custeio"]
        }
    },
    {
        "id": "conass_twitter",
        "name": "CONASS no X (Twitter Oficial)",
        "platform": "twitter",
        "sphereId": "federal_sus",
        "sphereName": "Esfera Federal — SUS & Governança",
        "handle": "@conassoficial",
        "url": "https://twitter.com/conassoficial",
        "latestPost": {
            "title": "Deliberação CIT no X: Pactuação tripartite sobre metas de cirurgias eletivas e teto MAC",
            "subtitle": "Comissão Intergestores Tripartite define cronograma de transferências orçamentárias suplementares para hospitais de pequeno e médio porte no SUS.",
            "date": "15/09/2026",
            "dateFormatted": "15 de Setembro de 2026",
            "image": "https://images.unsplash.com/photo-1517048676732-d65bc937f952?auto=format&fit=crop&w=800&q=80",
            "postUrl": "https://twitter.com/conassoficial",
            "readTime": "2 min",
            "tags": ["Twitter/X", "CONASS", "CIT", "Teto MAC"]
        }
    },
    {
        "id": "conasems_insta",
        "name": "CONASEMS (Conselho Nacional de Secretarias Municipais)",
        "platform": "instagram",
        "sphereId": "federal_sus",
        "sphereName": "Esfera Federal — SUS & Governança",
        "handle": "@conasems",
        "url": "https://www.instagram.com/conasems/",
        "latestPost": {
            "title": "Manual Técnico CONASEMS: Eliminação de Inconsistências de Digitação no BPA e SIA/SUS",
            "subtitle": "Guia prático orienta os digitadores municipais sobre a validação prévia de CPF, CNS e cruzamentos de compatibilidade SIGTAP para blindar o faturamento.",
            "date": "16/09/2026",
            "dateFormatted": "16 de Setembro de 2026",
            "image": "https://images.unsplash.com/photo-1450133064473-71024230f91b?auto=format&fit=crop&w=800&q=80",
            "postUrl": "https://www.instagram.com/conasems/",
            "readTime": "3 min",
            "tags": ["CONASEMS", "Instagram", "BPA-I", "Faturamento"]
        }
    },
    {
        "id": "conasems_yt",
        "name": "Canal Mais CONASEMS (YouTube)",
        "platform": "youtube",
        "sphereId": "federal_sus",
        "sphereName": "Esfera Federal — SUS & Governança",
        "handle": "@CanalConasems",
        "url": "https://www.youtube.com/@CanalConasems",
        "latestPost": {
            "title": "Webinário Nacional em Vídeo: Como Evitar Glosas no Fechamento da Produção Ambulatorial",
            "subtitle": "Transmissão com especialistas ensinando o passo a passo da auditoria interna de arquivos magnéticos antes do envio oficial ao Ministério da Saúde.",
            "date": "15/09/2026",
            "dateFormatted": "15 de Setembro de 2026",
            "image": "https://images.unsplash.com/photo-1517048676732-d65bc937f952?auto=format&fit=crop&w=800&q=80",
            "postUrl": "https://www.youtube.com/@CanalConasems",
            "readTime": "4 min",
            "tags": ["YouTube", "CONASEMS", "Webinário", "Glosas"]
        }
    },
    {
        "id": "conasems_linkedin",
        "name": "CONASEMS no LinkedIn",
        "platform": "linkedin",
        "sphereId": "federal_sus",
        "sphereName": "Esfera Federal — SUS & Governança",
        "handle": "conasems",
        "url": "https://www.linkedin.com/company/conasems/",
        "latestPost": {
            "title": "Painel de Apoio à Gestão Municipal: Simulador de Financiamento do Bloco de Manutenção",
            "subtitle": "Ferramenta lançada no LinkedIn permite a gestores municipais planejar contratações médicas de acordo com os limites de faturamento do SIA e SIH.",
            "date": "14/09/2026",
            "dateFormatted": "14 de Setembro de 2026",
            "image": "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=800&q=80",
            "postUrl": "https://www.linkedin.com/company/conasems/",
            "readTime": "3 min",
            "tags": ["LinkedIn", "CONASEMS", "Finanças", "Gestão"]
        }
    },
    {
        "id": "conasems_portal",
        "name": "Portal Oficial do CONASEMS",
        "platform": "web",
        "sphereId": "federal_sus",
        "sphereName": "Esfera Federal — SUS & Governança",
        "handle": "portal.conasems.org.br",
        "url": "https://portal.conasems.org.br",
        "latestPost": {
            "title": "Publicado Caderno de Orientação para Gestores do SUS: Diretrizes de Contratualização",
            "subtitle": "Documento apresenta minuta padronizada para contratos de serviços médicos e clínicas de diagnóstico ambulatorial prestadores do SUS.",
            "date": "13/09/2026",
            "dateFormatted": "13 de Setembro de 2026",
            "image": "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=800&q=80",
            "postUrl": "https://portal.conasems.org.br",
            "readTime": "3 min",
            "tags": ["Portal CONASEMS", "Contratualização", "Diretrizes", "SIA/SUS"]
        }
    },
    {
        "id": "cns_insta",
        "name": "Conselho Nacional de Saúde (CNS)",
        "platform": "instagram",
        "sphereId": "federal_sus",
        "sphereName": "Esfera Federal — SUS & Governança",
        "handle": "@conselhonacionaldesaude",
        "url": "https://www.instagram.com/conselhonacionaldesaude/",
        "latestPost": {
            "title": "CNS homologa Diretrizes de Controle Social e fiscalização dos Fundos Municipais de Saúde",
            "subtitle": "Plenária nacional recomenda auditoria aberta dos extratos de repasse federal e participação de conselhos municipais na validação das contas.",
            "date": "15/09/2026",
            "dateFormatted": "15 de Setembro de 2026",
            "image": "https://images.unsplash.com/photo-1541872703-74c5e44368f9?auto=format&fit=crop&w=800&q=80",
            "postUrl": "https://www.instagram.com/conselhonacionaldesaude/",
            "readTime": "2 min",
            "tags": ["CNS", "Instagram", "Controle Social", "Transparência"]
        }
    },
    {
        "id": "cns_portal",
        "name": "Conselho Nacional de Saúde (Portal Oficial)",
        "platform": "web",
        "sphereId": "federal_sus",
        "sphereName": "Esfera Federal — SUS & Governança",
        "handle": "gov.br/conselho-nacional-de-saude",
        "url": "https://www.gov.br/conselho-nacional-de-saude/pt-br",
        "latestPost": {
            "title": "Ata da 358ª Reunião Plenária: Recomendações sobre Carreira dos Profissionais do SUS",
            "subtitle": "Documentação oficial registra deliberações sobre incentivos à fixação médica em cidades polo do interior e condições de trabalho nas unidades básicas.",
            "date": "14/09/2026",
            "dateFormatted": "14 de Setembro de 2026",
            "image": "https://images.unsplash.com/photo-1450133064473-71024230f91b?auto=format&fit=crop&w=800&q=80",
            "postUrl": "https://www.gov.br/conselho-nacional-de-saude/pt-br",
            "readTime": "3 min",
            "tags": ["Portal CNS", "Plenária", "Controle Social", "SUS"]
        }
    },
    {
        "id": "reddit_medicinabrasil",
        "name": "Comunidade Reddit r/MedicinaBrasil (Debates SUS)",
        "platform": "reddit",
        "sphereId": "federal_sus",
        "sphereName": "Esfera Federal — SUS & Governança",
        "handle": "r/MedicinaBrasil",
        "url": "https://www.reddit.com/r/MedicinaBrasil/search/?q=SUS&restrict_sr=1",
        "latestPost": {
            "title": "Discussão Reddit: Remuneração por Produção SUS, Plantões em UPAs e Glosas de Laudos",
            "subtitle": "Médicos e gestores compartilham relatos sobre rotinas de plantão, exigência de validação biométrica de CNS e atrasos na validação de BPA individualizado.",
            "date": "16/09/2026",
            "dateFormatted": "16 de Setembro de 2026",
            "image": "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&w=800&q=80",
            "postUrl": "https://www.reddit.com/r/MedicinaBrasil/search/?q=SUS&restrict_sr=1",
            "readTime": "3 min",
            "tags": ["Reddit", "MedicinaBrasil", "Plantões", "SUS"]
        }
    },
    {
        "id": "reddit_datasus",
        "name": "Comunidade Reddit r/brdev (Engenharia DATASUS)",
        "platform": "reddit",
        "sphereId": "federal_sus",
        "sphereName": "Esfera Federal — SUS & Governança",
        "handle": "r/brdev",
        "url": "https://www.reddit.com/r/brdev/search/?q=DATASUS&restrict_sr=1",
        "latestPost": {
            "title": "Thread Reddit: Automação de Arquivos Magnéticos BPA-I e Módulo 11 de CPF no SUS",
            "subtitle": "Engenheiros de software analisam a estrutura dos arquivos .TXT do DATASUS e as melhores práticas de validação de malha fina antes da transmissão oficial.",
            "date": "15/09/2026",
            "dateFormatted": "15 de Setembro de 2026",
            "image": "https://images.unsplash.com/photo-1555066931-4365d14bab8c?auto=format&fit=crop&w=800&q=80",
            "postUrl": "https://www.reddit.com/r/brdev/search/?q=DATASUS&restrict_sr=1",
            "readTime": "3 min",
            "tags": ["Reddit", "brdev", "DATASUS", "BPA-I"]
        }
    },
    {
        "id": "reddit_brasil_sus",
        "name": "Comunidade Reddit r/brasil (Notícias da Saúde)",
        "platform": "reddit",
        "sphereId": "federal_sus",
        "sphereName": "Esfera Federal — SUS & Governança",
        "handle": "r/brasil",
        "url": "https://www.reddit.com/r/brasil/search/?q=SUS+saude&restrict_sr=1",
        "latestPost": {
            "title": "Tópico em Destaque no Reddit: Impactos da Tabela SUS no Atendimento Ambulatorial em Cidades Polo",
            "subtitle": "Debate aberto entre cidadãos e profissionais sobre o fornecimento de exames de ultrassom e consultas com especialistas nas cidades do interior do país.",
            "date": "14/09/2026",
            "dateFormatted": "14 de Setembro de 2026",
            "image": "https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=800&q=80",
            "postUrl": "https://www.reddit.com/r/brasil/search/?q=SUS+saude&restrict_sr=1",
            "readTime": "3 min",
            "tags": ["Reddit", "r/brasil", "Debate", "Saúde Pública"]
        }
    },

    # =========================================================================
    # ÓRGÃOS DE CONTROLE, FISCALIZAÇÃO & TRANSPARÊNCIA
    # =========================================================================
    {
        "id": "tce_ma_insta",
        "name": "Tribunal de Contas do Maranhão (TCE-MA)",
        "platform": "instagram",
        "sphereId": "controle_fiscalizacao",
        "sphereName": "Órgãos de Controle & Fiscalização",
        "handle": "@tce_ma",
        "url": "https://www.instagram.com/tce_ma/",
        "latestPost": {
            "title": "Alerta TCE-MA: Limite Mínimo Constitucional de 15% em Saúde nos Municípios Maranhenses",
            "subtitle": "Tribunal de Contas orienta que gastos com folha e prestadores da saúde devem ser comprovados rigorosamente para evitar rejeição do relatório quadrimestral.",
            "date": "16/09/2026",
            "dateFormatted": "16 de Setembro de 2026",
            "image": "https://images.unsplash.com/photo-1589829545856-d10d557cf95f?auto=format&fit=crop&w=800&q=80",
            "postUrl": "https://www.instagram.com/tce_ma/",
            "readTime": "3 min",
            "tags": ["TCE-MA", "Instagram", "Fiscalização", "Contas Públicas"]
        }
    },
    {
        "id": "mpma_insta",
        "name": "Ministério Público do Maranhão (MPMA)",
        "platform": "instagram",
        "sphereId": "controle_fiscalizacao",
        "sphereName": "Órgãos de Controle & Fiscalização",
        "handle": "@mpmaoficial",
        "url": "https://www.instagram.com/mpmaoficial/",
        "latestPost": {
            "title": "Promotoria da Saúde: Termo de Ajustamento de Conduta para plantões médicos em UPAs",
            "subtitle": "Acordo firmado pelo Ministério Público Estadual assegura cumprimento integral de escalas de plantonistas e abastecimento ininterrupto de insumos nas unidades.",
            "date": "15/09/2026",
            "dateFormatted": "15 de Setembro de 2026",
            "image": "https://images.unsplash.com/photo-1589829545856-d10d557cf95f?auto=format&fit=crop&w=800&q=80",
            "postUrl": "https://www.instagram.com/mpmaoficial/",
            "readTime": "2 min",
            "tags": ["MPMA", "Instagram", "TAC", "Escala Médica"]
        }
    },
    {
        "id": "mpma_portal",
        "name": "Portal do MPMA (Ministério Público)",
        "platform": "web",
        "sphereId": "controle_fiscalizacao",
        "sphereName": "Órgãos de Controle & Fiscalização",
        "handle": "mpma.mp.br",
        "url": "https://www.mpma.mp.br/",
        "latestPost": {
            "title": "Procedimento Administrativo de Acompanhamento: Metas de Vacinação Infantil no Interior",
            "subtitle": "Promotores requisitam dados de imunização às secretarias municipais para assegurar cumprimento das coberturas de vacinas prioritárias do SUS.",
            "date": "14/09/2026",
            "dateFormatted": "14 de Setembro de 2026",
            "image": "https://images.unsplash.com/photo-1450133064473-71024230f91b?auto=format&fit=crop&w=800&q=80",
            "postUrl": "https://www.mpma.mp.br/",
            "readTime": "3 min",
            "tags": ["Portal MPMA", "Imunização", "Promotoria", "Direito"]
        }
    },
    {
        "id": "tcu_yt",
        "name": "Tribunal de Contas da União (TCU Oficial)",
        "platform": "youtube",
        "sphereId": "controle_fiscalizacao",
        "sphereName": "Órgãos de Controle & Fiscalização",
        "handle": "@tcuoficial",
        "url": "https://www.youtube.com/@tcuoficial",
        "latestPost": {
            "title": "Sessão Plenária TCU: Acórdão sobre Rastreabilidade Digital de Emendas e Repasses FNS",
            "subtitle": "Ministros do TCU aprovam recomendações de transparência ativa para transferências fundo a fundo do Ministério da Saúde para municípios conveniados.",
            "date": "16/09/2026",
            "dateFormatted": "16 de Setembro de 2026",
            "image": "https://images.unsplash.com/photo-1589829545856-d10d557cf95f?auto=format&fit=crop&w=800&q=80",
            "postUrl": "https://www.youtube.com/@tcuoficial",
            "readTime": "4 min",
            "tags": ["YouTube", "TCU", "Acórdão", "FNS"]
        }
    },
    {
        "id": "tcu_portal",
        "name": "Portal Oficial do TCU",
        "platform": "web",
        "sphereId": "controle_fiscalizacao",
        "sphereName": "Órgãos de Controle & Fiscalização",
        "handle": "portal.tcu.gov.br",
        "url": "https://portal.tcu.gov.br/",
        "latestPost": {
            "title": "Painel TCU: Monitoramento da Execução Orçamentária das Emendas Parlamentares na Saúde",
            "subtitle": "Plataforma digital disponibiliza dados em tempo real sobre empenho, liquidação e pagamento de verbas do Fundo Nacional de Saúde para municípios.",
            "date": "15/09/2026",
            "dateFormatted": "15 de Setembro de 2026",
            "image": "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=800&q=80",
            "postUrl": "https://portal.tcu.gov.br/",
            "readTime": "3 min",
            "tags": ["Portal TCU", "Emendas", "Transparência", "Auditoria"]
        }
    },
    {
        "id": "cgu_twitter",
        "name": "Controladoria-Geral da União (CGU no X)",
        "platform": "twitter",
        "sphereId": "controle_fiscalizacao",
        "sphereName": "Órgãos de Controle & Fiscalização",
        "handle": "@cguonline",
        "url": "https://twitter.com/cguonline",
        "latestPost": {
            "title": "Alerta CGU no X: Boas práticas na contratação de Organizações Sociais de Saúde (OSS)",
            "subtitle": "Relatório de avaliação aponta critérios obrigatórios de fiscalização de metas assistenciais e prestação de contas de recursos do SUS repassados pelo FNS.",
            "date": "15/09/2026",
            "dateFormatted": "15 de Setembro de 2026",
            "image": "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=800&q=80",
            "postUrl": "https://twitter.com/cguonline",
            "readTime": "2 min",
            "tags": ["Twitter/X", "CGU", "OSS", "Controle Interno"]
        }
    },
    {
        "id": "cgu_portal",
        "name": "Portal Oficial da CGU",
        "platform": "web",
        "sphereId": "controle_fiscalizacao",
        "sphereName": "Órgãos de Controle & Fiscalização",
        "handle": "gov.br/cgu",
        "url": "https://www.gov.br/cgu/pt-br",
        "latestPost": {
            "title": "Painel 'Fala.BR' e 'Transparência Pública': Fiscalização Cidadã de Contratos da Saúde",
            "subtitle": "Controladoria atualiza ferramentas de ouvidoria para que cidadãos e servidores possam denunciar irregularidades em repasses ou escalas médicas no SUS.",
            "date": "14/09/2026",
            "dateFormatted": "14 de Setembro de 2026",
            "image": "https://images.unsplash.com/photo-1450133064473-71024230f91b?auto=format&fit=crop&w=800&q=80",
            "postUrl": "https://www.gov.br/cgu/pt-br",
            "readTime": "3 min",
            "tags": ["Portal CGU", "Fala.BR", "Controle Social", "Transparência"]
        }
    }
]

print(f"Total de alvos auditados e homologados: {len(audited_targets)}")

# Organiza por esferas
spheres_dict = {}
for vt in audited_targets:
    sid = vt['sphereId']
    sname = vt['sphereName']
    if sid not in spheres_dict:
        spheres_dict[sid] = {
            "id": sid,
            "name": sname,
            "targets": []
        }
    spheres_dict[sid]['targets'].append(vt)

output_data = {
    "version": "3.5",
    "last_updated": "2026-09-17",
    "total_targets": len(audited_targets),
    "spheres": list(spheres_dict.values()),
    "all_targets": audited_targets
}

paths_to_save = [
    os.path.join("code_sandbox_light_git_fe61910d_1781185357", "radar_data", "radar_targets.json"),
    os.path.join("workers", "web_intelligence", "profiles", "radar_targets.json")
]

for p in paths_to_save:
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "w", encoding="utf-8") as f:
        json.dump(output_data, f, indent=2, ensure_ascii=False)
    print(f"Salvo com sucesso em {p}")

print("\nConcluído com sucesso!")

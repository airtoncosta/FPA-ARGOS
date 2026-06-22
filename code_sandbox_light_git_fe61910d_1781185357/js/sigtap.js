const SIGTAP = {
    // 030101 — Consultas
    "0301010072": "Consulta Médica em Atenção Especializada",
    "0301010048": "Consulta de Profissionais de Nível Superior na Atenção Especializada (Exceto Médico)",
    "0301010064": "Consulta Médica em Atenção Básica",
    "0301010030": "Consulta de Profissionais de Nível Superior na Atenção Primária (Exceto Médico)",
    "0301010056": "Consulta Médica em Saúde do Trabalhador",

    // 030106 — Atendimentos de Urgência
    "0301060010": "Diagnóstico e/ou Atendimento de Urgência em Clínica Pediátrica",
    "0301060029": "Atendimento de Urgência c/ Observação até 24 Horas em Atenção Especializada",
    "0301060061": "Atendimento de Urgência em Atenção Especializada",

    // 0202 — Diagnóstico por Laboratório Clínico
    "0214010015": "Glicemia Capilar (Teste Rápido)",
    "0202010385": "Hemograma Completo",
    "0214010023": "Pesquisa de Corpos Cetônicos na Urina (Teste Rápido)",
    "0202010473": "Dosagem de Glicose",
    "0202010474": "Dosagem de Glicose", // Fallback
    "0214010040": "Teste Rápido para Detecção de Infecção pelo HIV em Gestante",
    "0202010295": "Dosagem de Colesterol Total",
    "0202010296": "Dosagem de Colesterol Total", // Fallback
    "0214010058": "Teste Rápido para Detecção de Infecção pelo HIV (População Geral)",
    "0202050017": "Urina Tipo I (EAS)",
    "0202050018": "Urina Tipo I (EAS)", // Fallback
    "0202010318": "Creatinina (Dosagem)",
    "0202010695": "Ureia (Dosagem)",
    "0202010644": "Triglicerídeos (Dosagem)",
    "0202010288": "Colesterol HDL (Dosagem)",
    "0202010270": "Colesterol LDL (Dosagem)",
    "0202010652": "TGO / AST (Dosagem)",
    "0202010660": "TGP / ALT (Dosagem)",
    "0202010121": "Ácido Úrico (Dosagem)",
    "0202080081": "Exame Parasitológico de Fezes (EPF)",
    "0202030300": "Pesquisa de Anticorpos Anti-HIV",
    "0202031170": "VDRL para Detecção de Sífilis",

    // 020204 / 020201 — Diagnóstico por Imagem e Gráfico
    "0211020036": "Eletrocardiograma (ECG)",
    "0204030150": "Eletrocardiograma (ECG)", // Fallback
    "0204030153": "Radiografia de Tórax (PA + Perfil)",
    "0205020046": "Ultrassonografia de Abdômen Total",
    "0205020043": "Ultrassonografia de Abdômen Total", // Fallback
    "0205020143": "Ultrassonografia Obstétrica",
    "0205020140": "Ultrassonografia Obstétrica", // Fallback
    "0205020151": "Ultrassonografia Obstétrica com Doppler",
    "0205020159": "Ultrassonografia Obstétrica com Doppler", // Fallback
    "0205020160": "Ultrassonografia Pélvica (Ginecológica)",
    "0205020183": "Ultrassonografia Transvaginal",
    "0205020054": "Ultrassonografia de Aparelho Urinário",
    "0205020097": "Ultrassonografia Mamária Bilateral",
    "0204030170": "Radiografia de Tórax (PA)",
    "0204030177": "Radiografia de Tórax (PA)", // Fallback
    "0204030188": "Mamografia Bilateral para Rastreamento",
    "0204030030": "Mamografia Bilateral para Rastreamento",

    // 021401 — Hormônios e Marcadores
    "0214010031": "Pesquisa de Glicose na Urina (Teste Rápido)",
    "0202060382": "Dosagem de Tiroxina Livre (T4 Livre)",
    "0202060250": "Dosagem de Hormônio Tireoestimulante (TSH)",
    "0202030105": "Dosagem de Antígeno Prostático Específico (PSA)",

    // Saúde Mental e Assistência Domiciliar
    "0301040036": "Terapia em Grupo (CAPS)",
    "0301040079": "Escuta Inicial / Orientação (Acolhimento de Demanda Espontânea)",
    "0101030010": "Visita Domiciliar por Profissional de Nível Médio (ACS)",
    "0301050147": "Visita Domiciliar por Profissional de Nível Superior",
    "0101030029": "Visita Domiciliar por Profissional de Nível Superior",

    // Fisioterapia e Procedimentos Especiais
    "0302050027": "Atendimento Fisioterapêutico nas Alterações Motoras",
    "0302050026": "Atendimento Fisioterapêutico nas Alterações Motoras", // Fallback
    "0302040013": "Atendimento Fisioterapêutico em Transtornos Respiratórios",
    "0309050048": "Sessão de Psicoterapia Individual",
    "0309050056": "Sessão de Psicoterapia em Grupo",

    // TFD e Transportes (SAMU/Motolância)
    "0803010010": "Ajuda de Custo para Alimentação com Pernoite de Paciente (TFD)",
    "0803010028": "Ajuda de Custo para Alimentação sem Pernoite de Paciente (TFD)",
    "0803010044": "Ajuda de Custo para Alimentação/Pernoite de Acompanhante (TFD)",
    "0301030103": "Atendimento Pré-Hospitalar Móvel - Suporte Básico de Vida (SAMU)",
    "0301030197": "Atendimento Pré-Hospitalar Móvel - Motolância (SAMU)",
    "0301100012": "Administração de Medicamentos na Atenção Especializada",
    "0301100020": "Administração de Medicamentos em Atenção Básica",

    // Outros Procedimentos Odontológicos e Exames
    "0414010020": "Tratamento de Canal em Dentes Permanentes (Endodontia)",
    "0414010098": "Restauração de Dente Decíduo / Permanente (Dentística)",
    "0414020026": "Cirurgia Oral Menor (Exodontia de Dente Permanente)",
    "0414020085": "Raspagem / Alisamento Corono-Radicular (Periodontia)",
    "0414010128": "Aplicação de Selante (Odontologia Preventiva)",
    "0214020012": "Baciloscopia de Escarro (Tuberculose)",
    "0201020033": "Coleta de Material para Exame Citopatológico de Colo de Útero",
    "0203010086": "Exame Citopatológico Cervico Vaginal/Microflora - Rastreamento",
    "0202080030": "Antibiograma p/ Micobactérias"
};

const SIGTAP_SUBGRUPOS = {
    // GRUPO 01
    "0101": "Ações de Promoção e Prevenção em Saúde",
    "0102": "Acolhimento com Classificação de Risco",

    // GRUPO 02
    "0201": "Coleta de Material",
    "0202": "Diagnóstico em Laboratório Clínico",
    "0203": "Diagnóstico por Anatomia Patológica e Citopatologia",
    "0204": "Diagnóstico por Radiologia",
    "0205": "Diagnóstico por Ultrassonografia",
    "0206": "Diagnóstico por Tomografia",
    "0207": "Diagnóstico por Ressonância Magnética",
    "0208": "Diagnóstico por Medicina Nuclear In Vivo",
    "0209": "Diagnóstico por Endoscopia",
    "0210": "Diagnóstico por Radiologia Intervencionista",
    "0211": "Métodos Diagnósticos em Especialidades",
    "0212": "Diagnóstico e Acompanhamento em Odontologia",
    "0213": "Diagnóstico e Acompanhamento em Transplantes",
    "0214": "Exames de Triagem Neonatal",

    // GRUPO 03
    "0301": "Consultas / Atendimentos / Acompanhamentos",
    "0302": "Fisioterapia",
    "0303": "Tratamentos Clínicos (Outras Especialidades)",
    "0304": "Tratamento em Oncologia",
    "0305": "Tratamento em Nefrologia",
    "0306": "Hemoterapia",
    "0307": "Tratamentos Odontológicos",
    "0308": "Tratamento de Lesões, Envenenamentos e Outros",
    "0309": "Terapias Especializadas",
    "0310": "Parto e Nascimento",

    // GRUPO 04
    "0401": "Pequenas Cirurgias e Cirurgias de Pele/Mucosa",
    "0402": "Cirurgia de Glândulas Endócrinas",
    "0403": "Cirurgia do Sistema Nervoso Central e Periférico",
    "0404": "Cirurgia das Vias Aéreas Superiores, da Cabeça e do Pescoço",
    "0405": "Cirurgia do Aparelho da Visão",
    "0406": "Cirurgia do Aparelho Circulatório",
    "0407": "Cirurgia do Aparelho Digestivo e Parede Abdominal",
    "0408": "Cirurgia do Sistema Osteomuscular",
    "0409": "Cirurgia do Aparelho Geniturinário",
    "0410": "Cirurgia de Mama",
    "0411": "Cirurgia Obstétrica",
    "0412": "Cirurgia Torácica",
    "0413": "Cirurgia Reparadora",
    "0414": "Cirurgia Bucomaxilofacial",
    "0415": "Outras Cirurgias",
    "0416": "Cirurgia em Oncologia",

    // GRUPO 05
    "0501": "Coleta e Processamento de Órgãos, Tecidos e Células",
    "0502": "Avaliação de Doador Vivo",
    "0503": "Transplantes",
    "0504": "Acompanhamento Pós-transplante",
    "0505": "Busca Ativa de Doadores",
    "0506": "Outros Relacionados a Transplantes",

    // GRUPO 06
    "0601": "Medicamentos",
    "0602": "Materiais Especiais",
    "0603": "Medicamentos para Doenças Endêmicas e Outros",
    "0604": "Componentes do Sangue e Hemoderivados",

    // GRUPO 07
    "0701": "Órteses, Próteses e Materiais Especiais (OPM)",
    "0702": "OPM em Odontologia",

    // GRUPO 08
    "0801": "Ações Relacionadas ao Estabelecimento de Saúde",
    "0802": "Ações Relacionadas ao Profissional de Saúde",
    "0803": "Ações Relacionadas ao Paciente"
};

// Expor globalmente para os scripts
window.SIGTAP = SIGTAP;
window.SIGTAP_SUBGRUPOS = SIGTAP_SUBGRUPOS;

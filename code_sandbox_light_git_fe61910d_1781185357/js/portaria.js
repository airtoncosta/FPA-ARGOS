/**
 * ARGOS — portaria.js
 * Módulo para gerenciamento, importação e consulta da Portaria de Teto MAC
 */

// Tetos estáticos padrões para municípios do Maranhão (Portaria GM/MS 10.146/2026)
const PORTARIA_DEFAULTS = {
    "MA_MARANHÃO": {
        uf: "MA",
        ibge: "210000",
        name: "MARANHÃO",
        gestao: "Estadual",
        tetoMacSemSamu: 697269421.35,
        samu: 0.00,
        total: 697269421.35
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
    "MA_AFONSO CUNHA": {
        uf: "MA",
        ibge: "210010",
        name: "AFONSO CUNHA",
        gestao: "Municipal",
        tetoMacSemSamu: 93637.03,
        samu: 204750.00,
        total: 298387.03
    },
    "MA_ÁGUA DOCE DO MARANHÃO": {
        uf: "MA",
        ibge: "210015",
        name: "ÁGUA DOCE DO MARANHÃO",
        gestao: "Municipal",
        tetoMacSemSamu: 110084.00,
        samu: 0.00,
        total: 110084.00
    },
    "MA_ALCÂNTARA": {
        uf: "MA",
        ibge: "210020",
        name: "ALCÂNTARA",
        gestao: "Municipal",
        tetoMacSemSamu: 735254.91,
        samu: 0.00,
        total: 735254.91
    },
    "MA_ALDEIAS ALTAS": {
        uf: "MA",
        ibge: "210030",
        name: "ALDEIAS ALTAS",
        gestao: "Municipal",
        tetoMacSemSamu: 1095792.60,
        samu: 341936.40,
        total: 1437729.00
    },
    "MA_ALTAMIRA DO MARANHÃO": {
        uf: "MA",
        ibge: "210040",
        name: "ALTAMIRA DO MARANHÃO",
        gestao: "Municipal",
        tetoMacSemSamu: 20428.40,
        samu: 0.00,
        total: 20428.40
    },
    "MA_ALTO ALEGRE DO MARANHÃO": {
        uf: "MA",
        ibge: "210043",
        name: "ALTO ALEGRE DO MARANHÃO",
        gestao: "Municipal",
        tetoMacSemSamu: 283298.08,
        samu: 0.00,
        total: 283298.08
    },
    "MA_ALTO ALEGRE DO PINDARÉ": {
        uf: "MA",
        ibge: "210047",
        name: "ALTO ALEGRE DO PINDARÉ",
        gestao: "Municipal",
        tetoMacSemSamu: 1584115.87,
        samu: 0.00,
        total: 1584115.87
    },
    "MA_ALTO PARNAÍBA": {
        uf: "MA",
        ibge: "210050",
        name: "ALTO PARNAÍBA",
        gestao: "Municipal",
        tetoMacSemSamu: 17879.80,
        samu: 266175.00,
        total: 284054.80
    },
    "MA_AMAPÁ DO MARANHÃO": {
        uf: "MA",
        ibge: "210055",
        name: "AMAPÁ DO MARANHÃO",
        gestao: "Municipal",
        tetoMacSemSamu: 10560.80,
        samu: 0.00,
        total: 10560.80
    },
    "MA_AMARANTE DO MARANHÃO": {
        uf: "MA",
        ibge: "210060",
        name: "AMARANTE DO MARANHÃO",
        gestao: "Municipal",
        tetoMacSemSamu: 4281371.14,
        samu: 1046955.00,
        total: 5328326.14
    },
    "MA_ANAJATUBA": {
        uf: "MA",
        ibge: "210070",
        name: "ANAJATUBA",
        gestao: "Municipal",
        tetoMacSemSamu: 1074839.11,
        samu: 266175.00,
        total: 1341014.11
    },
    "MA_ANAPURUS": {
        uf: "MA",
        ibge: "210080",
        name: "ANAPURUS",
        gestao: "Municipal",
        tetoMacSemSamu: 354473.54,
        samu: 0.00,
        total: 354473.54
    },
    "MA_APICUM-AÇU": {
        uf: "MA",
        ibge: "210083",
        name: "APICUM-AÇU",
        gestao: "Municipal",
        tetoMacSemSamu: 328332.52,
        samu: 0.00,
        total: 328332.52
    },
    "MA_ARAGUANÃ": {
        uf: "MA",
        ibge: "210087",
        name: "ARAGUANÃ",
        gestao: "Municipal",
        tetoMacSemSamu: 25320.30,
        samu: 0.00,
        total: 25320.30
    },
    "MA_ARAIOESES": {
        uf: "MA",
        ibge: "210090",
        name: "ARAIOESES",
        gestao: "Municipal",
        tetoMacSemSamu: 106872.42,
        samu: 0.00,
        total: 106872.42
    },
    "MA_ARAME": {
        uf: "MA",
        ibge: "210095",
        name: "ARAME",
        gestao: "Municipal",
        tetoMacSemSamu: 1286085.17,
        samu: 0.00,
        total: 1286085.17
    },
    "MA_ARARI": {
        uf: "MA",
        ibge: "210100",
        name: "ARARI",
        gestao: "Municipal",
        tetoMacSemSamu: 1168955.94,
        samu: 266175.00,
        total: 1435130.94
    },
    "MA_AXIXÁ": {
        uf: "MA",
        ibge: "210110",
        name: "AXIXÁ",
        gestao: "Municipal",
        tetoMacSemSamu: 526594.89,
        samu: 0.00,
        total: 526594.89
    },
    "MA_BACABAL": {
        uf: "MA",
        ibge: "210120",
        name: "BACABAL",
        gestao: "Municipal",
        tetoMacSemSamu: 20902405.15,
        samu: 2856945.00,
        total: 23759350.15
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
    "MA_BACURI": {
        uf: "MA",
        ibge: "210130",
        name: "BACURI",
        gestao: "Municipal",
        tetoMacSemSamu: 482435.58,
        samu: 0.00,
        total: 482435.58
    },
    "MA_BACURITUBA": {
        uf: "MA",
        ibge: "210135",
        name: "BACURITUBA",
        gestao: "Municipal",
        tetoMacSemSamu: 9395.00,
        samu: 0.00,
        total: 9395.00
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
    "MA_BARÃO DE GRAJAÚ": {
        uf: "MA",
        ibge: "210150",
        name: "BARÃO DE GRAJAÚ",
        gestao: "Municipal",
        tetoMacSemSamu: 444394.63,
        samu: 0.00,
        total: 444394.63
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
    "MA_BELÁGUA": {
        uf: "MA",
        ibge: "210173",
        name: "BELÁGUA",
        gestao: "Municipal",
        tetoMacSemSamu: 28695.29,
        samu: 0.00,
        total: 28695.29
    },
    "MA_BELA VISTA DO MARANHÃO": {
        uf: "MA",
        ibge: "210177",
        name: "BELA VISTA DO MARANHÃO",
        gestao: "Municipal",
        tetoMacSemSamu: 20012.20,
        samu: 0.00,
        total: 20012.20
    },
    "MA_BENEDITO LEITE": {
        uf: "MA",
        ibge: "210180",
        name: "BENEDITO LEITE",
        gestao: "Municipal",
        tetoMacSemSamu: 90463.63,
        samu: 0.00,
        total: 90463.63
    },
    "MA_BEQUIMÃO": {
        uf: "MA",
        ibge: "210190",
        name: "BEQUIMÃO",
        gestao: "Municipal",
        tetoMacSemSamu: 393656.11,
        samu: 0.00,
        total: 393656.11
    },
    "MA_BERNARDO DO MEARIM": {
        uf: "MA",
        ibge: "210193",
        name: "BERNARDO DO MEARIM",
        gestao: "Municipal",
        tetoMacSemSamu: 29621.57,
        samu: 0.00,
        total: 29621.57
    },
    "MA_BOA VISTA DO GURUPI": {
        uf: "MA",
        ibge: "210197",
        name: "BOA VISTA DO GURUPI",
        gestao: "Municipal",
        tetoMacSemSamu: 13381.80,
        samu: 0.00,
        total: 13381.80
    },
    "MA_BOM JARDIM": {
        uf: "MA",
        ibge: "210200",
        name: "BOM JARDIM",
        gestao: "Municipal",
        tetoMacSemSamu: 1620657.39,
        samu: 0.00,
        total: 1620657.39
    },
    "MA_BOM JESUS DAS SELVAS": {
        uf: "MA",
        ibge: "210203",
        name: "BOM JESUS DAS SELVAS",
        gestao: "Municipal",
        tetoMacSemSamu: 830601.99,
        samu: 0.00,
        total: 830601.99
    },
    "MA_BOM LUGAR": {
        uf: "MA",
        ibge: "210207",
        name: "BOM LUGAR",
        gestao: "Municipal",
        tetoMacSemSamu: 65608.62,
        samu: 0.00,
        total: 65608.62
    },
    "MA_BREJO": {
        uf: "MA",
        ibge: "210210",
        name: "BREJO",
        gestao: "Municipal",
        tetoMacSemSamu: 1164102.25,
        samu: 0.00,
        total: 1164102.25
    },
    "MA_BREJO DE AREIA": {
        uf: "MA",
        ibge: "210215",
        name: "BREJO DE AREIA",
        gestao: "Municipal",
        tetoMacSemSamu: 119795.40,
        samu: 0.00,
        total: 119795.40
    },
    "MA_BURITI": {
        uf: "MA",
        ibge: "210220",
        name: "BURITI",
        gestao: "Municipal",
        tetoMacSemSamu: 278256.59,
        samu: 204750.00,
        total: 483006.59
    },
    "MA_BURITI BRAVO": {
        uf: "MA",
        ibge: "210230",
        name: "BURITI BRAVO",
        gestao: "Municipal",
        tetoMacSemSamu: 2049046.74,
        samu: 444517.32,
        total: 2493564.06
    },
    "MA_BURITICUPU": {
        uf: "MA",
        ibge: "210232",
        name: "BURITICUPU",
        gestao: "Municipal",
        tetoMacSemSamu: 10032100.37,
        samu: 1313130.00,
        total: 11345230.37
    },
    "MA_CACHOEIRA GRANDE": {
        uf: "MA",
        ibge: "210237",
        name: "CACHOEIRA GRANDE",
        gestao: "Municipal",
        tetoMacSemSamu: 80553.35,
        samu: 0.00,
        total: 80553.35
    },
    "MA_CAJAPIÓ": {
        uf: "MA",
        ibge: "210240",
        name: "CAJAPIÓ",
        gestao: "Municipal",
        tetoMacSemSamu: 188315.79,
        samu: 0.00,
        total: 188315.79
    },
    "MA_CAJARI": {
        uf: "MA",
        ibge: "210250",
        name: "CAJARI",
        gestao: "Municipal",
        tetoMacSemSamu: 205327.25,
        samu: 0.00,
        total: 205327.25
    },
    "MA_CAMPESTRE DO MARANHÃO": {
        uf: "MA",
        ibge: "210255",
        name: "CAMPESTRE DO MARANHÃO",
        gestao: "Municipal",
        tetoMacSemSamu: 601154.53,
        samu: 0.00,
        total: 601154.53
    },
    "MA_CÂNDIDO MENDES": {
        uf: "MA",
        ibge: "210260",
        name: "CÂNDIDO MENDES",
        gestao: "Municipal",
        tetoMacSemSamu: 262581.51,
        samu: 0.00,
        total: 262581.51
    },
    "MA_CANTANHEDE": {
        uf: "MA",
        ibge: "210270",
        name: "CANTANHEDE",
        gestao: "Municipal",
        tetoMacSemSamu: 893361.97,
        samu: 0.00,
        total: 893361.97
    },
    "MA_CAPINZAL DO NORTE": {
        uf: "MA",
        ibge: "210275",
        name: "CAPINZAL DO NORTE",
        gestao: "Municipal",
        tetoMacSemSamu: 811740.80,
        samu: 0.00,
        total: 811740.80
    },
    "MA_CAROLINA": {
        uf: "MA",
        ibge: "210280",
        name: "CAROLINA",
        gestao: "Municipal",
        tetoMacSemSamu: 937732.92,
        samu: 266175.00,
        total: 1203907.92
    },
    "MA_CARUTAPERA": {
        uf: "MA",
        ibge: "210290",
        name: "CARUTAPERA",
        gestao: "Municipal",
        tetoMacSemSamu: 572793.66,
        samu: 0.00,
        total: 572793.66
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
    "MA_CEDRAL": {
        uf: "MA",
        ibge: "210310",
        name: "CEDRAL",
        gestao: "Municipal",
        tetoMacSemSamu: 384060.36,
        samu: 0.00,
        total: 384060.36
    },
    "MA_CENTRAL DO MARANHÃO": {
        uf: "MA",
        ibge: "210312",
        name: "CENTRAL DO MARANHÃO",
        gestao: "Municipal",
        tetoMacSemSamu: 136805.10,
        samu: 0.00,
        total: 136805.10
    },
    "MA_CENTRO DO GUILHERME": {
        uf: "MA",
        ibge: "210315",
        name: "CENTRO DO GUILHERME",
        gestao: "Municipal",
        tetoMacSemSamu: 330983.02,
        samu: 0.00,
        total: 330983.02
    },
    "MA_CENTRO NOVO DO MARANHÃO": {
        uf: "MA",
        ibge: "210317",
        name: "CENTRO NOVO DO MARANHÃO",
        gestao: "Municipal",
        tetoMacSemSamu: 74365.60,
        samu: 0.00,
        total: 74365.60
    },
    "MA_CHAPADINHA": {
        uf: "MA",
        ibge: "210320",
        name: "CHAPADINHA",
        gestao: "Municipal",
        tetoMacSemSamu: 12839080.06,
        samu: 805350.00,
        total: 13644430.06
    },
    "MA_CIDELÂNDIA": {
        uf: "MA",
        ibge: "210325",
        name: "CIDELÂNDIA",
        gestao: "Municipal",
        tetoMacSemSamu: 641956.15,
        samu: 266175.00,
        total: 908131.15
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
    "MA_COELHO NETO": {
        uf: "MA",
        ibge: "210340",
        name: "COELHO NETO",
        gestao: "Municipal",
        tetoMacSemSamu: 9504581.65,
        samu: 204750.00,
        total: 9709331.65
    },
    "MA_COLINAS": {
        uf: "MA",
        ibge: "210350",
        name: "COLINAS",
        gestao: "Municipal",
        tetoMacSemSamu: 8303276.62,
        samu: 1244096.88,
        total: 9547373.50
    },
    "MA_CONCEIÇÃO DO LAGO-AÇU": {
        uf: "MA",
        ibge: "210355",
        name: "CONCEIÇÃO DO LAGO-AÇU",
        gestao: "Municipal",
        tetoMacSemSamu: 40005.54,
        samu: 0.00,
        total: 40005.54
    },
    "MA_COROATÁ": {
        uf: "MA",
        ibge: "210360",
        name: "COROATÁ",
        gestao: "Municipal",
        tetoMacSemSamu: 7918921.20,
        samu: 3087630.00,
        total: 11006551.20
    },
    "MA_CURURUPU": {
        uf: "MA",
        ibge: "210370",
        name: "CURURUPU",
        gestao: "Municipal",
        tetoMacSemSamu: 1451233.73,
        samu: 0.00,
        total: 1451233.73
    },
    "MA_DAVINÓPOLIS": {
        uf: "MA",
        ibge: "210375",
        name: "DAVINÓPOLIS",
        gestao: "Municipal",
        tetoMacSemSamu: 26694.54,
        samu: 0.00,
        total: 26694.54
    },
    "MA_DOM PEDRO": {
        uf: "MA",
        ibge: "210380",
        name: "DOM PEDRO",
        gestao: "Municipal",
        tetoMacSemSamu: 2277950.21,
        samu: 266175.00,
        total: 2544125.21
    },
    "MA_DUQUE BACELAR": {
        uf: "MA",
        ibge: "210390",
        name: "DUQUE BACELAR",
        gestao: "Municipal",
        tetoMacSemSamu: 66501.52,
        samu: 341936.40,
        total: 408437.92
    },
    "MA_ESPERANTINÓPOLIS": {
        uf: "MA",
        ibge: "210400",
        name: "ESPERANTINÓPOLIS",
        gestao: "Municipal",
        tetoMacSemSamu: 1938410.70,
        samu: 0.00,
        total: 1938410.70
    },
    "MA_ESTREITO": {
        uf: "MA",
        ibge: "210405",
        name: "ESTREITO",
        gestao: "Municipal",
        tetoMacSemSamu: 1551081.18,
        samu: 266175.00,
        total: 1817256.18
    },
    "MA_FEIRA NOVA DO MARANHÃO": {
        uf: "MA",
        ibge: "210407",
        name: "FEIRA NOVA DO MARANHÃO",
        gestao: "Municipal",
        tetoMacSemSamu: 198446.22,
        samu: 0.00,
        total: 198446.22
    },
    "MA_FERNANDO FALCÃO": {
        uf: "MA",
        ibge: "210408",
        name: "FERNANDO FALCÃO",
        gestao: "Municipal",
        tetoMacSemSamu: 118169.44,
        samu: 0.00,
        total: 118169.44
    },
    "MA_FORMOSA DA SERRA NEGRA": {
        uf: "MA",
        ibge: "210409",
        name: "FORMOSA DA SERRA NEGRA",
        gestao: "Municipal",
        tetoMacSemSamu: 1836588.19,
        samu: 0.00,
        total: 1836588.19
    },
    "MA_FORTALEZA DOS NOGUEIRAS": {
        uf: "MA",
        ibge: "210410",
        name: "FORTALEZA DOS NOGUEIRAS",
        gestao: "Municipal",
        tetoMacSemSamu: 395853.94,
        samu: 0.00,
        total: 395853.94
    },
    "MA_FORTUNA": {
        uf: "MA",
        ibge: "210420",
        name: "FORTUNA",
        gestao: "Municipal",
        tetoMacSemSamu: 1153318.02,
        samu: 0.00,
        total: 1153318.02
    },
    "MA_GODOFREDO VIANA": {
        uf: "MA",
        ibge: "210430",
        name: "GODOFREDO VIANA",
        gestao: "Municipal",
        tetoMacSemSamu: 40276.80,
        samu: 0.00,
        total: 40276.80
    },
    "MA_GONÇALVES DIAS": {
        uf: "MA",
        ibge: "210440",
        name: "GONÇALVES DIAS",
        gestao: "Municipal",
        tetoMacSemSamu: 1494516.40,
        samu: 0.00,
        total: 1494516.40
    },
    "MA_GOVERNADOR ARCHER": {
        uf: "MA",
        ibge: "210450",
        name: "GOVERNADOR ARCHER",
        gestao: "Municipal",
        tetoMacSemSamu: 331883.61,
        samu: 0.00,
        total: 331883.61
    },
    "MA_GOVERNADOR EDISON LOBÃO": {
        uf: "MA",
        ibge: "210455",
        name: "GOVERNADOR EDISON LOBÃO",
        gestao: "Municipal",
        tetoMacSemSamu: 423277.01,
        samu: 0.00,
        total: 423277.01
    },
    "MA_GOVERNADOR EUGÊNIO BARROS": {
        uf: "MA",
        ibge: "210460",
        name: "GOVERNADOR EUGÊNIO BARROS",
        gestao: "Municipal",
        tetoMacSemSamu: 537329.60,
        samu: 0.00,
        total: 537329.60
    },
    "MA_GOVERNADOR LUIZ ROCHA": {
        uf: "MA",
        ibge: "210462",
        name: "GOVERNADOR LUIZ ROCHA",
        gestao: "Municipal",
        tetoMacSemSamu: 214351.28,
        samu: 0.00,
        total: 214351.28
    },
    "MA_GOVERNADOR NEWTON BELLO": {
        uf: "MA",
        ibge: "210465",
        name: "GOVERNADOR NEWTON BELLO",
        gestao: "Municipal",
        tetoMacSemSamu: 1050127.62,
        samu: 0.00,
        total: 1050127.62
    },
    "MA_GOVERNADOR NUNES FREIRE": {
        uf: "MA",
        ibge: "210467",
        name: "GOVERNADOR NUNES FREIRE",
        gestao: "Municipal",
        tetoMacSemSamu: 5455386.05,
        samu: 0.00,
        total: 5455386.05
    },
    "MA_GRAÇA ARANHA": {
        uf: "MA",
        ibge: "210470",
        name: "GRAÇA ARANHA",
        gestao: "Municipal",
        tetoMacSemSamu: 243222.48,
        samu: 0.00,
        total: 243222.48
    },
    "MA_GRAJAÚ": {
        uf: "MA",
        ibge: "210480",
        name: "GRAJAÚ",
        gestao: "Municipal",
        tetoMacSemSamu: 11538865.70,
        samu: 1579305.00,
        total: 13118170.70
    },
    "MA_GUIMARÃES": {
        uf: "MA",
        ibge: "210490",
        name: "GUIMARÃES",
        gestao: "Municipal",
        tetoMacSemSamu: 787137.91,
        samu: 0.00,
        total: 787137.91
    },
    "MA_HUMBERTO DE CAMPOS": {
        uf: "MA",
        ibge: "210500",
        name: "HUMBERTO DE CAMPOS",
        gestao: "Municipal",
        tetoMacSemSamu: 646583.30,
        samu: 0.00,
        total: 646583.30
    },
    "MA_ICATU": {
        uf: "MA",
        ibge: "210510",
        name: "ICATU",
        gestao: "Municipal",
        tetoMacSemSamu: 1018394.72,
        samu: 0.00,
        total: 1018394.72
    },
    "MA_IGARAPÉ DO MEIO": {
        uf: "MA",
        ibge: "210515",
        name: "IGARAPÉ DO MEIO",
        gestao: "Municipal",
        tetoMacSemSamu: 112085.12,
        samu: 0.00,
        total: 112085.12
    },
    "MA_IGARAPÉ GRANDE": {
        uf: "MA",
        ibge: "210520",
        name: "IGARAPÉ GRANDE",
        gestao: "Municipal",
        tetoMacSemSamu: 404879.09,
        samu: 0.00,
        total: 404879.09
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
    "MA_ITAIPAVA DO GRAJAÚ": {
        uf: "MA",
        ibge: "210535",
        name: "ITAIPAVA DO GRAJAÚ",
        gestao: "Municipal",
        tetoMacSemSamu: 545930.23,
        samu: 0.00,
        total: 545930.23
    },
    "MA_ITAPECURU MIRIM": {
        uf: "MA",
        ibge: "210540",
        name: "ITAPECURU MIRIM",
        gestao: "Municipal",
        tetoMacSemSamu: 3610676.87,
        samu: 0.00,
        total: 3610676.87
    },
    "MA_ITINGA DO MARANHÃO": {
        uf: "MA",
        ibge: "210542",
        name: "ITINGA DO MARANHÃO",
        gestao: "Municipal",
        tetoMacSemSamu: 975348.47,
        samu: 266175.00,
        total: 1241523.47
    },
    "MA_JATOBÁ": {
        uf: "MA",
        ibge: "210545",
        name: "JATOBÁ",
        gestao: "Municipal",
        tetoMacSemSamu: 77123.05,
        samu: 0.00,
        total: 77123.05
    },
    "MA_JENIPAPO DOS VIEIRAS": {
        uf: "MA",
        ibge: "210547",
        name: "JENIPAPO DOS VIEIRAS",
        gestao: "Municipal",
        tetoMacSemSamu: 348041.94,
        samu: 0.00,
        total: 348041.94
    },
    "MA_JOÃO LISBOA": {
        uf: "MA",
        ibge: "210550",
        name: "JOÃO LISBOA",
        gestao: "Municipal",
        tetoMacSemSamu: 1927787.39,
        samu: 0.00,
        total: 1927787.39
    },
    "MA_JOSELÂNDIA": {
        uf: "MA",
        ibge: "210560",
        name: "JOSELÂNDIA",
        gestao: "Municipal",
        tetoMacSemSamu: 893311.08,
        samu: 0.00,
        total: 893311.08
    },
    "MA_JUNCO DO MARANHÃO": {
        uf: "MA",
        ibge: "210565",
        name: "JUNCO DO MARANHÃO",
        gestao: "Municipal",
        tetoMacSemSamu: 37493.03,
        samu: 0.00,
        total: 37493.03
    },
    "MA_LAGO DA PEDRA": {
        uf: "MA",
        ibge: "210570",
        name: "LAGO DA PEDRA",
        gestao: "Municipal",
        tetoMacSemSamu: 5611195.14,
        samu: 0.00,
        total: 5611195.14
    },
    "MA_LAGO DO JUNCO": {
        uf: "MA",
        ibge: "210580",
        name: "LAGO DO JUNCO",
        gestao: "Municipal",
        tetoMacSemSamu: 382430.72,
        samu: 0.00,
        total: 382430.72
    },
    "MA_LAGO VERDE": {
        uf: "MA",
        ibge: "210590",
        name: "LAGO VERDE",
        gestao: "Municipal",
        tetoMacSemSamu: 26559.50,
        samu: 0.00,
        total: 26559.50
    },
    "MA_LAGOA DO MATO": {
        uf: "MA",
        ibge: "210592",
        name: "LAGOA DO MATO",
        gestao: "Municipal",
        tetoMacSemSamu: 32558.40,
        samu: 0.00,
        total: 32558.40
    },
    "MA_LAGO DOS RODRIGUES": {
        uf: "MA",
        ibge: "210594",
        name: "LAGO DOS RODRIGUES",
        gestao: "Municipal",
        tetoMacSemSamu: 15121.07,
        samu: 0.00,
        total: 15121.07
    },
    "MA_LAGOA GRANDE DO MARANHÃO": {
        uf: "MA",
        ibge: "210596",
        name: "LAGOA GRANDE DO MARANHÃO",
        gestao: "Municipal",
        tetoMacSemSamu: 99358.75,
        samu: 0.00,
        total: 99358.75
    },
    "MA_LAJEADO NOVO": {
        uf: "MA",
        ibge: "210598",
        name: "LAJEADO NOVO",
        gestao: "Municipal",
        tetoMacSemSamu: 22278.99,
        samu: 0.00,
        total: 22278.99
    },
    "MA_LIMA CAMPOS": {
        uf: "MA",
        ibge: "210600",
        name: "LIMA CAMPOS",
        gestao: "Municipal",
        tetoMacSemSamu: 977907.02,
        samu: 266175.00,
        total: 1244082.02
    },
    "MA_LORETO": {
        uf: "MA",
        ibge: "210610",
        name: "LORETO",
        gestao: "Municipal",
        tetoMacSemSamu: 385438.43,
        samu: 0.00,
        total: 385438.43
    },
    "MA_LUÍS DOMINGUES": {
        uf: "MA",
        ibge: "210620",
        name: "LUÍS DOMINGUES",
        gestao: "Municipal",
        tetoMacSemSamu: 18049.95,
        samu: 0.00,
        total: 18049.95
    },
    "MA_MAGALHÃES DE ALMEIDA": {
        uf: "MA",
        ibge: "210630",
        name: "MAGALHÃES DE ALMEIDA",
        gestao: "Municipal",
        tetoMacSemSamu: 402524.66,
        samu: 0.00,
        total: 402524.66
    },
    "MA_MARACAÇUMÉ": {
        uf: "MA",
        ibge: "210632",
        name: "MARACAÇUMÉ",
        gestao: "Municipal",
        tetoMacSemSamu: 301570.41,
        samu: 0.00,
        total: 301570.41
    },
    "MA_MARAJÁ DO SENA": {
        uf: "MA",
        ibge: "210635",
        name: "MARAJÁ DO SENA",
        gestao: "Municipal",
        tetoMacSemSamu: 13680.00,
        samu: 0.00,
        total: 13680.00
    },
    "MA_MARANHÃOZINHO": {
        uf: "MA",
        ibge: "210637",
        name: "MARANHÃOZINHO",
        gestao: "Municipal",
        tetoMacSemSamu: 228213.43,
        samu: 0.00,
        total: 228213.43
    },
    "MA_MATA ROMA": {
        uf: "MA",
        ibge: "210640",
        name: "MATA ROMA",
        gestao: "Municipal",
        tetoMacSemSamu: 1330078.41,
        samu: 0.00,
        total: 1330078.41
    },
    "MA_MATINHA": {
        uf: "MA",
        ibge: "210650",
        name: "MATINHA",
        gestao: "Municipal",
        tetoMacSemSamu: 1158746.81,
        samu: 0.00,
        total: 1158746.81
    },
    "MA_MATÕES": {
        uf: "MA",
        ibge: "210660",
        name: "MATÕES",
        gestao: "Municipal",
        tetoMacSemSamu: 1176260.25,
        samu: 204750.00,
        total: 1381010.25
    },
    "MA_MATÕES DO NORTE": {
        uf: "MA",
        ibge: "210663",
        name: "MATÕES DO NORTE",
        gestao: "Municipal",
        tetoMacSemSamu: 215700.74,
        samu: 0.00,
        total: 215700.74
    },
    "MA_MILAGRES DO MARANHÃO": {
        uf: "MA",
        ibge: "210667",
        name: "MILAGRES DO MARANHÃO",
        gestao: "Municipal",
        tetoMacSemSamu: 426459.28,
        samu: 0.00,
        total: 426459.28
    },
    "MA_MIRADOR": {
        uf: "MA",
        ibge: "210670",
        name: "MIRADOR",
        gestao: "Municipal",
        tetoMacSemSamu: 1951786.03,
        samu: 0.00,
        total: 1951786.03
    },
    "MA_MIRANDA DO NORTE": {
        uf: "MA",
        ibge: "210675",
        name: "MIRANDA DO NORTE",
        gestao: "Municipal",
        tetoMacSemSamu: 1071743.71,
        samu: 0.00,
        total: 1071743.71
    },
    "MA_MIRINZAL": {
        uf: "MA",
        ibge: "210680",
        name: "MIRINZAL",
        gestao: "Municipal",
        tetoMacSemSamu: 621004.29,
        samu: 0.00,
        total: 621004.29
    },
    "MA_MONÇÃO": {
        uf: "MA",
        ibge: "210690",
        name: "MONÇÃO",
        gestao: "Municipal",
        tetoMacSemSamu: 584549.22,
        samu: 0.00,
        total: 584549.22
    },
    "MA_MONTES ALTOS": {
        uf: "MA",
        ibge: "210700",
        name: "MONTES ALTOS",
        gestao: "Municipal",
        tetoMacSemSamu: 267118.00,
        samu: 0.00,
        total: 267118.00
    },
    "MA_MORROS": {
        uf: "MA",
        ibge: "210710",
        name: "MORROS",
        gestao: "Municipal",
        tetoMacSemSamu: 360134.60,
        samu: 0.00,
        total: 360134.60
    },
    "MA_NINA RODRIGUES": {
        uf: "MA",
        ibge: "210720",
        name: "NINA RODRIGUES",
        gestao: "Municipal",
        tetoMacSemSamu: 374282.55,
        samu: 0.00,
        total: 374282.55
    },
    "MA_NOVA COLINAS": {
        uf: "MA",
        ibge: "210725",
        name: "NOVA COLINAS",
        gestao: "Municipal",
        tetoMacSemSamu: 125792.61,
        samu: 0.00,
        total: 125792.61
    },
    "MA_NOVA IORQUE": {
        uf: "MA",
        ibge: "210730",
        name: "NOVA IORQUE",
        gestao: "Municipal",
        tetoMacSemSamu: 17074.51,
        samu: 0.00,
        total: 17074.51
    },
    "MA_NOVA OLINDA DO MARANHÃO": {
        uf: "MA",
        ibge: "210735",
        name: "NOVA OLINDA DO MARANHÃO",
        gestao: "Municipal",
        tetoMacSemSamu: 294345.73,
        samu: 0.00,
        total: 294345.73
    },
    "MA_OLHO D'ÁGUA DAS CUNHÃS": {
        uf: "MA",
        ibge: "210740",
        name: "OLHO D'ÁGUA DAS CUNHÃS",
        gestao: "Municipal",
        tetoMacSemSamu: 615888.34,
        samu: 0.00,
        total: 615888.34
    },
    "MA_OLINDA NOVA DO MARANHÃO": {
        uf: "MA",
        ibge: "210745",
        name: "OLINDA NOVA DO MARANHÃO",
        gestao: "Municipal",
        tetoMacSemSamu: 862364.18,
        samu: 0.00,
        total: 862364.18
    },
    "MA_PAÇO DO LUMIAR": {
        uf: "MA",
        ibge: "210750",
        name: "PAÇO DO LUMIAR",
        gestao: "Municipal",
        tetoMacSemSamu: 4489975.65,
        samu: 0.00,
        total: 4489975.65
    },
    "MA_PALMEIRÂNDIA": {
        uf: "MA",
        ibge: "210760",
        name: "PALMEIRÂNDIA",
        gestao: "Municipal",
        tetoMacSemSamu: 1068200.94,
        samu: 0.00,
        total: 1068200.94
    },
    "MA_PARAIBANO": {
        uf: "MA",
        ibge: "210770",
        name: "PARAIBANO",
        gestao: "Municipal",
        tetoMacSemSamu: 1515991.32,
        samu: 0.00,
        total: 1515991.32
    },
    "MA_PARNARAMA": {
        uf: "MA",
        ibge: "210780",
        name: "PARNARAMA",
        gestao: "Municipal",
        tetoMacSemSamu: 2596928.76,
        samu: 341936.40,
        total: 2938865.16
    },
    "MA_PASSAGEM FRANCA": {
        uf: "MA",
        ibge: "210790",
        name: "PASSAGEM FRANCA",
        gestao: "Municipal",
        tetoMacSemSamu: 1992333.33,
        samu: 0.00,
        total: 1992333.33
    },
    "MA_PASTOS BONS": {
        uf: "MA",
        ibge: "210800",
        name: "PASTOS BONS",
        gestao: "Municipal",
        tetoMacSemSamu: 1915989.61,
        samu: 1046955.00,
        total: 2962944.61
    },
    "MA_PAULINO NEVES": {
        uf: "MA",
        ibge: "210805",
        name: "PAULINO NEVES",
        gestao: "Municipal",
        tetoMacSemSamu: 207255.64,
        samu: 0.00,
        total: 207255.64
    },
    "MA_PAULO RAMOS": {
        uf: "MA",
        ibge: "210810",
        name: "PAULO RAMOS",
        gestao: "Municipal",
        tetoMacSemSamu: 802447.24,
        samu: 0.00,
        total: 802447.24
    },
    "MA_PEDREIRAS": {
        uf: "MA",
        ibge: "210820",
        name: "PEDREIRAS",
        gestao: "Municipal",
        tetoMacSemSamu: 7467405.61,
        samu: 0.00,
        total: 7467405.61
    },
    "MA_PEDRO DO ROSÁRIO": {
        uf: "MA",
        ibge: "210825",
        name: "PEDRO DO ROSÁRIO",
        gestao: "Municipal",
        tetoMacSemSamu: 1019662.21,
        samu: 0.00,
        total: 1019662.21
    },
    "MA_PENALVA": {
        uf: "MA",
        ibge: "210830",
        name: "PENALVA",
        gestao: "Municipal",
        tetoMacSemSamu: 1064135.68,
        samu: 0.00,
        total: 1064135.68
    },
    "MA_PERI MIRIM": {
        uf: "MA",
        ibge: "210840",
        name: "PERI MIRIM",
        gestao: "Municipal",
        tetoMacSemSamu: 227679.44,
        samu: 0.00,
        total: 227679.44
    },
    "MA_PERITORÓ": {
        uf: "MA",
        ibge: "210845",
        name: "PERITORÓ",
        gestao: "Municipal",
        tetoMacSemSamu: 964501.44,
        samu: 266175.00,
        total: 1230676.44
    },
    "MA_PINDARÉ-MIRIM": {
        uf: "MA",
        ibge: "210850",
        name: "PINDARÉ-MIRIM",
        gestao: "Municipal",
        tetoMacSemSamu: 964894.56,
        samu: 0.00,
        total: 964894.56
    },
    "MA_PINHEIRO": {
        uf: "MA",
        ibge: "210860",
        name: "PINHEIRO",
        gestao: "Municipal",
        tetoMacSemSamu: 20990527.53,
        samu: 2933785.92,
        total: 23924313.45
    },
    "MA_PIO XII": {
        uf: "MA",
        ibge: "210870",
        name: "PIO XII",
        gestao: "Municipal",
        tetoMacSemSamu: 1340691.29,
        samu: 0.00,
        total: 1340691.29
    },
    "MA_PIRAPEMAS": {
        uf: "MA",
        ibge: "210880",
        name: "PIRAPEMAS",
        gestao: "Municipal",
        tetoMacSemSamu: 549374.88,
        samu: 0.00,
        total: 549374.88
    },
    "MA_POÇÃO DE PEDRAS": {
        uf: "MA",
        ibge: "210890",
        name: "POÇÃO DE PEDRAS",
        gestao: "Municipal",
        tetoMacSemSamu: 2046267.54,
        samu: 0.00,
        total: 2046267.54
    },
    "MA_PORTO FRANCO": {
        uf: "MA",
        ibge: "210900",
        name: "PORTO FRANCO",
        gestao: "Municipal",
        tetoMacSemSamu: 10946910.10,
        samu: 2573025.00,
        total: 13519935.10
    },
    "MA_PORTO RICO DO MARANHÃO": {
        uf: "MA",
        ibge: "210905",
        name: "PORTO RICO DO MARANHÃO",
        gestao: "Municipal",
        tetoMacSemSamu: 13194.25,
        samu: 0.00,
        total: 13194.25
    },
    "MA_PRESIDENTE DUTRA": {
        uf: "MA",
        ibge: "210910",
        name: "PRESIDENTE DUTRA",
        gestao: "Municipal",
        tetoMacSemSamu: 4636342.66,
        samu: 1046955.00,
        total: 5683297.66
    },
    "MA_PRESIDENTE JUSCELINO": {
        uf: "MA",
        ibge: "210920",
        name: "PRESIDENTE JUSCELINO",
        gestao: "Municipal",
        tetoMacSemSamu: 397536.44,
        samu: 0.00,
        total: 397536.44
    },
    "MA_PRESIDENTE MÉDICI": {
        uf: "MA",
        ibge: "210923",
        name: "PRESIDENTE MÉDICI",
        gestao: "Municipal",
        tetoMacSemSamu: 94814.09,
        samu: 0.00,
        total: 94814.09
    },
    "MA_PRESIDENTE SARNEY": {
        uf: "MA",
        ibge: "210927",
        name: "PRESIDENTE SARNEY",
        gestao: "Municipal",
        tetoMacSemSamu: 121706.64,
        samu: 0.00,
        total: 121706.64
    },
    "MA_PRESIDENTE VARGAS": {
        uf: "MA",
        ibge: "210930",
        name: "PRESIDENTE VARGAS",
        gestao: "Municipal",
        tetoMacSemSamu: 268016.71,
        samu: 0.00,
        total: 268016.71
    },
    "MA_PRIMEIRA CRUZ": {
        uf: "MA",
        ibge: "210940",
        name: "PRIMEIRA CRUZ",
        gestao: "Municipal",
        tetoMacSemSamu: 403697.44,
        samu: 0.00,
        total: 403697.44
    },
    "MA_RAPOSA": {
        uf: "MA",
        ibge: "210945",
        name: "RAPOSA",
        gestao: "Municipal",
        tetoMacSemSamu: 1294942.24,
        samu: 0.00,
        total: 1294942.24
    },
    "MA_RIACHÃO": {
        uf: "MA",
        ibge: "210950",
        name: "RIACHÃO",
        gestao: "Municipal",
        tetoMacSemSamu: 1331267.22,
        samu: 0.00,
        total: 1331267.22
    },
    "MA_RIBAMAR FIQUEINE": {
        uf: "MA",
        ibge: "210955",
        name: "RIBAMAR FIQUEINE",
        gestao: "Municipal",
        tetoMacSemSamu: 11873.20,
        samu: 0.00,
        total: 11873.20
    },
    "MA_ROSÁRIO": {
        uf: "MA",
        ibge: "210960",
        name: "ROSÁRIO",
        gestao: "Municipal",
        tetoMacSemSamu: 1747607.18,
        samu: 532350.00,
        total: 2279957.18
    },
    "MA_SAMBAÍBA": {
        uf: "MA",
        ibge: "210970",
        name: "SAMBAÍBA",
        gestao: "Municipal",
        tetoMacSemSamu: 183509.66,
        samu: 0.00,
        total: 183509.66
    },
    "MA_SANTA FILOMENA DO MARANHÃO": {
        uf: "MA",
        ibge: "210975",
        name: "SANTA FILOMENA DO MARANHÃO",
        gestao: "Municipal",
        tetoMacSemSamu: 211232.50,
        samu: 0.00,
        total: 211232.50
    },
    "MA_SANTA HELENA": {
        uf: "MA",
        ibge: "210980",
        name: "SANTA HELENA",
        gestao: "Municipal",
        tetoMacSemSamu: 1768127.95,
        samu: 0.00,
        total: 1768127.95
    },
    "MA_SANTA INÊS": {
        uf: "MA",
        ibge: "210990",
        name: "SANTA INÊS",
        gestao: "Municipal",
        tetoMacSemSamu: 14096538.87,
        samu: 0.00,
        total: 14096538.87
    },
    "MA_SANTA LUZIA": {
        uf: "MA",
        ibge: "211000",
        name: "SANTA LUZIA",
        gestao: "Municipal",
        tetoMacSemSamu: 5960880.31,
        samu: 0.00,
        total: 5960880.31
    },
    "MA_SANTA LUZIA DO PARUÁ": {
        uf: "MA",
        ibge: "211003",
        name: "SANTA LUZIA DO PARUÁ",
        gestao: "Municipal",
        tetoMacSemSamu: 918484.24,
        samu: 0.00,
        total: 918484.24
    },
    "MA_SANTA QUITÉRIA DO MARANHÃO": {
        uf: "MA",
        ibge: "211010",
        name: "SANTA QUITÉRIA DO MARANHÃO",
        gestao: "Municipal",
        tetoMacSemSamu: 1012370.75,
        samu: 0.00,
        total: 1012370.75
    },
    "MA_SANTA RITA": {
        uf: "MA",
        ibge: "211020",
        name: "SANTA RITA",
        gestao: "Municipal",
        tetoMacSemSamu: 2108474.55,
        samu: 1422439.20,
        total: 3530913.75
    },
    "MA_SANTANA DO MARANHÃO": {
        uf: "MA",
        ibge: "211023",
        name: "SANTANA DO MARANHÃO",
        gestao: "Municipal",
        tetoMacSemSamu: 294938.10,
        samu: 0.00,
        total: 294938.10
    },
    "MA_SANTO AMARO DO MARANHÃO": {
        uf: "MA",
        ibge: "211027",
        name: "SANTO AMARO DO MARANHÃO",
        gestao: "Municipal",
        tetoMacSemSamu: 374166.72,
        samu: 0.00,
        total: 374166.72
    },
    "MA_SANTO ANTÔNIO DOS LOPES": {
        uf: "MA",
        ibge: "211030",
        name: "SANTO ANTÔNIO DOS LOPES",
        gestao: "Municipal",
        tetoMacSemSamu: 940491.26,
        samu: 0.00,
        total: 940491.26
    },
    "MA_SÃO BENEDITO DO RIO PRETO": {
        uf: "MA",
        ibge: "211040",
        name: "SÃO BENEDITO DO RIO PRETO",
        gestao: "Municipal",
        tetoMacSemSamu: 397906.27,
        samu: 0.00,
        total: 397906.27
    },
    "MA_SÃO BENTO": {
        uf: "MA",
        ibge: "211050",
        name: "SÃO BENTO",
        gestao: "Municipal",
        tetoMacSemSamu: 1622159.24,
        samu: 0.00,
        total: 1622159.24
    },
    "MA_SÃO BERNARDO": {
        uf: "MA",
        ibge: "211060",
        name: "SÃO BERNARDO",
        gestao: "Municipal",
        tetoMacSemSamu: 968704.88,
        samu: 0.00,
        total: 968704.88
    },
    "MA_SÃO DOMINGOS DO AZEITÃO": {
        uf: "MA",
        ibge: "211065",
        name: "SÃO DOMINGOS DO AZEITÃO",
        gestao: "Municipal",
        tetoMacSemSamu: 121895.39,
        samu: 0.00,
        total: 121895.39
    },
    "MA_SÃO DOMINGOS DO MARANHÃO": {
        uf: "MA",
        ibge: "211070",
        name: "SÃO DOMINGOS DO MARANHÃO",
        gestao: "Municipal",
        tetoMacSemSamu: 2363780.40,
        samu: 266175.00,
        total: 2629955.40
    },
    "MA_SÃO FÉLIX DE BALSAS": {
        uf: "MA",
        ibge: "211080",
        name: "SÃO FÉLIX DE BALSAS",
        gestao: "Municipal",
        tetoMacSemSamu: 175980.28,
        samu: 0.00,
        total: 175980.28
    },
    "MA_SÃO FRANCISCO DO BREJÃO": {
        uf: "MA",
        ibge: "211085",
        name: "SÃO FRANCISCO DO BREJÃO",
        gestao: "Municipal",
        tetoMacSemSamu: 225699.75,
        samu: 0.00,
        total: 225699.75
    },
    "MA_SÃO FRANCISCO DO MARANHÃO": {
        uf: "MA",
        ibge: "211090",
        name: "SÃO FRANCISCO DO MARANHÃO",
        gestao: "Municipal",
        tetoMacSemSamu: 306583.10,
        samu: 805350.00,
        total: 1111933.10
    },
    "MA_SÃO JOÃO BATISTA": {
        uf: "MA",
        ibge: "211100",
        name: "SÃO JOÃO BATISTA",
        gestao: "Municipal",
        tetoMacSemSamu: 1080260.25,
        samu: 0.00,
        total: 1080260.25
    },
    "MA_SÃO JOÃO DO CARÚ": {
        uf: "MA",
        ibge: "211102",
        name: "SÃO JOÃO DO CARÚ",
        gestao: "Municipal",
        tetoMacSemSamu: 505600.42,
        samu: 0.00,
        total: 505600.42
    },
    "MA_SÃO JOÃO DO PARAÍSO": {
        uf: "MA",
        ibge: "211105",
        name: "SÃO JOÃO DO PARAÍSO",
        gestao: "Municipal",
        tetoMacSemSamu: 28456.90,
        samu: 0.00,
        total: 28456.90
    },
    "MA_SÃO JOÃO DO SOTER": {
        uf: "MA",
        ibge: "211107",
        name: "SÃO JOÃO DO SOTER",
        gestao: "Municipal",
        tetoMacSemSamu: 991024.92,
        samu: 266175.00,
        total: 1257199.92
    },
    "MA_SÃO JOÃO DOS PATOS": {
        uf: "MA",
        ibge: "211110",
        name: "SÃO JOÃO DOS PATOS",
        gestao: "Municipal",
        tetoMacSemSamu: 2959757.24,
        samu: 204750.00,
        total: 3164507.24
    },
    "MA_SÃO JOSÉ DE RIBAMAR": {
        uf: "MA",
        ibge: "211120",
        name: "SÃO JOSÉ DE RIBAMAR",
        gestao: "Municipal",
        tetoMacSemSamu: 8631609.44,
        samu: 1046955.00,
        total: 9678564.44
    },
    "MA_SÃO JOSÉ DOS BASÍLIOS": {
        uf: "MA",
        ibge: "211125",
        name: "SÃO JOSÉ DOS BASÍLIOS",
        gestao: "Municipal",
        tetoMacSemSamu: 217738.75,
        samu: 0.00,
        total: 217738.75
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
    "MA_SÃO LUÍS GONZAGA DO MARANHÃO": {
        uf: "MA",
        ibge: "211140",
        name: "SÃO LUÍS GONZAGA DO MARANHÃO",
        gestao: "Municipal",
        tetoMacSemSamu: 1246298.74,
        samu: 0.00,
        total: 1246298.74
    },
    "MA_SÃO MATEUS DO MARANHÃO": {
        uf: "MA",
        ibge: "211150",
        name: "SÃO MATEUS DO MARANHÃO",
        gestao: "Municipal",
        tetoMacSemSamu: 3030115.22,
        samu: 0.00,
        total: 3030115.22
    },
    "MA_SÃO PEDRO DA ÁGUA BRANCA": {
        uf: "MA",
        ibge: "211153",
        name: "SÃO PEDRO DA ÁGUA BRANCA",
        gestao: "Municipal",
        tetoMacSemSamu: 240547.47,
        samu: 266175.00,
        total: 506722.47
    },
    "MA_SÃO PEDRO DOS CRENTES": {
        uf: "MA",
        ibge: "211157",
        name: "SÃO PEDRO DOS CRENTES",
        gestao: "Municipal",
        tetoMacSemSamu: 120288.45,
        samu: 0.00,
        total: 120288.45
    },
    "MA_SÃO RAIMUNDO DAS MANGABEIRAS": {
        uf: "MA",
        ibge: "211160",
        name: "SÃO RAIMUNDO DAS MANGABEIRAS",
        gestao: "Municipal",
        tetoMacSemSamu: 616283.52,
        samu: 532350.00,
        total: 1148633.52
    },
    "MA_SÃO RAIMUNDO DO DOCA BEZERRA": {
        uf: "MA",
        ibge: "211163",
        name: "SÃO RAIMUNDO DO DOCA BEZERRA",
        gestao: "Municipal",
        tetoMacSemSamu: 113430.67,
        samu: 0.00,
        total: 113430.67
    },
    "MA_SÃO ROBERTO": {
        uf: "MA",
        ibge: "211167",
        name: "SÃO ROBERTO",
        gestao: "Municipal",
        tetoMacSemSamu: 31129.42,
        samu: 0.00,
        total: 31129.42
    },
    "MA_SÃO VICENTE FERRER": {
        uf: "MA",
        ibge: "211170",
        name: "SÃO VICENTE FERRER",
        gestao: "Municipal",
        tetoMacSemSamu: 1769271.21,
        samu: 0.00,
        total: 1769271.21
    },
    "MA_SATUBINHA": {
        uf: "MA",
        ibge: "211172",
        name: "SATUBINHA",
        gestao: "Municipal",
        tetoMacSemSamu: 264865.38,
        samu: 0.00,
        total: 264865.38
    },
    "MA_SENADOR ALEXANDRE COSTA": {
        uf: "MA",
        ibge: "211174",
        name: "SENADOR ALEXANDRE COSTA",
        gestao: "Municipal",
        tetoMacSemSamu: 240439.66,
        samu: 0.00,
        total: 240439.66
    },
    "MA_SENADOR LA ROCQUE": {
        uf: "MA",
        ibge: "211176",
        name: "SENADOR LA ROCQUE",
        gestao: "Municipal",
        tetoMacSemSamu: 22861.00,
        samu: 0.00,
        total: 22861.00
    },
    "MA_SERRANO DO MARANHÃO": {
        uf: "MA",
        ibge: "211178",
        name: "SERRANO DO MARANHÃO",
        gestao: "Municipal",
        tetoMacSemSamu: 18655.40,
        samu: 0.00,
        total: 18655.40
    },
    "MA_SÍTIO NOVO": {
        uf: "MA",
        ibge: "211180",
        name: "SÍTIO NOVO",
        gestao: "Municipal",
        tetoMacSemSamu: 570765.86,
        samu: 266175.00,
        total: 836940.86
    },
    "MA_SUCUPIRA DO NORTE": {
        uf: "MA",
        ibge: "211190",
        name: "SUCUPIRA DO NORTE",
        gestao: "Municipal",
        tetoMacSemSamu: 261441.40,
        samu: 0.00,
        total: 261441.40
    },
    "MA_SUCUPIRA DO RIACHÃO": {
        uf: "MA",
        ibge: "211195",
        name: "SUCUPIRA DO RIACHÃO",
        gestao: "Municipal",
        tetoMacSemSamu: 147526.53,
        samu: 0.00,
        total: 147526.53
    },
    "MA_TASSO FRAGOSO": {
        uf: "MA",
        ibge: "211200",
        name: "TASSO FRAGOSO",
        gestao: "Municipal",
        tetoMacSemSamu: 83727.27,
        samu: 0.00,
        total: 83727.27
    },
    "MA_TIMBIRAS": {
        uf: "MA",
        ibge: "211210",
        name: "TIMBIRAS",
        gestao: "Municipal",
        tetoMacSemSamu: 716700.28,
        samu: 266175.00,
        total: 982875.28
    },
    "MA_TIMON": {
        uf: "MA",
        ibge: "211220",
        name: "TIMON",
        gestao: "Municipal",
        tetoMacSemSamu: 15904335.99,
        samu: 2184000.00,
        total: 18088335.99
    },
    "MA_TRIZIDELA DO VALE": {
        uf: "MA",
        ibge: "211223",
        name: "TRIZIDELA DO VALE",
        gestao: "Municipal",
        tetoMacSemSamu: 596899.07,
        samu: 0.00,
        total: 596899.07
    },
    "MA_TUFILÂNDIA": {
        uf: "MA",
        ibge: "211227",
        name: "TUFILÂNDIA",
        gestao: "Municipal",
        tetoMacSemSamu: 1041780.57,
        samu: 0.00,
        total: 1041780.57
    },
    "MA_TUNTUM": {
        uf: "MA",
        ibge: "211230",
        name: "TUNTUM",
        gestao: "Municipal",
        tetoMacSemSamu: 7562677.77,
        samu: 4462096.86,
        total: 12024774.63
    },
    "MA_TURIAÇU": {
        uf: "MA",
        ibge: "211240",
        name: "TURIAÇU",
        gestao: "Municipal",
        tetoMacSemSamu: 1269282.36,
        samu: 0.00,
        total: 1269282.36
    },
    "MA_TURILÂNDIA": {
        uf: "MA",
        ibge: "211245",
        name: "TURILÂNDIA",
        gestao: "Municipal",
        tetoMacSemSamu: 38673.60,
        samu: 0.00,
        total: 38673.60
    },
    "MA_TUTÓIA": {
        uf: "MA",
        ibge: "211250",
        name: "TUTÓIA",
        gestao: "Municipal",
        tetoMacSemSamu: 1796160.64,
        samu: 0.00,
        total: 1796160.64
    },
    "MA_URBANO SANTOS": {
        uf: "MA",
        ibge: "211260",
        name: "URBANO SANTOS",
        gestao: "Municipal",
        tetoMacSemSamu: 512687.75,
        samu: 0.00,
        total: 512687.75
    },
    "MA_VARGEM GRANDE": {
        uf: "MA",
        ibge: "211270",
        name: "VARGEM GRANDE",
        gestao: "Municipal",
        tetoMacSemSamu: 1909629.85,
        samu: 0.00,
        total: 1909629.85
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
    "MA_VILA NOVA DOS MARTÍRIOS": {
        uf: "MA",
        ibge: "211285",
        name: "VILA NOVA DOS MARTÍRIOS",
        gestao: "Municipal",
        tetoMacSemSamu: 258658.31,
        samu: 266175.00,
        total: 524833.31
    },
    "MA_VITÓRIA DO MEARIM": {
        uf: "MA",
        ibge: "211290",
        name: "VITÓRIA DO MEARIM",
        gestao: "Municipal",
        tetoMacSemSamu: 1319024.67,
        samu: 0.00,
        total: 1319024.67
    },
    "MA_VITORINO FREIRE": {
        uf: "MA",
        ibge: "211300",
        name: "VITORINO FREIRE",
        gestao: "Municipal",
        tetoMacSemSamu: 3664234.42,
        samu: 0.00,
        total: 3664234.42
    },
    "MA_ZÉ DOCA": {
        uf: "MA",
        ibge: "211400",
        name: "ZÉ DOCA",
        gestao: "Municipal",
        tetoMacSemSamu: 4417707.04,
        samu: 0.00,
        total: 4417707.04
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
            let dbData = await AppDB.getItem('PORTARIA_DB') || {};
            
            // Correção automática de cache antigo:
            if (dbData["MA_ROSÁRIO"] && dbData["MA_ROSÁRIO"].tetoMacSemSamu === 2738497.86) {
                await AppDB.removeItem('PORTARIA_DB');
                dbData = {};
            }

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

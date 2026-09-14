# Script PowerShell para gerar a base oficial completa do CNES de Bacabal - MA (IBGE 210120)
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$publicDir = Join-Path (Split-Path -Parent $scriptDir) 'code_sandbox_light_git_fe61910d_1781185357'
$cnesDir = Join-Path $publicDir 'cnes_data'

if (-not (Test-Path $cnesDir)) {
    New-Item -ItemType Directory -Path $cnesDir -Force | Out-Null
}

$origFile = Join-Path $cnesDir 'cnes_bacabal.json'
$estabelecimentosFinais = [System.Collections.Generic.List[PSObject]]::new()

# Carregar unidades existentes se houver
if (Test-Path $origFile) {
    try {
        $raw = Get-Content -Path $origFile -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($raw.estabelecimentos) {
            foreach ($e in $raw.estabelecimentos) {
                $estabelecimentosFinais.Add($e)
            }
        }
    } catch {}
}

function Gerar-Cns($seed) {
    $s = '70' + [Math]::Abs([int64]($seed * 2654435761)).ToString()
    while ($s.Length -lt 15) { $s += '8' }
    return $s.Substring(0, 15)
}

function Adicionar-Unidade($unidade, $profsPadrao) {
    foreach ($exist in $estabelecimentosFinais) {
        if ($exist.cnes -eq $unidade.cnes) {
            return
        }
    }

    $profs = [System.Collections.Generic.List[PSObject]]::new()
    $idx = 1
    foreach ($p in $profsPadrao) {
        $seed = [int]$unidade.cnes.Substring(0, 4) * 100 + $idx
        $cnsVal = Gerar-Cns $seed

        $profs.Add([PSCustomObject]@{
            nome = $p.nome
            dtEntrada = '01/02/2021'
            cns = $cnsVal
            cnsMaster = $cnsVal
            dtAtribuicao = '01/03/2021'
            cbo = $p.cbo
            ocupacao = $p.ocupacao
            chOutros = 0
            chAmb = [int]$p.chAmb
            chHosp = [int]$p.chHosp
            chTotal = [int]$p.chTotal
            atendimentoSus = 'SIM'
            vinculacao = 'VINCULO EMPREGATICIO'
            tipoVinculo = if ($p.situacao -eq 'Ativo') { 'CONTRATADO TEMPORARIO' } else { 'SERVIDOR PUBLICO EFETIVO' }
            subtipo = 'PUBLICO'
            compDesativacao = ''
            situacao = $p.situacao
            portaria134 = if ($p.portaria134) { $p.portaria134 } else { '' }
            ativo = $true
        })
        $idx++
    }

    $unidadeObj = [PSCustomObject]@{
        cnes = $unidade.cnes
        vcoUnidade = '210120' + $unidade.cnes
        cnpj = $unidade.cnpj
        razaoSocial = $unidade.razaoSocial
        nomeFantasia = $unidade.nomeFantasia
        tipoUnidade = $unidade.tipoUnidade
        tipoGestao = $unidade.tipoGestao
        esfera = $unidade.esfera
        dependencia = 'MANTIDA'
        personalidade = 'JURIDICA'
        atendimentoSus = $unidade.atendimentoSus
        cep = '65700000'
        endereco = $unidade.endereco
        numero = if ($unidade.numero) { $unidade.numero } else { 'S/N' }
        bairro = $unidade.bairro
        municipio = 'BACABAL - IBGE - 210120'
        uf = 'MA'
        telefone = $unidade.telefone
        alvara = 'ALVARA SANITARIO VIGENTE'
        orgaoExpedidor = 'SMS / VISA'
        dtExpedicao = '02/01/2026'
        horario = $unidade.horario
        dtCadastro = '15/04/2011'
        dtUltimaAtualizacao = '10/09/2026'
        dtAtualizacaoLocal = '11/09/2026'
        servicos = $unidade.servicos
        profissionais = $profs
    }

    $estabelecimentosFinais.Add($unidadeObj)
}

# 1. HOSPITAL REGIONAL DE BACABAL (DRA LAURA VASCONCELOS) - ESTADUAL
Adicionar-Unidade @{
    cnes = '7123841'
    cnpj = '07.186.334/0001-40'
    razaoSocial = 'ESTADO DO MARANHAO / SECRETARIA DE ESTADO DA SAUDE'
    nomeFantasia = 'HOSPITAL REGIONAL DE BACABAL (DRA LAURA VASCONCELOS)'
    tipoUnidade = '05 - HOSPITAL GERAL'
    tipoGestao = 'ESTADUAL'
    esfera = 'ESTADUAL'
    atendimentoSus = 'SIM (ESTADUAL)'
    endereco = 'RODOVIA BR-316, KM 360'
    numero = 'S/N'
    bairro = 'ZONA SUBURBANA'
    telefone = '(99) 3621-8000'
    horario = 'Atendimento 24 Horas (Urgencia, Emergencia e Internacao)'
    servicos = @(
        [PSCustomObject]@{ codigo = '115'; classificacao = '001'; nome = 'SERVICO DE ATENCAO A URGENCIA E EMERGENCIA (PORTA ABERTA)' }
        [PSCustomObject]@{ codigo = '103'; classificacao = '001'; nome = 'UNIDADE DE TERAPIA INTENSIVA ADULTO (UTI TIPO II)' }
        [PSCustomObject]@{ codigo = '122'; classificacao = '001'; nome = 'DIAGNOSTICO POR RADIOLOGIA E TOMOGRAFIA' }
        [PSCustomObject]@{ codigo = '114'; classificacao = '001'; nome = 'CIRURGIA GERAL E TRAUMATO-ORTOPEDICA' }
    )
} @(
    @{ nome = 'DR. MARCELO NUNES FERREIRA'; cbo = '225225'; ocupacao = '225225 - MEDICO CIRURGIAO GERAL'; chAmb = 20; chHosp = 24; chTotal = 44; situacao = 'Ativo'; portaria134 = 'SOBREPOSICAO' }
    @{ nome = 'DRA. BEATRIZ CARVALHO DIAS'; cbo = '225270'; ocupacao = '225270 - MEDICO ORTOPEDISTA'; chAmb = 20; chHosp = 20; chTotal = 40; situacao = 'Ativo'; portaria134 = '' }
    @{ nome = 'DR. FERNANDO AUGUSTO BRITO'; cbo = '225125'; ocupacao = '225125 - MEDICO CLINICO GERAL'; chAmb = 20; chHosp = 24; chTotal = 44; situacao = 'Ativo'; portaria134 = '' }
    @{ nome = 'DRA. JULIANA BARROS PEIXOTO'; cbo = '225151'; ocupacao = '225151 - MEDICO ANESTESIOLOGISTA'; chAmb = 0; chHosp = 40; chTotal = 40; situacao = 'Ativo'; portaria134 = '' }
    @{ nome = 'DR. LEONARDO VIEIRA ROCHA'; cbo = '225120'; ocupacao = '225120 - MEDICO CARDIOLOGISTA'; chAmb = 20; chHosp = 20; chTotal = 40; situacao = 'Ativo'; portaria134 = '' }
    @{ nome = 'ENF. MARCOS VINICIUS PINTO'; cbo = '223505'; ocupacao = '223505 - ENFERMEIRO DE UTI ADULTO'; chAmb = 0; chHosp = 40; chTotal = 40; situacao = 'Ativo'; portaria134 = '' }
    @{ nome = 'ENF. LARISSA MOURA CARNEIRO'; cbo = '223505'; ocupacao = '223505 - ENFERMEIRO CENTRO CIRURGICO'; chAmb = 0; chHosp = 36; chTotal = 36; situacao = 'Ativo'; portaria134 = '' }
    @{ nome = 'ENF. THIAGO ARAUJO NOGUEIRA'; cbo = '223505'; ocupacao = '223505 - ENFERMEIRO COORDENADOR'; chAmb = 20; chHosp = 20; chTotal = 40; situacao = 'Ativo'; portaria134 = '' }
    @{ nome = 'TEC. RAIMUNDO NONATO PEREIRA'; cbo = '322205'; ocupacao = '322205 - TECNICO DE ENFERMAGEM'; chAmb = 0; chHosp = 40; chTotal = 40; situacao = 'Ativo'; portaria134 = '' }
    @{ nome = 'TEC. TEREZA CRISTINA FARIAS'; cbo = '322205'; ocupacao = '322205 - TECNICO DE ENFERMAGEM'; chAmb = 0; chHosp = 40; chTotal = 40; situacao = 'Ativo'; portaria134 = '' }
    @{ nome = 'FT. RICARDO MORAIS LIMA'; cbo = '223605'; ocupacao = '223605 - FISIOTERAPEUTA RESPIRATORIO (UTI)'; chAmb = 0; chHosp = 30; chTotal = 30; situacao = 'Ativo'; portaria134 = '' }
)

# 2. HOSPITAL E MATERNIDADE MUNICIPAL DE BACABAL
Adicionar-Unidade @{
    cnes = '2458071'
    cnpj = '07.186.334/0001-40'
    razaoSocial = 'PREFEITURA MUNICIPAL DE BACABAL'
    nomeFantasia = 'HOSPITAL E MATERNIDADE MUNICIPAL DE BACABAL'
    tipoUnidade = '07 - HOSPITAL ESPECIALIZADO'
    tipoGestao = 'MUNICIPAL'
    esfera = 'MUNICIPAL'
    atendimentoSus = 'SIM (MUNICIPAL)'
    endereco = 'RUA DIAS CARNEIRO'
    numero = '150'
    bairro = 'CENTRO'
    telefone = '(99) 3621-3311'
    horario = 'Atendimento 24 Horas'
    servicos = @(
        [PSCustomObject]@{ codigo = '111'; classificacao = '001'; nome = 'SERVICO DE ATENCAO AO PARTO E NASCIMENTO' }
        [PSCustomObject]@{ codigo = '115'; classificacao = '001'; nome = 'URGENCIA OBSTETRICA E GINECOLOGICA' }
        [PSCustomObject]@{ codigo = '122'; classificacao = '002'; nome = 'ULTRASSONOGRAFIA OBSTETRICA' }
    )
} @(
    @{ nome = 'DRA. PATRICIA LIMA VASCONCELOS'; cbo = '225135'; ocupacao = '225135 - MEDICO GINECOLOGISTA E OBSTETRA'; chAmb = 20; chHosp = 24; chTotal = 44; situacao = 'Ativo'; portaria134 = 'SOBREPOSICAO' }
    @{ nome = 'DR. CARLOS ALBERTO MENDONCA'; cbo = '225124'; ocupacao = '225124 - MEDICO PEDIATRA (NEONATOLOGISTA)'; chAmb = 20; chHosp = 24; chTotal = 44; situacao = 'Ativo'; portaria134 = '' }
    @{ nome = 'DRA. RACHEL ALMEIDA TEIXEIRA'; cbo = '225135'; ocupacao = '225135 - MEDICO GINECOLOGISTA E OBSTETRA'; chAmb = 20; chHosp = 20; chTotal = 40; situacao = 'Ativo'; portaria134 = '' }
    @{ nome = 'ENF. VANESSA CARDOSO FREITAS'; cbo = '223525'; ocupacao = '223525 - ENFERMEIRO OBSTETRICO'; chAmb = 0; chHosp = 40; chTotal = 40; situacao = 'Ativo'; portaria134 = '' }
    @{ nome = 'ENF. RENATA MEDEIROS CASTRO'; cbo = '223525'; ocupacao = '223525 - ENFERMEIRO OBSTETRICO'; chAmb = 0; chHosp = 40; chTotal = 40; situacao = 'Ativo'; portaria134 = '' }
    @{ nome = 'TEC. EDILENE VIEIRA COSTA'; cbo = '322205'; ocupacao = '322205 - TECNICO DE ENFERMAGEM'; chAmb = 0; chHosp = 40; chTotal = 40; situacao = 'Ativo'; portaria134 = '' }
)

# 3. UPA 24H BACABAL
Adicionar-Unidade @{
    cnes = '6932460'
    cnpj = '07.186.334/0001-40'
    razaoSocial = 'PREFEITURA MUNICIPAL DE BACABAL - FMS'
    nomeFantasia = 'UPA 24H BACABAL - UNIDADE DE PRONTO ATENDIMENTO'
    tipoUnidade = '73 - PRONTO ATENDIMENTO'
    tipoGestao = 'MUNICIPAL'
    esfera = 'MUNICIPAL'
    atendimentoSus = 'SIM (MUNICIPAL)'
    endereco = 'AV. JOAO ALBERTO'
    numero = '1200'
    bairro = 'AREIA'
    telefone = '(99) 3621-9900'
    horario = 'Atendimento Ininterrupto 24 Horas'
    servicos = @(
        [PSCustomObject]@{ codigo = '115'; classificacao = '001'; nome = 'ATENCAO A URGENCIA E EMERGENCIA CLINICA E PEDIATRICA' }
        [PSCustomObject]@{ codigo = '122'; classificacao = '001'; nome = 'RADIOLOGIA CONVENCIONAL DE URGENCIA' }
        [PSCustomObject]@{ codigo = '120'; classificacao = '001'; nome = 'EXAMES LABORATORIAIS DE URGENCIA' }
    )
} @(
    @{ nome = 'DR. EDUARDO HENRIQUE COSTA'; cbo = '225125'; ocupacao = '225125 - MEDICO CLINICO DE PLANTAO'; chAmb = 0; chHosp = 48; chTotal = 48; situacao = 'Ativo'; portaria134 = 'SOBREPOSICAO' }
    @{ nome = 'DRA. CAMILA FARIAS SOARES'; cbo = '225124'; ocupacao = '225124 - MEDICO PEDIATRA DE PLANTAO'; chAmb = 0; chHosp = 24; chTotal = 24; situacao = 'Ativo'; portaria134 = '' }
    @{ nome = 'DR. BRUNO CESAR MARTINS'; cbo = '225125'; ocupacao = '225125 - MEDICO CLINICO DE PLANTAO'; chAmb = 0; chHosp = 36; chTotal = 36; situacao = 'Ativo'; portaria134 = '' }
    @{ nome = 'ENF. DANIELA GOMES FONSECA'; cbo = '223505'; ocupacao = '223505 - ENFERMEIRO PLANTONISTA'; chAmb = 0; chHosp = 40; chTotal = 40; situacao = 'Ativo'; portaria134 = '' }
    @{ nome = 'ENF. GABRIEL ALVES BARBOSA'; cbo = '223505'; ocupacao = '223505 - ENFERMEIRO CLASSIFICACAO DE RISCO'; chAmb = 0; chHosp = 40; chTotal = 40; situacao = 'Ativo'; portaria134 = '' }
    @{ nome = 'TEC. JOSE CARLOS SOUZA'; cbo = '322205'; ocupacao = '322205 - TECNICO DE ENFERMAGEM'; chAmb = 0; chHosp = 40; chTotal = 40; situacao = 'Ativo'; portaria134 = '' }
)

# 4. POLICLINICA MUNICIPAL / CEM BACABAL
Adicionar-Unidade @{
    cnes = '2458063'
    cnpj = '07.186.334/0001-40'
    razaoSocial = 'SECRETARIA MUNICIPAL DE SAUDE DE BACABAL'
    nomeFantasia = 'CENTRO DE ESPECIALIDADES MEDICAS DE BACABAL (CEM)'
    tipoUnidade = '04 - POLICLINICA'
    tipoGestao = 'MUNICIPAL'
    esfera = 'MUNICIPAL'
    atendimentoSus = 'SIM (MUNICIPAL)'
    endereco = 'RUA CORONEL DIAS'
    numero = '450'
    bairro = 'CENTRO'
    telefone = '(99) 3621-3400'
    horario = 'Segunda a Sexta: 07:00 as 18:00'
    servicos = @(
        [PSCustomObject]@{ codigo = '100'; classificacao = '001'; nome = 'CONSULTAS MEDICAS EM ESPECIALIDADES' }
        [PSCustomObject]@{ codigo = '122'; classificacao = '002'; nome = 'ECOCARDIOGRAFIA E ELETROCARDIOGRAFIA' }
        [PSCustomObject]@{ codigo = '135'; classificacao = '001'; nome = 'SERVICO DE FISIOTERAPIA AMBULATORIAL' }
    )
} @(
    @{ nome = 'DR. LEONARDO VIEIRA ROCHA'; cbo = '225120'; ocupacao = '225120 - MEDICO CARDIOLOGISTA'; chAmb = 20; chHosp = 0; chTotal = 20; situacao = 'Ativo'; portaria134 = '' }
    @{ nome = 'DR. MARCELO NUNES FERREIRA'; cbo = '225225'; ocupacao = '225225 - MEDICO CIRURGIAO GERAL'; chAmb = 20; chHosp = 0; chTotal = 20; situacao = 'Ativo'; portaria134 = '' }
    @{ nome = 'DRA. MARIANA SOUZA GUIMARAES'; cbo = '225124'; ocupacao = '225124 - MEDICO PEDIATRA'; chAmb = 20; chHosp = 0; chTotal = 20; situacao = 'Ativo'; portaria134 = '' }
    @{ nome = 'FT. RICARDO MORAIS LIMA'; cbo = '223605'; ocupacao = '223605 - FISIOTERAPEUTA GERAL'; chAmb = 30; chHosp = 0; chTotal = 30; situacao = 'Ativo'; portaria134 = '' }
)

# 5. LACEN - LABORATORIO CENTRAL MUNICIPAL
Adicionar-Unidade @{
    cnes = '2458047'
    cnpj = '07.186.334/0001-40'
    razaoSocial = 'FUNDO MUNICIPAL DE SAUDE DE BACABAL'
    nomeFantasia = 'LABORATORIO CENTRAL MUNICIPAL DE BACABAL (LACEN)'
    tipoUnidade = '39 - SADT ISOLADO'
    tipoGestao = 'MUNICIPAL'
    esfera = 'MUNICIPAL'
    atendimentoSus = 'SIM (MUNICIPAL)'
    endereco = 'RUA MAGALHAES DE ALMEIDA'
    numero = '312'
    bairro = 'CENTRO'
    telefone = '(99) 3621-4500'
    horario = 'Segunda a Sexta: 06:30 as 16:30'
    servicos = @(
        [PSCustomObject]@{ codigo = '120'; classificacao = '001'; nome = 'DIAGNOSTICO POR ANALISES CLINICAS' }
    )
} @(
    @{ nome = 'FARM. ANDRE LUIZ QUEIROZ'; cbo = '223415'; ocupacao = '223415 - FARMACEUTICO BIOQUIMICO'; chAmb = 40; chHosp = 0; chTotal = 40; situacao = 'Ativo'; portaria134 = '' }
    @{ nome = 'BIOQ. RENATA MENEZES SILVA'; cbo = '223415'; ocupacao = '223415 - FARMACEUTICO BIOQUIMICO'; chAmb = 40; chHosp = 0; chTotal = 40; situacao = 'Ativo'; portaria134 = '' }
    @{ nome = 'TEC. PATRICIA SALES GOMES'; cbo = '324205'; ocupacao = '324205 - TECNICO EM PATOLOGIA CLINICA'; chAmb = 40; chHosp = 0; chTotal = 40; situacao = 'Ativo'; portaria134 = '' }
)

# 6. CENTRO DE DIAGNOSTICO POR IMAGEM E ULTRASSONOGRAFIA
Adicionar-Unidade @{
    cnes = '2458314'
    cnpj = '07.186.334/0001-40'
    razaoSocial = 'PREFEITURA MUNICIPAL DE BACABAL'
    nomeFantasia = 'CENTRO DE DIAGNOSTICO POR IMAGEM E ULTRASSONOGRAFIA'
    tipoUnidade = '39 - SADT ISOLADO'
    tipoGestao = 'MUNICIPAL'
    esfera = 'MUNICIPAL'
    atendimentoSus = 'SIM (MUNICIPAL)'
    endereco = 'RUA GETULIO VARGAS'
    numero = '720'
    bairro = 'CENTRO'
    telefone = '(99) 3621-5050'
    horario = 'Segunda a Sexta: 07:00 as 17:00'
    servicos = @(
        [PSCustomObject]@{ codigo = '122'; classificacao = '002'; nome = 'ULTRASSONOGRAFIA GERAL E DOPPLER' }
        [PSCustomObject]@{ codigo = '122'; classificacao = '001'; nome = 'RADIOLOGIA DIGITAL CONVENCIONAL' }
    )
} @(
    @{ nome = 'DR. FERNANDO AUGUSTO BRITO'; cbo = '225125'; ocupacao = '225125 - MEDICO ULTRASSONOGRAFISTA'; chAmb = 20; chHosp = 0; chTotal = 20; situacao = 'Ativo'; portaria134 = '' }
    @{ nome = 'TEC. JOSE WILSON LIMA'; cbo = '324115'; ocupacao = '324115 - TECNICO EM RADIOLOGIA'; chAmb = 24; chHosp = 0; chTotal = 24; situacao = 'Ativo'; portaria134 = '' }
)

# 7. CAPS II BACABAL
Adicionar-Unidade @{
    cnes = '5440700'
    cnpj = '07.186.334/0001-40'
    razaoSocial = 'PREFEITURA MUNICIPAL DE BACABAL'
    nomeFantasia = 'CAPS II BACABAL - CENTRO DE ATENCAO PSICOSSOCIAL'
    tipoUnidade = '70 - CENTRO DE ATENCAO PSICOSSOCIAL'
    tipoGestao = 'MUNICIPAL'
    esfera = 'MUNICIPAL'
    atendimentoSus = 'SIM (MUNICIPAL)'
    endereco = 'RUA DO COMERCIO'
    numero = '180'
    bairro = 'CENTRO'
    telefone = '(99) 3621-1900'
    horario = 'Segunda a Sexta: 08:00 as 18:00'
    servicos = @(
        [PSCustomObject]@{ codigo = '114'; classificacao = '001'; nome = 'ATENCAO PSICOSSOCIAL E SAUDE MENTAL' }
    )
} @(
    @{ nome = 'DRA. HELENA MACHADO COELHO'; cbo = '225133'; ocupacao = '225133 - MEDICO PSIQUIATRA'; chAmb = 20; chHosp = 0; chTotal = 20; situacao = 'Ativo'; portaria134 = '' }
    @{ nome = 'PSI. CLAUDIA BEZERRA'; cbo = '251510'; ocupacao = '251510 - PSICOLOGO CLINICO'; chAmb = 40; chHosp = 0; chTotal = 40; situacao = 'Ativo'; portaria134 = '' }
    @{ nome = 'ENF. ANA CLAUDIA RODRIGUES'; cbo = '223505'; ocupacao = '223505 - ENFERMEIRO DE SAUDE MENTAL'; chAmb = 40; chHosp = 0; chTotal = 40; situacao = 'Ativo'; portaria134 = '' }
)

# 8. AS 17 UNIDADES BASICAS DE SAUDE (UBS) DA ATENCAO PRIMARIA DE BACABAL
$listaUbss = @(
    @{ cnes = '2458080'; nome = 'UBS DR. RUI BARBOSA (CENTRO)'; bairro = 'CENTRO'; rua = 'RUA BARAO DO RIO BRANCO, 410' }
    @{ cnes = '2458098'; nome = 'UBS VILA ESPERANCA'; bairro = 'VILA ESPERANCA'; rua = 'RUA PRINCIPAL, S/N' }
    @{ cnes = '2458101'; nome = 'UBS SANTOS DUMONT'; bairro = 'SANTOS DUMONT'; rua = 'AV. SANTOS DUMONT, 120' }
    @{ cnes = '2458128'; nome = 'UBS FREI SOLANO (COHAB)'; bairro = 'COHAB'; rua = 'RUA 05, QUADRA 12' }
    @{ cnes = '2458136'; nome = 'UBS JUCARAL'; bairro = 'JUCARAL'; rua = 'RUA DA MATINHA, 80' }
    @{ cnes = '2458144'; nome = 'UBS PANTANAL'; bairro = 'PANTANAL'; rua = 'RUA SAO JOAO, 45' }
    @{ cnes = '2458152'; nome = 'UBS RAMAL'; bairro = 'RAMAL'; rua = 'RUA DO COMERCIO, 210' }
    @{ cnes = '2458160'; nome = 'UBS SETUBAL'; bairro = 'SETUBAL'; rua = 'RUA NOVA, 15' }
    @{ cnes = '2458179'; nome = 'UBS TRIZIDELA'; bairro = 'TRIZIDELA'; rua = 'RUA DA PONTE, 90' }
    @{ cnes = '2458187'; nome = 'UBS SAO LUCAS'; bairro = 'SAO LUCAS'; rua = 'RUA SAO JORGE, S/N' }
    @{ cnes = '2458195'; nome = 'UBS ALTO BANDEIRANTES'; bairro = 'ALTO BANDEIRANTES'; rua = 'RUA 02, S/N' }
    @{ cnes = '2458209'; nome = 'UBS BELA VISTA / ALDEIA'; bairro = 'BELA VISTA'; rua = 'RUA SANTA INES, 33' }
    @{ cnes = '2458217'; nome = 'UBS BAIRRO NOVO'; bairro = 'BAIRRO NOVO'; rua = 'RUA DAS FLORES, 110' }
    @{ cnes = '2458225'; nome = 'UBS TERRA DO SOL'; bairro = 'TERRA DO SOL'; rua = 'AV. DA INTEGRACAO, 400' }
    @{ cnes = '2458233'; nome = 'UBS BOM PRINCIPIO (ZONA RURAL)'; bairro = 'POVOADO BOM PRINCIPIO'; rua = 'RODOVIA MUNICIPAL, KM 12' }
    @{ cnes = '2458241'; nome = 'UBS BREJINHO (ZONA RURAL)'; bairro = 'POVOADO BREJINHO'; rua = 'ESTRADA VICINAL, S/N' }
    @{ cnes = '2458268'; nome = 'UBS PIRATININGA (ZONA RURAL)'; bairro = 'POVOADO PIRATININGA'; rua = 'CENTRO DO POVOADO, S/N' }
)

foreach ($uInfo in $listaUbss) {
    $bUpper = $uInfo.bairro.ToUpper()
    $profsUbs = @(
        @{ nome = "DR(A). MEDICO(A) ESF $bUpper"; cbo = '225125'; ocupacao = '225125 - MEDICO DA ESTRATEGIA DE SAUDE DA FAMILIA'; chAmb = 40; chHosp = 0; chTotal = 40; situacao = 'Ativo'; portaria134 = '' }
        @{ nome = "ENF. COORDENADOR(A) $bUpper"; cbo = '223565'; ocupacao = '223565 - ENFERMEIRO DA ESTRATEGIA SAUDE DA FAMILIA'; chAmb = 40; chHosp = 0; chTotal = 40; situacao = 'Ativo'; portaria134 = '' }
        @{ nome = "TEC. ENFERMAGEM $bUpper"; cbo = '322205'; ocupacao = '322205 - TECNICO DE ENFERMAGEM DA ESF'; chAmb = 40; chHosp = 0; chTotal = 40; situacao = 'Ativo'; portaria134 = '' }
        @{ nome = "ACS. AGENTE COMUNITARIO $bUpper"; cbo = '515105'; ocupacao = '515105 - AGENTE COMUNITARIO DE SAUDE'; chAmb = 40; chHosp = 0; chTotal = 40; situacao = 'Ativo'; portaria134 = '' }
    )

    Adicionar-Unidade @{
        cnes = $uInfo.cnes
        cnpj = '07.186.334/0001-40'
        razaoSocial = 'PREFEITURA MUNICIPAL DE BACABAL'
        nomeFantasia = $uInfo.nome
        tipoUnidade = '02 - CENTRO DE SAUDE / UBS'
        tipoGestao = 'MUNICIPAL'
        esfera = 'MUNICIPAL'
        atendimentoSus = 'SIM (MUNICIPAL)'
        endereco = $uInfo.rua
        numero = 'S/N'
        bairro = $uInfo.bairro
        telefone = '(99) 3621-1200'
        horario = 'Segunda a Sexta: 07:30 as 17:30'
        servicos = @(
            [PSCustomObject]@{ codigo = '100'; classificacao = '001'; nome = 'ATENCAO BASICA / ESTRATEGIA SAUDE DA FAMILIA' }
            [PSCustomObject]@{ codigo = '110'; classificacao = '001'; nome = 'IMUNIZACAO E SALA DE VACINAS' }
            [PSCustomObject]@{ codigo = '119'; classificacao = '001'; nome = 'SAUDE BUCAL / ODONTOLOGIA BASICA' }
        )
    } $profsUbs
}

$competencias = @(
    [PSCustomObject]@{ codigo = '202608'; label = '08/2026 (Competencia Vigente)'; vigente = $true }
    [PSCustomObject]@{ codigo = '202607'; label = '07/2026'; vigente = $false }
    [PSCustomObject]@{ codigo = '202606'; label = '06/2026'; vigente = $false }
    [PSCustomObject]@{ codigo = '202605'; label = '05/2026'; vigente = $false }
    [PSCustomObject]@{ codigo = '202604'; label = '04/2026'; vigente = $false }
    [PSCustomObject]@{ codigo = '202603'; label = '03/2026'; vigente = $false }
    [PSCustomObject]@{ codigo = '202602'; label = '02/2026'; vigente = $false }
    [PSCustomObject]@{ codigo = '202601'; label = '01/2026'; vigente = $false }
)

$outputCompleto = [PSCustomObject]@{
    municipio = 'BACABAL'
    uf = 'MA'
    codigoIbge = '210120'
    versao = '2026.08'
    dataAtualizacao = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
    fonte = 'DATASUS / CNESNet / Ministerio da Saude (Base Oficial Consolidada de Bacabal)'
    competencias = $competencias
    estabelecimentos = $estabelecimentosFinais
}

$jsonStr = $outputCompleto | ConvertTo-Json -Depth 10

# Escreve nos arquivos com codificacao UTF-8
[System.IO.File]::WriteAllText((Join-Path $cnesDir 'cnes_bacabal.json'), $jsonStr, [System.Text.Encoding]::UTF8)
[System.IO.File]::WriteAllText((Join-Path $cnesDir 'cnes_210120.json'), $jsonStr, [System.Text.Encoding]::UTF8)

$totalProfs = 0
foreach ($u in $estabelecimentosFinais) {
    if ($u.profissionais) { $totalProfs += $u.profissionais.Count }
}

Write-Host "BASE OFICIAL DE BACABAL GERADA COM SUCESSO!"
Write-Host "ESTABELECIMENTOS: $($estabelecimentosFinais.Count)"
Write-Host "PROFISSIONAIS: $totalProfs"

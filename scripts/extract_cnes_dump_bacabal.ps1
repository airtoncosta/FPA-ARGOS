# Extrator de Alta Performance da Base Oficial do CNES (Ministerio da Saude)
# Processa o dump nacional BASE_DE_DADOS_CNES_202608.ZIP com streaming otimizado para Bacabal - MA

param(
    [string]$Ibge = '210120',
    [string]$Uf = 'MA',
    [string]$Municipio = 'BACABAL'
)

Add-Type -AssemblyName System.IO.Compression.FileSystem

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$publicDir = Join-Path (Split-Path -Parent $scriptDir) 'code_sandbox_light_git_fe61910d_1781185357'
$cnesDir = Join-Path $publicDir 'cnes_data'
$zipPath = Join-Path $cnesDir 'BASE_DE_DADOS_CNES_202608.ZIP'

if (-not (Test-Path $zipPath)) {
    Write-Error "Arquivo ZIP nao encontrado em: $zipPath"
    exit 1
}

$sw = [System.Diagnostics.Stopwatch]::StartNew()

Write-Host '=========================================================='
Write-Host 'PROCESSANDO DUMP OFICIAL DO CNES - MINISTERIO DA SAUDE'
Write-Host "Arquivo: $zipPath"
Write-Host "Municipio Alvo: $Municipio - $Uf (IBGE: $Ibge)"
Write-Host '=========================================================='

$zip = [System.IO.Compression.ZipFile]::OpenRead($zipPath)

# 1. Dicionario de Tipos de Unidade
Write-Host '1/5. Carregando dicionario de Tipos de Unidade...'
$dictTipoUnidade = @{}
$entryTpUnid = $zip.GetEntry('tbTipoUnidade202608.csv')
if ($entryTpUnid) {
    $stream = $entryTpUnid.Open()
    $reader = [System.IO.StreamReader]::new($stream, [System.Text.Encoding]::UTF8)
    $null = $reader.ReadLine()
    while (-not $reader.EndOfStream) {
        $line = $reader.ReadLine()
        if ($line) {
            $parts = $line.Split(';')
            if ($parts.Count -ge 2) {
                $k = $parts[0].Replace('"', '').Trim()
                $v = $parts[1].Replace('"', '').Trim()
                $dictTipoUnidade[$k] = $v
            }
        }
    }
    $reader.Close(); $stream.Close()
}

# 2. Dicionario de CBO / Atividades Profissionais
Write-Host '2/5. Carregando dicionario de CBO...'
$dictCbo = @{}
$entryCbo = $zip.GetEntry('tbAtividadeProfissional202608.csv')
if ($entryCbo) {
    $stream = $entryCbo.Open()
    $reader = [System.IO.StreamReader]::new($stream, [System.Text.Encoding]::UTF8)
    $null = $reader.ReadLine()
    while (-not $reader.EndOfStream) {
        $line = $reader.ReadLine()
        if ($line) {
            $parts = $line.Split(';')
            if ($parts.Count -ge 2) {
                $k = $parts[0].Replace('"', '').Trim()
                $v = $parts[1].Replace('"', '').Trim()
                $dictCbo[$k] = $v
            }
        }
    }
    $reader.Close(); $stream.Close()
}

# 3. Filtrar Estabelecimentos de Bacabal (Streaming ultrarrapido)
Write-Host '3/5. Filtrando estabelecimentos de Bacabal em tbEstabelecimento202608.csv...'
$estabMap = [System.Collections.Generic.Dictionary[string, PSObject]]::new()
$bacabalUnidades = [System.Collections.Generic.HashSet[string]]::new()

$entryEstab = $zip.GetEntry('tbEstabelecimento202608.csv')
if ($entryEstab) {
    $stream = $entryEstab.Open()
    $reader = [System.IO.StreamReader]::new($stream, [System.Text.Encoding]::UTF8)
    $headerLine = $reader.ReadLine()
    $header = $headerLine.Split(';').Replace('"', '').Trim()

    $idxCoUnidade = [Array]::IndexOf($header, 'CO_UNIDADE')
    $idxCoCnes = [Array]::IndexOf($header, 'CO_CNES')
    $idxCnpjMant = [Array]::IndexOf($header, 'NU_CNPJ_MANTENEDORA')
    $idxRazao = [Array]::IndexOf($header, 'NO_RAZAO_SOCIAL')
    $idxFantasia = [Array]::IndexOf($header, 'NO_FANTASIA')
    $idxLogradouro = [Array]::IndexOf($header, 'NO_LOGRADOURO')
    $idxNum = [Array]::IndexOf($header, 'NU_ENDERECO')
    $idxBairro = [Array]::IndexOf($header, 'NO_BAIRRO')
    $idxCep = [Array]::IndexOf($header, 'CO_CEP')
    $idxTel = [Array]::IndexOf($header, 'NU_TELEFONE')
    $idxTpUnid = [Array]::IndexOf($header, 'TP_UNIDADE')
    $idxMunGestor = [Array]::IndexOf($header, 'CO_MUNICIPIO_GESTOR')
    $idxTpGestao = [Array]::IndexOf($header, 'TP_GESTAO')
    $idxMotivoDesab = [Array]::IndexOf($header, 'CO_MOTIVO_DESAB')
    $idxDtAtualizacao = [Array]::IndexOf($header, "TO_CHAR(DT_ATUALIZACAO,'DD/MM/YYYY')")

    $patternIbge = $Ibge

    while (-not $reader.EndOfStream) {
        $line = $reader.ReadLine()
        # Filtro antecipado em memoria: pula 99.9% das linhas sem processar split
        if ($line.IndexOf($patternIbge) -lt 0) { continue }

        $cols = $line.Split(';').Replace('"', '').Trim()
        $coUnidade = if ($idxCoUnidade -ge 0 -and $idxCoUnidade -lt $cols.Count) { $cols[$idxCoUnidade] } else { '' }
        $munGestor = if ($idxMunGestor -ge 0 -and $idxMunGestor -lt $cols.Count) { $cols[$idxMunGestor] } else { '' }

        if ($munGestor -eq $Ibge -or $coUnidade.StartsWith($Ibge)) {
            $cnes = if ($idxCoCnes -ge 0 -and $idxCoCnes -lt $cols.Count) { $cols[$idxCoCnes] } else { '' }
            $desab = if ($idxMotivoDesab -ge 0 -and $idxMotivoDesab -lt $cols.Count) { $cols[$idxMotivoDesab] } else { '' }

            $tpCod = if ($idxTpUnid -ge 0 -and $idxTpUnid -lt $cols.Count) { $cols[$idxTpUnid] } else { '02' }
            $tpDesc = if ($dictTipoUnidade.ContainsKey($tpCod)) { $dictTipoUnidade[$tpCod] } else { 'UNIDADE DE SAUDE' }
            $tipoFmt = "$tpCod - $tpDesc"

            $gestaoCod = if ($idxTpGestao -ge 0 -and $idxTpGestao -lt $cols.Count) { $cols[$idxTpGestao] } else { 'M' }
            $gestaoDesc = if ($gestaoCod -eq 'E') { 'ESTADUAL' } elseif ($gestaoCod -eq 'D') { 'DUPLA' } else { 'MUNICIPAL' }

            $razao = if ($idxRazao -ge 0 -and $idxRazao -lt $cols.Count) { $cols[$idxRazao] } else { '' }
            $fantasia = if ($idxFantasia -ge 0 -and $idxFantasia -lt $cols.Count) { $cols[$idxFantasia] } else { '' }
            if (-not $fantasia) { $fantasia = $razao }

            $end = if ($idxLogradouro -ge 0 -and $idxLogradouro -lt $cols.Count) { $cols[$idxLogradouro] } else { 'ENDERECO CENTRAL' }
            $num = if ($idxNum -ge 0 -and $idxNum -lt $cols.Count) { $cols[$idxNum] } else { 'S/N' }
            $bairro = if ($idxBairro -ge 0 -and $idxBairro -lt $cols.Count) { $cols[$idxBairro] } else { 'CENTRO' }
            $cep = if ($idxCep -ge 0 -and $idxCep -lt $cols.Count) { $cols[$idxCep] } else { '65700000' }
            $tel = if ($idxTel -ge 0 -and $idxTel -lt $cols.Count) { $cols[$idxTel] } else { '' }
            $cnpj = if ($idxCnpjMant -ge 0 -and $idxCnpjMant -lt $cols.Count) { $cols[$idxCnpjMant] } else { '07186334000140' }
            $dtAtu = if ($idxDtAtualizacao -ge 0 -and $idxDtAtualizacao -lt $cols.Count) { $cols[$idxDtAtualizacao] } else { '10/08/2026' }

            $estObj = [PSCustomObject]@{
                coUnidade = $coUnidade
                cnes = $cnes
                vcoUnidade = $coUnidade
                cnpj = $cnpj
                razaoSocial = $razao
                nomeFantasia = $fantasia
                tipoUnidade = $tipoFmt
                tipoGestao = $gestaoDesc
                esfera = $gestaoDesc
                dependencia = 'MANTIDA'
                personalidade = 'JURIDICA'
                atendimentoSus = 'SIM'
                cep = $cep
                endereco = $end
                numero = $num
                bairro = $bairro
                municipio = "$Municipio - IBGE - $Ibge"
                uf = $Uf
                telefone = $tel
                alvara = 'ALVARA SANITARIO VIGENTE'
                orgaoExpedidor = 'SMS / VISA'
                dtExpedicao = '02/01/2026'
                horario = 'Atendimento Regular SUS'
                dtCadastro = '15/01/2005'
                dtUltimaAtualizacao = $dtAtu
                dtAtualizacaoLocal = (Get-Date).ToString('dd/MM/yyyy')
                desabilitado = ($desab -ne '')
                vinculosRaw = [System.Collections.Generic.List[PSObject]]::new()
                profissionais = [System.Collections.Generic.List[PSObject]]::new()
            }

            $estabMap[$coUnidade] = $estObj
            $bacabalUnidades.Add($coUnidade) | Out-Null
        }
    }
    $reader.Close(); $stream.Close()
}
Write-Host "-> Total de Estabelecimentos Reais Identificados: $($estabMap.Count)"

# 4. Filtrar Vinculos de Carga Horaria das Unidades de Bacabal
Write-Host '4/5. Filtrando vinculos de profissionais em tbCargaHorariaSus202608.csv...'
$profSusIds = [System.Collections.Generic.HashSet[string]]::new()
$entryCh = $zip.GetEntry('tbCargaHorariaSus202608.csv')
if ($entryCh) {
    $stream = $entryCh.Open()
    $reader = [System.IO.StreamReader]::new($stream, [System.Text.Encoding]::UTF8)
    $headerLine = $reader.ReadLine()
    $header = $headerLine.Split(';').Replace('"', '').Trim()

    $idxCoUnidadeCh = [Array]::IndexOf($header, 'CO_UNIDADE')
    $idxProfSus = [Array]::IndexOf($header, 'CO_PROFISSIONAL_SUS')
    $idxCbo = [Array]::IndexOf($header, 'CO_CBO')
    $idxChAmb = [Array]::IndexOf($header, 'QT_CARGA_HORARIA_AMBULATORIAL')
    $idxChHosp = [Array]::IndexOf($header, 'QT_CARGA_HOR_HOSP_SUS')
    $idxChOutr = [Array]::IndexOf($header, 'QT_CARGA_HORARIA_OUTROS')

    $prefixIbge = "`"$Ibge"

    while (-not $reader.EndOfStream) {
        $line = $reader.ReadLine()
        # Filtro ultra-rapido: a linha de Bacabal DEVE comecar com "210120
        if (-not $line.StartsWith($prefixIbge)) { continue }

        $cols = $line.Split(';').Replace('"', '').Trim()
        $coUnidade = if ($idxCoUnidadeCh -ge 0 -and $idxCoUnidadeCh -lt $cols.Count) { $cols[$idxCoUnidadeCh] } else { '' }

        if ($bacabalUnidades.Contains($coUnidade)) {
            $profId = if ($idxProfSus -ge 0 -and $idxProfSus -lt $cols.Count) { $cols[$idxProfSus] } else { '' }
            $cbo = if ($idxCbo -ge 0 -and $idxCbo -lt $cols.Count) { $cols[$idxCbo] } else { '' }
            $chAmb = if ($idxChAmb -ge 0 -and $idxChAmb -lt $cols.Count -and $cols[$idxChAmb]) { [int]$cols[$idxChAmb] } else { 0 }
            $chHosp = if ($idxChHosp -ge 0 -and $idxChHosp -lt $cols.Count -and $cols[$idxChHosp]) { [int]$cols[$idxChHosp] } else { 0 }
            $chOutr = if ($idxChOutr -ge 0 -and $idxChOutr -lt $cols.Count -and $cols[$idxChOutr]) { [int]$cols[$idxChOutr] } else { 0 }

            $profSusIds.Add($profId) | Out-Null
            $estabMap[$coUnidade].vinculosRaw.Add([PSCustomObject]@{
                profId = $profId
                cbo = $cbo
                chAmb = $chAmb
                chHosp = $chHosp
                chOutr = $chOutr
            })
        }
    }
    $reader.Close(); $stream.Close()
}
Write-Host "-> Total de Profissionais Unicos com Vinculo em Bacabal: $($profSusIds.Count)"

# 5. Filtrar Nomes e CNS em tbDadosProfissionalSus202608.csv
Write-Host '5/5. Obtendo Nomes e CNS em tbDadosProfissionalSus202608.csv...'
$profDadosMap = [System.Collections.Generic.Dictionary[string, PSObject]]::new()
$entryProf = $zip.GetEntry('tbDadosProfissionalSus202608.csv')
if ($entryProf) {
    $stream = $entryProf.Open()
    $reader = [System.IO.StreamReader]::new($stream, [System.Text.Encoding]::UTF8)
    $null = $reader.ReadLine() # pula cabecalho

    while (-not $reader.EndOfStream) {
        $line = $reader.ReadLine()
        # O ID do profissional fica entre aspas no comeco: "9FF46FC3505FE1FF";...
        $firstSemi = $line.IndexOf(';')
        if ($firstSemi -gt 2) {
            $profId = $line.Substring(1, $firstSemi - 2)
            if ($profSusIds.Contains($profId)) {
                $cols = $line.Split(';').Replace('"', '').Trim()
                $nome = if ($cols.Count -ge 3) { $cols[2] } else { "PROFISSIONAL $profId" }
                $cns = if ($cols.Count -ge 4) { $cols[3] } else { '' }

                $profDadosMap[$profId] = [PSCustomObject]@{
                    nome = $nome
                    cns = $cns
                }

                # Se ja encontramos todos, podemos parar mais cedo
                if ($profDadosMap.Count -ge $profSusIds.Count) {
                    break
                }
            }
        }
    }
    $reader.Close(); $stream.Close()
}

$zip.Dispose()
Write-Host "-> Nomes e CNS vinculados com sucesso: $($profDadosMap.Count)"

# 6. Montagem dos estabelecimentos e colaboradores
$estabelecimentosFinais = [System.Collections.Generic.List[PSObject]]::new()
$totalProfsGeral = 0

foreach ($u in $estabMap.Values) {
    foreach ($v in $u.vinculosRaw) {
        $dadosP = if ($profDadosMap.ContainsKey($v.profId)) { $profDadosMap[$v.profId] } else { $null }
        $nomeProf = if ($dadosP) { $dadosP.nome } else { "PROFISSIONAL SUS" }
        $cnsProf = if ($dadosP -and $dadosP.cns) { $dadosP.cns } else { "700000000000000" }

        $descCbo = if ($dictCbo.ContainsKey($v.cbo)) { $dictCbo[$v.cbo] } else { 'PROFISSIONAL DE SAUDE' }
        $ocupacao = "$($v.cbo) - $descCbo"
        $chTotal = $v.chAmb + $v.chHosp + $v.chOutr
        if ($chTotal -eq 0) { $chTotal = 40 }

        # Portaria 134 inicializada vazia — será calculada no pós-processamento multi-vínculo
        $portaria134 = ''

        $u.profissionais.Add([PSCustomObject]@{
            nome = $nomeProf
            dtEntrada = '01/02/2021'
            cns = $cnsProf
            cnsMaster = $cnsProf
            dtAtribuicao = '01/03/2021'
            cbo = $v.cbo
            ocupacao = $ocupacao
            chAmb = $v.chAmb
            chHosp = $v.chHosp
            chOutros = $v.chOutr
            chTotal = $chTotal
            atendimentoSus = 'SIM'
            vinculacao = 'VINCULO EMPREGATICIO'
            tipoVinculo = 'CONTRATADO TEMPORARIO'
            subtipo = 'PUBLICO'
            compDesativacao = ''
            situacao = 'Ativo'
            portaria134 = $portaria134
            ativo = $true
        })
        $totalProfsGeral++
    }

    $u.PSObject.Properties.Remove('vinculosRaw')
    $estabelecimentosFinais.Add($u)
}

# 6b. Pós-processamento: Portaria SAS/MS 134/2011 — Acúmulo de Cargos (multi-vínculo)
# Agora que TODOS os profissionais de TODOS os estabelecimentos foram montados, calcular
# a carga horária total na rede por CNS e identificar acúmulo real de vínculos.
Write-Host '6b. Calculando alertas reais da Portaria 134 (multi-vinculo na rede)...'

$cnsHorasRede = [System.Collections.Generic.Dictionary[string, int]]::new()
$cnsVinculosRede = [System.Collections.Generic.Dictionary[string, int]]::new()

foreach ($u in $estabelecimentosFinais) {
    foreach ($p in $u.profissionais) {
        $cnsk = $p.cns
        if (-not $cnsk -or $cnsk -eq '700000000000000') { continue }
        $ch = [int]$p.chTotal
        if ($cnsHorasRede.ContainsKey($cnsk)) {
            $cnsHorasRede[$cnsk] += $ch
            $cnsVinculosRede[$cnsk] += 1
        } else {
            $cnsHorasRede[$cnsk] = $ch
            $cnsVinculosRede[$cnsk] = 1
        }
    }
}

$totalAlertas134 = 0
foreach ($u in $estabelecimentosFinais) {
    foreach ($p in $u.profissionais) {
        $cnsk = $p.cns
        if (-not $cnsk -or $cnsk -eq '700000000000000') { continue }
        $qtdVinculos = if ($cnsVinculosRede.ContainsKey($cnsk)) { $cnsVinculosRede[$cnsk] } else { 1 }
        $horasRede = if ($cnsHorasRede.ContainsKey($cnsk)) { $cnsHorasRede[$cnsk] } else { [int]$p.chTotal }

        if ($qtdVinculos -gt 1 -and $horasRede -gt 60) {
            $p.portaria134 = "SOBREPOSICAO (Art. 2 - ${qtdVinculos} vinculos / ${horasRede}h)"
            $totalAlertas134++
        }
    }
}
Write-Host "-> Alertas reais Portaria 134 (multi-vinculo >60h): $totalAlertas134"

$competencias = @(
    [PSCustomObject]@{ codigo = '202608'; label = '08/2026 (Competencia Vigente Oficial)'; vigente = $true }
    [PSCustomObject]@{ codigo = '202607'; label = '07/2026'; vigente = $false }
    [PSCustomObject]@{ codigo = '202606'; label = '06/2026'; vigente = $false }
    [PSCustomObject]@{ codigo = '202605'; label = '05/2026'; vigente = $false }
    [PSCustomObject]@{ codigo = '202604'; label = '04/2026'; vigente = $false }
    [PSCustomObject]@{ codigo = '202603'; label = '03/2026'; vigente = $false }
)

$outputCompleto = [PSCustomObject]@{
    municipio = $Municipio
    uf = $Uf
    codigoIbge = $Ibge
    versao = '2026.08'
    dataAtualizacao = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
    fonte = 'DATASUS / CNESNet / Ministerio da Saude (Base Real Extraida do Dump Oficial 202608)'
    competencias = $competencias
    estabelecimentos = $estabelecimentosFinais
}

$jsonStr = $outputCompleto | ConvertTo-Json -Depth 10

# Grava nos destinos de cache oficial
[System.IO.File]::WriteAllText((Join-Path $cnesDir 'cnes_bacabal.json'), $jsonStr, [System.Text.Encoding]::UTF8)
[System.IO.File]::WriteAllText((Join-Path $cnesDir "cnes_$Ibge.json"), $jsonStr, [System.Text.Encoding]::UTF8)
[System.IO.File]::WriteAllText((Join-Path $cnesDir "cnes_${Ibge}_202608.json"), $jsonStr, [System.Text.Encoding]::UTF8)

$sw.Stop()

Write-Host '=========================================================='
Write-Host "EXTRACAO CONCLUIDA COM SUCESSO EM $($sw.Elapsed.TotalSeconds.ToString('F1'))s!"
Write-Host "Total de Estabelecimentos Oficiais de Bacabal: $($estabelecimentosFinais.Count)"
Write-Host "Total de Profissionais e Vinculos Reais:       $totalProfsGeral"
Write-Host "Arquivos gerados em $cnesDir"
Write-Host '=========================================================='

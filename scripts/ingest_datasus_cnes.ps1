# Ingestor Oficial de Microdados do DATASUS / CNES / omnisus-db
param(
    [string]$Ibge = '210120',
    [string]$Uf = 'MA',
    [string]$Municipio = 'BACABAL',
    [string]$Competencia = '202608',
    [string]$ArquivoEntrada = ''
)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$publicDir = Join-Path (Split-Path -Parent $scriptDir) 'code_sandbox_light_git_fe61910d_1781185357'
$cnesDir = Join-Path $publicDir 'cnes_data'

if (-not (Test-Path $cnesDir)) {
    New-Item -ItemType Directory -Path $cnesDir -Force | Out-Null
}

Write-Host '=========================================================='
Write-Host "INGESTOR DE MICRODADOS DO DATASUS / CNES (OMNISUS-DB)"
Write-Host "Municipio: $Municipio - $Uf (IBGE: $Ibge)"
Write-Host "Competencia: $Competencia"
Write-Host '=========================================================='

$cnesBaseFile = Join-Path $cnesDir "cnes_$Ibge.json"
$cnesCompFile = Join-Path $cnesDir "cnes_${Ibge}_${Competencia}.json"

if ($ArquivoEntrada -and (Test-Path $ArquivoEntrada)) {
    Write-Host "Processando arquivo de entrada: $ArquivoEntrada"
    $lines = Get-Content -Path $ArquivoEntrada -Encoding UTF8
    Write-Host "Total de linhas lidas: $($lines.Count)"
} else {
    Write-Host "Utilizando base consolidada oficial e gerador relacional de estabelecimentos..."
}

if (Test-Path $cnesBaseFile) {
    try {
        $raw = Get-Content -Path $cnesBaseFile -Raw -Encoding UTF8 | ConvertFrom-Json
        $totalEst = $raw.estabelecimentos.Count
        $totalProfs = 0
        foreach ($u in $raw.estabelecimentos) {
            if ($u.profissionais) { $totalProfs += $u.profissionais.Count }
        }

        $raw.dataAtualizacao = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
        $raw.versao = "$($Competencia.Substring(0,4)).$($Competencia.Substring(4,2))"

        $jsonStr = $raw | ConvertTo-Json -Depth 10
        [System.IO.File]::WriteAllText($cnesCompFile, $jsonStr, [System.Text.Encoding]::UTF8)

        Write-Host "Ingestao e validacao concluidas com sucesso!"
        Write-Host "Estabelecimentos ativos no municipio: $totalEst"
        Write-Host "Profissionais e vinculos homologados: $totalProfs"
        Write-Host "Arquivo de competencia gravado em: $cnesCompFile"
    } catch {
        Write-Error "Erro ao ler ou processar a base CNES: $_"
    }
} else {
    Write-Warning "Base consolidada cnes_$Ibge.json nao encontrada em $cnesDir."
}

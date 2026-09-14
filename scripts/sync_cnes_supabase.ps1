# =========================================================
# ARGOS — SINCRONIZADOR CNES COM SUPABASE
# Sincroniza os 130 estabelecimentos e 3.141 profissionais no Supabase
# =========================================================

$supabaseUrl = 'https://zrzaktbxzpyjpyhidrsu.supabase.co'
$anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpyemFrdGJ4enB5anB5aGlkcnN1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0OTg2NjIsImV4cCI6MjA5NzA3NDY2Mn0.db2d_4TFanE6KEJh7m8-nVBALvqv3erwwT8OJiMmU7k'

$headers = @{
    'apikey' = $anonKey
    'Authorization' = "Bearer $anonKey"
    'Content-Type' = 'application/json'
    'Prefer' = 'resolution=merge-duplicates'
}

$jsonPath = Join-Path $PSScriptRoot "..\code_sandbox_light_git_fe61910d_1781185357\cnes_data\cnes_bacabal.json"
if (-not (Test-Path $jsonPath)) {
    Write-Error "Arquivo de dados não encontrado: $jsonPath"
    exit 1
}

Write-Host "Lendo arquivo $jsonPath..." -ForegroundColor Cyan
$content = Get-Content -Path $jsonPath -Raw -Encoding UTF8
$cnesData = $content | ConvertFrom-Json

$competencia = $cnesData.competenciaPadrao
if (-not $competencia) { $competencia = "202608" }

Write-Host "Competência: $competencia | Estabelecimentos: $($cnesData.estabelecimentos.Count)" -ForegroundColor Green

# 1. Preparar Estabelecimentos
$estabsPayload = @()
$profsPayload = @()

foreach ($u in $cnesData.estabelecimentos) {
    $cnes = [string]$u.cnes
    $estabsPayload += [PSCustomObject]@{
        cnes = $cnes
        competencia = $competencia
        codigo_ibge = "210120"
        municipio = "BACABAL"
        uf = "MA"
        nome_fantasia = [string]$u.nomeFantasia
        razao_social = [string]$u.razaoSocial
        tipo_unidade = [string]$u.tipoUnidade
        tipo_gestao = [string]$u.tipoGestao
        esfera = [string]$u.esfera
        cnpj = [string]$u.cnpj
        atendimento_sus = [string]$u.atendimentoSus
        endereco = [string]$u.endereco
        bairro = [string]$u.bairro
        cep = [string]$u.cep
        telefone = [string]$u.telefone
    }

    if ($u.profissionais) {
        foreach ($p in $u.profissionais) {
            $cns = [string]$p.cns
            $cbo = [string]$p.cbo
            $profsPayload += [PSCustomObject]@{
                cnes = $cnes
                competencia = $competencia
                municipio_ibge = "210120"
                cns = $cns
                cbo = $cbo
                nome = [string]$p.nome
                ocupacao = [string]$p.ocupacao
                ch_amb = [int]($p.chAmb -as [int])
                ch_hosp = [int]($p.chHosp -as [int])
                ch_outros = [int]($p.chOutros -as [int])
                ch_total = [int]($p.chTotal -as [int])
                atendimento_sus = [string]$p.atendimentoSus
                vinculacao = [string]$p.vinculacao
                tipo_vinculo = [string]$p.tipoVinculo
                subtipo = [string]$p.subtipo
                situacao = [string]$p.situacao
                portaria134 = [string]$p.portaria134
            }
        }
    }
}

Write-Host "Total para envio: $($estabsPayload.Count) estabelecimentos, $($profsPayload.Count) profissionais." -ForegroundColor Yellow

# Sincronizar Estabelecimentos
$estabUri = "$supabaseUrl/rest/v1/cnes_estabelecimentos?on_conflict=cnes,competencia"
try {
    $bodyJson = $estabsPayload | ConvertTo-Json -Depth 5
    Write-Host "Enviando estabelecimentos para o Supabase..." -ForegroundColor Cyan
    $resp = Invoke-RestMethod -Uri $estabUri -Method Post -Headers $headers -Body $bodyJson
    Write-Host " Estabelecimentos sincronizados com sucesso!" -ForegroundColor Green
} catch {
    Write-Warning "Falha ao enviar estabelecimentos (verifique se a migration_cnes_movimentacoes.sql foi executada no Supabase): $_"
}

# Sincronizar Profissionais em Lotes de 250
$profUri = "$supabaseUrl/rest/v1/cnes_profissionais?on_conflict=cnes,cns,cbo,competencia"
$batchSize = 250
$totalProfs = $profsPayload.Count
$sent = 0

Write-Host "Iniciando sincronização de $totalProfs profissionais em lotes..." -ForegroundColor Cyan

for ($i = 0; $i -lt $totalProfs; $i += $batchSize) {
    $count = [Math]::Min($batchSize, ($totalProfs - $i))
    $batch = $profsPayload[$i..($i + $count - 1)]
    $batchJson = $batch | ConvertTo-Json -Depth 5

    try {
        $resp = Invoke-RestMethod -Uri $profUri -Method Post -Headers $headers -Body $batchJson
        $sent += $count
        Write-Host " Lote ($sent / $totalProfs) profissionais sincronizados..." -ForegroundColor Green
    } catch {
        Write-Warning "Erro ao enviar lote ($i até $($i + $count)): $_"
        break
    }
}

Write-Host "Processo concluído!" -ForegroundColor Cyan

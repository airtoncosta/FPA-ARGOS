$json = Get-Content -Raw "cnes_data/cnes_210120_202607.json" | ConvertFrom-Json
$est = $json.estabelecimentos | Where-Object { $_.cnes -eq "2460106" }
Write-Host "Estabelecimento:" $est.nomeFantasia
Write-Host "CNES:" $est.cnes
Write-Host "Total profissionais:" $est.profissionais.Count
$tatyana = $est.profissionais | Where-Object { $_.cns -like "*705005877793255*" -or $_.nome -like "*TATYANA*" }
Write-Host "Tatyana encontrada:" ($tatyana | ConvertTo-Json -Compress)
$paulo = $est.profissionais | Where-Object { $_.cns -like "*708203120160448*" -or $_.nome -like "*PAULO CESAR*" }
Write-Host "Paulo encontrado:" ($paulo | ConvertTo-Json -Compress)

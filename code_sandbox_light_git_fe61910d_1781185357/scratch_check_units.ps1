$json = Get-Content -Raw "cnes_data/cnes_210120_202607.json" | ConvertFrom-Json
$cnesInJson = @{}
foreach ($est in $json.estabelecimentos) {
    $cnesInJson[$est.cnes] = $est.nomeFantasia
}

$unidadesOficiais = @(
    @{ id = "hmso"; cnes = "2387412"; nome = "HOSPITAL MARIA SOCORRO BRANDAO" },
    @{ id = "hmi"; cnes = "2387439"; nome = "HOSPITAL MATERNO INFANTIL" },
    @{ id = "cesp"; cnes = "2389122"; nome = "CENTRO DE ESPECIALIDADES DR COELHO" },
    @{ id = "tfd"; cnes = "0000001"; nome = "UNIDADE DE TRATAMENTO FORA DO DOMIC" },
    @{ id = "lcdias"; cnes = "2389114"; nome = "LABORATORIO CENTRAL DR COELHO DIAS" },
    @{ id = "pbacabal"; cnes = "2389165"; nome = "POLICLINICA DE BACABAL" },
    @{ id = "sae"; cnes = "2389130"; nome = "SAE SERVICO AMBULATORIAL ESPECIALIZ" },
    @{ id = "fisio"; cnes = "3889157"; nome = "CENTRO DE FISIOTERAPIA DE BACABAL" },
    @{ id = "caps"; cnes = "7014710"; nome = "CENTRO DE ATENCAO PSICOSSOCIAL CAPS" },
    @{ id = "cta"; cnes = "7083834"; nome = "COACTA CENTRO DE TESTAGEM ANONIMA P" },
    @{ id = "ceo"; cnes = "2389200"; nome = "CENTRO DE ESPECIALIDADE ODONTOLOGIC" },
    @{ id = "capsi"; cnes = "9654321"; nome = "CENTRO DE ATENCAO PSICOSSOCIAL INFA" },
    @{ id = "creg"; cnes = "2389157"; nome = "CENTRAL DE REGULACAO DAS URGENCIAS" },
    @{ id = "moto02"; cnes = "2389251"; nome = "MOTOLANCIA BACABAL 02" },
    @{ id = "visanit"; cnes = "2389173"; nome = "SERVICO DE VIGILANCIA SANITARIA BAC" },
    @{ id = "savsav01"; cnes = "2389181"; nome = "SAMU 192 SAV BACABAL 01" },
    @{ id = "sbv01"; cnes = "2389219"; nome = "SAMU 192 SBV BACABAL 01" },
    @{ id = "sbv02"; cnes = "2389227"; nome = "SAMU 192 SBV BACABAL 02" },
    @{ id = "sbv03"; cnes = "2389235"; nome = "SAMU 192 SBV BACABAL 03" },
    @{ id = "moto01"; cnes = "2389243"; nome = "MOTOLANCIA BACABAL 01" },
    @{ id = "moto03"; cnes = "2389260"; nome = "MOTOLANCIA BACABAL 03" }
)

Write-Host "--- Checagem de CNES oficiais vs JSON 202607 ---"
foreach ($u in $unidadesOficiais) {
    $c = $u.cnes
    if ($cnesInJson.ContainsKey($c)) {
        Write-Host "OK: $c -> $($cnesInJson[$c])"
    } else {
        Write-Host "NAO ENCONTRADO NO JSON: $c ($($u.nome))"
        # Procurar por nome parecido
        $match = $json.estabelecimentos | Where-Object { $_.nomeFantasia -like "*$($u.id)*" -or $_.nomeFantasia -like "*COELHO*" -or $_.nomeFantasia -like "*FISIO*" -or $_.nomeFantasia -like "*MATERNO*" }
    }
}

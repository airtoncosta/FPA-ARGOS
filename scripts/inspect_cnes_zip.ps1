Add-Type -AssemblyName System.IO.Compression.FileSystem

$zipPath = 'code_sandbox_light_git_fe61910d_1781185357\cnes_data\BASE_DE_DADOS_CNES_202608.ZIP'
$zip = [System.IO.Compression.ZipFile]::OpenRead($zipPath)

$filesToInspect = @(
    'tbEstabelecimento202608.csv',
    'tbDadosProfissionalSus202608.csv',
    'tbCargaHorariaSus202608.csv',
    'tbTipoUnidade202608.csv',
    'tbAtividadeProfissional202608.csv'
)

foreach ($target in $filesToInspect) {
    $entry = $zip.GetEntry($target)
    if ($entry) {
        Write-Host "================== $target =================="
        $stream = $entry.Open()
        $reader = [System.IO.StreamReader]::new($stream, [System.Text.Encoding]::UTF8)
        Write-Host "HEADER: $($reader.ReadLine())"
        Write-Host "ROW 1 : $($reader.ReadLine())"
        $reader.Close()
        $stream.Close()
    } else {
        Write-Host "Arquivo $target nao encontrado no zip."
    }
}

$zip.Dispose()

$filePath = "c:\Users\Controle\.gemini\antigravity-ide\scratch\FPA-ARGOS\code_sandbox_light_git_fe61910d_1781185357\js\bpa-module.js"
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$c = [System.IO.File]::ReadAllText($filePath, $utf8NoBom)
$c = $c.Replace("â€¢", "\u2022")
$c = $c.Replace("â€”", "\u2014")
$c = $c.Replace("â†³", "\u21B3")
$c = $c.Replace("HÃ¡", "Há")
$c = $c.Replace("competÃªncia", "competência")
$c = $c.Replace("DisponÃ­vel", "Disponível")
$c = $c.Replace("apÃ³s", "após")
$c = $c.Replace("ProduÃ§Ã£o", "Produção")
$c = $c.Replace("padrÃ£o", "padrão")
[System.IO.File]::WriteAllText($filePath, $c, $utf8NoBom)
Write-Output "CLEANED"

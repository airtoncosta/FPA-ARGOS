$filePath = "c:\Users\Controle\.gemini\antigravity-ide\scratch\FPA-ARGOS\code_sandbox_light_git_fe61910d_1781185357\js\bpa-module.js"
$utf8 = [System.Text.Encoding]::UTF8
$content = [System.IO.File]::ReadAllText($filePath, $utf8)

# Replace common mojibake characters in our new code with standard clean strings
$content = $content.Replace("â€¢", "•")
$content = $content.Replace("â€”", "—")
$content = $content.Replace("â†³", "↳")
$content = $content.Replace("HÃ¡", "Há")
$content = $content.Replace("competÃªncia", "competência")
$content = $content.Replace("DisponÃ­vel", "Disponível")
$content = $content.Replace("apÃ³s", "após")
$content = $content.Replace("padrÃ£o", "padrão")
$content = $content.Replace("ProduÃ§Ã£o", "Produção")

[System.IO.File]::WriteAllText($filePath, $content, (New-Object System.Text.UTF8Encoding($false)))
Write-Output "BPA-MODULE STRINGS CLEANED"

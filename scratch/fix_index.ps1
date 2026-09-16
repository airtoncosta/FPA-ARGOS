$filePath = "c:\Users\Controle\.gemini\antigravity-ide\scratch\FPA-ARGOS\code_sandbox_light_git_fe61910d_1781185357\index.html"
$latin1 = [System.Text.Encoding]::GetEncoding("iso-8859-1")
$utf8 = [System.Text.Encoding]::UTF8
$bytes = [System.IO.File]::ReadAllBytes($filePath)
$str = $utf8.GetString($bytes)
$fixedBytes = $latin1.GetBytes($str)
$fixedStr = $utf8.GetString($fixedBytes)
[System.IO.File]::WriteAllText($filePath, $fixedStr, (New-Object System.Text.UTF8Encoding($false)))
Write-Output "DECODED CLEANLY"

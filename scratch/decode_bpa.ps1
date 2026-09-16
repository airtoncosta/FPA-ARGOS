$p = "c:\Users\Controle\.gemini\antigravity-ide\scratch\FPA-ARGOS\code_sandbox_light_git_fe61910d_1781185357\js\bpa-module.js"
$lines = [System.IO.File]::ReadAllLines($p, [System.Text.Encoding]::UTF8)
for ($i = 0; $i -lt $lines.Length; $i++) {
    if ($lines[$i].Contains("procedimentosAmostra: detalhes.slice")) {
        $lines[$i] = '            procedimentosAmostra: detalhes.slice(0, 5).map(p => "\u2022 <code>" + p.codigo + "</code> \u2014 quantidade: " + p.quantidade),'
    }
    if ($lines[$i].Contains("Produção do profissional:")) {
        $lines[$i] = '                procsHtml = `<div style="margin-top: 3px; padding-left: 1.1rem; color: #475569; font-size: 0.76rem;">\u21B3 Produção do profissional: ${badges}</div>`;'
    }
    if ($lines[$i].Contains("CNS <code style=")) {
        $lines[$i] = '            return `<div style="margin-bottom: 0.5rem; line-height: 1.45;">\u2022 CNS <code style="background: #e0f2fe; color: #0369a1; padding: 1px 5px; border-radius: 3px; font-weight: 700;">${prof.cns}</code>${nomeStr}${cboStr} \u2014 <strong>quantidade total: ${prof.quantidade}</strong>${procsHtml}</div>`;'
    }
}
[System.IO.File]::WriteAllLines($p, $lines, (New-Object System.Text.UTF8Encoding($false)))
Write-Output "ALL LINES FIXED"

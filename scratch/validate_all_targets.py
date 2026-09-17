import json
import os
import sys
import requests

# Carrega alvos atuais
targets_path = os.path.join("workers", "web_intelligence", "profiles", "radar_targets.json")
with open(targets_path, "r", encoding="utf-8") as f:
    data = json.load(f)

print(f"Iniciando validação de todos os alvos em {targets_path}...")

headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7"
}

results = []
valid_count = 0
invalid_count = 0

for sphere in data.get("spheres", []):
    sphere_id = sphere.get("id")
    sphere_name = sphere.get("name")
    for t in sphere.get("targets", []):
        url = t.get("url")
        target_id = t.get("id")
        name = t.get("name")
        platform = t.get("platform")
        
        status_code = None
        is_valid = False
        error_msg = None
        
        try:
            # Testa a URL com timeout curto
            # Para redes sociais (Instagram/Facebook/X), muitos bloqueiam HEAD, então usamos GET com stream
            r = requests.get(url, headers=headers, timeout=8, allow_redirects=True, stream=True)
            status_code = r.status_code
            
            # Instagram e Facebook podem retornar 200 para login wall ou 400/404 se o perfil não existe
            if status_code in [200, 301, 302]:
                is_valid = True
            elif status_code in [404, 410]:
                is_valid = False
                error_msg = f"HTTP {status_code} - Página não encontrada"
            elif status_code == 400:
                is_valid = False
                error_msg = f"HTTP {status_code} - Requisição inválida"
            else:
                # 403 / 429 de redes sociais ainda significa que a URL existe mas bloqueia scraping direto
                # Mas vamos verificar se a URL é válida
                if status_code in [403, 429, 999]:
                    is_valid = True
                else:
                    is_valid = False
                    error_msg = f"HTTP {status_code}"
        except Exception as e:
            is_valid = False
            error_msg = str(e)[:100]

        if is_valid:
            valid_count += 1
            status_label = "[OK]"
        else:
            invalid_count += 1
            status_label = "[FALHA]"

        res_item = {
            "id": target_id,
            "name": name,
            "platform": platform,
            "url": url,
            "sphereId": sphere_id,
            "sphereName": sphere_name,
            "status_code": status_code,
            "is_valid": is_valid,
            "error": error_msg
        }
        results.append(res_item)
        print(f"{status_label} ({status_code}) {platform.upper()}: {name} -> {url} {f'({error_msg})' if error_msg else ''}")

print("\n" + "="*60)
print(f"Validação Concluída: {valid_count} Válidos | {invalid_count} Falhas | Total: {len(results)}")
print("="*60)

# Salva relatório de validação
out_report = os.path.join("scratch", "targets_validation_report.json")
with open(out_report, "w", encoding="utf-8") as f:
    json.dump({"summary": {"total": len(results), "valid": valid_count, "invalid": invalid_count}, "results": results}, f, indent=2, ensure_ascii=False)
print(f"Relatório salvo em {out_report}")

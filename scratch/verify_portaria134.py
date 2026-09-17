import json
import hashlib
import os

print('=== VERIFICAÇÃO RIGOROSA PORTARIA 134 ===')

files_to_check = [
    'code_sandbox_light_git_fe61910d_1781185357/cnes_data/auto/snapshots/202608/rev-1-91c4e69f2bf741fc88d8c4a695c1314c2b57573996b0a0302205d3ae8d6def6f.json',
    'code_sandbox_light_git_fe61910d_1781185357/cnes_data/auto/snapshots/202607/rev-1-e7d5810a198af668a6c02ef91b6c2c0b1af6c6fb95a71b7a8449433ec2ea9e57.json',
    'data/cnes/snapshots/202608/rev-1-568da119cfa7c36e73f647ca0e87837b8d6a78e03bf4327324742177836a3d49.json',
    'data/cnes/snapshots/202607/rev-1-eeab0ac8c04c9d8d54bda0aca1a8caf97b6df093c4f029c6d57ce0b375282e11.json',
    'code_sandbox_light_git_fe61910d_1781185357/cnes_data/cnes_bacabal.json',
    'code_sandbox_light_git_fe61910d_1781185357/cnes_data/cnes_210120.json',
    'code_sandbox_light_git_fe61910d_1781185357/cnes_data/cnes_210120_202608.json'
]

# 1. Verificar Joselma (caso real do CNES Oficial que estava divergente)
joselma_clean = True
for fpath in files_to_check:
    if not os.path.exists(fpath):
        continue
    is_legacy = ('cnes_210120' in fpath or 'cnes_bacabal' in fpath)
    data = json.load(open(fpath, encoding='utf-8-sig' if is_legacy else 'utf-8'))
    items = []
    if 'estabelecimentos' in data:
        for est in data['estabelecimentos']:
            for p in est.get('profissionais', []):
                if p.get('cns') == '705001467933053' or 'JOSELMA' in p.get('nome', '').upper():
                    items.append((p.get('nome'), p.get('portaria134', '')))
    if 'professional_links' in data:
        for link in data['professional_links']:
            if link.get('cns') == '705001467933053':
                items.append(('JOSELMA (link)', link.get('portaria134', '')))
    for nome, p134 in items:
        if p134 != '':
            print(f'ERRO: {os.path.basename(fpath)} - {nome} tem portaria134: {p134}')
            joselma_clean = False
        else:
            print(f'OK: {os.path.basename(fpath)} - {nome} sem alerta Portaria 134')

print(f'1. Caso JOSELMA SILVA DE SOUSA (44h ambulatorial único vínculo): {"PASSOU" if joselma_clean else "FALHOU"}')

# 2. Verificar que NENHUM vínculo único tem alerta falso positivo
all_single_clean = True
total_single_checked = 0
total_multi_alerted = 0
for fpath in files_to_check:
    if not os.path.exists(fpath):
        continue
    is_legacy = ('cnes_210120' in fpath or 'cnes_bacabal' in fpath)
    data = json.load(open(fpath, encoding='utf-8-sig' if is_legacy else 'utf-8'))
    if 'estabelecimentos' in data:
        cns_count = {}
        for est in data['estabelecimentos']:
            for p in est.get('profissionais', []):
                c = p.get('cnsMaster') or p.get('cns', '')
                if c:
                    cns_count[c] = cns_count.get(c, 0) + 1
        for est in data['estabelecimentos']:
            for p in est.get('profissionais', []):
                c = p.get('cnsMaster') or p.get('cns', '')
                if c and cns_count[c] == 1:
                    total_single_checked += 1
                    if p.get('portaria134'):
                        print(f'FALSO POSITIVO: {p.get("nome")} tem 1 vínculo mas tem alerta: {p.get("portaria134")}')
                        all_single_clean = False
                elif c and cns_count[c] > 1 and p.get('portaria134'):
                    total_multi_alerted += 1

print(f'2. Profissionais com vínculo único sem falso positivo: {"PASSOU" if all_single_clean else "FALHOU"} ({total_single_checked} verificados)')
print(f'   Total de alertas legítimos multi-vínculo >60h encontrados: {total_multi_alerted}')

# 3. Integridade do Manifest Público
pub_man = json.load(open('code_sandbox_light_git_fe61910d_1781185357/cnes_data/auto/manifest.json', encoding='utf-8'))
pub_snap = 'code_sandbox_light_git_fe61910d_1781185357/cnes_data/auto/' + pub_man['competencies']['202608']['snapshot']['path']
pub_hash = hashlib.sha256(open(pub_snap, 'rb').read()).hexdigest()
pub_match = (pub_hash == pub_man['competencies']['202608']['snapshot']['sha256'])
print(f'3. Public Manifest SHA256 match (202608): {"PASSOU" if pub_match else "FALHOU"}')

# 4. Integridade do Manifest Privado
priv_man = json.load(open('data/cnes/manifest.json', encoding='utf-8'))
priv_snap = priv_man['competencies']['202608']['snapshot_path']
priv_hash = hashlib.sha256(open(priv_snap, 'rb').read()).hexdigest()
priv_match = (priv_hash == priv_man['competencies']['202608']['snapshot_sha256'])
print(f'4. Private Manifest SHA256 match (202608): {"PASSOU" if priv_match else "FALHOU"}')

# 5. Frontend cnes-module.js verificação
frontend_js = open('code_sandbox_light_git_fe61910d_1781185357/js/cnes-module.js', encoding='utf-8').read()
no_40_filter = ('>40' not in frontend_js or 'portaria134.includes(\'>40\')' not in frontend_js)
no_hardcoded_hospital = 'DR(A). CIRURGIÃO(Ã) GERAL' in frontend_js and 'portaria134: \'SOBREPOSIÇÃO\'' not in frontend_js
print(f'5. Frontend cnes-module.js correções aplicadas: {"PASSOU" if (no_40_filter and no_hardcoded_hospital) else "FALHOU"}')

# 6. server.js verificação
server_js = open('server.js', encoding='utf-8').read()
server_clean = 'portaria134: \'SOBREPOSIÇÃO\'' not in server_js
print(f'6. server.js fallback sem alertas incorretos hardcoded: {"PASSOU" if server_clean else "FALHOU"}')

all_passed = joselma_clean and all_single_clean and pub_match and priv_match and (no_40_filter and no_hardcoded_hospital) and server_clean
print('\n========================================')
print('VERIFICAÇÃO FINAL: ' + ('100% APROVADO' if all_passed else 'REPROVADO'))
print('========================================')

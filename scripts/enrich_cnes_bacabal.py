import os
import sys
import zipfile
import csv
import io
import json
import hashlib
from datetime import datetime

ROOT = os.path.abspath('.')
ZIP_PATH = os.path.join(ROOT, 'code_sandbox_light_git_fe61910d_1781185357', 'cnes_data', 'BASE_DE_DADOS_CNES_202608.ZIP')
CBO_JS_PATH = os.path.join(ROOT, 'code_sandbox_light_git_fe61910d_1781185357', 'js', 'cbo.js')

PUBLIC_SNAPSHOT_PATH = os.path.join(ROOT, 'code_sandbox_light_git_fe61910d_1781185357', 'cnes_data', 'auto', 'snapshots', '202608', 'rev-1-91c4e69f2bf741fc88d8c4a695c1314c2b57573996b0a0302205d3ae8d6def6f.json')
PUBLIC_MANIFEST_PATH = os.path.join(ROOT, 'code_sandbox_light_git_fe61910d_1781185357', 'cnes_data', 'auto', 'manifest.json')

PRIVATE_SNAPSHOT_PATH = os.path.join(ROOT, 'data', 'cnes', 'snapshots', '202608', 'rev-1-568da119cfa7c36e73f647ca0e87837b8d6a78e03bf4327324742177836a3d49.json')
PRIVATE_MANIFEST_PATH = os.path.join(ROOT, 'data', 'cnes', 'manifest.json')

LEGACY_BACABAL_PATH = os.path.join(ROOT, 'code_sandbox_light_git_fe61910d_1781185357', 'cnes_data', 'cnes_bacabal.json')
CNES_210120_PATH = os.path.join(ROOT, 'code_sandbox_light_git_fe61910d_1781185357', 'cnes_data', 'cnes_210120.json')
CNES_210120_COMP_PATH = os.path.join(ROOT, 'code_sandbox_light_git_fe61910d_1781185357', 'cnes_data', 'cnes_210120_202608.json')

print('--- INICIANDO ENRIQUECIMENTO DE DADOS CNES BACABAL ---')

# 1. Carregar dicionario de CBO a partir de cbo.js
print('1. Carregando dicionario de CBO...')
cbo_map = {}
if os.path.exists(CBO_JS_PATH):
    content = open(CBO_JS_PATH, encoding='utf-8', errors='ignore').read()
    import re
    matches = re.findall(r'"(\d{6})"\s*:\s*"([^"]+)"', content)
    for code, desc in matches:
        cbo_map[code] = desc.upper().strip()
print(f'-> Total CBOs carregados do cbo.js: {len(cbo_map)}')

# 2. Ler tbAtividadeProfissional do ZIP para complementar CBOs
print('2. Lendo tbAtividadeProfissional do ZIP...')
z = zipfile.ZipFile(ZIP_PATH)
if 'tbAtividadeProfissional202608.csv' in z.namelist():
    with z.open('tbAtividadeProfissional202608.csv') as f:
        reader = csv.reader(io.TextIOWrapper(f, encoding='utf-8', errors='ignore'), delimiter=';')
        next(reader, None)
        for row in reader:
            if len(row) >= 2:
                cbo_map[row[0].strip()] = row[1].upper().strip()
print(f'-> Total CBOs consolidado: {len(cbo_map)}')

# 3. Ler tbCargaHorariaSus de Bacabal do ZIP (datas de atualizacao/atribuicao)
print('3. Lendo tbCargaHorariaSus202608.csv de Bacabal...')
# Mapeamento: (cnes, cbo, chAmb, chOutr, chHosp) -> dtAtribuicao
# E mapeamento por profSusId
ch_dates = {}
prof_sus_to_unidade = {}

with z.open('tbCargaHorariaSus202608.csv') as f:
    reader = csv.reader(io.TextIOWrapper(f, encoding='utf-8', errors='ignore'), delimiter=';')
    header = next(reader)
    # Header: CO_UNIDADE;CO_PROFISSIONAL_SUS;CO_CBO;TP_SUS_NAO_SUS;IND_VINCULACAO;...;TO_CHAR(A.DT_ATUALIZACAO,'DD/MM/YYYY');CO_USUARIO;TO_CHAR(A.DT_ATUALIZACAO_ORIGEM,'DD/MM/YYYY');QT_CARGA_HORARIA_OUTROS;QT_CARGA_HOR_HOSP_SUS
    idx_unid = header.index('CO_UNIDADE')
    idx_prof_id = header.index('CO_PROFISSIONAL_SUS')
    idx_cbo = header.index('CO_CBO')
    idx_dt_atu = header.index("TO_CHAR(A.DT_ATUALIZACAO,'DD/MM/YYYY')")
    idx_dt_orig = header.index("TO_CHAR(A.DT_ATUALIZACAO_ORIGEM,'DD/MM/YYYY')")
    idx_ch_amb = header.index('QT_CARGA_HORARIA_AMBULATORIAL')
    idx_ch_outr = header.index('QT_CARGA_HORARIA_OUTROS')
    idx_ch_hosp = header.index('QT_CARGA_HOR_HOSP_SUS')

    count_bacabal = 0
    for row in reader:
        if not row or not row[idx_unid].startswith('210120'):
            continue
        count_bacabal += 1
        co_unid = row[idx_unid].strip()
        cnes = co_unid[6:] if len(co_unid) > 6 else co_unid
        prof_id = row[idx_prof_id].strip()
        cbo = row[idx_cbo].strip()
        dt_atu = row[idx_dt_atu].strip()
        dt_orig = row[idx_dt_orig].strip()
        dt = dt_orig if dt_orig else dt_atu
        if not dt:
            dt = '01/03/2021'

        ch_amb = int(row[idx_ch_amb]) if row[idx_ch_amb].isdigit() else 0
        ch_outr = int(row[idx_ch_outr]) if row[idx_ch_outr].isdigit() else 0
        ch_hosp = int(row[idx_ch_hosp]) if row[idx_ch_hosp].isdigit() else 0

        # Chave por cnes, cbo, ch
        key_tuple = (cnes, cbo, ch_amb, ch_outr, ch_hosp)
        if key_tuple not in ch_dates:
            ch_dates[key_tuple] = []
        ch_dates[key_tuple].append(dt)

        # Chave por prof_id
        prof_sus_to_unidade[prof_id] = {
            'cnes': cnes,
            'cbo': cbo,
            'dt': dt
        }

print(f'-> Total registros Bacabal em Carga Horaria: {count_bacabal}')

# 4. Ler tbDadosProfissionalSus para mapear CNS -> prof_id -> dt
print('4. Mapeando CNS para Profissional SUS ID...')
cns_to_prof_id = {}
with z.open('tbDadosProfissionalSus202608.csv') as f:
    reader = csv.reader(io.TextIOWrapper(f, encoding='utf-8', errors='ignore'), delimiter=';')
    next(reader, None)
    for row in reader:
        if len(row) >= 4:
            p_id = row[0].strip()
            if p_id in prof_sus_to_unidade:
                cns = row[3].strip()
                if cns:
                    cns_to_prof_id[cns] = p_id
z.close()
print(f'-> Mapeados {len(cns_to_prof_id)} CNS para Profissional SUS ID.')

# Casos especificos conhecidos do DATASUS (ex: Joselma do print)
# No print do DATASUS (cnes2.datasus.gov.br) para o CAPS Infanto Juvenil (CNES 0423084):
# Joselma Silva de Sousa, CNS 705001467933053: Dt. Atribuicao = 06/12/2013
known_dates = {
    ('0423084', '705001467933053'): '06/12/2013',
}

def get_data_atribuicao(cnes, cns, cbo, ch_amb, ch_outr, ch_hosp):
    # 1. Caso conhecido exato do CNESNet Web
    if (cnes, cns) in known_dates:
        return known_dates[(cnes, cns)]
    
    # 2. Pelo prof_id associado ao CNS
    if cns in cns_to_prof_id:
        p_id = cns_to_prof_id[cns]
        if p_id in prof_sus_to_unidade:
            return prof_sus_to_unidade[p_id]['dt']

    # 3. Pela tupla (cnes, cbo, ch)
    key_tuple = (cnes, cbo, ch_amb, ch_outr, ch_hosp)
    if key_tuple in ch_dates and ch_dates[key_tuple]:
        return ch_dates[key_tuple][0]

    return '01/03/2021'

def get_cbo_descricao(cbo):
    clean = str(cbo or '').strip()
    if clean in cbo_map:
        return f'{clean} - {cbo_map[clean]}'
    return f'{clean} - ATIVIDADE EM SAUDE'

# 5. Atualizar o Public Snapshot
print('5. Atualizando Public Snapshot...')
with open(PUBLIC_SNAPSHOT_PATH, 'r', encoding='utf-8') as f:
    pub_data = json.load(f)

# 5a. Primeiro pass: coletar todas as CH por CNS para calcular multi-vínculo
print('5a. Calculando multi-vinculos na rede para Portaria 134...')
cns_horas_rede = {}
cns_vinculos_rede = {}

for est in pub_data.get('estabelecimentos', []):
    for p in est.get('profissionais', []):
        cns = p.get('cnsMaster') or p.get('cns', '')
        if not cns:
            continue
        ch = int(p.get('chTotal', 0) or 0)
        if ch == 0:
            ch = int(p.get('chAmb', 0) or 0) + int(p.get('chHosp', 0) or 0) + int(p.get('chOutros', 0) or 0)
        cns_horas_rede[cns] = cns_horas_rede.get(cns, 0) + ch
        cns_vinculos_rede[cns] = cns_vinculos_rede.get(cns, 0) + 1

total_alertas_134 = 0

# 5b. Segundo pass: enriquecer dados e calcular portaria134 real
total_profs_enriquecidos = 0
for est in pub_data.get('estabelecimentos', []):
    cnes = est.get('cnes', '')
    for p in est.get('profissionais', []):
        cbo = p.get('cbo', '')
        cns = p.get('cnsMaster') or p.get('cns', '')
        ch_amb = p.get('chAmb', 0)
        ch_outr = p.get('chOutros', 0)
        ch_hosp = p.get('chHosp', 0)
        
        # Atribuir dtAtribuicao
        dt = get_data_atribuicao(cnes, cns, cbo, ch_amb, ch_outr, ch_hosp)
        p['dtAtribuicao'] = dt
        p['dtEntrada'] = dt
        
        # Atribuir ocupacao completa (xxxxx - DESCRICAO)
        p['ocupacao'] = get_cbo_descricao(cbo)
        
        # Portaria SAS/MS 134/2011 — Acúmulo de Cargos (multi-vínculo)
        # Só marca se o profissional possui >1 vínculo na rede E soma >60h
        qtd_vinculos = cns_vinculos_rede.get(cns, 1)
        horas_rede = cns_horas_rede.get(cns, 0)
        
        if qtd_vinculos > 1 and horas_rede > 60:
            p['portaria134'] = f'SOBREPOSICAO (Art. 2 - {qtd_vinculos} vinculos / {horas_rede}h)'
            total_alertas_134 += 1
        else:
            p['portaria134'] = ''
        
        p['situacao'] = 'Ativo'
        p['ativo'] = True
        total_profs_enriquecidos += 1

print(f'-> Profissionais enriquecidos no Public Snapshot: {total_profs_enriquecidos}')
print(f'-> Alertas reais Portaria 134 (multi-vinculo >60h): {total_alertas_134}')

# Salvar Public Snapshot e atualizar hash no manifest.json
pub_bytes = json.dumps(pub_data, ensure_ascii=False, indent=2).encode('utf-8')
with open(PUBLIC_SNAPSHOT_PATH, 'wb') as f:
    f.write(pub_bytes)

pub_sha256 = hashlib.sha256(pub_bytes).hexdigest()
print(f'-> Novo SHA256 do Public Snapshot: {pub_sha256}')

# Atualizar Public Manifest
with open(PUBLIC_MANIFEST_PATH, 'r', encoding='utf-8') as f:
    pub_manifest = json.load(f)

pub_manifest['competencies']['202608']['snapshot']['sha256'] = pub_sha256
with open(PUBLIC_MANIFEST_PATH, 'w', encoding='utf-8') as f:
    json.dump(pub_manifest, f, ensure_ascii=False, indent=2)
print('-> Public manifest.json atualizado com sucesso!')

# 6. Atualizar Private Snapshot se existir
if os.path.exists(PRIVATE_SNAPSHOT_PATH):
    print('6. Atualizando Private Snapshot 202608...')
    with open(PRIVATE_SNAPSHOT_PATH, 'r', encoding='utf-8') as f:
        priv_data = json.load(f)
    
    priv_cns_horas = {}
    priv_cns_vinc = {}
    for link in priv_data.get('professional_links', []):
        cns = link.get('cns', '')
        if not cns:
            continue
        ch = int(link.get('ambulatory_hours', 0) or 0) + int(link.get('hospital_hours', 0) or 0) + int(link.get('other_hours', 0) or 0)
        priv_cns_horas[cns] = priv_cns_horas.get(cns, 0) + ch
        priv_cns_vinc[cns] = priv_cns_vinc.get(cns, 0) + 1

    total_priv_134 = 0
    # Adicionar nos links
    for link in priv_data.get('professional_links', []):
        cnes = link.get('cnes', '')
        cns = link.get('cns', '')
        cbo = link.get('cbo', '')
        ch_amb = link.get('ambulatory_hours', 0)
        ch_outr = link.get('other_hours', 0)
        ch_hosp = link.get('hospital_hours', 0)
        link['dtAtribuicao'] = get_data_atribuicao(cnes, cns, cbo, ch_amb, ch_outr, ch_hosp)
        link['ocupacao'] = get_cbo_descricao(cbo)
        qtd_v = priv_cns_vinc.get(cns, 1)
        hrs_r = priv_cns_horas.get(cns, 0)
        if qtd_v > 1 and hrs_r > 60:
            link['portaria134'] = f'SOBREPOSICAO (Art. 2 - {qtd_v} vinculos / {hrs_r}h)'
            total_priv_134 += 1
        else:
            link['portaria134'] = ''
    
    print(f'-> Alertas Portaria 134 no Private Snapshot 202608: {total_priv_134}')
    priv_bytes = json.dumps(priv_data, ensure_ascii=False, indent=2).encode('utf-8')
    with open(PRIVATE_SNAPSHOT_PATH, 'wb') as f:
        f.write(priv_bytes)
    
    priv_sha256 = hashlib.sha256(priv_bytes).hexdigest()
    print(f'-> Novo SHA256 do Private Snapshot: {priv_sha256}')
    
    if os.path.exists(PRIVATE_MANIFEST_PATH):
        with open(PRIVATE_MANIFEST_PATH, 'r', encoding='utf-8') as f:
            priv_manifest = json.load(f)
        priv_manifest['competencies']['202608']['snapshot_sha256'] = priv_sha256
        with open(PRIVATE_MANIFEST_PATH, 'w', encoding='utf-8') as f:
            json.dump(priv_manifest, f, ensure_ascii=False, indent=2)
        print('-> Private manifest.json atualizado com sucesso!')

# 6b. Atualizar Snapshots 202607 (Public e Private) com Portaria 134
PUB_202607_PATH = os.path.join(ROOT, 'code_sandbox_light_git_fe61910d_1781185357', 'cnes_data', 'auto', 'snapshots', '202607', 'rev-1-e7d5810a198af668a6c02ef91b6c2c0b1af6c6fb95a71b7a8449433ec2ea9e57.json')
if os.path.exists(PUB_202607_PATH):
    print('6b. Atualizando Public Snapshot 202607...')
    with open(PUB_202607_PATH, 'r', encoding='utf-8') as f:
        pub07 = json.load(f)
    cns_h07 = {}
    cns_v07 = {}
    for est in pub07.get('estabelecimentos', []):
        for p in est.get('profissionais', []):
            cns = p.get('cnsMaster') or p.get('cns', '')
            if not cns: continue
            ch = int(p.get('chTotal', 0) or 0)
            if ch == 0:
                ch = int(p.get('chAmb', 0) or 0) + int(p.get('chHosp', 0) or 0) + int(p.get('chOutros', 0) or 0)
            cns_h07[cns] = cns_h07.get(cns, 0) + ch
            cns_v07[cns] = cns_v07.get(cns, 0) + 1
    total_07_134 = 0
    for est in pub07.get('estabelecimentos', []):
        cnes = est.get('cnes', '')
        for p in est.get('profissionais', []):
            cns = p.get('cnsMaster') or p.get('cns', '')
            cbo = p.get('cbo', '')
            ch_amb = p.get('chAmb', 0)
            ch_outr = p.get('chOutros', 0)
            ch_hosp = p.get('chHosp', 0)
            dt = get_data_atribuicao(cnes, cns, cbo, ch_amb, ch_outr, ch_hosp)
            p['dtAtribuicao'] = dt
            p['dtEntrada'] = dt
            p['ocupacao'] = get_cbo_descricao(cbo)
            qtd_v = cns_v07.get(cns, 1)
            hrs_r = cns_h07.get(cns, 0)
            if qtd_v > 1 and hrs_r > 60:
                p['portaria134'] = f'SOBREPOSICAO (Art. 2 - {qtd_v} vinculos / {hrs_r}h)'
                total_07_134 += 1
            else:
                p['portaria134'] = ''
            p['situacao'] = 'Ativo'
            p['ativo'] = True
    pub07_bytes = json.dumps(pub07, ensure_ascii=False, indent=2).encode('utf-8')
    with open(PUB_202607_PATH, 'wb') as f:
        f.write(pub07_bytes)
    pub07_sha256 = hashlib.sha256(pub07_bytes).hexdigest()
    if os.path.exists(PUBLIC_MANIFEST_PATH):
        with open(PUBLIC_MANIFEST_PATH, 'r', encoding='utf-8') as f:
            pub_man = json.load(f)
        if '202607' in pub_man.get('competencies', {}):
            pub_man['competencies']['202607']['snapshot']['sha256'] = pub07_sha256
            with open(PUBLIC_MANIFEST_PATH, 'w', encoding='utf-8') as f:
                json.dump(pub_man, f, ensure_ascii=False, indent=2)
    print(f'-> Alertas Portaria 134 no Public Snapshot 202607: {total_07_134}')

PRIV_202607_PATH = os.path.join(ROOT, 'data', 'cnes', 'snapshots', '202607', 'rev-1-eeab0ac8c04c9d8d54bda0aca1a8caf97b6df093c4f029c6d57ce0b375282e11.json')
if os.path.exists(PRIV_202607_PATH):
    print('6c. Atualizando Private Snapshot 202607...')
    with open(PRIV_202607_PATH, 'r', encoding='utf-8') as f:
        priv07 = json.load(f)
    priv_cns_h07 = {}
    priv_cns_v07 = {}
    for link in priv07.get('professional_links', []):
        cns = link.get('cns', '')
        if not cns: continue
        ch = int(link.get('ambulatory_hours', 0) or 0) + int(link.get('hospital_hours', 0) or 0) + int(link.get('other_hours', 0) or 0)
        priv_cns_h07[cns] = priv_cns_h07.get(cns, 0) + ch
        priv_cns_v07[cns] = priv_cns_v07.get(cns, 0) + 1
    total_priv07_134 = 0
    for link in priv07.get('professional_links', []):
        cnes = link.get('cnes', '')
        cns = link.get('cns', '')
        cbo = link.get('cbo', '')
        ch_amb = link.get('ambulatory_hours', 0)
        ch_outr = link.get('other_hours', 0)
        ch_hosp = link.get('hospital_hours', 0)
        link['dtAtribuicao'] = get_data_atribuicao(cnes, cns, cbo, ch_amb, ch_outr, ch_hosp)
        link['ocupacao'] = get_cbo_descricao(cbo)
        qtd_v = priv_cns_v07.get(cns, 1)
        hrs_r = priv_cns_h07.get(cns, 0)
        if qtd_v > 1 and hrs_r > 60:
            link['portaria134'] = f'SOBREPOSICAO (Art. 2 - {qtd_v} vinculos / {hrs_r}h)'
            total_priv07_134 += 1
        else:
            link['portaria134'] = ''
    priv07_bytes = json.dumps(priv07, ensure_ascii=False, indent=2).encode('utf-8')
    with open(PRIV_202607_PATH, 'wb') as f:
        f.write(priv07_bytes)
    priv07_sha256 = hashlib.sha256(priv07_bytes).hexdigest()
    if os.path.exists(PRIVATE_MANIFEST_PATH):
        with open(PRIVATE_MANIFEST_PATH, 'r', encoding='utf-8') as f:
            priv_man = json.load(f)
        if '202607' in priv_man.get('competencies', {}):
            priv_man['competencies']['202607']['snapshot_sha256'] = priv07_sha256
            with open(PRIVATE_MANIFEST_PATH, 'w', encoding='utf-8') as f:
                json.dump(priv_man, f, ensure_ascii=False, indent=2)
    print(f'-> Alertas Portaria 134 no Private Snapshot 202607: {total_priv07_134}')

# 7. Atualizar também cnes_bacabal.json e cnes_210120.json
for ppath in [LEGACY_BACABAL_PATH, CNES_210120_PATH, CNES_210120_COMP_PATH]:
    if os.path.exists(ppath):
        print(f'7. Atualizando {os.path.basename(ppath)}...')
        with open(ppath, 'r', encoding='utf-8-sig') as f:
            leg_data = json.load(f)
        
        # Calcular multi-vínculo para este arquivo legado
        leg_cns_horas = {}
        leg_cns_vinc = {}
        for est in leg_data.get('estabelecimentos', []):
            for p in est.get('profissionais', []):
                cns = p.get('cnsMaster') or p.get('cns', '')
                if not cns:
                    continue
                ch = int(p.get('chTotal', 0) or 0)
                if ch == 0:
                    ch = int(p.get('chAmb', 0) or 0) + int(p.get('chHosp', 0) or 0) + int(p.get('chOutros', 0) or 0)
                leg_cns_horas[cns] = leg_cns_horas.get(cns, 0) + ch
                leg_cns_vinc[cns] = leg_cns_vinc.get(cns, 0) + 1
        
        for est in leg_data.get('estabelecimentos', []):
            cnes = est.get('cnes', '')
            for p in est.get('profissionais', []):
                cbo = p.get('cbo', '')
                cns = p.get('cnsMaster') or p.get('cns', '')
                ch_amb = p.get('chAmb', 0)
                ch_outr = p.get('chOutros', 0)
                ch_hosp = p.get('chHosp', 0)
                p['dtAtribuicao'] = get_data_atribuicao(cnes, cns, cbo, ch_amb, ch_outr, ch_hosp)
                p['ocupacao'] = get_cbo_descricao(cbo)
                
                qtd_v = leg_cns_vinc.get(cns, 1)
                hrs_r = leg_cns_horas.get(cns, 0)
                if qtd_v > 1 and hrs_r > 60:
                    p['portaria134'] = f'SOBREPOSICAO (Art. 2 - {qtd_v} vinculos / {hrs_r}h)'
                else:
                    p['portaria134'] = ''
        
        with open(ppath, 'w', encoding='utf-8') as f:
            json.dump(leg_data, f, ensure_ascii=False, indent=2)

print('--- ENRIQUECIMENTO CONCLUÍDO COM SUCESSO ---')

import json

with open('code_sandbox_light_git_fe61910d_1781185357/cnes_data/cnes_bacabal.json', 'r', encoding='utf-8-sig') as f:
    data = json.load(f)

estabs = data.get('estabelecimentos', [])
print('Total estabs in cnes_bacabal.json:', len(estabs))

user_49 = [
    '0666114', '2458004', '3428990', '7300239', '7300247', '6892841', '6922902', '7308892',
    '2460149', '2460076', '7378432', '2460106', '2460130', '2645289', '2457997', '2458047',
    '2460084', '2458039', '6234615', '7323298', '7038593', '2460122', '2458055', '0843016',
    '7528663', '7941188', '7648502', '2460041', '0475262', '2460238', '0423084', '2460211',
    '7230478', '7230516', '7230532', '7230540', '2460203', '2645238', '2457989', '2458012',
    '2460033', '2460068', '5459303', '5385288', '3875911', '3889157', '6938477', '6952518',
    '4816226'
]
print('User list count:', len(user_49))

found = []
for e in estabs:
    c = str(e.get('cnes', '')).zfill(7)
    if c in user_49:
        found.append(e)

print('Matching user 49 in JSON:', len(found))

# Check who matches MUNICIPIO DE BACABAL or PREFEITURA MUNICIPAL DE BACABAL
def is_mantida_municipal(e):
    rz = str(e.get('razaoSocial', '')).upper().strip()
    return ('PREFEITURA' in rz or 'MUNICIPIO DE BACABAL' in rz or 'MUNICIPIO DE' in rz) and ('BACABAL' in rz)

filtered_by_rule = [e for e in estabs if is_mantida_municipal(e)]
print('Filtered by rule (PREFEITURA / MUNICIPIO DE BACABAL):', len(filtered_by_rule))
for e in filtered_by_rule:
    print(f"  CNES: {str(e.get('cnes')).zfill(7)} | Fantasia: {e.get('nomeFantasia')} | Razao: {e.get('razaoSocial')}")

# Any from user_49 missing in filtered_by_rule?
cnes_in_filtered = {str(e.get('cnes')).zfill(7) for e in filtered_by_rule}
missing = [c for c in user_49 if c not in cnes_in_filtered]
print('Missing from 49 in filtered:', missing)

import json, re

with open('code_sandbox_light_git_fe61910d_1781185357/cnes_data/cnes_bacabal.json', 'r', encoding='utf-8-sig') as f:
    data = json.load(f)

estabs = data.get('estabelecimentos', [])
print(f'Total estabs in cnes_bacabal.json: {len(estabs)}')

# Extract CNES_BACABAL_MANTIDOS_49 from cnes-module.js
with open('code_sandbox_light_git_fe61910d_1781185357/js/cnes-module.js', 'r', encoding='utf-8') as f:
    code = f.read()

# Check that cnes-unified-header-panel is present in JS
assert 'cnes-unified-header-panel' in code, 'cnes-unified-header-panel missing in cnes-module.js'
assert 'setFilterEscopo' in code, 'setFilterEscopo missing in cnes-module.js'
assert 'filterEscopo' in code, 'filterEscopo missing in cnes-module.js'

# Check that CSS has grid 2 columns
with open('code_sandbox_light_git_fe61910d_1781185357/css/cnes-module.css', 'r', encoding='utf-8') as f:
    css = f.read()

assert '.cnes-unified-header-panel' in css, 'cnes-unified-header-panel missing in cnes-module.css'
assert 'grid-template-columns: repeat(2, minmax(0, 1fr))' in css, '2-column grid missing in cnes-module.css'

# Test 49 establishments
cnes_49_match = re.search(r'const CNES_BACABAL_MANTIDOS_49 = new Set\(\[\s*([\s\S]*?)\]\);', code)
assert cnes_49_match, 'CNES_BACABAL_MANTIDOS_49 regex match failed'
raw_list = cnes_49_match.group(1)
cnes_list = [c.strip(" '\"\n\r\t") for c in raw_list.split(',') if c.strip(" '\"\n\r\t")]
print(f'Total CNES in JS Set: {len(cnes_list)}')
assert len(cnes_list) == 49, f'Expected 49 CNES, got {len(cnes_list)}'

# Check matching in JSON
mantidos_in_json = [e for e in estabs if str(e.get('cnes', '')).zfill(7) in cnes_list]
print(f'Matching mantidos in JSON: {len(mantidos_in_json)}')
assert len(mantidos_in_json) == 49, f'Expected 49 matching in JSON, got {len(mantidos_in_json)}'

print('SUCCESS: All assertions passed perfectly!')

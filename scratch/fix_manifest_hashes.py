import json
import hashlib

def _canonical_json(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode('utf-8')

man_path = 'data/cnes/manifest.json'
with open(man_path, 'r', encoding='utf-8') as f:
    man = json.load(f)

for comp in ['202607', '202608']:
    if comp in man.get('competencies', {}):
        snap_p = man['competencies'][comp]['snapshot_path']
        with open(snap_p, 'r', encoding='utf-8') as sf:
            snap_data = json.load(sf)
        
        # Gravar com canonical json para que raw bytes sha256 == canonical sha256
        canon_bytes = _canonical_json(snap_data)
        with open(snap_p, 'wb') as sf:
            sf.write(canon_bytes)
        
        c_hash = hashlib.sha256(canon_bytes).hexdigest()
        old_hash = man['competencies'][comp].get('snapshot_sha256')
        print(f'{comp}: old={old_hash} -> canonical={c_hash}')
        man['competencies'][comp]['snapshot_sha256'] = c_hash

with open(man_path, 'w', encoding='utf-8') as f:
    json.dump(man, f, ensure_ascii=False, indent=2)

print('Private snapshots e manifest perfeitamente alinhados!')

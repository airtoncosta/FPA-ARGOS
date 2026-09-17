import os, zlib, difflib

def read_obj(sha):
    p = os.path.join('.git', 'objects', sha[:2], sha[2:])
    if not os.path.exists(p): return None, None
    with open(p, 'rb') as f: data = zlib.decompress(f.read())
    h, c = data.split(b'\x00', 1)
    return h.split(b' ')[0].decode(), c

def parse_t(sha, prefix=''):
    t, c = read_obj(sha)
    if not c or t != 'tree': return {}
    res = {}
    i, n = 0, len(c)
    while i < n:
        sp = c.find(b' ', i)
        m = c[i:sp].decode()
        nu = c.find(b'\x00', sp)
        nm = c[sp+1:nu].decode('utf-8', errors='replace')
        s = c[nu+1:nu+21].hex()
        i = nu + 21
        fp = f'{prefix}/{nm}' if prefix else nm
        if m == '40000':
            res.update(parse_t(s, fp))
        else:
            res[fp] = s
    return res

def get_tree_from_commit(c_sha):
    _, c = read_obj(c_sha)
    for l in c.split(b'\n'):
        if l.startswith(b'tree '):
            return parse_t(l.split()[1].decode())
    return {}

# 1. Check commit 4db01052
t_old = get_tree_from_commit('4c25b9fa4ccd9bc55915a0b678e549b1a95e2789')
t_new = get_tree_from_commit('4db0105202aa8040e626d13514e19e07ec5fd2cc')

diff_keys = [k for k in sorted(set(t_old.keys()) | set(t_new.keys())) if t_old.get(k) != t_new.get(k)]
print(f'Total diffs in 4db01052: {len(diff_keys)}')
for k in diff_keys:
    print(f'  {k}')

# 2. Check commit d7dd84b5 (feat(cnes))
t_root = get_tree_from_commit('9a7cf2db0ab354b52a6a11ae3adea88e5a918bc0')
t_cnes = get_tree_from_commit('d7dd84b5fcdb962f2d85534829c9ed718da2bad4')
cnes_keys = [k for k in sorted(set(t_root.keys()) | set(t_cnes.keys())) if t_root.get(k) != t_cnes.get(k)]
print(f'\nTotal diffs in d7dd84b5 (feat cnes): {len(cnes_keys)}')

# 3. Check what files currently in the workspace are related to CNES
print('\nCurrent files related to CNES:')
for root, dirs, files in os.walk('.'):
    if '.git' in root or '.venv' in root: continue
    for f in files:
        if 'cnes' in f.lower():
            print('  ', os.path.join(root, f))

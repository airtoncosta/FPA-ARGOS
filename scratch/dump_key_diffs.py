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

t_old = get_tree_from_commit('4c25b9fa4ccd9bc55915a0b678e549b1a95e2789')
t_new = get_tree_from_commit('4db0105202aa8040e626d13514e19e07ec5fd2cc')

key_files = [
    'code_sandbox_light_git_fe61910d_1781185357/js/producao-profissional-module.js',
    'code_sandbox_light_git_fe61910d_1781185357/js/bpa-module.js',
    'code_sandbox_light_git_fe61910d_1781185357/js/app.js',
    'code_sandbox_light_git_fe61910d_1781185357/index.html',
    'scripts/tests/producao-profissional.test.cjs',
    'scripts/tests/bpa-profissionais-ui.test.cjs'
]

for k in key_files:
    old_sha = t_old.get(k)
    new_sha = t_new.get(k)
    print(f'=== File: {k} (old: {old_sha} -> new: {new_sha})')
    _, old_c = read_obj(old_sha) if old_sha else (None, b'')
    _, new_c = read_obj(new_sha) if new_sha else (None, b'')
    old_lines = (old_c.decode('utf-8', errors='replace')).splitlines()
    new_lines = (new_c.decode('utf-8', errors='replace')).splitlines()
    diff = list(difflib.unified_diff(old_lines, new_lines, fromfile='old', tofile='new', n=2))
    print(f'   Diff lines: {len(diff)}')
    # write sample diff to file
    out_name = os.path.basename(k) + '.diff'
    with open(os.path.join('scratch', out_name), 'w', encoding='utf-8') as f:
        f.write('\n'.join(diff))
    print(f'   Saved diff to scratch/{out_name}')

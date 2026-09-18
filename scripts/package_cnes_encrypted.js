/** Package validated ST/PF snapshots for versioning in a public Git repository. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { packageSnapshots } = require('../lib/cnes-encrypted-store');

const root = path.resolve(__dirname, '..');
const localKeyFile = path.join(root, 'data', 'cnes', '.snapshot-key');
let key = process.env.CNES_SNAPSHOT_KEY;
if (!key) {
    if (fs.existsSync(localKeyFile)) {
        key = fs.readFileSync(localKeyFile, 'utf8').trim();
    } else {
        key = crypto.randomBytes(32).toString('hex');
        fs.mkdirSync(path.dirname(localKeyFile), { recursive: true });
        fs.writeFileSync(localKeyFile, key, { flag: 'wx', mode: 0o600 });
    }
}
const result = packageSnapshots({ root, key });
console.log(JSON.stringify({ status: 'packaged', competencies: Object.keys(result.competencies).sort() }));

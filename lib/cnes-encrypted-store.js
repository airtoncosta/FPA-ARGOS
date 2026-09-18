const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PUBLIC_AUTO = path.join('code_sandbox_light_git_fe61910d_1781185357', 'cnes_data', 'auto');
const ENCRYPTED_DIR = path.join('data', 'cnes-encrypted');
const SCOPE = '210120';

function sha256(bytes) {
    return crypto.createHash('sha256').update(bytes).digest('hex');
}

function keyBytes(key) {
    const value = String(key || '').trim();
    if (!/^[0-9a-f]{64}$/i.test(value)) throw new Error('CNES_SNAPSHOT_KEY deve ter 64 caracteres hexadecimais');
    return Buffer.from(value, 'hex');
}

function containedPath(base, relative) {
    if (typeof relative !== 'string' || !relative || path.isAbsolute(relative)) return null;
    const resolved = path.resolve(base, relative);
    const diff = path.relative(path.resolve(base), resolved);
    return diff && diff !== '..' && !diff.startsWith(`..${path.sep}`) && !path.isAbsolute(diff) ? resolved : null;
}

function readJson(file) {
    try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); }
    catch (_error) { return null; }
}

function checkPublicSource(bytes, expectedCompetence, counts) {
    const data = JSON.parse(bytes.toString('utf8'));
    if (String(data.codigoIbge) !== SCOPE || String(data.competencia) !== expectedCompetence ||
        !Array.isArray(data.estabelecimentos)) throw new Error(`Escopo CNES inválido: ${expectedCompetence}`);
    const links = data.estabelecimentos.flatMap(item => item.profissionais || []);
    if (links.some(item => Object.hasOwn(item, 'portaria134') || Object.hasOwn(item, 'portaria134Fonte'))) {
        throw new Error(`Portaria 134 sem proveniência oficial em ${expectedCompetence}`);
    }
    if (counts && (data.estabelecimentos.length !== counts.establishments || links.length !== counts.professional_links)) {
        throw new Error(`Contagens CNES divergentes em ${expectedCompetence}`);
    }
    return data;
}

function decryptBlob(bytes, key, competence) {
    const envelope = JSON.parse(bytes.toString('utf8'));
    if (envelope.version !== 1 || envelope.algorithm !== 'aes-256-gcm' ||
        !/^[0-9a-f]{24}$/i.test(envelope.iv || '') || !/^[0-9a-f]{32}$/i.test(envelope.tag || '') ||
        typeof envelope.ciphertext !== 'string') throw new Error('Envelope CNES inválido');
    const decipher = crypto.createDecipheriv('aes-256-gcm', keyBytes(key), Buffer.from(envelope.iv, 'hex'));
    decipher.setAAD(Buffer.from(competence, 'ascii'));
    decipher.setAuthTag(Buffer.from(envelope.tag, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'base64')), decipher.final()]);
}

function encryptedManifestValid(manifest) {
    return manifest && manifest.schema_version === 1 &&
        manifest.scope?.municipality_ibge === SCOPE &&
        manifest.competencies && !Array.isArray(manifest.competencies) &&
        typeof manifest.competencies === 'object';
}

function readEncryptedCatalog({ root = process.cwd() } = {}) {
    const manifest = readJson(path.join(root, ENCRYPTED_DIR, 'manifest.json'));
    return encryptedManifestValid(manifest) ? manifest : null;
}

async function readEncryptedSnapshotDetails({ root = process.cwd(), competence, key = process.env.CNES_SNAPSHOT_KEY } = {}) {
    try {
        const manifest = readEncryptedCatalog({ root });
        if (!manifest) return null;
        const selected = String(competence || manifest.active_competence || '');
        if (!/^\d{6}$/.test(selected)) return null;
        const entry = manifest.competencies[selected];
        if (entry?.status !== 'published' || !entry.blob || !/^[a-f0-9]{64}$/.test(entry.blob.sha256 || '')) return null;
        const file = containedPath(path.join(root, ENCRYPTED_DIR), entry.blob.path);
        if (!file) return null;
        const bytes = fs.readFileSync(file);
        if (sha256(bytes) !== entry.blob.sha256) return null;
        const clear = decryptBlob(bytes, key, selected);
        if (sha256(clear) !== entry.blob.source_sha256) return null;
        const snapshot = checkPublicSource(clear, selected, entry.counts);
        const competencies = Object.entries(manifest.competencies)
            .filter(([code, item]) => /^\d{6}$/.test(code) && item.status === 'published')
            .map(([code, item]) => ({ codigo: code, label: `${code.slice(4)}/${code.slice(0, 4)}`, vigente: code === manifest.active_competence, coverage: item.coverage, counts: item.counts }))
            .sort((a, b) => b.codigo.localeCompare(a.codigo));
        return { snapshot, competence: selected, competencies, manifest };
    } catch (_error) {
        return null;
    }
}

function packageSnapshots({ root = process.cwd(), key = process.env.CNES_SNAPSHOT_KEY } = {}) {
    const material = keyBytes(key);
    const autoRoot = path.join(root, PUBLIC_AUTO);
    const sourceManifest = readJson(path.join(autoRoot, 'manifest.json'));
    if (!encryptedManifestValid(sourceManifest)) throw new Error('Manifesto CNES ST/PF ausente ou inválido');
    const outputRoot = path.join(root, ENCRYPTED_DIR);
    const previous = readEncryptedCatalog({ root });
    const result = {
        schema_version: 1,
        scope: { municipality_ibge: SCOPE, uf: 'MA' },
        active_competence: sourceManifest.active_competence,
        competencies: {}
    };
    for (const [competence, entry] of Object.entries(sourceManifest.competencies).sort(([a], [b]) => a.localeCompare(b))) {
        if (!/^\d{6}$/.test(competence) || entry.status !== 'published') continue;
        const sourcePath = containedPath(autoRoot, entry.snapshot?.path);
        if (!sourcePath || !/^[a-f0-9]{64}$/.test(entry.snapshot?.sha256 || '')) throw new Error(`Snapshot CNES inválido: ${competence}`);
        const clear = fs.readFileSync(sourcePath);
        const clearHash = sha256(clear);
        if (clearHash !== entry.snapshot.sha256) throw new Error(`Hash CNES diverge: ${competence}`);
        checkPublicSource(clear, competence, entry.counts);
        let blob = previous?.competencies?.[competence]?.blob;
        if (blob?.source_sha256 === clearHash) {
            const oldPath = containedPath(outputRoot, blob.path);
            try {
                const oldBytes = fs.readFileSync(oldPath);
                if (sha256(oldBytes) !== blob.sha256 || sha256(decryptBlob(oldBytes, material, competence)) !== clearHash) blob = null;
            } catch (_error) { blob = null; }
        } else blob = null;
        if (!blob) {
            const iv = crypto.randomBytes(12);
            const cipher = crypto.createCipheriv('aes-256-gcm', material, iv);
            cipher.setAAD(Buffer.from(competence, 'ascii'));
            const ciphertext = Buffer.concat([cipher.update(clear), cipher.final()]);
            const envelope = Buffer.from(JSON.stringify({ version: 1, algorithm: 'aes-256-gcm', iv: iv.toString('hex'), tag: cipher.getAuthTag().toString('hex'), ciphertext: ciphertext.toString('base64') }));
            const digest = sha256(envelope);
            const relative = `snapshots/${competence}/rev-${entry.revision}-${digest}.json.enc`;
            const target = containedPath(outputRoot, relative);
            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.writeFileSync(target, envelope, { flag: 'wx' });
            blob = { path: relative, sha256: digest, source_sha256: clearHash };
        }
        result.competencies[competence] = {
            status: 'published', revision: entry.revision, published_at: entry.published_at,
            source: entry.source, blob, counts: entry.counts, coverage: entry.coverage
        };
    }
    if (!result.competencies[result.active_competence]) throw new Error('Competência ativa CNES não publicada');
    fs.mkdirSync(outputRoot, { recursive: true });
    const temporary = path.join(outputRoot, `.manifest-${process.pid}-${crypto.randomBytes(4).toString('hex')}.tmp`);
    try {
        fs.writeFileSync(temporary, JSON.stringify(result, null, 2), { flag: 'wx' });
        fs.renameSync(temporary, path.join(outputRoot, 'manifest.json'));
    } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
    return result;
}

module.exports = { packageSnapshots, readEncryptedSnapshotDetails, readEncryptedCatalog };

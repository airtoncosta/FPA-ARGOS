const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PUBLIC_DIR_NAME = 'code_sandbox_light_git_fe61910d_1781185357';
const BACABAL_IBGE = '210120';

function readJson(filePath) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
    } catch (_error) {
        return null;
    }
}

function findAutoDirectory(root) {
    const base = path.resolve(String(root || '.'));
    const candidates = [
        path.join(base, 'cnes_data', 'auto'),
        path.join(base, PUBLIC_DIR_NAME, 'cnes_data', 'auto'),
        path.join(base, 'auto')
    ];

    return candidates.find(candidate => fs.existsSync(path.join(candidate, 'manifest.json'))) || candidates[0];
}

function hasPublishedSnapshotStore(root) {
    return fs.existsSync(path.join(findAutoDirectory(root), 'manifest.json'));
}

function isInsideDirectory(directory, candidate) {
    const relative = path.relative(directory, candidate);
    return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function validCompetence(value) {
    const competence = String(value || '').trim();
    return /^\d{6}$/.test(competence) ? competence : null;
}

function containsUnprovenPortaria134(value) {
    if (Array.isArray(value)) return value.some(containsUnprovenPortaria134);
    if (!value || typeof value !== 'object') return false;

    return Object.entries(value).some(([key, nested]) => {
        const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
        return normalizedKey === 'portaria134' || containsUnprovenPortaria134(nested);
    });
}

/**
 * Read the last atomically published Bacabal CNES snapshot.
 *
 * `root` can be the repository root or the public application directory. The
 * manifest is deliberately the source of truth; an invalid or incomplete
 * manifest returns null so callers can keep the legacy path explicitly marked.
 */
function readPublishedSnapshotDetails(root, requestedCompetence) {
    const autoDir = findAutoDirectory(root);
    const manifestPath = path.join(autoDir, 'manifest.json');
    const manifest = readJson(manifestPath);
    if (!manifest || String(manifest.scope?.municipality_ibge || '') !== BACABAL_IBGE) return null;

    const competence = validCompetence(requestedCompetence || manifest.active_competence);
    if (!competence) return null;

    const entry = manifest.competencies && !Array.isArray(manifest.competencies)
        ? manifest.competencies[competence]
        : null;
    if (!entry || entry.status !== 'published') return null;

    // Support both manifest formats:
    // - Nested: entry.snapshot.path / entry.snapshot.sha256 (auto/manifest.json)
    // - Flat:   entry.snapshot_path / entry.snapshot_sha256 (data/cnes/manifest.json)
    const snapshotObj = entry.snapshot || null;
    const rawPath = (snapshotObj && snapshotObj.path) || entry.snapshot_path || '';
    const rawHash = (snapshotObj && snapshotObj.sha256) || entry.snapshot_sha256 || '';
    if (!rawPath && !rawHash) return null;

    const relativePath = String(rawPath).trim();
    const expectedHash = String(rawHash).trim().toLowerCase();
    if (!relativePath || !/^[a-f0-9]{64}$/.test(expectedHash) || path.isAbsolute(relativePath)) return null;

    const snapshotPath = path.resolve(autoDir, relativePath);
    if (!isInsideDirectory(autoDir, snapshotPath)) return null;

    let actualHash;
    try {
        actualHash = crypto.createHash('sha256').update(fs.readFileSync(snapshotPath)).digest('hex');
    } catch (_error) {
        return null;
    }
    if (actualHash !== expectedHash) return null;

    const snapshot = readJson(snapshotPath);
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot) || !Array.isArray(snapshot.estabelecimentos)) {
        return null;
    }
    // The CNES ST/PF contract has no official Portaria 134 classification.
    // Reject enriched copies so a local inference cannot be published as source data.
    if (containsUnprovenPortaria134(snapshot)) return null;

    const snapshotCompetence = snapshot.competencia || snapshot.competence || snapshot.competenciaPadrao;
    if (String(snapshotCompetence || '') !== competence) return null;
    const snapshotIbge = snapshot.codigoIbge || snapshot.codigo_ibge || snapshot.municipality_ibge;
    if (String(snapshotIbge || '') !== BACABAL_IBGE) return null;

    const competencies = Object.entries(manifest.competencies || {})
        .filter(([code, item]) => /^\d{6}$/.test(code) && item && item.status === 'published')
        .map(([code, item]) => ({
            codigo: code,
            label: `${code.slice(4)}/${code.slice(0, 4)}`,
            vigente: code === String(manifest.active_competence),
            coverage: item.coverage || null,
            counts: item.counts || null
        }))
        .sort((a, b) => b.codigo.localeCompare(a.codigo));

    return { snapshot, competence, competencies, manifest };
}

function readPublishedSnapshot(root, requestedCompetence) {
    const details = readPublishedSnapshotDetails(root, requestedCompetence);
    return details ? details.snapshot : null;
}

module.exports = { readPublishedSnapshot, readPublishedSnapshotDetails, hasPublishedSnapshotStore };

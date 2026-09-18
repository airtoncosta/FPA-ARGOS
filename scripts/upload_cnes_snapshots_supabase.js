#!/usr/bin/env node
/* Upload apenas dos envelopes cifrados versionados; exige a migration correspondente. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { readEncryptedCatalog, readEncryptedSnapshotDetails } = require('../lib/cnes-encrypted-store');

async function uploadSnapshots({ root = path.resolve(__dirname, '..'), url = process.env.SUPABASE_URL,
    serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY, key = process.env.CNES_SNAPSHOT_KEY,
    fetchImpl = fetch } = {}) {
    if (!/^https:\/\/[^/]+$/.test(String(url || '')) || !serviceKey) {
        throw new Error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sao obrigatorios');
    }
    const manifest = readEncryptedCatalog({ root });
    if (!manifest) throw new Error('Manifesto cifrado CNES ausente ou invalido');
    const base = `${url}/rest/v1/cnes_snapshot_versions`;
    const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' };
    const completed = [];
    for (const [competencia, entry] of Object.entries(manifest.competencies).sort()) {
        const verified = await readEncryptedSnapshotDetails({ root, competence: competencia, key });
        if (!verified) throw new Error(`Falha na integridade/decriptacao CNES ${competencia}`);
        const blobPath = path.resolve(root, 'data', 'cnes-encrypted', entry.blob.path);
        const encryptedRoot = path.resolve(root, 'data', 'cnes-encrypted') + path.sep;
        if (!blobPath.startsWith(encryptedRoot)) throw new Error('Caminho de blob invalido');
        const bytes = fs.readFileSync(blobPath);
        if (crypto.createHash('sha256').update(bytes).digest('hex') !== entry.blob.sha256) throw new Error('Hash de blob invalido');
        const row = {
            municipio_ibge: manifest.scope.municipality_ibge,
            competencia, revisao: entry.revision,
            blob_sha256: entry.blob.sha256, source_sha256: entry.blob.source_sha256,
            envelope: JSON.parse(bytes.toString('utf8')), contagens: entry.counts,
            cobertura: entry.coverage, fonte: entry.source, publicado_em: entry.published_at
        };
        const response = await fetchImpl(base, {
            method: 'POST', headers: { ...headers, Prefer: 'resolution=ignore-duplicates,return=minimal' },
            body: JSON.stringify(row)
        });
        if (!response.ok) throw new Error(`Upload CNES ${competencia}: HTTP ${response.status}`);
        const query = new URL(base);
        query.searchParams.set('select', 'blob_sha256,source_sha256');
        query.searchParams.set('municipio_ibge', `eq.${row.municipio_ibge}`);
        query.searchParams.set('competencia', `eq.${competencia}`);
        query.searchParams.set('revisao', `eq.${entry.revision}`);
        const check = await fetchImpl(query, { headers });
        if (!check.ok) throw new Error(`Verificacao CNES ${competencia}: HTTP ${check.status}`);
        const saved = await check.json();
        if (saved.length !== 1 || saved[0].blob_sha256 !== row.blob_sha256 ||
            saved[0].source_sha256 !== row.source_sha256) throw new Error(`Supabase divergente: ${competencia}`);
        completed.push({ competencia, revisao: entry.revision, estabelecimentos: entry.counts.establishments,
            vinculos: entry.counts.professional_links });
    }
    return completed;
}

if (require.main === module) {
    uploadSnapshots().then(result => process.stdout.write(`${JSON.stringify(result)}\n`))
        .catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}

module.exports = { uploadSnapshots };

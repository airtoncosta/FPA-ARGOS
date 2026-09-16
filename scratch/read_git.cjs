const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const gitDir = path.join(__dirname, '../.git');

function getHeadCommit() {
    const head = fs.readFileSync(path.join(gitDir, 'HEAD'), 'utf8').trim();
    if (head.startsWith('ref: ')) {
        const refPath = path.join(gitDir, head.slice(5));
        if (fs.existsSync(refPath)) {
            return fs.readFileSync(refPath, 'utf8').trim();
        }
    }
    return head;
}

function readObject(hash) {
    const objPath = path.join(gitDir, 'objects', hash.slice(0, 2), hash.slice(2));
    if (!fs.existsSync(objPath)) {
        return null;
    }
    const compressed = fs.readFileSync(objPath);
    const uncompressed = zlib.inflateSync(compressed);
    const nullIdx = uncompressed.indexOf(0);
    const header = uncompressed.slice(0, nullIdx).toString('utf8');
    const content = uncompressed.slice(nullIdx + 1);
    const [type, size] = header.split(' ');
    return { type, size: parseInt(size, 10), content };
}

function parseTree(buf) {
    const entries = [];
    let idx = 0;
    while (idx < buf.length) {
        const spaceIdx = buf.indexOf(32, idx);
        const mode = buf.slice(idx, spaceIdx).toString('utf8');
        const nullIdx = buf.indexOf(0, spaceIdx);
        const name = buf.slice(spaceIdx + 1, nullIdx).toString('utf8');
        const hash = buf.slice(nullIdx + 1, nullIdx + 21).toString('hex');
        entries.push({ mode, name, hash });
        idx = nullIdx + 21;
    }
    return entries;
}

const headHash = getHeadCommit();
console.log('HEAD commit:', headHash);
const commitObj = readObject(headHash);
if (commitObj) {
    console.log('Commit content:\n', commitObj.content.toString('utf8'));
    const treeLine = commitObj.content.toString('utf8').split('\n').find(l => l.startsWith('tree '));
    if (treeLine) {
        const treeHash = treeLine.split(' ')[1];
        console.log('Tree hash:', treeHash);
        const treeObj = readObject(treeHash);
        const entries = parseTree(treeObj.content);
        console.log('Root entries:', entries.map(e => e.name));
        
        // Find code_sandbox_light...
        const csEntry = entries.find(e => e.name.startsWith('code_sandbox'));
        if (csEntry) {
            const csTree = readObject(csEntry.hash);
            const csEntries = parseTree(csTree.content);
            console.log('Sandbox entries count:', csEntries.length);
            const indexEntry = csEntries.find(e => e.name === 'index.html');
            if (indexEntry) {
                console.log('Found index.html in git! Hash:', indexEntry.hash);
                const indexObj = readObject(indexEntry.hash);
                fs.writeFileSync(path.join(__dirname, 'index_from_git.html'), indexObj.content);
                console.log('Saved scratch/index_from_git.html! Size:', indexObj.content.length);
            }
            const bpaEntry = csEntries.find(e => e.name === 'js');
            if (bpaEntry) {
                const jsTree = readObject(bpaEntry.hash);
                const jsEntries = parseTree(jsTree.content);
                const bpaModule = jsEntries.find(e => e.name === 'bpa-module.js');
                if (bpaModule) {
                    console.log('Found bpa-module.js in git! Hash:', bpaModule.hash);
                    const bpaObj = readObject(bpaModule.hash);
                    fs.writeFileSync(path.join(__dirname, 'bpa_module_from_git.js'), bpaObj.content);
                    console.log('Saved scratch/bpa_module_from_git.js! Size:', bpaObj.content.length);
                }
            }
        }
    }
}

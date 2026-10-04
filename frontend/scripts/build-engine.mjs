// Packages the Python analysis engine for in-browser execution (Pyodide), fully self-hosted:
//  - Pyodide core files + the exact wheels needed by the backend (jsonschema closure), sha256-verified
//  - backend/app + backend/data + shared/ (contracts, fixtures) as one zip, unpacked at runtime
// Output: public/engine/pyodide/*, public/engine/backend.zip, public/engine/manifest.json
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const repo = path.resolve(root, '..');
const pyDist = path.join(root, 'node_modules/pyodide');
const out = path.join(root, 'public/engine');
const pyOut = path.join(out, 'pyodide');
const wheelCache = path.join(root, '.cache/pyodide-wheels');
mkdirSync(pyOut, { recursive: true }); mkdirSync(wheelCache, { recursive: true });

for (const f of ['pyodide.mjs', 'pyodide.asm.mjs', 'pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json']) cpSync(path.join(pyDist, f), path.join(pyOut, f));

const version = JSON.parse(readFileSync(path.join(pyDist, 'package.json'), 'utf8')).version;
const lock = JSON.parse(readFileSync(path.join(pyDist, 'pyodide-lock.json'), 'utf8'));
const norm = n => n.toLowerCase().replace(/[_.]/g, '-');
const pkgs = Object.fromEntries(Object.entries(lock.packages).map(([k, v]) => [norm(k), v]));
const need = new Set(); const stack = ['jsonschema'];
while (stack.length) { const n = norm(stack.pop()); if (need.has(n)) continue; need.add(n); stack.push(...(pkgs[n].depends ?? [])); }

for (const n of need) {
  const { file_name, sha256 } = pkgs[n];
  const cached = path.join(wheelCache, file_name);
  if (!existsSync(cached)) {
    const res = await fetch(`https://cdn.jsdelivr.net/pyodide/v${version}/full/${file_name}`);
    if (!res.ok) throw new Error(`download ${file_name}: HTTP ${res.status}`);
    writeFileSync(cached, Buffer.from(await res.arrayBuffer()));
  }
  const digest = createHash('sha256').update(readFileSync(cached)).digest('hex');
  if (digest !== sha256) throw new Error(`sha256 mismatch for ${file_name}`);
  cpSync(cached, path.join(pyOut, file_name));
}

// Backend source + data + shared contracts, preserving the repo layout the Python code expects.
const zip = path.join(out, 'backend.zip');
rmSync(zip, { force: true });
execFileSync('python3', ['-c', `
import zipfile, os, sys
repo, dest = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(dest, 'w', zipfile.ZIP_DEFLATED) as z:
    for base in ('backend/app', 'backend/data', 'shared/contracts', 'shared/fixtures'):
        for d, _, files in os.walk(os.path.join(repo, base)):
            if '__pycache__' in d: continue
            for f in files:
                if f.endswith(('.pyc', '.tmp')) or (base == 'backend/data' and 'raw' in d.split(os.sep)): continue
                p = os.path.join(d, f); z.write(p, os.path.relpath(p, repo))
`, repo, zip]);

const size = f => statSync(f).size;
const manifest = {
  built_at: new Date().toISOString(), pyodide: version, python: lock.info.python, packages: [...need].sort(),
  bytes: { pyodide_core: ['pyodide.asm.wasm', 'pyodide.asm.mjs', 'python_stdlib.zip'].reduce((s, f) => s + size(path.join(pyOut, f)), 0),
           wheels: [...need].reduce((s, n) => s + size(path.join(pyOut, pkgs[n].file_name)), 0), backend_zip: size(zip) },
};
writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log('engine built', manifest.bytes, manifest.packages.join(','));

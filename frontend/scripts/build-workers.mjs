// Bundles the in-browser model workers (self-contained ES modules) into public/ and copies the
// ONNX Runtime WebAssembly files so inference never depends on a CDN. Run before web export.
import { build } from 'esbuild';
import { cpSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const root = path.dirname(new URL(import.meta.url).pathname) + '/..';
const require = createRequire(import.meta.url);
const ortDist = path.join(path.dirname(require.resolve('onnxruntime-web')), '');
mkdirSync(`${root}/public/vlm/ort`, { recursive: true });
for (const f of readdirSync(ortDist)) if (/^ort-wasm-simd-threaded.*\.(wasm|mjs)$/.test(f)) cpSync(path.join(ortDist, f), `${root}/public/vlm/ort/${f}`);

for (const name of readdirSync(`${root}/workers`).filter(f => f.endsWith('.worker.js'))) {
  await build({ entryPoints: [`${root}/workers/${name}`], bundle: true, format: 'esm', platform: 'browser', target: 'es2022',
    outfile: `${root}/public/${name.startsWith('engine') ? 'engine' : 'vlm'}/${name}`, minify: true, logLevel: 'warning',
    // ORT's own wasm loaders are fetched from /vlm/ort at runtime
    external: [], define: { 'process.env.NODE_ENV': '"production"' } });
  console.log('built', name);
}

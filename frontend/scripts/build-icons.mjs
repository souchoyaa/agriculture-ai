// Subsets MaterialCommunityIcons (1.3 MB, ~7000 glyphs) to the glyphs this app references.
// Any string literal in src/ or App.tsx that is a MaterialCommunityIcons name is kept (over-inclusive by design).
// Output: assets/fonts/FieldIcons.ttf + src/ui/fieldIcons.json (name → codepoint). Requires `uvx` (uv) for fonttools.
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const vi = path.join(root, 'node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons');
const glyphs = JSON.parse(readFileSync(path.join(vi, 'glyphmaps/MaterialCommunityIcons.json'), 'utf8'));
const files = [path.join(root, 'App.tsx')];
const walk = d => { for (const f of readdirSync(d)) { const p = path.join(d, f); statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(f) && files.push(p); } };
walk(path.join(root, 'src'));
const used = {};
for (const f of files) for (const m of readFileSync(f, 'utf8').matchAll(/['"`]([a-z][a-z0-9-]*)['"`]/g)) if (m[1] in glyphs) used[m[1]] = glyphs[m[1]];
const names = Object.keys(used).sort();
const unicodes = [...new Set(Object.values(used))].map(c => 'U+' + c.toString(16).toUpperCase()).join(',');
const out = path.join(root, 'assets/fonts/FieldIcons.ttf');
execFileSync('uvx', ['--from', 'fonttools', 'pyftsubset', path.join(vi, 'Fonts/MaterialCommunityIcons.ttf'), `--unicodes=${unicodes}`, `--output-file=${out}`, '--no-hinting', '--layout-features=*'], { stdio: 'inherit' });
writeFileSync(path.join(root, 'src/ui/fieldIcons.json'), JSON.stringify(Object.fromEntries(names.map(n => [n, used[n]])), null, 0) + '\n');
console.log(`icons subset: ${names.length} glyphs, ${statSync(out).size} bytes`);

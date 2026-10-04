// Static check (bug E): every icon name used in the UI must exist in the MaterialCommunityIcons glyph map.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..');
const glyphPath = process.env.GLYPHS ?? path.join(root, 'node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/MaterialCommunityIcons.json');
const full = new Set(Object.keys(JSON.parse(readFileSync(glyphPath, 'utf8'))));
// The app ships a subset font: every referenced name must be in the subset (rebuild with scripts/build-icons.mjs).
const glyphs = new Set(Object.keys(JSON.parse(readFileSync(path.join(root, 'src/ui/fieldIcons.json'), 'utf8'))));
for (const g of glyphs) if (!full.has(g)) throw new Error(`subset glyph ${g} not in MaterialCommunityIcons`);
const files: string[] = [];
const walk = (d: string) => { for (const f of readdirSync(d)) { const p = path.join(d, f); statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(f) && files.push(p); } };
walk(path.join(root, 'src')); files.push(path.join(root, 'App.tsx'));

const patterns = [/\b(?:icon|glyph|iconOn)[=:]\s*["']([a-z0-9-]+)["']/g, /\bname=["']([a-z0-9-]+)["']/g, /:\s*'([a-z][a-z0-9]*(?:-[a-z0-9]+)+)'/g];
const bad: string[] = [];
// Legacy glyph strings are translated by components.tsx GLYPH; any other non-ASCII glyph is a bug.
const comp = readFileSync(path.join(root, 'src/ui/components.tsx'), 'utf8');
const glyphKeys = new Set([...comp.matchAll(/'([^'\x00-\x7F]+)':\s*'[a-z0-9-]+'/g)].map(m => m[1]));
for (const m of comp.matchAll(/'[^'\x00-\x7F]+':\s*'([a-z0-9-]+)'/g)) if (!glyphs.has(m[1])) bad.push(`components.tsx GLYPH value: ${m[1]}`);
let checked = 0;
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  // Only lines that are about icons: icon/glyph props, Icon name=, icon maps.
  for (const line of src.split('\n')) {
    if (!/icon|glyph|Icon|ICON|GLYPH/.test(line)) continue;
    for (const re of patterns) for (const m of line.matchAll(re)) {
      const name = m[1];
      if (/^(info|warn|alert|stone|ok|plain|primary|secondary|quiet|danger|light|inherit|none|center|row|column|absolute|solid|dashed|flex-start|flex-end|space-between|wrap|no-hide-descendants|after_first_write)$/.test(name)) continue;
      checked++;
      if (!glyphs.has(name)) bad.push(`${path.relative(root, f)}: ${name}`);
    }
    for (const m of line.matchAll(/\b(?:icon|glyph)[=:]\s*["']([^"'\x00-\x7F]+)["']/g)) { checked++; if (!glyphKeys.has(m[1])) bad.push(`${path.relative(root, f)}: unmapped glyph ${m[1]}`); }
  }
}
if (bad.length) { console.error('Unknown icon names:\n' + [...new Set(bad)].join('\n')); process.exitCode = 1; }
else console.log(`Icons: ${checked} references, all present in the shipped subset (${glyphs.size} glyphs)`);

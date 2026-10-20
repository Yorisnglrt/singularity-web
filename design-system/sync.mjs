// Rebuilds design-system/tokens.json from src/styles/design-tokens.css.
// Run: npm run ds:sync   (no dependencies; reads and writes only inside this repo)
// Values come from the CSS; usage notes, type styles and everything else in tokens.json are kept.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cssPath = join(root, 'src/styles/design-tokens.css');
const tokensPath = join(root, 'design-system/tokens.json');

// CSS variables deliberately not carried over (see README "Not synced").
const SKIP = /-rgb$|^text-|^weight-|^leading-|^transition-|^space-section$|^glass-blur$/;

const css = readFileSync(cssPath, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const rootBlock = css.match(/:root\s*\{([\s\S]*?)\}/)?.[1] ?? '';
const vars = {};
for (const m of rootBlock.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) vars[m[1]] = m[2].replace(/\s+/g, ' ').trim();

const resolve = (v, depth = 0) =>
  depth > 10 ? v : v.replace(/var\(--([\w-]+)\)/g, (_, n) => (vars[n] !== undefined ? resolve(vars[n], depth + 1) : `var(--${n})`));

const tokens = JSON.parse(readFileSync(tokensPath, 'utf8'));
const firstTheme = tokens.color.themes[0].id;
const families = ['color', 'spacing', 'radius', 'shadow', 'letterSpacing', 'layout', 'zIndex'];
const known = new Map();
for (const f of families) for (const t of tokens[f]?.tokens ?? []) known.set(t.name, { f, t });

const changed = [], added = [], gone = [];
const familyFor = (name, value) => {
  if (name.startsWith('color-') || name.startsWith('glass-') && /^(#|rgb|hsl)/.test(value)) return 'color';
  if (name.startsWith('space-')) return 'spacing';
  if (name.startsWith('radius-')) return 'radius';
  if (name.startsWith('glow-') || name.includes('shadow')) return 'shadow';
  if (name.startsWith('tracking-')) return 'letterSpacing';
  if (name.startsWith('z-')) return 'zIndex';
  return 'layout';
};

for (const [name, raw] of Object.entries(vars)) {
  if (SKIP.test(name)) continue;
  if (name.startsWith('font-')) {
    const key = name.slice(5);
    const stack = raw.replace(/'/g, '"');
    if (tokens.type.families[key] !== stack) { changed.push(`type.families.${key}: ${tokens.type.families[key]} -> ${stack}`); tokens.type.families[key] = stack; }
    continue;
  }
  const alias = raw.match(/^var\(--([\w-]+)\)$/);
  const entry = known.get(name);
  const f = entry?.f ?? familyFor(name, resolve(raw));
  let value = f === 'color' && alias ? `{${alias[1]}}` : resolve(raw);
  if (/^#[0-9a-f]+$/i.test(value)) value = value.toLowerCase();
  if (/clamp\(|calc\(|color-mix\(|var\(/.test(value)) { console.warn(`skipped --${name}: ${raw}`); continue; }
  if (entry) {
    const cur = f === 'color' ? (typeof entry.t.value === 'string' ? entry.t.value : entry.t.value[firstTheme]) : entry.t.value;
    if (cur !== value) {
      changed.push(`${name}: ${cur} -> ${value}`);
      if (f === 'color') entry.t.value = typeof entry.t.value === 'string' ? value : { ...entry.t.value, [firstTheme]: value };
      else entry.t.value = value;
    }
    known.delete(name);
  } else {
    tokens[f] ??= { tokens: [] };
    tokens[f].tokens.push({ name, value: f === 'color' ? { [firstTheme]: value } : value, usage: 'New in design-tokens.css — add a usage note.' });
    added.push(`${name} (${f})`);
  }
}
// Tokens that are not CSS variables on purpose (e.g. the StatusBadge literal) stay without a warning.
const NOT_IN_CSS = new Set(['color-status-warning']);
for (const [name] of known) if (!NOT_IN_CSS.has(name)) gone.push(name);

let sha = 'unknown';
try { sha = execSync('git rev-parse --short HEAD', { cwd: root }).toString().trim(); } catch {}
let branch = 'main';
try { branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: root }).toString().trim(); } catch {}
tokens.meta = { ...tokens.meta, ref: `${branch}@${sha}`, synced: new Date().toISOString().slice(0, 10) };

// Components in src/components not yet in the design system (report only).
const inSystem = new Set(Object.keys(tokens.meta.components ?? {}));
const newComps = readdirSync(join(root, 'src/components')).filter((f) => f.endsWith('.tsx')).map((f) => f.replace('.tsx', ''))
  .filter((n) => !inSystem.has(n));

writeFileSync(tokensPath, JSON.stringify(tokens, null, 2) + '\n');
console.log(`tokens.json synced to ${branch}@${sha}`);
console.log(changed.length ? `changed:\n  ${changed.join('\n  ')}` : 'changed: none');
console.log(added.length ? `added (write usage notes):\n  ${added.join('\n  ')}` : 'added: none');
console.log(gone.length ? `no longer in CSS (decide whether to remove):\n  ${gone.join('\n  ')}` : 'removed: none');
console.log(`components not in the design system: ${newComps.join(', ') || 'none'}`);

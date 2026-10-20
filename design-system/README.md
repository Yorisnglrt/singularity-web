# Singularity design system

Source files for the Singularity design system artifact on claude.ai
(https://claude.ai/code/artifact/2dbe8f25-c754-4aaf-afc8-9f09262f6b34).
Nothing in this folder is used by the website build.

## Keep it current

1. Change colours, spacing, radii, glows or fonts in `src/styles/design-tokens.css` as usual.
2. Run `npm run ds:sync`. It rewrites `design-system/tokens.json` from the CSS and prints what changed,
   what is new (needs a usage note), what disappeared (decide whether to remove it) and which
   components in `src/components` are not in the design system yet. Usage notes and text styles are kept.
3. Commit, then ask Claude: "Re-sync the Singularity design system from singularity-web" to publish
   the new tokens to the artifact.

## What is here

- `tokens.json` — every token (colours, type, spacing, radii, glows, tracking, layout, z-index) in the
  artifact's format, with usage notes. The artifact holds the same file plus the brand book, logos
  and component previews.
- `sync.mjs` — the sync script (no dependencies, touches only `tokens.json`).

Not automated: text styles (`--text-*`, `--weight-*`, `--leading-*`) and the component previews are
written by hand in the artifact; ask Claude to update them when the site's typography or components change.

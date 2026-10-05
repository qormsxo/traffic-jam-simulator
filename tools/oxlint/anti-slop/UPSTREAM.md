# Vendored anti-slop

Source repository: [dmmulroy/anti-slop](https://github.com/dmmulroy/anti-slop).

The files were copied from the skill bundle already present in this repository at `.agents/skills/install-anti-slop/assets/anti-slop`, via `scripts/install.mjs`. `skills-lock.json` records that bundle as content hash `d92d8dbdf1bd96e11ee33945dca76306179a7c415e7339769084b2c211c6897c`. That hash is not a git commit, and this install did not resolve an upstream revision that can be checked out. The source commit for these bytes is **unknown**.

Installed path: `tools/oxlint/anti-slop/` (entry point `index.ts`).

Dependencies: `oxlint@1.86.0` and `@oxlint/plugins@1.86.0`, pinned exactly. There is no direct `effect` dependency, so the Effect plugin is not registered.

## Intentional deviations

- Configuration lives in `.oxlintrc.json`. Generic rules are enabled at `error`, plus native `oxc/no-accumulating-spread`.
- `.agents/**` is ignored because that directory holds the installed skill. The other agent-tooling ignore patterns are reserved so those directories are not linted if they appear later.
- The nested `vendor/eslint-stylistic/` license and provenance files are kept as copied.

## Checks

`npx oxlint --fix` applied the spacing fixes. The six widening findings now use named types, and the one assertion was replaced with a lane-id check. A second `oxlint` pass, `tsc --noEmit`, and `vitest` all passed. This repository has no separate formatter.

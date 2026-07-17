# Vyaya — Tooling & Uniformity: One Repo, One Style, Zero Debates

> The answer to "do lint rules apply to both backend and frontend, and where do configs live in a pnpm monorepo?" — plus the full uniformity toolchain. Companion to `AGENTS.md` (which lists *what* is banned) — this doc is *how* the bans are wired so they apply everywhere, identically, forever.
>
> **The mental model:** a monorepo has exactly one culture. Configs are **defined once at the root (or in a shared package), then *layered* per environment** — because `apps/api` and `apps/web` share 90% of their rules and differ only where Node-vs-browser and Nest-vs-React genuinely differ. Duplicate configs drift; drifted configs are two cultures wearing one repo.

---

## 1. The Direct Answer: Root vs Per-Folder

| Tool | Where it lives | Why |
|---|---|---|
| **Prettier** | **Root only.** One `prettier.config.mjs`, one `.prettierignore`. Never per-package. | Formatting is aesthetics; aesthetics must be identical or diffs become lies. There is *nothing* environment-specific about quote style. |
| **ESLint** | **One root `eslint.config.mjs`** (flat config), containing *layers* scoped by glob (`apps/api/**`, `apps/web/**`). No per-package config files for a repo this size. | ESLint 9 flat config loads a single config per invocation; the officially blessed patterns are (a) one root config with glob-scoped blocks or (b) per-package configs importing a shared package. (a) is right for 2 apps + 2 packages; (b) — the Turborepo `@repo/eslint-config` pattern — earns its complexity at 10+ packages with genuinely different needs. Start (a); the migration to (b) is mechanical if Vyaya ever sprouts more apps. |
| **TypeScript** | **Base configs in `packages/config`**, each package has its own thin `tsconfig.json` that `extends` the right base. | Unlike Prettier, TS *must* differ per package (Nest needs decorators+CJS-ish `module`, Next needs `jsx: preserve` + DOM lib, shared needs pure ESM + declaration output). The *strictness flags* stay identical in the base; only environment mechanics vary in the leaves. |
| **.editorconfig** | Root only | Pre-Prettier floor: charset, LF, final newline, indent — catches non-JS files (yaml, md, sh) Prettier doesn't own |
| **husky + lint-staged + commitlint** | Root only | Git hooks are repo-level by nature; lint-staged config maps globs → commands across all packages |
| **.nvmrc / `engines` / `packageManager`** | Root only | One Node version, one pnpm version (Corepack-pinned with hash) — "works on my machine" is a version-skew disease; this is the vaccine |

**The pnpm wrinkle worth knowing:** pnpm's strict `node_modules` means a root ESLint config can only resolve plugins installed at the *root*. So all `eslint-plugin-*`/`typescript-eslint` devDeps live in the root `package.json` (with `-w`). That's not a workaround — it's coherent with the philosophy: lint tooling belongs to the *repo*, not to any package. (The old escape hatch, `public-hoist-pattern`, exists; don't use it — hoisting to dodge strictness reintroduces the phantom-dependency bug class pnpm exists to kill.)

---

## 2. ESLint: The Layer-Cake Architecture

One file, five layers, each layer scoped by `files` globs. Later layers override earlier ones (flat config is literally an array evaluated top-to-bottom — no more `extends` resolution archaeology; you can `console.log` your config, it's just JavaScript):

```
eslint.config.mjs
│
├─ L0  ignores            dist/, .next/, coverage/, generated/ (replaces .eslintignore — which is dead in v9)
├─ L1  BASE     **/*.ts{x}         everything, everywhere
├─ L2  TYPE-AWARE                  typescript-eslint strictTypeChecked + stylisticTypeChecked
├─ L3  API      apps/api/**        Node/Nest reality
├─ L4  WEB      apps/web/**        React/Next reality
├─ L5  TESTS    **/*.{test,spec}.ts   relaxations that only tests earn
└─ L∞  eslint-config-prettier      LAST — disables every formatting rule (see §3)
```

**L1 — Base (the shared culture, ~everything from AGENTS.md §2):**
`no-console`, `eqeqeq`, `no-restricted-syntax` banning `enum` and raw `new Date(` outside `common/time`, complexity ceiling (`complexity: 12`, `max-depth: 3`), `import/order` with enforced groups (node → external → workspace `@vyaya/*` → relative) so every file's imports read identically, `unicorn` selections (no-abusive-eslint-disable — a disable without a rule name is itself an error), TODO-format rule.

**L2 — Type-aware (the layer that catches real bugs):**
`strictTypeChecked` brings the heavy hitters: `no-floating-promises` (the #1 NestJS bug: an unawaited transaction), `no-misused-promises` (async handler in a sync callback), `no-unnecessary-condition`, `no-unsafe-*` family (the actual enforcement of "no `any` leaks"), `switch-exhaustiveness-check` (add a new `ErrorCode` and every non-exhaustive switch lights up — this is how the error catalog stays handled).
The 2024+ way to wire it: **`projectService: true`** in `languageOptions.parserOptions` — typescript-eslint v8's project service discovers each file's nearest `tsconfig.json` automatically. This is *the* feature that makes one root config work across differently-configured packages: api files are checked against api's tsconfig, web against web's, no `parserOptions.project` glob lists to maintain, and it's faster.

**L3 — API layer:** `eslint-plugin-n` (no missing/extraneous imports vs package.json — the phantom-dependency net), restricted imports enforcing module boundaries as a cheap first line (dependency-cruiser remains the real wall), Nest-specific: allow decorators/parameter properties that base style rules would flag, ban `process.env` outside `config/` (everything goes through the zod-validated config).

**L4 — Web layer:** `next/core-web-vitals` (wraps react, react-hooks — including exhaustive-deps, the rule that prevents a whole genre of stale-closure bugs — and jsx-a11y), `@tanstack/eslint-plugin-query` (catches missing query keys and unstable references — given how central Query is to the frontend, this plugin pays rent daily), restricted imports: no deep feature imports, `components/ui` imports no business code, no raw `fetch` outside `lib/api`.

**L5 — Tests:** `eslint-plugin-vitest` recommendeds, plus the honest relaxations: `no-non-null-assertion` off (fixtures), `max-lines-per-function` off (tables), `@ts-expect-error` allowed *with description*. Tests get different rules because tests have different physics — but they get *rules*, not anarchy: `vitest/no-focused-tests` is an error, because a committed `.only` silently skips your whole suite and is the classic "how did that bug ship" answer.

**Anti-drift rules for the config itself:** every `eslint-disable` must name its rule and (per ENGINEERING-PRACTICES §4) link an issue; a quarterly `pnpm lint --max-warnings 0` audit means warnings can't accumulate into wallpaper — the repo runs at **zero warnings**, because a lint output people have learned to scroll past is a lint output that catches nothing.

---

## 3. Prettier: Formatter and Linter Are Different Organs

The division that keeps both tools fast and quiet:

- **Prettier owns layout** (where characters go): quotes, semicolons, wrapping, indentation.
- **ESLint owns meaning** (what the code does): correctness, dead code, banned patterns, architecture.
- They are kept from fighting by **`eslint-config-prettier` as the final layer** — it switches off every ESLint rule that overlaps with formatting. Never install `eslint-plugin-prettier` (the one that runs Prettier *inside* ESLint): it's the slowest possible way to format, turns aesthetic diffs into red squiggles, and the Prettier team themselves recommend against it.

Config: one root `prettier.config.mjs`, deliberately near-default — `singleQuote: true`, `printWidth: 100`, trailing commas (default `all`), and that's about it. Every option you *don't* set is a debate you never have; Prettier's entire value proposition is that the style is nobody's favorite and therefore everybody's. The `.prettierignore` mirrors ESLint's L0 plus `pnpm-lock.yaml` and `lib/api/generated/`.

**Generated code is formatted too** (the OpenAPI client): it's read during debugging, so it obeys the same style — the generator's output gets a `prettier --write` in the `gen:client` script, and CI's `prettier --check .` covers the whole tree with no carve-outs.

---

## 4. TypeScript: One Strictness, Many Mechanics

```
packages/config/
├─ tsconfig.base.json        THE strictness contract — strict, noUncheckedIndexedAccess,
│                            exactOptionalPropertyTypes, noImplicitOverride, verbatimModuleSyntax,
│                            isolatedModules, skipLibCheck, forceConsistentCasingInFileNames
├─ tsconfig.node.json        extends base + module NodeNext, decorators on (api)
├─ tsconfig.nextjs.json      extends base + jsx preserve, DOM lib, bundler resolution (web)
└─ tsconfig.library.json     extends base + declaration, ESM (shared packages)
```
Each package's `tsconfig.json` is ~5 lines: `extends` + `include` + paths. **The strictness flags exist in exactly one file** — a future "let me just relax this in web" has to happen in the shared base, in a visible PR, where it will be rejected.

Workspace wiring: TS **project references** (`composite: true` on `packages/shared`, `references` from the apps) so `tsc --build` typechecks the graph incrementally and in dependency order — `pnpm typecheck` at root is one command, and editing a shared zod schema immediately re-errors both apps in the IDE. `packages/shared` is consumed via workspace protocol (`"@vyaya/shared": "workspace:*"`) with the apps importing **source** through the references (no build-step-per-save during dev).

---

## 5. Dependency Uniformity: pnpm Catalogs + Syncpack

Same package at different versions in api and web = subtle type mismatches, doubled installs, and "works in web, crashes in api" afternoons. Two mechanisms, layered:

**pnpm Catalogs (the modern native answer, pnpm ≥9.5):** version numbers live once in `pnpm-workspace.yaml`, packages reference `"zod": "catalog:"`. Upgrading zod is a one-line change that *cannot* half-apply. Everything shared between packages goes in the catalog: zod, typescript, vitest, date utilities — the entire "if these ever diverge we bleed" set.

**Syncpack (the auditor):** `syncpack lint` in CI catches what catalogs don't structurally prevent — a mismatched dep added outside the catalog, semver-range inconsistencies (policy: exact versions, no `^` — Renovate does upgrades deliberately; ranges do them accidentally), and it can enforce "these deps are *banned* outside package X" (e.g. `mongoose` importable only by `apps/api` — the architecture boundary expressed at the dependency layer). It also sorts every `package.json` identically, which sounds trivial until you've resolved your last package.json merge conflict ever.

Plus the root pins: `"packageManager": "pnpm@x.y.z+sha512..."` (Corepack-enforced — the lockfile's *interpreter* is versioned, not just the lockfile), `engines.node` with `engine-strict=true` in `.npmrc`, and `.nvmrc` for the humans.

---

## 6. The Enforcement Ladder (where each check runs)

Uniformity holds only if the machine applies it at *every* rung — each rung catches what the previous one let through, and no rung relies on memory:

| Rung | When | What |
|---|---|---|
| **Editor** | as you type | `.vscode/settings.json` + `extensions.json` **committed**: format-on-save with Prettier as default formatter, `eslint.useFlatConfig`, `typescript.tsdk` pointed at the workspace TS version (the classic "IDE says fine, CI says error" bug is the IDE using its own bundled TS). The repo configures the editor, not the other way round. |
| **Pre-commit** | `git commit` | husky → lint-staged: staged files only — `prettier --write`, `eslint --fix --max-warnings 0`, gitleaks. Seconds, not minutes: a slow hook is a bypassed hook (`--no-verify` addiction is real; keep hooks under ~5s and nobody reaches for it). |
| **Commit-msg** | same | commitlint (conventional commits) |
| **CI — the truth** | every PR | `prettier --check .` → `eslint . --max-warnings 0` → `tsc --build` → syncpack lint → dep-cruiser → tests. CI re-checks everything the hooks checked, because hooks are a courtesy and CI is the contract — `--no-verify` exists, and agents don't always run hooks. |
| **Weekly** | scheduled CI | knip (dead code), `pnpm audit`, syncpack against the registry |

Ordering note: format check runs *first* and fails fast — never make a human (or an agent, or CI minutes) wait through a test suite to learn about a missing semicolon.

---

## 7. Honorable Mention: Biome (and why not, for now)

**Biome** is the one-binary Rust replacement for ESLint+Prettier — 10–30× faster, one config, increasingly popular in 2025/26. The honest assessment for Vyaya: not yet. The deciding gaps are *type-aware* linting depth (no `no-floating-promises`-class analysis at typescript-eslint's level — and that rule specifically guards this codebase's transaction discipline) and the plugin ecosystem this setup leans on (`tanstack/query`, `jsx-a11y` completeness, `dependency-cruiser` interplay). At Vyaya's file count, ESLint speed is a non-issue. **Revisit-when** (this is ADR material): Biome's type inference covers floating promises + the Query plugin's checks, or lint time exceeds ~30s. Switching later is cheap precisely because rules were never scattered — one root config is one migration surface.

---

## 8. Bootstrap Checklist (Phase 0, in order)

1. Root: `.nvmrc`, `packageManager` pin, `.npmrc` (`engine-strict`, `save-exact`), `.editorconfig`
2. `pnpm-workspace.yaml` with catalog section seeded (typescript, zod, vitest…)
3. `packages/config`: the four tsconfigs; apps/packages extend them; project references wired; `pnpm typecheck` = `tsc --build`
4. Root ESLint deps (`-w`) + `eslint.config.mjs` with L0–L∞ layers; `pnpm lint` green on the empty scaffold
5. Root `prettier.config.mjs` + ignore; `pnpm format:check` green
6. husky + lint-staged + commitlint + gitleaks
7. `.vscode/` committed (settings + recommended extensions)
8. syncpack + `.syncpackrc` (exact versions, catalog-aware); wire into CI
9. CI pipeline in the §6 order — **Gate 0 now includes: all uniformity checks green on the scaffold**

---

**The one-line summary:** Prettier at the root because style has no environments; ESLint at the root as one layered config (base culture + api/web/test layers, `projectService` bridging the tsconfigs); TS strictness defined once and extended everywhere; versions unified by catalogs and audited by syncpack; enforced editor → hook → CI so uniformity never depends on anyone remembering anything. One repo, one culture — the linter is just the culture written down.

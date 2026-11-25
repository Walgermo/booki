# Releasing Booki

Versions and release notes come from [Changesets](https://github.com/changesets/changesets).
Each pull request that changes a package carries a changeset: a small file in
`.changeset/` that says which packages it bumps, how far, and the line it adds
to their CHANGELOG. A release gathers them.

## Versions

Booki follows [semantic versioning](https://semver.org). Before 1.0 the
public API still moves, so the steps shift down by one:

| The change | Before 1.0 | From 1.0 |
| --- | --- | --- |
| Breaks someone's code: an action, option, part, `data-slot` or export removed or renamed, a rule that now refuses what it allowed | **minor** (0.1 → 0.2) | major |
| Adds something: a control, an action, an option, a profile | **patch** (0.1.0 → 0.1.1) | minor |
| Fixes a bug, a message, a style | **patch** | patch |

The UI packages are released together at one version: `@booki-aui/core`,
`primitives`, `react`, `styles`, `web`, `vue`, `svelte` and `solid` (a
`fixed` group in `.changeset/config.json`). They are generated from the same
definitions, so a fix in one is a release of all, and an app never mixes
versions. `@booki-aui/readiness` is a separate tool with its own version. The docs
site, the examples and the benchmark are private and never released.

## In a pull request

```bash
pnpm changeset
```

Pick the packages, the bump, and write the line for the release notes. Write
it for the person upgrading: what they can now do, or what they must change.

> Add `VoucherComposer.setLines` refusing unknown line fields. If your agent
> sent extra fields, drop them.

A change to a package that needs no release (a test, a comment) gets an empty
changeset, so CI knows it was a decision:

```bash
pnpm changeset --empty
```

CI fails a pull request that changes a package without a changeset.

## Cutting a release

1. Merge pull requests with their changesets into `main`.
2. The **Release** workflow opens or updates a pull request called
   **Version Packages**. It runs `pnpm version-packages`: bumps the versions,
   writes each package's `CHANGELOG.md`, regenerates the framework packages
   and formats. Read it: those are the release notes.
3. Merge **Version Packages**. With publishing on, the workflow builds,
   publishes to npm with provenance, tags each package
   (`@booki-aui/core@0.2.0`) and creates a GitHub Release with the notes.

`pnpm release:plan` shows what would be published, without publishing.

## Publishing to npm

The packages are published to npm as `@booki-aui/*`. (The `@booki` scope on npm
belongs to someone else, so the npm names carry `-aui`, for "agent UI"; the
project, the repository and the docs are still Booki.) Publishing is on when
both of these are set, and off otherwise: the workflow then keeps the
**Version Packages** pull request and the changelogs current and publishes
nothing.

1. Create the `booki-aui` organization on npmjs.com, and a granular access
   token with read and write access to it. Add the token as the `NPM_TOKEN`
   repository secret (Settings → Secrets and variables → Actions → Secrets).
2. Set the repository variable `NPM_PUBLISH` to `true`
   (Settings → Secrets and variables → Actions → Variables).
3. Allow the workflow to open pull requests: Settings → Actions → General →
   "Allow GitHub Actions to create and approve pull requests".

Merging **Version Packages** then runs `pnpm release`: it builds the packages
and runs `changeset publish`, which publishes every version npm does not have
yet, with provenance (the workflow has `id-token: write`), tags each package
and creates the GitHub Release. Check it first with:

```bash
pnpm release:plan
```

and a package's contents with `pnpm publish --dry-run --no-git-checks` in its
folder; `workspace:*` dependencies become the released version.

## Prereleases

For a release candidate on the `next` tag:

```bash
pnpm changeset pre enter next
```

Versions then come out as `0.2.0-next.0`, `-next.1`, and publish to the `next`
dist-tag. Leave with `pnpm changeset pre exit` before the final release.

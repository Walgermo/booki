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
   publishes each package on npm with provenance, tags it
   (`@booki-aui/core@0.2.0`) and creates a GitHub Release with the notes.
   If the `npm` environment has a required reviewer, it waits for that one
   approval in GitHub first (Actions → the Release run → Review deployments).

`pnpm release:plan` shows what would be published, without publishing.

## Publishing to npm

The packages are published to npm as `@booki-aui/*`. (The `@booki` scope on npm
belongs to someone else, so the npm names carry `-aui`, for "agent UI"; the
project, the repository and the docs are still Booki.)

Merging **Version Packages** releases. The Release workflow has three jobs:

- `version` keeps the **Version Packages** pull request current.
- `plan` runs when no changesets are left and publishing is on, and checks
  whether any package version is not on npm yet (`node scripts/publish.mjs --check`).
  A merge that releases nothing (docs, a test) stops here.
- `publish` runs `pnpm release`: it builds the packages and runs
  `scripts/publish.mjs`, which publishes every version npm does not have yet,
  with provenance, and then tags it and creates the GitHub Release.

`publish` runs in the GitHub environment `npm`. Whether a release waits for a
person is decided there, not on npm:

- **With a required reviewer** (Settings → Environments → npm → Required
  reviewers): the job waits for one approval in GitHub, for the whole release.
- **Without one**: merging **Version Packages** publishes straight away. The
  merge is then the person's decision.

The workflow signs in to npm through trusted publishing (OIDC): there is no
npm token in the repository. Each package on npm trusts `Walgermo/booki` →
`release.yml`, environment `npm` (Settings → Trusted Publisher). Renaming the
workflow file or the environment breaks that trust. Every version carries
provenance: npm shows which commit and workflow run built it.

Publishing is on when the repository variable `NPM_PUBLISH` is `true`
(Settings → Secrets and variables → Actions → Variables), and off otherwise:
the workflow then keeps **Version Packages** and the changelogs current and
publishes nothing. The workflow also needs Settings → Actions → General →
"Allow GitHub Actions to create and approve pull requests".

**Until v1: direct publishing.** Releases are published straight from the
workflow, with no person approving them on npm, until Booki reaches a stable v1.
An app with pnpm's `trustPolicy: no-downgrade` may refuse them and need an
exclude (the skill's install section says how to ask). At v1, go back to staged
publishing (below), so every release carries a person's approval.

**Staged publishing instead.** Set the repository variable `NPM_PUBLISH_MODE`
to `stage` and the workflow stages the versions (`npm stage publish`) instead
of publishing them. Someone with publish rights then approves each one on
npmjs.com → Staged Packages (with 2FA), or with `npm stage approve <id>`. Use
this while a package's trusted publisher still allows only staging.

A new package has no page on npm yet, so it cannot trust the workflow: publish
its first version by hand (`pnpm pack`, then `npm publish <tarball>` from an
account in the `booki-aui` organization), then add the trusted publisher on
its Settings page.

Check what a release would contain with:

```bash
pnpm release:plan
```

and a package's contents with `pnpm pack` in its folder: `workspace:*`
dependencies become the released version.

## Prereleases

For a release candidate on the `next` tag:

```bash
pnpm changeset pre enter next
```

Versions then come out as `0.2.0-next.0`, `-next.1`, and publish to the `next`
dist-tag. Leave with `pnpm changeset pre exit` before the final release.

## Releases that queue

Each Release run waits its turn instead of replacing the one before it, so two
Version Packages merges in a row publish and tag both versions, oldest first.
Should an older version still reach npm after a newer one, it goes to the
`previous` dist-tag and `latest` stays on the newer version; its GitHub Release
is created without the Latest mark. An older release candidate goes to
`previous-next` in the same way, so `next` never moves back.
`scripts/release-plan.mjs` makes the decision and `pnpm test:scripts` covers it.

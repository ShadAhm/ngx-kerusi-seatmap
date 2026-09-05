## What changed

<!-- What this does, and why. If it fixes an issue, link it. -->

## Which package

<!-- Tick every one this touches. -->

- [ ] `@kerusiweb/core`
- [ ] `@kerusiweb/angular`
- [ ] `@kerusiweb/react`
- [ ] Docs / tooling only

## Checks

- [ ] `npm run test:ci` passes
- [ ] Behaviour that a second binding would otherwise have to reimplement lives
      in core, per [docs/architecture.md](../docs/architecture.md) — or this PR
      says why not
- [ ] A rendering change is covered by both bindings' specs, which assert
      byte-identical SVG for the same documents
- [ ] `CHANGELOG.md` has an entry under `## [Unreleased]`, if a consumer would
      notice this

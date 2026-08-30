# Conformance corpus

`corpus/` is a verbatim copy of the example documents published with the Kerusi
standard, vendored so this library's verdict on each can be asserted in the test
suite rather than described in prose.

|          |                                                 |
| -------- | ----------------------------------------------- |
| Source   | https://github.com/ShadAhm/kerusi — `examples/` |
| Spec     | v1.0.0-draft, rev 13                            |
| Commit   | `1d9c496`                                       |
| Vendored | 2026-08-29                                      |

To refresh after a spec revision: copy `examples/` over `corpus/`, run
`npm run test:core`, and reconcile `corpus.spec.ts` — every file has an explicit
expectation there, so a new or changed fixture shows up as a failure rather than
passing silently.

## The three directories, and what this library owes each

- **`corpus/`** — conformant documents. Nothing here may be rejected.
- **`corpus/validator-only/`** — documents that satisfy the published JSON
  Schemas and violate a §7 semantic rule. These are precisely the rules §7
  requires of a validator, so each is asserted by rule id.
- **`corpus/invalid/`** — documents that fail the schemas. Most also fail here,
  but not all, and the difference is deliberate rather than a gap:

  - The published schemas are a **producer-side** gate and set
    `additionalProperties: false`. §2 and §7 tell a **consumer** to ignore
    members it does not recognize, so `map-unknown-toplevel-field` MUST be
    accepted by this library. Rejecting it would be the non-conformance.
  - Some fixtures fail only a JSON Schema shape constraint — a currency's
    letter case, a price's integrality, an `aspectRatio` pattern, a status
    enum. This library validates the §7 semantic rules and the structure it
    needs to render; it does not reimplement the schemas, and
    `docs/kerusi-conformance.md` records that it publishes none. Vendor the
    schemas from the spec repo alongside it when a producer-side gate is what
    you need.

  `corpus.spec.ts` says which of the two applies for every file it accepts.

# ADR-0009: This repository is a fresh rebuild, not a continuation of the live demo's codebase

## Status
Accepted (project decision, confirmed 2026-09-25)

## Context
`Just Reference - Live Testing and Production Plan.docx` documents a live, working demo at `just-reference.onrender.com`, apparently built and deployed by the same team producing this brief, implementing most Phase 1 modules with simulated payments/SMS/WhatsApp/email. This working directory, however, contains no source code — only requirement documents, the client's original handwritten notes, and the logo. Before writing any architecture document, it was necessary to clarify whether Phase 0 should formalize that existing (unseen) codebase's actual architecture, or design a target architecture independently.

## Decision
This repository is a **fresh implementation**. The live demo is treated as a **behavioral reference** — what the platform should do, and (via the Live Testing doc's demo-account walkthroughs and Q-01–Q-48 list) what's already known to work or to be ambiguous — but its actual source code, framework choices, or internal structure are not inherited or assumed. All architecture in this `/docs` set ([architecture.md](../architecture.md) onward) is designed against the requirement documents and this project's own conventions (see [ADR-0001](0001-orm-choice.md) through [ADR-0008](0008-explicit-state-machines.md)), not reverse-engineered from the demo.

Two direct consequences of treating the demo as behavioral-only rather than authoritative-for-code:
- The hosting topology conflict is resolved independently of the demo's actual Render deployment (see [ADR-0004](0004-hosting-topology.md)) — we build to the *specified* architecture, not to how the demo happens to be hosted.
- The demo's simplified invoice handling (printable HTML rather than server-generated PDF) is treated as something to explicitly confirm rather than carry forward silently (see [ADR-0007](0007-pdf-generation.md)).

## Consequences
- No migration/import work from an existing codebase is required to start Phase 1.
- Feature parity with the live demo is a **useful check**, not a **contract** — this build should do everything the demo does (per the Live Testing doc's module list) unless a requirement document says otherwise, but is free to structure the implementation differently.
- If, during Phase 1, it turns out reusing part of the demo's actual code would meaningfully save time (e.g., a well-tested commission-calculation routine), that is a case-by-case decision made explicitly, not an assumption baked into this architecture.

## Alternatives considered
- **Locate and continue the live demo's actual codebase** — the other option offered to the client; not chosen for this engagement. If circumstances change, this ADR should be superseded, not silently ignored, since a large part of [architecture.md](../architecture.md) (folder structure, module boundaries, ORM choice) is written under the fresh-rebuild assumption.

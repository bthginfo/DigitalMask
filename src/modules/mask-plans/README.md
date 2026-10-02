# Production makeup plans

Each named plan is one `maskPlans` record linked to a production. Its lanes contain active staff IDs and individually entered free names. Blocks contain a lane ID, negative start offset, positive duration, cast actor IDs/free names, activity and notes. Zero is the fixed curtain-time boundary.

- `schema.ts` validates bounded payloads, unique local IDs, existing lane references and end-at-or-before-zero rules.
- `model.ts` resolves names, computes relative windows and optional clock times, warns about overlapping staff/actors, and clones local identities for copied plans or productions.
- `layout.ts` places parallel appointments and splits printable staff/time ranges.
- `service.ts` validates all linked actors and casting in one batched query. The shared record service batches active department staff validation and retains production access checks.
- `components/` edits a local versioned draft. Saving is one record mutation; view changes and clock previews have no server calls. Live changes preserve dirty drafts and stale modal snapshots; conflict recovery can reload or create a separate plan.
- `export.ts` and `pdf.tsx` generate printable timetables and complete data exports from authorized in-memory references.

Shared records, history, cache invalidation and event-driven workspace updates need no separate infrastructure. Generic actor deletion checks nested references. Production copying remaps lane/block IDs while preserving global actor links.

Focused checks: `tests/mask-plans.test.ts`, `tests/mask-plan-exports.test.ts` and `tests/e2e/mask-plans-ui.spec.ts`. Browser fixtures intercept API traffic and create no production data.

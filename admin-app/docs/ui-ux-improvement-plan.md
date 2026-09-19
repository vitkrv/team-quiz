# Admin app: UI/UX fixes and guarded feature proposals

Reviewed: 2026-09-19. Scope: the standalone `admin-app` and the shared authorization/data contracts it relies on.

This is a source-based review, not an authenticated browser usability test or a check of deployed Firebase rules. No application behavior, data, rules, or deployments were changed. Priorities reflect expected impact, not measured usage. Each proposal has a permanent unique number; retain these numbers when splitting work into tickets.

The current app reads Games, Question Packs, and Users in full on refresh. It supports sorting, column visibility/order, English/Ukrainian labels, and a raw document drawer. Its only writes are the signed-in admin's column preferences. Preserve that low-risk default while improving everyday investigation workflows.

## Evidence map

- [Admin implementation](../src/main.tsx): `App`, `loadCollection`, `saveColumnPrefs`, `getColumns`, date/sort helpers, `FieldValue`, and `Gate`.
- [Admin styles](../src/styles.css): table sizing, navigation, drawer, responsive layout.
- [HTML entry](../index.html): document language.
- [Admin guide](../README.md): current capabilities, environment configuration, and illustrative rules.
- [Actual shared rules](../../firestore.rules): user profile updates, admin reads, host-only history, room/snapshot restrictions.
- [Room actions](../../src/actions/roomActions.js), [game actions](../../src/actions/gameActions.js), [storage helpers](../../src/actions/gameStorage.js), and [recap finalization](../../src/actions/gameRecap.js): lifecycle contracts for future operations.
- [Product baseline](../../docs/app-overview.md), [gameplay reference](../../docs/gameplay-reference.md), and [storage validation](../../docs/game-storage-validation.md): behavior to preserve and verification workflow.

P0 = security/release blocker; P1 = highest-value reliability or workflow improvement; P2 = next-stage enhancement. Effort: S = localized; M = multiple components/data queries; L = backend, rules, or cross-app coordination. These are relative estimates, not delivery commitments.

## Fixes and improvements

### ADM-001 — Close profile-based privilege escalation

**P0 · Fix · M**

**Evidence/problem:** In `firestore.rules`, the ordinary self-profile update branch checks `diff(...).changedKeys().hasOnly(['language', 'updatedAt'])`. Added and removed keys are not covered by that check. A Google-authenticated user with a valid resulting `language` can appear to satisfy this branch while adding `admin: true`; `isAdmin` then trusts that field. The admin UI's sign-in gate cannot protect this boundary.

**Change and safeguards:** Restrict all affected keys, including additions/removals, and explicitly preserve privileged fields in ordinary profile updates. Keep permission provisioning outside the self-service profile path. Review every alternative allow branch; an additional restrictive rule does not override an existing permissive branch. Align the admin README with the actual shared rules without replacing gameplay rules with its illustrative snippet.

**Acceptance:** In the isolated Emulator, a non-admin cannot add/change/remove `admin` or future role fields, even while changing language; legitimate language updates and existing-admin column preference writes still succeed. Verify missing-profile creation as well. This source finding is not proof of exploitation or of the deployed rules' contents.

### ADM-002 — Prevent late requests from showing the wrong collection or account

**P1 · Fix · M**

**Evidence/problem:** `loadCollection` writes to shared `records`, `error`, and `loading` state without a request identity. Switching Games → Users during a slow request can allow the Games response to populate the Users table. The asynchronous admin-profile lookup is similarly unguarded across auth changes.

**Change and safeguards:** Scope requests to project, namespace, account, collection, and request generation. Ignore superseded completions, including their error/finally updates. Clear protected state immediately on account change/sign-out, and prevent a late permission lookup from restoring it.

**Acceptance:** Resolve tab requests in reverse order; the active collection remains correct. Sign out or switch accounts during either lookup; old records and access state never reappear.

### ADM-003 — Make record lookup the primary workflow

**P1 · Improvement · M**

**Evidence/problem:** The toolbar has Refresh and Columns but no search or filters. Finding one room, pack, or user requires scanning raw rows.

**Change:** Add exact lookup for stable game ID, invitation code, pack ID, and user UID, plus collection-specific filters for room status, host/owner, pack visibility, and dates. Show active filter chips and Clear filters. Distinguish the reusable invitation code from the stable game ID. Offer name/title search only with a defined query/index strategy.

**Safeguards:** Validate identifiers and namespace scope. Exact code lookup must resolve the current reservation, with explicit legacy handling; do not infer that a reused code identifies an older result. Label page-local search as such. Avoid arbitrary full-database scans or pretending Firestore provides substring search.

**Acceptance:** An admin can find a known record directly, distinguish no match from load failure, and see whether search covers all matching records or only loaded rows.

### ADM-004 — Bound reads and render work with pagination

**P1 · Improvement · L**

**Evidence/problem:** `getDocs(collection(...))` downloads the whole collection; every row is rendered and all sorting is local. Cost and responsiveness deteriorate as data grows.

**Change:** Start with bounded pages (for example 50), stable cursor ordering with a document-ID tie-breaker, and supported server filters/sorts. Keep page position during detail inspection. Show “50 loaded” rather than implying that a page is the total. Use virtualization only if larger loaded windows justify it.

**Safeguards:** Define index requirements and treatment of legacy documents missing timestamp fields before enabling date ordering; do not silently exclude them. Cap page size and automatic fetches. Unsupported sorting must be clearly marked page-local or disabled.

**Acceptance:** Large and legacy fixtures remain discoverable; tied timestamps do not duplicate/skip records in a stable dataset; each navigation reads a bounded page. Document how concurrent updates affect cursor results.

### ADM-005 — Replace schema-driven default columns with useful summaries

**P1 · Improvement · M**

**Evidence/problem:** `getColumns` discovers raw keys from returned data. Default columns can be numerous, unstable, and dominated by implementation fields; nested player/category data is not summarized.

**Change:** Provide curated defaults: Games = stable ID, code, pack, host, status, contestant count, relevant dates; Packs = name, owner, visibility, category/question counts, updated date; Users = UID, available profile details, role, updated date. Retain raw fields in an advanced view. Exclude the host from contestant counts and normalize legacy/new room shapes.

**Safeguards:** Display unavailable fields honestly; user documents are not a complete Firebase Auth directory. Keep privileged/sensitive fields out of default broad tables. Do not change stored data to make it match a view.

**Acceptance:** A new admin can identify a room's state and pack without opening JSON; sparse/legacy records retain identity and meaningful fallback labels.

### ADM-006 — Make wide tables readable and selections obvious

**P1 · Improvement · M**

**Evidence/problem:** The table uses `table-layout: fixed`, full width, and single-line ellipsis for all cells, without per-column widths. Many discovered columns compress the useful content. Row selection has no persistent selected styling.

**Change:** Set sensible column minimum widths, deliberate horizontal scrolling, a pinned identity column, optional resizing/density, and visible selected-row state. Offer accessible full-value inspection/copy for truncated identifiers. Keep the header visible within a deliberately bounded scroll region.

**Safeguards:** Copy controls must not also activate the row; preserve original IDs and values rather than copying display truncation.

**Acceptance:** At laptop widths, identifiers and status remain usable with a realistic wide dataset; selected rows stay recognizable while inspecting details.

### ADM-007 — Restore full keyboard and assistive-technology access

**P1 · Fix · M**

**Evidence/problem:** Rows open only through `<tr onClick>`. Sort state lacks `aria-sort`; column arrows lack descriptive accessible names. The drawer has no focus lifecycle or Escape handling, and status/error updates are not announced.

**Change:** Add explicit focusable “View details” controls, visible focus indicators, active navigation semantics, labeled movement controls, announced loading/error/save states, and sort semantics. Choose an explicit drawer model: a labeled non-modal region on roomy screens or a modal dialog with focus containment on narrow screens. Restore focus to the invoking control on close.

**Safeguards:** Escape closes inspection, never confirms a mutation. Use standard buttons and avoid nesting movement buttons inside a checkbox label. Do not trap focus in a non-modal layout.

**Acceptance:** Complete sign-in navigation, sorting, column adjustment, opening/closing details, and retry using only a keyboard; check labels and announcements with a screen reader.

### ADM-008 — Show data freshness and preserve context on refresh

**P1 · Fix · M**

**Evidence/problem:** There is no last-loaded time. A refresh failure clears records; successful refresh replaces rows but leaves `selected` pointing to its older object. The drawer can therefore contradict the table.

**Change:** Show last successful refresh, loading/refreshing state, and whether data came from cache. Preserve last-known rows on transient failure with a prominent stale marker. Reconcile the selected record by ID after refresh; explicitly show deletion or loss of access.

**Safeguards:** Never present stale/offline values as authoritative for future writes. Clear protected records on authorization loss rather than retaining a stale view. Future operations must re-read authoritative state before execution.

**Acceptance:** Failed refresh retains useful context with a warning; changed/deleted selected records are reconciled; permission denial clears protected content.

### ADM-009 — Separate authentication failures from denied access

**P1 · Fix · S**

**Evidence/problem:** Popup sign-in/sign-out promises have no UI error handling. Any admin-document read failure becomes “not marked as an admin,” including network failures. The login button has no pending state.

**Change:** Distinguish cancelled popup, blocked popup, network failure, configuration problem, and actual access denial. Add pending state, retry, and clear account-switch/sign-out recovery. Keep technical diagnostics expandable and sanitized.

**Safeguards:** Default to no access when verification fails; do not suggest bypassing rules or self-assigning admin rights. Avoid exposing tokens or private configuration in diagnostics.

**Acceptance:** Each failure has an accurate message and recovery path; repeated sign-in clicks do not spawn overlapping attempts.

### ADM-010 — Make view preferences recoverable and trustworthy

**P1 · Fix/improvement · M**

**Evidence/problem:** Every column move/toggle immediately calls `updateDoc`; optimistic state is not rolled back on failure. All columns can be hidden. There is no Reset or save status, and boundary movement buttons appear enabled even when no move is possible.

**Change:** Use an explicit Apply/Cancel draft or a serialized, debounced save with saved/saving/failed status and retry. Add Reset to defaults, searchable columns, disabled boundary arrows, and at least one mandatory identity column. Preserve independent preferences per collection.

**Safeguards:** Save only the signed-in admin's allowlisted preference keys. A failed older save must not roll back a newer successful state. Keep preferences bounded and validate stored shape; avoid arbitrary path editing.

**Acceptance:** Rapid moves, save rejection, reload, empty selection, and two-tab editing have defined outcomes; admins can always restore a usable table.

### ADM-011 — Turn raw details into an investigation workspace

**P1 · Improvement · M**

**Evidence/problem:** The drawer renders every field as text/JSON. Understanding a room requires interpreting nested data and manually correlating IDs.

**Change:** Add Summary, Related records, and Raw data sections. Link room → host/source pack/frozen pack/recap and pack → owner where authorized. Explain missing snapshots for finished rooms. Show structured player standings and pack/category summaries; retain copyable raw data as an advanced tool. Lazily render large nested fields instead of syntax-highlighting every hidden value.

**Safeguards:** Keep inspection read-only. Treat missing and forbidden records differently. Do not fetch host-only history merely because the viewer is an admin. Keep answers collapsed and do not autoplay/load external media until requested; safely validate external links.

**Acceptance:** Follow a room to related records and back without losing table position; finished and legacy rooms remain understandable; unauthorized relationships do not leak contents.

### ADM-012 — Make dates, booleans, and sorting consistent

**P2 · Fix · S**

**Evidence/problem:** Display and sort use different conversions. Timestamp-named strings/numbers may display as dates but sort as raw values; default `toMillis` does not normalize numeric seconds like `toTableDate`. Dates have no timezone label, booleans are emoji-only, and any object with `seconds` is treated as a date.

**Change:** Use a shared schema-aware normalization for display and sorting; validate dates and timestamp objects. Show localized absolute time with timezone and optional relative time. Preserve existing boolean emojis with accessible Yes/No text. Distinguish missing, null, false, and empty string.

**Safeguards:** Do not silently coerce arbitrary domain objects into dates or write normalized display values back to Firestore.

**Acceptance:** Mixed Timestamp/ISO/seconds/milliseconds fixtures sort chronologically where the schema permits them; invalid values remain inspectable and explicitly unknown.

### ADM-013 — Expose environment and namespace at a glance

**P1 · Improvement · S**

**Evidence/problem:** The toolbar shows a Firestore path but not the Firebase project or an explicit environment/read-only badge. The admin namespace fallback is `team-quiz`; the main app documents other defaults/examples, so configuration can point the two apps at different datasets.

**Change:** Show project ID, namespace, signed-in identity, and “Read-only data access” persistently. Add a config diagnostic explaining exactly which dataset is queried. Require an explicit namespace for production builds instead of relying on a silent fallback.

**Safeguards:** Environment labels must derive from trusted configuration, not an editable cosmetic switch. Show the target again in every future action preview; do not permit an unnoticed target change during confirmation.

**Acceptance:** An admin can identify the exact target before investigating an empty dataset or authorizing any future action; mismatched configuration has a clear diagnostic.

### ADM-014 — Preserve navigation, language, and small-screen usability

**P2 · Improvement · M**

**Evidence/problem:** Active collection, selection, sorting, and language are component-local and reset on reload. Language changes alter `t.loadFailed`, recreating `loadCollection` and triggering another collection read. HTML remains `lang="en"`. Mobile stacks the entire sidebar ahead of the table and the drawer covers the viewport.

**Change:** Add validated deep links and Back/Forward for collection/record; preserve non-sensitive view preferences and language. Decouple error translation from fetching, update document language, use compact mobile navigation, and make the narrow-screen drawer deliberately modal. Prefer friendly translated field labels with raw keys available in advanced mode.

**Safeguards:** Do not store raw records or private search strings in URLs/local storage. Validate route parameters and reauthorize every deep link. Preserve authentication redirects without disclosing record contents.

**Acceptance:** Reload/back restores useful context; switching language does not refetch unchanged data; keyboard/touch inspection works at 320px and laptop widths.

## New features with guardrails

### ADM-015 — Operational overview with actionable drill-downs

**P2 · New read-only feature · M**

**Value:** Replace a raw table landing page with active/lobby/finished counts, recently changed packs, and investigation links. This answers “What needs attention?” immediately.

**Guardrails:** Use bounded queries or maintained aggregates, show measurement time/scope, and distinguish unknown from zero. Do not compute global totals from one loaded page or silently scan all records. Define “potentially abandoned” as a heuristic, never automatic permission to terminate a game.

**Acceptance:** Every metric explains its scope and links to matching filters; an unavailable aggregate is visibly unavailable, not an empty-state success.

### ADM-016 — Saved investigation views

**P2 · New read-only feature · M**

**Value:** Save combinations such as “Playing games,” “Private packs by owner,” or “Legacy rooms,” including columns, filters, and sort. Current preferences store only column visibility/order.

**Guardrails:** Keep views personal by default; sharing a view shares query configuration, never grants data access. Validate allowed fields/operators, cap view count, and omit sensitive literal values from shareable URLs. Resetting a view must never modify records.

**Acceptance:** Reopening a view reproduces its configuration and scope; another user without permission cannot use the link to access protected data.

### ADM-017 — Data-health inspector with evidence and dry runs

**P1 · New read-only feature · L**

**Value:** Report missing active-room snapshots, reservation mismatches, malformed pack metadata, and suspiciously stale rooms. Include source records, why the check flagged them, and a suggested next step.

**Guardrails:** Checks must understand legacy rooms and that explicit finish intentionally deletes the frozen pack. Use bounded, cancellable scans with a visible read budget. Reports do not auto-repair or auto-delete. A finding is a hypothesis until related state is rechecked.

**Acceptance:** Known healthy, finished, legacy, and deliberately broken fixtures produce expected results; incomplete scans are never labeled “all healthy.”

### ADM-018 — Redacted support export

**P2 · New read-only feature · M**

**Value:** Export selected rows or an individual diagnostic bundle without hand-copying JSON. Include target environment, stable IDs, capture time, and scope.

**Guardrails:** Preview fields/count and default to an allowlist excluding private answers, personal details, and embedded legacy history. Require explicit capability for sensitive fields; cap export size; audit sensitive exports. Escape spreadsheet-formula prefixes in CSV and serialize JSON safely. Do not automatically send exports anywhere. Read-only exports can still expose sensitive data.

**Acceptance:** Preview exactly matches exported fields and rows; formula-like strings stay inert; forbidden fields never enter the bundle; cancellation stops further reads.

### ADM-019 — Internal investigation notes and handoff

**P2 · New limited-write feature · M**

**Value:** Attach admin-only notes, issue status, and an assignee to a room/pack/user so repeated investigations have continuity.

**Guardrails:** Store notes in a separate protected administrative collection, not shared room or user payloads. Validate content/size, record author/time, preserve edit history, and provide conflict handling. Notes must never influence scoring, ownership, moderation status, or authorization. Do not send notifications without a separately designed opt-in workflow.

**Acceptance:** Players and ordinary users cannot read/write notes, concurrent edits are resolved explicitly, and deleting/archiving a note does not affect the referenced record.

### ADM-020 — Action permissions and administrative audit trail

**P1 · Foundation for write features · L**

**Value:** Introduce explicit capabilities such as viewer, support operator, content moderator, and security administrator. Give admins a searchable record of operational changes, separate from gameplay history.

**Guardrails:** Build only after ADM-001. Enforce capabilities in rules or a trusted backend on every request; hidden buttons are not authorization. Use allowlisted action endpoints, validated targets, recent authentication for high-risk actions, rate limits, idempotency keys, and version preconditions. Record actor, target/project/namespace, reason, request ID, before/after summary, approval, and outcome in a server-controlled append-only audit store. Avoid logging secrets/full answer content. Couple the operation with durable audit creation; do not claim success if the mutation status is uncertain.

**Acceptance:** Forged requests, revoked roles, cross-namespace targets, stale previews, and repeated submissions fail safely or return the same result. UI reports completed, failed, pending, or unknown accurately. Verify rules with the Emulator and backend paths with dedicated integration checks before enabling production actions.

### ADM-021 — Reversible pack quarantine

**P2 · New guarded action · L · Depends on ADM-020**

**Value:** Let an authorized moderator temporarily remove an unsuitable pack from discovery/new hosting, with a reason and review date, instead of deleting it.

**Guardrails:** Define moderation state separately from owner-selected public/private visibility. Enforce quarantine in discovery and room-start authorization, including existing lobbies. Preserve source content, ownership, active frozen snapshots, media, scores, and results. Preview impact; recheck version; audit quarantine and restore. Restrict unquarantine to an appropriate role and do not automatically republish formerly private content.

**Acceptance:** A quarantined pack cannot start a new game through UI or a direct request; active games continue on their frozen content; restore returns the intended visibility without losing content.

### ADM-022 — Controlled recovery for stuck games

**P2 · New guarded action · L · Depends on ADM-017 and ADM-020**

**Value:** Offer a diagnostic-first recovery flow for a game that cannot progress, with narrowly defined operations rather than a generic document editor.

**Guardrails:** Start with read-only diagnosis and host-directed recovery. Emergency finish must show participants, status, pending scoring/RPS, and irreversible effects; require a reason, recent authentication, stable-ID confirmation, and a second approver for active games. Re-read state transactionally. Preserve the normal finish contract: final recap/profile awards/history consistency and snapshot deletion where applicable, with explicit legacy handling. Do not merely set `status: 'finished'`. Host-only history remains private unless a separately approved backend access policy is introduced.

**Acceptance:** Concurrent host progress invalidates a stale action preview; retry does not duplicate awards/events; failure cannot leave a partially finished game. UI explains that finishing is not an undoable pause. Host migration or score rewriting requires separate product design.

### ADM-023 — Administrative access management without lockout

**P2 · New guarded action · L · Depends on ADM-001 and ADM-020**

**Value:** Replace manual profile editing with a controlled grant/revoke workflow showing exact UID, verified account identity where available, capabilities, and rationale.

**Guardrails:** Provision through a trusted backend; never broaden ordinary profile writes. Require recent authentication and a different approver for privilege grants or high-impact changes. Block removal of the last security administrator transactionally and reject self-approval. Maintain a documented out-of-band recovery procedure. Recheck revoked access on privileged requests and clear stale admin UI state; removing admin rights should not disable an ordinary player account.

**Acceptance:** Simultaneous revocations cannot remove the final administrator; forged self-grants fail; revoked users cannot continue privileged actions using an already-open tab. Distinguish Firestore profile metadata from Firebase Auth account administration.

### ADM-024 — Retention and cleanup workbench

**P2 · New guarded action · L · Depends on ADM-017 and ADM-020**

**Value:** Make storage cleanup reviewable through candidate discovery, estimated impact, dependency inspection, and job progress. Abandoned-game cleanup and external media retention are currently documented gaps.

**Guardrails:** Begin report-only. Require a defined retention policy, grace period, exclusions, second approval, and a bounded target manifest. Revalidate each target at execution time; reject active games, legal/operational holds, changed references, and unknown dependencies. Preserve result links, achievements, code reservations, and frozen-pack references according to an explicit lifecycle design. Do not assume Firestore parent deletion removes subcollections. External media deletion needs reference checks across source/frozen content and Worker/backend ownership authorization. Require a verified restore procedure before any irreversible purge; a database backup alone does not restore external media.

**Acceptance:** Dry run names every target and dependent effect; changed candidates are skipped; partial failures have per-target outcomes and safe retries. The operator can cancel unstarted work, while the UI clearly identifies already-completed irreversible steps.

### ADM-025 — Bounded bulk operations with a review queue

**P2 · New guarded feature · L · Depends on ADM-020 and each underlying action**

**Value:** Apply a supported operation to multiple explicitly selected records, such as quarantining a reviewed group of packs, without repetitive individual dialogs.

**Guardrails:** Ship only after individual actions are proven. Select visible rows by default; “all matching” must be a separate explicit choice with an exact bounded manifest. Clear selection when target environment changes, and make hidden selections visible on filter changes. Show exclusions, action-specific effects, count, and sample targets. Set batch/concurrency limits, per-record preconditions and audit results, approval requirements, and cancel/resume semantics. Never offer unrestricted bulk JSON edit, score rewrite, privilege assignment, or deletion as a generic tool.

**Acceptance:** Preview and execution use the same target manifest; stale records are skipped; retry only retries eligible failures; mixed success cannot be displayed as full success. No operation expands silently to records added after approval.

## Delivery order and completion gates

- **First:** ADM-001 blocks treating admin access as a reliable boundary. Fix and validate it before expanding sensitive access or operations.
- **Then:** ADM-002–011 and ADM-013 create the largest daily benefit: dependable lookup, bounded loading, readable tables/details, recovery, accessibility, and clear target identity. Design search and pagination together.
- **Next:** ADM-012, ADM-014–018 improve consistency and diagnosis. Prototype with synthetic/Emulator data before exposing additional sensitive fields.
- **Finally:** ADM-019–025 require explicit feature approval, backend/rules design, and action-specific verification. A confirmation dialog alone does not satisfy their guardrails.

Use source accuracy, relative-link checks, and `git diff --check` for this document. For implementation, run the admin TypeScript/build command in its README, appropriate lint checks, responsive/keyboard verification in both languages, and targeted request-race/error scenarios. Rule/storage changes require the isolated Emulator workflow. No deployed access, real-user investigation, or write operation is authorized by this proposal document.

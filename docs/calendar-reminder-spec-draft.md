# Calendar Reminder — Draft Spec

> **STATUS: DRAFT — NEEDS PRODUCT OWNER REVIEW. NOT APPROVED. NOT SCOPED FOR IMPLEMENTATION.**
> This document is a starting point to turn PRD.md §10 backlog item #8 ("Calendar Reminder — Belum digarap") into something buildable. Per PRD §12, this item has not been scoped at all yet — no trigger, audience, or channel decisions have been made. Everything below is a proposal, not a decision. Do not implement against this draft until the open questions in §6 are answered and this status line is updated by the product owner.

Tanggal: 2026-07-11

## 0. Why This Document Exists

PRD.md §10 lists "Calendar Reminder" as backlog item #8 with status "Belum digarap" (not worked on), and §12 explicitly flags it as a risk: *"Calendar Reminder & BigQuery belum discope — kalau jadi kebutuhan mendesak, perlu sesi brainstorming/spec terpisah sebelum implementasi."* This draft is that brainstorming pass — it surveys the existing data model for plausible reminder triggers, proposes recipients/channels consistent with this project's established patterns (Weekly PNL Push, §9 of PRD.md), and lists the open questions that must be resolved before any code is written.

## 1. Candidate Triggers (What Should Fire a Reminder)

Based on the data model in BLUEPRINT.md §4, three trigger families look plausible. None are confirmed — see §6.

### 1a. Rider installment due dates (`rider_installments`)
- Table already has `next_deduction_date` and `active` columns, plus `installments_paid` / `installment_count` to know how many periods remain.
- Candidate trigger: N days before `next_deduction_date`, or on the day a `payroll_run` that should apply the deduction is about to be finalized without it.
- Candidate use case: warn Finance/Ops that a rider has an active installment that needs to land in the upcoming payroll run, so it isn't accidentally skipped.
- Note: `deduction_types.recurring` (added in `20260705190000_deduction_auto_recurring.sql`) already automates *applying* recurring deductions — a reminder here would be a human-facing heads-up, not a replacement for that automation. Overlap between the two needs to be clarified (see §6).

### 1b. Payroll run deadlines (`payroll_runs`)
- Table has `period_start`/`period_end`, `status` (`draft` → presumably `finalized`/`published`), `finalized_at`, `published_at`.
- Candidate trigger: a run whose `period_end` has passed but `status` is still `draft` (i.e., payroll for a closed period hasn't been finalized yet) — or, conversely, a reminder N days *before* `period_end` that the run needs attention.
- Open question: is there an actual fixed payroll calendar (e.g., "always process by the 5th") that this should key off, or does the reminder only make sense relative to `payroll_runs` rows that already exist in the system?

### 1c. Attendance upload deadlines (`upload_batches` / `attendance_logs`)
- `upload_batches` records `kind`, `client_id`, `filename`, `row_count` and (implicitly) `created_at` per import.
- Candidate trigger: no attendance upload recorded for a given client for the current period as some cutoff date approaches, which would block that client's rider fee calculation.
- This is the weakest-grounded candidate of the three — there is no existing "expected upload schedule per client" data anywhere in the schema, so the system currently has no way to know when an upload is "late" versus "just hasn't happened yet this period." This would likely need new schema (a per-client expected cadence) before it's buildable.

## 2. Candidate Recipients (Who Gets It)

- **Admin (Finance/Ops)** — most trigger candidates above (1a, 1b, 1c) are operational/back-office concerns, not rider-facing. This mirrors Weekly PNL Push, which is admin/stakeholder-only.
- **Rider** — plausible only if the intent is to notify a rider directly that their own installment deduction is coming up, or (speculative) a payslip is ready. Riders currently authenticate via PIN in `/rider/*` and have no notification channel wired up at all (no rider email/Slack integration exists in the codebase — `notify/slack.server.ts` and `notify/email.server.ts` are only ever invoked from `pnl-weekly-push.server.ts`, which is admin/stakeholder-facing).
- **Recommendation for draft purposes only:** scope v1 to Admin/Ops recipients, matching the one channel pattern that already exists in this codebase. Rider-facing reminders would be a separate, larger effort (new contact-channel infrastructure for riders) and should not be bundled into this spec without an explicit decision.

## 3. Candidate Channel

Per PRD §9 and BLUEPRINT.md §8, this project has one established distribution pattern for automated notifications: **Slack + Email**, via `src/lib/notify/slack.server.ts` and `src/lib/notify/email.server.ts` (Resend), both already wired into `pnl-weekly-push.server.ts`. WhatsApp is explicitly called out as a deliberate non-goal elsewhere in this project ("WhatsApp sengaja tidak dipakai — keputusan produk untuk membatasi channel demi kesederhanaan maintenance").

Draft recommendation: reuse the same Slack + Email channel and the same `.server.ts` module pattern, rather than introducing a new notification mechanism. If a future need for rider-facing reminders is confirmed, that would require a new channel decision (riders have no Slack/email touchpoint in the current system) — out of scope for this draft.

## 4. Candidate Architecture Shape (illustrative only)

Drawing loosely on the existing `pnl-weekly-push.server.ts` pattern (shared core logic module called from both a cron entry point and a manual "test send" button) — **not a commitment**, just showing that a shape consistent with existing conventions is possible:

```
runCalendarReminderCheck() ◄── cron (pg_cron + pg_net) → POST /api/calendar-reminder
                           ◄── manual trigger (admin session)
        → query candidate trigger tables (rider_installments / payroll_runs / upload_batches)
        → filter to items due within reminder window
        → sendSlackMessage() + sendEmail()
        → (candidate) log to a new reminders_sent / reminder_log table for history + de-dup
```

This is a sketch to make the open questions in §6 concrete, not an approved design. In particular, de-duplication (don't remind about the same due date every single day) and reminder-window configuration are unresolved.

## 5. Explicit Non-Goals (proposed, pending confirmation)

- Not a general-purpose calendaring/scheduling UI — this would be a background check that pushes existing due-date data to Slack/Email, not a new calendar feature in the admin UI.
- Not WhatsApp (matches existing project-wide decision).
- Not rider-facing in v1 (see §2) unless explicitly requested.
- Does not change `deduction_types.recurring` auto-apply behavior — this is additive notification only, not a replacement for existing automation.

## 6. Open Questions (must be answered before implementation starts)

1. **Which trigger(s), if any, are the actual priority?** §1 lists three candidates (installments, payroll run deadlines, attendance upload deadlines) purely because they're the closest fit to existing schema — none have been confirmed as an actual business need. Is this backlog item driven by a specific pain point, or speculative?
2. **Recipients:** Admin only, or does the product owner want rider-facing reminders too? If rider-facing, what channel — riders currently have no Slack/email touchpoint in the system.
3. **Reminder window:** How many days before a due date should a reminder fire? Once, or repeated until resolved?
4. **De-duplication / acknowledgment:** Should there be a way to mark a reminder as "seen"/"handled" so it stops repeating, and does that need a new table (e.g., `reminder_log`)?
5. **Overlap with `deduction_types.recurring` auto-apply:** Is the installment reminder meant to warn about a case the auto-recurring logic will *not* catch (e.g., inactive/paused installment, or a manual step still required), or is it a redundant heads-up for something already automated? Needs clarification before v1a is greenlit as the target trigger.
6. **Attendance upload deadline (§1c) feasibility:** There is no "expected upload cadence per client" data in the current schema. Is this trigger in scope at all for v1, given it would require new schema, not just a new cron job?
7. **Approval/activation flow:** Should this follow the same pattern as Weekly PNL Push — built but left inactive pending manual cron activation and env var setup — or does it need to be live immediately once built?
8. **Priority relative to other backlog items:** PRD §10 lists this alongside BigQuery integration (#9, also "Belum digarap", explicitly low priority) and Pricing Engine v2 (design done, not yet implemented). Where does this actually rank?

## 7. What This Draft Deliberately Does Not Do

- Does not propose a database migration.
- Does not propose specific Slack message copy or email template content.
- Does not commit to a cron schedule.
- Does not touch `dash-payroll-engine` skill docs (held per PRD §10, unrelated to this item).
- Does not modify any pricing calculation, the `report_summary_weekly` view, or BigQuery — all out of scope for this backlog item regardless.

**Next step:** product owner review of §6, then a follow-up revision of this document (or a proper spec) once the trigger/recipient/channel questions have real answers.

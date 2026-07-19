# Prompt: Build OES AI Workforce Framework

Copy everything below the line and paste into Claude Code.

---

## Context

Read these docs first:
- `docs/AI-WORKFORCE.md` — full architecture spec
- `docs/workflows/payroll-workflow.md` — first workflow implementation

This is a TanStack Start (React 19) + Supabase + Tailwind CSS 4 project deployed on Vercel. Study the existing patterns before writing any code:

**Existing patterns to follow:**
- API route pattern: `src/routes/api.payroll-reminder.ts` (TanStack file-based routing, `server.handlers.POST`, secret header auth via `getRequest()`)
- Server-side Supabase: `src/lib/supabase-admin.server.ts` → `getSupabaseAdmin()` (service-role, bypasses RLS)
- Server config: `src/lib/config.server.ts` → `getServerConfig()` (all env reads here)
- AI calls: `src/lib/agents/hermes-client.server.ts` → `callHermes()` (OpenRouter, Hermes model, JSON response)
- Agent hierarchy: `src/lib/agents/{worker,lead,manager,coo}-agent.ts` (Worker→Lead→Manager→COO chain)
- Notification: `src/lib/notify/slack.server.ts` + `src/lib/notify/email.server.ts`
- Payroll engine: `src/lib/payroll-generate.ts` → `generatePayrollDetails()` (this is the Business Engine — never duplicate its logic)
- Pricing calc: `src/lib/pricing-calc.ts`
- P&L engine: `src/lib/pnl-engine.ts`
- COO insight orchestration: `src/lib/coo-insight-engine.server.ts`
- pg_cron pattern: `supabase/migrations/20260712010000_payroll_reminder_cron.sql`

**Existing DB tables** (check `src/integrations/supabase/types.ts`):
attendance_logs, attendance_incentives, attendance_rules, clients, deduction_types, delivery_records, invoice_details, payroll_deductions, payroll_details, payroll_runs, payslips, profiles, rider_installments, riders, upload_batches, user_roles

## Task

Build the OES AI Workforce Framework as described in `docs/AI-WORKFORCE.md`. This is the foundation — Payroll Workflow is the first implementation.

### Phase 1: Framework Foundation

**1. Base Worker class** — `src/lib/workforce/base-worker.ts`

Create an abstract BaseWorker class implementing the contract from the doc:
```
initialize() → collect() → validate() → execute() → notify() → log() → cleanup()
```

Requirements:
- Generic `TInput` and `TOutput` type params
- Each method returns `Promise<void>` or `Promise<result>`
- Built-in execution timing (start/end/duration)
- Built-in retry logic (3 attempts, configurable)
- Built-in error handling — if a worker fails, the workflow can decide to continue or abort
- `log()` writes to a `workflow_executions` table (create via migration)
- Workers receive a `WorkerContext` with: supabase admin client, server config, logger, workflow run ID
- Workers are stateless — all state flows through context

**2. Workflow Runner** — `src/lib/workforce/workflow-runner.ts`

Orchestrates sequential worker execution within a workflow:
- Accepts an ordered list of worker instances
- Runs them in sequence: output of worker N becomes input of worker N+1
- Tracks overall workflow status: `running` → `completed` | `failed` | `partial`
- If a worker fails and retry exhausts: check if worker is `critical` (abort workflow) or `optional` (skip, continue)
- Creates a `workflow_runs` row at start, updates at end
- Support 3 trigger types: `scheduler`, `event`, `manual`

**3. Supabase migration** — `supabase/migrations/20260720000000_workforce_tables.sql`

Create these tables (NOT commented out — these are real schema):
```sql
-- Workflow definitions (configurable)
create table workflow_configs (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,           -- 'payroll', 'finance', 'rca'
  display_name text not null,
  description text,
  enabled boolean default true,
  schedule text,                        -- cron expression (nullable = no auto schedule)
  config jsonb default '{}'::jsonb,     -- workflow-specific settings
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Workflow execution runs
create table workflow_runs (
  id uuid primary key default gen_random_uuid(),
  workflow_name text not null references workflow_configs(name),
  trigger_type text not null check (trigger_type in ('scheduler', 'event', 'manual')),
  triggered_by text,                    -- user email or 'system-cron'
  status text not null default 'running' check (status in ('running', 'completed', 'failed', 'partial')),
  started_at timestamptz default now(),
  finished_at timestamptz,
  duration_ms integer,
  input_params jsonb default '{}'::jsonb,
  result jsonb,
  error text,
  created_at timestamptz default now()
);

-- Individual worker executions within a workflow run
create table worker_executions (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references workflow_runs(id) on delete cascade,
  worker_name text not null,
  step_order integer not null,
  status text not null default 'pending' check (status in ('pending', 'running', 'completed', 'failed', 'skipped')),
  started_at timestamptz,
  finished_at timestamptz,
  duration_ms integer,
  retry_count integer default 0,
  input_summary jsonb,
  output_summary jsonb,
  ai_provider text,
  ai_model text,
  ai_tokens_used integer,
  notification_status text,
  error text,
  created_at timestamptz default now()
);

create index idx_workflow_runs_workflow on workflow_runs(workflow_name);
create index idx_workflow_runs_status on workflow_runs(status);
create index idx_worker_executions_run on worker_executions(run_id);
```

Add RLS policies: service_role can do everything, authenticated admin users can SELECT.

**4. Config registration** — `src/lib/config.server.ts`

Add to `getServerConfig()`:
```ts
workforceSecret: process.env.WORKFORCE_SECRET,
```

**5. Workforce API endpoint** — `src/routes/api.workforce.ts`

Follow the exact pattern of `api.payroll-reminder.ts`:
- POST endpoint with `x-workforce-secret` header auth
- Body: `{ workflow: "payroll", trigger: "scheduler" | "event" | "manual", params?: {} }`
- Delegates to the workflow runner
- PostHog event tracking
- Return `{ ok: true, runId, result }`

### Phase 2: Payroll Workflow Workers

All workers go in `src/lib/workforce/workers/payroll/`

**Important constraints:**
- The Business Engine is `src/lib/payroll-generate.ts` → `generatePayrollDetails()`. The Calculator Worker MUST call this function. NEVER duplicate or rewrite payroll calculation logic.
- AI workers (Auditor, Review) use `callHermes()` from `src/lib/agents/hermes-client.server.ts` for summaries/recommendations ONLY. AI never calculates, never writes to DB.
- All DB writes use `getSupabaseAdmin()` (service-role).

**Workers to implement:**

1. `scheduler-worker.ts` — Check if today matches any payroll run's expected generation date. Query `payroll_runs` or `workflow_configs` for schedule. Output: list of payroll runs to process.

2. `collector-worker.ts` — For each payroll run, verify all required data exists: delivery_records for the period, attendance_logs for the period, rider bank accounts, active deduction_types, rider_installments. Output: data readiness report per run.

3. `calculator-worker.ts` — Call `generatePayrollDetails(run)` from `src/lib/payroll-generate.ts` for each run. This IS the Business Engine. Do NOT reimplement any calculation. Output: `{ detailCount }` per run.

4. `validator-worker.ts` — Query the generated `payroll_details` and check for: missing attendance, missing bank account on riders, duplicate payments (same rider+period), negative net amounts, riders with deliveries but no payroll detail. Output: list of validation warnings.

5. `auditor-worker.ts` — AI-powered (optional worker, non-critical). Takes validator output + payroll summary data. Calls `callHermes()` to generate: anomaly explanations, recommendations, executive summary. Output: structured JSON audit report. If AI fails, workflow continues without audit.

6. `review-worker.ts` — Update payroll_runs status to 'need_review' (or keep 'draft' if validator found critical issues). Prepare notification payload summarizing what was generated and what needs attention.

7. `publisher-worker.ts` — NOT auto-triggered by scheduler. Only triggered manually after human approval. Locks payroll (status → 'locked'), generates payslips, creates payment batch. Uses existing payslip generation logic if it exists.

**Register the workflow** in `src/lib/workforce/workflows/payroll-workflow.ts`:
```ts
export function createPayrollWorkflow(): WorkflowDefinition {
  return {
    name: 'payroll',
    workers: [
      { worker: new SchedulerWorker(), critical: true },
      { worker: new CollectorWorker(), critical: true },
      { worker: new CalculatorWorker(), critical: true },
      { worker: new ValidatorWorker(), critical: true },
      { worker: new AuditorWorker(), critical: false },  // AI — optional
      { worker: new ReviewWorker(), critical: true },
      // PublisherWorker is manual-only, not in auto pipeline
    ],
  };
}
```

### Phase 3: pg_cron + Notification

**1. Cron migration** — `supabase/migrations/20260720000001_workforce_cron.sql`

Follow the commented-out pattern from `20260712010000_payroll_reminder_cron.sql`:
- Schedule: every Friday 01:00 UTC (08:00 WIB)
- POST to `/api/workforce` with `x-workforce-secret` header
- Body: `{ "workflow": "payroll", "trigger": "scheduler" }`

**2. Notification integration**

Workers that need to notify should return a `notifications` array in their output:
```ts
{ channel: 'slack' | 'email', message: string, recipients?: string[] }
```
The workflow runner picks these up after each worker and dispatches via existing `src/lib/notify/slack.server.ts` and `src/lib/notify/email.server.ts`.

### Rules

1. NEVER create files in the project root. All source goes in `src/`, migrations in `supabase/migrations/`, docs in `docs/`.
2. NEVER duplicate business logic from `payroll-generate.ts`, `pricing-calc.ts`, or `pnl-engine.ts`. Workers CALL these, never reimplement.
3. All `.server.ts` files are server-only (Vite won't bundle them to client).
4. Follow existing TypeScript style: `as any` casts for tables not in generated types, eslint-disable comments where needed.
5. Keep files under 500 lines. Split if needed.
6. Read existing files before editing them.
7. Run `npm run build` after all changes to verify no TypeScript errors.
8. The framework must be extensible — adding a Finance Workflow or RCA Workflow later should only require: new worker files + workflow definition + workflow_configs row. No framework changes.

### Env vars needed (document in comments)

```
WORKFORCE_SECRET=<shared secret for cron auth>
```

No new AI keys needed — reuse existing OPENROUTER_API_KEY + HERMES_MODEL.

### File structure when done

```
src/lib/workforce/
├── base-worker.ts              # Abstract BaseWorker class
├── workflow-runner.ts           # Orchestrator
├── types.ts                     # Shared types (WorkerContext, WorkflowDefinition, etc.)
├── workflows/
│   └── payroll-workflow.ts      # Payroll workflow definition
└── workers/
    └── payroll/
        ├── scheduler-worker.ts
        ├── collector-worker.ts
        ├── calculator-worker.ts
        ├── validator-worker.ts
        ├── auditor-worker.ts
        ├── review-worker.ts
        └── publisher-worker.ts

src/routes/
└── api.workforce.ts             # API endpoint

supabase/migrations/
├── 20260720000000_workforce_tables.sql
└── 20260720000001_workforce_cron.sql
```

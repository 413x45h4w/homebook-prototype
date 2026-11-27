# Ticket pipeline

Approving a feedback ticket queues it. An automation builds a preview. Alex compares it with production in `/#/review`. Only **Ship to production** merges the work onto `main`, which is the only branch that changes the live site at `https://alexforshaw.github.io/homebook-prototype/`.

Apply `supabase/migrations/20261127120300_ticket_pipeline.sql` in the Supabase SQL editor before the automation runs. The app does not apply it.

## States

`ticket_status.status` is the latest `ticket_events.decision`, or `pending` when there are none. Rows are append-only. Never update or delete them.

| Status | Who writes it | Meaning |
| --- | --- | --- |
| `pending` | nobody yet | Needs a decision |
| `approved` | reviewer | Queued for work |
| `in_progress` | automation | Branch is being built |
| `preview_ready` | automation | Preview is up for Alex |
| `changes_requested` | reviewer | Do another pass. The note says what to change |
| `ship_requested` | reviewer | Merge the preview to production |
| `shipped` | automation | Merged and the production deploy finished |
| `disapproved` | reviewer | Closed, not built |
| `discarded` | reviewer | Closed, drop the preview |
| `reopened` | reviewer | Needs a decision again |

Reviewers may insert only `approved`, `disapproved`, `reopened`, `ship_requested`, `changes_requested`, and `discarded`. The service role inserts `in_progress`, `preview_ready`, `shipped`, and `ticket_builds` rows.

## What the automation does

Use the Supabase **service role** key. Do not put it in the repo. The project URL is `https://ffhmsxgqzmljpyyidfrz.supabase.co`.

Send `Content-Type: application/json`, `apikey: <service-role>`, `Authorization: Bearer <service-role>`, and `Prefer: return=minimal`.

### 1. Pick up work

```http
GET /rest/v1/ticket_status?status=in.(approved,changes_requested)&select=*
```

Also read the note on a `changes_requested` ticket:

```http
GET /rest/v1/ticket_events?ticket_id=eq.<uuid>&order=created_at.desc&limit=1
```

### 2. Mark it in progress

`reviewer_email` is required in practice for the service role, because that JWT has no email. The migration default is `coalesce(auth.jwt()->>'email', 'automation')`, and sending it explicitly is safer.

```http
POST /rest/v1/ticket_events
```

```json
{
  "ticket_id": "<uuid>",
  "decision": "in_progress",
  "reviewer_email": "automation"
}
```

Do not send `id` or `created_at`. `id` is a generated bigint.

### 3. Branch, implement, push

Branch name: `ticket/` plus the first 8 characters of the ticket uuid, with the hyphens removed. `ccf16b62-1111-...` becomes `ticket/ccf16b62`.

Open a pull request into `main`. Do not merge it yet.

Capture a before screenshot from production and an after screenshot from the preview. Commit both on the ticket branch:

```
docs/ticket-shots/<short-id>/before.png
docs/ticket-shots/<short-id>/after.png
```

Raw URLs, after the branch is on GitHub:

```
https://github.com/alexforshaw/homebook-prototype/raw/ticket/<short-id>/docs/ticket-shots/<short-id>/before.png
https://github.com/alexforshaw/homebook-prototype/raw/ticket/<short-id>/docs/ticket-shots/<short-id>/after.png
```

Pushing the branch runs Deploy GitHub Pages. That workflow checks out **main** for the site root and builds every existing `ticket/*` branch into `/homebook-prototype/preview/<short-id>/`. Production files change only when `main` changes.

Preview URL:

```
https://alexforshaw.github.io/homebook-prototype/preview/<short-id>/
```

The screen the ticket was filed from is the hash route on `ticket_status.route`, for example `#/knowledge/kb-door`.

### 4. Record the build

```http
POST /rest/v1/ticket_builds
```

```json
{
  "ticket_id": "<uuid>",
  "branch": "ticket/<short-id>",
  "pr_url": "https://github.com/alexforshaw/homebook-prototype/pull/<n>",
  "preview_url": "https://alexforshaw.github.io/homebook-prototype/preview/<short-id>/#<route>",
  "before_screenshot_url": "https://github.com/alexforshaw/homebook-prototype/raw/ticket/<short-id>/docs/ticket-shots/<short-id>/before.png",
  "after_screenshot_url": "https://github.com/alexforshaw/homebook-prototype/raw/ticket/<short-id>/docs/ticket-shots/<short-id>/after.png",
  "summary": "One short paragraph about what changed."
}
```

Then:

```http
POST /rest/v1/ticket_events
```

```json
{
  "ticket_id": "<uuid>",
  "decision": "preview_ready",
  "reviewer_email": "automation",
  "note": "Preview is ready."
}
```

### 5. Ship

Poll for `ship_requested`:

```http
GET /rest/v1/ticket_status?status=eq.ship_requested&select=*
```

Merge the pull request into `main`. Wait until the Deploy GitHub Pages run for that main commit succeeds and `https://alexforshaw.github.io/homebook-prototype/` returns 200. Then:

```http
POST /rest/v1/ticket_events
```

```json
{
  "ticket_id": "<uuid>",
  "decision": "shipped",
  "reviewer_email": "automation"
}
```

Delete the `ticket/<short-id>` branch. Deleting it triggers another Pages build so the preview path is removed. Production stays on the new `main`.

`changes_requested` means go back to step 2 and keep the same branch. `discarded` means close the pull request, delete the branch, and stop.

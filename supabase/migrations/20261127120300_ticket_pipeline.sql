-- Ticket pipeline. Append-only. Do not edit or delete rows in ticket_events or ticket_builds.
-- Apply this in the Supabase SQL editor for project ffhmsxgqzmljpyyidfrz.
-- The app does not apply it automatically.

alter table public.ticket_events drop constraint ticket_events_decision_check;

alter table public.ticket_events
  add constraint ticket_events_decision_check
  check (decision = any (array[
    'approved',
    'disapproved',
    'reopened',
    'in_progress',
    'preview_ready',
    'ship_requested',
    'shipped',
    'changes_requested',
    'discarded'
  ]::text[]));

-- Service-role JWTs have no email. Reviewer JWTs still store the reviewer address.
alter table public.ticket_events
  alter column reviewer_email set default coalesce(auth.jwt() ->> 'email', 'automation');

comment on column public.ticket_events.decision is
  'approved = queued for work. in_progress, preview_ready, and shipped are written by automation. ship_requested, changes_requested, and discarded are written by a reviewer.';

create or replace function public.reject_ticket_history_change()
returns trigger
language plpgsql
as $$
begin
  raise exception 'ticket history is append-only';
end;
$$;

drop trigger if exists ticket_events_append_only on public.ticket_events;
create trigger ticket_events_append_only
  before update or delete on public.ticket_events
  for each row execute function public.reject_ticket_history_change();

drop policy if exists events_insert_reviewer on public.ticket_events;
create policy events_insert_reviewer on public.ticket_events
  for insert to authenticated
  with check (
    public.is_reviewer()
    and decision = any (array[
      'approved',
      'disapproved',
      'reopened',
      'ship_requested',
      'changes_requested',
      'discarded'
    ]::text[])
  );

-- service_role bypasses RLS. This policy documents the automation writes if bypass is ever off.
drop policy if exists events_insert_service on public.ticket_events;
create policy events_insert_service on public.ticket_events
  for insert to service_role
  with check (true);

create table public.ticket_builds (
  id bigint generated always as identity primary key,
  ticket_id uuid not null references public.feedback_tickets (id),
  branch text not null,
  pr_url text,
  preview_url text,
  before_screenshot_url text,
  after_screenshot_url text,
  summary text,
  created_at timestamptz not null default now(),
  constraint ticket_builds_branch_check check (char_length(branch) between 1 and 200),
  constraint ticket_builds_summary_check check (summary is null or char_length(summary) <= 5000)
);

comment on table public.ticket_builds is
  'Append-only preview builds. Automation inserts with the service role. Reviewers can read.';

drop trigger if exists ticket_builds_append_only on public.ticket_builds;
create trigger ticket_builds_append_only
  before update or delete on public.ticket_builds
  for each row execute function public.reject_ticket_history_change();

alter table public.ticket_builds enable row level security;

drop policy if exists builds_read_reviewer on public.ticket_builds;
create policy builds_read_reviewer on public.ticket_builds
  for select to authenticated
  using (public.is_reviewer());

drop policy if exists builds_read_service on public.ticket_builds;
create policy builds_read_service on public.ticket_builds
  for select to service_role
  using (true);

drop policy if exists builds_insert_service on public.ticket_builds;
create policy builds_insert_service on public.ticket_builds
  for insert to service_role
  with check (true);

revoke all on public.ticket_builds from anon, authenticated;
grant select on public.ticket_builds to authenticated;
grant select, insert on public.ticket_builds to service_role;
grant usage, select on sequence public.ticket_builds_id_seq to service_role;

create or replace view public.ticket_status
with (security_invoker = true) as
select
  id,
  created_at,
  title,
  body,
  type,
  severity,
  flow,
  step,
  screen,
  route,
  role,
  tester_name,
  context,
  app_version,
  coalesce((
    select e.decision
    from public.ticket_events e
    where e.ticket_id = t.id
    order by e.created_at desc, e.id desc
    limit 1
  ), 'pending') as status
from public.feedback_tickets t;

comment on view public.ticket_status is
  'Latest append-only decision, or pending when a ticket has no events.';

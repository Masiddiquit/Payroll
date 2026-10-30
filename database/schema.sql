begin;
create table public.pay_ledgers (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references auth.users(id),
 name text not null default 'Payroll', manager_email text, default_pay_cents bigint not null default 250000 check(default_pay_cents>=0),
 opening_due_cents bigint not null default 0, created_at timestamptz not null default now()
);
create index pay_ledgers_owner_idx on public.pay_ledgers(owner_id);
alter table public.pay_ledgers enable row level security;
create policy ledger_read on public.pay_ledgers for select to authenticated using(owner_id=(select auth.uid()) or lower(manager_email)=lower((select auth.jwt()->>'email')));
create policy ledger_create on public.pay_ledgers for insert to authenticated with check(owner_id=(select auth.uid()));
create policy ledger_edit on public.pay_ledgers for update to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create policy ledger_remove on public.pay_ledgers for delete to authenticated using(owner_id=(select auth.uid()));
create table public.pay_periods (
 id uuid primary key default gen_random_uuid(), ledger_id uuid not null references public.pay_ledgers(id) on delete cascade,
 year integer not null check(year between 2000 and 2100), month integer not null check(month between 1 and 12),
 start_date date not null, end_date date not null, base_pay_cents bigint not null default 250000 check(base_pay_cents>=0),
 opening_override_cents bigint, status text not null default 'open' check(status in ('open','review','closed','planned')),
 notes text not null default '', source_total_cents bigint, source_sheet jsonb, updated_at timestamptz not null default now(), updated_by uuid default auth.uid(),
 unique(ledger_id,year,month), unique(id,ledger_id), check(start_date<=end_date)
);
create index pay_periods_ledger_idx on public.pay_periods(ledger_id,start_date);
create table public.pay_entries (
 id uuid primary key default gen_random_uuid(), ledger_id uuid not null, period_id uuid not null,
 kind text not null check(kind in ('addition','deduction','payment','adjustment')),
 description text not null check(length(description)>0), category text not null default 'Other' check(length(btrim(category)) between 1 and 80), amount_cents bigint not null,
 entry_date date, method text not null default '', status text not null default 'confirmed' check(status in ('confirmed','pending')),
 notes text not null default '', source_ref text, updated_at timestamptz not null default now(), updated_by uuid default auth.uid(),
 foreign key(period_id,ledger_id) references public.pay_periods(id,ledger_id) on delete cascade,
 check(kind='adjustment' or amount_cents>=0), check(kind<>'payment' or status='pending' or entry_date is not null)
);
create index pay_entries_period_idx on public.pay_entries(period_id);
create index pay_entries_ledger_idx on public.pay_entries(ledger_id);
create table public.bank_months (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references auth.users(id),
 year integer not null check(year between 2000 and 2100),month integer not null check(month between 1 and 12),
 opening_override_cents bigint, actual_close_cents bigint, notes text not null default '',unique(owner_id,year,month)
);
create table public.bank_entries (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references auth.users(id),
 entry_date date not null, description text not null, amount_cents bigint not null check(amount_cents<>0),
 category text not null default 'Other', notes text not null default '', linked_payment_id uuid unique references public.pay_entries(id) on delete set null,
 created_at timestamptz not null default now()
);
create index bank_entries_owner_date_idx on public.bank_entries(owner_id,entry_date);
create index bank_entries_linked_idx on public.bank_entries(linked_payment_id);
alter table public.pay_periods enable row level security;
alter table public.pay_entries enable row level security;
alter table public.bank_months enable row level security;
alter table public.bank_entries enable row level security;
create policy periods_access on public.pay_periods for all to authenticated using(exists(select 1 from public.pay_ledgers l where l.id=pay_periods.ledger_id and (l.owner_id=(select auth.uid()) or lower(l.manager_email)=lower((select auth.jwt()->>'email'))))) with check(exists(select 1 from public.pay_ledgers l where l.id=pay_periods.ledger_id and (l.owner_id=(select auth.uid()) or lower(l.manager_email)=lower((select auth.jwt()->>'email')))));
create policy entries_access on public.pay_entries for all to authenticated using(exists(select 1 from public.pay_ledgers l where l.id=pay_entries.ledger_id and (l.owner_id=(select auth.uid()) or lower(l.manager_email)=lower((select auth.jwt()->>'email'))))) with check(exists(select 1 from public.pay_ledgers l where l.id=pay_entries.ledger_id and (l.owner_id=(select auth.uid()) or lower(l.manager_email)=lower((select auth.jwt()->>'email')))));
create policy bank_months_private on public.bank_months for all to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create policy bank_entries_private on public.bank_entries for all to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()) and (linked_payment_id is null or exists(select 1 from public.pay_entries p join public.pay_ledgers l on l.id=p.ledger_id where p.id=bank_entries.linked_payment_id and l.owner_id=(select auth.uid()) and p.kind='payment' and p.status='confirmed')));
grant select,insert,update,delete on public.pay_ledgers,public.pay_periods,public.pay_entries,public.bank_months,public.bank_entries to authenticated;
revoke all on public.pay_ledgers,public.pay_periods,public.pay_entries,public.bank_months,public.bank_entries from anon;
create function public.pay_touch() returns trigger language plpgsql security invoker set search_path='' as $$begin new.updated_at=now();new.updated_by=auth.uid();return new;end$$;
revoke execute on function public.pay_touch() from public,anon;
grant execute on function public.pay_touch() to authenticated;
create trigger pay_period_touch before insert or update on public.pay_periods for each row execute function public.pay_touch();
create trigger pay_entry_touch before insert or update on public.pay_entries for each row execute function public.pay_touch();
-- One transaction prevents a partial Excel import or duplicate months on retry.
create function public.import_pay_year(p_ledger uuid,p_year integer,p_periods jsonb,p_entries jsonb) returns void language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.pay_ledgers where id=p_ledger and owner_id=auth.uid()) then raise exception 'Only the ledger owner can import';end if;
 if exists(select 1 from public.pay_periods where ledger_id=p_ledger and year=p_year) then raise exception 'This year already has periods. Import into an empty year.';end if;
 insert into public.pay_periods(id,ledger_id,year,month,start_date,end_date,base_pay_cents,opening_override_cents,status,notes,source_total_cents,source_sheet)
 select x.id,p_ledger,p_year,x.month,x.start_date,x.end_date,x.base_pay_cents,x.opening_override_cents,x.status,x.notes,x.source_total_cents,x.source_sheet
 from jsonb_to_recordset(p_periods) as x(id uuid,month integer,start_date date,end_date date,base_pay_cents bigint,opening_override_cents bigint,status text,notes text,source_total_cents bigint,source_sheet jsonb);
 insert into public.pay_entries(id,ledger_id,period_id,kind,description,amount_cents,entry_date,method,status,notes,source_ref,category)
 select x.id,p_ledger,x.period_id,x.kind,x.description,x.amount_cents,x.entry_date,x.method,x.status,x.notes,x.source_ref,coalesce(nullif(btrim(x.category),''),'Other')
 from jsonb_to_recordset(p_entries) as x(id uuid,period_id uuid,kind text,description text,amount_cents bigint,entry_date date,method text,status text,notes text,source_ref text,category text);
end$$;
revoke execute on function public.import_pay_year(uuid,integer,jsonb,jsonb) from public,anon;
grant execute on function public.import_pay_year(uuid,integer,jsonb,jsonb) to authenticated;
-- Deletes only records belonging to the caller, atomically, with RLS still active.
create function public.delete_my_pay_data(p_confirmation text) returns void
language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in first'; end if;
 if p_confirmation is distinct from 'DELETE ALL' then raise exception 'Type DELETE ALL to confirm'; end if;
 delete from public.bank_entries where owner_id=auth.uid();
 delete from public.bank_months where owner_id=auth.uid();
 delete from public.pay_ledgers where owner_id=auth.uid();
end $$;
revoke execute on function public.delete_my_pay_data(text) from public,anon;
grant execute on function public.delete_my_pay_data(text) to authenticated;
commit;

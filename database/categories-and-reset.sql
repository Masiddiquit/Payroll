begin;
alter table public.pay_entries add column category text not null default 'Other' check(length(btrim(category)) between 1 and 80);

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
create or replace function public.import_pay_year(p_ledger uuid,p_year integer,p_periods jsonb,p_entries jsonb) returns void language plpgsql security invoker set search_path='' as $$
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
commit;

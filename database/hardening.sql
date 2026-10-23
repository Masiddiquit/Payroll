begin;
drop trigger pay_period_touch on public.pay_periods;
create trigger pay_period_touch before insert or update on public.pay_periods for each row execute function public.pay_touch();
drop trigger pay_entry_touch on public.pay_entries;
create trigger pay_entry_touch before insert or update on public.pay_entries for each row execute function public.pay_touch();
drop policy bank_entries_private on public.bank_entries;
create policy bank_entries_private on public.bank_entries for all to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()) and (linked_payment_id is null or exists(select 1 from public.pay_entries p join public.pay_ledgers l on l.id=p.ledger_id where p.id=bank_entries.linked_payment_id and l.owner_id=(select auth.uid()) and p.kind='payment' and p.status='confirmed')));
commit;

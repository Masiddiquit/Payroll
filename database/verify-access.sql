begin;
insert into auth.users(id,email,email_confirmed_at) values
('11111111-1111-4111-8111-111111111111','owner@prid-test.invalid',now()),
('22222222-2222-4222-8222-222222222222','manager@prid-test.invalid',now()),
('33333333-3333-4333-8333-333333333333','outsider@prid-test.invalid',now());
set local role authenticated;
set local request.jwt.claims='{"sub":"11111111-1111-4111-8111-111111111111","email":"owner@prid-test.invalid","role":"authenticated"}';
insert into public.pay_ledgers(id,manager_email) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','manager@prid-test.invalid');
insert into public.pay_periods(id,ledger_id,year,month,start_date,end_date) values('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',2020,1,'2019-12-19','2020-01-18');
insert into public.pay_entries(ledger_id,period_id,kind,description,amount_cents) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','deduction','Test deduction',14000);
insert into public.bank_entries(entry_date,description,amount_cents) values('2020-01-01','Private bank fixture',1000);
do $$begin if (select count(*) from public.pay_periods)<>1 or (select count(*) from public.bank_entries)<>1 then raise exception 'Owner access failed';end if;end$$;
set local request.jwt.claims='{"sub":"22222222-2222-4222-8222-222222222222","email":"manager@prid-test.invalid","role":"authenticated"}';
do $$begin if (select count(*) from public.pay_periods)<>1 or (select count(*) from public.bank_entries)<>0 then raise exception 'Manager privacy failed';end if;end$$;
update public.pay_entries set description='Manager edit' where ledger_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
do $$begin if (select count(*) from public.pay_entries where description='Manager edit' and updated_by='22222222-2222-4222-8222-222222222222')<>1 then raise exception 'Manager edit failed';end if;end$$;
set local request.jwt.claims='{"sub":"33333333-3333-4333-8333-333333333333","email":"outsider@prid-test.invalid","role":"authenticated"}';
do $$begin if (select count(*) from public.pay_ledgers)<>0 or (select count(*) from public.pay_periods)<>0 or (select count(*) from public.pay_entries)<>0 or (select count(*) from public.bank_entries)<>0 then raise exception 'Outsider data exposure';end if;end$$;
do $$begin begin insert into public.pay_entries(ledger_id,period_id,kind,description,amount_cents) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','deduction','Unauthorized',100);raise exception 'SECURITY FAILURE';exception when insufficient_privilege then null;end;end$$;
set local request.jwt.claims='{"sub":"11111111-1111-4111-8111-111111111111","email":"owner@prid-test.invalid","role":"authenticated"}';
do $$begin if (select count(*) from public.pay_entries)<>1 then raise exception 'Unauthorized write succeeded';end if;end$$;
select public.import_pay_year('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',2021,'[{"id":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","month":1,"start_date":"2020-12-19","end_date":"2021-01-18","base_pay_cents":250000,"status":"review","notes":"Test import","source_total_cents":100}]'::jsonb,'[]'::jsonb);
select 'import_succeeded' as test,(select count(*) from public.pay_periods where year=2021)=1 as passed;
do $$begin begin perform public.import_pay_year('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',2021,'[]'::jsonb,'[]'::jsonb);raise exception 'DUPLICATE FAILURE';exception when raise_exception then if sqlerrm not like 'This year already%' then raise;end if;end;end$$;
-- New categories persist for either payroll collaborator.
update public.pay_entries set category='Custom expense' where ledger_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
do $$begin if not exists(select 1 from public.pay_entries where category='Custom expense') then raise exception 'Category persistence failed'; end if; end$$;
-- Wrong confirmation must fail before any data is deleted.
do $$begin begin perform public.delete_my_pay_data('DELETE');raise exception 'RESET VALIDATION FAILED';exception when raise_exception then if sqlerrm not like 'Type DELETE ALL%' then raise;end if;end;end$$;
set local request.jwt.claims='{"sub":"22222222-2222-4222-8222-222222222222","email":"manager@prid-test.invalid","role":"authenticated"}';
select public.delete_my_pay_data('DELETE ALL');
do $$begin if not exists(select 1 from public.pay_ledgers where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') then raise exception 'Manager deleted owner data';end if;end$$;
set local request.jwt.claims='{"sub":"33333333-3333-4333-8333-333333333333","email":"outsider@prid-test.invalid","role":"authenticated"}';
insert into public.pay_ledgers(id) values('dddddddd-dddd-4ddd-8ddd-dddddddddddd');
set local request.jwt.claims='{"sub":"11111111-1111-4111-8111-111111111111","email":"owner@prid-test.invalid","role":"authenticated"}';
insert into public.bank_months(year,month,opening_override_cents) values(2020,1,1000);
select public.delete_my_pay_data('DELETE ALL');
do $$begin if exists(select 1 from public.pay_ledgers) or exists(select 1 from public.pay_periods) or exists(select 1 from public.pay_entries) or exists(select 1 from public.bank_months) or exists(select 1 from public.bank_entries) then raise exception 'Owner reset incomplete';end if;end$$;
set local request.jwt.claims='{"sub":"33333333-3333-4333-8333-333333333333","email":"outsider@prid-test.invalid","role":"authenticated"}';
do $$begin if not exists(select 1 from public.pay_ledgers where id='dddddddd-dddd-4ddd-8ddd-dddddddddddd') then raise exception 'Another owner data deleted';end if;end$$;
select 'Access, import, custom categories and owner-only reset passed; fixtures rolled back' as result;
reset role;
rollback;

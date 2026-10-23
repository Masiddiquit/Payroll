# Verification — 2026-10-23

Deployment: https://prid-pay.vercel.app/

## Passed

- Twelve automated tests: carry across years, signed balances, pending/planned exclusion, opening overrides, bank reconciliation, date handling, CSV escaping, source-cell retention, duplicate import validation and yearly aggregation.
- Original workbook audited privately: 12 months, 70 entries, 355 populated source cells. All 12 original closing balances reconcile exactly when the original settlements are included.
- Production sign-in and actual workbook import via browser. Database records compared field-by-field with the parsed import; no discrepancies.
- Original worksheet modal displays original values, formulas and notes.
- Production creation of an active 2027 month and a planned 2028 month. Both appeared in All years; planned pay was excluded from earned totals.
- Receipt creation, missing-date validation, editing, persistence and recalculation.
- Bank opening and actual closing, daily expense, linked pay deposit and prevention of duplicate receipt linking. The synthetic bank example reconciled exactly.
- Payment search, yearly navigation, reports and CSV download.
- Downloaded CSV: 12 monthly rows, 70 entry rows and 355 source-cell rows, with no QA records.
- Reversible SQL fixtures: owner CRUD, manager payroll editing, private bank isolation, outsider denial, atomic import and duplicate import rejection.
- Temporary production test records removed by exact IDs. Imported records remain intact.
- Production deployed successfully through the private GitHub repository and Vercel.

## Deliberate review items and limits

- Twelve imported receipt/adjustment items remain pending where notes or dates are ambiguous. Pending items do not affect calculated actual balances; source totals remain available for comparison.
- The workbook has no bank opening/closing statements; the user must enter these. Payroll deductions do not automatically become bank withdrawals.
- A real manager-account sign-in, password-reset email delivery and physical printing were not exercised. Manager isolation was tested with transactional database fixtures.
- Supabase Auth advisor reports leaked-password protection disabled. No sharing or authentication protections were weakened during testing.
- Browser extension metadata errors were observed; no app error was seen in the tested flows.

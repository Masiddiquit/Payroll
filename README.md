# Payroll

A responsive personal pay ledger with a Supabase database and authentication, shared payroll access and a Vercel deployment configuration. The app has no build step. Serve the `dist` directory over HTTPS.

## Current status

- Supabase project `Payroll` is provisioned in the selected organization, in us-east-1.
- Its public schema and access policies are applied. Row-level access checks pass. The Auth advisor flags leaked-password protection as disabled; review that optional setting before wider rollout.
- The web app, calculation tests and Excel importer are implemented.
- A private Sites preview is supplied for review. It is owner-only at the hosting layer, so the manager cannot use that preview link. Use the Vercel production URL for the app's shared access.
- Production is deployed at https://payroll-masiddiqui.vercel.app/ in the Vercel account `masiddiqui`, linked to `Masiddiquit/Payroll` on `main`.
- Supabase Site URL and the exact redirect allowlist are configured for the production domain.
- Source code is maintained in the private GitHub repository `Masiddiquit/Payroll`.

No original workbook or financial transaction data is included in these sources. The sample dashboard uses invented records and never writes them to the database.

## Start using the app

1. Create an account and confirm your email. You can paste the email confirmation link or code in the app's verification form, or confirm from the email and return to sign in.
2. Create a pay ledger. Default base pay is editable.
3. In Settings, choose Import Excel. Select the original workbook and explicitly choose its year. Review the preview, then import.
4. Open each month and confirm receipts, actual payment dates and payment methods. Requests such as “Need for home” remain pending. Imported pending items do not affect the app's balance until confirmed.
5. Enter the manager's verified email in Settings. Share the app link with them yourself; no invitation email is sent by this app.

## Pay calculations

All stored amounts are integer US cents. The model is:

`closing carry = opening carry + base pay + additions − deductions + signed adjustments − confirmed receipts`

A positive carry is owed to the employee. A negative carry is an advance against future pay. The next active period carries the prior active closing balance unless a visible manual override is set. Planned periods are excluded from carry propagation and annual actual totals.

The calendar month in a pay-period label refers to the period's end. The default January period runs December 19–January 18. Actual start and end dates are editable, including the workbook's unusual January start on December 9.

Pay-period reports group receipts by the period they settle. Overview also shows receipts by their actual calendar payment dates for the selected year and month.

## Excel import behavior

The browser reads ZIP/XML from the workbook using vendored fflate 0.8.2, with compressed and expanded size limits. No workbook is uploaded to a public server. Only the explicitly confirmed import payload is saved to the authenticated ledger via the `import_pay_year` transaction.

The importer recognizes the uploaded monthly pay tab layout, not arbitrary spreadsheets. It preserves additions, deductions, previous balances, source cell references, notes and original Excel closing totals. Explicit day/month notes are retained as dates. Clearly labelled, dated cash and Zelle receipts are confirmed; undated receipts, requests and ambiguous notes remain pending. Original populated cells, formulas and notes are preserved in each month’s Original worksheet view and CSV export. Negative receipt amounts become pending positive balance reversals. Check the signed adjustment before confirming. The original workbook's blank previous-month cells become explicit zero overrides, matching Excel; clear an override to enable automatic carry.

The importer was checked against the supplied workbook: all 12 source closing totals and all 12 recalculated closing totals matched exactly when staged receipts were included. It staged 70 entries, 6 of which still need receipt/adjustment review after the revised workbook was applied. An import is atomic and cannot overwrite a year already containing periods.

## Yearly dashboard

Overview has Year and Month selectors. Choose All months or any January–December month; totals, deduction categories, the statement and CSV follow the selection. Choose All years to compare every recorded year, including the current running year. Add month accepts years 2000–2100, including 2027 and 2028. Each saved year appears automatically. Planned months remain visible but are excluded from earned pay and carry calculations. Open a year to see its monthly graph. The latest carried balance is shown once, never summed across years.

## Categories and data reset

Pay entries accept editable categories, including new custom names. Overview groups confirmed pay deductions for the selected month or year. Category charts include every category in that selection.

Navigation contains Overview, Monthly pay, and Settings. Receipts and deductions are entered within each month. Personal expense tracking is not part of this app. Existing private bank tables remain in the database to preserve earlier records; they are not exposed as a separate tab.

Settings includes a private full JSON backup and Delete all my data. The reset requires typing DELETE ALL and checking the acknowledgement. The SECURITY INVOKER RPC removes only the caller's bank records and owned pay ledgers (including their periods, entries, original worksheets and sharing configuration). It preserves their authentication account and other owners' ledgers. The JSON backup is a data copy; automated restore is not implemented.

The sidebar has independent vertical scrolling and keyboard focus for short screens and browser zoom.

## Security and collaboration

- All five public tables have RLS enabled and anonymous access revoked.
- Only the ledger owner can change ledger settings and manager access.
- The owner and the one configured manager email can read and edit pay periods and pay entries. Sharing includes deletion of pay entries, not just viewing.
- The manager's Supabase email must be verified. Email claims come from Supabase Auth, not editable user metadata.
- Bank tables are restricted to their owner. Linking a payment also checks ownership of its parent ledger.
- The import RPC runs as the caller and checks ledger ownership. There is no service-role key in the frontend.
- Update timestamps and actor IDs are written by triggers. Concurrent edits of existing pay records use timestamp guards and ask the user to refresh after a conflict.
- Latest editor is recorded; this is not a complete immutable audit history or a formal payroll approval system.
- The public `config.js` includes only the Supabase URL and publishable key. This key is intended for clients; access is enforced by RLS and sign-in.
- Sessions persist in local storage for normal sign-in continuity. Use trusted devices and sign out on shared computers.

## Local preview and tests

Use a static development server, e.g. `python3 -m http.server 8080 --directory dist`. Production should use HTTPS. Run `npm test` with Node 20+.

`database/schema.sql` is the consolidated schema for a fresh Supabase project. Do not re-run it on the already provisioned project. `database/hardening.sql` records the applied hardening change and is not needed after installing the consolidated schema. `database/verify-access.sql` runs reversible synthetic fixtures inside a transaction and rolls everything back. It verifies owner access, shared pay editing, bank isolation, outsider denial, import and duplicate import rejection. The check assumes its fixed fixture IDs are not already in use.

Nineteen calculation, import and screen-rendering tests cover signed balances, pending and planned records, year transitions, opening overrides, bank reconciliation, import staging and CSV formula-injection escaping. Browser checks covered sample dashboard, pay deduction, and bank expense flows. Production sign-in and the actual workbook import have also been exercised. The production URL was verified to return HTTP 200 without Vercel login, serve the configured security headers, and render the sample dashboard. The owner account is confirmed and production sign-in works. Manager isolation was verified with rollback-only database fixtures; a real manager sign-in, password reset email and physical printing were not exercised.

## GitHub and Vercel handoff

The private GitHub repository is `Masiddiquit/Payroll`. The original workbook must not be committed. The repository is imported into the Vercel project `payroll` under `masiddiqui`; pushes to `main` trigger production deployments. Framework preset: Other; output directory: `dist`; build and install commands: leave empty. `vercel.json` contains the hosting settings and security headers. No secret server credentials are needed.

Supabase Authentication → URL Configuration is set to `https://payroll-masiddiqui.vercel.app` with `https://payroll-masiddiqui.vercel.app/` in the redirect allowlist. This enables direct email confirmation and password-reset redirects. The app also accepts the email verification/reset link through its verification form, so onboarding does not rely solely on the redirect. Configure production email delivery as needed in Supabase before inviting additional accounts.

To use another Supabase project, apply the consolidated schema once and replace `dist/config.js` with that project's URL and publishable key. Never put a secret key or service-role key there.

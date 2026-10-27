# Pay dashboard update — 27 October 2026

- Overview, all-years view, monthly statements, and their tables show opening carry, net earned, received, deductions, and carried forward.
- Five separately labelled charts share a USD scale. Accessible descriptions and per-bar titles expose exact values; zero and unrecorded periods are distinct. Year opening/closing values are snapshots, never sums of monthly carry balances.
- Inside a month, Add/Edit entry shows the month in the dialog title, removes the redundant month selector, and binds submission to that month. Dates outside the current month start blank instead of inventing a receipt date.
- Personal expenses were explicitly excluded by the user. No new entry kind, expense table, or database migration was applied. Existing payroll amounts and entries are unchanged.
- Replaced motivational slogans with functional headings and relevant sourced reminders: Qur’an 4:58 (excerpt), Qur’an 25:67, Sahih al-Bukhari 2079 (excerpt), and 2270 (excerpt with hadith-qudsi context). English text is labelled Meaning; source links provide full context. The application remains named PRID Pay pending the user’s choice.
- Validation: JavaScript syntax check and 19 automated tests, including month-bound add/edit submission and all five chart series with positive, negative, zero, and unrecorded values. A Chrome page inspection was blocked by a connection authorization error; no visual browser check is claimed.

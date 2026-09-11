# UI v3 — registration must preserve external intake

Recorded: 5 September 2026.

## User decision

The draft workspace mockup was received positively. The next registration design must preserve importing existing registrations so organizers who started with Google Forms can continue their tournament in Miracle.

## Verified existing behavior

- The visible registration importer accepts `.xlsx` and `.csv`, up to 5 MiB. Legacy `.xls` is not accepted by the current action.
- A worksheet name can be supplied. Column suggestions are derived from recognized headers; an interactive manual column mapper is not exposed in the current form.
- A preview classifies rows as new, changed, same, or error. Only new and changed rows can be selected for import; changed rows require an explicit selection.
- Imports create/update teams and rosters and reuse eligible captain accounts or create new captain credentials. Credential download is already available.
- Imports are blocked when the existing bracket-lock check applies. Import is not gated on Published status in the commit action, so draft intake must remain accessible.
- Import writes teams directly; it does not create the ordinary payment-review request. Do not label imported teams as payment-verified merely because their data was imported.

Evidence: `src/lib/actions.ts` registration intake actions; `src/lib/imports/registration-intake.ts`; `src/lib/platform/repository.ts` commitRegistrationImportBatch; `src/app/admin/page.tsx` ImportRegistrationPhase.

## Proposed next mockup scope

- Make two intake paths discoverable in Registrasi: direct Miracle registration and import from an existing spreadsheet/Google Forms export.
- Place an explicit Import XLSX / CSV action near the registration list, with source and import-history visibility.
- Use a dedicated import view for upload, column review, and row review/commit because a spreadsheet preview needs more space than the payment side panel.
- Preserve preview classifications, selective updates, error explanations, import history, and captain credential handoff.
- If editable column mapping is included, mark it as a proposed enhancement beyond the existing automatic suggestion.
- Keep intake source separate from payment status. Direct registrations retain the existing free/paid workflow; imported teams retain existing import semantics.

This records the direction for the next design review. No production behavior changed.

## Import review pagination

User requirement: the import data-review table must use pagination.

Proposed UI details for the mockup:

- Default to 25 rows per page, with 10 / 25 / 50 rows available.
- Show the visible row range, total filtered rows, current page, and previous/next controls.
- Preserve row selections across page changes and display the selected count across all pages.
- Label the header checkbox as selecting eligible rows on the current page; do not silently select other pages.
- Apply status filters to the complete preview dataset before pagination. Return to the first page when filters change.
- Preserve original spreadsheet row numbers for locating errors in the source file.
- Import all selected rows across pages, not only the visible page. Same and Error rows remain unselectable.

## Interactive mockup delivered

Reference: `public/miracle-organizer-v3-registration-mockup.html` (approved by the user on 5 September 2026).

- Registrasi includes direct signups, payment-review side panels, imported-team source labels, and import history.
- Import flow covers local XLSX/CSV reading, worksheet selection, editable column mapping, row review, a cross-page confirmation, and simulated commit.
- Built-in sample has 86 rows: 60 New, 9 Changed, 11 Same, and 6 Error. Review defaults to 25 rows with 10/25/50 choices.
- Browser verification passed for page-only header selection, preserved selections across pages and filters, changed-row detail, quoted CSV fields, XLSX reading, payment approval/rejection, import history, and mobile layout.
- File reading happens locally. Import and payment decisions only update session sample data. Captain access is an explanatory mockup, not real credential generation.
- Local ExcelJS browser bundle and license accompany the HTML. Production import validation and persistence remain unchanged.


Pagination discoverability update: user approved displaying the 10 / 25 / 50 row selector above the import-review table as well as below it. Both selectors share state, update the same row range, return to page one on size changes, and preserve selected rows.

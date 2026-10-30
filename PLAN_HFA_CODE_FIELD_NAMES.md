# PLAN_HFA_CODE_FIELD_NAMES

HFA indicator code's columns, fields, AI tool fields, workbook headers and help
id dropped R's name in steps 1 to 4, which are in the code and described by
SYSTEM_05 and SYSTEM_13. What remains ships with the deploy: the docs site's
commits and the resource hub's copy of the default indicator workbook.

**Next step:** Do 5

- Branch: `main`.
- Repos: `FASTR-Analytics/fastr-resource-hub` and `../wb-fastr-site` (step 5).
- Start when: Tim says the deploy of steps 1 to 4 is done.

## §0 How to work this plan

- Instruction: "Do the next step of PLAN_HFA_CODE_FIELD_NAMES.md."
- Bindings are [PROTOCOL_APP_PLANS.md](PROTOCOL_APP_PLANS.md): branch `main`,
  its reading order (`CLAUDE.md`, the step's section, §6), and each other repo's
  own CLAUDE.md for the work done there.
- Log: §6. Last step: 5.

## §3 Rulings

9. Shipping. Steps 1 to 4 are one deploy; migration `223` renames the code
   columns on first boot. With the deploy, the `wb-fastr-site` commits 601c2f2,
   5666c66 and 8b39162 are pushed, and step 5 rewrites and pushes the resource
   hub workbook. Between the deploy and step 5's push, "Import default
   indicators" is refused at the hub workbook's first `r_code__` column.
10. Rollback is a redeploy of the previous image after reversing `223` by hand
    on that instance:
    `ALTER TABLE hfa_indicator_code RENAME COLUMN code TO r_code;`
    `ALTER TABLE hfa_indicator_code RENAME COLUMN filter_code TO r_filter_code;`
    `ALTER TABLE hfa_indicator_variant_code RENAME COLUMN code TO r_code;`
    `DELETE FROM schema_migrations WHERE migration_id = '223_hfa_code_column_names';`

## §4 Steps

### Step 5: the resource hub workbook and the site push (after the deploy)

**Surface**

- `hfa_default_indicators.xlsx` in `FASTR-Analytics/fastr-resource-hub`
- `../wb-fastr-site` (push only)

**Deliverable**

- The hub workbook's Indicators headers become `code__<time point>`,
  `filter_code__<time point>` and `variant_code__<item id>__<time point>`, by a
  script run from the scratchpad that rewrites only those header cells in the
  sheet XML and copies every other zip entry unchanged. The repo root's
  `hfa_default_indicators.xlsx` was rewritten this way: 5 of 3951 cells changed.
- A cell-by-cell comparison with the previous version shows only those header
  cells changed.
- It is committed and pushed to the hub's `main`, and the `wb-fastr-site`
  commits of R9 are pushed.

**Gates:** the rewritten file parses with no error through
`detectHfaWorkbookShape` in
`client/src/components/data/hfa/indicators/xlsx_workbook.ts`, as
`server/tests/hfa_workbook_text_columns_test.ts` parses the repo root's copy.

**Ends with:** one commit in the hub, and this plan file deleted here.

## §6 Log

- Step 1 also edited `SYSTEM_02_persistence.md` and
  `PROTOCOL_APP_MIGRATIONS.md`, outside its Surface, because both said the only
  sanctioned edit of an applied migration is a table-existence guard, and 220's
  column guard made that false.
- The old-name grep in the gates of steps 3 and 4 also returned
  `SYSTEM_02_persistence.md` and `PROTOCOL_APP_MIGRATIONS.md`, whose step 1 edit
  names `r_code` as the column 220's guard checks.
- Step 3's known Indicators header set also holds each text column's language
  forms (`shortLabel_en`, `label_fr`, ...), which R8 did not list, because the
  import reads them and the default workbook uses them.

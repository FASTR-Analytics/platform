# Report Migration Archive (2026-04-23)

Pre-migration analysis of all `slide_deck` reports across 31 production instances.

## Contents

- `export_reports` - Bash script to export reports/report_items via SSH from production
- `analyze_reports.ts` - Deno script with Zod validation to analyze exported data
- `report_exports_20260423_100402/` - Exported CSV data from all instances

## Export Results

| Metric | Value |
|--------|-------|
| Total reports | 539 |
| Total report items | 15,160 |
| Instances | 31 |
| Format | 100% legacy (2D array) |

### Item Types

- Cover: 448
- Section: 1,199
- Freeform: 13,513

### Content Blocks (in Freeform)

- Text: 12,527
- Figure: 13,070
- Image: 814
- Placeholder: 1,337

### Key Findings

- **3 items have spans summing to 14** (exceeds 12-column grid)
- All configs pass strict Zod validation after accounting for extra fields
- Extra fields found: `placeholderStretch`, `placeholderHeight`, `replicateBy`

## Usage

```bash
# Re-export (if needed)
./_archive_report_migration/export_reports [instance_name]

# Re-analyze
deno run --allow-read _archive_report_migration/analyze_reports.ts
```

## Related

- See `PLAN_02_REPORT_MIGRATION.md` for the migration implementation plan

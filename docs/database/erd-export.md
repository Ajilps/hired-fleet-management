# Local ERD PDF export

The [ERD PDF](HireD_Phase_1_Database_ERD.pdf) is a vector/text export of [hired.dbml](hired.dbml), labelled as a proposed design. The DBML remains the authoritative design inventory; the export does not implement a database or add Prisma models/migrations.

## Regenerate locally

Use a Python 3.10+ environment containing `reportlab` and `pypdf`. This refresh used the existing Codex bundled Python/PDF dependencies; no packages or global tools were installed or upgraded. When adopting/updating tooling, follow the [stable compatible version policy](../developer-setup.md#dependency-and-version-policy).

From the repository root, with that Python environment selected:

```sh
python3 docs/database/generate-erd.py --date 2026-10-10
```

Set the date to the actual export date on future refreshes. The default source and output are relative to the script's directory, not the current working directory. `--source` and `--output` accept explicit paths for isolated verification. The script performs no network calls and embeds the regular/bold Vera fonts supplied with ReportLab. It derives the source revision from the DBML's SHA-256 and places the date, revision and proposed-design label in the PDF.

The parser supports the explicit Table, Enum, column, index and Ref syntax currently used by this DBML. Unsupported syntax raises an error instead of silently omitting schema content. New tables or larger layouts require a deliberate layout update; the script checks inventory coverage, column widths and table/page bounds. It is a local export utility, not a general DBML compiler or a migration source.

## Review the output

1. Confirm the printed table/column/reference/enum counts and source hash. The generator reopens the PDF and verifies extracted table-field/type, key/index/default metadata, FK and enum coverage.
2. Render every page with Poppler and inspect the PNGs for readability, alignment, connectors, overlap and clipping. Text extraction alone cannot establish visual quality. For example, run this after creating a temporary output directory:

   ```sh
   pdftoppm -r 75 -png docs/database/HireD_Phase_1_Database_ERD.pdf /tmp/hired-erd-review/page
   ```

3. Check all fields and FK targets against DBML, especially changed fields, composite/shared keys, uniqueness and optionality. R01-R56 follow source Ref order and are diagram navigation aids, not permanent schema identifiers. The overview draws selected core edges; the reference inventory contains every declared FK with its source operator, children-per-parent maximum and FK nullability.
4. Keep DBML/API/report contracts unchanged during a pure export. Update only notes about the PDF after successful coverage and visual review; remaining UI and design decisions stay open.

## Verified export: 10 October 2026

- Source SHA-256: `9edc751aac4291cf997067c9310c50671588b9d65100bb145e3dee10d7137043`.
- 25 tables, 283 columns, 56 declared foreign keys, 13 enum types; 8 landscape pages.
- Pages: core overview; identity/company; drivers/assets; orders/trips/dispatch; expenses/payroll/reports/wallet; statements/outbox/audit; complete FK inventory; enums/design boundaries.
- The order/trip estimate input, source, speed/policy evidence, override and timestamp fields are included and highlighted. Native types/precision, nullability, defaults, composite keys and declared indexes are preserved.
- Coverage and bounds checks passed; all pages were rendered and visually inspected. Text and fonts remain embedded/vector; the DBML was not changed.

Additional CHECKs, partial indexes, cross-row invariants and immutable-record/locking behavior remain in [indexing-strategy.md](indexing-strategy.md) and [database-design.md](database-design.md). The PDF does not infer their implementation or add unresolved replay, upload-context or aggregate-version tables. UI synchronization under [GAP-08](../requirements-traceability.md#4-integration-gaps) and DEC-32 calibration/provider policy remain pending.

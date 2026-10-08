# csv-quality

Inspect a CSV before you trust it. `csv-quality` reads the file, tells you how many rows and columns it holds, how many cells are blank, which rows repeat, and what each column looks like — then writes a CSV, JSON, or Markdown report you can save or send on.

No dependencies. Works in Node and in the browser. Ships a command-line tool.

## Install

The package has not been published to the npm registry yet. Download
`csv-quality-0.4.2.tgz` from the
[v0.4.2 release](https://github.com/vugarbbakhishov-hub/csv-quality/releases/tag/v0.4.2),
then install that verified package locally:

```bash
npm install ./csv-quality-0.4.2.tgz
```

The commands below use this locally installed package. Registry publication
is separate from the GitHub release.

## Use it as a library

```js
import { analyzeCsv, toCsvReport } from 'csv-quality'

const report = analyzeCsv(csvText)

report.rowCount            // 3
report.duplicateRowCount   // 1
report.completenessPercent // 89
report.columns[1]
// { name: 'score', type: 'number', filled: 2, empty: 1, unique: 1, fillRatePercent: 67 }

const csv = toCsvReport(report, { source: 'people.csv' })
```

## Use it from the command line

```bash
npx csv-quality people.csv
```

```
CSV quality report
Source,people.csv
Generated,2026-09-15T14:31:25.428Z
Delimiter,Comma
Data rows,3
Columns,4
Empty cells,2
Duplicate rows,1
Completeness (%),83

Column,Type,Filled,Empty,Unique,Fill rate (%)
name,text,3,0,2,100
team,text,3,0,2,100
score,number,1,2,1,33
joined,date,3,0,2,100
```

| Option | What it does |
| --- | --- |
| `--json` | Write the report as JSON instead of CSV |
| `--markdown` | Write a Markdown report for pull requests or CI summaries |
| `--out <file>` | Write to this file instead of standard output |
| `--save` | Write next to the input as `<name>-report.<ext>` |
| `--min-completeness <0-100>` | Exit with code `1` when overall completeness is below this percent |
| `--max-duplicate-rows <count>` | Exit with code `1` when duplicate rows exceed this count |
| `-h`, `--help` | Show usage |

Use the quality gate options in CI when an export should fail the job if too
many cells are blank or if duplicate rows are not allowed:

```bash
npx csv-quality people.csv \
  --json \
  --out quality-report.json \
  --min-completeness 95 \
  --max-duplicate-rows 0
```

The report is still written, so the failed job keeps the exact numbers that
explain why the CSV did not pass.

Send the Markdown report straight to a GitHub Actions job summary:

```bash
npx csv-quality people.csv --markdown >> "$GITHUB_STEP_SUMMARY"
```

### Piped input

Use `-` to read UTF-8 CSV from standard input (available since v0.4.0).
For a runnable example from a source checkout:

```bash
npm ci
npm run build
node examples/export-people.mjs | node dist/esm/bin.js - --markdown
```

Use `--out report.md` to save piped output. `--save` requires a file input
and is rejected with `-`. Reports label piped input as `stdin`. Input is
buffered in memory, just like file input; this is not a streaming parser.
Quality gates work with pipes and still write the report before returning a
failure exit code. An empty stream returns an error.

The repository's CI runs the sample export on Node 20, 22 and 24 and appends
the Markdown result to each GitHub Actions job summary:

```bash
node examples/export-people.mjs | node dist/esm/bin.js - --markdown --min-completeness 100 --max-duplicate-rows 0 >> "$GITHUB_STEP_SUMMARY"
```

## API

### `parseCsv(input, options?)`

Reads CSV text into `{ headers, rows, delimiter }`. Handles quoted delimiters, escaped quotes, line breaks inside quoted fields, CRLF line endings and a leading byte order mark. Short rows are padded; blank or repeated header names are made unique (`name`, `name 2`, `Column 3`).

Options: `delimiter` skips detection, `preserveWhitespace` keeps padding inside cells.

Throws `SyntaxError` on empty input or malformed quoting: an unclosed field,
a quote inside unquoted text, or non-whitespace text after a closing quote.
Spaces/tabs around quoted fields remain supported. Quote-position errors use
one-based JavaScript string offsets after removal of a leading BOM.

Since v0.4.0, explicit empty records such as `,` or `""` are
preserved and included in completeness and duplicate counts. Plain blank
lines are skipped. For example, `name,score\nAda,10\n,` has two data rows
and 50% completeness.

### `detectDelimiter(input)`

Returns `,`, `;`, `\t` or `|` — whichever appears most often outside quotes in the header. Falls back to a comma. Since v0.4.1, detection skips leading blank lines and reads the complete header record, including line breaks inside quoted column names.

### `analyzeCsv(input)` and `analyzeDataset(dataset)`

Return a `CsvQualityReport`:

| Field | Meaning |
| --- | --- |
| `rowCount`, `columnCount` | Data rows (header excluded) and columns |
| `emptyCellCount` | Blank cells across the table |
| `duplicateRowCount` | Rows that repeat an earlier row exactly; the first occurrence is not counted |
| `completenessPercent` | Filled cells as a whole percent; `100` for a header-only file |
| `columns[]` | Per column: `name`, `type`, `filled`, `empty`, `unique`, `fillRatePercent` |

`type` is one of `number`, `date`, `boolean`, `text` or `empty`, and is decided conservatively: every non-blank value in the column has to fit, otherwise the column is `text`.

Numbers use finite decimal or scientific notation. Leading-zero codes such as
`00123` and hexadecimal/binary/octal literals remain text. Date inference checks
the written calendar date (including leap years) before parsing optional time
information, so `2026-02-30` remains text. These labels never convert cell values.

### `toCsvReport(report, meta?)`, `toJsonReport(report, meta?)` and `toMarkdownReport(report, meta?)`

Render the report. The CSV form is a summary block, a blank line, then one row per column — it opens directly in a spreadsheet. The JSON form carries the same numbers in a nested shape and is easier to read from a script. The Markdown form includes a compact summary and a GitHub-flavored table for pull requests and CI job summaries. `meta` takes `source` and `generatedAt`.

### `reportFileName(source, 'csv' | 'json' | 'md')`

`people.csv` → `people-report.csv`. Strips characters that are awkward in file names.

## What it does not do

It reads a CSV and describes it. It does not fix, clean, or validate against a schema, and it does not stream — the input is a string held in memory, which is fine for the files people actually eyeball and wrong for multi-gigabyte exports.

Type inference is deliberately cautious. A column of `1`, `2`, `N/A` is `text`, not a number column with a bad value, because guessing the other way hides the problem you opened the file to find.

CSV reports prefix formula-like text cells with an apostrophe and quote them.
This covers leading `=`, `+`, `-`, `@` and full-width variants (also after
whitespace), plus leading tabs and line breaks. Numeric cells are unchanged.
Use JSON for exact metadata and column names without this prefix. Spreadsheet
import settings and saving/reopening CSV can affect the mitigation; it is not a
universal guarantee. See [OWASP CSV Injection](https://community.owasp.org/attacks/CSV_Injection).
The public `escapeCsvValue` helper only escapes CSV syntax; it does not add this
report-specific prefix. Markdown output is unchanged.

## Development

```bash
npm install
npm test
npm run typecheck
npm run build
```

## Contributing

Bug reports and focused improvements are welcome. Please read
[CONTRIBUTING.md](CONTRIBUTING.md) before opening an issue or pull request.

## License

[MIT](LICENSE)

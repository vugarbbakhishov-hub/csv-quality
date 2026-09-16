# csv-quality

Inspect a CSV before you trust it. `csv-quality` reads the file, tells you how many rows and columns it holds, how many cells are blank, which rows repeat, and what each column looks like — then writes that as a report you can save or send on.

No dependencies. Works in Node and in the browser. Ships a command-line tool.

## Install

The package has not been published to the npm registry yet. Download
`csv-quality-0.1.0.tgz` from the
[v0.1.0 release](https://github.com/vugarbbakhishov-hub/csv-quality/releases/tag/v0.1.0),
then install that verified package locally:

```bash
npm install ./csv-quality-0.1.0.tgz
```

The package name is currently available on npm. Registry publication will
follow after the maintainer account is authenticated and the packed artifact
has been reviewed there.

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
| `--out <file>` | Write to this file instead of standard output |
| `--save` | Write next to the input as `<name>-report.<ext>` |
| `-h`, `--help` | Show usage |

## API

### `parseCsv(input, options?)`

Reads CSV text into `{ headers, rows, delimiter }`. Handles quoted delimiters, escaped quotes, line breaks inside quoted fields, CRLF line endings and a leading byte order mark. Short rows are padded; blank or repeated header names are made unique (`name`, `name 2`, `Column 3`).

Options: `delimiter` skips detection, `preserveWhitespace` keeps padding inside cells.

Throws `SyntaxError` on empty input or an unclosed quoted field.

### `detectDelimiter(input)`

Returns `,`, `;`, `\t` or `|` — whichever appears most often in the first line outside quotes. Falls back to a comma.

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

### `toCsvReport(report, meta?)` and `toJsonReport(report, meta?)`

Render the report. The CSV form is a summary block, a blank line, then one row per column — it opens directly in a spreadsheet. The JSON form carries the same numbers in a nested shape and is easier to read from a script. `meta` takes `source` and `generatedAt`.

### `reportFileName(source, 'csv' | 'json')`

`people.csv` → `people-report.csv`. Strips characters that are awkward in file names.

## What it does not do

It reads a CSV and describes it. It does not fix, clean, or validate against a schema, and it does not stream — the input is a string held in memory, which is fine for the files people actually eyeball and wrong for multi-gigabyte exports.

Type inference is deliberately cautious. A column of `1`, `2`, `N/A` is `text`, not a number column with a bad value, because guessing the other way hides the problem you opened the file to find.

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

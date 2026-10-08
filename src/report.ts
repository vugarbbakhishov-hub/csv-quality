import type { CsvQualityReport } from './analyze.js'
import type { Delimiter } from './parse.js'

export interface ReportMeta {
  /** Name to record as the source, e.g. the file the CSV came from. */
  source?: string
  /** ISO timestamp to record. Defaults to the current time. */
  generatedAt?: string
}

const delimiterNames: Record<Delimiter, string> = {
  ',': 'Comma',
  ';': 'Semicolon',
  '\t': 'Tab',
  '|': 'Pipe',
}

/** Quotes a value only when CSV requires it. */
export function escapeCsvValue(value: string | number): string {
  const text = String(value)
  return /["\r\n,]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function toRow(values: Array<string | number>): string {
  return values.map((value) => {
    // Report-only policy: keep the public CSV syntax helper lossless.
    if (typeof value === 'string' && (/^[\t\r\n]/.test(value) || /^\s*[=+\-@＝＋－＠]/u.test(value))) {
      return `"'${value.replace(/"/g, '""')}"`
    }
    return escapeCsvValue(value)
  }).join(',')
}

function resolve(meta: ReportMeta) {
  return {
    source: meta.source ?? 'input.csv',
    generatedAt: meta.generatedAt ?? new Date().toISOString(),
  }
}

/**
 * Renders the report as CSV: a summary block, a blank line, then one row per
 * column. Opens directly in a spreadsheet.
 */
export function toCsvReport(report: CsvQualityReport, meta: ReportMeta = {}): string {
  const { source, generatedAt } = resolve(meta)

  const summary: Array<Array<string | number>> = [
    ['CSV quality report'],
    ['Source', source],
    ['Generated', generatedAt],
    ['Delimiter', delimiterNames[report.delimiter]],
    ['Data rows', report.rowCount],
    ['Columns', report.columnCount],
    ['Empty cells', report.emptyCellCount],
    ['Duplicate rows', report.duplicateRowCount],
    ['Completeness (%)', report.completenessPercent],
  ]

  const profile: Array<Array<string | number>> = [
    ['Column', 'Type', 'Filled', 'Empty', 'Unique', 'Fill rate (%)'],
    ...report.columns.map((column) => [
      column.name,
      column.type,
      column.filled,
      column.empty,
      column.unique,
      column.fillRatePercent,
    ]),
  ]

  return [...summary.map(toRow), '', ...profile.map(toRow)].join('\n')
}

/** Renders the report as pretty-printed JSON, ending with a newline. */
export function toJsonReport(report: CsvQualityReport, meta: ReportMeta = {}): string {
  const { source, generatedAt } = resolve(meta)

  return `${JSON.stringify(
    {
      tool: 'csv-quality',
      source,
      generatedAt,
      delimiter: delimiterNames[report.delimiter],
      summary: {
        rowCount: report.rowCount,
        columnCount: report.columnCount,
        emptyCellCount: report.emptyCellCount,
        duplicateRowCount: report.duplicateRowCount,
        completenessPercent: report.completenessPercent,
      },
      columns: report.columns,
    },
    null,
    2,
  )}\n`
}

/** Escapes text that could change a Markdown table cell or inline value. */
export function escapeMarkdownValue(value: string | number): string {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, ' ')
    .replace(/\|/g, '\\|')
    .replace(/([*_`\[\]<>])/g, '\\$1')
}

/** Renders a GitHub-flavored Markdown summary and column profile. */
export function toMarkdownReport(report: CsvQualityReport, meta: ReportMeta = {}): string {
  const { source, generatedAt } = resolve(meta)

  const columns = report.columns.map(
    (column) =>
      `| ${escapeMarkdownValue(column.name)} | ${column.type} | ${column.filled} | ${column.empty} | ${column.unique} | ${column.fillRatePercent}% |`,
  )

  return [
    '# CSV quality report',
    '',
    `- **Source:** ${escapeMarkdownValue(source)}`,
    `- **Generated:** ${generatedAt}`,
    `- **Delimiter:** ${delimiterNames[report.delimiter]}`,
    `- **Data rows:** ${report.rowCount}`,
    `- **Columns:** ${report.columnCount}`,
    `- **Empty cells:** ${report.emptyCellCount}`,
    `- **Duplicate rows:** ${report.duplicateRowCount}`,
    `- **Completeness:** ${report.completenessPercent}%`,
    '',
    '## Columns',
    '',
    '| Column | Type | Filled | Empty | Unique | Fill rate |',
    '| --- | --- | ---: | ---: | ---: | ---: |',
    ...columns,
    '',
  ].join('\n')
}

/** Turns a source file name into a safe report file name. */
export function reportFileName(source: string, extension: 'csv' | 'json' | 'md'): string {
  const base = source.replace(/\.[^./\\]+$/, '')
  const safe = base.replace(/[^\w.-]+/g, '-').replace(/^[-.]+|[-.]+$/g, '')
  return `${safe || 'csv'}-report.${extension}`
}

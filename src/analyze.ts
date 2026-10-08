import { parseCsv, type CsvDataset } from './parse.js'

export type ColumnType = 'number' | 'date' | 'boolean' | 'text' | 'empty'

export interface ColumnProfile {
  name: string
  type: ColumnType
  /** Cells that hold a value. */
  filled: number
  /** Cells that are blank. */
  empty: number
  /** Distinct non-blank values. */
  unique: number
  /** filled / rowCount, rounded to a whole percent. 0 when there are no rows. */
  fillRatePercent: number
}

export interface CsvQualityReport {
  rowCount: number
  columnCount: number
  emptyCellCount: number
  /** Rows that repeat an earlier row exactly. The first occurrence is not counted. */
  duplicateRowCount: number
  /** Filled cells as a whole percent of all cells. 100 for an empty table. */
  completenessPercent: number
  delimiter: CsvDataset['delimiter']
  columns: ColumnProfile[]
}

const booleanPattern = /^(true|false|yes|no)$/i
const numberPattern = /^[+-]?(?:(?:0|[1-9]\d*)(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/

function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  // Check the written date before Date.parse can normalize an impossible day.
  return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1]!
    && !Number.isNaN(Date.parse(value))
}

function inferType(values: string[]): ColumnType {
  const populated = values.filter(Boolean)
  if (populated.length === 0) return 'empty'
  if (populated.every((value) => numberPattern.test(value) && Number.isFinite(Number(value)))) {
    return 'number'
  }
  if (populated.every((value) => booleanPattern.test(value))) return 'boolean'
  if (populated.every(isCalendarDate)) {
    return 'date'
  }
  return 'text'
}

function percent(part: number, whole: number, emptyResult: number): number {
  if (whole === 0) return emptyResult
  return Math.round((part / whole) * 100)
}

/**
 * Describes the shape and completeness of a parsed dataset: row and column
 * counts, blank cells, exact duplicate rows, and a profile per column.
 */
export function analyzeDataset(dataset: CsvDataset): CsvQualityReport {
  const rowCount = dataset.rows.length
  const totalCells = rowCount * dataset.headers.length

  let emptyCellCount = 0
  for (const row of dataset.rows) {
    for (const cell of row) if (cell === '') emptyCellCount += 1
  }

  const seen = new Set<string>()
  let duplicateRowCount = 0
  for (const row of dataset.rows) {
    const key = JSON.stringify(row)
    if (seen.has(key)) duplicateRowCount += 1
    else seen.add(key)
  }

  const columns = dataset.headers.map((name, index) => {
    const values = dataset.rows.map((row) => row[index] ?? '')
    const populated = values.filter(Boolean)

    return {
      name,
      type: inferType(values),
      filled: populated.length,
      empty: rowCount - populated.length,
      unique: new Set(populated).size,
      fillRatePercent: percent(populated.length, rowCount, 0),
    }
  })

  return {
    rowCount,
    columnCount: dataset.headers.length,
    emptyCellCount,
    duplicateRowCount,
    completenessPercent: percent(totalCells - emptyCellCount, totalCells, 100),
    delimiter: dataset.delimiter,
    columns,
  }
}

/** Parses CSV text and analyzes it in one call. */
export function analyzeCsv(input: string): CsvQualityReport {
  return analyzeDataset(parseCsv(input))
}

export type Delimiter = ',' | ';' | '\t' | '|'

export interface CsvDataset {
  /** Column names, in file order. Blank or repeated names are made unique. */
  headers: string[]
  /** Data rows, padded so every row has one cell per header. */
  rows: string[][]
  /** The delimiter the file was read with. */
  delimiter: Delimiter
}

export interface ParseOptions {
  /** Skip detection and read the file with this delimiter. */
  delimiter?: Delimiter
  /** Keep surrounding whitespace in every cell. Defaults to false. */
  preserveWhitespace?: boolean
}

const candidates: readonly Delimiter[] = [',', ';', '\t', '|']

function countOutsideQuotes(line: string, delimiter: string): number {
  let count = 0
  let inQuotes = false

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]

    if (character === '"') {
      if (inQuotes && line[index + 1] === '"') index += 1
      else inQuotes = !inQuotes
    } else if (character === delimiter && !inQuotes) {
      count += 1
    }
  }

  return count
}

/**
 * Picks the delimiter that appears most often in the first line, ignoring
 * anything inside quotes. Falls back to a comma when nothing appears.
 */
export function detectDelimiter(input: string): Delimiter {
  const firstLine = input.replace(/^﻿/, '').split(/\r?\n/, 1)[0] ?? ''

  let best: Delimiter = ','
  let bestCount = 0

  for (const candidate of candidates) {
    const count = countOutsideQuotes(firstLine, candidate)
    if (count > bestCount) {
      best = candidate
      bestCount = count
    }
  }

  return best
}

function readRows(input: string, delimiter: Delimiter, preserveWhitespace: boolean): string[][] {
  const source = input.replace(/^﻿/, '')
  const rows: string[][] = []
  const finish = (value: string) => (preserveWhitespace ? value : value.trim())

  let row: string[] = []
  let cell = ''
  let inQuotes = false
  let hasRecordSyntax = false

  const pushRow = () => {
    row.push(finish(cell))
    // Delimiters and quotes describe cells even when every value is empty.
    if (hasRecordSyntax || row.some((value) => value.length > 0)) rows.push(row)
    row = []
    cell = ''
    hasRecordSyntax = false
  }

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]

    if (character === '"') {
      hasRecordSyntax = true
      if (inQuotes && source[index + 1] === '"') {
        cell += '"'
        index += 1
      } else {
        inQuotes = !inQuotes
      }
    } else if (character === delimiter && !inQuotes) {
      hasRecordSyntax = true
      row.push(finish(cell))
      cell = ''
    } else if ((character === '\n' || character === '\r') && !inQuotes) {
      if (character === '\r' && source[index + 1] === '\n') index += 1
      pushRow()
    } else {
      cell += character
    }
  }

  pushRow()

  if (inQuotes) throw new SyntaxError('The CSV ends inside a quoted field.')
  return rows
}

function uniqueHeader(name: string, index: number, used: Set<string>): string {
  const base = name.trim() || `Column ${index + 1}`
  let next = base
  let suffix = 2

  while (used.has(next.toLowerCase())) {
    next = `${base} ${suffix}`
    suffix += 1
  }

  used.add(next.toLowerCase())
  return next
}

/**
 * Reads CSV text into headers and rows. Handles quoted delimiters, escaped
 * quotes, line breaks inside quoted fields, CRLF, and a leading BOM.
 *
 * @throws {SyntaxError} when the input is empty or a quoted field is unclosed.
 */
export function parseCsv(input: string, options: ParseOptions = {}): CsvDataset {
  if (!input.trim()) throw new SyntaxError('The CSV input is empty.')

  const delimiter = options.delimiter ?? detectDelimiter(input)
  const parsed = readRows(input, delimiter, options.preserveWhitespace ?? false)
  if (parsed.length === 0) throw new SyntaxError('The CSV contains no rows.')

  const width = Math.max(...parsed.map((row) => row.length))
  const used = new Set<string>()
  const headers = Array.from({ length: width }, (_, index) =>
    uniqueHeader(parsed[0]?.[index] ?? '', index, used),
  )
  const rows = parsed
    .slice(1)
    .map((row) => Array.from({ length: width }, (_, index) => row[index] ?? ''))

  return { headers, rows, delimiter }
}

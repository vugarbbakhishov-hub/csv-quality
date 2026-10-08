import { describe, expect, it } from 'vitest'
import { analyzeCsv, analyzeDataset } from './analyze.js'
import { parseCsv } from './parse.js'

describe('analyzeCsv', () => {
  it.each(['00123', '-00123', '0x10', '0b10', '0o10', '2026-02-30', '1900-02-29', '2026-04-31', '2026-02-30T12:00:00Z'])('keeps misleading numeric/date value %s as text', (value) => {
    const dataset = parseCsv(`value\n${value}\n""`)
    expect(analyzeDataset(dataset).columns[0]?.type).toBe('text')
    expect(dataset.rows[0]?.[0]).toBe(value)
  })

  it.each(['2000-02-29', '2024-02-29', '2026-01-01T00:30:00+04:00'])('recognizes valid calendar date %s', (value) => {
    expect(analyzeCsv(`date\n${value}\n""`).columns[0]?.type).toBe('date')
  })

  it('accepts decimal and scientific notation with blank cells', () => {
    expect(analyzeCsv('number\n0\n-0\n+12\n0.5\n-.5\n12.\n1e3\n-2.5E-2\n""').columns[0]?.type).toBe('number')
  })

  it('counts rows, blanks and exact duplicates', () => {
    const report = analyzeCsv(
      'name,score,active,joined\nAda,10,true,2026-01-02\nAda,10,true,2026-01-02\nLinus,,false,2026-04-03',
    )

    expect(report.rowCount).toBe(3)
    expect(report.columnCount).toBe(4)
    expect(report.emptyCellCount).toBe(1)
    expect(report.duplicateRowCount).toBe(1)
    expect(report.completenessPercent).toBe(92)
  })

  it('counts a row repeated three times as two duplicates', () => {
    expect(analyzeCsv('a\n1\n1\n1').duplicateRowCount).toBe(2)
  })

  it('profiles each column separately', () => {
    const report = analyzeCsv('name,score,active,joined\nAda,10,true,2026-01-02\nLinus,,false,2026-04-03')

    expect(report.columns.map((column) => column.type)).toEqual([
      'text',
      'number',
      'boolean',
      'date',
    ])
    expect(report.columns[1]).toEqual({
      name: 'score',
      type: 'number',
      filled: 1,
      empty: 1,
      unique: 1,
      fillRatePercent: 50,
    })
  })

  it('marks a column with no values at all as empty', () => {
    expect(analyzeCsv('a,b\n1,\n2,').columns[1]?.type).toBe('empty')
  })

  it('does not read a blank-looking value as the number zero', () => {
    // Number(' ') is 0 in JavaScript, which would mistype a padded text column.
    const dataset = parseCsv('a\n" "\nx', { preserveWhitespace: true })
    expect(analyzeDataset(dataset).columns[0]?.type).toBe('text')
  })

  it('reports full completeness for a header-only file', () => {
    const report = analyzeCsv('a,b,c')

    expect(report.rowCount).toBe(0)
    expect(report.completenessPercent).toBe(100)
    expect(report.columns[0]?.fillRatePercent).toBe(0)
  })
})

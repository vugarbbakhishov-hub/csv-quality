import { describe, expect, it } from 'vitest'
import { analyzeCsv } from './analyze.js'
import {
  escapeCsvValue,
  escapeMarkdownValue,
  reportFileName,
  toCsvReport,
  toJsonReport,
  toMarkdownReport,
} from './report.js'

const report = analyzeCsv('name,score,active\nAda,10,true\nAda,10,true\nLinus,,false')
const meta = { source: 'people.csv', generatedAt: '2026-09-15T08:00:00.000Z' }

describe('toCsvReport', () => {
  it('writes a summary block, a blank line, then the column profile', () => {
    const lines = toCsvReport(report, meta).split('\n')
    const blank = lines.indexOf('')

    expect(lines[0]).toBe('CSV quality report')
    expect(lines.slice(1, blank)).toEqual([
      'Source,people.csv',
      'Generated,2026-09-15T08:00:00.000Z',
      'Delimiter,Comma',
      'Data rows,3',
      'Columns,3',
      'Empty cells,1',
      'Duplicate rows,1',
      'Completeness (%),89',
    ])
    expect(lines[blank + 1]).toBe('Column,Type,Filled,Empty,Unique,Fill rate (%)')
    expect(lines).toContain('score,number,2,1,1,67')
  })

  it('quotes column names containing a comma or a quote', () => {
    const tricky = analyzeCsv('"score, total","he said ""hi"""\n10,yes')

    expect(toCsvReport(tricky, meta).split('\n')).toContain('"score, total",number,1,0,1,100')
    expect(escapeCsvValue('he said "hi"')).toBe('"he said ""hi"""')
  })

  it('names the delimiter in words', () => {
    expect(toCsvReport(analyzeCsv('a|b\n1|2'), meta)).toContain('Delimiter,Pipe')
  })
})

describe('toJsonReport', () => {
  it('produces valid JSON with the same numbers', () => {
    const parsed = JSON.parse(toJsonReport(report, meta))

    expect(parsed.source).toBe('people.csv')
    expect(parsed.generatedAt).toBe('2026-09-15T08:00:00.000Z')
    expect(parsed.summary).toEqual({
      rowCount: 3,
      columnCount: 3,
      emptyCellCount: 1,
      duplicateRowCount: 1,
      completenessPercent: 89,
    })
    expect(parsed.columns).toHaveLength(3)
  })

  it('defaults the source and timestamp when none are given', () => {
    const parsed = JSON.parse(toJsonReport(report))

    expect(parsed.source).toBe('input.csv')
    expect(Number.isNaN(Date.parse(parsed.generatedAt))).toBe(false)
  })
})

describe('toMarkdownReport', () => {
  it('writes a summary and a GitHub-flavored column table', () => {
    const markdown = toMarkdownReport(report, meta)

    expect(markdown).toContain('# CSV quality report')
    expect(markdown).toContain('- **Source:** people.csv')
    expect(markdown).toContain('- **Completeness:** 89%')
    expect(markdown).toContain('| Column | Type | Filled | Empty | Unique | Fill rate |')
    expect(markdown).toContain('| score | number | 2 | 1 | 1 | 67% |')
    expect(markdown.endsWith('\n')).toBe(true)
  })

  it('keeps special column names inside one table cell', () => {
    const tricky = analyzeCsv('"team|name",score\nCore,10')

    expect(toMarkdownReport(tricky, meta)).toContain(
      '| team\\|name | text | 1 | 0 | 1 | 100% |',
    )
    expect(escapeMarkdownValue('line 1\nline 2')).toBe('line 1 line 2')
  })
})

describe('reportFileName', () => {
  it('reuses the source name and drops unsafe characters', () => {
    expect(reportFileName('people.csv', 'csv')).toBe('people-report.csv')
    expect(reportFileName('Q3 sales (final).csv', 'json')).toBe('Q3-sales-final-report.json')
    expect(reportFileName('people.csv', 'md')).toBe('people-report.md')
    expect(reportFileName('   ', 'json')).toBe('csv-report.json')
  })
})

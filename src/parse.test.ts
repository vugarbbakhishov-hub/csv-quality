import { describe, expect, it } from 'vitest'
import { detectDelimiter, parseCsv } from './parse.js'

describe('detectDelimiter', () => {
  it('recognises the four common separators', () => {
    expect(detectDelimiter('name,score\nAda,10')).toBe(',')
    expect(detectDelimiter('name;score\nAda;10')).toBe(';')
    expect(detectDelimiter('name\tscore\nAda\t10')).toBe('\t')
    expect(detectDelimiter('name|score\nAda|10')).toBe('|')
  })

  it('ignores separators inside quotes', () => {
    expect(detectDelimiter('"last, first";score\n"Lovelace, Ada";10')).toBe(';')
  })

  it('falls back to a comma for a single column', () => {
    expect(detectDelimiter('name\nAda')).toBe(',')
  })
})

describe('parseCsv', () => {
  it('handles quoted delimiters, escaped quotes and CRLF', () => {
    const dataset = parseCsv('name,note\r\nAda,"Hello, ""CSV"""\r\nLinus,Simple')

    expect(dataset.headers).toEqual(['name', 'note'])
    expect(dataset.rows).toEqual([
      ['Ada', 'Hello, "CSV"'],
      ['Linus', 'Simple'],
    ])
  })

  it('keeps line breaks inside quoted fields', () => {
    expect(parseCsv('name,note\nAda,"line one\nline two"').rows[0]).toEqual([
      'Ada',
      'line one\nline two',
    ])
  })

  it('strips a leading byte order mark from the first header', () => {
    expect(parseCsv('﻿name,score\nAda,10').headers).toEqual(['name', 'score'])
  })

  it('pads short rows and makes blank or repeated headers unique', () => {
    const dataset = parseCsv('name,name,\nAda,37')

    expect(dataset.headers).toEqual(['name', 'name 2', 'Column 3'])
    expect(dataset.rows[0]).toEqual(['Ada', '37', ''])
  })

  it('honours an explicit delimiter over detection', () => {
    const dataset = parseCsv('a;b,c\n1;2,3', { delimiter: ';' })

    expect(dataset.headers).toEqual(['a', 'b,c'])
    expect(dataset.delimiter).toBe(';')
  })

  it('can keep surrounding whitespace', () => {
    expect(parseCsv('name, note\nAda,  padded ').rows[0]).toEqual(['Ada', 'padded'])
    expect(
      parseCsv('name, note\nAda,  padded ', { preserveWhitespace: true }).rows[0],
    ).toEqual(['Ada', '  padded '])
  })

  it('rejects empty input and unclosed quotes', () => {
    expect(() => parseCsv('   ')).toThrow(SyntaxError)
    expect(() => parseCsv('name,note\nAda,"unfinished')).toThrow('inside a quoted field')
  })

  it.each([',', ';', '\t', '|'] as const)('keeps explicit empty records with %s separators', (delimiter) => {
    const dataset = parseCsv(`name${delimiter}score\nAda${delimiter}10\n${delimiter}\n`)
    expect(dataset.rows).toEqual([['Ada', '10'], ['', '']])
  })

  it('retains quoted empty single-column records while ignoring blank lines', () => {
    expect(parseCsv('name\r\n\r\n""\r\n   \r\nAda\r\n').rows).toEqual([[''], ['Ada']])
  })

  it('keeps an all-empty header instead of promoting the first data row', () => {
    const dataset = parseCsv(',\nAda,10\n')
    expect(dataset.headers).toEqual(['Column 1', 'Column 2'])
    expect(dataset.rows).toEqual([['Ada', '10']])
  })
})

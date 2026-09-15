import { describe, expect, it } from 'vitest'
import { parseArgs } from './cli.js'

describe('parseArgs', () => {
  it('reads the file name and flags in any order', () => {
    expect(parseArgs(['data.csv', '--json'])).toEqual({
      file: 'data.csv',
      json: true,
      save: false,
      help: false,
    })
    expect(parseArgs(['--save', 'data.csv']).save).toBe(true)
    expect(parseArgs(['-h']).help).toBe(true)
  })

  it('reads the value after --out', () => {
    expect(parseArgs(['data.csv', '--out', 'report.csv']).out).toBe('report.csv')
  })

  it('rejects a missing --out value, unknown flags and a second file', () => {
    expect(() => parseArgs(['data.csv', '--out'])).toThrow('--out needs a file name')
    expect(() => parseArgs(['--nope'])).toThrow('Unknown option: --nope')
    expect(() => parseArgs(['a.csv', 'b.csv'])).toThrow('Only one input file')
  })
})

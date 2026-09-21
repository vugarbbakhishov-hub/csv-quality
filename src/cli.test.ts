import { describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseArgs, run, savedReportPath } from './cli.js'

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

  it('reads the minimum completeness threshold', () => {
    expect(parseArgs(['data.csv', '--min-completeness', '95']).minCompleteness).toBe(95)
    expect(parseArgs(['data.csv', '--min-completeness', '82.5']).minCompleteness).toBe(82.5)
  })

  it('rejects a missing --out value, unknown flags and a second file', () => {
    expect(() => parseArgs(['data.csv', '--out'])).toThrow('--out needs a file name')
    expect(() => parseArgs(['--nope'])).toThrow('Unknown option: --nope')
    expect(() => parseArgs(['a.csv', 'b.csv'])).toThrow('Only one input file')
  })

  it('rejects an invalid minimum completeness threshold', () => {
    expect(() => parseArgs(['data.csv', '--min-completeness'])).toThrow(
      '--min-completeness needs a percent',
    )
    expect(() => parseArgs(['data.csv', '--min-completeness', '101'])).toThrow(
      '--min-completeness must be a number',
    )
    expect(() => parseArgs(['data.csv', '--min-completeness', 'bad'])).toThrow(
      '--min-completeness must be a number',
    )
  })
})

describe('savedReportPath', () => {
  it('writes the report beside the input file', () => {
    expect(savedReportPath(join('exports', 'people.csv'), 'json')).toBe(
      join('exports', 'people-report.json'),
    )
  })
})

describe('run', () => {
  it('returns a failing exit code when completeness is below the threshold', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'csv-quality-'))
    const source = join(directory, 'people.csv')
    const target = join(directory, 'report.json')

    await writeFile(source, 'name,score\nAda,10\nLinus,\n')

    const exitCode = await run([source, '--json', '--out', target, '--min-completeness', '90'])
    const savedReport = JSON.parse(await readFile(target, 'utf8')) as {
      summary: { completenessPercent: number }
    }

    await rm(directory, { recursive: true, force: true })

    expect(exitCode).toBe(1)
    expect(savedReport.summary.completenessPercent).toBe(75)
  })

  it('passes when completeness meets the threshold', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'csv-quality-'))
    const source = join(directory, 'people.csv')

    await writeFile(source, 'name,score\nAda,10\n')

    const exitCode = await run([source, '--min-completeness', '100'])

    await rm(directory, { recursive: true, force: true })

    expect(exitCode).toBe(0)
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { Readable } from 'node:stream'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseArgs, run, savedReportPath } from './cli.js'

afterEach(() => vi.restoreAllMocks())

it.each([
  [199, 200, '100', 1],
  [159, 200, '80', 1],
  [159, 200, '79.5', 0],
  [2, 3, '66.8', 1],
  [2, 3, '66.5', 0],
  [0, 0, '100', 0],
] as const)('checks unrounded completeness for %i/%i at %s%%', async (filled, total, threshold, exitCode) => {
  const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true)
  const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
  const csv = 'value\n' + Array.from({ length: total }, (_, i) => i < filled ? String(i + 1) : '""').join('\n')
  expect(await run(['-', '--json', '--min-completeness', threshold], Readable.from([csv]))).toBe(exitCode)
  expect(JSON.parse(stdout.mock.calls.map(([chunk]) => String(chunk)).join('')).summary.rowCount).toBe(total)
  if (exitCode === 1) expect(stderr.mock.calls.flat().join('')).toContain('below required')
  else expect(stderr).not.toHaveBeenCalled()
})

describe('parseArgs', () => {
  it('reads the file name and flags in any order', () => {
    expect(parseArgs(['data.csv', '--json'])).toEqual({
      file: 'data.csv',
      json: true,
      markdown: false,
      save: false,
      help: false,
    })
    expect(parseArgs(['--save', 'data.csv']).save).toBe(true)
    expect(parseArgs(['-h']).help).toBe(true)
  })

  it('reads the value after --out', () => {
    expect(parseArgs(['data.csv', '--out', 'report.csv']).out).toBe('report.csv')
  })

  it('accepts an explicit stdin input but refuses an implicit save location', () => {
    expect(parseArgs(['-', '--markdown']).file).toBe('-')
    expect(() => parseArgs(['-', '--save'])).toThrow('--save requires an input file')
    expect(() => parseArgs(['-', 'people.csv'])).toThrow('Only one input file')
  })

  it('selects Markdown output and rejects two output formats', () => {
    expect(parseArgs(['data.csv', '--markdown']).markdown).toBe(true)
    expect(() => parseArgs(['data.csv', '--json', '--markdown'])).toThrow(
      'Choose either --json or --markdown, not both.',
    )
  })

  it('reads the minimum completeness threshold', () => {
    expect(parseArgs(['data.csv', '--min-completeness', '95']).minCompleteness).toBe(95)
    expect(parseArgs(['data.csv', '--min-completeness', '82.5']).minCompleteness).toBe(82.5)
  })

  it('reads the maximum duplicate row threshold', () => {
    expect(parseArgs(['data.csv', '--max-duplicate-rows', '0']).maxDuplicateRows).toBe(0)
    expect(parseArgs(['data.csv', '--max-duplicate-rows', '3']).maxDuplicateRows).toBe(3)
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

  it('rejects an invalid maximum duplicate row threshold', () => {
    expect(() => parseArgs(['data.csv', '--max-duplicate-rows'])).toThrow(
      '--max-duplicate-rows needs a non-negative whole number',
    )
    expect(() => parseArgs(['data.csv', '--max-duplicate-rows', '-1'])).toThrow(
      '--max-duplicate-rows must be a non-negative whole number',
    )
    expect(() => parseArgs(['data.csv', '--max-duplicate-rows', '1.5'])).toThrow(
      '--max-duplicate-rows must be a non-negative whole number',
    )
  })
})

describe('savedReportPath', () => {
  it('writes the report beside the input file', () => {
    expect(savedReportPath(join('exports', 'people.csv'), 'json')).toBe(
      join('exports', 'people-report.json'),
    )
    expect(savedReportPath(join('exports', 'people.csv'), 'md')).toBe(
      join('exports', 'people-report.md'),
    )
  })
})

describe('run', () => {
  it('fails a completeness gate when an explicit empty record is present', async () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true)
    vi.spyOn(process.stderr, 'write').mockReturnValue(true)
    const input = Readable.from(['name,score\nAda,10\n,\n,\n'])

    expect(await run(['-', '--json', '--min-completeness', '90'], input)).toBe(1)
    const report = JSON.parse(stdout.mock.calls.map(([chunk]) => String(chunk)).join(''))
    expect(report.summary).toMatchObject({
      rowCount: 3, emptyCellCount: 4, duplicateRowCount: 1, completenessPercent: 33,
    })
  })

  it('reads a UTF-8 character split across stdin chunks', async () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true)
    const bytes = Buffer.from('şəhər,score\nBakı,10\n')
    const input = Readable.from([bytes.subarray(0, 1), bytes.subarray(1)])

    expect(await run(['-', '--json'], input)).toBe(0)
    const report = JSON.parse(stdout.mock.calls.map(([chunk]) => String(chunk)).join(''))
    expect(report.source).toBe('stdin')
    expect(report.summary.rowCount).toBe(1)
    expect(report.columns[0].name).toBe('şəhər')
  })

  it('writes the stdin report even when a quality gate fails', async () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true)
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
    const input = Readable.from(['name,score\nAda,10\nLinus,\n'])

    expect(await run(['-', '--markdown', '--min-completeness', '90'], input)).toBe(1)
    expect(stdout.mock.calls.map(([chunk]) => String(chunk)).join('')).toContain(
      '**Completeness:** 75%',
    )
    expect(stderr).toHaveBeenCalledWith('Completeness 75% is below required 90%.\n')
  })

  it('reports an empty stdin as an error', async () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true)
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true)

    expect(await run(['-'], Readable.from([]))).toBe(1)
    expect(stdout).not.toHaveBeenCalled()
    expect(stderr).toHaveBeenCalled()
  })

  it('reports stdin read failures instead of throwing', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
    const input = new Readable({ read() { this.destroy(new Error('Input stream failed')) } })

    expect(await run(['-'], input)).toBe(1)
    expect(stderr).toHaveBeenCalledWith('Input stream failed\n')
  })

  it('writes stdin to an explicit output path', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'csv-quality-'))
    try {
      const target = join(directory, 'summary.md')
      const input = Readable.from(['name,score\nAda,10\n'])
      expect(await run(['-', '--markdown', '--out', target], input)).toBe(0)
      expect(await readFile(target, 'utf8')).toContain('- **Source:** stdin')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('writes a Markdown report to a chosen file', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'csv-quality-'))
    const source = join(directory, 'people.csv')
    const target = join(directory, 'summary.md')

    await writeFile(source, 'name,score\nAda,10\nLinus,\n')

    const exitCode = await run([source, '--markdown', '--out', target])
    const savedReport = await readFile(target, 'utf8')

    await rm(directory, { recursive: true, force: true })

    expect(exitCode).toBe(0)
    expect(savedReport).toContain('# CSV quality report')
    expect(savedReport).toContain('| score | number | 1 | 1 | 1 | 50% |')
  })

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

  it('returns a failing exit code when duplicate rows exceed the threshold', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'csv-quality-'))
    const source = join(directory, 'people.csv')
    const target = join(directory, 'report.json')

    await writeFile(source, 'name,score\nAda,10\nAda,10\nLinus,11\n')

    const exitCode = await run([source, '--json', '--out', target, '--max-duplicate-rows', '0'])
    const savedReport = JSON.parse(await readFile(target, 'utf8')) as {
      summary: { duplicateRowCount: number }
    }

    await rm(directory, { recursive: true, force: true })

    expect(exitCode).toBe(1)
    expect(savedReport.summary.duplicateRowCount).toBe(1)
  })
})

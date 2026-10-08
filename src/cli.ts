import { readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { Readable } from 'node:stream'
import { analyzeCsv } from './analyze.js'
import { reportFileName, toCsvReport, toJsonReport, toMarkdownReport } from './report.js'

const usage = `csv-quality — inspect a CSV before you trust it

Usage:
  csv-quality <file.csv> [options]
  csv-quality - [options]          Read CSV from standard input

Options:
  --json           Write the report as JSON instead of CSV
  --markdown       Write a Markdown report for pull requests or CI summaries
  --out <file>     Write to this file instead of standard output
  --save           Write next to the input as <name>-report.<ext>
  --min-completeness <0-100>
                   Exit with code 1 when completeness is below this percent
  --max-duplicate-rows <count>
                   Exit with code 1 when duplicate rows exceed this count
  -h, --help       Show this message
`

interface Args {
  file?: string
  json: boolean
  markdown: boolean
  out?: string
  save: boolean
  minCompleteness?: number
  maxDuplicateRows?: number
  help: boolean
}

export function parseArgs(argv: string[]): Args {
  const args: Args = { json: false, markdown: false, save: false, help: false }

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]

    if (value === '--json') args.json = true
    else if (value === '--markdown') args.markdown = true
    else if (value === '--save') args.save = true
    else if (value === '-h' || value === '--help') args.help = true
    else if (value === '--min-completeness') {
      index += 1
      args.minCompleteness = parseMinCompleteness(argv[index])
    }
    else if (value === '--max-duplicate-rows') {
      index += 1
      args.maxDuplicateRows = parseMaxDuplicateRows(argv[index])
    }
    else if (value === '--out') {
      index += 1
      args.out = argv[index]
      if (!args.out) throw new Error('--out needs a file name.')
    } else if (value !== '-' && value.startsWith('-')) {
      throw new Error(`Unknown option: ${value}`)
    } else if (!args.file) {
      args.file = value
    } else {
      throw new Error('Only one input file is supported.')
    }
  }

  if (args.json && args.markdown) {
    throw new Error('Choose either --json or --markdown, not both.')
  }

  if (args.file === '-' && args.save) {
    throw new Error('--save requires an input file. Use --out for standard input.')
  }

  return args
}

function parseMinCompleteness(value: string | undefined): number {
  if (!value || value.trim() === '') {
    throw new Error('--min-completeness needs a percent from 0 to 100.')
  }

  const percent = Number(value)
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw new Error('--min-completeness must be a number from 0 to 100.')
  }

  return percent
}

function parseMaxDuplicateRows(value: string | undefined): number {
  if (!value || value.trim() === '') {
    throw new Error('--max-duplicate-rows needs a non-negative whole number.')
  }

  const count = Number(value)
  if (!Number.isInteger(count) || count < 0) {
    throw new Error('--max-duplicate-rows must be a non-negative whole number.')
  }

  return count
}

/** Places a saved report beside its source file. */
export function savedReportPath(sourcePath: string, extension: 'csv' | 'json' | 'md'): string {
  return join(dirname(sourcePath), reportFileName(basename(sourcePath), extension))
}

async function readStandardInput(input: Readable): Promise<string> {
  input.setEncoding('utf8')
  let text = ''
  for await (const chunk of input) text += chunk
  return text
}

export async function run(argv: string[], input: Readable = process.stdin): Promise<number> {
  let args: Args

  try {
    args = parseArgs(argv)
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n\n${usage}`)
    return 2
  }

  if (args.help || !args.file) {
    process.stdout.write(usage)
    return args.file || args.help ? 0 : 2
  }

  try {
    const source = args.file === '-' ? 'stdin' : basename(args.file)
    const csv = args.file === '-'
      ? await readStandardInput(input)
      : await readFile(args.file, 'utf8')
    const report = analyzeCsv(csv)
    const extension = args.json ? 'json' : args.markdown ? 'md' : 'csv'
    const body = args.json
      ? toJsonReport(report, { source })
      : args.markdown
        ? toMarkdownReport(report, { source })
        : toCsvReport(report, { source })
    const target = args.out ?? (args.save ? savedReportPath(args.file, extension) : undefined)

    if (target) {
      await writeFile(target, body)
      process.stdout.write(`Wrote ${target}\n`)
    } else {
      process.stdout.write(body.endsWith('\n') ? body : `${body}\n`)
    }

    const failures: string[] = []
    const totalCells = report.rowCount * report.columnCount
    const filledCells = totalCells - report.emptyCellCount
    const completeness = totalCells === 0 ? 100 : (filledCells / totalCells) * 100

    // Compare counts before presentation rounding; a 100% gate requires every cell.
    if (args.minCompleteness !== undefined && totalCells > 0 && filledCells * 100 < args.minCompleteness * totalCells) {
      failures.push(
        `Completeness ${completeness}% is below required ${args.minCompleteness}%.`,
      )
    }

    if (
      args.maxDuplicateRows !== undefined &&
      report.duplicateRowCount > args.maxDuplicateRows
    ) {
      failures.push(
        `Duplicate rows ${report.duplicateRowCount} exceed allowed ${args.maxDuplicateRows}.`,
      )
    }

    if (failures.length > 0) {
      process.stderr.write(`${failures.join('\n')}\n`)
      return 1
    }

    return 0
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n`)
    return 1
  }
}

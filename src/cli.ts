import { readFile, writeFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { analyzeCsv } from './analyze.js'
import { reportFileName, toCsvReport, toJsonReport } from './report.js'

const usage = `csv-quality — inspect a CSV before you trust it

Usage:
  csv-quality <file.csv> [options]

Options:
  --json           Write the report as JSON instead of CSV
  --out <file>     Write to this file instead of standard output
  --save           Write next to the input as <name>-report.<ext>
  -h, --help       Show this message
`

interface Args {
  file?: string
  json: boolean
  out?: string
  save: boolean
  help: boolean
}

export function parseArgs(argv: string[]): Args {
  const args: Args = { json: false, save: false, help: false }

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]

    if (value === '--json') args.json = true
    else if (value === '--save') args.save = true
    else if (value === '-h' || value === '--help') args.help = true
    else if (value === '--out') {
      index += 1
      args.out = argv[index]
      if (!args.out) throw new Error('--out needs a file name.')
    } else if (value.startsWith('-')) {
      throw new Error(`Unknown option: ${value}`)
    } else if (!args.file) {
      args.file = value
    } else {
      throw new Error('Only one input file is supported.')
    }
  }

  return args
}

export async function run(argv: string[]): Promise<number> {
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
    const source = basename(args.file)
    const report = analyzeCsv(await readFile(args.file, 'utf8'))
    const extension = args.json ? 'json' : 'csv'
    const body = args.json ? toJsonReport(report, { source }) : toCsvReport(report, { source })
    const target = args.out ?? (args.save ? reportFileName(source, extension) : undefined)

    if (target) {
      await writeFile(target, body)
      process.stdout.write(`Wrote ${target}\n`)
    } else {
      process.stdout.write(body.endsWith('\n') ? body : `${body}\n`)
    }

    return 0
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n`)
    return 1
  }
}

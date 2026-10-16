import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const npmCli = process.env.npm_execpath
assert.ok(npmCli, 'Run this check with npm run test:package after npm run build.')
const tempRoot = resolve(tmpdir())
const workspace = await mkdtemp(join(tempRoot, 'csv-quality-package-'))
const consumer = join(workspace, 'consumer project')

function run(args, cwd, expectedStatus = 0) {
  const result = spawnSync(process.execPath, args, {
    cwd,
    encoding: 'utf8',
    timeout: 120_000,
    windowsHide: true,
  })
  if (result.error) throw result.error
  assert.equal(result.status, expectedStatus, `${args.join(' ')}\n${result.stdout}\n${result.stderr}`)
  return result
}

try {
  const packed = JSON.parse(run([
    npmCli, 'pack', '--ignore-scripts', '--json', '--pack-destination', workspace,
  ], root).stdout)
  assert.equal(packed.length, 1)
  await mkdir(consumer)
  await writeFile(join(consumer, 'package.json'), '{"name":"csv-quality-consumer","private":true}\n')
  run([
    npmCli, 'install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund',
    join(workspace, packed[0].filename),
  ], consumer)

  const installed = join(consumer, 'node_modules', 'csv-quality')
  const manifest = JSON.parse(await readFile(join(installed, 'package.json'), 'utf8'))
  for (const mode of ['import', 'require']) {
    await access(join(installed, manifest.exports['.'][mode].types))
  }
  await access(join(consumer, 'node_modules', '.bin', process.platform === 'win32' ? 'csv-quality.cmd' : 'csv-quality'))

  const readme = (await readFile(join(root, 'README.md'), 'utf8')).replace(/\r\n/g, '\n')
  const sample = readme.match(/```csv\n([\s\S]*?)\n```/)
  assert.ok(sample, 'The README must include a runnable CSV quickstart.')
  await writeFile(join(consumer, 'people.csv'), `${sample[1]}\n`)

  const probeBody = "console.log(JSON.stringify(analyzeCsv(readFileSync('people.csv', 'utf8'))))\n"
  await writeFile(join(consumer, 'probe.cjs'), `const { analyzeCsv } = require('csv-quality')\nconst { readFileSync } = require('node:fs')\n${probeBody}`)
  await writeFile(join(consumer, 'probe.mjs'), `import { analyzeCsv } from 'csv-quality'\nimport { readFileSync } from 'node:fs'\n${probeBody}`)
  const esm = JSON.parse(run(['probe.mjs'], consumer).stdout)
  const cjs = JSON.parse(run(['probe.cjs'], consumer).stdout)
  assert.deepEqual(esm, cjs)
  const expected = { rowCount: 3, columnCount: 3, emptyCellCount: 1, duplicateRowCount: 1, completenessPercent: 89 }
  for (const [key, value] of Object.entries(expected)) assert.equal(esm[key], value)

  const cli = (...args) => [npmCli, 'exec', '--offline', '--', 'csv-quality', ...args]
  const expectedCsv = readme.match(/```\n(CSV quality report\n[\s\S]*?)\n```/)
  assert.ok(expectedCsv, 'The README must show the expected CSV report.')
  const withoutTimestamp = text => text.replace(/^Generated,.*$/m, 'Generated,<timestamp>').trim()
  assert.equal(withoutTimestamp(run(cli('people.csv'), consumer).stdout), withoutTimestamp(expectedCsv[1]))
  run(cli('people.csv', '--json', '--save'), consumer)
  const saved = JSON.parse(await readFile(join(consumer, 'people-report.json'), 'utf8'))
  assert.equal(saved.source, 'people.csv')
  assert.deepEqual(saved.summary, expected)
  assert.deepEqual(saved.columns.map(column => column.type), ['text', 'number', 'boolean'])

  const failed = run(cli('people.csv', '--json', '--out', 'quality-report.json', '--min-completeness', '95', '--max-duplicate-rows', '0'), consumer, 1)
  assert.match(failed.stderr, /Completeness .* is below required 95%/)
  assert.match(failed.stderr, /Duplicate rows 1 exceed allowed 0/)
  assert.deepEqual(JSON.parse(await readFile(join(consumer, 'quality-report.json'), 'utf8')).summary, expected)
  const passed = run(cli('people.csv', '--json', '--min-completeness', '80', '--max-duplicate-rows', '1'), consumer)
  assert.deepEqual(JSON.parse(passed.stdout).summary, expected)
  console.log('Packed installation passed: ESM, CommonJS, types, CLI, saved report, failing and passing gates.')
} finally {
  assert.equal(dirname(workspace), tempRoot)
  assert.ok(basename(workspace).startsWith('csv-quality-package-'))
  await rm(workspace, { recursive: true, force: true })
}

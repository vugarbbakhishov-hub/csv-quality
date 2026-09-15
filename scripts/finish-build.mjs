import { chmod, writeFile } from 'node:fs/promises'

// The package is ESM, so the CommonJS output needs its own marker.
await writeFile('dist/cjs/package.json', `${JSON.stringify({ type: 'commonjs' }, null, 2)}\n`)

// npm only preserves the executable bit for files that already have it.
await chmod('dist/esm/bin.js', 0o755)

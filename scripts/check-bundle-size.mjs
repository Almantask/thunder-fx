#!/usr/bin/env node
/**
 * CI gate for the Vite JS budget (PQ-93).
 *
 * The main chunk still carries the prompt catalog (~6.6 MB), so the budget is
 * the measured 7.48 MB plus a little headroom. A 1 MB sneak-in fails the PR.
 * Per-chunk budgets get tighter after PQ-50/51 split the catalog out.
 *
 *   node scripts/check-bundle-size.mjs
 *   node scripts/check-bundle-size.mjs --dir dist/assets
 */
import { readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/** Bytes. 7.48 MB measured main chunk + ~13 % headroom. */
export const MAX_JS_FILE_BYTES = 8_500_000
/** Bytes. React + Radix + Lucide + main. */
export const MAX_TOTAL_JS_BYTES = 11_000_000

function parseDir(argv) {
  const flag = argv.indexOf('--dir')
  if (flag >= 0 && argv[flag + 1]) return argv[flag + 1]
  return join(root, 'dist', 'assets')
}

export function jsFilesIn(dir) {
  let names
  try {
    names = readdirSync(dir)
  } catch (err) {
    const code = err && typeof err === 'object' && 'code' in err ? err.code : ''
    if (code === 'ENOENT') {
      throw new Error(`No bundle at ${dir}. Run \`npm run build:vite\` first.`)
    }
    throw err
  }
  return names
    .filter((name) => name.endsWith('.js'))
    .map((name) => {
      const file = join(dir, name)
      return { name, bytes: statSync(file).size }
    })
    .sort((a, b) => b.bytes - a.bytes)
}

export function checkBundleSizes(files, limits = { maxFile: MAX_JS_FILE_BYTES, maxTotal: MAX_TOTAL_JS_BYTES }) {
  const total = files.reduce((sum, file) => sum + file.bytes, 0)
  const oversized = files.filter((file) => file.bytes > limits.maxFile)
  const errors = []
  for (const file of oversized) {
    errors.push(
      `${file.name} is ${file.bytes} bytes (budget ${limits.maxFile}).`,
    )
  }
  if (total > limits.maxTotal) {
    errors.push(`Total JS is ${total} bytes (budget ${limits.maxTotal}).`)
  }
  return { total, errors }
}

function formatKb(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`
}

function main(argv = process.argv.slice(2)) {
  const dir = parseDir(argv)
  const files = jsFilesIn(dir)
  if (!files.length) {
    throw new Error(`No .js files in ${dir}.`)
  }
  const { total, errors } = checkBundleSizes(files)
  for (const file of files) {
    const mark = file.bytes > MAX_JS_FILE_BYTES ? ' FAIL' : ''
    console.log(`${formatKb(file.bytes).padStart(10)}  ${file.name}${mark}`)
  }
  console.log(`${formatKb(total).padStart(10)}  total JS`)
  if (errors.length) {
    for (const error of errors) console.error(error)
    process.exitCode = 1
    return
  }
  console.log('Bundle size within budget.')
}

const invoked = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (invoked) {
  try {
    main()
  } catch (err) {
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  }
}

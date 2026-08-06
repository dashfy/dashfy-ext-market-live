#!/usr/bin/env node

/**
 * Rewrites the `@getdashfy/*` ranges in this extension's package.json to the versions
 * currently published on npm.
 *
 * Extensions live in their own repositories, outside the dashfy monorepo, so their ranges
 * are hand-maintained, and a 0.x caret is strict: `^0.2.1` excludes `0.3.0`. A freshly
 * published core minor therefore leaves the extension asking for a version nobody installs
 * any more. Run this after the core packages are published, since it reads the `latest`
 * dist-tag from the registry.
 *
 * `peerDependencies` are rewritten too, because that is where `@getdashfy/ui` lives and a
 * stale peer range is what produces install warnings. A peer range doubles as a
 * compatibility claim, so run the tests against the new version before publishing.
 *
 * Set DASHFY_NPM_REGISTRY_URL to a mirror, or to a local directory of
 * `<package name>.json` packuments, to run against something other than npm.
 *
 * Usage: pnpm sync:dashfy [--dry-run]
 */

import { readFile, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const SCOPE = '@getdashfy/'
const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies']
const NPM_REGISTRY_URL = 'https://registry.npmjs.org'

/** The only range shapes we rewrite: `^1.2.3`, `~1.2.3` or a bare `1.2.3` pin. */
const SIMPLE_RANGE = /^([~^]?)(\d[^\s|]*)$/

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const packageFile = join(root, 'package.json')
const dryRun = process.argv.includes('--dry-run')

function isUrl(value) {
  try {
    new URL(value)
    return true
  } catch {
    return false
  }
}

/** Mirrors the CLI's packument resolution so both honour the same override. */
function resolvePackumentSource(packageName) {
  const base = process.env.DASHFY_NPM_REGISTRY_URL ?? NPM_REGISTRY_URL

  return isUrl(base)
    ? `${base.replace(/\/+$/, '')}/${packageName.replace('/', '%2F')}`
    : join(base, `${packageName}.json`)
}

/** Returns the packument, or null when the package is not published. */
async function readPackument(source) {
  if (!isUrl(source)) {
    try {
      return JSON.parse(await readFile(source, 'utf8'))
    } catch (error) {
      if (error.code === 'ENOENT') {
        return null
      }
      throw error
    }
  }

  const response = await fetch(source, {
    headers: { Accept: 'application/json', 'User-Agent': 'dashfy' },
  })

  if (response.status === 404) {
    return null
  }

  if (!response.ok) {
    throw new Error(`${source} responded ${response.status} ${response.statusText}`)
  }

  return response.json()
}

/** A package that is not published yet must not stop the rest of the sync. */
async function fetchLatestVersion(packageName) {
  const packument = await readPackument(resolvePackumentSource(packageName))
  const latest = packument?.['dist-tags']?.latest

  if (!latest) {
    console.warn(`  ! ${packageName} has no published "latest" version, leaving it unchanged`)
    return null
  }

  return latest
}

/** Every scoped dependency except this package itself. */
function collectScopedNames(pkg) {
  const names = new Set()

  for (const field of DEPENDENCY_FIELDS) {
    for (const name of Object.keys(pkg[field] ?? {})) {
      if (name.startsWith(SCOPE) && name !== pkg.name) {
        names.add(name)
      }
    }
  }

  return [...names].sort()
}

/** Rewrites in place, keeping each entry's existing range operator. */
function applyVersions(pkg, versions) {
  const changes = []

  for (const field of DEPENDENCY_FIELDS) {
    for (const [name, range] of Object.entries(pkg[field] ?? {})) {
      const latest = versions.get(name)

      if (!latest) {
        continue
      }

      const match = SIMPLE_RANGE.exec(range)

      if (!match) {
        console.warn(`  ! ${name} is set to "${range}", leaving it unchanged`)
        continue
      }

      const next = `${match[1]}${latest}`

      if (next !== range) {
        pkg[field][name] = next
        changes.push({ field, name, from: range, to: next })
      }
    }
  }

  return changes
}

async function main() {
  const pkg = JSON.parse(await readFile(packageFile, 'utf8'))
  const names = collectScopedNames(pkg)

  if (names.length === 0) {
    console.log(`No ${SCOPE}* dependencies found in package.json.`)
    return
  }

  console.log(`Resolving ${names.length} ${SCOPE}* package(s)`)

  const versions = new Map()

  await Promise.all(
    names.map(async (name) => {
      const latest = await fetchLatestVersion(name)

      if (latest) {
        versions.set(name, latest)
        console.log(`  ${name}@${latest}`)
      }
    }),
  )

  const changes = applyVersions(pkg, versions)

  if (changes.length === 0) {
    console.log('\npackage.json is already up to date.')
    return
  }

  console.log()

  for (const change of changes) {
    console.log(`  ${change.field}: ${change.name} ${change.from} -> ${change.to}`)
  }

  if (dryRun) {
    console.log(`\n${changes.length} range(s) would change. Re-run without --dry-run to write.`)
    return
  }

  await writeFile(packageFile, `${JSON.stringify(pkg, null, 2)}\n`)
  console.log(`\nUpdated ${changes.length} range(s) in package.json.`)
}

try {
  await main()
} catch (error) {
  console.error(`sync-dashfy-deps failed: ${error.message}`)
  process.exitCode = 1
}

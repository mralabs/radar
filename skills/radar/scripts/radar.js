#!/usr/bin/env node
'use strict'

/**
 * radar CLI entry point.
 *
 * Deliberately plain .js, with no import/export syntax and no top-level await:
 * this file must START on any node, including versions far too old to run the
 * .ts sources. Its whole job in that case is to say so, instead of dying inside
 * the module loader with a bare ERR_UNKNOWN_FILE_EXTENSION stack trace that
 * names no version, no floor, and no way out.
 *
 * The syntax restriction is load-bearing twice over: `gh skill install` ships
 * skills/radar/ WITHOUT a package.json, so nothing declares whether .js here is
 * ESM or CommonJS. Avoiding module syntax entirely keeps this valid either way.
 */

var MIN_MAJOR = 22
var MIN_MINOR = 18

function runtimeTooOld() {
  // bun runs TypeScript at any version. It also reports a process.versions.node
  // compatibility string, which can sit below the floor — testing that would
  // reject a runtime that works perfectly.
  if (process.versions.bun) return false
  var parts = String(process.versions.node).split('.')
  var major = Number(parts[0])
  var minor = Number(parts[1])
  if (!isFinite(major) || !isFinite(minor)) return false
  return major < MIN_MAJOR || (major === MIN_MAJOR && minor < MIN_MINOR)
}

if (runtimeTooOld()) {
  console.error('radar needs node >= ' + MIN_MAJOR + '.' + MIN_MINOR + ' — this is node ' + process.versions.node + '.')
  console.error('')
  console.error('radar runs its TypeScript sources directly, which relies on the')
  console.error('type stripping node enables by default from 22.18 onwards.')
  console.error('')
  console.error('Either of these fixes it:')
  console.error('  * upgrade node — 22 is Maintenance LTS, 24 is Active LTS')
  console.error('  * or run the same command with bun, which has no version floor')
  process.exit(1)
}

import('./radar.ts').catch(function (err) {
  console.error(err && err.stack ? err.stack : String(err))
  process.exit(1)
})

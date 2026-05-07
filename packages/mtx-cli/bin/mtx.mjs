#!/usr/bin/env node
import('../dist/index.js').then((m) => m.run(process.argv.slice(2))).catch((err) => {
  console.error(err?.stack ?? String(err))
  process.exit(1)
})

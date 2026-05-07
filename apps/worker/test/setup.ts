import { applySchema, clearDb } from './helpers'
import { beforeAll, beforeEach } from 'vitest'

beforeAll(async () => {
  await applySchema()
})

beforeEach(async () => {
  await clearDb()
})

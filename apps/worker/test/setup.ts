import { beforeEach } from 'vitest'
import { clearDb } from './helpers'

beforeEach(async () => {
  await clearDb()
})

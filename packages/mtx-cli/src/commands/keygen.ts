import pc from 'picocolors'
import { registerKey } from '../lib/api'
import { generateKeyPair } from '../lib/sign'
import { writeKey } from '../lib/keystore'
import { loadConfig, updateConfig } from '../lib/config'

export interface KeygenOptions {
  name?: string
  setActive?: boolean
}

export async function keygenCommand(opts: KeygenOptions = {}): Promise<void> {
  const cfg = await loadConfig()
  if (!cfg.apiKey) {
    console.log(pc.red('not logged in. run `mtx login` first.'))
    process.exit(1)
  }
  const { priv, pubB64 } = await generateKeyPair()
  const res = await registerKey(
    { endpoint: cfg.endpoint, apiKey: cfg.apiKey },
    { pubkeyB64: pubB64, name: opts.name },
  )
  await writeKey(res.keyId, priv, pubB64)
  if (opts.setActive !== false) {
    await updateConfig({ activeKeyId: res.keyId })
  }
  console.log(pc.green(`registered key ${res.keyId}`))
  console.log(`active key: ${res.keyId}`)
}

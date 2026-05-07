import pc from 'picocolors'
import { deviceStart, devicePoll } from '../lib/api'
import { loadConfig, updateConfig } from '../lib/config'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function loginCommand(): Promise<void> {
  const cfg = await loadConfig()
  console.log(pc.cyan(`endpoint: ${cfg.endpoint}`))
  const start = await deviceStart({ endpoint: cfg.endpoint })
  console.log()
  console.log(`open ${pc.bold(start.verificationUri)} and enter code:`)
  console.log(pc.bold(pc.yellow(start.userCode)))
  console.log()

  const deadline = Date.now() + start.expiresIn * 1000
  let interval = Math.max(start.interval, 2)
  while (Date.now() < deadline) {
    await sleep(interval * 1000)
    const poll = await devicePoll({ endpoint: cfg.endpoint }, start.deviceCode)
    if (poll.status === 'authorized' && poll.apiKey) {
      await updateConfig({
        apiKey: poll.apiKey,
        authorId: poll.authorId,
        githubLogin: poll.githubLogin,
      })
      console.log(pc.green(`logged in as ${poll.githubLogin} (${poll.authorId})`))
      return
    }
    if (poll.status === 'denied') {
      console.log(pc.red('access denied'))
      return
    }
    if (poll.status === 'expired') {
      console.log(pc.red('device flow expired, try again'))
      return
    }
  }
  console.log(pc.red('timed out waiting for authorization'))
}

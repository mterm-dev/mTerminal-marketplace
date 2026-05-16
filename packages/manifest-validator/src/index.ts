export type ActivationEvent =
  | 'onStartupFinished'
  | 'onSelection'
  | `onCommand:${string}`
  | `onView:${string}`
  | `onTabType:${string}`
  | `onUri:${string}`
  | `onEvent:${string}`

export interface CommandContribution {
  id: string
  title?: string
  category?: string
  icon?: string
  args?: Array<{
    name: string
    type: 'string' | 'number' | 'boolean'
    required?: boolean
    default?: unknown
    description?: string
  }>
}

export interface KeybindingContribution {
  command: string
  key: string
  when?: string
  args?: unknown
}

export interface PanelContribution {
  id: string
  title: string
  icon?: string
  location:
    | 'sidebar'
    | 'sidebar.bottom'
    | 'bottombar'
    | `workspace-section.${string}`
  initialCollapsed?: boolean
}

export interface StatusBarContribution {
  id: string
  align: 'left' | 'right'
  text?: string
  icon?: string
  tooltip?: string
  command?: string
  refreshOn?: string[]
  priority?: number
}

export interface ContextMenuContribution {
  command: string
  context: string
  when?: string
  group?: string
  label?: string
}

export interface TabTypeContribution {
  id: string
  title: string
  icon?: string
}

export interface DecoratorContribution {
  id: string
  appliesTo: 'terminal.output'
}

export interface ThemeContribution {
  id: string
  label: string
  path: string
}

export type AiProviderId = 'anthropic' | 'openai' | 'ollama'

export interface AiBindingContribution {
  id: string
  label: string
  description?: string
  supportsCore?: boolean
  providers?: AiProviderId[]
  defaultProvider?: AiProviderId
  defaultModels?: Partial<Record<AiProviderId, string>>
}

export interface SecretContribution {
  key: string
  label: string
  description?: string
  link?: string
  placeholder?: string
}

export interface JsonSchema {
  type?: 'object' | 'string' | 'number' | 'boolean' | 'array'
  title?: string
  description?: string
  default?: unknown
  enum?: Array<string | number>
  properties?: Record<string, JsonSchema>
  items?: JsonSchema
  required?: string[]
  minimum?: number
  maximum?: number
  pattern?: string
}

export interface PublisherInfo {
  authorId: string
  keyId: string
}

export interface ExtensionManifest {
  id: string
  packageName: string
  version: string
  displayName?: string
  description?: string
  author?: string
  icon?: string
  homepageUrl?: string
  repoUrl?: string
  category?: string
  apiVersionRange: string
  mainEntry: string | null
  rendererEntry: string | null
  activationEvents: ActivationEvent[]
  capabilities: string[]
  enabledApiProposals: string[]
  allowedNetworkDomains: string[]
  publisher: PublisherInfo
  providedServices: Record<string, { version: string }>
  consumedServices: Record<string, { versionRange: string; optional?: boolean }>
  contributes: {
    commands: CommandContribution[]
    keybindings: KeybindingContribution[]
    settings: JsonSchema | null
    panels: PanelContribution[]
    statusBar: StatusBarContribution[]
    contextMenu: ContextMenuContribution[]
    tabTypes: TabTypeContribution[]
    decorators: DecoratorContribution[]
    themes: ThemeContribution[]
    secrets: SecretContribution[]
    aiBindings: AiBindingContribution[]
  }
}

export const CAPABILITY_WHITELIST = [
  'child-process',
  'network:limited',
  'network:full',
  'filesystem:read',
  'filesystem:write',
  'clipboard',
  'notifications',
  'keychain',
] as const

export type Capability = (typeof CAPABILITY_WHITELIST)[number]

export interface ValidationOk {
  ok: true
  manifest: ExtensionManifest
}

export interface ValidationErr {
  ok: false
  errors: string[]
}

export type ValidationResult = ValidationOk | ValidationErr

const KEBAB_CASE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/
const SEMVER_VERSION =
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/
const SEMVER_RANGE = /^[\^~><=*\d.\sxX|-]+$/

export function validateManifest(input: unknown): ValidationResult {
  const errors: string[] = []
  const o = isObject(input) ? input : {}

  const packageName = typeof o.name === 'string' ? o.name : ''
  if (!packageName) errors.push('missing "name"')

  const version = typeof o.version === 'string' ? o.version : ''
  if (!version) errors.push('missing "version"')
  else if (!SEMVER_VERSION.test(version)) errors.push(`invalid semver "version": ${version}`)

  const mt = isObject(o.mterminal) ? o.mterminal : null
  if (!mt) {
    errors.push('missing "mterminal" block')
    return { ok: false, errors }
  }

  const id = typeof mt.id === 'string' ? mt.id : ''
  if (!id) errors.push('missing "mterminal.id"')
  else if (!KEBAB_CASE.test(id)) errors.push(`"mterminal.id" must be kebab-case: ${id}`)

  const engines = isObject(o.engines) ? o.engines : {}
  const apiVersionRange =
    typeof engines['mterminal-api'] === 'string' ? (engines['mterminal-api'] as string) : ''
  if (!apiVersionRange) errors.push('missing "engines.mterminal-api"')
  else if (!SEMVER_RANGE.test(apiVersionRange))
    errors.push(`invalid semver range "engines.mterminal-api": ${apiVersionRange}`)

  const publisherRaw = isObject(mt.publisher) ? mt.publisher : null
  const publisher: PublisherInfo = { authorId: '', keyId: '' }
  if (!publisherRaw) {
    errors.push('missing "mterminal.publisher"')
  } else {
    if (typeof publisherRaw.authorId !== 'string' || !publisherRaw.authorId)
      errors.push('missing "mterminal.publisher.authorId"')
    else publisher.authorId = publisherRaw.authorId
    if (typeof publisherRaw.keyId !== 'string' || !publisherRaw.keyId)
      errors.push('missing "mterminal.publisher.keyId"')
    else publisher.keyId = publisherRaw.keyId
  }

  const main = typeof o.main === 'string' ? o.main : null
  const renderer = typeof o.renderer === 'string' ? o.renderer : null

  const activationEvents = readArrayOf<string>(mt.activationEvents, isString)
  if (activationEvents.length === 0)
    errors.push('"mterminal.activationEvents" is required and must be a non-empty array')
  for (const ev of activationEvents) {
    if (!isValidActivationEvent(ev)) errors.push(`unknown activation event: ${ev}`)
  }

  const capabilities = readArrayOf<string>(mt.capabilities, isString)
  for (const cap of capabilities) {
    if (!CAPABILITY_WHITELIST.includes(cap as Capability))
      errors.push(`capability "${cap}" is not in the whitelist`)
  }

  const allowedNetworkDomains = readArrayOf<string>(mt.allowedNetworkDomains, isString)
  if (capabilities.includes('network:full') && allowedNetworkDomains.length === 0) {
    errors.push('"network:full" capability requires "mterminal.allowedNetworkDomains" with at least one entry')
  }

  const enabledApiProposals = readArrayOf<string>(mt.enabledApiProposals, isString)

  const providedServices = readProvidedServices(mt.providedServices, errors)
  const consumedServices = readConsumedServices(mt.consumedServices, errors)
  const contributes = readContributes(mt.contributes, errors)

  const declarativeOk =
    Array.isArray(contributes.themes) && contributes.themes.length > 0
  if (!main && !renderer && !declarativeOk) {
    errors.push('extension must declare "main", "renderer", or at least one declarative theme contribution')
  }

  if (errors.length) return { ok: false, errors }

  const manifest: ExtensionManifest = {
    id,
    packageName,
    version,
    displayName: typeof mt.displayName === 'string' ? mt.displayName : undefined,
    description: typeof o.description === 'string' ? o.description : undefined,
    author:
      typeof o.author === 'string'
        ? o.author
        : isObject(o.author) && typeof o.author.name === 'string'
          ? o.author.name
          : undefined,
    icon: typeof mt.icon === 'string' ? mt.icon : undefined,
    homepageUrl: typeof o.homepage === 'string' ? o.homepage : undefined,
    repoUrl:
      typeof o.repository === 'string'
        ? o.repository
        : isObject(o.repository) && typeof o.repository.url === 'string'
          ? o.repository.url
          : undefined,
    category: typeof mt.category === 'string' ? mt.category : undefined,
    apiVersionRange,
    mainEntry: main,
    rendererEntry: renderer,
    activationEvents: activationEvents as ActivationEvent[],
    capabilities,
    enabledApiProposals,
    allowedNetworkDomains,
    publisher,
    providedServices,
    consumedServices,
    contributes,
  }

  return { ok: true, manifest }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isString(v: unknown): v is string {
  return typeof v === 'string'
}

function readArrayOf<T>(v: unknown, guard: (x: unknown) => x is T): T[] {
  if (!Array.isArray(v)) return []
  return v.filter(guard)
}

const ACTIVATION_PREFIXES = [
  'onCommand:',
  'onView:',
  'onTabType:',
  'onUri:',
  'onEvent:',
] as const

function isValidActivationEvent(ev: string): boolean {
  if (ev === 'onStartupFinished') return true
  if (ev === 'onSelection') return true
  return ACTIVATION_PREFIXES.some((p) => ev.startsWith(p) && ev.length > p.length)
}

function readProvidedServices(
  v: unknown,
  errors: string[],
): Record<string, { version: string }> {
  const out: Record<string, { version: string }> = {}
  if (!isObject(v)) return out
  for (const [id, entry] of Object.entries(v)) {
    if (!isObject(entry) || typeof entry.version !== 'string') {
      errors.push(`providedServices["${id}"] missing "version"`)
      continue
    }
    out[id] = { version: entry.version }
  }
  return out
}

function readConsumedServices(
  v: unknown,
  errors: string[],
): Record<string, { versionRange: string; optional?: boolean }> {
  const out: Record<string, { versionRange: string; optional?: boolean }> = {}
  if (!isObject(v)) return out
  for (const [id, entry] of Object.entries(v)) {
    if (!isObject(entry) || typeof entry.versionRange !== 'string') {
      errors.push(`consumedServices["${id}"] missing "versionRange"`)
      continue
    }
    out[id] = {
      versionRange: entry.versionRange,
      optional: typeof entry.optional === 'boolean' ? entry.optional : undefined,
    }
  }
  return out
}

function readContributes(v: unknown, errors: string[]): ExtensionManifest['contributes'] {
  const c = isObject(v) ? v : {}
  return {
    commands: readArrayOf(
      c.commands,
      (x): x is CommandContribution => isObject(x) && typeof x.id === 'string',
    ),
    keybindings: readArrayOf(
      c.keybindings,
      (x): x is KeybindingContribution =>
        isObject(x) && typeof x.command === 'string' && typeof x.key === 'string',
    ),
    settings: isObject(c.settings) ? (c.settings as JsonSchema) : null,
    panels: readArrayOf(c.panels, (x): x is PanelContribution => {
      if (!isObject(x)) return false
      if (typeof x.id !== 'string' || typeof x.title !== 'string') return false
      const loc = x.location
      const isBuiltinSlot =
        loc === 'sidebar' || loc === 'sidebar.bottom' || loc === 'bottombar'
      const isWorkspaceSectionSlot =
        typeof loc === 'string' &&
        loc.startsWith('workspace-section.') &&
        loc.length > 'workspace-section.'.length
      if (!isBuiltinSlot && !isWorkspaceSectionSlot) {
        errors.push(`panel "${String(x.id)}" has invalid location "${String(loc)}"`)
        return false
      }
      return true
    }),
    statusBar: readArrayOf(
      c.statusBar,
      (x): x is StatusBarContribution =>
        isObject(x) && typeof x.id === 'string' && (x.align === 'left' || x.align === 'right'),
    ),
    contextMenu: readArrayOf(
      c.contextMenu,
      (x): x is ContextMenuContribution =>
        isObject(x) && typeof x.command === 'string' && typeof x.context === 'string',
    ),
    tabTypes: readArrayOf(
      c.tabTypes,
      (x): x is TabTypeContribution =>
        isObject(x) && typeof x.id === 'string' && typeof x.title === 'string',
    ),
    decorators: readArrayOf(
      c.decorators,
      (x): x is DecoratorContribution =>
        isObject(x) && typeof x.id === 'string' && x.appliesTo === 'terminal.output',
    ),
    themes: readArrayOf(
      c.themes,
      (x): x is ThemeContribution =>
        isObject(x) &&
        typeof x.id === 'string' &&
        typeof x.label === 'string' &&
        typeof x.path === 'string',
    ),
    secrets: readArrayOf(
      c.secrets,
      (x): x is SecretContribution =>
        isObject(x) && typeof x.key === 'string' && typeof x.label === 'string',
    ),
    aiBindings: readArrayOf(
      c.aiBindings,
      (x): x is AiBindingContribution =>
        isObject(x) && typeof x.id === 'string' && typeof x.label === 'string',
    ),
  }
}

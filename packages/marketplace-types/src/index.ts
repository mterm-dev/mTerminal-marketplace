export type Category =
  | 'productivity'
  | 'language'
  | 'theme'
  | 'remote'
  | 'ai'
  | 'git'
  | 'other'

export interface ExtSummary {
  id: string
  displayName: string
  description: string
  category: Category
  iconUrl?: string
  latestVersion: string
  downloadTotal: number
  avgStars?: number
  ratingCount: number
  authorLogin: string
  recommended: boolean
  apiRange: string
}

export interface VersionInfo {
  version: string
  apiRange: string
  sizeBytes: number
  publishedAt: number
  yanked: boolean
}

export interface RatingDto {
  userId: string
  userLogin: string
  stars: number
  comment?: string
  helpful: number
  createdAt: number
}

export interface ExtensionDetail extends ExtSummary {
  homepageUrl?: string
  repoUrl?: string
  versions: VersionInfo[]
  manifest: unknown
  ratings: RatingDto[]
  readmeMd?: string
}

export interface DownloadInfo {
  url: string
  sha256: string
  signatureB64: string
  keyId: string
  authorId: string
  sizeBytes: number
}

export type PolicyErrorCode =
  | 'manifest'
  | 'signature'
  | 'static-scan'
  | 'capability'
  | 'duplicate-version'
  | 'unknown-key'
  | 'size-limit'
  | 'unauthorized'
  | 'banned'
  | 'publisher-mismatch'

export interface PolicyIssue {
  message: string
  path?: string
  line?: number
  col?: number
}

export interface PolicyError {
  code: PolicyErrorCode
  issues: PolicyIssue[]
}

export interface PublishResult {
  ok: boolean
  id?: string
  version?: string
  errors?: PolicyError[]
}

export interface SearchRequest {
  q?: string
  category?: Category
  recommended?: boolean
  sort?: 'downloads' | 'stars' | 'recent' | 'name'
  page?: number
  pageSize?: number
  ids?: string[]
}

export interface SearchResult {
  items: ExtSummary[]
  total: number
  page: number
  pageSize: number
}

export interface DeviceFlowStartResult {
  deviceCode: string
  userCode: string
  verificationUri: string
  expiresIn: number
  interval: number
}

export interface DeviceFlowPollResult {
  status: 'pending' | 'authorized' | 'expired' | 'denied'
  apiKey?: string
  authorId?: string
  githubLogin?: string
}

export interface KeyRegisterRequest {
  pubkeyB64: string
  name?: string
}

export interface KeyRegisterResponse {
  keyId: string
}

export interface KeyInfo {
  keyId: string
  authorId: string
  pubkeyB64: string
  revokedAt: number | null
  createdAt: number
}

export interface RatingSubmitRequest {
  extensionId: string
  stars: number
  comment?: string
}

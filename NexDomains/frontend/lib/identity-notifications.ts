export const ACADEMY_NOTIFICATION_PATH = '/api/user/identity-notifications'

export const IDENTITY_NOTIFICATION_TEXT_KEYS = {
  telegram: 'org.telegram',
  email: 'email',
  xHandle: 'com.twitter',
  relevanceAgentId: 'nexid.relevance.agentId',
  relevanceAgentEmail: 'nexid.relevance.agentEmail',
  notificationEndpoint: 'nexid.notifications.endpoint',
  telegramOptInHint: 'nexid.notifications.telegramOptIn',
  linkedWallets: 'nexid.notifications.linkedWallets',
} as const

export type TextRecordValue = string | number | boolean | null | undefined

export type TextRecordMap = Record<string, TextRecordValue>

export type IdentityNotificationProfileInput = {
  domainName?: string | null
  linkedWalletAddresses?: string[]
  telegramHandle?: string | null
  email?: string | null
  xHandle?: string | null
  relevanceAgentId?: string | null
  relevanceAgentEmail?: string | null
  relevanceAgentStatus?: 'NOT_LINKED' | 'PENDING_LINK' | 'LINKED' | 'DISABLED' | 'ERROR'
  useDefaultRelevanceAgent?: boolean
  mindsAgentId?: string | null
  mindsAgentEmail?: string | null
  notificationEndpoint?: string | null
  telegramOptInHint?: string | boolean | null
  reputationDropThreshold?: number
  inactivityDaysThreshold?: number
  isEnabled?: boolean
}

type BuildIdentityNotificationProfileArgs = {
  name: string
  owner: string
  profile?: IdentityNotificationProfileInput | null
  academyBaseUrl?: string | null
}

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/

function cleanString(value: TextRecordValue) {
  if (value === null || value === undefined) return null
  const normalized = String(value).trim()
  return normalized.length > 0 ? normalized : null
}

export function normalizeIdentityDomainName(name: string) {
  const normalized = name.trim().toLowerCase()
  return normalized.endsWith('.id') ? normalized : `${normalized}.id`
}

export function normalizeIdentityHandle(handle?: string | null) {
  const normalized = cleanString(handle)
  if (!normalized) return null
  return normalized.replace(/^@/, '')
}

export function normalizeIdentityWallets(owner: string, wallets?: string[]) {
  return Array.from(
    new Set(
      [owner, ...(wallets ?? [])]
        .filter((wallet): wallet is string => typeof wallet === 'string')
        .map((wallet) => wallet.trim().toLowerCase())
        .filter((wallet) => ADDRESS_RE.test(wallet)),
    ),
  )
}

export function getAcademyNotificationEndpoint(academyBaseUrl?: string | null) {
  const base = cleanString(academyBaseUrl)
  if (!base) return ACADEMY_NOTIFICATION_PATH
  return `${base.replace(/\/$/, '')}${ACADEMY_NOTIFICATION_PATH}`
}

export function normalizeTextRecords(records?: TextRecordMap | null) {
  const normalized: Record<string, string> = {}

  for (const [key, value] of Object.entries(records ?? {})) {
    const cleanKey = key.trim()
    const cleanValue = cleanString(value)

    if (cleanKey && cleanValue) {
      normalized[cleanKey] = cleanValue
    }
  }

  return normalized
}

export function buildIdentityNotificationProfile({
  name,
  owner,
  profile,
  academyBaseUrl,
}: BuildIdentityNotificationProfileArgs) {
  const domainName = normalizeIdentityDomainName(profile?.domainName ?? name)
  const linkedWalletAddresses = normalizeIdentityWallets(
    owner,
    profile?.linkedWalletAddresses,
  )
  const telegramHandle = normalizeIdentityHandle(profile?.telegramHandle)
  const xHandle = normalizeIdentityHandle(profile?.xHandle)
  const email = cleanString(profile?.email)?.toLowerCase() ?? null
  const relevanceAgentId = cleanString(profile?.relevanceAgentId ?? profile?.mindsAgentId)
  const relevanceAgentEmail = cleanString(
    profile?.relevanceAgentEmail ?? profile?.mindsAgentEmail,
  )?.toLowerCase() ?? null
  const notificationEndpoint =
    cleanString(profile?.notificationEndpoint) ??
    getAcademyNotificationEndpoint(academyBaseUrl)
  const telegramOptInHint = cleanString(profile?.telegramOptInHint) ?? (
    telegramHandle ? 'true' : null
  )

  const payload = {
    domainName,
    linkedWalletAddresses,
    telegramHandle,
    email,
    xHandle,
    relevanceAgentId,
    relevanceAgentEmail,
    relevanceAgentStatus: profile?.relevanceAgentStatus ?? (
      relevanceAgentId || profile?.useDefaultRelevanceAgent ? 'LINKED' : undefined
    ),
    useDefaultRelevanceAgent: profile?.useDefaultRelevanceAgent,
    reputationDropThreshold: profile?.reputationDropThreshold,
    inactivityDaysThreshold: profile?.inactivityDaysThreshold,
    isEnabled: profile?.isEnabled ?? true,
  }

  const resolverTextRecords = normalizeTextRecords({
    [IDENTITY_NOTIFICATION_TEXT_KEYS.telegram]: telegramHandle
      ? `@${telegramHandle}`
      : null,
    [IDENTITY_NOTIFICATION_TEXT_KEYS.email]: email,
    [IDENTITY_NOTIFICATION_TEXT_KEYS.xHandle]: xHandle ? `@${xHandle}` : null,
    [IDENTITY_NOTIFICATION_TEXT_KEYS.relevanceAgentId]: relevanceAgentId,
    [IDENTITY_NOTIFICATION_TEXT_KEYS.relevanceAgentEmail]: relevanceAgentEmail,
    [IDENTITY_NOTIFICATION_TEXT_KEYS.notificationEndpoint]: notificationEndpoint,
    [IDENTITY_NOTIFICATION_TEXT_KEYS.telegramOptInHint]: telegramOptInHint,
    [IDENTITY_NOTIFICATION_TEXT_KEYS.linkedWallets]:
      linkedWalletAddresses.length > 1 ? linkedWalletAddresses.join(',') : null,
  })

  return {
    academyEndpoint: getAcademyNotificationEndpoint(academyBaseUrl),
    payload,
    resolverTextRecords,
    agentMetadata: {
      relevanceAgentId,
      relevanceAgentEmail,
      notificationEndpoint,
      telegramOptInHint,
    },
  }
}

export function mergeIdentityNotificationTextRecords(
  textRecords: TextRecordMap | undefined,
  notificationTextRecords: Record<string, string>,
) {
  return {
    ...normalizeTextRecords(textRecords),
    ...notificationTextRecords,
  }
}

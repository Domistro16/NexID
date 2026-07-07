import { NextRequest, NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rateLimit'
import {
  buildIdentityNotificationProfile,
  type IdentityNotificationProfileInput,
} from '@/lib/identity-notifications'

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/

/**
 * POST /api/identity-notifications
 *
 * Builds the NexAcademy notification-profile payload for a .id identity.
 * If syncToNexAcademy is true and a NexAcademy bearer token is supplied,
 * forwards the profile to NexAcademy's authenticated endpoint.
 */
export async function POST(request: NextRequest) {
  const rl = rateLimit(request)
  if (!rl.ok) return rl.response!

  let body: {
    name?: string
    owner?: string
    notificationProfile?: IdentityNotificationProfileInput
    syncToNexAcademy?: boolean
    academyAccessToken?: string
  } | null = null

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { name, owner, notificationProfile, syncToNexAcademy = false } = body

  if (!name || typeof name !== 'string') {
    return NextResponse.json(
      { error: 'Missing or invalid "name" field' },
      { status: 400 },
    )
  }

  if (!owner || !ADDRESS_RE.test(owner)) {
    return NextResponse.json(
      { error: 'Missing or invalid "owner" address' },
      { status: 400 },
    )
  }

  const identityNotificationProfile = buildIdentityNotificationProfile({
    name,
    owner,
    profile: notificationProfile,
    academyBaseUrl: process.env.NEXACADEMY_API_BASE_URL,
  })

  const responseBody: Record<string, unknown> = {
    success: true,
    name,
    fullName: identityNotificationProfile.payload.domainName,
    identityNotificationProfile,
  }

  if (!syncToNexAcademy) {
    return NextResponse.json(responseBody)
  }

  const forwardedAuth =
    request.headers.get('authorization') ??
    (body.academyAccessToken ? `Bearer ${body.academyAccessToken}` : null)

  if (!forwardedAuth?.startsWith('Bearer ')) {
    return NextResponse.json(
      { error: 'Missing NexAcademy bearer token for sync' },
      { status: 401 },
    )
  }

  if (!identityNotificationProfile.academyEndpoint.startsWith('http')) {
    return NextResponse.json(
      { error: 'NEXACADEMY_API_BASE_URL is required for server-side sync' },
      { status: 500 },
    )
  }

  let academyResponse: Response

  try {
    academyResponse = await fetch(identityNotificationProfile.academyEndpoint, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: forwardedAuth,
      },
      body: JSON.stringify(identityNotificationProfile.payload),
    })
  } catch (error: any) {
    return NextResponse.json(
      {
        ...responseBody,
        error: 'Failed to sync notification profile with NexAcademy',
        details: error?.message ?? String(error),
      },
      { status: 502 },
    )
  }

  const academyBody = await academyResponse.json().catch(() => null)

  return NextResponse.json(
    {
      ...responseBody,
      academySync: {
        ok: academyResponse.ok,
        status: academyResponse.status,
        response: academyBody,
      },
    },
    { status: academyResponse.ok ? 200 : academyResponse.status },
  )
}

import { NextRequest, NextResponse } from 'next/server'

type RateLimitResult = {
  ok: boolean
  response?: NextResponse
}

const WINDOW_MS = 60_000
const MAX_REQUESTS = 50

const buckets = new Map<string, { count: number; resetAt: number }>()

function getClientKey(req: NextRequest) {
  const fwd = req.headers.get('x-forwarded-for')
  const ip = fwd ? fwd.split(',')[0].trim() : req.headers.get('x-real-ip') || 'unknown'
  return `${ip}:${req.nextUrl.pathname}`
}

export function rateLimit(req: NextRequest): RateLimitResult {
  const key = getClientKey(req)
  const now = Date.now()
  const current = buckets.get(key)

  if (!current || now >= current.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS })
    return { ok: true }
  }

  if (current.count >= MAX_REQUESTS) {
    const retryAfterSec = Math.ceil((current.resetAt - now) / 1000)
    const res = NextResponse.json(
      { error: 'Rate limit exceeded', limit: MAX_REQUESTS, windowSeconds: 60 },
      { status: 429 },
    )
    res.headers.set('Retry-After', `${retryAfterSec}`)
    res.headers.set('X-RateLimit-Limit', `${MAX_REQUESTS}`)
    res.headers.set('X-RateLimit-Remaining', '0')
    res.headers.set('X-RateLimit-Reset', `${Math.floor(current.resetAt / 1000)}`)
    return { ok: false, response: res }
  }

  current.count += 1
  return { ok: true }
}

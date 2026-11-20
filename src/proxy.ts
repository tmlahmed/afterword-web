import { type NextRequest, NextResponse } from 'next/server'

/**
 * The admin opens in the light theme unless the person has chosen otherwise.
 * Payload reads its theme from the `payload-theme` cookie and, without one, follows the
 * computer's dark or light setting. Setting the cookie to light when it is missing makes light
 * the default; anyone can still pick Dark under Account → Admin theme, which replaces it.
 */
const THEME_COOKIE = 'payload-theme'

export function proxy(request: NextRequest) {
  if (request.cookies.has(THEME_COOKIE)) return NextResponse.next()
  // Set it on this request too, so the very first page already renders light.
  request.cookies.set(THEME_COOKIE, 'light')
  const response = NextResponse.next({ request: { headers: request.headers } })
  response.cookies.set(THEME_COOKIE, 'light', { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' })
  return response
}

export const config = { matcher: ['/admin', '/admin/:path*'] }

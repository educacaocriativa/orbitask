import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PUBLIC_ROUTES = ['/auth/login', '/auth/register']
const ADMIN_ROUTES = ['/admin']

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow public routes unconditionally
  if (PUBLIC_ROUTES.some((r) => pathname.startsWith(r))) {
    return NextResponse.next()
  }

  // Check for auth token in cookie (set by client after login)
  const token = request.cookies.get('orbitask:token')?.value

  if (!token) {
    const loginUrl = new URL('/auth/login', request.url)
    loginUrl.searchParams.set('from', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Basic JWT structure check (full verification happens on API)
  const parts = token.split('.')
  if (parts.length !== 3) {
    const loginUrl = new URL('/auth/login', request.url)
    return NextResponse.redirect(loginUrl)
  }

  // Admin route guard: decode payload (no signature check here — API does that)
  if (ADMIN_ROUTES.some((r) => pathname.startsWith(r))) {
    try {
      const payload = JSON.parse(atob(parts[1]))
      if (payload.role !== 'ADMIN') {
        return NextResponse.redirect(new URL('/board', request.url))
      }
    } catch {
      return NextResponse.redirect(new URL('/auth/login', request.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api).*)'],
}


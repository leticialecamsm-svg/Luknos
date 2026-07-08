import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  if (
    pathname.startsWith('/auth') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next') ||
    pathname === '/site' ||
    pathname.startsWith('/site/')
  ) {
    return NextResponse.next()
  }

  const hasSession = request.cookies.getAll()
    .some(c => c.name.startsWith('sb-') && c.name.endsWith('-auth-token'))

  if (!hasSession) {
    return NextResponse.redirect(new URL('/auth/login', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
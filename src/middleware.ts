import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  if (
    pathname.startsWith('/auth') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next')
  ) {
    return NextResponse.next()
  }

  // O Supabase fragmenta sessões longas em cookies como
  // `sb-<project>-auth-token.0` e `.1`. A checagem anterior aceitava apenas
  // o cookie sem fragmento e redirecionava um usuário autenticado de volta ao login.
  const hasSession = request.cookies.getAll()
    .some(c => /^sb-.+-auth-token(?:\.\d+)?$/.test(c.name))

  if (!hasSession) {
    return NextResponse.redirect(new URL('/auth/login', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}

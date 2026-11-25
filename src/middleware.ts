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
    // Link de uma solicitação sem login (inclui o robô de prévia do WhatsApp): mostra só os dados
    // do banner e leva ao login. Ver src/lib/solicitations/share-preview.ts.
    const shared = /^\/solicitacoes\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i.exec(pathname)
    if (shared) return NextResponse.rewrite(new URL(`/api/og/solicitacao/${shared[1]}`, request.url))
    return NextResponse.redirect(new URL('/auth/login', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}

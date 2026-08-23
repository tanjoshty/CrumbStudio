import { NextResponse, type NextRequest } from 'next/server'

import { isAdmin } from '@/lib/auth/admin'
import { updateSession } from '@/lib/supabase/middleware'

export default async function middleware(request: NextRequest) {
  // Webhooks carry a Stripe signature, not an auth cookie: skip session
  // handling entirely so Stripe never meets a redirect or a touched request.
  if (request.nextUrl.pathname.startsWith('/api/webhooks')) {
    return NextResponse.next()
  }

  const { response, user } = await updateSession(request)

  if (request.nextUrl.pathname.startsWith('/admin')) {
    // `user` is the decoded JWT claims (or undefined). Not signed in → login;
    // signed in but not on the admin allow-list → home. Every customer can
    // register, so authentication alone must not grant admin access.
    const sub = (user as { sub?: string } | undefined)?.sub
    if (!user) {
      const url = request.nextUrl.clone()
      url.pathname = '/auth/login'
      return NextResponse.redirect(url)
    }
    if (!isAdmin(sub)) {
      const url = request.nextUrl.clone()
      url.pathname = '/'
      return NextResponse.redirect(url)
    }
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - images - .svg, .png, .jpg, .jpeg, .gif, .webp
     * Feel free to modify this pattern to include more paths.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}

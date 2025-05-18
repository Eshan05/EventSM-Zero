import { auth } from '@/lib/auth.config';
import { getClientIP } from '@/utils/client-ip';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { CustomSession } from '@/lib/auth';

const LOG_PREFIX = '[Middleware]';

const PUBLIC_PATHS: string[] = ['/'];
const AUTH_PAGE_PATH = '/u';
const USER_DASHBOARD_PATH = '/';
const ADMIN_DASHBOARD_PATH = '/admin';
const API_AUTH_PREFIX = '/api/auth';

const PROTECTED_PATHS_STARTS_WITH: string[] = [
  USER_DASHBOARD_PATH,
  '/profile',
  '/settings',
  '/api/chat/active',
  '/chat',
];

const ADMIN_PATHS_STARTS_WITH: string[] = [
  ADMIN_DASHBOARD_PATH,
  '/admin/users',
  '/api/admin',
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const requestIp = getClientIP(req);
  const LOG_CTX = `${LOG_PREFIX}[${pathname}][IP:${requestIp}]`;

  // 1. Allow Auth.js API routes to pass through unconditionally
  if (pathname.startsWith(API_AUTH_PREFIX)) {
    console.log(`${LOG_CTX} Allowing Auth.js API route.`);
    return NextResponse.next();
  }

  if (pathname.startsWith('/api/zero-push')) {
    console.log(`${LOG_CTX} Allowing Zero Token API route.`);
    return NextResponse.next();
  }

  // const token = await getToken({ req, secret: process.env.AUTH_SECRET });
  // console.log(`${LOG_CTX} Token fetched.`, token);
  const session = await auth();
  // console.log(session)
  const isAuthenticated = !!session;
  // const userRole = token?.role;
  // const userId = token?.sub;
  // const user = token;
  const user = session?.user as CustomSession["user"] | undefined;
  // console.log(`${LOG_CTX} Token fetched. Authenticated: ${isAuthenticated}, User ID: ${userId ?? 'Guest'}, Role: ${userRole ?? 'None'}`);


  if (isAuthenticated && user) {
    // If user is authenticated and tries to access the sign-in/sign-up page, redirect them
    if (pathname === AUTH_PAGE_PATH) {
      console.log(`${LOG_CTX} Authenticated user on auth page. Redirecting to dashboard.`);
      return NextResponse.redirect(new URL(USER_DASHBOARD_PATH, req.url));
    }

    // Check for admin-only routes
    const isAdminRoute = ADMIN_PATHS_STARTS_WITH.some(p => pathname.startsWith(p));
    if (isAdminRoute && user.role !== 'admin') {
      console.warn(`${LOG_CTX} Non-admin user (ID: ${user.id}, Role: ${user.role}) attempting admin access to "${pathname}". Redirecting to user dashboard or forbidden page.`);
      return NextResponse.redirect(new URL(USER_DASHBOARD_PATH, req.url)); // Or a specific '/forbidden' page
    }

    return NextResponse.next();
  }

  if (!isAuthenticated) {
    if (pathname === AUTH_PAGE_PATH) {
      console.log(`${LOG_CTX} Unauthenticated user accessing auth page. Allowing.`);
      return NextResponse.next();
    }

    if (PUBLIC_PATHS.includes(pathname) || pathname.startsWith('/api/public')) return NextResponse.next();
    const isProtectedPath = PROTECTED_PATHS_STARTS_WITH.some(p => pathname.startsWith(p)) ||
      ADMIN_PATHS_STARTS_WITH.some(p => pathname.startsWith(p));

    if (isProtectedPath) {
      console.log(`${LOG_CTX} Unauthenticated user attempting to access protected route "${pathname}". Redirecting to sign-in.`);
      const signInUrl = new URL(AUTH_PAGE_PATH, req.url);
      signInUrl.searchParams.set('next', req.nextUrl.pathname + req.nextUrl.search);
      signInUrl.searchParams.set('mode', 'signin');
      return NextResponse.redirect(signInUrl);
    }

    // console.log(`${LOG_CTX} Unauthenticated user accessing uncategorized path. Allowing by default.`);
    return NextResponse.next();
  }

  console.warn(`${LOG_CTX} Middleware reached end without explicit action. Allowing by default.`);
  return NextResponse.next();
}


export const config = {
  matcher: [
    /*
     * Match all request paths except for those starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - Any files with extensions like .svg, .png, .jpg, .css, .js (common assets)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?|css|js)$).*)',
  ],
};
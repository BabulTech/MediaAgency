import { NextRequest, NextResponse } from 'next/server';

// A convenience redirect only. The API decides who may see what.
export function middleware(req: NextRequest) {
  if (req.cookies.has('mamp_session')) return NextResponse.next();
  return NextResponse.redirect(new URL('/login', req.url));
}

export const config = { matcher: ['/((?!login|_next|manifest.webmanifest|favicon.ico).*)'] };

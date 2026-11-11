import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return NextResponse.next();
  let response = NextResponse.next({ request });
  const client = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { cookies: { getAll: () => request.cookies.getAll(), setAll: (values) => values.forEach(({ name, value, options }) => { request.cookies.set(name, value); response = NextResponse.next({ request }); response.cookies.set(name, value, options); }) } });
  const { data: { user } } = await client.auth.getUser();
  if (!user && ["/", "/settings"].includes(request.nextUrl.pathname)) return NextResponse.redirect(new URL("/login", request.url));
  if (user && ["/login", "/signup"].includes(request.nextUrl.pathname)) return NextResponse.redirect(new URL("/", request.url));
  return response;
}

export const config = { matcher: ["/", "/login", "/signup", "/settings"] };

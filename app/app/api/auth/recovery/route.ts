import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseServerClient } from "../../../lib/supabase-server";

const recoveryCookie = "rr_recovery_session";

export async function GET() {
  const cookieStore = await cookies();
  const marker = cookieStore.get(recoveryCookie)?.value;
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  return NextResponse.json({ valid: marker === "1" && Boolean(user) });
}

export async function POST(request: Request) {
  const cookieStore = await cookies();
  if (cookieStore.get(recoveryCookie)?.value !== "1") return NextResponse.json({ error: "RECOVERY_SESSION_REQUIRED" }, { status: 401 });

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 }); }
  const payload = body as { password?: unknown; confirmPassword?: unknown };
  const password = typeof payload.password === "string" ? payload.password : "";
  const confirmPassword = typeof payload.confirmPassword === "string" ? payload.confirmPassword : "";
  if (password.length < 8 || password.length > 128) return NextResponse.json({ error: "PASSWORD_REQUIREMENTS" }, { status: 422 });
  if (password !== confirmPassword) return NextResponse.json({ error: "PASSWORDS_DO_NOT_MATCH" }, { status: 422 });

  const supabase = await getSupabaseServerClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return NextResponse.json({ error: "RECOVERY_SESSION_REQUIRED" }, { status: 401 });
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return NextResponse.json({ error: "PASSWORD_UPDATE_FAILED" }, { status: 400 });

  const response = NextResponse.json({ ok: true });
  response.cookies.set(recoveryCookie, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 0, path: "/reset-password" });
  return response;
}

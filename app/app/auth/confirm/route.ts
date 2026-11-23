import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServerClient } from "../../lib/supabase-server";

const recoveryCookie = "rr_recovery_session";

function failure(request: NextRequest) {
  return NextResponse.redirect(new URL("/forgot-password?error=recovery_invalid", request.url));
}

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type") as EmailOtpType | null;

  if (process.env.NODE_ENV !== "production") {
    console.info("[auth recovery] confirm reached", { tokenHashPresent: Boolean(tokenHash), type });
  }
  if (!tokenHash || type !== "recovery") return failure(request);

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
  if (process.env.NODE_ENV !== "production") {
    console.info("[auth recovery] verifyOtp completed", { succeeded: !error });
  }
  if (error) return failure(request);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return failure(request);

  const response = NextResponse.redirect(new URL("/reset-password", request.url));
  response.cookies.set(recoveryCookie, "1", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 15 * 60,
    // The reset page validates through /api/auth/recovery, so the marker must
    // be available to both the page and its API route.
    path: "/",
  });
  if (process.env.NODE_ENV !== "production") {
    console.info("[auth recovery] session established; redirecting to reset-password", { markerCreated: true, userPresent: true });
  }
  return response;
}

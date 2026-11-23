import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { billingRecoveryPath, isBillingEligible } from "./app/lib/billing-status";

const protectedPaths = ["/dashboard", "/settings", "/direct-mail", "/admin"];
const billingPaths = ["/checkout", "/onboarding", "/billing"];

async function billingRedirect(request: NextRequest, response: NextResponse, userId: string, path: string) {
  if (process.env.BILLING_ENFORCEMENT_ENABLED !== "true") return null;
  const client = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookies: { getAll: () => request.cookies.getAll(), setAll: () => undefined } });
  const { data: membership } = await client.from("memberships").select("workspace_id").eq("user_id", userId).order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (!membership?.workspace_id) return NextResponse.redirect(new URL("/checkout", request.url));
  const { data: workspace, error } = await client.from("workspaces").select("subscription_status,onboarding_completed_at").eq("id", membership.workspace_id).single();
  if (error || !workspace) return NextResponse.redirect(new URL("/billing", request.url));
  const eligible = isBillingEligible(workspace.subscription_status);
  if (!eligible && path !== "/checkout" && path !== "/billing") return NextResponse.redirect(new URL(billingRecoveryPath(workspace.subscription_status), request.url));
  if (eligible && !workspace.onboarding_completed_at && path !== "/onboarding" && path !== "/settings") return NextResponse.redirect(new URL("/onboarding", request.url));
  if (eligible && workspace.onboarding_completed_at && (path === "/checkout" || path === "/billing" || path === "/onboarding")) return NextResponse.redirect(new URL("/dashboard", request.url));
  return null;
}

export async function proxy(request: NextRequest) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return NextResponse.next();
  let response = NextResponse.next({ request });
  const client = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { cookies: { getAll: () => request.cookies.getAll(), setAll: (values) => values.forEach(({ name, value, options }) => { request.cookies.set(name, value); response = NextResponse.next({ request }); response.cookies.set(name, value, options); }) } });
  const { data: { user } } = await client.auth.getUser();
  const path = request.nextUrl.pathname;
  const isAdminPath = path === "/admin" || path.startsWith("/admin/");
  const recoveryError = request.nextUrl.searchParams.get("error_code");
  if (path === "/" && request.nextUrl.searchParams.get("error") === "access_denied" && (recoveryError === "otp_expired" || recoveryError === "access_denied")) {
    return NextResponse.redirect(new URL("/forgot-password?error=recovery_invalid", request.url));
  }
  if (!user && ([...billingPaths].includes(path) || path === "/dashboard" || path === "/settings" || path === "/direct-mail" || isAdminPath)) return NextResponse.redirect(new URL("/login", request.url));
  if (user) {
    if (["/login", "/signup"].includes(path)) {
      const redirect = await billingRedirect(request, response, user.id, "/dashboard");
      return redirect || NextResponse.redirect(new URL("/dashboard", request.url));
    }
    if (!isAdminPath && [...protectedPaths, ...billingPaths].includes(path)) {
      const redirect = await billingRedirect(request, response, user.id, path);
      if (redirect) return redirect;
    }
  }
  return response;
}

export const config = { matcher: ["/", "/dashboard", "/login", "/signup", "/settings", "/direct-mail", "/checkout", "/onboarding", "/billing", "/admin/:path*"] };

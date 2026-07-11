import { verifyJWT, respond } from "./_auth.js";

/**
 * POST /api/auth — pont SSO → legacy.
 * GET /api/auth?flow=salesforce — stub OAuth Salesforce.
 */
export async function POST(request) {
  const user = await verifyJWT(request);
  if (!user) {
    return respond(401, { error: "Unauthorized" });
  }

  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) {
    return respond(500, { error: "Server misconfiguration: DASHBOARD_PASSWORD not set" });
  }

  return new Response(null, {
    status: 204,
    headers: {
      "Set-Cookie": `xos_auth=${password}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`,
    },
  });
}

export async function GET(request) {
  const url = new URL(request.url);
  if (url.searchParams.get("flow") === "salesforce") {
    const redirect = new URL("/", url.origin);
    redirect.searchParams.set("auth_error", "sf_coming_soon");
    return Response.redirect(redirect.toString(), 302);
  }

  return new Response(JSON.stringify({ error: "invalid_flow" }), {
    status: 400,
    headers: { "Content-Type": "application/json" },
  });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
    },
  });
}

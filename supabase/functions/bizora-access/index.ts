import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
function response(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const secretKeys = (() => {
  try { return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}"); }
  catch { return {}; }
})();
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
  secretKeys.default || Object.values(secretKeys)[0] as string | undefined;
const admin = createClient(supabaseUrl, serviceKey || "", {
  auth: { autoRefreshToken: false, persistSession: false },
});
// Secret used to hash owner codes and client IPs. Set BIZORA_HASH_PEPPER so that rotating the
// Supabase service key does not invalidate every owner code. Without it we fall back to the
// service key, which keeps existing hashes valid.
const hashPepper = Deno.env.get("BIZORA_HASH_PEPPER") || String(serviceKey);

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((v) => v.toString(16).padStart(2, "0")).join("");
}
async function authenticatedUser(req: Request) {
  const header = req.headers.get("Authorization") || "";
    const token = (header.toLowerCase().startsWith("bearer ") ? header.slice(7) : header).trim();
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  return error ? null : data.user;
}
async function requireOwner(userId: string, organizationId: string) {
  const { data, error } = await admin.from("memberships").select("id")
    .eq("organization_id", organizationId).eq("user_id", userId)
    .eq("role", "owner").eq("is_active", true).maybeSingle();
  if (error) throw new Error("Unable to verify owner permission");
  return Boolean(data);
}
function getIp(req: Request) {
  return req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-real-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown-client";
}
const WORKER_ROLES = ["staff", "cashier", "manager"];
function newWorkerCode() {
  const digits = new Uint8Array(8);
  crypto.getRandomValues(digits);
  return [...digits].map((v) => String(v % 10)).join("");
}
const workerCodeHash = (code: string) => sha256(hashPepper + ":bizora-worker-code:" + code);
// Saves a fresh unique code for a worker; retries on the (very rare) collision with another worker's code.
async function saveWorkerCode(organizationId: string, userId: string) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = newWorkerCode();
    const { error } = await admin.from("worker_access_codes").upsert({
      organization_id: organizationId, user_id: userId,
      code_hash: await workerCodeHash(code), updated_at: new Date().toISOString(),
    }, { onConflict: "organization_id,user_id" });
    if (!error) return code;
    if (error.code !== "23505") { console.error("Worker code save failed", error.message); return null; }
  }
  return null;
}
async function workerCodeLogin(req: Request, body: Record<string, unknown>) {
  const code = String(body.code || "").trim();
  if (code.length !== 8 || [...code].some((digit) => digit < "0" || digit > "9")) {
    return response({ error: "Invalid worker code." }, 400);
  }
  const ipHash = await sha256(hashPepper + ":bizora-worker-ip:" + getIp(req));
  const { data: allowed, error: rateError } = await admin.rpc(
    "bizora_owner_code_rate_limit", { p_ip_hash: ipHash, p_success: null },
  );
  if (rateError || allowed !== true) {
    return response({ error: "Too many attempts. Try again in 15 minutes." }, 429);
  }
  const { data: record } = await admin.from("worker_access_codes")
    .select("organization_id,user_id").eq("code_hash", await workerCodeHash(code)).maybeSingle();
  const fail = async (status: number, message: string) => {
    await admin.rpc("bizora_owner_code_rate_limit", { p_ip_hash: ipHash, p_success: false });
    return response({ error: message }, status);
  };
  if (!record) return await fail(401, "The code is incorrect.");
  const { data: membership } = await admin.from("memberships").select("id")
    .eq("organization_id", record.organization_id).eq("user_id", record.user_id)
    .in("role", WORKER_ROLES).eq("is_active", true).maybeSingle();
  if (!membership) return await fail(403, "This account is not active. Ask the shop owner.");
  const { data: account } = await admin.auth.admin.getUserById(record.user_id);
  const email = account?.user?.email;
  if (!email) return await fail(403, "Account could not be verified.");
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = linkData?.properties?.hashed_token;
  if (linkError || !tokenHash) {
    console.error("Worker code session exchange failed", linkError?.message);
    return response({ error: "Could not start a secure session." }, 500);
  }
  await admin.rpc("bizora_owner_code_rate_limit", { p_ip_hash: ipHash, p_success: true });
  return response({ token_hash: tokenHash, organization_id: record.organization_id,
    name: account?.user?.user_metadata?.display_name || "" });
}

async function authenticatedAction(req: Request, body: Record<string, unknown>) {
  const user = await authenticatedUser(req);
  if (!user) return response({ error: "Authentication required." }, 401);
  const action = String(body.action || "");
  const organizationId = String(body.organization_id || "");
  if (!organizationId) return response({ error: "Organization is required." }, 400);
  if (!await requireOwner(user.id, organizationId)) {
    return response({ error: "Owner permission required." }, 403);
  }

  if (action === "list_workers") {
    const { data: memberships, error } = await admin.from("memberships")
      .select("id,user_id,role,is_active,created_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) return response({ error: "Could not load team accounts." }, 500);
    // Fetch only this organization's accounts (listUsers would scan every tenant and stop at 1000).
    const accounts = await Promise.all((memberships || []).map(async (membership) => {
      const { data } = await admin.auth.admin.getUserById(membership.user_id);
      return [membership.user_id, data?.user] as const;
    }));
    const usersById = new Map(accounts);
    const { data: codeRows } = await admin.from("worker_access_codes")
      .select("user_id").eq("organization_id", organizationId);
    const withCode = new Set((codeRows || []).map((row: { user_id: string }) => row.user_id));
    const workers = (memberships || []).map((membership) => {
      const account = usersById.get(membership.user_id);
      return {
        membership_id: membership.id, user_id: membership.user_id, has_code: withCode.has(membership.user_id),
        role: membership.role, is_active: membership.is_active,
        created_at: membership.created_at, email: account?.email || "",
        name: account?.user_metadata?.display_name || account?.user_metadata?.full_name || "",
      };
    });
    return response({ workers });
  }

  if (action === "create_worker") {
    const name = String(body.name || "").trim();
    const role = String(body.role || "staff");
    if (name.length < 2 || name.length > 100) {
      return response({ error: "Worker name must contain 2 to 100 characters." }, 400);
    }
    if (!["staff", "cashier"].includes(role)) {
      return response({ error: "Unsupported worker role." }, 400);
    }
    // Workers have no email or password: the account gets an internal address and signs in with a code.
    const email = "w-" + crypto.randomUUID() + "@workers.bizora.app";
    const password = crypto.randomUUID() + crypto.randomUUID();
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { display_name: name, login_type: "code" },
    });
    if (createError || !created.user) {
      return response({ error: createError?.message || "Could not create worker account." }, 400);
    }
    const { error: membershipError } = await admin.from("memberships").insert({
      organization_id: organizationId, user_id: created.user.id, role, is_active: true,
    });
    if (membershipError) {
      await admin.auth.admin.deleteUser(created.user.id);
      console.error("Worker membership creation failed", membershipError.message);
      return response({ error: "Membership failed; the new account was rolled back." }, 500);
    }
    const code = await saveWorkerCode(organizationId, created.user.id);
    if (!code) {
      await admin.auth.admin.deleteUser(created.user.id);
      return response({ error: "Could not create the worker code." }, 500);
    }
    return response({ worker: { user_id: created.user.id, name, role, is_active: true }, code }, 201);
  }

  if (action === "reset_worker_code") {
    const workerId = String(body.user_id || "");
    if (!workerId) return response({ error: "Worker account is required." }, 400);
    const { data: member } = await admin.from("memberships").select("id")
      .eq("organization_id", organizationId).eq("user_id", workerId).in("role", WORKER_ROLES).maybeSingle();
    if (!member) return response({ error: "Worker account was not found." }, 404);
    const code = await saveWorkerCode(organizationId, workerId);
    if (!code) return response({ error: "Could not create the worker code." }, 500);
    const { data: account } = await admin.auth.admin.getUserById(workerId);
    return response({ code, name: account?.user?.user_metadata?.display_name || "" });
  }

  if (action === "reactivate_worker") {
    const workerId = String(body.user_id || "");
    if (!workerId) return response({ error: "Worker account is required." }, 400);
    const { data, error } = await admin.from("memberships").update({ is_active: true })
      .eq("organization_id", organizationId).eq("user_id", workerId)
      .in("role", ["staff", "cashier", "manager"]).select("id").maybeSingle();
    if (error) return response({ error: "Could not reactivate the worker." }, 500);
    if (!data) return response({ error: "Worker account was not found." }, 404);
    return response({ ok: true });
  }
  if (action === "deactivate_worker") {
    const workerId = String(body.user_id || "");
    if (!workerId) return response({ error: "Worker account is required." }, 400);
    const { data, error } = await admin.from("memberships").update({ is_active: false })
      .eq("organization_id", organizationId).eq("user_id", workerId)
      .in("role", ["staff", "cashier", "manager"]).select("id").maybeSingle();
    if (error) return response({ error: "Could not deactivate the worker." }, 500);
    if (!data) return response({ error: "Worker account was not found." }, 404);
    return response({ ok: true });
  }
  return response({ error: "Unknown action." }, 400);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return response({ error: "Method not allowed." }, 405);
  try {
    const body = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return response({ error: "Invalid request body." }, 400);
    }
    if (body.action === "owner_code_login") return response({ error: "Admin code login has been retired. Sign in with email and password." }, 410);
    if (body.action === "worker_code_login") return await workerCodeLogin(req, body);
    return await authenticatedAction(req, body);
  } catch (error) {
    console.error("Bizora access function error", error);
    return response({ error: "Unexpected access service error." }, 500);
  }
});

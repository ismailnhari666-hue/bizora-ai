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

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((v) => v.toString(16).padStart(2, "0")).join("");
}
async function authenticatedUser(req: Request) {
  const header = req.headers.get("Authorization") || "";
  const token = header.replace(/^Bearer\\s+/i, "").trim();
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
async function ownerCodeLogin(req: Request, body: Record<string, unknown>) {
  const code = String(body.code || "").replace(/\\s/g, "");
  if (!/^\\d{12}$/.test(code)) return response({ error: "Invalid access code." }, 400);
  const ipHash = await sha256(String(serviceKey) + ":bizora-owner-ip:" + getIp(req));
  const { data: allowed, error: rateError } = await admin.rpc(
    "bizora_owner_code_rate_limit", { p_ip_hash: ipHash, p_success: null },
  );
  if (rateError || allowed !== true) {
    return response({ error: "Too many attempts. Try again in 15 minutes." }, 429);
  }

  const codeHash = await sha256(String(serviceKey) + ":bizora-owner-code:" + code);
  const { data: record, error } = await admin.from("owner_access_codes")
    .select("organization_id,user_id").eq("code_hash", codeHash).maybeSingle();
  if (error || !record) {
    await admin.rpc("bizora_owner_code_rate_limit", { p_ip_hash: ipHash, p_success: false });
    return response({ error: "The access code is incorrect." }, 401);
  }

  const { data: membership, error: membershipError } = await admin.from("memberships")
    .select("id").eq("organization_id", record.organization_id)
    .eq("user_id", record.user_id).eq("role", "owner")
    .eq("is_active", true).maybeSingle();
  if (membershipError || !membership) {
    await admin.rpc("bizora_owner_code_rate_limit", { p_ip_hash: ipHash, p_success: false });
    return response({ error: "Owner access is unavailable." }, 403);
  }

  const { data: ownerResult, error: ownerError } = await admin.auth.admin.getUserById(record.user_id);
  const email = ownerResult?.user?.email;
  if (ownerError || !email) return response({ error: "Owner account could not be verified." }, 403);

  const { data: linkData, error: linkError } =
    await admin.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = linkData?.properties?.hashed_token;
  if (linkError || !tokenHash) {
    console.error("Owner code session exchange failed", linkError?.message);
    return response({ error: "Could not start a secure owner session." }, 500);
  }
  await admin.rpc("bizora_owner_code_rate_limit", { p_ip_hash: ipHash, p_success: true });
  return response({ token_hash: tokenHash, organization_id: record.organization_id });
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

  if (action === "owner_code_status") {
    const { data, error } = await admin.from("owner_access_codes").select("organization_id")
      .eq("organization_id", organizationId).eq("user_id", user.id).maybeSingle();
    if (error) return response({ error: "Could not check owner code status." }, 500);
    return response({ has_code: Boolean(data) });
  }

  if (action === "rotate_owner_code") {
    const digits = new Uint8Array(12);
    crypto.getRandomValues(digits);
    const code = [...digits].map((v) => String(v % 10)).join("");
    const codeHash = await sha256(String(serviceKey) + ":bizora-owner-code:" + code);
    const { error } = await admin.from("owner_access_codes").upsert({
      organization_id: organizationId, user_id: user.id,
      code_hash: codeHash, updated_at: new Date().toISOString(),
    }, { onConflict: "organization_id" });
    if (error) {
      console.error("Owner code save failed", error.message);
      return response({ error: "Could not save the owner access code." }, 500);
    }
    return response({ code });
  }

  if (action === "list_workers") {
    const { data: memberships, error } = await admin.from("memberships")
      .select("id,user_id,role,is_active,created_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false });
    if (error) return response({ error: "Could not load team accounts." }, 500);
    const { data: userPage, error: usersError } =
      await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (usersError) return response({ error: "Could not load account details." }, 500);
    const usersById = new Map((userPage.users || []).map((item) => [item.id, item]));
    const workers = (memberships || []).map((membership) => {
      const account = usersById.get(membership.user_id);
      return {
        membership_id: membership.id, user_id: membership.user_id,
        role: membership.role, is_active: membership.is_active,
        created_at: membership.created_at, email: account?.email || "",
        name: account?.user_metadata?.display_name || account?.user_metadata?.full_name || "",
      };
    });
    return response({ workers });
  }

  if (action === "create_worker") {
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const name = String(body.name || "").trim();
    const role = String(body.role || "staff");
    if (!/^\\S+@\\S+\\.\\S+$/.test(email)) {
      return response({ error: "Enter a valid worker email address." }, 400);
    }
    if (password.length < 10) {
      return response({ error: "Temporary password must contain at least 10 characters." }, 400);
    }
    if (name.length < 2 || name.length > 100) {
      return response({ error: "Worker name must contain 2 to 100 characters." }, 400);
    }
    if (!["staff", "cashier"].includes(role)) {
      return response({ error: "Unsupported worker role." }, 400);
    }
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { display_name: name },
    });
    if (createError || !created.user) {
      return response({ error: createError?.message || "Could not create worker account." }, 400);
    }
    const { error: membershipError } = await admin.from("memberships").insert({
      organization_id: organizationId, user_id: created.user.id,
      role, is_active: true,
    });
    if (membershipError) {
      await admin.auth.admin.deleteUser(created.user.id);
      console.error("Worker membership creation failed", membershipError.message);
      return response({ error: "Membership failed; the new account was rolled back." }, 500);
    }
    return response({ worker: {
      user_id: created.user.id, email, name, role, is_active: true,
    } }, 201);
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
    if (body.action === "owner_code_login") return await ownerCodeLogin(req, body);
    return await authenticatedAction(req, body);
  } catch (error) {
    console.error("Bizora access function error", error);
    return response({ error: "Unexpected access service error." }, 500);
  }
});

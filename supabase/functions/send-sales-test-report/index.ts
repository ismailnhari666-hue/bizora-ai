import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const cors = {
  "content-type": "application/json",
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, x-client-info, x-supabase-api-version, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: cors });

const url = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Meta rejects template parameters that contain new lines, tabs or 4+ consecutive spaces (error 132018).
const flatten = (text: string) => text.replace(/\s*[\r\n\t]+\s*/g, " | ").replace(/ {2,}/g, " ");

function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("ar-MA", {
      style: "currency", currency, maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return amount.toFixed(2) + " " + currency;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);

  const authHeader = req.headers.get("authorization") || "";
  const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!jwt) return json({ error: "Authentication required" }, 401);

  const { data: userData, error: userError } = await admin.auth.getUser(jwt);
  if (userError || !userData.user) return json({ error: "Invalid session" }, 401);

  let input: { recipient?: string; organization_id?: string; confirm_send?: boolean };
  try { input = await req.json(); }
  catch { return json({ error: "Invalid JSON body" }, 400); }

  const recipient = String(input.recipient || "").replace(/[\s()-]/g, "");
  if (!/^\+?[1-9]\d{7,14}$/.test(recipient)) {
    return json({ error: "Enter a valid WhatsApp number in international format (E.164)" }, 400);
  }

  const organizationId = String(input.organization_id || "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(organizationId)) {
    return json({ error: "A valid organization_id is required" }, 400);
  }

  const { data: membership, error: membershipError } = await admin
    .from("memberships").select("organization_id, role")
    .eq("user_id", userData.user.id).eq("organization_id", organizationId)
    .eq("is_active", true).eq("role", "owner").limit(1).maybeSingle();

  if (membershipError) return json({ error: "Could not verify organization access" }, 500);
  if (!membership) return json({ error: "Only an active organization owner can run a sales test" }, 403);

  const { data: org, error: orgError } = await admin
    .from("organizations").select("id, name, currency, timezone")
    .eq("id", membership.organization_id).single();
  if (orgError || !org) return json({ error: "Organization not found" }, 404);

  const end = new Date();
  const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
  const { data: sales, error: salesError } = await admin
    .from("sales").select("id, total, created_at")
    .eq("organization_id", org.id).eq("status", "completed")
    .gte("created_at", start.toISOString()).lt("created_at", end.toISOString())
    .order("created_at", { ascending: false });
  if (salesError) return json({ error: "Could not read sales data" }, 500);

  const saleIds = (sales || []).map((sale: any) => sale.id);
  let items: any[] = [];
  if (saleIds.length) {
    const { data, error } = await admin.from("sale_items")
      .select("sale_id, product_name, quantity, line_total")
      .eq("organization_id", org.id).in("sale_id", saleIds);
    if (error) return json({ error: "Could not read sale item details" }, 500);
    items = data || [];
  }

  const total = (sales || []).reduce((sum: number, sale: any) => sum + Number(sale.total || 0), 0);
  const quantities = new Map<string, number>();
  for (const item of items) {
    const name = String(item.product_name || "منتج غير مسمى");
    quantities.set(name, (quantities.get(name) || 0) + Number(item.quantity || 0));
  }
  const top = [...quantities.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const report = [
    "🧪 تقرير Bizora التجريبي — المبيعات فقط",
    org.name, "الفترة: آخر 24 ساعة",
    "عدد عمليات البيع المكتملة: " + (sales || []).length,
    "إجمالي المبيعات: " + formatMoney(total, org.currency || "MAD"),
    "المنتجات الأكثر مبيعاً:",
    ...(top.length ? top.map(([name, qty], i) => (i + 1) + ". " + name + ": " + qty) : ["لا توجد تفاصيل منتجات مسجلة"]),
    "هذا اختبار مستقل؛ لا يتضمن بيانات الكاميرات ولا يغيّر التقرير اليومي.",
  ].join("\n").slice(0, 950);

  if (input.confirm_send !== true) {
    return json({
      ok: true, mode: "preview_only", sent: false,
      recipient_masked: recipient.slice(0, 3) + "••••" + recipient.slice(-3),
      period_start: start.toISOString(), period_end: end.toISOString(),
      sales_count: (sales || []).length, total_sales: total,
      currency: org.currency || "MAD", message_preview: report,
      next_step: "Review the preview, then explicitly call again with confirm_send=true to send once.",
    });
  }

  const token = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
  const phoneId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
  const template = Deno.env.get("WHATSAPP_TEMPLATE_NAME");
  const language = Deno.env.get("WHATSAPP_TEMPLATE_LANGUAGE") || "ar";
  const version = Deno.env.get("WHATSAPP_GRAPH_VERSION") || "v26.0";
  if (!token || !phoneId || !template) {
    console.error("sales_test_send_config_missing", {
      token_present: !!token, phone_id_present: !!phoneId, template_present: !!template,
    });
    return json({ ok: false, sent: false, stage: "configuration",
      error: "WhatsApp credentials or approved template are not configured" }, 503);
  }

  let response: Response;
  try {
    response = await fetch(`https://graph.facebook.com/${version}/${phoneId}/messages`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp", recipient_type: "individual",
        to: recipient.replace(/^\+/, ""), type: "template",
        template: { name: template, language: { code: language },
          components: [{ type: "body", parameters: [{ type: "text", text: flatten(report) }] }] },
      }),
      signal: AbortSignal.timeout(12000),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("sales_test_meta_fetch_failed", {
      error_name: error instanceof Error ? error.name : "UnknownError",
      error_message: message.slice(0, 240),
    });
    return json({
      ok: false, sent: false, stage: "meta_network",
      error: "Could not reach Meta WhatsApp API from the server",
      detail: message.slice(0, 180),
      safe_to_retry: true,
    }, 502);
  }

  const raw = await response.text();
  let result: any = {};
  try { result = raw ? JSON.parse(raw) : {}; }
  catch { result = { raw_response: raw.slice(0, 300) }; }

  if (!response.ok) {
    console.error("sales_test_meta_rejected", {
      http_status: response.status,
      error_code: result?.error?.code ?? null,
      error_subcode: result?.error?.error_subcode ?? null,
      error_type: result?.error?.type ?? null,
      error_message: String(result?.error?.message || "No provider message").slice(0, 240),
      fbtrace_id: result?.error?.fbtrace_id ?? null,
    });
    return json({
      ok: false, sent: false, stage: "meta_rejected",
      provider_http_status: response.status,
      provider_error: result?.error?.message || "WhatsApp API rejected the request",
      provider_error_code: result?.error?.code ?? null,
      provider_error_subcode: result?.error?.error_subcode ?? null,
      provider_trace_id: result?.error?.fbtrace_id ?? null,
      safe_to_retry: response.status >= 500,
    }, 502);
  }

  const accepted = Array.isArray(result?.messages) && result.messages.length > 0;
  return json({
    ok: true, sent: accepted, provider: "Meta WhatsApp Cloud API",
    provider_accepted: accepted,
    provider_message_id: result?.messages?.[0]?.id || null,
    delivery_status: accepted ? "accepted_by_meta_not_yet_confirmed_delivered" : "meta_response_without_message_id",
    recipient_masked: recipient.slice(0, 3) + "••••" + recipient.slice(-3),
    sales_count: (sales || []).length, total_sales: total, currency: org.currency || "MAD",
  });
});

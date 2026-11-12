import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "content-type": "application/json",
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type, x-hub-signature-256",
  "access-control-allow-methods": "GET, POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders });

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function validMetaSignature(rawBody: string, signature: string | null, appSecret: string): Promise<boolean> {
  if (!signature?.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  return hex(new Uint8Array(mac)) === signature.slice(7).toLowerCase();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const verifyToken = Deno.env.get("WHATSAPP_VERIFY_TOKEN");
  if (!verifyToken) {
    return json({ error: "WhatsApp verification token is not configured" }, 500);
  }

  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && token === verifyToken && challenge) {
      return new Response(challenge, { status: 200, headers: { "content-type": "text/plain" } });
    }
    return json({ error: "Webhook verification failed" }, 403);
  }

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const appSecret = Deno.env.get("META_APP_SECRET");
  if (!appSecret) {
    return json({ error: "Meta app secret is not configured" }, 500);
  }

  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature-256");
  if (!(await validMetaSignature(rawBody, signature, appSecret))) {
    return json({ error: "Invalid webhook signature" }, 401);
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  if (payload.object !== "whatsapp_business_account") {
    return json({ received: true, ignored: true });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  // User-configured secret name (SUPABASE_ prefix is reserved by Supabase).
  const supabaseKey =
    Deno.env.get("MY_SUPABASE_SECRET") ??
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseKey) {
    return json({ error: "Backend configuration missing" }, 500);
  }
  const supabase = createClient(supabaseUrl, supabaseKey);

  const rows: any[] = [];
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {};
      const displayPhone = value.metadata?.display_phone_number ?? null;
      for (const message of value.messages ?? []) {
        const text =
          message.text?.body ??
          message.button?.text ??
          message.interactive?.button_reply?.title ??
          message.interactive?.list_reply?.title ??
          null;
        rows.push({
          whatsapp_message_id: message.id,
          wa_id: message.from ?? value.contacts?.[0]?.wa_id ?? null,
          display_phone_number: displayPhone,
          message_type: message.type ?? "unknown",
          message_text: text,
          message_timestamp: message.timestamp
            ? new Date(Number(message.timestamp) * 1000).toISOString()
            : null,
          raw_payload: { entry_id: entry.id, field: change.field, message },
        });
      }
    }
  }

  if (rows.length > 0) {
    const { error } = await supabase
      .from("whatsapp_inbound_messages")
      .upsert(rows, { onConflict: "whatsapp_message_id", ignoreDuplicates: true });
    if (error) {
      console.error("Failed to save WhatsApp messages", error);
      return json({ error: "Could not save messages" }, 500);
    }
  }

  return json({ received: true, saved_messages: rows.length });
});

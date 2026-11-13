import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const cors = {
  "content-type": "application/json",
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type, x-bizora-cron-secret",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: cors });
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// Meta rejects template parameters that contain new lines, tabs or 4+ consecutive spaces (error 132018).
const flatten = (text: string) => text.replace(/\s*[\r\n\t]+\s*/g, " | ").replace(/ {2,}/g, " ");

function partsInZone(date: Date, tz: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  return Object.fromEntries(parts.map((p) => [p.type, p.value]));
}
function todayInZone(tz: string) {
  const p = partsInZone(new Date(), tz);
  return `${p.year}-${p.month}-${p.day}`;
}
function dueNow(time: string, tz: string) {
  const p = partsInZone(new Date(), tz);
  const [hh, mm] = time.slice(0, 5).split(":").map(Number);
  const now = Number(p.hour) * 60 + Number(p.minute);
  const due = hh * 60 + mm;
  return now >= due && now < due + 5;
}
function isoBounds(day: string, tz: string) {
  const [y, m, d] = day.split("-").map(Number);
  const offset = (at: Date) => {
    const p = partsInZone(at, tz);
    return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute)) - at.getTime();
  };
  const startGuess = new Date(Date.UTC(y, m - 1, d));
  const endGuess = new Date(Date.UTC(y, m - 1, d + 1));
  return {
    start: new Date(startGuess.getTime() - offset(startGuess)).toISOString(),
    end: new Date(endGuess.getTime() - offset(endGuess)).toISOString(),
  };
}
function money(n: number, currency: string) {
  try {
    return new Intl.NumberFormat("fr-MA", { style: "currency", currency }).format(n || 0);
  } catch {
    return `${(n || 0).toFixed(2)} ${currency}`;
  }
}
const statusLabels: Record<string, string> = {
  pending: "في الانتظار",
  preparing: "قيد التحضير",
  ready: "جاهز",
  served: "تقدم للزبون",
  completed: "مكتمل",
  cancelled: "ملغى",
};
const movementLabels: Record<string, string> = {
  opening: "مخزون افتتاحي",
  purchase: "مشتريات/دخول",
  sale: "مبيعات/خروج",
  adjustment: "تسوية",
  return: "مرتجعات",
  damage: "تالف",
};

async function sendWhatsApp(to: string, body: string) {
  const token = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
  const phoneId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
  const template = Deno.env.get("WHATSAPP_TEMPLATE_NAME");
  const language = Deno.env.get("WHATSAPP_TEMPLATE_LANGUAGE") || "ar";
  const version = Deno.env.get("WHATSAPP_GRAPH_VERSION") || "v26.0";
  if (!token || !phoneId || !template) {
    throw new Error("WhatsApp setup incomplete: access token, phone number ID and approved template are required");
  }
  const response = await fetch(`https://graph.facebook.com/${version}/${phoneId}/messages`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: to.replace(/^\+/, ""),
      type: "template",
      template: {
        name: template,
        language: { code: language },
        components: [{ type: "body", parameters: [{ type: "text", text: flatten(body).slice(0, 950) }] }],
      },
    }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result?.error?.message || `WhatsApp API error ${response.status}`);
  return result?.messages?.[0]?.id || null;
}

async function buildReport(settings: any, org: any, day: string) {
  const tz = settings.timezone || org.timezone || "Africa/Casablanca";
  const bounds = isoBounds(day, tz);
  const currency = org.currency || "MAD";
  const lines = [`📊 تقرير BIZORA — ${org.name}`, `📅 ${day}`];
  const snapshot: any = { day, currency, timezone: tz, period_start: bounds.start, period_end: bounds.end };

  if (settings.include_sales) {
    const { data, error } = await supabase.from("sales")
      .select("id,total,status")
      .eq("organization_id", org.id)
      .gte("created_at", bounds.start).lt("created_at", bounds.end);
    if (error) throw error;
    const completed = (data || []).filter((x: any) => x.status === "completed");
    const total = completed.reduce((sum: number, x: any) => sum + Number(x.total || 0), 0);
    snapshot.sales = { transactions: completed.length, total };
    lines.push(`💰 المبيعات المكتملة: ${money(total, currency)}`, `عدد عمليات البيع: ${completed.length}`);
  }

  // Camera traffic: only shown when the shop actually has camera events for the day.
  {
    const { data: events, error } = await supabase.from("camera_events")
      .select("event_type,event_count")
      .eq("organization_id", org.id)
      .gte("occurred_at", bounds.start).lt("occurred_at", bounds.end);
    if (error) throw error;
    const sums: Record<string, number> = {};
    for (const e of events || []) sums[e.event_type] = (sums[e.event_type] || 0) + Number(e.event_count || 0);
    const entered = (sums.person_entered || 0) + (sums.entry_count || 0);
    const exited = (sums.person_exited || 0) + (sums.exit_count || 0);
    const meals = sums.meal_dispatched || 0;
    const drinks = sums.drink_dispatched || 0;
    if ((events || []).length) {
      snapshot.traffic = { entered, exited, meals_dispatched: meals, drinks_dispatched: drinks };
      lines.push(`🚪 دخل: ${entered} — خرج: ${exited}`);
      if (meals || drinks) lines.push(`🍽️ وجبات خرجت: ${meals} — 🥤 مشروبات خرجت: ${drinks}`);
    }
  }

  if (settings.include_products) {
    const { data, error } = await supabase.from("sale_items")
      .select("product_name,quantity,sales!inner(organization_id,status,created_at)")
      .eq("sales.organization_id", org.id).eq("sales.status", "completed")
      .gte("sales.created_at", bounds.start).lt("sales.created_at", bounds.end);
    if (error) throw error;
    const ranks = new Map<string, number>();
    for (const row of data || []) ranks.set(row.product_name, (ranks.get(row.product_name) || 0) + Number(row.quantity || 0));
    const sorted = [...ranks.entries()].sort((a, b) => b[1] - a[1]);
    snapshot.top_products = sorted.slice(0, 5).map(([name, quantity]) => ({ name, quantity }));
    lines.push("🏆 الأكثر مبيعاً:", ...(sorted.length
      ? sorted.slice(0, 4).map(([name, quantity], i) => `${i + 1}. ${name}: ${quantity}`)
      : ["لا توجد مبيعات مسجلة"]));
  }

  if (settings.include_orders) {
    const { data, error } = await supabase.from("orders")
      .select("id,status,total,table_label,customer_label,created_at,order_items(product_name,quantity,line_total)")
      .eq("organization_id", org.id)
      .gte("created_at", bounds.start).lt("created_at", bounds.end)
      .order("created_at", { ascending: true });
    if (error) throw error;
    const counts: Record<string, number> = {};
    const itemTotals = new Map<string, number>();
    for (const order of data || []) {
      counts[order.status] = (counts[order.status] || 0) + 1;
      for (const item of order.order_items || []) {
        const key = item.product_name || "منتج غير مسمى";
        itemTotals.set(key, (itemTotals.get(key) || 0) + Number(item.quantity || 0));
      }
    }
    const orderValue = (data || []).reduce((sum: number, order: any) => sum + Number(order.total || 0), 0);
    snapshot.orders = {
      count: (data || []).length,
      status_counts: counts,
      total_value: orderValue,
      items: [...itemTotals.entries()].map(([name, quantity]) => ({ name, quantity })),
      records: (data || []).map((o: any) => ({
        id: o.id, status: o.status, total: Number(o.total || 0),
        table: o.table_label, customer: o.customer_label,
        items: (o.order_items || []).map((i: any) => ({
          name: i.product_name, quantity: Number(i.quantity || 0), total: Number(i.line_total || 0),
        })),
      })),
    };
    lines.push(`🧾 الطلبات: ${(data || []).length} — ${money(orderValue, currency)}`);
    for (const [status, count] of Object.entries(counts)) {
      lines.push(`• ${statusLabels[status] || status}: ${count}`);
    }
    const itemSummary = [...itemTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    if (itemSummary.length) lines.push("تفاصيل المنتجات المطلوبة:", ...itemSummary.map(([name, qty]) => `• ${name}: ${qty}`));
  }

  if (settings.include_stock) {
    const { data: products, error: productsError } = await supabase.from("products")
      .select("name,stock_quantity,low_stock_threshold")
      .eq("organization_id", org.id).eq("is_active", true)
      .order("stock_quantity", { ascending: true });
    if (productsError) throw productsError;
    const low = (products || []).filter((p: any) => Number(p.stock_quantity) <= Number(p.low_stock_threshold));
    snapshot.low_stock = low.map((p: any) => ({ name: p.name, quantity: Number(p.stock_quantity) }));
    lines.push(`📦 منتجات مخزونها منخفض: ${low.length}`,
      ...low.slice(0, 4).map((p: any) => `• ${p.name}: ${p.stock_quantity}`));

    const { data: movements, error: movementError } = await supabase.from("stock_movements")
      .select("movement_type,quantity_change,products(name)")
      .eq("organization_id", org.id)
      .gte("created_at", bounds.start).lt("created_at", bounds.end);
    if (movementError) throw movementError;
    let inbound = 0, outbound = 0;
    const movementCounts: Record<string, { count: number; quantity: number }> = {};
    const movedProducts = new Map<string, { inbound: number; outbound: number }>();
    for (const movement of movements || []) {
      const change = Number(movement.quantity_change || 0);
      if (change > 0) inbound += change;
      if (change < 0) outbound += Math.abs(change);
      const type = movement.movement_type || "other";
      movementCounts[type] ||= { count: 0, quantity: 0 };
      movementCounts[type].count += 1;
      movementCounts[type].quantity += Math.abs(change);
      const productName = movement.products?.name || "منتج";
      movedProducts.set(productName, movedProducts.get(productName) || { inbound: 0, outbound: 0 });
      if (change > 0) movedProducts.get(productName)!.inbound += change;
      if (change < 0) movedProducts.get(productName)!.outbound += Math.abs(change);
    }
    snapshot.stock_movements = { inbound, outbound, by_type: movementCounts };
    lines.push(`📥 الكمية الداخلة للمخزون: ${inbound}`, `📤 الكمية الخارجة من المخزون: ${outbound}`);
    for (const [type, values] of Object.entries(movementCounts)) {
      lines.push(`• ${movementLabels[type] || type}: ${values.count} حركة / ${values.quantity} وحدة`);
    }
    const topMoved = [...movedProducts.entries()].slice(0, 3);
    if (topMoved.length) {
      lines.push("أبرز حركة المنتجات:", ...topMoved.map(([name, v]) => `• ${name}: +${v.inbound} / -${v.outbound}`));
    }
  }

  if (settings.include_profit) {
    const { data: profit, error: profitError } = await supabase.rpc("bizora_profit_summary_service", {
      p_org: org.id, p_from: day, p_to: day,
    });
    if (profitError || !profit) {
      lines.push("ℹ️ الربح الصافي غير متاح حالياً.");
    } else {
      snapshot.profit = profit;
      lines.push(
        `📈 الربح الصافي: ${money(Number(profit.net_profit), currency)}`,
        `التكلفة: ${money(Number(profit.cogs), currency)} — المصاريف: ${money(Number(profit.expenses), currency)}`,
      );
      if (Number(profit.items_without_cost) > 0) lines.push("ℹ️ بعض المنتجات بلا ثمن تكلفة: الربح غير كامل.");
    }
  }

  {
    const { data: counts, error: countsError } = await supabase.from("cash_counts")
      .select("difference")
      .eq("organization_id", org.id)
      .gte("created_at", bounds.start).lt("created_at", bounds.end);
    if (countsError) throw countsError;
    if ((counts || []).length) {
      const diff = (counts || []).reduce((sum: number, c: any) => sum + Number(c.difference || 0), 0);
      snapshot.cash_counts = { count: counts!.length, difference: diff };
      lines.push(`💵 جرد الصندوق: ${counts!.length} — الفرق: ${money(diff, currency)}`);
    }
  }
  lines.push("التقرير مبني على العمليات المسجلة داخل Bizora خلال اليوم المحدد.");
  return { message: lines.join("\n").slice(0, 950), snapshot };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);

  const supplied = req.headers.get("x-bizora-cron-secret") || "";
  const { data: valid, error: authError } = await supabase.rpc(
    "bizora_verify_daily_report_cron_secret", { p_secret: supplied },
  );
  if (authError || valid !== true) return json({ error: "Unauthorized" }, 401);

  const { data: settingsRows, error } = await supabase.from("daily_report_settings")
    .select("*,organizations(id,name,currency,timezone)");
  if (error) return json({ error: error.message }, 500);

  const results: any[] = [];
  for (const settings of settingsRows || []) {
    const org = settings.organizations;
    if (!org) {
      results.push({ status: "skipped", reason: "organization_missing" });
      continue;
    }
    if (!settings.is_enabled) {
      results.push({ organization_id: org.id, status: "skipped", reason: "report_disabled" });
      continue;
    }
    if (!settings.whatsapp_opt_in) {
      results.push({ organization_id: org.id, status: "skipped", reason: "whatsapp_opt_in_required" });
      continue;
    }
    if (!settings.whatsapp_number) {
      results.push({ organization_id: org.id, status: "skipped", reason: "whatsapp_number_missing" });
      continue;
    }

    const tz = settings.timezone || org.timezone || "Africa/Casablanca";
    if (!dueNow(settings.send_time, tz)) {
      results.push({ organization_id: org.id, status: "skipped", reason: "not_send_time" });
      continue;
    }
    const day = todayInZone(tz);
    const { data: existing, error: readError } = await supabase.from("daily_report_delivery_log")
      .select("id,status").eq("organization_id", org.id).eq("report_date", day).maybeSingle();
    if (readError) {
      results.push({ organization_id: org.id, status: "log_read_error" });
      continue;
    }
    if (existing?.status === "sent" || existing?.status === "pending") {
      results.push({ organization_id: org.id, status: "already_processed" });
      continue;
    }

    let logId = existing?.id;
    if (!logId) {
      const { data: created, error: createError } = await supabase.from("daily_report_delivery_log")
        .insert({ organization_id: org.id, report_date: day, recipient: settings.whatsapp_number, status: "pending" })
        .select("id").single();
      if (createError) {
        results.push({ organization_id: org.id, status: "already_claimed_or_log_error" });
        continue;
      }
      logId = created.id;
    } else {
      const { error: resetError } = await supabase.from("daily_report_delivery_log")
        .update({ status: "pending", recipient: settings.whatsapp_number, attempted_at: new Date().toISOString(), error_message: null })
        .eq("id", logId);
      if (resetError) {
        results.push({ organization_id: org.id, status: "log_update_error" });
        continue;
      }
    }

    try {
      const report = await buildReport(settings, org, day);
      const messageId = await sendWhatsApp(settings.whatsapp_number, report.message);
      const { error: updateError } = await supabase.from("daily_report_delivery_log")
        .update({
          status: "sent", provider_message_id: messageId, report_snapshot: report.snapshot,
          sent_at: new Date().toISOString(), error_message: null,
        }).eq("id", logId);
      if (updateError) throw updateError;
      results.push({ organization_id: org.id, status: "sent", report_date: day });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown error";
      await supabase.from("daily_report_delivery_log")
        .update({ status: "failed", error_message: message }).eq("id", logId);
      results.push({ organization_id: org.id, status: "failed", error: message });
    }
  }

  return json({
    ok: true,
    settings_found: (settingsRows || []).length,
    results,
  });
});

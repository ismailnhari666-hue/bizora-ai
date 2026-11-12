// BIZORA AI — Supabase-connected starter. Publishable key is intended for browser use with RLS.
const SUPABASE_URL = "https://pywdltkplgvbxdejqext.supabase.co";
const SUPABASE_KEY = "sb_publishable_8IJRRATLzn3H4CLz1jXw3Q_LuIgS3pw";
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storage: window.localStorage }
});
const ownerUnlockKey = (organizationId, userId) => "bizora_owner_unlocked_"+userId+"_"+organizationId;
const ownerOrgKey = userId => "bizora_owner_org_id_"+userId;
const ownerRecoveryKey = userId => "bizora_owner_recovery_"+userId;
function clearBizoraAuthState(){
  for(let i=localStorage.length-1;i>=0;i--){const key=localStorage.key(i);if(key&&key.startsWith("bizora_owner_"))localStorage.removeItem(key);}
  for(let i=sessionStorage.length-1;i>=0;i--){const key=sessionStorage.key(i);if(key&&key.startsWith("bizora_owner_"))sessionStorage.removeItem(key);}
}
const $ = id => document.getElementById(id);
let mode="owner-code", user=null, orgs=[], orgId=null, products=[], currentPage="overview", currentRole=null, workerRefreshTimer=null;
const money=n=>new Intl.NumberFormat(window.BizoraI18n?.locale||"fr-MA",{style:"currency",currency:"MAD"}).format(Number(n||0));
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function toast(msg){$("toast").textContent=msg;$("toast").style.display="block";setTimeout(()=>$("toast").style.display="none",3200)}
function authMessage(msg){$("authMsg").textContent=msg}
function setAuthMode(next){
 mode=next;
 document.querySelectorAll(".tab[data-mode]").forEach(button=>button.classList.toggle("active",button.dataset.mode===next));
 const ownerCode=next==="owner-code";
 const ownerSignup=next==="owner-signup";
 $("emailField").classList.toggle("hidden",ownerCode);
 $("passwordField").classList.toggle("hidden",ownerCode);
 $("ownerCodeField").classList.toggle("hidden",!ownerCode);
 $("email").required=!ownerCode;
 $("password").required=!ownerCode;
 $("password").minLength=ownerSignup?10:6;
 $("password").autocomplete=ownerSignup?"new-password":"current-password";
 $("ownerCode").required=ownerCode;
 $("authSubmit").textContent=ownerCode?"دخول الإدارة":ownerSignup?"إنشاء حساب صاحب المحل":next==="owner-recovery"?"استرجاع كود الإدارة":"دخول واجهة العمل";
 $("ownerRecoveryToggle").classList.toggle("hidden",!ownerCode);
 authMessage("");
}
document.querySelectorAll(".tab[data-mode]").forEach(button=>button.onclick=()=>setAuthMode(button.dataset.mode));
setAuthMode("owner-code");
$("ownerRecoveryToggle").onclick=()=>setAuthMode("owner-recovery");

function showOwnerCodeModal(code){
 $("ownerCodeValue").textContent=String(code||"");
 $("ownerCodeModal").classList.remove("hidden");
}
$("copyOwnerCode").onclick=async()=>{
 try{await navigator.clipboard.writeText($("ownerCodeValue").textContent);toast("تم نسخ كود الإدارة");}
 catch{toast("تعذر النسخ تلقائياً. احتفظ بالكود يدوياً.");}
};
$("closeOwnerCode").onclick=()=>{$("ownerCodeModal").classList.add("hidden");$("ownerCodeValue").textContent="";};

$("authForm").onsubmit=async e=>{
 e.preventDefault();
 $("authSubmit").disabled=true;
 authMessage("جاري التحقق…");
 try{
  if(mode==="owner-code"){
      const code=$("ownerCode").value.trim();
   const result=await sb.functions.invoke("bizora-access",{body:{action:"owner_code_login",code}});
   if(result.error||!result.data?.token_hash){authMessage(result.data?.error||result.error?.message||"تعذر التحقق من كود الإدارة.");return;}
   const verified=await sb.auth.verifyOtp({token_hash:result.data.token_hash,type:"magiclink"});
   if(verified.error){authMessage(verified.error.message);return;}
   localStorage.setItem(ownerUnlockKey(result.data.organization_id,verified.data.user.id),"1");
   localStorage.setItem(ownerOrgKey(verified.data.user.id),result.data.organization_id);
   $("ownerCode").value="";
   await boot();
   return;
  }
  const email=$("email").value.trim(),password=$("password").value;
  if(mode==="owner-signup"){
   if(password.length<10){authMessage("كلمة المرور خاصها تكون 10 أحرف على الأقل.");return;}
   const redirectTo=location.origin+location.pathname;
   const result=await sb.auth.signUp({email,password,options:{emailRedirectTo:redirectTo}});
   if(result.error){authMessage(result.error.message);return;}
   if(result.data.session){
    authMessage("تم إنشاء الحساب بنجاح. أنشئ مساحة العمل ديال المحل.");
    await boot();
   }else{
    $("password").value="";
    authMessage("توصلت بطلب إنشاء الحساب. افتح رسالة التأكيد اللي وصلات لبريدك الإلكتروني، ومن بعد رجع للتطبيق وسجّل الدخول.");
   }
   return;
  }
  const result=await sb.auth.signInWithPassword({email,password});
  if(result.error){authMessage(result.error.message);return;}
  if(mode==="owner-recovery")localStorage.setItem(ownerRecoveryKey(result.data.user.id),"1");
  await boot();
 }catch(error){authMessage(error?.message||"وقع خطأ غير متوقع أثناء تسجيل الدخول.");}
 finally{$("authSubmit").disabled=false;}
};
$("logout").onclick=async()=>{clearBizoraAuthState();await sb.auth.signOut();location.reload()};
$("refresh").onclick=()=>loadPage(currentPage);
$("orgForm").onsubmit=async e=>{e.preventDefault();$("orgMsg").textContent="Création…";const {data,error}=await sb.rpc("bizora_create_organization",{p_name:$("orgName").value.trim()});if(error){$("orgMsg").textContent=error.message;return}toast("تم إنشاء المحل");try{const t=await sb.rpc("bizora_set_business_type",{p_org:data,p_type:$("orgType").value});if(t.error)console.warn("business_type:",t.error.message)}catch(e){console.warn("business_type:",e)}await loadOrganizations(data)};
$("orgSelect").onchange=async e=>{await loadOrganizations(e.target.value)};
document.querySelectorAll(".nav").forEach(b=>b.onclick=()=>{if(document.body.classList.contains("worker-mode"))return;loadPage(b.dataset.page)});
async function boot(){
 const {data:{session}}=await sb.auth.getSession();
 user=session?.user||null;
 if(!user){
  currentRole=null;orgs=[];orgId=null;
  window.BizoraI18n?.mount("guest");
  $("authView").classList.remove("hidden");$("appView").classList.add("hidden");
  setAuthMode("owner-code");
  return;
 }
 $("authView").classList.add("hidden");$("appView").classList.remove("hidden");
 $("userEmail").textContent=user.email||"Utilisateur";
 $("avatar").textContent=(user.email||"U")[0].toUpperCase();
 window.BizoraI18n?.mount(user.id);
 await loadOrganizations(localStorage.getItem(ownerOrgKey(user.id))||undefined);
}
async function accessRequest(body){
 const {data,error}=await sb.functions.invoke("bizora-access",{body});
 if(error||data?.error)throw new Error(data?.error||error?.message||"تعذر تنفيذ العملية.");
 return data||{};
}
async function loadOrganizations(preselect){
 const {data,error}=await sb.from("memberships")
  .select("organization_id,role,is_active,organizations(id,name,currency)")
  .eq("user_id",user.id);
 if(error){toast(error.message);return;}
 const memberships=(data||[]).filter(row=>row.organizations);
 const activeMemberships=memberships.filter(row=>row.is_active);
 if(!activeMemberships.length&&memberships.length){
  await sb.auth.signOut();user=null;clearBizoraAuthState();
  $("appView").classList.add("hidden");$("authView").classList.remove("hidden");
  authMessage("هذا الحساب موقوف من طرف صاحب المحل. تواصل معه لإعادة تفعيله.");
  return;
 }
 orgs=activeMemberships.map(row=>({...row.organizations,role:String(row.role||"").toLowerCase()}));
 if(!orgs.length){
  currentRole=null;orgId=null;document.body.classList.remove("worker-mode");
  $("orgSetup").classList.remove("hidden");$("content").innerHTML="";
  $("orgSelect").innerHTML="";
  $("navUsers").classList.add("hidden");
  return;
 }
 orgId=(preselect&&orgs.some(o=>o.id===preselect)?preselect:orgs[0].id);
 $("orgSelect").innerHTML=orgs.map(o=>'<option value="'+o.id+'">'+esc(o.name)+'</option>').join("");
 $("orgSelect").value=orgId;
 const activeOrg=orgs.find(o=>o.id===orgId);
 currentRole=activeOrg.role;
 const workerOnly=["staff","cashier","manager","employee","worker"].includes(currentRole);
 document.body.classList.toggle("worker-mode",workerOnly);
 $("orgSelect").closest(".orgbox")?.classList.toggle("hidden",workerOnly);
 $("orgSetup").classList.add("hidden");
 $("navUsers").classList.toggle("hidden",currentRole!=="owner");
 if(currentRole==="owner"){
  const unlocked=localStorage.getItem(ownerUnlockKey(orgId,user.id))==="1";
  const recovering=localStorage.getItem(ownerRecoveryKey(user.id))==="1";
  let status;
  try{status=await accessRequest({action:"owner_code_status",organization_id:orgId});}
  catch(error){
   await sb.auth.signOut();user=null;clearBizoraAuthState();
   $("appView").classList.add("hidden");$("authView").classList.remove("hidden");
   setAuthMode("owner-code");authMessage("تعذر التحقق من حماية الإدارة. حاول الدخول بكود الإدارة من جديد.");
   return;
  }
  if(status.has_code&&!unlocked&&!recovering){
   await sb.auth.signOut();user=null;clearBizoraAuthState();
   $("appView").classList.add("hidden");$("authView").classList.remove("hidden");
   setAuthMode("owner-code");authMessage("أدخل كود الإدارة الخاص بالمحل لفتح لوحة التحكم.");
   return;
  }
  if(!status.has_code||recovering){
   try{
    const created=await accessRequest({action:"rotate_owner_code",organization_id:orgId});
    localStorage.setItem(ownerUnlockKey(orgId,user.id),"1");
    localStorage.removeItem(ownerRecoveryKey(user.id));
    showOwnerCodeModal(created.code);
   }catch(error){await sb.auth.signOut();user=null;clearBizoraAuthState();$("appView").classList.add("hidden");$("authView").classList.remove("hidden");setAuthMode("owner-code");authMessage("تعذر إنشاء كود الإدارة بشكل آمن. حاول الدخول مرة أخرى.");return;}
  }
 }
 if(currentRole!=="owner")localStorage.removeItem(ownerRecoveryKey(user.id));
 if(workerOnly){
  currentPage="worker-ui";
  await loadPage("worker-ui");
  return;
 }
 if(currentRole!=="owner"){
  await sb.auth.signOut();user=null;clearBizoraAuthState();
  $("appView").classList.add("hidden");$("authView").classList.remove("hidden");
  authMessage("هذا الحساب لا يملك صلاحية الدخول إلى واجهة التطبيق.");
  return;
 }
 await loadPage(currentPage==="worker-ui"?"overview":currentPage);
}
function heading(title){$("pageTitle").textContent=title;document.querySelectorAll(".nav").forEach(b=>b.classList.toggle("active",b.dataset.page===currentPage))}
async function loadPage(page){if(!orgId)return;if(document.body.classList.contains("worker-mode")&&page!=="worker-ui")page="worker-ui";if(page==="users"&&currentRole!=="owner")page="overview";currentPage=page;document.querySelector(".topbar")?.classList.toggle("hidden",page==="overview"||page==="worker-ui");const names={overview:"لوحة القيادة",products:"المنتجات والمخزون",sales:"المبيعات",orders:"الطلبات",users:"المستخدمون",cameras:"الكاميرات",reports:"التقارير",settings:"الإعدادات"};heading(names[page]||"Vue générale");if(page==="overview")return overview();if(page==="products")return productPage();if(page==="sales")return salesPage();if(page==="orders")return ordersPage();if(page==="users")return usersPage();if(page==="cameras")return camerasPage();if(page==="reports")return reportsPage();if(page==="settings")return settingsPage();if(page==="worker-ui")return workerOrderInterface()}
async function overview(){
  const lang=window.BizoraI18n?.language||"ar";
  const tr=(ar,fr,en,es,de,zh)=>({ar,fr,en,es,de,"zh-CN":zh})[lang]||ar;
  const startOfDay=new Date();
  startOfDay.setHours(0,0,0,0);
  const since=startOfDay.toISOString();
  const weekStart=new Date(startOfDay);weekStart.setDate(weekStart.getDate()-6);
  const weekSince=weekStart.toISOString();
  const [productResult,salesResult,recentResult,orderResult,itemResult]=await Promise.all([
    sb.from("products").select("id,name,stock_quantity,low_stock_threshold").eq("organization_id",orgId).eq("is_active",true),
    sb.from("sales").select("id,total,created_at").eq("organization_id",orgId).eq("status","completed").gte("created_at",weekSince),
    sb.from("sales").select("id,total,created_at").eq("organization_id",orgId).eq("status","completed").gte("created_at",since).order("created_at",{ascending:false}).limit(8),
    sb.from("orders").select("id,status").eq("organization_id",orgId),
    sb.from("sale_items").select("product_name,quantity,line_total,sales!inner(organization_id,status,created_at)").eq("sales.organization_id",orgId).eq("sales.status","completed").gte("sales.created_at",new Date(Date.now()-7*86400000).toISOString())
  ]);
  const error=productResult.error||salesResult.error||recentResult.error||orderResult.error||itemResult.error;
  if(error){toast(error.message);return}
  const productRows=productResult.data||[];
  const salesRows=salesResult.data||[];
  const recentRows=recentResult.data||[];
  const orderRows=orderResult.data||[];
  const itemRows=itemResult.data||[];
  const bestMap=new Map();
  itemRows.forEach(row=>{const name=String(row.product_name||"—");const item=bestMap.get(name)||{quantity:0,total:0};item.quantity+=Number(row.quantity||0);item.total+=Number(row.line_total||0);bestMap.set(name,item)});
  const bestProducts=[...bestMap.entries()].sort((a,b)=>b[1].quantity-a[1].quantity).slice(0,5);
  const todaySalesRows=salesRows.filter(row=>new Date(row.created_at)>=startOfDay);
  const revenue=todaySalesRows.reduce((sum,row)=>sum+Number(row.total||0),0);
  const low=productRows.filter(row=>Number(row.stock_quantity||0)<=Number(row.low_stock_threshold||0)).length;
  const pending=orderRows.filter(row=>["pending","preparing","ready"].includes(row.status)).length;
  const average=todaySalesRows.length?revenue/todaySalesRows.length:0;
  const dailyBuckets=Array.from({length:7},(_,i)=>{const day=new Date(weekStart);day.setDate(weekStart.getDate()+i);return {day,total:salesRows.filter(row=>new Date(row.created_at).toDateString()===day.toDateString()).reduce((sum,row)=>sum+Number(row.total||0),0)}});
  const maxDaily=Math.max(1,...dailyBuckets.map(x=>x.total));
  const chartHtml=dailyBuckets.map(x=>`<div class="dashboard-bar-item"><b>${x.total?money(x.total):"—"}</b><div class="dashboard-bar-track"><span style="height:${Math.max(x.total?7:2,x.total/maxDaily*100)}%"></span></div><small>${new Intl.DateTimeFormat(window.BizoraI18n?.locale||"ar-MA",{weekday:"short"}).format(x.day)}</small></div>`).join("");
  $("content").innerHTML=`
    <div class="grid dashboard-stats">
      <article class="stat"><div class="stat-icon">د.م</div><small>مداخيل اليوم</small><strong>${money(revenue)}</strong><em>مجموع المبيعات المسجلة اليوم</em></article>
      <article class="stat"><div class="stat-icon">↗</div><small>عدد المبيعات</small><strong>${todaySalesRows.length}</strong><em>متوسط البيع: ${money(average)}</em></article>
      <article class="stat"><div class="stat-icon">▦</div><small>المنتجات النشطة</small><strong>${productRows.length}</strong><em>المنتجات المتاحة في اللائحة</em></article>
      <article class="stat"><div class="stat-icon">${low?"!":"✓"}</div><small>تنبيهات المخزون</small><strong>${low}</strong><em class="${low?"danger":"positive"}">${low?"منتجات وصلت للحد الأدنى":"المخزون دون تنبيهات"}</em></article>
    </div>
    <section class="panel dashboard-chart-panel"><div class="section-head"><div><h3>${tr("المبيعات خلال آخر 7 أيام","Ventes des 7 derniers jours","Sales over the last 7 days","Ventas de los últimos 7 días","Umsatz der letzten 7 Tage","最近 7 天销售额")}</h3><span class="muted">${tr("الإيرادات اليومية من المبيعات المكتملة","Revenus quotidiens des ventes terminées","Daily revenue from completed sales","Ingresos diarios de ventas completadas","Täglicher Umsatz aus abgeschlossenen Verkäufen","已完成销售的每日收入")}</span></div></div><div class="dashboard-chart">${chartHtml}</div></section>
    <div class="dashboard-lower">
      <section class="panel dashboard-recent">
        <div class="section-head"><div><h3>آخر المبيعات</h3><span class="muted">أحدث 8 عمليات بيع اليوم</span></div><button class="secondary" onclick="loadPage('sales')">عرض المبيعات</button></div>
        <div class="table-wrap">${recentRows.length?`<table><thead><tr><th>المرجع</th><th>الوقت</th><th>المبلغ</th></tr></thead><tbody>${recentRows.map(row=>`<tr><td><b>#${row.id.slice(0,8).toUpperCase()}</b></td><td>${new Date(row.created_at).toLocaleTimeString(window.BizoraI18n?.locale||"ar-MA",{hour:"2-digit",minute:"2-digit"})}</td><td><b>${money(row.total)}</b></td></tr>`).join("")}</tbody></table>`:'<div class="empty">لا توجد مبيعات مسجلة اليوم بعد.</div>'}</div>
      </section>
      <section class="panel dashboard-best"><div class="section-head"><div><h3>${tr("المنتجات الأكثر مبيعاً","Produits les plus vendus","Top-selling products","Productos más vendidos","Meistverkaufte Produkte","畅销商品")}</h3><span class="muted">${tr("حسب الكمية خلال آخر 7 أيام","Par quantité sur les 7 derniers jours","By quantity over the last 7 days","Por cantidad en los últimos 7 días","Nach Menge der letzten 7 Tage","按最近 7 天销量排序")}</span></div></div>${bestProducts.length?bestProducts.map((item,index)=>`<div class="dashboard-product-row"><span class="dashboard-rank">${index+1}</span><b>${esc(item[0])}</b><small>${item[1].quantity} ${tr("وحدة","unités","units","unidades","Einheiten","件")}</small><strong>${money(item[1].total)}</strong></div>`).join(""):'<div class="empty">لا توجد بيانات مبيعات كافية بعد.</div>'}</section>
      <aside class="dashboard-side">
        <section class="panel dashboard-orders"><span class="dashboard-kicker">متابعة الطلبات</span><strong>${pending}</strong><h3>طلبات جارية</h3><p class="muted">طلبات تنتظر التحضير أو التسليم.</p><button class="secondary" onclick="loadPage('orders')">تدبير الطلبات</button></section>
        <section class="panel dashboard-shortcuts"><h3>اختصارات سريعة</h3><button onclick="loadPage('products')"><span>▦</span> المنتجات والمخزون <b>←</b></button><button onclick="loadPage('reports')"><span>▤</span> التقارير <b>←</b></button><button onclick="loadPage('cameras')"><span>◉</span> الكاميرات <b>←</b></button></section>
      </aside>
    </div>`;
}

let workerCart=[];
async function workerOrderInterface(){
 if(workerRefreshTimer){clearInterval(workerRefreshTimer);workerRefreshTimer=null;}
 const lang=window.BizoraI18n?.language||"ar";
 const words={
  ar:{title:"واجهة العمل",sub:"اختار المنتجات وسجل الطلبات وتابع حالتها",food:"المأكولات",drink:"المشروبات",search:"ابحث عن منتج…",cart:"الطلب الحالي",empty:"مازال ما ضفتي حتى منتج",qty:"الكمية",total:"المجموع",confirm:"تأكيد الطلب",clear:"مسح الطلب",add:"إضافة",table:"رقم الطاولة",choose:"اختار الطاولة",orders:"تتبع الطلبات",refresh:"تحديث",noOrders:"لا توجد طلبات حالياً",logout:"تسجيل الخروج",productsEmpty:"ما كاين حتى منتج نشط. تواصل مع صاحب المحل.",orderDone:"تم تسجيل الطلب بنجاح",status:"الحالة",currency:"درهم"},
  fr:{title:"Espace de travail",sub:"Ajoutez des articles, créez et suivez les commandes",food:"Plats",drink:"Boissons",search:"Rechercher un produit…",cart:"Commande actuelle",empty:"Aucun article ajouté",qty:"Qté",total:"Total",confirm:"Valider la commande",clear:"Vider",add:"Ajouter",table:"Table",choose:"Choisir une table",orders:"Suivi des commandes",refresh:"Actualiser",noOrders:"Aucune commande pour le moment",logout:"Déconnexion",productsEmpty:"Aucun produit actif. Contactez le propriétaire.",orderDone:"Commande enregistrée",status:"Statut",currency:"MAD"},
  en:{title:"Work area",sub:"Add products, create orders and track their status",food:"Food",drink:"Drinks",search:"Search products…",cart:"Current order",empty:"No items added",qty:"Qty",total:"Total",confirm:"Place order",clear:"Clear",add:"Add",table:"Table",choose:"Choose a table",orders:"Order tracking",refresh:"Refresh",noOrders:"No orders yet",logout:"Sign out",productsEmpty:"No active products. Contact the owner.",orderDone:"Order saved successfully",status:"Status",currency:"MAD"},
  es:{title:"Área de trabajo",sub:"Añade productos, crea pedidos y sigue su estado",food:"Comida",drink:"Bebidas",search:"Buscar producto…",cart:"Pedido actual",empty:"No hay artículos",qty:"Cant.",total:"Total",confirm:"Crear pedido",clear:"Vaciar",add:"Añadir",table:"Mesa",choose:"Elegir mesa",orders:"Seguimiento de pedidos",refresh:"Actualizar",noOrders:"Todavía no hay pedidos",logout:"Salir",productsEmpty:"No hay productos activos. Contacta con el propietario.",orderDone:"Pedido guardado",status:"Estado",currency:"MAD"},
  de:{title:"Arbeitsbereich",sub:"Produkte hinzufügen, Bestellungen erstellen und verfolgen",food:"Speisen",drink:"Getränke",search:"Produkt suchen…",cart:"Aktuelle Bestellung",empty:"Keine Artikel hinzugefügt",qty:"Menge",total:"Gesamt",confirm:"Bestellung aufgeben",clear:"Leeren",add:"Hinzufügen",table:"Tisch",choose:"Tisch auswählen",orders:"Bestellverfolgung",refresh:"Aktualisieren",noOrders:"Noch keine Bestellungen",logout:"Abmelden",productsEmpty:"Keine aktiven Produkte. Bitte den Inhaber kontaktieren.",orderDone:"Bestellung gespeichert",status:"Status",currency:"MAD"},
  "zh-CN":{title:"工作界面",sub:"添加商品、创建订单并跟踪状态",food:"食品",drink:"饮料",search:"搜索商品…",cart:"当前订单",empty:"尚未添加商品",qty:"数量",total:"总计",confirm:"提交订单",clear:"清空",add:"添加",table:"桌号",choose:"选择桌号",orders:"订单跟踪",refresh:"刷新",noOrders:"暂无订单",logout:"退出",productsEmpty:"没有启用的商品，请联系店主。",orderDone:"订单已成功保存",status:"状态",currency:"MAD"}
 };
 const t=words[lang]||words.ar;
 const statusValues=["pending","preparing","ready","served","completed","cancelled"];
 const statusLabels={
  pending:{ar:"جديد",fr:"Nouvelle",en:"New",es:"Nuevo",de:"Neu","zh-CN":"新订单"},
  preparing:{ar:"قيد التحضير",fr:"En préparation",en:"Preparing",es:"Preparando",de:"In Zubereitung","zh-CN":"准备中"},
  ready:{ar:"جاهز",fr:"Prête",en:"Ready",es:"Listo",de:"Bereit","zh-CN":"已准备好"},
  served:{ar:"تم التقديم",fr:"Servie",en:"Served",es:"Servido",de:"Serviert","zh-CN":"已上菜"},
  completed:{ar:"مكتمل",fr:"Terminée",en:"Completed",es:"Completado",de:"Abgeschlossen","zh-CN":"已完成"},
  cancelled:{ar:"ملغي",fr:"Annulée",en:"Cancelled",es:"Cancelado",de:"Storniert","zh-CN":"已取消"}
 };
 const [productResult,ordersResult]=await Promise.all([
  sb.from("products").select("id,name,unit_price,item_type,category").eq("organization_id",orgId).eq("is_active",true).order("name"),
  sb.from("orders").select("id,status,table_label,total,created_at,order_items(product_name,quantity)").eq("organization_id",orgId).order("created_at",{ascending:false}).limit(25)
 ]);
 if(productResult.error){$("content").innerHTML='<div class="panel notice">'+esc(productResult.error.message)+'</div>';return;}
 const menu=(productResult.data||[]).filter(p=>p.item_type==="food"||p.item_type==="drink");
 let filter="food";
 workerCart=[];
 const statusText=value=>statusLabels[value]?.[lang]||statusLabels[value]?.ar||value;
 $("content").innerHTML=
  '<div class="worker-screen">'+
   '<div class="worker-head"><div><span class="worker-kicker">'+esc(t.sub)+'</span><h2>'+esc(t.title)+'</h2></div><div class="worker-head-actions"><span class="worker-preview-badge">4 × 4</span><button id="workerLogout" class="worker-logout">'+esc(t.logout)+'</button></div></div>'+
   '<div class="worker-layout"><section class="worker-menu"><div class="worker-toolbar"><div class="worker-tabs"><button class="active" data-filter="food">🍽 '+esc(t.food)+'</button><button data-filter="drink">🥤 '+esc(t.drink)+'</button></div><input id="workerSearch" type="search" placeholder="'+esc(t.search)+'"></div><div id="workerProducts" class="worker-products"></div></section>'+
   '<aside class="worker-order"><div class="worker-order-head"><div><h3>'+esc(t.cart)+'</h3><small><span id="workerCount">0</span> '+esc(t.qty)+'</small></div><button id="workerClear" class="ghost">'+esc(t.clear)+'</button></div>'+
   '<label class="worker-table-label">'+esc(t.table)+'<select id="workerTable" required><option value="">'+esc(t.choose)+'</option>'+Array.from({length:12},(_,i)=>'<option value="Table '+(i+1)+'">'+(i+1)+'</option>').join("")+'</select></label>'+
   '<div id="workerCart" class="worker-cart"></div><div class="worker-total"><span>'+esc(t.total)+'</span><strong id="workerTotal">'+money(0)+'</strong></div><button id="workerSend" class="primary worker-submit">'+esc(t.confirm)+'</button></aside></div>'+
   '<section class="panel worker-orders-panel"><div class="worker-orders-head"><div><h3>'+esc(t.orders)+'</h3><small class="muted">آخر 25 طلباً داخل المحل</small></div><button id="workerRefreshOrders" class="secondary">'+esc(t.refresh)+'</button></div><div id="workerOrders" class="worker-order-list"></div></section>'+
  '</div>';
 $("workerLogout").onclick=async()=>{clearBizoraAuthState();await sb.auth.signOut();location.reload();};
 const renderProducts=()=>{
  const query=($("workerSearch").value||"").toLocaleLowerCase();
  const shown=menu.filter(p=>p.item_type===filter&&String(p.name||"").toLocaleLowerCase().includes(query)).slice(0,16);
  const slots=Array.from({length:16},(_,i)=>shown[i]||null);
  $("workerProducts").innerHTML=slots.map((p,i)=>{
   if(!p)return '<article class="worker-product-tile is-empty"><div class="worker-product-art">＋</div><div class="worker-product-info"><b>'+esc(t.food===filter?t.food:t.drink)+'</b><small>—</small></div></article>';
   const icon=p.item_type==="drink"?"🥤":"🍽️";
   return '<article class="worker-product-tile has-product"><div class="worker-product-art" aria-hidden="true">'+icon+'</div><div class="worker-product-info"><b>'+esc(p.name)+'</b><small>'+esc(p.category||"")+'</small><strong>'+money(p.unit_price)+'</strong></div><button class="worker-add" data-add="'+p.id+'" aria-label="'+esc(t.add)+' '+esc(p.name)+'">+</button></article>';
  }).join("");
  $("workerProducts").querySelectorAll("[data-add]").forEach(button=>button.onclick=()=>{
   const p=menu.find(item=>item.id===button.dataset.add);if(!p)return;
   const old=workerCart.find(item=>item.id===p.id);
   if(old)old.qty++;else workerCart.push({id:p.id,name:p.name,price:Number(p.unit_price),qty:1});
   renderCart();
  });
 };
 const renderCart=()=>{
  $("workerCart").innerHTML=workerCart.length?workerCart.map(item=>
   '<div class="worker-cart-row"><span>'+esc(item.name)+'</span><div class="worker-qty"><button data-dec="'+item.id+'">−</button><b>'+item.qty+'</b><button data-inc="'+item.id+'">+</button></div><strong>'+money(item.qty*item.price)+'</strong></div>'
  ).join(""):'<div class="worker-empty">'+esc(t.empty)+'</div>';
  $("workerTotal").textContent=money(workerCart.reduce((sum,item)=>sum+item.qty*item.price,0));
  $("workerCount").textContent=workerCart.reduce((sum,item)=>sum+item.qty,0);
  $("workerCart").querySelectorAll("[data-inc]").forEach(button=>button.onclick=()=>{const item=workerCart.find(x=>x.id===button.dataset.inc);if(item)item.qty++;renderCart();});
  $("workerCart").querySelectorAll("[data-dec]").forEach(button=>button.onclick=()=>{const item=workerCart.find(x=>x.id===button.dataset.dec);if(item){item.qty--;if(item.qty<=0)workerCart=workerCart.filter(x=>x.id!==item.id);}renderCart();});
 };
 const refreshOrders=async()=>{
  const {data,error}=await sb.from("orders").select("id,status,table_label,total,created_at,order_items(product_name,quantity)").eq("organization_id",orgId).order("created_at",{ascending:false}).limit(25);
  if(error){$("workerOrders").innerHTML='<div class="empty">'+esc(error.message)+'</div>';return;}
  const rows=data||[];
  $("workerOrders").innerHTML=rows.length?rows.map(order=>
   '<article class="worker-order-card"><div class="worker-order-card-head"><b>#'+order.id.slice(0,8).toUpperCase()+'</b><span class="worker-status">'+esc(statusText(order.status))+'</span></div>'+
   '<small class="muted">'+esc(order.table_label||"—")+' • '+new Date(order.created_at).toLocaleTimeString(window.BizoraI18n?.locale||"ar-MA",{hour:"2-digit",minute:"2-digit"})+'</small>'+
   '<ul>'+(order.order_items||[]).map(item=>'<li>'+esc(item.product_name)+' × '+Number(item.quantity)+'</li>').join("")+'</ul>'+
   '<b>'+money(order.total)+'</b><label class="worker-table-label">'+esc(t.status)+'<select data-order-status="'+order.id+'">'+statusValues.map(value=>'<option value="'+value+'" '+(order.status===value?"selected":"")+'>'+esc(statusText(value))+'</option>').join("")+'</select></label></article>'
  ).join(""):'<div class="empty">'+esc(t.noOrders)+'</div>';
  $("workerOrders").querySelectorAll("[data-order-status]").forEach(select=>select.onchange=async()=>{
   const id=select.dataset.orderStatus,status=select.value;select.disabled=true;
   const {error:updateError}=await sb.from("orders").update({status,updated_at:new Date().toISOString()}).eq("id",id).eq("organization_id",orgId);
   if(updateError){toast(updateError.message);}else{toast("تم تحديث حالة الطلب");}
   await refreshOrders();
  });
 };
 $("workerSearch").oninput=renderProducts;
 document.querySelectorAll("[data-filter]").forEach(button=>button.onclick=()=>{
  filter=button.dataset.filter;
  document.querySelectorAll("[data-filter]").forEach(item=>item.classList.toggle("active",item===button));
  renderProducts();
 });
 $("workerClear").onclick=()=>{workerCart=[];renderCart();};
 $("workerRefreshOrders").onclick=refreshOrders;
 $("workerSend").onclick=async()=>{
  if(!workerCart.length){toast(t.empty);return;}
  const table=$("workerTable").value;
  if(!table){toast(t.choose);$("workerTable").focus();return;}
  const button=$("workerSend");button.disabled=true;button.textContent="…";
  const {data,error}=await sb.rpc("bizora_create_order",{
   p_org:orgId,p_customer:null,p_table:table,p_note:null,
   p_items:workerCart.map(item=>({product_id:item.id,quantity:item.qty}))
  });
  button.disabled=false;button.textContent=t.confirm;
  if(error){toast(error.message);return;}
  workerCart=[];renderCart();$("workerTable").value="";
  toast(t.orderDone);await refreshOrders();
 };
 renderProducts();renderCart();
 $("workerOrders").innerHTML='<div class="empty">'+esc(t.noOrders)+'</div>';
 await refreshOrders();
 workerRefreshTimer=setInterval(()=>{if(document.body.classList.contains("worker-mode")&&currentPage==="worker-ui")refreshOrders();},20000);
}
async function usersPage(){
 if(currentRole!=="owner"){toast("هذه الصفحة مخصصة لصاحب المحل");return;}
 $("content").innerHTML='<div class="panel"><p class="muted">جاري تحميل حسابات المحل…</p></div>';
 let status,team;
 try{
  const results=await Promise.all([
   accessRequest({action:"owner_code_status",organization_id:orgId}),
   accessRequest({action:"list_workers",organization_id:orgId})
  ]);
  status=results[0];team=results[1].workers||[];
 }catch(error){$("content").innerHTML='<div class="panel notice">'+esc(error.message)+'</div>';return;}
 $("content").innerHTML=
  '<section class="panel"><div class="section-head"><div><h3>كود الإدارة</h3><span class="muted">الكود السري الذي يفتح واجهة صاحب المحل مباشرة.</span></div><span class="badge">'+(status.has_code?"مفعّل":"غير مفعّل")+'</span></div><p class="muted">الكود لا يُعرض إلا عند إنشائه أو تغييره. احتفظ به ولا تشاركه مع العمال.</p><button id="rotateOwnerCode" class="primary">'+(status.has_code?"إعادة إصدار كود الإدارة":"إنشاء كود الإدارة")+'</button></section>'+
  '<div class="team-grid"><section class="panel"><h3>إضافة مستخدم جديد</h3><p class="muted">أنشئ حساباً مستقلاً للعامل. سيدخل بالبريد الإلكتروني وكلمة المرور إلى واجهة العمل فقط.</p>'+
  '<form id="teamForm" class="team-form"><label>الاسم الكامل<input name="name" required minlength="2" maxlength="100" placeholder="اسم العامل"></label><label>البريد الإلكتروني<input name="email" type="email" required placeholder="worker@example.com"></label><label>نوع الحساب<select name="role"><option value="staff">عامل</option><option value="cashier">أمين الصندوق</option></select></label><label>كلمة مرور مؤقتة<input name="password" type="password" minlength="10" required autocomplete="new-password" placeholder="10 أحرف على الأقل"></label><button class="primary" id="createWorkerBtn">إنشاء الحساب</button></form></section>'+
  '<section class="panel"><div class="section-head"><div><h3>حسابات العمال</h3><span class="muted">'+team.length+' حساب</span></div></div><div id="teamList">'+(team.length?team.map(worker=>
   '<div class="team-member"><div><b>'+esc(worker.name||worker.email||"مستخدم")+'</b><small>'+esc(worker.email)+' • '+(worker.role==="owner"?"صاحب المحل":worker.role==="manager"?"مدير":worker.role==="cashier"?"أمين الصندوق":"عامل")+' • '+(worker.is_active?"نشط":"موقوف")+'</small></div>'+(worker.role!=="owner"?(worker.is_active?'<button class="secondary" data-deactivate="'+worker.user_id+'">إيقاف الحساب</button>':'<button class="primary" data-reactivate="'+worker.user_id+'">استرجاع الحساب</button>'):'<span class="badge">صاحب المحل</span>')+'</div>'
  ).join(""):'<div class="empty">لم تتم إضافة أي عامل بعد.</div>')+'</div></section></div>';
 $("rotateOwnerCode").onclick=async()=>{
  if(!confirm("إصدار كود جديد سيوقف الكود القديم فوراً. هل تريد المتابعة؟"))return;
  try{const result=await accessRequest({action:"rotate_owner_code",organization_id:orgId});showOwnerCodeModal(result.code);}
  catch(error){toast(error.message);}
 };
 $("teamForm").onsubmit=async event=>{
  event.preventDefault();const form=new FormData(event.target);
  const button=$("createWorkerBtn");button.disabled=true;button.textContent="جاري إنشاء الحساب…";
  try{
   await accessRequest({action:"create_worker",organization_id:orgId,name:String(form.get("name")||"").trim(),email:String(form.get("email")||"").trim(),role:String(form.get("role")||"staff"),password:String(form.get("password")||"")});
   toast("تم إنشاء حساب العامل. أعطه البريد وكلمة المرور التي أدخلتها.");
   await usersPage();
  }catch(error){toast(error.message);button.disabled=false;button.textContent="إنشاء الحساب";}
 };
 document.querySelectorAll("[data-deactivate]").forEach(button=>button.onclick=async()=>{
  if(!confirm("هل تريد إيقاف هذا الحساب؟ لن يتمكن العامل من الدخول بعد ذلك."))return;
  try{await accessRequest({action:"deactivate_worker",organization_id:orgId,user_id:button.dataset.deactivate});toast("تم إيقاف الحساب");await usersPage();}
  catch(error){toast(error.message);}
 });
 document.querySelectorAll("[data-reactivate]").forEach(button=>button.onclick=async()=>{
  if(!confirm("هل تريد استرجاع هذا الحساب والسماح للمستخدم بالدخول من جديد؟"))return;
  button.disabled=true;button.textContent="جاري الاسترجاع…";
  try{await accessRequest({action:"reactivate_worker",organization_id:orgId,user_id:button.dataset.reactivate});toast("تم استرجاع الحساب بنجاح");await usersPage();}
  catch(error){toast(error.message);button.disabled=false;button.textContent="استرجاع الحساب";}
 });
}
async function productPage(showArchived=false){
  const {data,error}=await sb.from("products").select("*").eq("organization_id",orgId).eq("is_active",!showArchived).order("name");
  if(error){toast(error.message);return}
  products=data||[];
  const categories=[...new Set(products.map(p=>p.category).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"ar"));
  $("content").innerHTML=`
    <div class="panel">
      <div class="section-head"><div><h3>لائحة المأكولات والمشروبات</h3><span class="muted">أضف المنتجات وحدد سعر كل منتج بالدرهم (MAD).</span></div><span class="badge">${products.length} عنصر</span></div>
      <form id="productForm" class="form-grid">
        <input type="hidden" name="id" id="productId">
        <label>اسم المنتج<input name="name" maxlength="120" required placeholder="مثال: طاجين دجاج"></label>
        <label>النوع<select name="item_type" id="productType"><option value="food">مأكولات</option><option value="drink">مشروبات</option></select></label>
        <label>الصنف / الفئة<input name="category" maxlength="80" placeholder="مثال: طواجن، عصائر، سلطات"></label>
        <label>ثمن البيع (درهم)<input name="unit_price" type="number" min="0" max="9999999" step=".01" required placeholder="مثال: 35"></label>
        <label>ثمن التكلفة (اختياري)<input name="cost_price" type="number" min="0" step=".01" value="0"></label>
        <label>المخزون الحالي<input name="stock_quantity" type="number" min="0" step=".001" value="0"></label>
        <label>تنبيه عند وصول المخزون إلى<input name="low_stock_threshold" type="number" min="0" step=".001" value="2"></label>
        <label>رمز المنتج (اختياري)<input name="sku" maxlength="80" placeholder="SKU"></label>
        <div class="row" style="gap:8px;align-items:center;flex-wrap:wrap">
          <button class="primary" id="saveProductBtn">إضافة إلى اللائحة</button>
          <button type="button" class="secondary" id="cancelProductEdit" hidden>إلغاء التعديل</button>
        </div>
      </form>
      <p class="muted" id="productFormMsg" aria-live="polite">تُوجَّه المأكولات إلى المطبخ والمشروبات إلى البار تلقائياً.</p>
    </div>
    <div class="section-head"><div><h3>${showArchived?"المنتجات المؤرشفة":"اللائحة الحالية"} (${products.length})</h3><span class="muted">يمكنك تعديل الاسم والثمن أو إخفاء منتج دون حذف سجل المبيعات السابق.</span></div><button class="secondary" id="toggleArchived">${showArchived?"عرض اللائحة الحالية":"عرض المؤرشف"}</button></div>
    <div class="panel">
      <div class="form-grid" style="margin-bottom:14px">
        <label>بحث عن منتج<input id="productSearch" type="search" placeholder="كتب اسم المنتج…"></label>
        <label>تصفية حسب النوع<select id="productTypeFilter"><option value="">الكل</option><option value="food">مأكولات</option><option value="drink">مشروبات</option></select></label>
        <label>تصفية حسب الفئة<select id="productCategoryFilter"><option value="">جميع الفئات</option>${categories.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join("")}</select></label>
      </div>
      <div class="table-wrap"><table><thead><tr><th>المنتج</th><th>النوع</th><th>الفئة</th><th>الثمن</th><th>المخزون</th><th>إجراء</th></tr></thead><tbody id="productRows">${products.length?products.map(p=>`
        <tr data-name="${esc(p.name.toLowerCase())}" data-type="${esc(p.item_type||"food")}" data-category="${esc(p.category||"")}">
          <td><b>${esc(p.name)}</b></td><td><span class="badge">${p.item_type==="drink"?"مشروب":"وجبة"}</span></td><td>${esc(p.category||"—")}</td><td><b>${money(p.unit_price)}</b></td><td>${Number(p.stock_quantity||0)}</td>
          <td><div class="row" style="gap:6px;flex-wrap:wrap"><button type="button" class="secondary edit-product" data-id="${p.id}">تعديل</button><button type="button" class="secondary archive-product" data-id="${p.id}">${showArchived?"استرجاع":"إخفاء"}</button></div></td>
        </tr>`).join(""):'<tr><td colspan="6" class="empty">لم تتم إضافة أي منتج بعد. استخدم النموذج لإضافة أول وجبة أو مشروب.</td></tr>'}</tbody></table></div>
    </div>`;
  $("toggleArchived").onclick=()=>productPage(!showArchived);
  const form=$("productForm");
  const resetForm=()=>{form.reset();$("productId").value="";form.elements.cost_price.value="0";form.elements.stock_quantity.value="0";form.elements.low_stock_threshold.value="2";$("saveProductBtn").textContent="إضافة إلى اللائحة";$("cancelProductEdit").hidden=true;$("productFormMsg").textContent="تُوجَّه المأكولات إلى المطبخ والمشروبات إلى البار تلقائياً."};
  $("cancelProductEdit").onclick=resetForm;
  form.onsubmit=async e=>{
    e.preventDefault();
    const fd=new FormData(form),id=String(fd.get("id")||""),name=String(fd.get("name")||"").trim(),price=Number(fd.get("unit_price"));
    if(!name||!Number.isFinite(price)||price<0){toast("أدخل اسماً صحيحاً وسعراً صالحاً.");return}
    const itemType=fd.get("item_type")==="drink"?"drink":"food";
    const payload={name,item_type:itemType,category:String(fd.get("category")||"").trim()||null,unit_price:price,cost_price:Number(fd.get("cost_price")||0),stock_quantity:Number(fd.get("stock_quantity")||0),low_stock_threshold:Number(fd.get("low_stock_threshold")||0),sku:String(fd.get("sku")||"").trim()||null,service_station:itemType==="drink"?"bar":"kitchen",organization_id:orgId};
    if([payload.cost_price,payload.stock_quantity,payload.low_stock_threshold].some(n=>!Number.isFinite(n)||n<0)){toast("تحقق من سعر التكلفة وكمية المخزون؛ يجب أن تكون قيماً رقمية موجبة أو صفراً.");return}
    const result=id?await sb.from("products").update(payload).eq("id",id).eq("organization_id",orgId):await sb.from("products").insert(payload);
    if(result.error){toast(result.error.message);return}
    toast(id?"تم تحديث المنتج والثمن":"تمت إضافة المنتج للائحة");await productPage(showArchived);
  };
  document.querySelectorAll(".edit-product").forEach(btn=>btn.onclick=()=>{
    const p=products.find(x=>x.id===btn.dataset.id);if(!p)return;
    $("productId").value=p.id;form.elements.name.value=p.name||"";form.elements.item_type.value=p.item_type||"food";form.elements.category.value=p.category||"";form.elements.unit_price.value=p.unit_price??0;form.elements.cost_price.value=p.cost_price??0;form.elements.stock_quantity.value=p.stock_quantity??0;form.elements.low_stock_threshold.value=p.low_stock_threshold??0;form.elements.sku.value=p.sku||"";
    $("saveProductBtn").textContent="حفظ التعديلات";$("cancelProductEdit").hidden=false;$("productFormMsg").textContent="جارٍ تعديل: "+p.name;form.scrollIntoView({behavior:"smooth",block:"start"});
  });
  document.querySelectorAll(".archive-product").forEach(btn=>btn.onclick=async()=>{
    const p=products.find(x=>x.id===btn.dataset.id);if(!p)return;
    const nextActive=showArchived;
    const {error}=await sb.from("products").update({is_active:nextActive}).eq("id",p.id).eq("organization_id",orgId);
    if(error){toast(error.message);return}
    toast(nextActive?"تم استرجاع المنتج":"تم إخفاء المنتج من اللائحة");await productPage(showArchived);
  });
  const applyFilters=()=>{
    const term=$("productSearch").value.trim().toLocaleLowerCase("ar"),type=$("productTypeFilter").value,category=$("productCategoryFilter").value;
    document.querySelectorAll("#productRows tr[data-name]").forEach(row=>{row.hidden=!(row.dataset.name.includes(term)&&(!type||row.dataset.type===type)&&(!category||row.dataset.category===category))});
  };
  ["productSearch","productTypeFilter","productCategoryFilter"].forEach(id=>$(id).addEventListener(id==="productSearch"?"input":"change",applyFilters));
}
async function salesPage(){
  const activeOrg=orgs.find(o=>o.id===orgId);
  const isOwner=String(activeOrg?.role||"").toLowerCase()==="owner";
  if(isOwner){
    $("content").innerHTML='<div class="section-head"><div><h2>سجل المبيعات</h2><p class="muted">عرض ومتابعة عمليات البيع المسجلة في مؤسستك.</p></div></div><div id="saleHistory" class="panel">جاري تحميل سجل المبيعات…</div>';
    const {data:s,error}=await sb.from("sales").select("id,total,payment_method,created_at,status").eq("organization_id",orgId).order("created_at",{ascending:false}).limit(100);
    if(error){toast("تعذر تحميل سجل المبيعات: "+error.message);return}
    $("saleHistory").innerHTML=s?.length?`<div class="table-wrap sales-history-wrap"><table class="sales-history-table"><thead><tr><th>المرجع</th><th>التاريخ</th><th>الأداء</th><th>الحالة</th><th>المجموع</th></tr></thead><tbody>${s.map(x=>`<tr><td>${x.id.slice(0,8).toUpperCase()}</td><td>${new Date(x.created_at).toLocaleString(window.BizoraI18n?.locale||"fr-MA")}</td><td>${esc(x.payment_method)}</td><td>${esc(x.status||"—")}</td><td>${money(x.total)}</td></tr>`).join("")}</tbody></table></div>`:'<div class="empty">لا توجد مبيعات مسجلة بعد.</div>';
    return;
  }
const {data,error}=await sb.from("products").select("id,name,unit_price,stock_quantity,item_type,category").eq("organization_id",orgId).eq("is_active",true).gt("stock_quantity",0).order("name");if(error){toast(error.message);return}products=data||[];$("content").innerHTML=`<div class="panel"><h3>Enregistrer une vente</h3><p class="muted">Le stock sera diminué automatiquement après validation.</p><form id="saleForm"><label>Produit<select name="product_id" required>${products.map(p=>`<option value="${p.id}">${esc(p.name)} — ${p.item_type==="drink"?"مشروبات":"مأكولات"}${p.category?" / "+esc(p.category):""} — ${money(p.unit_price)} (Stock: ${p.stock_quantity})</option>`).join("")}</select></label><div class="form-grid"><label>Quantité<input name="quantity" type="number" min=".001" step=".001" value="1" required></label><label>Remise (MAD)<input name="discount" type="number" min="0" step=".01" value="0"></label><label>Taxe (MAD)<input name="tax" type="number" min="0" step=".01" value="0"></label></div><label>Mode de paiement<select name="payment_method"><option value="cash">Espèces</option><option value="card">Carte</option><option value="transfer">Virement</option><option value="other">Autre</option></select></label><label>Note<input name="note"></label><button class="primary">Confirmer la vente</button></form></div><div class="section-head"><h3>Historique des ventes</h3></div><div id="saleHistory" class="panel">Chargement…</div>`;if(!products.length)$("saleForm").querySelector("button").disabled=true;$("saleForm").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target),pid=f.get("product_id"),q=Number(f.get("quantity"));const {data:prod}=await sb.from("products").select("stock_quantity").eq("id",pid).single();if(!prod||q>Number(prod.stock_quantity)){toast("Stock insuffisant");return}const r=await sb.rpc("bizora_create_sale",{p_org:orgId,p_branch:null,p_items:[{product_id:pid,quantity:q}],p_discount:Number(f.get("discount")||0),p_tax:Number(f.get("tax")||0),p_payment_method:f.get("payment_method"),p_note:f.get("note")||null});if(r.error){toast(r.error.message);return}toast("Vente enregistrée");salesPage()};const {data:s}=await sb.from("sales").select("id,total,payment_method,created_at").eq("organization_id",orgId).order("created_at",{ascending:false}).limit(15);$("saleHistory").innerHTML=s?.length?`<div class="table-wrap sales-history-wrap"><table class="sales-history-table"><thead><tr><th>المرجع</th><th>التاريخ</th><th>Paiement</th><th>Total</th></tr></thead><tbody>${s.map(x=>`<tr><td>${x.id.slice(0,8).toUpperCase()}</td><td>${new Date(x.created_at).toLocaleString(window.BizoraI18n?.locale||"fr-MA")}</td><td>${esc(x.payment_method)}</td><td>${money(x.total)}</td></tr>`).join("")}</tbody></table></div>`:'<div class="empty">Aucune vente.</div>'}
async function ordersPage(){
  const [orderResult, productResult] = await Promise.all([
    sb.from("orders").select("*,order_items(*)").eq("organization_id",orgId).order("created_at",{ascending:false}).limit(50),
    sb.from("products").select("id,name,unit_price,stock_quantity,item_type,category").eq("organization_id",orgId).eq("is_active",true).order("name")
  ]);
  if(orderResult.error||productResult.error){toast((orderResult.error||productResult.error).message);return}
  const data=orderResult.data||[], available=productResult.data||[];
  const statuses=[["pending","En attente"],["preparing","En préparation"],["ready","Prête"],["served","Servie"],["completed","Terminée"],["cancelled","Annulée"]];
  const productOptions=available.map(p=>`<option value="${p.id}">${esc(p.name)} — ${p.item_type==="drink"?"مشروبات":"مأكولات"}${p.category?" / "+esc(p.category):""} — ${money(p.unit_price)}</option>`).join("");
  const renderKitchen=()=>{
    const groups=[["pending","En attente"],["preparing","En préparation"],["ready","Prête"],["served","Servie"]];
    $("content").innerHTML='<div class="section-head"><div><h3>Écran cuisine</h3><span class="muted">Suivi des commandes</span></div><button class="secondary" id="backOrders">Retour aux commandes</button></div><div class="kitchen-board">' + groups.map(([key,label])=>{
      const list=data.filter(o=>o.status===key);
      return '<section class="kitchen-column"><h3>'+label+' <span class="kitchen-count">'+list.length+'</span></h3>'+(list.length?list.map(o=>
        '<article class="kitchen-ticket"><div class="ticket-top"><b>#'+o.id.slice(0,6).toUpperCase()+'</b><span>'+new Date(o.created_at).toLocaleTimeString(window.BizoraI18n?.locale||"fr-MA",{hour:"2-digit",minute:"2-digit"})+'</span></div><strong>'+(o.customer_label?'Livraison — '+esc(o.customer_label):'Table — '+esc(o.table_label||"—"))+'</strong><ul>'+(o.order_items||[]).map(i=>'<li>'+esc(i.product_name)+' <b>× '+i.quantity+'</b></li>').join("")+'</ul>'+(o.note?'<p class="ticket-note">Note : '+esc(o.note)+'</p>':"")+'<div class="ticket-bottom"><b>'+money(o.total)+'</b><select class="order-status" data-id="'+o.id+'">'+statuses.map(([v,l])=>'<option value="'+v+'" '+(o.status===v?"selected":"")+'>'+l+'</option>').join("")+'</select></div></article>'
      ).join(""):'<p class="muted">Aucune commande</p>')+'</section>';
    }).join("")+'</div>';
    $("backOrders").onclick=()=>ordersPage();bindOrderStatus();
  };
  const bindOrderStatus=()=>document.querySelectorAll(".order-status").forEach(select=>select.onchange=async e=>{const id=e.target.dataset.id,status=e.target.value;const {error}=await sb.from("orders").update({status,updated_at:new Date().toISOString()}).eq("id",id).eq("organization_id",orgId);if(error){toast(error.message);await ordersPage();return}toast("Statut mis à jour");await ordersPage();});
  $("content").innerHTML=`
    <div class="section-head"><div><h3>Commandes</h3><span class="muted">Gestion des commandes clients</span></div><button class="secondary" id="openKitchen">Ouvrir l’écran cuisine</button></div>
    <div class="panel"><h3>Créer une commande</h3><p class="muted">Choisissez le type de commande et ajoutez les articles.</p>
      <form id="orderForm">
        <label>Type de commande<select name="order_type" id="orderType"><option value="table">Sur place / Table</option><option value="delivery">Livraison</option></select></label>
        <div id="orderCustomerField" hidden><label>Nom du client (livraison)<input name="customer_label" maxlength="120" placeholder="Nom du client"></label></div>
        <div id="orderTableField"><label>Numéro de table<input name="table_label" maxlength="60" placeholder="Ex. Table 4" required></label></div>
        <div class="section-head"><h3>Articles</h3><button type="button" class="secondary" id="addOrderLine">+ Ajouter un article</button></div>
        <div id="orderLines"></div><label>Note<input name="note" maxlength="500" placeholder="Instructions particulières"></label>
        <button class="primary" ${available.length?"":"disabled"}>Créer la commande</button>
        ${available.length?"":'<p class="notice">Ajoutez d’abord un produit actif dans Produits & stock.</p>'}
      </form></div>
    <div class="section-head"><h3>Suivi des commandes (${data.length})</h3></div>
    <div class="panel table-wrap">${data.length?`<table><thead><tr><th>المرجع</th><th>Client / Table</th><th>Total</th><th>Statut</th><th>التاريخ</th></tr></thead><tbody>${data.map(o=>`<tr><td>${o.id.slice(0,8).toUpperCase()}</td><td>${o.customer_label?`Livraison — ${esc(o.customer_label)}`:`Table — ${esc(o.table_label||"—")}`}</td><td>${money(o.total)}</td><td><select class="order-status" data-id="${o.id}">${statuses.map(([v,l])=>`<option value="${v}" ${o.status===v?"selected":""}>${l}</option>`).join("")}</select></td><td>${new Date(o.created_at).toLocaleString(window.BizoraI18n?.locale||"fr-MA")}</td></tr>`).join("")}</tbody></table>`:'<div class="empty">Aucune commande pour le moment. Créez votre première commande ci-dessus.</div>'}</div>`;
  $("openKitchen").onclick=renderKitchen;
  const typeSelect=$("orderType"), customerWrap=$("orderCustomerField"), tableWrap=$("orderTableField");
  const syncOrderType=()=>{
    const delivery=typeSelect.value==="delivery";
    customerWrap.hidden=!delivery;tableWrap.hidden=delivery;
    customerWrap.querySelector("input").required=delivery;
    tableWrap.querySelector("input").required=!delivery;
  };
  typeSelect.onchange=syncOrderType;syncOrderType();
  const addLine=()=>{
    if(!available.length)return;
    const row=document.createElement("div");row.className="form-grid order-line";
    row.innerHTML=`<label>Produit<select name="product_id" required>${productOptions}</select></label><label>Quantité<input name="quantity" type="number" min="0.001" step="0.001" value="1" required></label><button type="button" class="secondary remove-order-line">Retirer</button>`;
    $("orderLines").appendChild(row);
  };
  addLine();$("addOrderLine").onclick=addLine;
  $("orderLines").addEventListener("click",e=>{if(e.target.classList.contains("remove-order-line")){if($("orderLines").children.length>1)e.target.closest(".order-line").remove();else toast("La commande doit contenir au moins un article")}});
  $("orderForm").onsubmit=async e=>{
    e.preventDefault();
    const lines=[...document.querySelectorAll("#orderLines .order-line")].map(row=>({product_id:row.querySelector('[name="product_id"]').value,quantity:Number(row.querySelector('[name="quantity"]').value)}));
    if(!lines.length||lines.some(x=>!x.product_id||!Number.isFinite(x.quantity)||x.quantity<=0)){toast("Vérifiez les articles et les quantités");return}
    const form=new FormData(e.target),delivery=form.get("order_type")==="delivery";
    const customer=delivery?String(form.get("customer_label")||"").trim():null;
    const table=delivery?"Livraison":String(form.get("table_label")||"").trim();
    if(delivery&&!customer){toast("Le nom du client est obligatoire pour une livraison");return}
    const {error}=await sb.rpc("bizora_create_order",{p_org:orgId,p_customer:customer,p_table:table,p_note:form.get("note"),p_items:lines});
    if(error){toast(error.message);return}toast("Commande créée avec succès");await ordersPage();
  };
  bindOrderStatus();
}
async function camerasPage(){
  const [salesRes,ordersRes,productsRes]=await Promise.all([
    sb.from("sales").select("id,total,created_at,payment_method,status").eq("organization_id",orgId).order("created_at",{ascending:false}).limit(500),
    sb.from("orders").select("id,status,created_at,total,order_items(product_id,product_name,quantity)").eq("organization_id",orgId).order("created_at",{ascending:false}).limit(300),
    sb.from("products").select("id,name,stock_quantity,low_stock_threshold,unit_price,service_station").eq("organization_id",orgId).eq("is_active",true)
  ]);
  const err=salesRes.error||ordersRes.error||productsRes.error;
  if(err){toast(err.message);return}
  const sales=salesRes.data||[],orders=ordersRes.data||[],products=productsRes.data||[];
  const cameraRes=await sb.from("cameras").select("id,name,zone,camera_type,brand,serial_number,connection_status,connection_method").eq("organization_id",orgId).order("created_at",{ascending:false});if(cameraRes.error){toast(cameraRes.error.message);return}const cameras=cameraRes.data||[];
  const today=new Date();today.setHours(0,0,0,0);
  const todaySales=sales.filter(x=>new Date(x.created_at)>=today);
  const revenue=todaySales.reduce((a,x)=>a+Number(x.total||0),0);
  const activeOrders=orders.filter(x=>["pending","preparing","ready"].includes(x.status));
  const lowStock=products.filter(x=>Number(x.stock_quantity)<=Number(x.low_stock_threshold));
  const handedOrders=orders.filter(x=>["served","completed"].includes(x.status)&&new Date(x.created_at)>=today);
  const stationByProduct=new Map(products.map(p=>[p.id,p.service_station]));
  const outputTotals=handedOrders.reduce((a,o)=>{(o.order_items||[]).forEach(i=>{const station=stationByProduct.get(i.product_id)||"other";if(station==="kitchen")a.meals+=Number(i.quantity||0);if(station==="bar")a.drinks+=Number(i.quantity||0)});return a},{meals:0,drinks:0});
  const hours=Array(24).fill(0);sales.forEach(x=>hours[new Date(x.created_at).getHours()]++);
  const peak=hours.indexOf(Math.max(...hours));
  const cash=todaySales.filter(x=>x.payment_method==="cash").reduce((a,x)=>a+Number(x.total||0),0);
  const other=revenue-cash;
  const hourBars=hours.map((n,h)=>'<div class="hour-bar-wrap"><span>'+n+'</span><div class="hour-bar" style="height:'+Math.max(4,n*12)+'px"></div><small>'+String(h).padStart(2,"0")+':00</small></div>').join("");
  const lowRows=lowStock.map(p=>'<tr><td>'+esc(p.name)+'</td><td>'+p.stock_quantity+'</td><td>'+p.low_stock_threshold+'</td><td>'+money(p.unit_price)+'</td></tr>').join("");
  const cameraFeatures=[["people_in_out","Suivi des passages entrée / sortie","Caméra d’entrée"],["visitor_count","Comptage des visiteurs uniques","Caméra d’entrée"],["staff_face_recognition","Reconnaissance faciale des employés (avec consentement)","Caméra d’entrée"],["staff_tracking","Suivi des déplacements des employés","Zones autorisées"],["table_count","Comptage des tables occupées / libres","Caméra de salle"],["meals_count","Comptage des repas servis","Caméra cuisine"],["drinks_count","Comptage des boissons servies","Caméra bar"],["queue_detection","Détection de file d’attente","Zone d’attente"],["zone_analytics","Analyse d’occupation de zone","Zone / réserve"]];
  const settingsRes=await sb.from("camera_feature_settings").select("camera_id,feature_key,is_enabled").eq("organization_id",orgId);
  if(settingsRes.error){toast("Paramètres caméra : "+settingsRes.error.message);return}
  const featureSettings=settingsRes.data||[];
  const tableZonesRes=await sb.from("camera_table_zones").select("id,camera_id,table_label,region_polygon,is_enabled").eq("organization_id",orgId).order("table_label");
  if(tableZonesRes.error){toast("Configuration des tables : "+tableZonesRes.error.message);return}
  const tableZones=tableZonesRes.data||[];
  const cameraCards=cameras.map(c=>'<article class="camera-card"><div class="camera-preview">◉<small>'+esc(String(c.connection_status||"pending").toUpperCase())+'</small></div><div class="camera-meta"><b>'+esc(c.name)+'</b><span>'+esc(c.brand||"Autre")+' · '+esc(c.camera_type)+' · '+esc(c.zone||"Zone non définie")+'</span><small>UID : '+esc(c.serial_number||"Non renseigné")+' · '+esc(c.connection_method||"manual")+'</small><div class="camera-feature-list"><b>Fonctions indépendantes</b>'+cameraFeatures.map(([key,label])=>{const setting=featureSettings.find(x=>x.camera_id===c.id&&x.feature_key===key);return '<label class="camera-feature"><span>'+label+'</span><input type="checkbox" data-camera-feature="'+key+'" data-camera-id="'+c.id+'" '+(setting?.is_enabled?'checked':'')+'></label>'}).join('')+'<button class="primary save-camera-features" data-id="'+c.id+'">Enregistrer les fonctions</button><small>Chaque fonction se règle séparément pour cette caméra.</small></div><div class="camera-feature-list table-zone-setup"><b>Plan des tables — cette caméra</b><small>'+tableZones.filter(t=>t.camera_id===c.id).length+' table(s) enregistrée(s) · '+tableZones.filter(t=>t.camera_id===c.id&&t.region_polygon).length+' zone(s) calibrée(s)</small><label>أسماء الطاولات (مثال: T1, T2, T3)<input type="text" data-table-labels="'+c.id+'" placeholder="T1, T2, T3"></label><button type="button" class="secondary save-camera-tables" data-id="'+c.id+'">Enregistrer les tables</button><div class="muted">'+(tableZones.filter(t=>t.camera_id===c.id).map(t=>esc(t.table_label)+(t.region_polygon?' ✓':' — à calibrer')).join(' · ')||'Aucune table configurée')+'</div><small>Le comptage automatique démarre après calibration des zones sur l’image et connexion du Gateway AI local.</small></div><button class="ghost camera-delete" data-id="'+c.id+'">Supprimer</button></div></article>').join("");
  let html='<div class="ai-hero"><div><span class="ai-kicker">BIZORA INTELLIGENCE</span><h2>AI Shop Intelligence</h2><p>Surveillance, activité commerciale et opérations réunies dans un seul centre de contrôle.</p></div><span class="ai-status"><i></i> Analyse des données disponible</span></div>';
  html+='<div class="ai-tabs"><button class="ai-tab active" data-ai-tab="dashboard">Vue intelligente</button><button class="ai-tab" data-ai-tab="cameras">Caméras</button><button class="ai-tab" data-ai-tab="cash">Contrôle caisse</button><button class="ai-tab" data-ai-tab="stock">Stock intelligent</button></div>';
  html+='<section id="aiDashboard"><div class="grid ai-stats"><div class="stat"><small>CA aujourd’hui</small><strong>'+money(revenue)+'</strong><em>D’après les ventes enregistrées</em></div><div class="stat"><small>Commandes actives</small><strong>'+activeOrders.length+'</strong><em>À préparer ou servir</em></div><div class="stat"><small>Caméras déclarées</small><strong>'+cameras.length+'</strong><em>Flux vidéo non vérifié</em></div><div class="stat"><small>Alertes stock</small><strong>'+lowStock.length+'</strong><em>Seuil minimum atteint</em></div><div class="stat"><small>وجبات تم تسليمها اليوم</small><strong>'+outputTotals.meals+'</strong><em>حسب الطلبات المسلّمة</em></div><div class="stat"><small>مشروبات تم تسليمها اليوم</small><strong>'+outputTotals.drinks+'</strong><em>حسب الطلبات المسلّمة</em></div></div>';
  html+='<div class="ai-two-col"><div class="panel"><h3>Heures d’activité</h3><span class="muted">Répartition des ventes par heure</span><div class="hour-chart">'+hourBars+'</div><p class="muted">Heure la plus active dans les ventes chargées : <b>'+String(peak).padStart(2,"0")+':00</b>. Ce graphique mesure les ventes, pas le passage physique des visiteurs.</p></div>';
  html+='<div class="panel"><h3>Analyse opérationnelle</h3><div class="insight-row"><b>File d’attente</b><small>'+activeOrders.length+' commandes actives à traiter</small></div><div class="insight-row"><b>Risque de rupture</b><small>'+lowStock.length+' produits au seuil ou en dessous</small></div><div class="insight-row"><b>Présence clients / staff</b><small>En attente du Gateway AI local et du flux vidéo.</small></div></div></div>';
  html+='<div class="panel"><h3>Sorties cuisine & bar — aujourd’hui</h3><div class="grid"><div class="stat"><small>وجبات خارجة من المطبخ</small><strong>'+outputTotals.meals+'</strong><em>من الطلبات المسلّمة</em></div><div class="stat"><small>مشروبات خارجة من البار</small><strong>'+outputTotals.drinks+'</strong><em>من الطلبات المسلّمة</em></div></div><p class="muted">الأعداد تُحتسب من كميات المنتجات داخل الطلبات التي حالتها «Servie» أو «Terminée». العدّ بالكاميرا سيُضاف بعد تشغيل Gateway ومعايرة كاميرات المطبخ والبار.</p></div>';
  html+='<div class="panel ai-report"><div><h3>Rapport quotidien</h3><p>'+todaySales.length+' ventes · '+activeOrders.length+' commandes actives · '+lowStock.length+' alertes stock · Espèces : '+money(cash)+'</p></div><button class="primary" id="shareDailyReport">Partager le rapport</button></div></section>';
  html+='<section id="aiCameras" class="hidden"><div class="panel"><h3>Gateway local Bizora</h3><p class="muted">Enrôlez un mini-PC installé sur le même réseau que les caméras. Le jeton est affiché une seule fois : conservez-le dans le gestionnaire de secrets du Gateway et ne le partagez pas.</p><label>Nom du Gateway<input id="gatewayAgentName" maxlength="100" value="Gateway principal"></label><button type="button" class="primary" id="enrollGateway">Créer le jeton de connexion</button><pre id="gatewayEnrollOutput" class="gateway-result">Aucun Gateway enrôlé depuis cette session.</pre></div><div class="panel gateway-control"><div class="section-head"><div><h3>Contrôle du Gateway</h3><span class="muted">تقدر توقف أو تشغل معالجة الكاميرات، مع بقاء Gateway متصل بالسيرفر.</span></div><span id="gatewayStatusBadge" class="badge">Chargement…</span></div><label class="inline-form gateway-toggle"><input id="gatewayEnabled" type="checkbox"> <b>تشغيل معالجة الكاميرات</b></label><p id="gatewayStatusText" class="muted">جاري التحقق من الحالة…</p><small class="muted">ملي توقف المعالجة، Gateway كيبقى كيرسل heartbeat للسيرفر باش تبقى الحالة متصلة؛ غير فحص الكاميرات وإرسال الأحداث كيتوقف. ما كيتحيد حتى إعداد أو تسجيل.</small></div><div class="panel"><h3>Gestion des caméras</h3><div class="pairing-steps"><div><b>1 · Marque</b><small>Dahua ou Hikvision</small></div><div><b>2 · Identification</b><small>Scanner QR ou saisir le numéro</small></div><div><b>3 · Réseau</b><small>Découverte via Gateway</small></div></div><form id="cameraForm" class="form-grid"><label>Nom<input name="name" required placeholder="Entrée principale"></label><label>Zone<input name="zone" required placeholder="Entrée / caisse / cuisine"></label><label>Marque<select name="brand"><option value="Dahua">Dahua</option><option value="Hikvision">Hikvision</option><option value="Autre">Autre</option></select></label><label>Appareil<select name="type"><option value="ip">Caméra IP</option><option value="dvr">DVR</option><option value="nvr">NVR</option></select></label><label>Numéro de série / UID<input id="cameraSerial" name="serial" maxlength="160" placeholder="Numéro lu depuis le QR"></label><label>Méthode<select name="method"><option value="qr">QR Code</option><option value="manual">Saisie manuelle</option></select></label><button class="primary">Enregistrer l’appareil</button></form><div class="pairing-actions"><button type="button" class="secondary" id="startQrScan">Scanner QR avec la caméra du téléphone</button><button type="button" class="secondary" id="stopQrScan" disabled>Arrêter le scan</button><button type="button" class="secondary" id="discoverCameras">Rechercher sur le réseau (Gateway)</button></div><video id="cameraQrVideo" class="qr-video hidden" playsinline muted></video><p id="cameraPairMsg" class="notice">Le QR sert à identifier l’appareil. Ne scannez pas de QR contenant un mot de passe Wi-Fi et ne saisissez aucun mot de passe caméra ici.</p><div id="gatewayResult" class="gateway-result">Gateway réseau : pas encore configuré.</div></div><div class="camera-grid">'+(cameraCards||'<div class="empty panel">Aucune caméra ajoutée.</div>')+'</div><div class="panel"><h3>Configuration indépendante</h3><p class="muted">Activez uniquement les fonctions nécessaires sur chaque caméra. Les réglages sont enregistrés séparément. Les fonctions sont des missions assignées à cette caméra. Elles ne démarrent qu’après connexion du Gateway et du moteur AI local. La reconnaissance faciale des employés exige information, consentement valable et conformité CNDP ; aucun visage ne doit être enrôlé sans autorisation. Les commandes POS peuvent alimenter les statistiques de repas et boissons.</p></div></section>';
  html+='<section id="aiCash" class="hidden"><div class="grid"><div class="stat"><small>Espèces aujourd’hui</small><strong>'+money(cash)+'</strong></div><div class="stat"><small>Autres paiements</small><strong>'+money(other)+'</strong></div><div class="stat"><small>Ventes</small><strong>'+todaySales.length+'</strong></div><div class="stat"><small>Écart de caisse</small><strong>—</strong></div></div><div class="panel"><h3>Vérification de caisse</h3><p class="muted">Comparez les espèces comptées avec les espèces théoriques enregistrées.</p><form id="cashCheckForm" class="inline-form"><label>Espèces comptées (MAD)<input name="counted" type="number" min="0" step=".01" required></label><button class="primary">Calculer l’écart</button></form><div id="cashCheckResult" class="notice"></div><p class="muted">Cette vérification compare les montants saisis. Elle ne détecte pas automatiquement une fraude.</p></div></section>';
  html+='<section id="aiStock" class="hidden"><div class="panel"><h3>Prévention des ruptures</h3><p class="muted">Produits ayant atteint leur seuil d’alerte.</p>'+(lowRows?'<div class="table-wrap"><table><thead><tr><th>Produit</th><th>Stock</th><th>Seuil</th><th>Prix</th></tr></thead><tbody>'+lowRows+'</tbody></table></div>':'<div class="empty">Aucun produit en alerte.</div>')+'</div><div class="panel"><h3>Réapprovisionnement</h3><p class="muted">Les recommandations de quantité nécessitent un historique de consommation suffisamment complet.</p></div></section>';
  $("content").innerHTML=html;
  const gatewaySwitch=$("gatewayEnabled"),gatewayBadge=$("gatewayStatusBadge"),gatewayText=$("gatewayStatusText");
  const refreshGatewayStatus=async()=>{
    const {data,error}=await sb.functions.invoke("camera-gateway",{body:{action:"gateway_status",organization_id:orgId}});
    if(error||!data){gatewayBadge.textContent="Erreur";gatewayText.textContent="Impossible de vérifier la connexion Gateway : "+(error?.message||data?.error||"Erreur inconnue");gatewaySwitch.disabled=true;return}
    gatewaySwitch.disabled=false;gatewaySwitch.checked=data.is_enabled===true;
    gatewayBadge.textContent="SERVEUR DISPONIBLE";
    gatewayText.textContent=(data.is_enabled?"معالجة الكاميرات خدامة. ":"معالجة الكاميرات موقوفة، ولكن الاتصال بالسيرفر باقي خدام. ")+"الأجهزة المسجلة: "+data.active_agents+" · المتصلة حالياً: "+(data.connected_agents||0)+". السيرفر متاح.";
  };
  await refreshGatewayStatus();
  gatewaySwitch.onchange=async()=>{
    const desired=gatewaySwitch.checked;gatewaySwitch.disabled=true;
    const {data,error}=await sb.functions.invoke("camera-gateway",{body:{action:"gateway_set_enabled",organization_id:orgId,is_enabled:desired}});
    if(error||!data?.ok){toast("Impossible de modifier Gateway : "+(error?.message||data?.error||"Erreur"));await refreshGatewayStatus();return}
    toast(desired?"معالجة الكاميرات تشعلات":"توقفت معالجة الكاميرات؛ السيرفر باقي متصل");await refreshGatewayStatus();
  };
  $("enrollGateway").onclick=async()=>{
    const button=$("enrollGateway"), output=$("gatewayEnrollOutput"), agentName=$("gatewayAgentName").value.trim();
    if(agentName.length<2){toast("Donnez un nom au Gateway.");return}
    button.disabled=true;button.textContent="Création…";output.textContent="Création du Gateway sécurisé…";
    const {data,error}=await sb.functions.invoke("camera-gateway",{body:{action:"enroll",organization_id:orgId,agent_name:agentName}});
    button.disabled=false;button.textContent="Créer le jeton de connexion";
    if(error||!data?.gateway_token){output.textContent="Erreur : "+(error?.message||data?.error||"Échec de l’enrôlement");return}
    output.textContent="Gateway créé : "+data.agent.id+"\\n\\nJETON (visible maintenant uniquement) :\\n"+data.gateway_token+"\\n\\nURL : https://pywdltkplgvbxdejqext.supabase.co/functions/v1\\n\\nEnregistrez le jeton en lieu sûr. Ne l’envoyez à personne et ne le publiez pas.";
    const copy=document.createElement("button");copy.className="secondary";copy.textContent="Copier le jeton";copy.onclick=async()=>{await navigator.clipboard.writeText(data.gateway_token);toast("Jeton copié")};output.after(copy);
    await refreshGatewayStatus();
  };
  document.querySelectorAll("[data-ai-tab]").forEach(b=>b.onclick=()=>{document.querySelectorAll("[data-ai-tab]").forEach(x=>x.classList.toggle("active",x===b));["Dashboard","Cameras","Cash","Stock"].forEach((n,i)=>$("ai"+n).classList.toggle("hidden",b.dataset.aiTab!==["dashboard","cameras","cash","stock"][i]));});
  let qrStream=null,qrTimer=null,qrControls=null,qrBusy=false;
  const qrVideo=$("cameraQrVideo"),pairMsg=$("cameraPairMsg");
  const stopQr=()=>{
    if(qrTimer)clearInterval(qrTimer);qrTimer=null;
    if(qrControls){try{qrControls.stop()}catch(_){}qrControls=null}
    if(qrStream)qrStream.getTracks().forEach(t=>t.stop());qrStream=null;
    if(qrVideo){qrVideo.pause();qrVideo.srcObject=null;qrVideo.classList.add("hidden")}
    if($("stopQrScan"))$("stopQrScan").disabled=true;
  };
  const extractQrDeviceInfo=rawValue=>{
    const raw=String(rawValue||"").trim();
    if(!raw)return {serial:"",brand:"",kind:""};
    let parsed=null;
    try{parsed=JSON.parse(raw)}catch(_){}
    const serialKeys=["serialnumber","serial","sn","uid","deviceserial","deviceserialno","device_sn","device_uid","devserial"];
    let serial="";
    const inspect=(obj,depth=0)=>{
      if(!obj||typeof obj!=="object"||depth>3||serial)return;
      for(const [key,value] of Object.entries(obj)){
        const normalized=key.toLowerCase().replace(/[^a-z0-9]/g,"");
        if(serialKeys.includes(normalized)&&typeof value==="string"&&/^[A-Za-z0-9_-]{5,64}$/.test(value.trim())){serial=value.trim();return}
        if(value&&typeof value==="object")inspect(value,depth+1);
      }
    };
    if(parsed)inspect(parsed);
    if(!serial){
      try{const url=new URL(raw);for(const [key,value] of url.searchParams){if(serialKeys.includes(key.toLowerCase().replace(/[^a-z0-9]/g,""))&&/^[A-Za-z0-9_-]{5,64}$/.test(value)){serial=value;break}}}catch(_){}
    }
    if(!serial){
      const match=raw.match(/(?:serial(?:number)?|device[_-]?serial|uid|device[_-]?uid|sn)\s*[=:：/ -]\s*["']?([A-Za-z0-9_-]{5,64})/i);
      if(match)serial=match[1];
    }
    if(!serial&&/^[A-Za-z0-9_-]{8,40}$/.test(raw))serial=raw;
    const brand=/hikvision|hik[- ]?connect|ezviz/i.test(raw)?"Hikvision":/dahua|dmss|imou/i.test(raw)?"Dahua":"";
    const kind=/\bnvr\b/i.test(raw)?"nvr":/\bdvr\b/i.test(raw)?"dvr":"";
    return {serial,brand,kind};
  };
  const acceptQrValue=raw=>{
    const info=extractQrDeviceInfo(raw);
    if(info.serial){
      $("cameraSerial").value=info.serial;
      if(info.brand)$("cameraForm").elements.brand.value=info.brand;
      if(info.kind)$("cameraForm").elements.type.value=info.kind;
      $("cameraForm").elements.method.value="qr";
      pairMsg.textContent="تم استخراج UID / الرقم التسلسلي. راجع الاسم والمنطقة، ثم اضغط «حفظ الجهاز». لم يتم حفظ محتوى رمز QR الأصلي أو أي كلمة مرور.";
      stopQr();
    }else{
      pairMsg.textContent="تمت قراءة رمز QR، لكن لم نعثر على UID أو رقم تسلسلي معروف. لم يتم حفظ محتواه. تأكد من أنه رمز معلومات الجهاز، وليس رمز مشاركة أو إعداد شبكة.";
      stopQr();
    }
  };
  $("startQrScan").onclick=async()=>{
    const button=$("startQrScan");
    try{
      if(!navigator.mediaDevices?.getUserMedia)throw new Error("المتصفح لا يدعم فتح الكاميرا. افتح التطبيق عبر HTTPS.");
      button.disabled=true;pairMsg.textContent="جارٍ تشغيل الكاميرا الخلفية…";
      qrStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"}},audio:false});
      qrVideo.srcObject=qrStream;qrVideo.classList.remove("hidden");await qrVideo.play();
      $("stopQrScan").disabled=false;
      if("BarcodeDetector" in window){
        let detector;
        try{detector=new BarcodeDetector({formats:["qr_code"]})}catch(_){detector=null}
        if(detector){
          pairMsg.textContent="وجّه الكاميرا نحو رمز QR الموجود في إعدادات DVR/NVR، وأبقِه داخل إطار الصورة.";
          qrTimer=setInterval(async()=>{
            if(qrBusy)return;qrBusy=true;
            try{const codes=await detector.detect(qrVideo);if(codes.length)acceptQrValue(codes[0].rawValue)}
            catch(err){console.warn("QR detection",err)}
            finally{qrBusy=false}
          },500);
          return;
        }
      }
      pairMsg.textContent="جارٍ تحميل قارئ QR المتوافق مع المتصفح…";
      const {BrowserQRCodeReader}=await import("https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/+esm");
      const reader=new BrowserQRCodeReader();
      qrStream.getTracks().forEach(t=>t.stop());qrStream=null;
      qrControls=await reader.decodeFromVideoDevice(undefined,qrVideo,(result,error)=>{
        if(result)acceptQrValue(result.getText());
      });
      pairMsg.textContent="وجّه الكاميرا نحو رمز QR الموجود في إعدادات DVR/NVR.";
      $("stopQrScan").disabled=false;
    }catch(err){
      stopQr();
      pairMsg.textContent="تعذر تشغيل قارئ QR: "+(err?.message||"تأكد من السماح باستخدام الكاميرا ومن فتح التطبيق عبر HTTPS.");
    }finally{button.disabled=false}
  };
  $("stopQrScan").onclick=()=>{stopQr();pairMsg.textContent="تم إيقاف المسح."};
  $("discoverCameras").onclick=()=>{$("gatewayResult").textContent="Découverte réseau indisponible pour le moment : le Gateway BIZORA doit être installé sur le même réseau local que les caméras. Le navigateur du téléphone ne peut pas effectuer seul le scan ONVIF / UDP.";toast("Gateway requis pour la découverte réseau")};
  $("cameraForm").onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.target);const payload={organization_id:orgId,name:String(fd.get("name")).trim(),zone:String(fd.get("zone")).trim(),brand:String(fd.get("brand")),camera_type:String(fd.get("type")),serial_number:String(fd.get("serial")||"").trim()||null,connection_method:String(fd.get("method")),connection_status:"pending",protocol:"ONVIF"};const {error}=await sb.from("cameras").insert(payload);if(error){toast("Erreur caméra : "+error.message);return}stopQr();toast("Appareil enregistré. Connexion Gateway en attente.");await camerasPage()};

  document.querySelectorAll(".save-camera-features").forEach(button=>button.onclick=async()=>{
    const cameraId=button.dataset.id;
    const inputs=[...document.querySelectorAll('[data-camera-feature][data-camera-id="'+cameraId+'"]')];
    button.disabled=true;button.textContent="Enregistrement…";
    const rows=inputs.map(input=>({organization_id:orgId,camera_id:cameraId,feature_key:input.dataset.cameraFeature,is_enabled:input.checked,updated_at:new Date().toISOString()}));
    const {error}=await sb.from("camera_feature_settings").upsert(rows,{onConflict:"camera_id,feature_key"});
    button.disabled=false;button.textContent="Enregistrer les fonctions";
    if(error){toast("Erreur : "+error.message);return}
    toast("Fonctions de cette caméra enregistrées indépendamment.");
  });
  document.querySelectorAll(".save-camera-tables").forEach(button=>button.onclick=async()=>{const cameraId=button.dataset.id;const field=document.querySelector('[data-table-labels="'+cameraId+'"]');const labels=[...new Set(field.value.split(/[,،\n]+/).map(x=>x.trim()).filter(Boolean))];if(!labels.length){toast("Saisissez au moins un nom de table.");return}if(labels.some(x=>x.length>40)){toast("Chaque nom de table doit contenir 40 caractères maximum.");return}button.disabled=true;const rows=labels.map(table_label=>({organization_id:orgId,camera_id:cameraId,table_label,is_enabled:true}));const {error}=await sb.from("camera_table_zones").upsert(rows,{onConflict:"camera_id,table_label"});button.disabled=false;if(error){toast("Erreur tables : "+error.message);return}toast(labels.length+" table(s) enregistrée(s). Calibration AI encore nécessaire.");await camerasPage()});
  document.querySelectorAll(".camera-delete").forEach(b=>b.onclick=async()=>{const {error}=await sb.from("cameras").delete().eq("id",b.dataset.id).eq("organization_id",orgId);if(error){toast(error.message);return}camerasPage()});
  $("cashCheckForm").onsubmit=e=>{e.preventDefault();const counted=Number(new FormData(e.target).get("counted"));const diff=counted-cash;$("cashCheckResult").textContent="Écart : "+money(diff)+(diff===0?" — caisse équilibrée selon les données saisies.":diff>0?" — surplus à vérifier.":" — manque à vérifier.");};
  $("shareDailyReport").onclick=async()=>{const report="BIZORA AI - Rapport du "+new Date().toLocaleDateString(window.BizoraI18n?.locale||"fr-MA")+"\\nCA : "+money(revenue)+"\\nVentes : "+todaySales.length+"\\nCommandes actives : "+activeOrders.length+"\\nAlertes stock : "+lowStock.length+"\\nEspèces : "+money(cash);if(navigator.share){try{await navigator.share({title:"Rapport quotidien BIZORA AI",text:report})}catch(e){}}else if(navigator.clipboard){await navigator.clipboard.writeText(report);toast("Rapport copié. Vous pouvez le partager sur WhatsApp.")}else toast(report)};
}

async function settingsPage(){
  const [{data:s,error},{data:deliveries}]=await Promise.all([
    sb.from("daily_report_settings").select("*").eq("organization_id",orgId).maybeSingle(),
    sb.from("daily_report_delivery_log").select("report_date,status,recipient,sent_at,error_message").eq("organization_id",orgId).order("created_at",{ascending:false}).limit(7)
  ]);
  if(error){toast("Erreur paramètres : "+error.message);return}
  const v=s||{is_enabled:false,whatsapp_number:"",send_time:"21:00:00",timezone:"Africa/Casablanca",include_sales:true,include_products:true,include_stock:true,include_orders:true,include_profit:false,whatsapp_opt_in:false};
  const canRunSalesTest=orgs.some(o=>o.id===orgId&&o.role==="owner");
  const salesTestPanel=canRunSalesTest?`<div class="panel" style="margin-top:16px"><div class="section-head"><div><h3>اختبار تقرير المبيعات فقط</h3><span class="muted">إرسال تجريبي مستقل، بدون الكاميرات وبدون تفعيل التقرير اليومي.</span></div><span class="badge">اختبار يدوي</span></div><form id="salesTestForm" class="form-grid"><label>رقم WhatsApp الشخصي بصيغة دولية<input name="recipient" type="tel" inputmode="tel" placeholder="+2126XXXXXXXX" required maxlength="20"><small class="muted">الرقم يستعمل لهذا الاختبار فقط ولا يتم حفظه.</small></label><button class="primary" type="submit">معاينة تقرير المبيعات</button></form><div id="salesTestPreview" class="muted" aria-live="polite"></div></div>`:"";
  $("content").innerHTML=`
    <div class="panel">
      <div class="section-head"><div><h3>Rapport quotidien sur WhatsApp</h3><span class="muted">حدد رقمك والساعة والتفاصيل اللي بغيتي توصلك كل نهار.</span></div><span class="badge">WhatsApp Business</span></div>
      <form id="dailyReportSettings" class="form-grid">
        <label class="inline-form"><input name="is_enabled" type="checkbox" ${v.is_enabled?"checked":""}> تفعيل التقرير اليومي</label>
        <label>رقم WhatsApp بصيغة دولية<input name="whatsapp_number" type="tel" inputmode="tel" placeholder="+2126XXXXXXXX" value="${esc(v.whatsapp_number||"")}" maxlength="20"><small class="muted">مثال المغرب: +2126XXXXXXXX</small></label>
        <label>ساعة التوصل بالتقرير<input name="send_time" type="time" required value="${String(v.send_time||"21:00").slice(0,5)}"></label>
        <label>التوقيت<select name="timezone"><option value="Africa/Casablanca" ${v.timezone==="Africa/Casablanca"?"selected":""}>المغرب — Africa/Casablanca</option><option value="UTC" ${v.timezone==="UTC"?"selected":""}>UTC</option></select></label>
        <div class="panel"><h4>محتوى التقرير</h4>
          <label><input type="checkbox" name="include_sales" ${v.include_sales?"checked":""}> المبيعات وعدد العمليات</label>
          <label><input type="checkbox" name="include_products" ${v.include_products?"checked":""}> المنتجات الأكثر مبيعاً</label>
          <label><input type="checkbox" name="include_stock" ${v.include_stock?"checked":""}> المخزون والمنتجات القريبة من النفاد</label>
          <label><input type="checkbox" name="include_orders" ${v.include_orders?"checked":""}> الطلبات وحالتها</label>
          <label><input type="checkbox" name="include_profit" ${v.include_profit?"checked":""}> ملاحظة الأرباح (تظهر فقط حسب المعطيات المتاحة)</label>
        </div>
        <label class="inline-form"><input type="checkbox" name="whatsapp_opt_in" ${v.whatsapp_opt_in?"checked":""}> كنوافق نتوصل بتقارير BIZORA AI على هاد الرقم عبر WhatsApp.</label>
        <button class="primary" type="submit">حفظ الإعدادات</button>
      </form>
      <p class="notice">الإرسال كيحتاج إعداد حساب WhatsApp Business ديال BIZORA AI وقالب رسالة (Template) مصادق عليه من Meta. خاص صاحب الرقم يوافق على التوصل بالتقارير.</p>
      <p id="dailyReportMsg" class="muted" aria-live="polite"></p>
    </div>
    <div class="panel"><h3>آخر التقارير</h3>${(deliveries||[]).length?(deliveries||[]).map(x=>`<div class="row"><span>${esc(x.report_date)} — ${esc(x.recipient)}</span><span class="badge">${x.status==="sent"?"تم الإرسال":x.status==="failed"?"فشل الإرسال":"قيد المعالجة"}</span></div>${x.error_message?`<small class="muted">${esc(x.error_message)}</small>`:""}`).join(""):"<p class='muted'>مازال ما تسيفط حتى تقرير.</p>"}</div>${salesTestPanel}`;
  window.BizoraI18n?.mountSettings();
  if(canRunSalesTest){
    let testRecipient="";
    $("salesTestForm").onsubmit=async e=>{
      e.preventDefault();const form=new FormData(e.target);testRecipient=String(form.get("recipient")||"").trim();
      const box=$("salesTestPreview");box.textContent="كنوجد معاينة تقرير المبيعات…";
      const {data,error}=await sb.functions.invoke("send-sales-test-report",{body:{recipient:testRecipient,organization_id:orgId,confirm_send:false}});
      if(error||!data?.ok){box.textContent="تعذرت المعاينة: "+(data?.error||error?.message||"خطأ غير معروف");return}
      box.innerHTML=`<p>عدد المبيعات المكتملة: <b>${Number(data.sales_count||0)}</b> — الإجمالي: <b>${money(data.total_sales||0)}</b></p><pre style="white-space:pre-wrap;overflow-wrap:anywhere;background:#0d1529;padding:13px;border-radius:10px;color:#e7ebfa">${esc(data.message_preview||"")}</pre><p class="notice">راجع الرقم ومحتوى التقرير. لن تُرسل أي رسالة حتى تضغط على زر الإرسال وتؤكد العملية.</p><button type="button" class="primary" id="confirmSalesTest">إرسال التقرير التجريبي الآن</button>`;
      $("confirmSalesTest").onclick=async()=>{
        if(!confirm("واش متأكد بغيتي نصيفطو تقرير المبيعات التجريبي لهاد الرقم؟"))return;
        const button=$("confirmSalesTest");button.disabled=true;button.textContent="جاري الإرسال…";
        const result=await sb.functions.invoke("send-sales-test-report",{body:{recipient:testRecipient,organization_id:orgId,confirm_send:true}});
        if(result.error||!result.data?.ok){box.insertAdjacentHTML("beforeend",`<p class="notice">فشل طلب الإرسال: ${esc(result.data?.provider_error||result.data?.error||result.error?.message||"خطأ غير معروف")}</p>`);button.disabled=false;button.textContent="إعادة المحاولة";return}
        box.insertAdjacentHTML("beforeend",`<p class="notice">${result.data.provider_accepted?"قبلت Meta طلب الإرسال. التوصل الفعلي مازال خاصو تأكيد من WhatsApp.":"الطلب رجع بلا تأكيد قبول الرسالة من Meta."}</p>`);
        button.remove();
      };
    };
  }
  $("dailyReportSettings").onsubmit=async e=>{
    e.preventDefault();const f=new FormData(e.target),number=String(f.get("whatsapp_number")||"").trim();
    if(f.get("is_enabled")&&(!/^\+?[1-9]\d{7,14}$/.test(number)||!f.has("whatsapp_opt_in"))){toast("دخل رقم صحيح ووافق على التوصل بالتقارير");return}
    const payload={organization_id:orgId,is_enabled:f.has("is_enabled"),whatsapp_number:number||null,whatsapp_opt_in:f.has("whatsapp_opt_in"),send_time:f.get("send_time"),timezone:f.get("timezone"),schedule_mode:"daily",include_sales:f.has("include_sales"),include_products:f.has("include_products"),include_stock:f.has("include_stock"),include_orders:f.has("include_orders"),include_profit:f.has("include_profit"),updated_by:user.id,updated_at:new Date().toISOString()};
    const {error}=await sb.from("daily_report_settings").upsert(payload,{onConflict:"organization_id"});
    if(error){$("dailyReportMsg").textContent="ما قدرناش نحفظو: "+error.message;return}
    $("dailyReportMsg").textContent="تحفظات الإعدادات بنجاح.";
    toast("تم حفظ إعدادات التقرير");
  };
}

async function reportsPage(){const {data,error}=await sb.from("sales").select("total,created_at,status").eq("organization_id",orgId).order("created_at",{ascending:false}).limit(500);if(error){toast(error.message);return}const total=(data||[]).reduce((a,x)=>a+Number(x.total),0);$("content").innerHTML=`<div class="grid"><div class="stat"><small>Ventes chargées</small><strong>${data.length}</strong></div><div class="stat"><small>Chiffre d'affaires cumulé</small><strong>${money(total)}</strong></div><div class="stat"><small>Ventes finalisées</small><strong>${data.filter(x=>x.status==="completed").length}</strong></div><div class="stat"><small>Période</small><strong>500</strong><em>Dernières opérations maximum</em></div></div><div class="panel" style="margin-top:16px"><h3>Export des ventes</h3><button class="primary" id="exportCsv">Télécharger CSV</button></div>`;$("exportCsv").onclick=()=>{const rows=[["date","total","status"],...(data||[]).map(x=>[x.created_at,x.total,x.status])];const csv=rows.map(r=>r.join(";")).join("\n");const a=document.createElement("a");a.href=URL.createObjectURL(new Blob(["\ufeff"+csv],{type:"text/csv"}));a.download="bizora-ventes.csv";a.click();URL.revokeObjectURL(a.href)}}
sb.auth.onAuthStateChange((_event,session)=>{if(!session){$("authView").classList.remove("hidden");$("appView").classList.add("hidden")}});
boot();

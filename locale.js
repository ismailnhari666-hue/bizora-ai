/* Bizora Digital i18n: per-user language preference, RTL/LTR and six locales. */
(()=> {
const languages=[["ar","العربية","rtl"],["fr","Français","ltr"],["en","English","ltr"],["es","Español","ltr"],["de","Deutsch","ltr"],["zh-CN","简体中文","ltr"]];
const words={
fr:{"لوحة القيادة":"Tableau de bord","المنتجات والمخزون":"Produits et stock","المبيعات":"Ventes","الطلبات":"Commandes","الكاميرات":"Caméras","التقارير":"Rapports","الإعدادات":"Paramètres","مساحة العمل":"Espace de travail","الحساب متصل":"Compte connecté","تسجيل الخروج":"Déconnexion","تسجيل الدخول":"Se connecter","إنشاء حساب":"Créer un compte","كل نشاطك التجاري تحت السيطرة.":"Toute votre activité sous contrôle.","مركز إدارة النشاط":"Centre de gestion","قاعدة البيانات متصلة":"Base de données connectée","مرحباً بك في Bizora Digital":"Bienvenue sur Bizora Digital","إنشاء مساحة العمل":"Créer l’espace de travail","اسم المؤسسة":"Nom de l’entreprise","اللغة":"Langue","اختر لغة الواجهة":"Choisissez la langue de l’interface","حفظ اللغة":"Enregistrer la langue","إعدادات اللغة":"Paramètres linguistiques","تم حفظ اللغة بنجاح":"Langue enregistrée avec succès"},
en:{"لوحة القيادة":"Dashboard","المنتجات والمخزون":"Products & Stock","المبيعات":"Sales","الطلبات":"Orders","الكاميرات":"Cameras","التقارير":"Reports","الإعدادات":"Settings","مساحة العمل":"Workspace","الحساب متصل":"Account connected","تسجيل الخروج":"Sign out","تسجيل الدخول":"Sign in","إنشاء حساب":"Create account","كل نشاطك التجاري تحت السيطرة.":"Your entire business, under control.","مركز إدارة النشاط":"Business management center","قاعدة البيانات متصلة":"Database connected","مرحباً بك في Bizora Digital":"Welcome to Bizora Digital","إنشاء مساحة العمل":"Create workspace","اسم المؤسسة":"Business name","اللغة":"Language","اختر لغة الواجهة":"Choose your interface language","حفظ اللغة":"Save language","إعدادات اللغة":"Language settings","تم حفظ اللغة بنجاح":"Language saved successfully"},
es:{"لوحة القيادة":"Panel principal","المنتجات والمخزون":"Productos e inventario","المبيعات":"Ventas","الطلبات":"Pedidos","الكاميرات":"Cámaras","التقارير":"Informes","الإعدادات":"Configuración","مساحة العمل":"Espacio de trabajo","الحساب متصل":"Cuenta conectada","تسجيل الخروج":"Cerrar sesión","تسجيل الدخول":"Iniciar sesión","إنشاء حساب":"Crear cuenta","كل نشاطك التجاري تحت السيطرة.":"Todo tu negocio bajo control.","مركز إدارة النشاط":"Centro de gestión empresarial","قاعدة البيانات متصلة":"Base de datos conectada","مرحباً بك في Bizora Digital":"Te damos la bienvenida a Bizora Digital","إنشاء مساحة العمل":"Crear espacio de trabajo","اسم المؤسسة":"Nombre de la empresa","اللغة":"Idioma","اختر لغة الواجهة":"Elige el idioma de la interfaz","حفظ اللغة":"Guardar idioma","إعدادات اللغة":"Configuración de idioma","تم حفظ اللغة بنجاح":"Idioma guardado correctamente"},
de:{"لوحة القيادة":"Dashboard","المنتجات والمخزون":"Produkte & Lager","المبيعات":"Verkäufe","الطلبات":"Bestellungen","الكاميرات":"Kameras","التقارير":"Berichte","الإعدادات":"Einstellungen","مساحة العمل":"Arbeitsbereich","الحساب متصل":"Konto verbunden","تسجيل الخروج":"Abmelden","تسجيل الدخول":"Anmelden","إنشاء حساب":"Konto erstellen","كل نشاطك التجاري تحت السيطرة.":"Ihr gesamtes Geschäft unter Kontrolle.","مركز إدارة النشاط":"Unternehmensverwaltung","قاعدة البيانات متصلة":"Datenbank verbunden","مرحباً بك في Bizora Digital":"Willkommen bei Bizora Digital","إنشاء مساحة العمل":"Arbeitsbereich erstellen","اسم المؤسسة":"Unternehmensname","اللغة":"Sprache","اختر لغة الواجهة":"Oberflächensprache auswählen","حفظ اللغة":"Sprache speichern","إعدادات اللغة":"Spracheinstellungen","تم حفظ اللغة بنجاح":"Sprache erfolgreich gespeichert"},
"zh-CN":{"لوحة القيادة":"仪表板","المنتجات والمخزون":"商品与库存","المبيعات":"销售","الطلبات":"订单","الكاميرات":"摄像头","التقارير":"报表","الإعدادات":"设置","مساحة العمل":"工作空间","الحساب متصل":"账户已连接","تسجيل الخروج":"退出登录","تسجيل الدخول":"登录","إنشاء حساب":"创建账户","كل نشاطك التجاري تحت السيطرة.":"全面掌控您的业务。","مركز إدارة النشاط":"业务管理中心","قاعدة البيانات متصلة":"数据库已连接","مرحباً بك في Bizora Digital":"欢迎使用 Bizora Digital","إنشاء مساحة العمل":"创建工作空间","اسم المؤسسة":"企业名称","اللغة":"语言","اختر لغة الواجهة":"选择界面语言","حفظ اللغة":"保存语言","إعدادات اللغة":"语言设置","تم حفظ اللغة بنجاح":"语言保存成功"}
};
let current="ar",userId="guest";const originals=new WeakMap(),originalAttrs=new WeakMap();
const EXTRA=[
["ملخص النشاط التجاري","ملخص النشاط التجاري","Résumé de l’activité","Business overview","Resumen del negocio","Geschäftsübersicht","业务概览"],
["نظرة سريعة على أداء مؤسستك اليوم.","نظرة سريعة على أداء مؤسستك اليوم.","Aperçu des performances de votre entreprise aujourd’hui.","A quick look at your business performance today.","Un vistazo al rendimiento de tu negocio hoy.","Ein kurzer Überblick über Ihre Geschäftsleistung heute.","快速查看您企业今天的经营表现。"],
["تسجيل عملية بيع","تسجيل عملية بيع","Enregistrer une vente","Record a sale","Registrar una venta","Verkauf erfassen","记录销售"],
["مداخيل اليوم","مداخيل اليوم","Revenus du jour","Today's revenue","Ingresos de hoy","Heutiger Umsatz","今日收入"],
["عدد المبيعات","عدد المبيعات","Nombre de ventes","Number of sales","Número de ventas","Anzahl der Verkäufe","销售笔数"],
["متوسط البيع","متوسط البيع","Vente moyenne","Average sale","Venta media","Durchschnittlicher Verkauf","平均销售额"],
["تنبيهات المخزون","تنبيهات المخزون","Alertes de stock","Stock alerts","Alertas de inventario","Lagerwarnungen","库存提醒"],
["منتجات وصلت للحد الأدنى","منتجات وصلت للحد الأدنى","Produits au seuil minimum","Products at minimum stock","Productos en el nivel mínimo","Produkte am Mindestbestand","达到最低库存的商品"],
["المخزون دون تنبيهات","المخزون دون تنبيهات","Aucun seuil de stock atteint","No stock alerts","Sin alertas de inventario","Keine Lagerwarnungen","库存正常"],
["آخر المبيعات","آخر المبيعات","Dernières ventes","Recent sales","Ventas recientes","Letzte Verkäufe","最近销售"],
["طلبات جارية","طلبات جارية","Commandes en cours","Active orders","Pedidos activos","Laufende Bestellungen","进行中的订单"],
["اختصارات سريعة","اختصارات سريعة","Accès rapides","Quick shortcuts","Accesos rápidos","Schnellzugriffe","快捷入口"],
["لائحة المأكولات والمشروبات","لائحة المأكولات والمشروبات","Liste des plats et boissons","Food & drinks list","Lista de comidas y bebidas","Speisen- und Getränkeliste","餐食与饮品列表"],
["اسم المنتوج","اسم المنتوج","Nom du produit","Product name","Nombre del producto","Produktname","商品名称"],
["ثمن البيع (درهم)","ثمن البيع (درهم)","Prix de vente (MAD)","Selling price (MAD)","Precio de venta (MAD)","Verkaufspreis (MAD)","售价 (MAD)"],
["المخزون الحالي","المخزون الحالي","Stock actuel","Current stock","Inventario actual","Aktueller Lagerbestand","当前库存"],
["إضافة إلى اللائحة","إضافة إلى اللائحة","Ajouter à la liste","Add to list","Añadir a la lista","Zur Liste hinzufügen","添加到列表"],
["المنتجات المؤرشفة","المنتجات المؤرشفة","Produits archivés","Archived products","Productos archivados","Archivierte Produkte","已归档商品"],
["بحث عن منتوج","بحث عن منتوج","Rechercher un produit","Search products","Buscar productos","Produkte suchen","搜索商品"],
["تصفية حسب النوع","تصفية حسب النوع","Filtrer par type","Filter by type","Filtrar por tipo","Nach Typ filtern","按类型筛选"],
["تصفية حسب الفئة","تصفية حسب الفئة","Filtrer par catégorie","Filter by category","Filtrar por categoría","Nach Kategorie filtern","按类别筛选"],
["تعديل","تعديل","Modifier","Edit","Editar","Bearbeiten","编辑"],
["Enregistrer une vente","تسجيل عملية بيع","Enregistrer une vente","Record a sale","Registrar una venta","Verkauf erfassen","记录销售"],
["Le stock sera diminué automatiquement après validation.","سيتم خصم الكمية من المخزون تلقائياً بعد التأكيد.","Le stock sera diminué automatiquement après validation.","Stock will be reduced automatically after confirmation.","El inventario se reducirá automáticamente al confirmar.","Der Lagerbestand wird nach Bestätigung automatisch reduziert.","确认后将自动扣减库存。"],
["Produit","المنتوج","Produit","Product","Producto","Produkt","商品"],
["Quantité","الكمية","Quantité","Quantity","Cantidad","Menge","数量"],
["Remise (MAD)","التخفيض (MAD)","Remise (MAD)","Discount (MAD)","Descuento (MAD)","Rabatt (MAD)","折扣 (MAD)"],
["Taxe (MAD)","الضريبة (MAD)","Taxe (MAD)","Tax (MAD)","Impuesto (MAD)","Steuer (MAD)","税费 (MAD)"],
["Mode de paiement","طريقة الأداء","Mode de paiement","Payment method","Método de pago","Zahlungsart","付款方式"],
["Espèces","نقداً","Espèces","Cash","Efectivo","Bargeld","现金"],
["Carte","بطاقة","Carte","Card","Tarjeta","Karte","银行卡"],
["Virement","تحويل بنكي","Virement","Bank transfer","Transferencia","Überweisung","银行转账"],
["Confirmer la vente","تأكيد البيع","Confirmer la vente","Confirm sale","Confirmar venta","Verkauf bestätigen","确认销售"],
["Historique des ventes","سجل المبيعات","Historique des ventes","Sales history","Historial de ventas","Verkaufshistorie","销售记录"],
["Stock insuffisant","المخزون غير كافٍ","Stock insuffisant","Insufficient stock","Inventario insuficiente","Nicht genügend Lagerbestand","库存不足"],
["Vente enregistrée","تم تسجيل البيع","Vente enregistrée","Sale recorded","Venta registrada","Verkauf erfasst","销售已记录"],
["Aucune vente.","لا توجد مبيعات.","Aucune vente.","No sales.","No hay ventas.","Keine Verkäufe.","暂无销售。"],
["Écran cuisine","شاشة المطبخ","Écran cuisine","Kitchen screen","Pantalla de cocina","Küchenbildschirm","厨房屏幕"],
["Retour aux commandes","العودة إلى الطلبات","Retour aux commandes","Back to orders","Volver a pedidos","Zurück zu Bestellungen","返回订单"],
["Aucune commande","لا توجد طلبات","Aucune commande","No orders","No hay pedidos","Keine Bestellungen","暂无订单"],
["Créer une commande","إنشاء طلب","Créer une commande","Create order","Crear pedido","Bestellung erstellen","创建订单"],
["Type de commande","نوع الطلب","Type de commande","Order type","Tipo de pedido","Bestellart","订单类型"],
["Sur place / Table","داخل المحل / طاولة","Sur place / Table","Dine-in / Table","En local / Mesa","Vor Ort / Tisch","堂食 / 桌台"],
["Livraison","توصيل","Livraison","Delivery","Entrega","Lieferung","配送"],
["Nom du client","اسم الزبون","Nom du client","Customer name","Nombre del cliente","Kundenname","客户姓名"],
["Numéro de table","رقم الطاولة","Numéro de table","Table number","Número de mesa","Tischnummer","桌号"],
["Ajouter un article","إضافة منتج","Ajouter un article","Add item","Añadir artículo","Artikel hinzufügen","添加商品"],
["Statut mis à jour","تم تحديث الحالة","Statut mis à jour","Status updated","Estado actualizado","Status aktualisiert","状态已更新"],
["Aucune caméra ajoutée.","لم تتم إضافة أي كاميرا.","Aucune caméra ajoutée.","No cameras added.","No se han añadido cámaras.","Keine Kameras hinzugefügt.","尚未添加摄像头。"],
["Supprimer","حذف","Supprimer","Delete","Eliminar","Löschen","删除"],
["Rapport quotidien","التقرير اليومي","Rapport quotidien","Daily report","Informe diario","Tagesbericht","每日报告"],
["Partager le rapport","مشاركة التقرير","Partager le rapport","Share report","Compartir informe","Bericht teilen","分享报告"],
["Télécharger CSV","تنزيل CSV","Télécharger CSV","Download CSV","Descargar CSV","CSV herunterladen","下载 CSV"],
["Ventes chargées","المبيعات المحملة","Ventes chargées","Sales loaded","Ventas cargadas","Geladene Verkäufe","已加载销售"],
["Chiffre d'affaires cumulé","إجمالي رقم المعاملات","Chiffre d'affaires cumulé","Total revenue","Ingresos totales","Gesamtumsatz","总营业额"],
["Ventes finalisées","المبيعات المكتملة","Ventes finalisées","Completed sales","Ventas completadas","Abgeschlossene Verkäufe","已完成销售"],
["Période","الفترة","Période","Period","Periodo","Zeitraum","期间"],
["Contenu du rapport","محتوى التقرير","Contenu du rapport","Report contents","Contenido del informe","Berichtsinhalte","报告内容"],
["Produits les plus vendus","المنتجات الأكثر مبيعاً","Produits les plus vendus","Best-selling products","Productos más vendidos","Meistverkaufte Produkte","畅销商品"],
["En attente","قيد الانتظار","En attente","Pending","Pendiente","Ausstehend","待处理"],
["En préparation","قيد التحضير","En préparation","Preparing","En preparación","In Zubereitung","准备中"],
["Prête","جاهزة","Prête","Ready","Listo","Bereit","已就绪"],
["Servie","تم التقديم","Servie","Served","Servido","Serviert","已上菜"],
["Terminée","مكتملة","Terminée","Completed","Completado","Abgeschlossen","已完成"],
["Annulée","ملغاة","Annulée","Cancelled","Cancelado","Storniert","已取消"],
["Langue","اللغة","Langue","Language","Idioma","Sprache","语言"],
["Enregistrer les paramètres","حفظ الإعدادات","Enregistrer les paramètres","Save settings","Guardar configuración","Einstellungen speichern","保存设置"],
["Derniers rapports","آخر التقارير","Derniers rapports","Recent reports","Informes recientes","Letzte Berichte","最近报告"],
["Envoyé","تم الإرسال","Envoyé","Sent","Enviado","Gesendet","已发送"],
["Échec de l’envoi","فشل الإرسال","Échec de l’envoi","Send failed","Error de envío","Senden fehlgeschlagen","发送失败"],
["En cours","قيد المعالجة","En cours","Processing","En proceso","In Bearbeitung","处理中"],
["Erreur inconnue","خطأ غير معروف","Erreur inconnue","Unknown error","Error desconocido","Unbekannter Fehler","未知错误"],
["Paramètres caméra : ","إعدادات الكاميرا: ","Paramètres caméra : ","Camera settings: ","Ajustes de cámara: ","Kameraeinstellungen: ","摄像头设置："],
["Configuration des tables : ","إعداد الطاولات: ","Configuration des tables : ","Table configuration: ","Configuración de mesas: ","Tischkonfiguration: ","桌台配置："]
];
L.forEach((x,i)=>R.forEach(row=>{if(MAP[x[0]][row[0]]===undefined)MAP[x[0]][row[0]]=row[i+1];}));

const dictionary=()=>({...words[current],...MAP[current]});
function translate(node){if(node.nodeType!==Node.TEXT_NODE||!node.nodeValue.trim())return;const source=originals.get(node)||node.nodeValue;originals.set(node,source);let s=source;Object.keys(dictionary()).sort((a,b)=>b.length-a.length).forEach(k=>s=s.split(k).join(dictionary()[k]));if(s!==node.nodeValue)node.nodeValue=s;}
function apply(root=document.body){if(!root)return;if(root.nodeType===Node.TEXT_NODE){translate(root);return}const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);while(w.nextNode())translate(w.currentNode);if(root.querySelectorAll){const nodes=[...(root.matches?.("[placeholder],[title],[aria-label]")?[root]:[]),...root.querySelectorAll("[placeholder],[title],[aria-label]")];nodes.forEach(el=>["placeholder","title","aria-label"].forEach(attr=>{if(!el.hasAttribute(attr))return;let old=originalAttrs.get(el);if(!old){old={};originalAttrs.set(el,old)}if(!(attr in old))old[attr]=el.getAttribute(attr);let value=old[attr];Object.keys(dictionary()).sort((a,b)=>b.length-a.length).forEach(k=>value=value.split(k).join(dictionary()[k]));el.setAttribute(attr,value)}))}}
function set(code,save=true){current=languages.some(x=>x[0]===code)?code:"ar";const l=languages.find(x=>x[0]===current);document.documentElement.lang=current;document.documentElement.dir=l[2];document.body.dir=l[2];if(save)try{localStorage.setItem("bizora_language_"+userId,current)}catch(e){}apply();}
function mount(id){userId=String(id||"guest");let saved="ar";try{saved=localStorage.getItem("bizora_language_"+userId)||localStorage.getItem("bizora_language_guest")||"ar"}catch(e){}set(saved,false);mountAuthPicker();const c=document.getElementById("content");if(!c||document.getElementById("languageSettings"))return;const names={"ar":["إعدادات اللغة","اللغة","اختر لغة الواجهة","حفظ اللغة"],fr:["Paramètres linguistiques","Langue","Choisissez la langue de l’interface","Enregistrer la langue"],en:["Language settings","Language","Choose your interface language","Save language"],es:["Configuración de idioma","Idioma","Elige el idioma de la interfaz","Guardar idioma"],de:["Spracheinstellungen","Sprache","Wählen Sie Ihre bevorzugte Oberflächensprache","Sprache speichern"],"zh-CN":["语言设置","语言","选择您偏好的界面语言","保存语言"]}[current];const opts=languages.map(x=>'<option value="'+x[0]+'">'+x[1]+'</option>').join("");c.insertAdjacentHTML("afterbegin",'<section class="panel" id="languageSettings" style="margin-bottom:16px"><div class="section-head"><div><h3>'+names[0]+'</h3><span class="muted">'+names[2]+'</span></div><span class="badge">6 languages</span></div><form id="languageForm" class="form-grid"><label>'+names[1]+'<select id="bizoraLanguage">'+opts+'</select></label><button class="primary" type="submit">'+names[3]+'</button><small class="muted">العربية · Français · English · Español · Deutsch · 简体中文</small></form><p id="languageMsg" class="notice" aria-live="polite"></p></section>');const select=document.getElementById("bizoraLanguage");select.value=current;document.getElementById("languageForm").onsubmit=e=>{e.preventDefault();set(select.value,true);document.getElementById("languageSettings")?.remove();mount(userId);const m=document.getElementById("languageMsg");m.textContent=({ar:"تم حفظ اللغة بنجاح",fr:"Langue enregistrée avec succès",en:"Language saved successfully",es:"Idioma guardado correctamente",de:"Sprache erfolgreich gespeichert","zh-CN":"语言保存成功"})[current];};}
window.BizoraI18n={mount,set,apply,get language(){return current},languages};
new MutationObserver(rs=>rs.forEach(r=>r.addedNodes.forEach(n=>{if(n.nodeType===Node.TEXT_NODE)translate(n);else if(n.nodeType===Node.ELEMENT_NODE)apply(n)}))).observe(document.documentElement,{childList:true,subtree:true});
})();
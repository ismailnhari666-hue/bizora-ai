# Bizora: قبل الإطلاق (اللي خاصك تدير نتا)

## 1. Supabase (لوحة التحكم)
- [ ] Authentication > URL Configuration: Site URL + Redirect URLs (`.../bizora-ai/` و `.../bizora-ai/**`).
- [ ] Authentication > Sign In / Providers > Password: فعّل Leaked password protection (إن كانت الخطة تسمح).
- [ ] Authentication > SMTP: ربط Resend/Brevo بدومين ديالك (باش توصل رسائل «نسيت كلمة السر»).
- [ ] Project Settings > Billing: Pro إلى بغيتي نسخ احتياطي يومي (Daily backups).

## 2. الواتساب الحقيقي (Meta)
- [ ] رقم مخصص، توثيق Business، قالب معتمد، وTokens دائمة.
- [ ] بدّل أسرار الدوال (`WHATSAPP_*`) فـSupabase > Edge Functions > Secrets.

## 3. فـ`app.js` (أعلى الملف / قرب `BILLING_WHATSAPP`)
- [ ] `PLAN_PRICE_MAD` = ثمن الاشتراك الشهري.
- [ ] `PAYMENT_INFO` = RIB، اسم المستفيد، Cash Plus، ملاحظة.

## 4. القانون
- [ ] عمّر الأقواس `[ ]` فـ`privacy.html` و`terms.html` (رقم تصريح CNDP، المدينة، ثمن الاشتراك).
- [ ] خلي مستشار قانوني يراجعهم. تأكد من الوضع القانوني للنشاط مع محاسب.

## 5. التجربة قبل البيع
- [ ] سجّل حساب صاحب محل جديد، عمّر لوحة المبيعات، دير عامل بالكود، سجّل طلبات، جرّب أوفلاين، جرد الصندوق، تقارير.
- [ ] جرّب «نسيت كلمة السر؟» بإيميل حقيقي.
- [ ] 3 إلى 5 محلات تجريبية بثمن رمزي قبل الإطلاق الواسع.

## 6. العمليات
- [ ] لما يخلصك زبون: ★ الاشتراكات > +1 شهر (وكتب مرجع الأداء).
- [ ] Android: ثبّت الـAPK من GitHub Actions أو استعمل PWA («إضافة للشاشة الرئيسية»).

# Paid pilot support — owner review draft

Not published. The owner must approve a real support contact, staffed hours/timezone, expected response time and emergency escalation route before inviting customers. This draft creates no inbox, service-level promise or automatic notification.

## Customer instructions / إرشادات العميل

If a workflow fails, open its run inspector and record the workflow name, run number, approximate time, selected step, displayed error code and language. Explain the expected result and the actual result. If billing is affected, record the subscription status and date; use the provider's secure support channel for payment details. Send only sanitized screenshots and a minimal synthetic reproduction to the approved pilot support contact.

عند فشل سير عمل، افتح تفاصيل التشغيل وسجّل اسم سير العمل ورقم التشغيل والوقت التقريبي والخطوة ورمز الخطأ واللغة. وضّح النتيجة المتوقعة والنتيجة الفعلية. إذا تعلّق الأمر بالفوترة، سجّل حالة الاشتراك والتاريخ، واستخدم قناة المزود الآمنة لتفاصيل الدفع. أرسل صورًا منقّحة ومثالًا تجريبيًا صغيرًا إلى جهة الدعم المعتمدة للتجربة.

Never send API keys, passwords, session cookies, OTPs, recovery codes, customer personal data or full request/response bodies to support. Enter credentials only in the intended protected settings/provider UI. A support worker does not need your password or MFA code.

لا ترسل مفاتيح API أو كلمات المرور أو ملفات تعريف جلسات الدخول أو رموز التحقق أو رموز الاسترداد أو بيانات العملاء الشخصية أو نصوص الطلبات الكاملة إلى الدعم. أدخل بيانات الاعتماد في صفحة الإعدادات المحمية أو صفحة المزود فقط. لا يحتاج موظف الدعم إلى كلمة مرورك أو رمز التحقق الخاص بك.

If an external result is uncertain, pause the flow and inspect the provider's history before retrying. A fresh rerun can repeat an external action and counts as another execution. Do not approve a refund, cancellation, outgoing message or write until the owner checks the current request and destination. Retry protection for a submitted dialog does not make a deliberate new run harmless.

إذا كانت نتيجة إجراء خارجي غير مؤكدة، أوقف سير العمل مؤقتًا وافحص سجل المزود قبل إعادة المحاولة. قد يكرر تشغيل جديد الإجراء الخارجي ويُحتسب تشغيلًا إضافيًا. لا توافق على استرداد أو إلغاء أو رسالة صادرة أو كتابة بيانات قبل مراجعة المالك للطلب الحالي والوجهة.

## Operator procedure

1. Check whether the incident affects one run, workspace or all pilot customers. Keep tenant access bounded to authorized roles.
2. For suspected duplicate external actions, unauthorized access, exposed credentials or wrong payment state, pause affected automation and billing changes. Preserve sanitized timestamps and correlation IDs. Escalate to the owner immediately through the approved route.
3. Inspect persisted run/step/event history and provider receipts before deciding whether an action occurred. Do not claim success from a request timeout or UI toast.
4. Reproduce with synthetic data in an isolated test environment. Link the exact source SHA, relevant diff, logs and focused test result. Keep failed evidence intact.
5. If a credential may be exposed, the owner revokes/replaces it privately through the provider and reconnects it. Do not rotate or destroy customer data without an approved recovery plan.
6. Tell the customer what is confirmed, what remains uncertain and the next update time agreed with the owner. Refunds and cancellations are owner decisions under the approved terms; this document does not grant support workers payment authority.
7. Close the incident only after the owner verifies the repair and the customer confirms the actual expected result. Record any residual limitation and needed follow-up.

## Before publication

- [ ] Real support contact and secure intake approved; no invented address or channel.
- [ ] Staffed hours, response target and emergency escalation agreed for 3–5 customers.
- [ ] EN/AR customer instructions reviewed, accessible from the onboarding/support surface chosen by the owner.
- [ ] Secret-free evidence retention location, authorized readers and incident owner established.
- [ ] One synthetic failure and one uncertain-action support drill completed on the release candidate.

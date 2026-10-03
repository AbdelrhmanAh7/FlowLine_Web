# Paid pilot policies — owner review draft

These are product/operational drafting points for owner review, not published terms or legal advice. Jurisdiction, legal entity, support contact, prices, taxes, policy effective dates, retention periods and statutory consumer rights are intentionally undecided. Qualified review and the owner's approval are required before customer acceptance. No live payment is authorized by this draft.

## Scope / نطاق التجربة

Flowline is an invite-only general workflow platform pilot for 3–5 approved customers. The signed offer must identify the one subscription price, currency, billing interval, workspace, execution/concurrency limits, verified providers and support hours. Unverified integrations and providers must be described as unavailable or pending verification. No uptime or business-result guarantee is created by sample tests.

Flowline منصة عامة لسير العمل ضمن تجربة محدودة بالدعوات لـ3–5 عملاء معتمدين. يجب أن يحدد العرض المقبول سعر الاشتراك وعملته ودورته ومساحة العمل وحدود التشغيل والتزامن والمزودين المتحقق منهم وساعات الدعم. تُعرض التكاملات غير المتحقق منها كغير متاحة أو بانتظار التحقق. لا تنشئ اختبارات البيانات التجريبية ضمانًا للتوافر أو نتائج الأعمال.

## Usage and separate provider charges / الاستخدام ورسوم المزود المنفصلة

An accepted workflow or agent run consumes one execution even if it later fails or is cancelled. Recovery/deduplication of that run does not consume another; a new run does. Limits reset by UTC calendar month. The customer supplies supported API credentials and pays provider charges separately. Flowline ledger amounts use configured prices and may omit unknown provider costs; they are not a provider invoice or an external spend guarantee. The customer controls provider-side budgets, scopes and connection permissions. The final offer must state the approved limits and over-limit behavior explicitly; no automatic paid overage is proposed.

يستهلك التشغيل المقبول لسير عمل أو وكيل تشغيلًا واحدًا حتى إذا فشل أو أُلغي لاحقًا. لا تستهلك استعادته أو إزالة تكراره تشغيلًا آخر؛ يستهلك التشغيل الجديد تشغيلًا إضافيًا. تبدأ الحدود من جديد كل شهر تقويمي بتوقيت UTC. يقدم العميل بيانات API المدعومة ويدفع رسوم المزود منفصلة. تعتمد مبالغ السجل على الأسعار المُعدّة وقد لا تشمل تكاليف مجهولة؛ وهي ليست فاتورة المزود أو ضمانًا لحد إنفاق خارجي. لا يقترح هذا المسودّة رسوم تجاوز مدفوعة تلقائية.

## Human approval / الموافقة البشرية

Customers review destinations, content and consequences before approving sensitive actions. A refund/cancellation request is prepared for the business owner's decision; a draft never proves that money moved or a booking changed. Unknown external outcomes require provider reconciliation before retry. Customers can pause automation and revoke connection access through supported controls.

يراجع العميل الوجهة والمحتوى والنتائج قبل الموافقة على الإجراءات الحساسة. يُجهّز طلب الاسترداد أو الإلغاء ليقرر فيه صاحب العمل؛ ولا تثبت المسودة انتقال أموال أو تغيير حجز. تتطلب النتائج الخارجية المجهولة فحص سجل المزود قبل إعادة المحاولة.

## Cancellation and refunds / الإلغاء والاسترداد

The existing subscription control requests cancellation at the provider's period end; the confirmed provider state determines the effective end date. The final policy must define how to request cancellation, what access continues, how disputes are handled and applicable statutory rights. Refund eligibility and timing require owner/legal approval; there is no automatic refund promise in this draft. Sandbox tests use synthetic payments and do not establish live refund capability.

يرسل زر إلغاء الاشتراك طلبًا إلى المزود للإلغاء عند نهاية الفترة، وتحدد حالة المزود المؤكدة تاريخ الانتهاء الفعلي. يجب أن توضح السياسة النهائية طريقة الطلب واستمرار الوصول والتعامل مع النزاعات والحقوق القانونية المطبقة. تحتاج أهلية الاسترداد ومدته إلى موافقة المالك والمراجعة القانونية؛ ولا تقدم هذه المسودة وعدًا تلقائيًا بالاسترداد.

## Data and provider processing / البيانات ومعالجة المزود

Before publication, inventory actual collected account/workspace data, persisted workflow inputs/outputs, run logs, connection-secret storage, provider transfers, infrastructure locations, subprocessors, backup copies and deletion/export controls. State specific retention/deletion periods and the authorized contact. Describe encryption and access controls only to the extent currently implemented and tested. Do not promise complete erasure, zero provider training, regional residency or a credential-access guarantee without evidence. Use synthetic data during onboarding until the owner approves the customer's data category and provider handling.

قبل النشر، احصر البيانات التي تُجمع فعليًا ومدخلات ومخرجات سير العمل وسجلات التشغيل وأماكن تخزين مفاتيح الربط وعمليات نقل البيانات للمزود ومواقع البنية التحتية والجهات الفرعية والنسخ الاحتياطية وأدوات الحذف والتصدير. حدّد فترات الاحتفاظ والحذف وجهة التواصل. لا تعد بالمحو الكامل أو عدم تدريب المزود على البيانات أو إقامة البيانات في منطقة محددة دون دليل.

## Owner approval checklist

- [ ] Approved legal entity, jurisdiction, contact and effective dates.
- [ ] One verified price/interval and precise execution/concurrency/reset definitions.
- [ ] Separate provider charges and supported credential types disclosed in EN/AR.
- [ ] Real sandbox checkout, renewal, failure and cancellation evidence linked.
- [ ] Refund/dispute terms reviewed without overriding statutory rights.
- [ ] Actual data/subprocessor inventory, retention, export/deletion and backup handling documented.
- [ ] Support contact/hours and incident escalation approved.
- [ ] Published EN/AR text matches the verified offer and customer acceptance is recorded before billing.

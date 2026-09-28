export const emailCopy = {
  ar: {
    verify: { title: "تأكيد البريد الإلكتروني", prompt: "اضغط للتأكيد بعد فتح الرابط من بريدك.", submit: "تأكيد البريد", done: "تم تأكيد بريدك. يمكنك تسجيل الدخول الآن." },
    forgot: { title: "نسيت كلمة المرور؟", prompt: "أدخل بريدك وسنرسل رابطاً إذا كان الحساب مؤهلاً.", submit: "إرسال الرابط", done: "إذا كان الحساب مؤهلاً، ستصلك رسالة قريباً." },
    resend: { title: "إعادة إرسال التأكيد", prompt: "أدخل بريدك لإرسال رابط تأكيد جديد.", submit: "إعادة الإرسال", done: "إذا كان الحساب مؤهلاً، ستصلك رسالة قريباً." },
    reset: { title: "تعيين كلمة مرور جديدة", prompt: "أدخل كلمة مرور من 8 إلى 128 حرفاً.", submit: "تعيين كلمة المرور", done: "تغيّرت كلمة المرور. سجّل الدخول للمتابعة." },
    delete: { title: "حذف الحساب", prompt: "سنرسل رابط تأكيد إلى بريد حسابك. حذف الحساب نهائي.", submit: "إرسال رابط التأكيد", done: "تم إرسال رابط التأكيد إلى بريدك." },
    deleteConfirm: { title: "تأكيد حذف الحساب", prompt: "سيؤدي هذا إلى حذف حسابك نهائياً.", submit: "حذف الحساب", done: "تم حذف حسابك." },
    email: "البريد الإلكتروني", password: "كلمة المرور الجديدة", back: "العودة إلى تسجيل الدخول", invalid: "الرابط غير صالح. اطلب رابطاً جديداً.", expired: "انتهت صلاحية الرابط. اطلب رابطاً جديداً.", used: "استُخدم هذا الرابط بالفعل. اطلب رابطاً جديداً.", transfer_required: "أنت آخر مالك لمساحة عمل فيها أعضاء آخرون. انقل الملكية قبل حذف الحساب.", failed: "تعذّر إكمال الطلب. حاول مجدداً.", rate: "طلبات كثيرة. حاول بعد ساعة.", request: "هذا الرابط لا يحتوي على رمز صالح.",
  },
  en: {
    verify: { title: "Verify email", prompt: "Confirm after opening the link from your inbox.", submit: "Verify email", done: "Your email is verified. You can sign in now." },
    forgot: { title: "Forgot password?", prompt: "Enter your email and we'll send a link if the account is eligible.", submit: "Send link", done: "If the account is eligible, an email will arrive shortly." },
    resend: { title: "Resend verification", prompt: "Enter your email to request a new verification link.", submit: "Resend", done: "If the account is eligible, an email will arrive shortly." },
    reset: { title: "Set a new password", prompt: "Enter a password of 8 to 128 characters.", submit: "Reset password", done: "Your password changed. Sign in to continue." },
    delete: { title: "Delete account", prompt: "We'll send a confirmation link to your account email. Deletion is permanent.", submit: "Send confirmation link", done: "A confirmation link was sent to your email." },
    deleteConfirm: { title: "Confirm account deletion", prompt: "This permanently deletes your account.", submit: "Delete account", done: "Your account was deleted." },
    email: "Email", password: "New password", back: "Back to sign in", invalid: "This link is invalid. Request a new one.", expired: "This link expired. Request a new one.", used: "This link was already used. Request a new one.", transfer_required: "You are the last owner of a workspace with other members. Transfer ownership before deleting your account.", failed: "Couldn't complete the request. Try again.", rate: "Too many requests. Try again in an hour.", request: "This link has no valid token.",
  },
} as const;

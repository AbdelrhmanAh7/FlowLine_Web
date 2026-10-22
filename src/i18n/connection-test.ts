import { ApiError } from "@/lib/api";
import { apiErrorMessage } from "./errors";
import type { Translator } from "./translate";

const MESSAGES: Record<"en" | "ar", Record<string, string>> = {
  en: {
    test: "Test connection",
    testOk: "Connection OK — {account}",
    testError: "Couldn't test the connection",
    testAuthFailed: "Invalid API key — check the key and that it grants access",
    testUnreachable: "Couldn't reach the provider — check the URL and that it is running",
    testProviderError: "The provider returned an unexpected error",
    testEgressBlocked: "This address isn't allowed — use the provider's public https URL",
    testNotOwner: "Only the member who created this private connection can test it",
    testGone: "This connection no longer exists — refresh the page",
    testUnavailable: "Test connection isn't available for this connection",
  },
  ar: {
    test: "اختبار الاتصال",
    testOk: "الاتصال سليم — {account}",
    testError: "تعذّر اختبار الاتصال",
    testAuthFailed: "مفتاح API غير صالح — تحقق من المفتاح وأنه يمنح الوصول",
    testUnreachable: "تعذّر الوصول إلى المزوّد — تحقق من الرابط وأنه يعمل",
    testProviderError: "أعاد المزوّد خطأً غير متوقع",
    testEgressBlocked: "هذا العنوان غير مسموح به — استخدم رابط https العام للمزوّد",
    testNotOwner: "لا يمكن أن يختبر هذا الاتصال الخاص إلا العضو الذي أنشأه",
    testGone: "لم يعد هذا الاتصال موجودًا — حدّث الصفحة",
    testUnavailable: "اختبار الاتصال غير متاح لهذا الاتصال",
  },
};

const ERROR_KEYS: Record<string, keyof typeof MESSAGES["en"]> = {
  AUTHENTICATION_FAILED: "testAuthFailed",
  PROVIDER_UNREACHABLE: "testUnreachable",
  PROVIDER_ERROR: "testProviderError",
  EGRESS_BLOCKED: "testEgressBlocked",
  NOT_CONNECTION_OWNER: "testNotOwner",
  CONNECTION_NOT_FOUND: "testGone",
  UNKNOWN_PROVIDER: "testUnavailable",
  TEST_NOT_SUPPORTED: "testUnavailable",
};

export function testConnectionButtonText(t: Translator): string {
  const loc = t.locale === "ar" ? "ar" : "en";
  return MESSAGES[loc].test;
}

export function testConnectionSuccessText(t: Translator, account: string): string {
  const loc = t.locale === "ar" ? "ar" : "en";
  return MESSAGES[loc].testOk.replace("{account}", account);
}

/** A failed connection test shows a fixed, translated line per bounded code — never the provider's own text. */
export function connectionTestErrorText(t: Translator, err: unknown): string {
  const loc = t.locale === "ar" ? "ar" : "en";
  if (err instanceof ApiError && ERROR_KEYS[err.code]) {
    const key = ERROR_KEYS[err.code];
    return MESSAGES[loc][key];
  }
  return apiErrorMessage(t, err, MESSAGES[loc].testError);
}

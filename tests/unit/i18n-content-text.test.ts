import { describe, expect, it } from "vitest";
import { DESIGN_TEMPLATES } from "@/engine/design-templates";
import { LOCAL_TEMPLATES } from "@/engine/templates";
import { listProviders } from "@/integrations/registry";
import {
  actionDescription,
  actionTitle,
  actionTitleById,
  connectFieldHelp,
  connectFieldLabel,
  providerCategory,
  providerDescription,
} from "@/i18n/integration-text";
import { localizeTemplate, templateName, templateNodeLabel } from "@/i18n/template-text";
import { ar as arMessages } from "@/i18n/messages/ar";
import { en as enMessages } from "@/i18n/messages/en";
import { createTranslator } from "@/i18n/translate";

/**
 * CX4Q-01: product-supplied content (built-in template step labels, the integration catalog) is Arabic in Arabic.
 * These completeness checks walk the real templates and providers, so a new template node, provider, action,
 * category or connect field can't silently stay English — and English output stays exactly the source text.
 */

const en = createTranslator("en");
const ar = createTranslator("ar");
const ARABIC = /[؀-ۿ]/;
const TEMPLATES = [
  ...LOCAL_TEMPLATES.map((tpl) => ({ group: "localTemplates", tpl })),
  ...DESIGN_TEMPLATES.map((tpl) => ({ group: "designTemplates", tpl })),
];

/* Raw catalogue node maps, to catch labels left behind for removed template nodes. */
type NodeMaps = Record<string, Record<string, { nodes?: Record<string, string> }>>;
function enNodes(group: string, id: string) {
  return (enMessages as unknown as NodeMaps)[group]?.[id]?.nodes ?? {};
}
function arNodes(group: string, id: string) {
  return (arMessages as unknown as NodeMaps)[group]?.[id]?.nodes ?? {};
}

describe("template step labels and names", () => {
  for (const { group, tpl } of TEMPLATES) {
    it(`${tpl.id}: every step has an Arabic label; English is the template's own text`, () => {
      expect(templateName(en, tpl)).toBe(tpl.name);
      expect(templateName(ar, tpl)).toMatch(ARABIC);
      for (const node of tpl.graph.nodes) {
        const key = `${group}.${tpl.id}.nodes.${node.id}`;
        expect(ar.has(key), `missing Arabic ${key}`).toBe(true);
        expect(templateNodeLabel(ar, tpl.id, node), key).toMatch(ARABIC);
        expect(templateNodeLabel(en, tpl.id, node), key).toBe(node.data.label);
      }
    });
  }

  it("has no catalogue labels for nodes a template doesn't have", () => {
    for (const { group, tpl } of TEMPLATES) {
      const ids = new Set(tpl.graph.nodes.map((n) => n.id));
      for (const t of [en, ar]) {
        const nodes = Object.keys((t.locale === "en" ? enNodes : arNodes)(group, tpl.id));
        expect(nodes.filter((id) => !ids.has(id)), `${t.locale} ${tpl.id}`).toEqual([]);
      }
    }
  });

  it("English creation is exactly today's template (name and graph)", () => {
    for (const { tpl } of TEMPLATES) {
      const made = localizeTemplate(en, tpl);
      expect(made.name).toBe(tpl.name);
      expect(made.graph).toEqual(tpl.graph);
    }
    expect(localizeTemplate(en, LOCAL_TEMPLATES[0]!).name).toBe("Lead Qualifier");
  });

  it("Arabic creation translates only the name and step labels, never ids, config or edges", () => {
    for (const { tpl } of TEMPLATES) {
      const made = localizeTemplate(ar, tpl);
      expect(made.name).toMatch(ARABIC);
      expect(made.graph.edges).toEqual(tpl.graph.edges);
      expect(made.graph.nodes.map((n) => ({ ...n, data: { ...n.data, label: "" } }))).toEqual(tpl.graph.nodes.map((n) => ({ ...n, data: { ...n.data, label: "" } })));
      for (const n of made.graph.nodes) {
        expect(n.data.label).toMatch(ARABIC);
        expect(n.data.label.length).toBeLessThanOrEqual(80); // node label limit in graphSchema
      }
      expect(made.name.length).toBeLessThanOrEqual(80);
    }
    // The source template is not mutated.
    expect(LOCAL_TEMPLATES[0]!.graph.nodes[1]!.data.label).toBe("Normalise lead");
    expect(localizeTemplate(ar, LOCAL_TEMPLATES[0]!).graph.nodes.find((n) => n.id === "normalise")!.data.label).toBe("توحيد بيانات العميل");
  });

  it("an unknown template or node keeps its own label", () => {
    const node = { id: "new-node", data: { label: "Custom step" } };
    expect(templateNodeLabel(ar, "lead-qualifier", node)).toBe("Custom step");
    expect(templateNodeLabel(ar, "no-such-template", node)).toBe("Custom step");
    expect(templateName(ar, { id: "no-such-template", name: "Mine" })).toBe("Mine");
  });
});

describe("integration catalog text", () => {
  for (const p of listProviders()) {
    it(`${p.id}: category, description, actions and connect fields are Arabic; English is the source`, () => {
      expect(ar.has(`integrationCategory.${p.category}`), `category "${p.category}"`).toBe(true);
      expect(providerCategory(ar, p.category)).toMatch(ARABIC);
      expect(providerCategory(en, p.category)).toBe(p.category);

      expect(ar.has(`integrationCatalog.${p.id}.description`)).toBe(true);
      expect(providerDescription(ar, p)).toMatch(ARABIC);
      expect(providerDescription(en, p)).toBe(p.description);

      for (const a of p.actions) {
        const key = `integrationCatalog.${a.id.replace(".", ".actions.")}`;
        // Both catalogues must carry the key by id: the actionText()/providerDescription() fallback returns the
        // provider's English literal, so `actionTitle(en, a)` alone would hide a missing English entry.
        expect(ar.has(`${key}.title`), `${a.id} ar title`).toBe(true);
        expect(ar.has(`${key}.description`), `${a.id} ar description`).toBe(true);
        expect(en.has(`${key}.title`), `${a.id} en title`).toBe(true);
        expect(en.has(`${key}.description`), `${a.id} en description`).toBe(true);
        expect(actionTitle(ar, a), a.id).toMatch(ARABIC);
        expect(actionDescription(ar, a), a.id).toMatch(ARABIC);
        expect(actionTitleById(ar, a.id)).toBe(actionTitle(ar, a));
        expect(actionTitle(en, a)).toBe(a.title);
        expect(actionDescription(en, a)).toBe(a.description);
      }

      for (const f of p.connectFields ?? []) {
        const where = `${p.id}.${f.key}`;
        expect(ar.has(`integrationCatalog.${p.id}.fields.${f.key}.label`), where).toBe(true);
        expect(connectFieldLabel(ar, p.id, f), where).toMatch(ARABIC);
        expect(connectFieldLabel(en, p.id, f)).toBe(f.label);
        if (f.help) {
          expect(connectFieldHelp(ar, p.id, f), where).toMatch(ARABIC);
          expect(connectFieldHelp(en, p.id, f)).toBe(f.help);
        } else {
          expect(connectFieldHelp(ar, p.id, f)).toBeUndefined();
        }
      }
    });
  }

  it("the GitHub dialog's token field and description are Arabic (CX4Q-01 evidence)", () => {
    const github = listProviders().find((p) => p.id === "github")!;
    expect(connectFieldLabel(ar, "github", github.connectFields![0]!)).toBe("رمز الوصول الشخصي");
    expect(providerDescription(ar, github)).toBe("قراءة طلبات الدمج والتعليق على المشكلات في مستودعات GitHub");
    expect(providerCategory(ar, "Developer tools")).toBe("أدوات المطوّرين");
  });

  it("the Mizano provider description, actions and connect fields are localized in Arabic and English (issue #302)", () => {
    const mizano = listProviders().find((p) => p.id === "mizano")!;
    expect(providerDescription(en, mizano)).toBe("Mizano accounting connector.");
    expect(providerDescription(ar, mizano)).toBe("موصل المحاسبة Mizano");
    expect(providerCategory(en, mizano.category)).toBe("Finance");
    expect(providerCategory(ar, mizano.category)).toBe("المالية");

    const listOverdue = mizano.actions.find((a) => a.id === "mizano.list_overdue_invoices")!;
    expect(actionTitle(en, listOverdue)).toBe("List overdue invoices");
    expect(actionTitle(ar, listOverdue)).toBe("عرض الفواتير المتأخرة");
    expect(actionDescription(en, listOverdue)).toBe(
      "List unpaid invoices past their due date on the date you choose, in the workspace currency.",
    );
    expect(actionDescription(ar, listOverdue)).toBe(
      "يعرض الفواتير غير المسددة التي تجاوزت تاريخ استحقاقها في التاريخ الذي تختاره، بعملة مساحة العمل",
    );

    const createCustomer = mizano.actions.find((a) => a.id === "mizano.create_customer")!;
    expect(actionTitle(en, createCustomer)).toBe("Create customer");
    expect(actionTitle(ar, createCustomer)).toBe("إنشاء عميل");
    expect(actionDescription(en, createCustomer)).toBe(
      "Create a new customer in Mizano with name, company, email, phone, and optional taxId.",
    );
    // Arabic description must explicitly include customer name, company, email, phone and optional tax ID
    const arDesc = actionDescription(ar, createCustomer);
    expect(arDesc).toBe(
      "ينشئ عميلاً جديدًا في Mizano بالاسم والشركة والبريد الإلكتروني ورقم الهاتف ومعرف الضريبة الاختياري.",
    );
    expect(arDesc).toContain("الاسم");
    expect(arDesc).toContain("الشركة");
    expect(arDesc).toContain("البريد الإلكتروني");
    expect(arDesc).toContain("رقم الهاتف");
    expect(arDesc).toContain("الضريبة");

    const createDraftQuote = mizano.actions.find((a) => a.id === "mizano.create_draft_quote")!;
    expect(actionTitle(en, createDraftQuote)).toBe("Create draft quote");
    expect(actionTitle(ar, createDraftQuote)).toBe("إنشاء عرض أسعار مسودّة");
    expect(actionDescription(en, createDraftQuote)).toBe(
      "Create a draft quote in Mizano with a customer and line items (currency, lines with item, qty, unitPrice, taxRate).",
    );
    expect(actionDescription(ar, createDraftQuote)).toBe(
      "ينشئ عرض أسعار مسودّة في Mizano مع عميل وبنود (العملة، العناصر مع الكمية وسعر الوحدة ونسبة الضريبة).",
    );

    const tokenField = mizano.connectFields!.find((f) => f.key === "token")!;
    expect(connectFieldLabel(en, "mizano", tokenField)).toBe("Scoped API key");
    expect(connectFieldLabel(ar, "mizano", tokenField)).toBe("مفتاح API محدود النطاق");

    const baseUrlField = mizano.connectFields!.find((f) => f.key === "baseUrl")!;
    expect(connectFieldLabel(en, "mizano", baseUrlField)).toBe("Mizano URL");
    expect(connectFieldLabel(ar, "mizano", baseUrlField)).toBe("رابط Mizano");
  });


  it("unknown providers, actions and categories fall back to the catalog's own text", () => {
    expect(providerCategory(ar, "Robotics")).toBe("Robotics");
    expect(providerDescription(ar, { id: "acme", description: "Acme things" })).toBe("Acme things");
    expect(actionTitle(ar, { id: "acme.do_it", title: "Do it" })).toBe("Do it");
    expect(actionTitle(ar, { id: "no-dot", title: "Plain" })).toBe("Plain");
    expect(actionTitleById(ar, "acme.do_it")).toBeNull();
    expect(connectFieldLabel(ar, "github", { key: "other", label: "Other" })).toBe("Other");
  });
});

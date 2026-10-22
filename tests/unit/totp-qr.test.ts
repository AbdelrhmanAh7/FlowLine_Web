import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TotpQr } from "@/components/totp-qr";

describe("TotpQr", () => {
  it("renders a white padded container with data-testid='totp-qr' and SVG", () => {
    const html = renderToString(createElement(TotpQr, { uri: "otpauth://totp/Flowline:test?secret=JBSWY3DPEHPK3PXP&issuer=Flowline" }));
    expect(html).toContain('data-testid="totp-qr"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("bg-[white]");
    expect(html).toContain("p-3");
    expect(html).toContain("<svg");
    expect(html).toContain("</svg>");
    expect(html).not.toContain("http://");
    expect(html).not.toContain("https://");
  });
});

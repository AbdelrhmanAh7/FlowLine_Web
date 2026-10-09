import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DemoVideo } from "@/components/landing/demo-video";
import { DemoWalkthrough } from "@/components/landing/demo-walkthrough";
import { I18nProvider } from "@/i18n/client";
import { clipView, parseManifest, walkthroughView } from "@/lib/demo-media";
import fixture from "../../e2e/fixtures/demo/manifest.json";

// Server markup of the landing demo (issue 100): correct without JS. The browser behaviour is in e2e/landing-demo.spec.ts.
const m = parseManifest(fixture)!;
const wrap = (locale: "ar" | "en", child: ReturnType<typeof createElement>) => renderToStaticMarkup(createElement(I18nProvider, { locale, children: child }));

describe("DemoVideo server markup", () => {
  const html = wrap("en", createElement(DemoVideo, { view: clipView(m, "hero", "en", "light")!, label: "Hero loop" }));
  it("is a muted, looping, non-autoplaying video that fetches nothing", () => {
    expect(html).toMatch(/<video[^>]*\bmuted=""/);
    expect(html).toMatch(/<video[^>]*\bloop=""/);
    expect(html).toMatch(/<video[^>]*\bplaysinline=""/i);
    expect(html).toMatch(/<video[^>]*preload="none"/);
    expect(html).not.toMatch(/autoplay/i);
    expect(html).toContain('poster="/media/demo/hero.en.light.poster.fx000001.jpg"');
    expect(html).toContain('width="1920"');
    expect(html).toContain('height="1080"');
    expect(html).toContain('aria-label="Hero loop"');
  });
  it("reserves its box (CLS 0) and has an H.264 source as the no-JS default", () => {
    expect(html).toContain("aspect-ratio:16/9");
    expect(html).toContain('<source src="/media/demo/hero.en.light.h264.fx000001.mp4" type="video/mp4; codecs=&quot;avc1.64002A&quot;"');
    expect(html).not.toContain("av1.fx");
  });
  it("shows no button without JS (it would do nothing)", () => {
    expect(html).not.toContain("<button");
  });
});

describe("DemoWalkthrough server markup", () => {
  const view = walkthroughView(m, "ar", "light")!;
  const html = wrap("ar", createElement(DemoWalkthrough, { view }));
  it("has the opener, a dialog with controls, Arabic captions as the default track and four chapters", () => {
    expect(html).toContain('data-testid="demo-watch"');
    expect(html).toContain("شاهد العرض الكامل (أقل من دقيقة)");
    expect(html).toMatch(/<dialog[^>]*data-testid="demo-walkthrough"/);
    expect(html).not.toMatch(/<dialog[^>]*\bopen/);
    expect(html).toMatch(/<video[^>]*\bcontrols=""/);
    expect(html).not.toMatch(/<video[^>]*\b(loop|autoplay)/);
    expect(html.match(/<track /g)).toHaveLength(2);
    expect(html).toMatch(/<track[^>]*kind="captions"[^>]*srcLang="ar"[^>]*default=""/);
    expect(html.match(/data-chapter=/g)).toHaveLength(4);
    expect(html).toContain('aria-current="step"');
    expect(html.match(/aria-current="step"/g)).toHaveLength(1);
  });
});

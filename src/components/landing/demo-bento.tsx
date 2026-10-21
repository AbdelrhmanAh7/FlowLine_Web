import { getT } from "@/i18n/server";
import type { MessageKey } from "@/i18n/types";
import type { ClipView } from "@/lib/demo-media";
import { DemoVideo } from "./demo-video";

/** Reading order and spans of the "See it in action" bento (wide, square, square, wide on lg; one column on phones). */
export const BENTO_TILES = ["templates", "build", "history", "run"] as const;
export type BentoTile = (typeof BENTO_TILES)[number];

/**
 * "See it in action" (issue 100): four short loops recorded in the app on sample data, each with a heading and one honest line, plus the
 * note saying so. Server-rendered; each loop lazy-starts on its own when visible (DemoVideo). A tile whose files are missing is left out.
 */
export async function DemoBento({ tiles }: { tiles: { id: BentoTile; view: ClipView }[] }) {
  const t = await getT();
  if (!tiles.length) return null;
  return (
    <section id="demo" aria-labelledby="demo-title" className="mx-auto max-w-6xl px-4 pb-16 sm:px-8">
      <h2 id="demo-title" className="text-xl font-semibold">{t("landing.demo.title")}</h2>
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {tiles.map(({ id, view }) => {
          const title = t(`landing.demo.tile.${id}.title` as MessageKey);
          return (
            <article key={id} data-demo-tile={id} className={`overflow-hidden rounded-xl border border-line bg-card ${view.aspect === "1/1" ? "" : "lg:col-span-2"}`}>
              <DemoVideo view={view} label={title} />
              <div className="p-4">
                <h3 className="text-lg font-semibold">{title}</h3>
                <p className="mt-1 text-base text-med">{t(`landing.demo.tile.${id}.body` as MessageKey)}</p>
              </div>
            </article>
          );
        })}
      </div>
      <p className="mt-4 text-sm text-muted">{t("landing.demo.recorded")}</p>
    </section>
  );
}

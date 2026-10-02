"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useT } from "@/i18n/client";
import { LandingDocsLink } from "@/app/landing-docs";
import { cn } from "@/components/ui";

const SECTIONS = ["product", "templates", "pricing"] as const;

/** Query links preserve keyboard activation and browser history. */
export function LandingNav() {
  const t = useT();
  const [active, setActive] = useState<string>("product");
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const current = [...SECTIONS].reverse().find((id) => {
        const section = document.getElementById(id);
        return section && section.getBoundingClientRect().top <= window.innerHeight * 0.35;
      });
      setActive(current ?? "product");
    };
    const scroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    window.addEventListener("scroll", scroll, { passive: true });
    scroll();
    return () => { window.removeEventListener("scroll", scroll); cancelAnimationFrame(frame); };
  }, []);
  return (
    <nav aria-label={t("landing.navAria")} className="hidden items-center gap-6 text-base whitespace-nowrap text-med md:flex">
      {SECTIONS.map((id) => <Link key={id} href={`/?section=${id}`} scroll={false} aria-current={active === id ? "location" : undefined}
        onClick={() => setActive(id)} className={cn("border-b py-1 transition-colors duration-[var(--dur-base)] motion-reduce:transition-none", active === id ? "border-accent text-accent-text" : "border-transparent hover:text-hi")}>
        {t(`landing.nav.${id}`)}
      </Link>)}
      <LandingDocsLink />
    </nav>
  );
}

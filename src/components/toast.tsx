"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { cx } from "./ui";

type ToastTone = "info" | "success" | "danger" | "warning";
interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
}

const Ctx = createContext<(message: string, tone?: ToastTone) => void>(() => {});

export function useToast() {
  return useContext(Ctx);
}

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((message: string, tone: ToastTone = "info") => {
    const id = nextId++;
    setToasts((t) => [...t.slice(-3), { id, tone, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed bottom-4 left-1/2 z-[100] flex -translate-x-1/2 flex-col items-center gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tone === "danger" ? "alert" : "status"}
            className={cx(
              "pointer-events-auto animate-fade-in rounded-lg border bg-elevated px-3.5 py-2 text-base shadow-[var(--shadow-popover)]",
              t.tone === "danger" ? "border-danger/50 text-danger" : t.tone === "success" ? "border-success/40 text-hi" : t.tone === "warning" ? "border-warning/40 text-warning" : "border-line-strong text-hi",
            )}
          >
            {t.message}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

"use client";

import { AnimatePresence, motion } from "motion/react";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { cn } from "./ui";

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

const TONE_CLASS: Record<ToastTone, string> = {
  danger: "border-danger-border text-danger",
  success: "border-success-border text-hi",
  warning: "border-warning-border text-warning",
  info: "border-line-strong text-hi",
};

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
      {/*
        Keep `aria-live` on this always-mounted wrapper: Radix modals (Dialog) call aria-hidden's hideOthers(), which exempts
        every `[aria-live]` element that exists when the modal opens. Without it, toasts fired while a dialog is open would be
        hidden from screen readers. (Errors that belong to a dialog are still shown inline in it, with role="alert".)
      */}
      <div aria-live="polite" className="pointer-events-none fixed bottom-4 left-1/2 z-[100] flex -translate-x-1/2 flex-col items-center gap-2">
        {/* Toasts slide in and out; MotionConfig reducedMotion="user" turns this into a plain swap. */}
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              role={t.tone === "danger" ? "alert" : "status"}
              initial={{ opacity: 0, y: 10, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.98 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className={cn("pointer-events-auto rounded-lg border bg-elevated px-3.5 py-2 text-base shadow-[var(--shadow-popover)]", TONE_CLASS[t.tone])}
            >
              {t.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}

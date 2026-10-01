"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Button, Card, Textarea } from "@/components/ui";
import { useT } from "@/i18n/client";
import { api } from "@/lib/api";
import { cbt } from "./text";
import type { CliJobDto, Overview } from "./types";

const key = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9_-]/g, "");
const ACTIVE = new Set(["waiting_operator", "generating", "validating"]);

/** Owner-only CLI prototype panel. Rendered only when the server says the prototype is allowed for this request. */
export function PrototypePanel({ base, data }: { base: string; data: Overview }) {
  const t = useT();
  const qc = useQueryClient();
  const sid = data.session.id;
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const importTarget = useRef<CliJobDto | null>(null);
  const jobs = useQuery({
    queryKey: ["cb-jobs", sid],
    queryFn: () => api<{ jobs: CliJobDto[] }>(`${base}/sessions/${sid}/cli-jobs`),
    refetchInterval: (q) => (q.state.data?.jobs.some((j) => ACTIVE.has(j.status)) ? 2000 : false),
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["cb-jobs", sid] });
    void qc.invalidateQueries({ queryKey: ["cb-session", sid] });
  };
  // One request key per intended job: a double click or a retry after a network error re-sends the SAME key (the
  // server returns the same job); a new key is minted only after a job was created.
  const pendingKeys = useRef(new Map<string, string>());
  const keyFor = (k: string) => {
    if (!pendingKeys.current.has(k)) pendingKeys.current.set(k, key());
    return pendingKeys.current.get(k)!;
  };
  const enqueue = useMutation({
    mutationFn: (b: { cli: "claude" | "codex"; kind: "blueprint" | "text_trial" }) => api(`${base}/sessions/${sid}/cli-jobs`, { method: "POST", json: { ...b, requestKey: keyFor(`${b.cli}:${b.kind}:${b.kind === "text_trial" ? text : ""}`), text: b.kind === "text_trial" ? text : undefined } }),
    onSuccess: (_d, b) => {
      pendingKeys.current.delete(`${b.cli}:${b.kind}:${b.kind === "text_trial" ? text : ""}`);
      refresh();
    },
    onError: () => setError(t("companyBuilder.errors.generic")),
  });
  const act = useMutation({
    mutationFn: async (a: { job: CliJobDto; op: "cancel" | "export" | "trial" }) => {
      if (a.op === "cancel") return api(`${base}/cli-jobs/${a.job.id}/cancel`, { method: "POST", json: {} });
      if (a.op === "trial") return api(`${base}/cli-jobs/${a.job.id}/trial`, { method: "POST", json: { installationId: data.installation?.id, trialKey: key() } });
      const env = await api<unknown>(`${base}/cli-jobs/${a.job.id}/export`);
      const url = URL.createObjectURL(new Blob([JSON.stringify(env, null, 2)], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `flowline-cb-envelope-${a.job.id.slice(0, 8)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      return null;
    },
    onSuccess: refresh,
    onError: () => setError(t("companyBuilder.errors.generic")),
  });
  const importFile = async (job: CliJobDto, file: File) => {
    setError(null);
    try {
      await api(`${base}/cli-jobs/${job.id}/import`, { method: "POST", json: JSON.parse(await file.text()) });
      refresh();
    } catch {
      setError(cbt(t, "prototype.error.OUTPUT_INVALID"));
    }
  };

  return (
    <Card className="flex flex-col gap-3 border-dashed p-5" data-testid="cb-prototype">
      <h2 className="text-base font-semibold text-hi">{t("companyBuilder.prototype.heading")}</h2>
      <p className="text-sm text-warning">{t("companyBuilder.prototype.labels")}</p>
      <div className="flex flex-wrap gap-2">
        {(["claude", "codex"] as const).map((cli) => (
          <Button key={cli} size="sm" loading={enqueue.isPending && enqueue.variables?.cli === cli && enqueue.variables.kind === "blueprint"} disabled={enqueue.isPending} onClick={() => enqueue.mutate({ cli, kind: "blueprint" })} disabledReason={data.blueprint ? null : t("companyBuilder.prototype.refineNeedsPlan")} data-testid={`cb-cli-refine-${cli}`}>
            {t("companyBuilder.prototype.refine", { cli: cli === "claude" ? "Claude" : "Codex" })}
          </Button>
        ))}
      </div>
      <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={2000} placeholder={t("companyBuilder.prototype.textPlaceholder")} aria-label={t("companyBuilder.prototype.textPlaceholder")} dir="auto" />
      <div className="flex flex-wrap gap-2">
        {(["claude", "codex"] as const).map((cli) => (
          <Button key={cli} size="sm" variant="ghost" disabled={!text.trim() || enqueue.isPending} onClick={() => enqueue.mutate({ cli, kind: "text_trial" })}>
            {t("companyBuilder.prototype.textTrial", { cli: cli === "claude" ? "Claude" : "Codex" })}
          </Button>
        ))}
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="application/json"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f && importTarget.current) void importFile(importTarget.current, f);
          e.target.value = "";
        }}
      />
      <h3 className="text-sm font-semibold text-hi">{t("companyBuilder.prototype.jobs")}</h3>
      <ul className="flex flex-col gap-2 text-sm" data-testid="cb-cli-jobs">
        {(jobs.data?.jobs ?? []).map((j) => (
          <li key={j.id} className="flex flex-col gap-1 rounded-md border border-line p-2" data-status={j.status}>
            <span>
              <span dir="ltr">{j.cli}</span> · {j.kind} · {cbt(t, `prototype.status.${j.status}`)}
              {j.error && ` — ${cbt(t, `prototype.error.${j.error.code}`)}`}
            </span>
            {j.status === "waiting_operator" && <span className="text-xs text-muted">{t("companyBuilder.prototype.waiting")}</span>}
            <span className="text-xs text-muted" dir="auto">
              {j.reported && Object.keys(j.reported).length > 0 ? t("companyBuilder.prototype.reported", { detail: JSON.stringify(j.reported) }) : t("companyBuilder.prototype.notReported")}
            </span>
            <div className="flex flex-wrap gap-2">
              {ACTIVE.has(j.status) && (
                <Button size="sm" variant="ghost" onClick={() => act.mutate({ job: j, op: "cancel" })}>
                  {t("companyBuilder.prototype.cancel")}
                </Button>
              )}
              {j.status === "waiting_operator" && (
                <>
                  <Button size="sm" variant="ghost" onClick={() => act.mutate({ job: j, op: "export" })}>
                    {t("companyBuilder.prototype.export")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      importTarget.current = j;
                      fileRef.current?.click();
                    }}
                    title={t("companyBuilder.prototype.importHelp")}
                  >
                    {t("companyBuilder.prototype.import")}
                  </Button>
                </>
              )}
              {j.kind === "text_trial" && j.status === "completed" && data.installation?.status === "installed" && (
                <Button size="sm" variant="secondary" onClick={() => act.mutate({ job: j, op: "trial" })}>
                  {t("companyBuilder.prototype.useInTrial")}
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

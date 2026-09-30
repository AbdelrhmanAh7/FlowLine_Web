"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { useWorkspace } from "@/components/shell/workspace-context";
import { useToast } from "@/components/toast";
import { Button, Card, EmptyState, ErrorState, Field, Input, SectionLabel, Skeleton, StatusBadge, Textarea, cx, type Tone } from "@/components/ui";
import { useT } from "@/i18n/client";
import { denyReasonText } from "@/i18n/engine-text";
import { apiErrorMessage } from "@/i18n/errors";
import { dataText } from "@/i18n/workspace-text";
import { api } from "@/lib/api";
import { useOnline } from "@/lib/hooks";
import { can, type Role } from "@/lib/permissions";

export interface KnowledgeSourceDto {
  id: string;
  name: string;
  kind: "file" | "text" | "table";
  mime: string | null;
  size: number;
  status: "pending" | "indexing" | "ready" | "failed";
  error: string | null;
  chunkCount: number;
  enabled: boolean;
  createdAt: string;
  indexedAt: string | null;
}
interface Hit {
  sourceId: string;
  sourceName: string;
  label: string;
  text: string;
  score: number;
}

const STATUS_TONE: Record<KnowledgeSourceDto["status"], Tone> = { pending: "muted", indexing: "info", ready: "success", failed: "danger" };

export default function KnowledgePage() {
  const t = useT();
  const { workspace, role } = useWorkspace();
  const qc = useQueryClient();
  const toast = useToast();
  const online = useOnline();
  const manage = can(role as Role, "knowledge.manage");
  const editReason = !manage ? denyReasonText(t, role as Role, "knowledge.manage") : !online ? t("knowledge.offline") : null;
  const sources = useQuery({
    queryKey: ["knowledge", workspace.id],
    queryFn: () => api<{ sources: KnowledgeSourceDto[] }>(`/api/workspaces/${workspace.id}/knowledge`),
    select: (d) => d.sources,
    // Poll while anything is being indexed.
    refetchInterval: (q) => (q.state.data?.sources.some((s) => s.status === "pending" || s.status === "indexing") ? 1500 : false),
  });
  const refresh = () => void qc.invalidateQueries({ queryKey: ["knowledge", workspace.id] });
  const fileRef = useRef<HTMLInputElement>(null);
  const upload = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.set("file", file);
      return api(`/api/workspaces/${workspace.id}/knowledge`, { method: "POST", body: fd });
    },
    onSuccess: () => {
      toast(t("knowledge.uploaded"), "success");
      refresh();
    },
    onError: (e) => toast(apiErrorMessage(t, e, t("knowledge.uploadError")), "danger"),
  });
  const [textName, setTextName] = useState("");
  const [text, setText] = useState("");
  const addText = useMutation({
    mutationFn: () => api(`/api/workspaces/${workspace.id}/knowledge`, { method: "POST", json: { name: textName, text } }),
    onSuccess: () => {
      toast(t("knowledge.added"), "success");
      setText("");
      setTextName("");
      refresh();
    },
    onError: (e) => toast(apiErrorMessage(t, e, t("knowledge.addError")), "danger"),
  });
  const patch = useMutation({
    mutationFn: (v: { id: string; body: { enabled?: boolean; reindex?: true } }) => api(`/api/workspaces/${workspace.id}/knowledge/${v.id}`, { method: "PATCH", json: v.body }),
    onSuccess: refresh,
    onError: (e) => toast(apiErrorMessage(t, e, t("knowledge.updateError")), "danger"),
  });
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const del = useMutation({
    mutationFn: (id: string) => api(`/api/workspaces/${workspace.id}/knowledge/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast(t("knowledge.deleted"), "success");
      setConfirmDelete(null);
      refresh();
    },
    onError: (e) => toast(apiErrorMessage(t, e, t("knowledge.deleteError")), "danger"),
  });
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const search = useQuery({
    queryKey: ["knowledge-search", workspace.id, query],
    queryFn: () => api<{ hits: Hit[] }>(`/api/workspaces/${workspace.id}/knowledge/search?q=${encodeURIComponent(query)}`),
    enabled: query.trim().length > 0,
    select: (d) => d.hits,
  });

  return (
    <div className="flex flex-col">
      <PageHeader title={t("knowledge.title")} sub={t("knowledge.sub")} />
      <div className="flex flex-col gap-6 p-4 sm:p-6">
        <section>
          <SectionLabel className="mb-3">{t("knowledge.sourcesLabel", { count: sources.data?.length ?? "…" })}</SectionLabel>
          {sources.isPending ? (
            <div className="flex flex-col gap-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-14 rounded-xl" />
              ))}
            </div>
          ) : sources.isError ? (
            <ErrorState title={t("knowledge.loadError")} body={(sources.error as Error).message} onRetry={() => sources.refetch()} />
          ) : sources.data.length === 0 ? (
            <EmptyState icon="❏" title={t("knowledge.emptyTitle")} body={t("knowledge.emptyBody")} />
          ) : (
            <ul className="flex flex-col gap-2" aria-label={t("knowledge.listAria")}>
              {sources.data.map((s) => (
                <li key={s.id} className="motion-list-in">
                  <Card className={cx("flex flex-wrap items-center gap-x-3 gap-y-2 p-3", !s.enabled && "opacity-70")} data-testid={`source-${s.name}`}>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{s.name}</span>
                      <span className="data block text-sm text-muted">
                        {t("knowledge.meta", {
                          kind: dataText(t, "knowledge.kind", s.kind),
                          size: t.number(s.size / 1024, { minimumFractionDigits: 1, maximumFractionDigits: 1, useGrouping: false }),
                          chunks: t.plural("knowledge.chunks", s.chunkCount),
                          ago: t.relative(s.createdAt),
                        })}
                      </span>
                      {s.status === "failed" && s.error && (
                        <span role="alert" className="block text-sm text-danger">
                          {t("knowledge.indexingFailed", { error: s.error })}
                        </span>
                      )}
                    </span>
                    <StatusBadge tone={STATUS_TONE[s.status]}>{dataText(t, "knowledge.status", s.status)}</StatusBadge>
                    {!s.enabled && <StatusBadge tone="warning">{t("knowledge.disabled")}</StatusBadge>}
                    <span className="flex flex-wrap gap-1.5">
                      <Button size="sm" variant="ghost" disabledReason={editReason ?? (s.status === "indexing" || s.status === "pending" ? t("knowledge.indexingInProgress") : null)} onClick={() => patch.mutate({ id: s.id, body: { reindex: true } })}>
                        {t("knowledge.reindex")}
                      </Button>
                      <Button size="sm" variant="ghost" disabledReason={editReason} onClick={() => patch.mutate({ id: s.id, body: { enabled: !s.enabled } })}>
                        {s.enabled ? t("knowledge.disable") : t("knowledge.enable")}
                      </Button>
                      {confirmDelete === s.id ? (
                        <>
                          <Button size="sm" variant="danger" loading={del.isPending} onClick={() => del.mutate(s.id)}>
                            {t("knowledge.confirmDelete")}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(null)}>
                            {t("knowledge.keep")}
                          </Button>
                        </>
                      ) : (
                        <Button size="sm" variant="danger-ghost" disabledReason={editReason} onClick={() => setConfirmDelete(s.id)}>
                          {t("knowledge.delete")}
                        </Button>
                      )}
                    </span>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="flex flex-col gap-3 p-5">
            <h2 className="text-lg font-semibold">{t("knowledge.addTitle")}</h2>
            <p className="text-sm text-med">{t("knowledge.addBody")}</p>
            <input
              ref={fileRef}
              type="file"
              className="sr-only"
              aria-label={t("knowledge.fileAria")}
              accept=".pdf,.csv,.json,.md,.markdown,.txt,application/pdf,text/csv,application/json,text/plain,text/markdown"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) upload.mutate(f);
                e.target.value = "";
              }}
            />
            <Button className="self-start" variant="primary" loading={upload.isPending} disabledReason={editReason} onClick={() => fileRef.current?.click()}>
              {t("knowledge.upload")}
            </Button>
            <form
              className="flex flex-col gap-2 border-t border-line pt-3"
              onSubmit={(e) => {
                e.preventDefault();
                addText.mutate();
              }}
            >
              <Field label={t("knowledge.titleLabel")} htmlFor="kn-title">
                <Input id="kn-title" value={textName} maxLength={120} disabled={!manage} onChange={(e) => setTextName(e.target.value)} placeholder={t("knowledge.titlePlaceholder")} />
              </Field>
              <Field label={t("knowledge.text")} htmlFor="kn-text">
                <Textarea id="kn-text" rows={4} value={text} disabled={!manage} onChange={(e) => setText(e.target.value)} />
              </Field>
              <Button type="submit" className="self-start" loading={addText.isPending} disabledReason={editReason ?? (!textName.trim() || !text.trim() ? t("knowledge.addTextFirst") : null)}>
                {t("knowledge.addText")}
              </Button>
            </form>
          </Card>

          <Card className="flex flex-col gap-3 p-5">
            <h2 className="text-lg font-semibold">{t("knowledge.testTitle")}</h2>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                setQuery(q);
              }}
            >
              <label htmlFor="kn-q" className="sr-only">
                {t("knowledge.searchLabel")}
              </label>
              <Input id="kn-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("knowledge.searchPlaceholder")} className="h-8 flex-1" />
              <Button type="submit" size="sm" disabledReason={q.trim() ? null : t("knowledge.typeQuestion")}>
                {t("knowledge.search")}
              </Button>
            </form>
            <p className="text-sm text-muted">{t("knowledge.searchHint")}</p>
            {search.isFetching ? (
              <Skeleton className="h-16" />
            ) : search.isError ? (
              <ErrorState title={t("knowledge.searchFailed")} body={(search.error as Error).message} onRetry={() => search.refetch()} />
            ) : query && search.data?.length === 0 ? (
              <p className="text-base text-med">{t("knowledge.noMatches")}</p>
            ) : (
              <ol className="flex flex-col gap-2" aria-label={t("knowledge.resultsAria")}>
                {search.data?.map((h, i) => (
                  <li key={`${h.sourceId}-${i}`} className="motion-list-in rounded-md border border-line bg-app p-2.5">
                    <p className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="font-medium text-hi">
                        [{i + 1}] {h.label}
                      </span>
                      <span className="data text-muted">{t("knowledge.score", { score: h.score })}</span>
                    </p>
                    <p className="mt-1 line-clamp-4 text-sm text-med">{h.text}</p>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

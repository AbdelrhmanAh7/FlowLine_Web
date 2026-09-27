"use client";

import { createContext, useContext } from "react";
import type { Role } from "@/db/schema";

export interface WorkspaceInfo {
  id: string;
  name: string;
  slug: string;
  timezone: string;
}
export interface WorkspaceCtx {
  user: { id: string; name: string; email: string };
  workspace: WorkspaceInfo;
  role: Role;
  canEdit: boolean;
  workspaces: { id: string; name: string; slug: string }[];
}

export const WorkspaceContext = createContext<WorkspaceCtx | null>(null);

export function useWorkspace(): WorkspaceCtx {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used inside the workspace shell");
  return ctx;
}

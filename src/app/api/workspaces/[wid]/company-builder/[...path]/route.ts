import { dispatch } from "@/server/company-builder/api";
import { route } from "@/server/http";

type Ctx = { params: Promise<{ wid: string; path: string[] }> };

export const GET = route(async (req, { params }: Ctx) => {
  const p = await params;
  return dispatch("GET", req, p.wid, p.path);
});
export const POST = route(async (req, { params }: Ctx) => {
  const p = await params;
  return dispatch("POST", req, p.wid, p.path);
});
export const DELETE = route(async (req, { params }: Ctx) => {
  const p = await params;
  return dispatch("DELETE", req, p.wid, p.path);
});

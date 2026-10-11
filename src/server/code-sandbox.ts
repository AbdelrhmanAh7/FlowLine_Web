import { execFile, spawn } from "node:child_process";
import { NodeError } from "@/engine/execute";

/**
 * Code node sandbox: each execution runs in a throwaway Docker container with
 *   --network none, --read-only, --cap-drop ALL, no-new-privileges, non-root user,
 *   memory/CPU/pids limits, a tmpfs /tmp, and a hard wall-clock kill.
 * No host environment variables, files or secrets are mounted or passed — only the
 * code and the JSON input via stdin. If Docker isn't available the node reports
 * itself unavailable; user code is NEVER executed in the server/worker process.
 */
export const SANDBOX_IMAGE = process.env.FLOWLINE_CODE_IMAGE ?? "node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1";
export const CODE_MEMORY_MB = 128;
export const CODE_MAX_OUTPUT = 256 * 1024;

let availability: { ok: boolean; reason?: string; checkedAt: number } | null = null;

export async function codeSandboxAvailable(): Promise<{ ok: boolean; reason?: string }> {
  if (process.env.FLOWLINE_CODE_SANDBOX === "off") return { ok: false, reason: "Code sandbox disabled by configuration" };
  if (availability && Date.now() - availability.checkedAt < 60_000) return availability;
  availability = await new Promise((resolve) => {
    execFile("docker", ["image", "inspect", SANDBOX_IMAGE, "--format", "{{.Id}}"], { timeout: 8000, windowsHide: true }, (err) => {
      if (err) resolve({ ok: false, reason: `Docker or the sandbox image (${SANDBOX_IMAGE}) is not available`, checkedAt: Date.now() });
      else resolve({ ok: true, checkedAt: Date.now() });
    });
  });
  return availability!;
}

const RUNNER = `
const chunks=[];process.stdin.on('data',c=>chunks.push(c));process.stdin.on('end',async()=>{
  let msg;try{msg=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch(e){process.stdout.write(JSON.stringify({ok:false,error:'bad input'}));return;}
  try{
    const fn=new (Object.getPrototypeOf(async function(){}).constructor)('input',msg.code);
    const out=await fn(msg.input);
    const text=JSON.stringify(out===undefined?null:out);
    process.stdout.write(JSON.stringify({ok:true,json:text}));
  }catch(e){process.stdout.write(JSON.stringify({ok:false,error:String(e&&e.message||e).slice(0,500)}));}
});`;

export async function runCodeInSandbox(code: string, input: unknown, timeoutMs: number, signal: AbortSignal): Promise<unknown> {
  const avail = await codeSandboxAvailable();
  if (!avail.ok) throw new NodeError("SANDBOX_UNAVAILABLE", avail.reason ?? "Code sandbox unavailable");
  const name = `flowline-code-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const args = [
    "run", "--rm", "-i", "--name", name,
    "--network", "none",
    "--read-only",
    "--tmpfs", "/tmp:rw,size=16m,noexec",
    "--memory", `${CODE_MEMORY_MB}m`, "--memory-swap", `${CODE_MEMORY_MB}m`,
    "--cpus", "0.5",
    "--pids-limit", "64",
    "--cap-drop", "ALL",
    "--security-opt", "no-new-privileges",
    "--user", "65534:65534",
    "--env", "NODE_OPTIONS=--max-old-space-size=96",
    SANDBOX_IMAGE, "node", "-e", RUNNER,
  ];
  return new Promise((resolve, reject) => {
    // Clean environment: only PATH so the docker CLI resolves — no app secrets reach the child.
    const child = spawn("docker", args, { env: { PATH: process.env.PATH ?? "", SystemRoot: process.env.SystemRoot ?? "" } as unknown as NodeJS.ProcessEnv, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] as const });
    let out = "";
    let err = "";
    let done = false;
    const kill = (why: NodeError) => {
      if (done) return;
      done = true;
      execFile("docker", ["rm", "-f", name], { timeout: 10_000, windowsHide: true }, () => {});
      child.kill("SIGKILL");
      reject(why);
    };
    // Container start-up is included, so allow a fixed start margin on top of the user's budget.
    const timer = setTimeout(() => kill(new NodeError("CODE_TIMEOUT", `Code ran longer than ${timeoutMs}ms`)), timeoutMs + 4000);
    const onAbort = () => kill(new NodeError("CANCELLED", "Run was cancelled"));
    signal.addEventListener("abort", onAbort, { once: true });
    child.stdout.on("data", (c: Buffer) => {
      out += c.toString("utf8");
      if (out.length > CODE_MAX_OUTPUT + 1024) kill(new NodeError("VALUE_TOO_LARGE", "Code output is larger than 256KB"));
    });
    child.stderr.on("data", (c: Buffer) => (err = (err + c.toString("utf8")).slice(-2000)));
    child.on("close", (codeNum, sig) => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      if (done) return;
      done = true;
      if (codeNum === 137 || sig === "SIGKILL") return reject(new NodeError("CODE_MEMORY", `Code exceeded the ${CODE_MEMORY_MB}MB memory limit`));
      let msg: { ok: boolean; json?: string; error?: string };
      try {
        msg = JSON.parse(out);
      } catch {
        return reject(new NodeError("CODE_ERROR", `Code sandbox failed: ${err.trim().slice(0, 300) || `exit ${codeNum}`}`));
      }
      if (!msg.ok) return reject(new NodeError("CODE_ERROR", msg.error ?? "Code threw an error"));
      resolve(JSON.parse(msg.json ?? "null"));
    });
    child.stdin.end(JSON.stringify({ code, input }));
  });
}

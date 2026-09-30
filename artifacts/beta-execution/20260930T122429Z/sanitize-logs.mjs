import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { parseEnv } from "node:util";
const dir = "artifacts/beta-execution/helper-logs/20260930T122429Z";
const out = "artifacts/beta-execution/20260930T122429Z/sanitized-v2";
mkdirSync(out, { recursive: true });
const env = parseEnv(readFileSync(".env.test", "utf8"));
const secrets = Object.entries(env).filter(([key]) => /(KEY|SECRET|TOKEN|PASSWORD|PASS|CREDENTIAL)/.test(key)).flatMap(([,value]) => value.split(",").filter(v => v.length >= 8));
const selected = process.argv.slice(2);
for (const file of selected.length ? selected : readdirSync(dir)) {
  const bytes = readFileSync(`${dir}/${file}`);
  let text = bytes[0] === 0xff && bytes[1] === 0xfe ? bytes.subarray(2).toString("utf16le") : bytes.toString("utf8");
  for (const value of secrets) text = text.replaceAll(value, "[REDACTED]");
  text = text.replace(/(setup-code|bootstrap-code|password|otp|totp_seed|access_token|refresh_token|api_key)(["']?\s*[:=]\s*)[^\s,}]+/gi, "$1$2[REDACTED]");
  const target = `${out}/${file.replace(/\.log$/, ".txt")}`;
  if (existsSync(target)) throw new Error("Refusing to overwrite prior sanitized log");
  writeFileSync(target, text);
}
console.log("Sanitized logs persisted; raw logs remain ignored");

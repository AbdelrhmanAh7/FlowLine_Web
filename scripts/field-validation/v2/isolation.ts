const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);
function parse(value: string | undefined, label: string) {
  try {
    if (!value) throw new Error();
    return new URL(value);
  } catch {
    throw new Error(`Invalid ${label} configuration`); // Never expose a database URL in an exception.
  }
}
export function fieldTarget(value: string | undefined) {
  const target = parse(value, "field API");
  if (!LOOPBACK.has(target.hostname) || !["http:", "https:"].includes(target.protocol) || !target.port || target.port === "3100" || target.username || target.password || target.search || target.hash || target.pathname !== "/") {
    throw new Error("Field API suite requires a loopback URL with an isolated non-3100 port");
  }
  return target;
}
export function assertFieldDatabase(value: string | undefined, environment: string | undefined) {
  const target = parse(value, "field database");
  if (environment !== "test" || !LOOPBACK.has(target.hostname) || !["postgres:", "postgresql:"].includes(target.protocol) || !/^\/flowline_test_field(?:_[a-z0-9]+)*$/.test(target.pathname)) {
    throw new Error("Field suite requires a local isolated flowline_test_field database and FLOWLINE_ENV=test");
  }
}

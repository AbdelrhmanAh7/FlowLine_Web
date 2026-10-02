// Address check for scripts/company-builder/start-private.mjs (--private-host): pure, so it can be unit-tested.
import { isIPv4 } from "node:net";

/**
 * True only for a canonical dotted-quad RFC 1918 address (10/8, 172.16/12, 192.168/16). `net.isIPv4` rejects
 * zero-padded octets ("172.016.0.1"): a resolver may read "016" as octal (172.14.0.1), so such a literal could bind the
 * prototype to a different, possibly public, interface than the one this check approved.
 */
export const isPrivateIpv4 = (value) => {
  if (typeof value !== "string" || !isIPv4(value)) return false;
  const [first, second] = value.split(".").map(Number);
  return first === 10 || (first === 192 && second === 168) || (first === 172 && second >= 16 && second <= 31);
};

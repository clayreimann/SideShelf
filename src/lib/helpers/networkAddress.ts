/**
 * Classifies hostnames/IP addresses as private (LAN/local) vs public, and
 * flags login URLs that would send credentials over unencrypted HTTP to a
 * public host.
 *
 * Used by the login screen (src/app/login.tsx) to warn users before they
 * submit credentials to a plaintext, non-LAN server. See app.config.js for
 * the related ATS/cleartext-traffic decision this warning stands in for.
 */

const IPV4_OCTET = "(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d|0)";
const IPV4_RE = new RegExp(`^${IPV4_OCTET}\\.${IPV4_OCTET}\\.${IPV4_OCTET}\\.${IPV4_OCTET}$`);

/**
 * Returns true if `host` (already validated to match IPV4_RE) falls in a
 * private/LAN or loopback IPv4 range.
 */
function isPrivateIpv4(host: string): boolean {
  const [a, b] = host.split(".").map(Number);
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local
  return false;
}

/**
 * Returns true if `hostname` is a private/LAN or loopback address:
 * - RFC1918: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
 * - Loopback: 127.0.0.0/8, "localhost", IPv6 "::1"
 * - Link-local: 169.254.0.0/16
 * - mDNS: any ".local" hostname
 *
 * Anything else (public IPs, DDNS/public hostnames) returns false.
 */
export function isPrivateOrLocalHost(hostname: string): boolean {
  if (!hostname) return false;
  const host = hostname.trim().toLowerCase();
  if (!host) return false;

  if (host === "localhost" || host.endsWith(".local")) return true;

  // IPv6 loopback, with or without the brackets URL.hostname wraps it in.
  if (host === "::1" || host === "[::1]") return true;

  if (IPV4_RE.test(host)) return isPrivateIpv4(host);

  return false;
}

/**
 * Returns true when `url` would send its request in plaintext (http://) to
 * a host that is NOT private/LAN — i.e. the case where a login warning
 * should be shown. Malformed URLs and non-http schemes return false.
 */
export function isInsecureLoginUrl(url: string): boolean {
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol.toLowerCase() !== "http:") return false;
    return !isPrivateOrLocalHost(parsed.hostname);
  } catch {
    return false;
  }
}

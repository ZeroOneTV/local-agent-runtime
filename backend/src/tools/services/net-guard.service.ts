import { Injectable, Logger } from '@nestjs/common';
import { promises as dns } from 'dns';
import { isIP } from 'net';

export class SsrfBlockedError extends Error {
  constructor(
    message: string,
    readonly code = 'SSRF_BLOCKED',
  ) {
    super(message);
    this.name = 'SsrfBlockedError';
  }
}

export interface SafeFetchOptions {
  timeoutMs: number;
  maxBytes: number;
  maxRedirects?: number;
}

export interface SafeFetchResult {
  finalUrl: string;
  status: number;
  body: string;
  bytes: number;
  truncated: boolean;
}

/**
 * Network egress guard for tools that fetch attacker/model-controlled URLs.
 * Only fetch_url needs this: its target is derived from search results / model
 * output and is therefore untrusted. The web-search providers do NOT use this —
 * their endpoint is configured by the operator, not chosen from external data.
 *
 * Protection is IP-based (not a hostname allowlist): we resolve the host and
 * reject private/reserved ranges, re-checking on every redirect hop (a public
 * site can 3xx to an internal IP). Note: full DNS-rebinding immunity would
 * require pinning the resolved IP into the socket; we mitigate by re-resolving
 * and re-checking before each hop, which covers redirect-based attacks.
 */
@Injectable()
export class NetGuardService {
  private readonly logger = new Logger(NetGuardService.name);

  /** Validate scheme/credentials and ensure the host resolves to a public IP. */
  async assertUrlSafe(rawUrl: string): Promise<URL> {
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      throw new SsrfBlockedError('URL inválida', 'INVALID_URL');
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new SsrfBlockedError(
        'Apenas HTTP/HTTPS são permitidos',
        'PROTOCOL_FORBIDDEN',
      );
    }

    if (parsed.username || parsed.password) {
      throw new SsrfBlockedError(
        'URLs com credenciais embutidas não são permitidas',
        'CREDENTIALS_FORBIDDEN',
      );
    }

    await this.assertHostPublic(parsed.hostname);
    return parsed;
  }

  private async assertHostPublic(hostname: string): Promise<void> {
    const host = hostname.replace(/^\[|\]$/g, '');

    const literal = isIP(host);
    const addresses: string[] = literal
      ? [host]
      : (await this.resolve(host));

    if (!addresses.length) {
      throw new SsrfBlockedError(
        `Não foi possível resolver o host: ${hostname}`,
        'DNS_FAILED',
      );
    }

    for (const ip of addresses) {
      if (this.isPrivateAddress(ip)) {
        throw new SsrfBlockedError(
          `Host aponta para endereço interno/reservado (${ip})`,
        );
      }
    }
  }

  private async resolve(host: string): Promise<string[]> {
    try {
      const records = await dns.lookup(host, { all: true });
      return records.map((r) => r.address);
    } catch {
      throw new SsrfBlockedError(
        `Não foi possível resolver o host: ${host}`,
        'DNS_FAILED',
      );
    }
  }

  /** Fetch with per-hop SSRF checks, manual redirects, and a byte cap. */
  async safeFetch(
    rawUrl: string,
    options: SafeFetchOptions,
  ): Promise<SafeFetchResult> {
    const maxRedirects = options.maxRedirects ?? 5;
    let current = await this.assertUrlSafe(rawUrl);
    let redirects = 0;

    while (true) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), options.timeoutMs);
      let response: Response;
      try {
        response = await fetch(current.toString(), {
          signal: controller.signal,
          redirect: 'manual',
          headers: { 'User-Agent': 'local-ai-backend/fetch_url' },
        });
      } finally {
        clearTimeout(timer);
      }

      if (this.isRedirect(response.status)) {
        const location = response.headers.get('location');
        if (!location) {
          return this.readCapped(response, current.toString(), options.maxBytes);
        }
        if (redirects >= maxRedirects) {
          throw new SsrfBlockedError(
            'Muitos redirecionamentos',
            'TOO_MANY_REDIRECTS',
          );
        }
        redirects++;
        const next = new URL(location, current);
        // Re-check the redirect target before following it.
        current = await this.assertUrlSafe(next.toString());
        continue;
      }

      return this.readCapped(response, current.toString(), options.maxBytes);
    }
  }

  private isRedirect(status: number): boolean {
    return status >= 300 && status < 400;
  }

  private async readCapped(
    response: Response,
    finalUrl: string,
    maxBytes: number,
  ): Promise<SafeFetchResult> {
    const body = response.body;
    if (!body) {
      const text = await response.text();
      const bytes = Buffer.byteLength(text);
      const truncated = bytes > maxBytes;
      return {
        finalUrl,
        status: response.status,
        body: truncated ? text.slice(0, maxBytes) : text,
        bytes,
        truncated,
      };
    }

    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    let truncated = false;
    try {
      while (total < maxBytes) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          total += value.length;
          if (total > maxBytes) {
            chunks.push(value.slice(0, value.length - (total - maxBytes)));
            truncated = true;
            break;
          }
          chunks.push(value);
        }
      }
      // Stop early if there is still more data beyond the cap.
      if (total >= maxBytes) {
        truncated = truncated || !(await reader.read()).done;
      }
    } finally {
      await reader.cancel().catch(() => undefined);
    }

    const text = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf-8');
    return {
      finalUrl,
      status: response.status,
      body: text,
      bytes: total,
      truncated,
    };
  }

  private isPrivateAddress(ip: string): boolean {
    const kind = isIP(ip);
    if (kind === 4) return this.isPrivateIPv4(ip);
    if (kind === 6) return this.isPrivateIPv6(ip);
    return true; // unknown → treat as unsafe
  }

  private isPrivateIPv4(ip: string): boolean {
    const parts = ip.split('.').map((p) => parseInt(p, 10));
    if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) {
      return true;
    }
    const [a, b] = parts;
    if (a === 0) return true; // 0.0.0.0/8
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 127) return true; // loopback
    if (a === 169 && b === 254) return true; // link-local + cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
    if (a === 192 && b === 0) return true; // 192.0.0.0/24 + 192.0.2.0/24
    if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
    if (a >= 224) return true; // multicast + reserved (224.0.0.0/3)
    return false;
  }

  private isPrivateIPv6(ip: string): boolean {
    const addr = ip.toLowerCase();
    if (addr === '::1' || addr === '::') return true; // loopback / unspecified

    // IPv4-mapped (::ffff:a.b.c.d) → validate the embedded IPv4.
    const mapped = addr.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return this.isPrivateIPv4(mapped[1]);

    const firstHextet = parseInt(addr.split(':')[0] || '0', 16);
    if ((firstHextet & 0xfe00) === 0xfc00) return true; // fc00::/7 (ULA)
    if ((firstHextet & 0xffc0) === 0xfe80) return true; // fe80::/10 (link-local)
    return false;
  }
}

export const FIRST_PACKET_TIMEOUT_ERROR_PREFIX = "FIRST_PACKET_TIMEOUT:";

export function parseFirstPacketTimeoutSeconds(message: string): number | null {
  const match = message.trim().match(/^FIRST_PACKET_TIMEOUT:(\d+)(?::.*)?$/i);
  if (!match) {
    return null;
  }
  const seconds = Number(match[1]);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

export function stripBackendErrorPrefix(message: string): string {
  const trimmed = message.trim();
  if (!trimmed.toUpperCase().startsWith(FIRST_PACKET_TIMEOUT_ERROR_PREFIX)) {
    return trimmed;
  }
  const parts = trimmed.split(":");
  if (parts.length < 3) {
    return trimmed;
  }
  return parts.slice(2).join(":").trim();
}

export function classifyNetworkError(message: string): "dns" | "timeout" | "proxy" | "tls" | "connect" | null {
  const text = message.trim().toLowerCase();
  if (!text) {
    return null;
  }
  if (
    /(proxy authentication|proxy auth|407\b|authentication required.*proxy|proxyconnect tcp|connect to proxy|proxy error|tunnel connection failed)/.test(
      text,
    )
  ) {
    return "proxy";
  }
  if (/(enotfound|eai_again|name or service not known|temporary failure in name resolution|nodename nor servname|dns)/.test(text)) {
    return "dns";
  }
  if (/(request timed out|timed out|timeout|etimedout|deadline exceeded|operation timed out)/.test(text)) {
    return "timeout";
  }
  if (/(tls|ssl|certificate|x509|handshake|cert_)/.test(text)) {
    return "tls";
  }
  if (
    /(econnrefused|connection refused|connection reset|econnreset|network is unreachable|enetunreach|ehostunreach|no route to host|unable to connect|failed to connect)/.test(
      text,
    )
  ) {
    return "connect";
  }
  return null;
}

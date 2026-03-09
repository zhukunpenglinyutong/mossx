import { describe, expect, it } from "vitest";
import {
  classifyNetworkError,
  parseFirstPacketTimeoutSeconds,
  stripBackendErrorPrefix,
} from "./networkErrors";

describe("networkErrors", () => {
  it("parses first packet timeout prefix", () => {
    expect(parseFirstPacketTimeoutSeconds("FIRST_PACKET_TIMEOUT:35:Timed out")).toBe(35);
    expect(parseFirstPacketTimeoutSeconds("first_packet_timeout:20")).toBe(20);
    expect(parseFirstPacketTimeoutSeconds("request timed out")).toBeNull();
  });

  it("classifies common network failures", () => {
    expect(classifyNetworkError("getaddrinfo ENOTFOUND api.openai.com")).toBe("dns");
    expect(classifyNetworkError("connect ETIMEDOUT")).toBe("timeout");
    expect(classifyNetworkError("Proxy Authentication Required (407)")).toBe("proxy");
    expect(classifyNetworkError("x509: certificate signed by unknown authority")).toBe("tls");
    expect(classifyNetworkError("dial tcp: connect: connection refused")).toBe("connect");
    expect(classifyNetworkError("business logic failed")).toBeNull();
  });

  it("strips backend timeout prefix payload", () => {
    expect(
      stripBackendErrorPrefix(
        "FIRST_PACKET_TIMEOUT:35:Timed out waiting for initial response",
      ),
    ).toBe("Timed out waiting for initial response");
    expect(stripBackendErrorPrefix("plain message")).toBe("plain message");
  });
});

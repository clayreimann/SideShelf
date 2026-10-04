import { isInsecureLoginUrl, isPrivateOrLocalHost } from "@/lib/helpers/networkAddress";

describe("isPrivateOrLocalHost", () => {
  describe("RFC1918 — 10.0.0.0/8", () => {
    it("classifies 10.0.0.1 as private", () => {
      expect(isPrivateOrLocalHost("10.0.0.1")).toBe(true);
    });

    it("classifies 10.255.255.255 as private", () => {
      expect(isPrivateOrLocalHost("10.255.255.255")).toBe(true);
    });
  });

  describe("RFC1918 — 172.16.0.0/12", () => {
    it("classifies 172.16.0.1 as private (lower boundary)", () => {
      expect(isPrivateOrLocalHost("172.16.0.1")).toBe(true);
    });

    it("classifies 172.31.255.255 as private (upper boundary)", () => {
      expect(isPrivateOrLocalHost("172.31.255.255")).toBe(true);
    });

    it("classifies 172.15.255.255 as public (just below range)", () => {
      expect(isPrivateOrLocalHost("172.15.255.255")).toBe(false);
    });

    it("classifies 172.32.0.0 as public (just above range)", () => {
      expect(isPrivateOrLocalHost("172.32.0.0")).toBe(false);
    });
  });

  describe("RFC1918 — 192.168.0.0/16", () => {
    it("classifies 192.168.0.1 as private", () => {
      expect(isPrivateOrLocalHost("192.168.0.1")).toBe(true);
    });

    it("classifies 192.168.255.255 as private", () => {
      expect(isPrivateOrLocalHost("192.168.255.255")).toBe(true);
    });

    it("classifies 192.167.0.1 as public (adjacent range)", () => {
      expect(isPrivateOrLocalHost("192.167.0.1")).toBe(false);
    });

    it("classifies 192.169.0.1 as public (adjacent range)", () => {
      expect(isPrivateOrLocalHost("192.169.0.1")).toBe(false);
    });
  });

  describe("loopback — 127.0.0.0/8", () => {
    it("classifies 127.0.0.1 as private", () => {
      expect(isPrivateOrLocalHost("127.0.0.1")).toBe(true);
    });

    it("classifies 127.255.255.255 as private", () => {
      expect(isPrivateOrLocalHost("127.255.255.255")).toBe(true);
    });

    it('classifies "localhost" as private', () => {
      expect(isPrivateOrLocalHost("localhost")).toBe(true);
    });
  });

  describe("link-local — 169.254.0.0/16", () => {
    it("classifies 169.254.1.1 as private", () => {
      expect(isPrivateOrLocalHost("169.254.1.1")).toBe(true);
    });

    it("classifies 169.253.1.1 as public (adjacent range)", () => {
      expect(isPrivateOrLocalHost("169.253.1.1")).toBe(false);
    });
  });

  describe(".local hostnames (mDNS)", () => {
    it('classifies "myserver.local" as private', () => {
      expect(isPrivateOrLocalHost("myserver.local")).toBe(true);
    });

    it('classifies "MyServer.LOCAL" as private (case-insensitive)', () => {
      expect(isPrivateOrLocalHost("MyServer.LOCAL")).toBe(true);
    });
  });

  describe("IPv6", () => {
    it("classifies ::1 as private (loopback)", () => {
      expect(isPrivateOrLocalHost("::1")).toBe(true);
    });

    it("classifies bracketed [::1] as private", () => {
      expect(isPrivateOrLocalHost("[::1]")).toBe(true);
    });
  });

  describe("public hosts", () => {
    it("classifies abs.example.com as public", () => {
      expect(isPrivateOrLocalHost("abs.example.com")).toBe(false);
    });

    it("classifies a public IP (8.8.8.8) as public", () => {
      expect(isPrivateOrLocalHost("8.8.8.8")).toBe(false);
    });

    it("classifies a DDNS-style hostname as public", () => {
      expect(isPrivateOrLocalHost("myhome.duckdns.org")).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("returns false for empty string", () => {
      expect(isPrivateOrLocalHost("")).toBe(false);
    });

    it("trims whitespace before classifying", () => {
      expect(isPrivateOrLocalHost("  192.168.1.1  ")).toBe(true);
    });

    it("does not misclassify a hostname that merely contains private-looking digits", () => {
      expect(isPrivateOrLocalHost("10.0.0.1.example.com")).toBe(false);
    });
  });
});

describe("isInsecureLoginUrl", () => {
  it("returns true for http:// scheme with a public host", () => {
    expect(isInsecureLoginUrl("http://abs.example.com")).toBe(true);
  });

  it("returns false for https:// scheme with a public host", () => {
    expect(isInsecureLoginUrl("https://abs.example.com")).toBe(false);
  });

  it("returns false for http:// scheme with a private LAN host", () => {
    expect(isInsecureLoginUrl("http://192.168.1.50:13378")).toBe(false);
  });

  it("returns false for http:// scheme with localhost", () => {
    expect(isInsecureLoginUrl("http://localhost:13378")).toBe(false);
  });

  it("returns false for http:// scheme with a .local host", () => {
    expect(isInsecureLoginUrl("http://myserver.local:13378")).toBe(false);
  });

  it("returns true for http:// scheme with a DDNS-style public host", () => {
    expect(isInsecureLoginUrl("http://myhome.duckdns.org:13378")).toBe(true);
  });

  it("returns false for malformed/unparseable URLs", () => {
    expect(isInsecureLoginUrl("not a url")).toBe(false);
  });

  it("returns false for a scheme-less host:port string", () => {
    expect(isInsecureLoginUrl("192.168.1.5:13378")).toBe(false);
  });

  it("trims whitespace before parsing", () => {
    expect(isInsecureLoginUrl("  http://abs.example.com  ")).toBe(true);
  });

  it("is case-insensitive on scheme", () => {
    expect(isInsecureLoginUrl("HTTP://abs.example.com")).toBe(true);
  });
});

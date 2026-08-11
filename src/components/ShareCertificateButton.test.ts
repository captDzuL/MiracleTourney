import { describe, expect, it } from "vitest";

import { getSafeCertificateFilename, getSafeCertificateImageUrl } from "./ShareCertificateButton";

describe("ShareCertificateButton security helpers", () => {
  it("allows generated local certificate paths and HTTPS certificate URLs", () => {
    expect(getSafeCertificateImageUrl("/certificates/champion.png")).toBe("/certificates/champion.png");
    expect(getSafeCertificateImageUrl("https://cdn.example.com/champion.png")).toBe("https://cdn.example.com/champion.png");
  });

  it("blocks scriptable and non-web certificate URLs before fetch or window.open", () => {
    expect(getSafeCertificateImageUrl("javascript:alert(1)")).toBeNull();
    expect(getSafeCertificateImageUrl("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(getSafeCertificateImageUrl("file:///C:/Users/secrets.png")).toBeNull();
  });

  it("sanitizes shared certificate filenames derived from team names", () => {
    expect(getSafeCertificateFilename("../Evil Team\r\n.png")).toBe("certificate-Evil-Team.png");
    expect(getSafeCertificateFilename("Quantum Vanguard")).toBe("certificate-Quantum-Vanguard.png");
  });
});

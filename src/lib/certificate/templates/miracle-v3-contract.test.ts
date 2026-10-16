import { describe, expect, it } from "vitest";

import { MIRACLE_V3_CERTIFICATE_TYPES, podiumCertificateType, requiredCertificateTypes } from "./miracle-v3-contract";

describe("requiredCertificateTypes", () => {
  it("requires all seven types for a three-place podium", () => {
    expect(requiredCertificateTypes([1, 2, 3])).toEqual(MIRACLE_V3_CERTIFICATE_TYPES);
  });

  it("drops the third-place certificate for a champion and runner-up podium", () => {
    expect(requiredCertificateTypes([1, 2])).toEqual(["champion", "runner_up", "mvp", "top_scorer", "top_defender", "top_assist"]);
    expect(requiredCertificateTypes([2, 1])).toHaveLength(6);
  });

  it("keeps all seven types when the podium is unknown or incomplete", () => {
    expect(requiredCertificateTypes([])).toEqual(MIRACLE_V3_CERTIFICATE_TYPES);
    expect(requiredCertificateTypes([1])).toEqual(MIRACLE_V3_CERTIFICATE_TYPES);
    expect(requiredCertificateTypes([2, 3])).toEqual(MIRACLE_V3_CERTIFICATE_TYPES);
  });
});

describe("podiumCertificateType", () => {
  it("maps podium ranks to team certificate types", () => {
    expect([1, 2, 3].map(podiumCertificateType)).toEqual(["champion", "runner_up", "third_place"]);
  });
});

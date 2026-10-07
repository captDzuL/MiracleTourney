import { describe, expect, it } from "vitest";

import { serializeJsonLd } from "./json-ld";

describe("serializeJsonLd", () => {
  it("escapes markup-capable less-than characters without changing JSON data", () => {
    const source = { name: '</script><script>alert("xss")</script>' };
    const serialized = serializeJsonLd(source);

    expect(serialized).not.toContain("<");
    expect(JSON.parse(serialized)).toEqual(source);
  });
});

// URL check and Zod schema shared by several server actions. Plain module: not a server action file.
// Moved out of lib/actions.ts without changes (refactor PR 3.1 prep).

import { isSafeHttpUrl } from "@/lib/security/request-guard";
import { z } from "zod";

export function isHttpUrl(value: string) {
  return isSafeHttpUrl(value);
}

export const optionalPublicUrlSchema = z.preprocess(
  (value) => {
    const text = String(value ?? "").trim();
    return text === "" ? null : text;
  },
  z.string().refine(isHttpUrl, "Registration URL must use http or https.").nullable(),
);

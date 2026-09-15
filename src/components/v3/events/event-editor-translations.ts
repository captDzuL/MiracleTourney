import { createTranslator } from "next-intl";
import en from "../../../../messages/en.json";
import id from "../../../../messages/id.json";

/** Explicit locale also supports the editor's existing standalone render consumers. */
export function getEventEditorTranslator(locale: "id" | "en") {
  return createTranslator({ locale, messages: locale === "id" ? id : en, namespace: "organizerMaster.editor" });
}

// @ts-ignore — package ships no types
import disposableDomains from "disposable-email-domains";

const DISPOSABLE = new Set<string>(disposableDomains as string[]);

export function isDisposableEmail(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase();
  return domain ? DISPOSABLE.has(domain) : false;
}

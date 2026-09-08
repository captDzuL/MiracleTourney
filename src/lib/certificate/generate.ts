/**
 * Certificate generation, persistence, and asset updates now live in
 * `@/modules/certificates`. These are thin re-exports for existing callers
 * (e.g. standalone scripts) that still import from this legacy path.
 *
 * `generateCertificateIfFinal` is the sanctioned public system trigger and comes from the primary
 * barrel. `generateCertificate` is an actor-less low-level primitive kept off that barrel by
 * design, so it is re-exported from the module's compatibility-only entrypoint instead — never
 * import the module's private repository directly here.
 */
export { generateCertificateIfFinal } from "@/modules/certificates";
export { generateCertificate } from "@/modules/certificates/compatibility";

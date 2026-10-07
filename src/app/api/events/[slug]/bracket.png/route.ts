import { readPublicSocialBracket } from "@/lib/bracket/read";
import { BracketExportTooLargeError, renderSocialBracketPng } from "@/lib/bracket/export";
import { isSafeEntityId } from "@/lib/security/request-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const json = (body: object, status: number) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const url = new URL(request.url);
  const locale = url.searchParams.get("locale") ?? "id";
  const round = url.searchParams.get("round");
  if (!isSafeEntityId(slug) || (locale !== "id" && locale !== "en") || [...url.searchParams.keys()].some((key) => key !== "locale" && key !== "round") || url.searchParams.getAll("locale").length > 1 || url.searchParams.getAll("round").length > 1 || (round !== null && !(round.length <= 128 && /^[a-zA-Z0-9_-]+(?::[a-zA-Z0-9_-]+)*$/.test(round)))) return json({ code: "invalid_input" }, 400);
  try {
    const model = await readPublicSocialBracket(slug, locale);
    if (!model || model.preview || model.event.status === "draft") return json({ code: "not_found" }, 404);
    const availableRounds = [...new Set(model.matches.map((match) => match.roundKey))];
    if (round && !availableRounds.includes(round)) return json({ code: "invalid_round", availableRounds }, 400);
    const png = await renderSocialBracketPng(model, round ?? undefined);
    return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Content-Disposition": `attachment; filename="${slug}-bracket${round ? `-${round.replaceAll(":", "-")}` : ""}.png"`, "Cache-Control": "public, max-age=60" } });
  } catch (error) {
    if (error instanceof BracketExportTooLargeError) return json({ code: "too_large", message: error.message, hint: "Select a round to download." }, 413);
    return json({ code: "export_failed", message: locale === "id" ? "PNG belum dapat dibuat. Coba lagi." : "PNG could not be prepared. Please retry." }, 503);
  }
}

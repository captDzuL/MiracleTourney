"use client";

interface Props {
  imageUrl: string;
  teamName: string;
  eventName: string;
}

export function getSafeCertificateImageUrl(imageUrl: string) {
  if (imageUrl.startsWith("/certificates/")) return imageUrl;

  try {
    const parsed = new URL(imageUrl);
    return parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export function getSafeCertificateFilename(teamName: string) {
  const safeTeamName = teamName
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .replace(/-(png|jpg|jpeg|webp)$/i, "")
    .replace(/^-+|-+$/g, "");

  return `certificate-${safeTeamName || "champion"}.png`;
}

export function ShareCertificateButton({ imageUrl, teamName, eventName }: Props) {
  async function handleShare() {
    const safeImageUrl = getSafeCertificateImageUrl(imageUrl);
    if (!safeImageUrl) {
      console.error("Unsafe certificate image URL blocked.");
      return;
    }

    try {
      const response = await fetch(safeImageUrl);
      const blob = await response.blob();
      const file = new File([blob], getSafeCertificateFilename(teamName), { type: "image/png" });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `${teamName} — Grand Champion`,
          text: `${teamName} meraih juara 1 di ${eventName}! 🏆 #PeakMode #MiraleLeague`,
        });
      } else {
        // Fallback: open the image in a new tab
        window.open(safeImageUrl, "_blank", "noopener,noreferrer");
      }
    } catch (err) {
      if (err instanceof Error && err.name !== "AbortError") {
        console.error("Share failed:", err);
        window.open(safeImageUrl, "_blank", "noopener,noreferrer");
      }
    }
  }

  return (
    <button
      onClick={handleShare}
      className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-50"
    >
      Share IG / TikTok / WA
    </button>
  );
}

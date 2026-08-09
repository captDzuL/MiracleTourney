"use client";

interface Props {
  imageUrl: string;
  teamName: string;
  eventName: string;
}

export function ShareCertificateButton({ imageUrl, teamName, eventName }: Props) {
  async function handleShare() {
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const file = new File([blob], `certificate-${teamName}.png`, { type: "image/png" });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `${teamName} — Grand Champion`,
          text: `${teamName} meraih juara 1 di ${eventName}! 🏆 #PeakMode #MiraleLeague`,
        });
      } else {
        // Fallback: open the image in a new tab
        window.open(imageUrl, "_blank");
      }
    } catch (err) {
      if (err instanceof Error && err.name !== "AbortError") {
        console.error("Share failed:", err);
        window.open(imageUrl, "_blank");
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

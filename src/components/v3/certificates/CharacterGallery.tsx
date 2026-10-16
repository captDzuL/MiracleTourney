import { useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { importCharacterArtAsCertificateAssetAction } from "@/lib/actions/certificate-v3-actions";
import { CHARACTER_LIBRARY, type CharacterRole, type LibraryCharacter } from "@/lib/certificate/character-library";

export type CharacterGalleryLabels = {
  readonly title: string;
  readonly hint: string;
  readonly imported: string;
  readonly roles: Record<CharacterRole, string>;
  readonly errors: Record<string, string>;
};

type Props = {
  eventId: string;
  disabled: boolean;
  /** Id of the error line; the gallery derives its own title id from it. */
  errorId: string;
  /** The library character behind the asset that is selected right now, if any. */
  selectedCharacterId: string | null;
  labels: CharacterGalleryLabels;
  onImported(assetId: string, character: LibraryCharacter): void;
  onMessage(value: string): void;
};

const THUMB_WIDTH = 240;
const THUMB_HEIGHT = 333;

/** Built-in characters the organizer can put on an award certificate with one click. */
export function CharacterGallery({ eventId, disabled, errorId, selectedCharacterId, labels, onImported, onMessage }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const titleId = `${errorId}-title`;
  const importCharacter = (character: LibraryCharacter) => startTransition(async () => {
    let result: Awaited<ReturnType<typeof importCharacterArtAsCertificateAssetAction>> | null = null;
    try { result = await importCharacterArtAsCertificateAssetAction({ eventId, characterId: character.id }); }
    catch { result = null; }
    if (result?.status === "imported") {
      setError(null); onImported(result.assetId, character); onMessage(labels.imported); router.refresh(); return;
    }
    const text = (result?.status === "blocked" ? labels.errors[result.code] : undefined) ?? labels.errors.failed;
    setError(text); onMessage(text);
  });
  return <div aria-labelledby={titleId} className="mt-4 grid gap-2" data-character-gallery role="group">
    <p className="text-xs font-bold text-[var(--color-text-muted)]" id={titleId}>{labels.title}</p>
    <p className="text-xs leading-5 text-[var(--color-text-muted)]">{labels.hint}</p>
    <ul className="m-0 grid list-none grid-cols-3 gap-2 p-0">
      {CHARACTER_LIBRARY.map((character) => {
        const selected = character.id === selectedCharacterId;
        return <li key={character.id}>
          <button aria-describedby={error ? errorId : undefined} aria-pressed={selected} className="relative flex min-h-11 w-full flex-col items-center gap-1 rounded-[var(--radius-control)] border border-[var(--color-border-strong)] p-1.5 text-center miracle-focus-ring disabled:cursor-not-allowed disabled:opacity-60 aria-[pressed=true]:border-[var(--color-brand-cyan)] aria-[pressed=true]:bg-[var(--color-surface-selected)] aria-[pressed=true]:ring-2 aria-[pressed=true]:ring-[var(--color-brand-cyan)]" data-character-id={character.id} disabled={disabled || pending} onClick={() => importCharacter(character)} type="button">
            <Image alt={character.name} className="h-20 w-full rounded object-cover object-top" height={THUMB_HEIGHT} src={`/${character.thumb}`} unoptimized width={THUMB_WIDTH} />
            <span className="text-xs font-extrabold">{character.name}</span>
            <span className="text-[0.6875rem] leading-4 text-[var(--color-text-muted)]">{labels.roles[character.role]}</span>
            {selected ? <Check aria-hidden="true" className="absolute right-1 top-1 size-4 rounded-full bg-[var(--color-brand-cyan)] p-0.5 text-[var(--color-on-accent)]" /> : null}
          </button>
        </li>;
      })}
    </ul>
    {error ? <p className="text-xs font-bold text-red-300" data-character-error id={errorId}>{error}</p> : null}
  </div>;
}

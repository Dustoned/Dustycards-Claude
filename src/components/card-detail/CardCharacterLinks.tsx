import Image from "next/image";
import Link from "next/link";
import type { CardCharacterData } from "@/components/card-modal/types";

interface CardCharacterLinksProps {
  characters?: readonly CardCharacterData[] | null;
  hpFallback?: number | string | null;
  onNavigate?: () => void;
}

function getUniqueCharacters(
  characters: readonly CardCharacterData[] | null | undefined
): CardCharacterData[] {
  const seen = new Set<string>();

  return (characters ?? []).filter((character) => {
    const key = `${character.kind}:${character.slug}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function getCardCharacterFactLabel(
  characters: readonly CardCharacterData[] | null | undefined
): "Pokémon" | "Trainer" | "Pokémon & Trainer" | "HP" {
  const uniqueCharacters = getUniqueCharacters(characters);
  const hasPokemon = uniqueCharacters.some((character) => character.kind === "pokemon");
  const hasTrainer = uniqueCharacters.some((character) => character.kind === "trainer");

  if (hasPokemon && hasTrainer) return "Pokémon & Trainer";
  if (hasPokemon) return "Pokémon";
  if (hasTrainer) return "Trainer";
  return "HP";
}

export function isCardCharacterFactLabel(label: string): boolean {
  return label === "Pokémon" || label === "Trainer" || label === "Pokémon & Trainer";
}

export function CardCharacterLinks({
  characters,
  hpFallback,
  onNavigate,
}: CardCharacterLinksProps) {
  const uniqueCharacters = getUniqueCharacters(characters);

  if (uniqueCharacters.length === 0) {
    return <span>{hpFallback ?? "--"}</span>;
  }

  return (
    <span className="card-detail-character-list">
      {uniqueCharacters.map((character) => (
        <Link
          key={`${character.kind}:${character.slug}`}
          href={`/characters/${character.kind}/${encodeURIComponent(character.slug)}`}
          prefetch={false}
          onClick={() => {
            if (onNavigate) window.setTimeout(onNavigate, 0);
          }}
          className="card-detail-character-chip"
          data-kind={character.kind}
          data-pixel-art={character.pixelArt ? "true" : "false"}
          aria-label={`View all ${character.name} cards`}
        >
          <span className="card-detail-character-sprite" aria-hidden="true">
            {character.spritePath ? (
              <Image
                src={character.spritePath}
                alt=""
                width={32}
                height={32}
                unoptimized
                draggable={false}
              />
            ) : (
              <span>{character.name.slice(0, 1)}</span>
            )}
          </span>
          <span className="card-detail-character-name">{character.name}</span>
        </Link>
      ))}
    </span>
  );
}

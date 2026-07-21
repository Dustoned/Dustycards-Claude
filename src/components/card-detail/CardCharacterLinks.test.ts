import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CardCharacterData } from "@/components/card-modal/types";
import {
  CardCharacterLinks,
  getCardCharacterFactLabel,
} from "@/components/card-detail/CardCharacterLinks";

const pokemon: CardCharacterData = {
  kind: "pokemon",
  name: "Mr. Mime",
  slug: "mr-mime",
  spritePath: "/assets/character-sprites/pokemon/mr-mime.png",
};

const trainer: CardCharacterData = {
  kind: "trainer",
  name: "Misty",
  slug: "misty",
  spritePath: "/assets/character-sprites/trainers/misty.png",
};

describe("CardCharacterLinks", () => {
  it("uses a precise fact label for Pokémon, trainers and combined cards", () => {
    expect(getCardCharacterFactLabel([pokemon])).toBe("Pokémon");
    expect(getCardCharacterFactLabel([trainer])).toBe("Trainer");
    expect(getCardCharacterFactLabel([pokemon, trainer])).toBe("Pokémon & Trainer");
    expect(getCardCharacterFactLabel([])).toBe("HP");
  });

  it("renders accessible links for each unique character", () => {
    const markup = renderToStaticMarkup(
      createElement(CardCharacterLinks, {
        characters: [pokemon, trainer, pokemon],
      })
    );

    expect(markup).toContain('href="/characters/pokemon/mr-mime"');
    expect(markup).toContain('href="/characters/trainer/misty"');
    expect(markup).toContain('aria-label="View all Mr. Mime cards"');
    expect(markup.match(/View all Mr\. Mime cards/g)).toHaveLength(1);
    expect(markup).toContain('class="card-detail-character-sprite"');
  });

  it("preserves the previous HP value when no characters are available", () => {
    const markup = renderToStaticMarkup(
      createElement(CardCharacterLinks, { characters: [], hpFallback: 30 })
    );

    expect(markup).toBe("<span>30</span>");
  });
});

import { classifySealedProduct, isCollectionSealedOriginProduct } from "@/lib/sealed-products";

function normalizeName(value: string): string {
  return value.toLocaleLowerCase().replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();
}

/**
 * Returns a pack count only when the catalogue name or set profile gives us a
 * dependable answer. The Openings form remains editable for products whose
 * contents vary by era or release (ETBs, tins and collection boxes).
 */
export function inferSealedOpeningPackCount(
  productName: string,
  packsPerBoosterBox?: number | null,
  game: string = "pokemon"
): number | null {
  const name = normalizeName(productName);
  const explicit = name.match(/(?:^|[^a-z0-9-])(\d{1,3})\s*(?:-\s*)?(?:pack|packs|booster|boosters)\b/);
  if (explicit) {
    const count = Number(explicit[1]);
    if (Number.isInteger(count) && count >= 1 && count <= 100) return count;
  }

  if (/\bbooster bundle\b/.test(name)) return 6;
  if (/\bbuild\s*(?:&|and)\s*battle stadium\b/.test(name)) return 12;
  if (/\bbuild\s*(?:&|and)\s*battle (?:box|kit)\b/.test(name)) return 4;

  if (/\bbooster box\b/.test(name)) {
    const count = Math.round(packsPerBoosterBox ?? 0);
    // Smaller boxes in the catalogue state their quantity in the name and are
    // caught above. International Pokémon boxes contain 36 packs; One Piece
    // boxes contain 24.
    return count >= 1 && count <= 100 ? count : game === "one-piece" ? 24 : 36;
  }

  if (
    /\b(?:single|sleeved) booster\b/.test(name) ||
    /\bbooster pack\b/.test(name) ||
    /\b(?:sampling|fun) pack\b/.test(name) ||
    /\b(?:checklane|single pack) blister\b/.test(name)
  ) {
    return 1;
  }

  return null;
}

export function isOpenableSealedProduct(productName: string): boolean {
  if (!isCollectionSealedOriginProduct(productName)) return false;

  const name = normalizeName(productName);
  const category = classifySealedProduct(productName);
  return !(
    category === "playmat" ||
    category === "playmat_collection" ||
    /\b(?:card sleeves?|sleeve set|deck box|portfolio|album|accessory|empty box)\b/.test(name)
  );
}

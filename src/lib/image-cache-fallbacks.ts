const POKEMON_NEWS_CARD_PATH =
  /\/v1\/live\/pcom-cms\/static-assets\/cms3\/us\/img\/cards\/full\/MEP\/MEP_EN_(\d{2,3})(?:_PC)?\.png$/i;

/**
 * Official Pokemon news images sometimes expose a presentation-transform URL
 * that their origin rejects outside the article. Keep the original cache key,
 * but try stable card-art origins when that specific URL fails.
 */
export function getRemoteImageCandidates(sourceUrl: URL): URL[] {
  const candidates = [sourceUrl];
  if (sourceUrl.hostname !== "www.pokemon.com") return candidates;

  const match = sourceUrl.pathname.match(POKEMON_NEWS_CARD_PATH);
  if (!match) return candidates;

  const number = Number(match[1]);
  const filename = sourceUrl.pathname.split("/").at(-1);
  if (filename) {
    candidates.push(new URL(
      `https://www.pokemon.com/static-assets/content-assets/cms2/img/cards/web/MEP/${filename}`
    ));
  }

  if (number >= 94 && number <= 110) {
    const billFilename = number === 101 ? "30th_EN_101.webp" : `MEP_EN_${number}.webp`;
    candidates.push(new URL(
      `https://bills-archive.nyc3.cdn.digitaloceanspaces.com/30th/${billFilename}`
    ));
  }

  return [...new Map(candidates.map((candidate) => [candidate.href, candidate])).values()];
}

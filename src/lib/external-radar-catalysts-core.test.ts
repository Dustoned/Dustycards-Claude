import { describe, expect, it } from "vitest";
import {
  MAX_CATALYST_SEARCH_QUERIES,
  MAX_CATALYST_SEARCH_QUERY_LENGTH,
  analyzeCatalystDocument,
  buildFirecrawlCatalystSearchQueries,
  classifyCatalystDocument,
  dedupeCatalystCardMatches,
  getTrustedCatalystSource,
  normalizeCatalystUrl,
  type CatalystCandidate,
} from "@/lib/external-radar-catalysts-core";

describe("trusted catalyst sources", () => {
  it("allows exact domains and real subdomains with their source credibility", () => {
    expect(
      getTrustedCatalystSource(
        "https://en.onepiece-cardgame.com/topics/official-news.php",
        "one-piece"
      )
    ).toMatchObject({
      domain: "onepiece-cardgame.com",
      sourceKind: "official",
      credibility: 1,
    });
    expect(getTrustedCatalystSource("https://www.reddit.com/r/PokemonTCG/")).toMatchObject({
      domain: "reddit.com",
      sourceKind: "social",
      credibility: 0.48,
    });
  });

  it("rejects lookalike, credentialed, non-web and wrong-game sources", () => {
    expect(getTrustedCatalystSource("https://pokemon.com.evil.example/news")).toBeNull();
    expect(getTrustedCatalystSource("https://pokemon.com@evil.example/news")).toBeNull();
    expect(getTrustedCatalystSource("javascript:alert(1)")).toBeNull();
    expect(getTrustedCatalystSource("https://pokemon.com/news", "one-piece")).toBeNull();
  });

  it("canonicalizes URLs for stable deduplication", () => {
    expect(
      normalizeCatalystUrl(
        "http://WWW.Pokemon.com/news//story/?utm_source=x&b=2&a=1&fbclid=nope#top"
      )
    ).toBe("https://pokemon.com/news/story?a=1&b=2");
  });
});

describe("catalyst classification", () => {
  it("finds multiple catalyst types with signed impact and source credibility", () => {
    const result = classifyCatalystDocument({
      url: "https://www.pokemon.com/us/pokemon-news/example",
      game: "pokemon",
      title: "Major new support and new product announced for Dragapult ex",
      description: "The release is not a reprint.",
      body: "The card is gaining attention ahead of rotation.",
    });

    expect(result).not.toBeNull();
    expect(result?.sourceKind).toBe("official");
    expect(result?.classifications).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "support", direction: "positive", credibility: 1 }),
        expect.objectContaining({ kind: "product", direction: "positive", credibility: 1 }),
        expect.objectContaining({ kind: "rotation", direction: "negative", credibility: 1 }),
        expect.objectContaining({ kind: "hype", direction: "positive", credibility: 1 }),
      ])
    );
  });

  it.each([
    ["Mass reprint announced", "reprint", "negative"],
    ["Confirmed no reprint planned", "reprint", "positive"],
    ["This card is now banned", "ban", "negative"],
    ["Ban lifted: the card is legal again", "ban", "positive"],
    ["This card rotates out next season", "rotation", "negative"],
    ["The card survives rotation", "rotation", "positive"],
    ["A viral buyout causes surging demand", "hype", "positive"],
    ["Hype is fading amid cooling demand", "hype", "negative"],
    ["Leaked booklet shows a chase card revealed", "reveal", "positive"],
    ["Japanese set coming to English", "localization", "positive"],
  ] as const)("classifies %s", (title, expectedKind, expectedDirection) => {
    const result = classifyCatalystDocument({
      url: "https://www.pokebeach.com/example",
      game: "pokemon",
      title,
    });
    const classification = result?.classifications.find((item) => item.kind === expectedKind);

    expect(classification).toMatchObject({
      kind: expectedKind,
      direction: expectedDirection,
      credibility: 0.8,
    });
    if (expectedDirection === "positive") expect(classification?.signedImpact).toBeGreaterThan(0);
    if (expectedDirection === "negative") expect(classification?.signedImpact).toBeLessThan(0);
  });

  it("does not classify untrusted pages or ordinary prose", () => {
    expect(
      classifyCatalystDocument({
        url: "https://random.example/post",
        title: "Mass reprint announced",
      })
    ).toBeNull();
    expect(
      classifyCatalystDocument({
        url: "https://pokemon.com/news/card",
        title: "A normal card gallery",
      })
    ).toBeNull();
  });
});

describe("candidate matching and deduplication", () => {
  const candidates: CatalystCandidate[] = [
    { cardId: "mew", game: "pokemon", name: "Mew ex", setCode: "MEW" },
    { cardId: "meowth", game: "pokemon", name: "Meowth ex", setCode: "PRE" },
    { cardId: "op01", game: "one-piece", name: "Roronoa Zoro", setCode: "OP01" },
    { cardId: "op010", game: "one-piece", name: "Monkey.D.Luffy", setCode: "OP010" },
  ];

  it("matches normalized whole card names without substring false positives", () => {
    const matches = analyzeCatalystDocument(
      {
        url: "https://www.pokebeach.com/news/meowth",
        game: "pokemon",
        title: "Meowth-ex becomes a breakout card",
      },
      candidates
    );

    expect(matches.map((match) => match.cardId)).toEqual(["meowth"]);
    expect(matches[0]?.matchedBy).toContain("name");
  });

  it("normalizes aliases but rejects partial set-code matches", () => {
    const aliasMatches = analyzeCatalystDocument(
      {
        url: "https://onepiecetopdecks.com/news/nami",
        game: "one-piece",
        title: "Straw Hat Nami gets new support cards",
      },
      [
        {
          cardId: "nami",
          game: "one-piece",
          name: "Nami",
          aliases: ["Straw-Hat Nami"],
          setCode: "OP01",
        },
      ]
    );
    expect(aliasMatches[0]?.matchedBy).toContain("alias");

    const codeMatches = analyzeCatalystDocument(
      {
        url: "https://onepiecetopdecks.com/news/op010",
        game: "one-piece",
        title: "OP010 receives new support cards",
      },
      candidates
    );
    expect(codeMatches.map((match) => match.cardId)).toEqual(["op010"]);
    expect(codeMatches[0]?.matchedBy).toContain("set-code");
  });

  it("deduplicates by canonical URL plus card while retaining other cards", () => {
    const first = analyzeCatalystDocument(
      {
        url: "https://pokebeach.com/story?utm_source=feed",
        game: "pokemon",
        title: "Mew ex and Meowth ex gain new support cards",
      },
      candidates
    );
    const repeated = first.map((match) => ({
      ...match,
      url: "http://www.pokebeach.com/story?fbclid=duplicate",
    }));

    const deduped = dedupeCatalystCardMatches([...first, ...repeated]);
    expect(deduped).toHaveLength(2);
    expect(deduped.map((match) => match.cardId).sort()).toEqual(["meowth", "mew"]);
    expect(deduped.every((match) => match.url === "https://pokebeach.com/story")).toBe(true);
  });

  it("fans a set-level reveal out to cards from that set", () => {
    const matches = analyzeCatalystDocument(
      {
        url: "https://pokebeach.com/news/prismatic-booklet",
        game: "pokemon",
        title: "Prismatic Evolutions set booklet leaked",
      },
      [
        {
          cardId: "umbreon",
          game: "pokemon",
          name: "Umbreon ex",
          setName: "Prismatic Evolutions",
        },
        {
          cardId: "zoro",
          game: "one-piece",
          name: "Roronoa Zoro",
          setName: "Romance Dawn",
        },
      ]
    );

    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ cardId: "umbreon", matchedBy: ["set-name"] });
  });

  it("can match a reveal against an all-card-sized candidate universe", () => {
    const universe: CatalystCandidate[] = Array.from({ length: 24_000 }, (_, index) => ({
      cardId: `bulk-${index}`,
      game: "pokemon",
      name: `Unrelated Card ${index}`,
      setName: `Archive Set ${index % 200}`,
    }));
    universe.push({
      cardId: "mega-gengar",
      game: "pokemon",
      name: "Mega Gengar ex",
      aliases: ["Mega Gengar", "Gengar"],
    });

    const matches = analyzeCatalystDocument(
      {
        url: "https://pokebeach.com/news/mega-gengar",
        game: "pokemon",
        title: "Leaked booklet: Mega Gengar chase card revealed",
      },
      universe
    );

    expect(matches.map((match) => match.cardId)).toEqual(["mega-gengar"]);
  });
});

describe("bounded Firecrawl query planning", () => {
  it("creates at most four fair, ranked and date-bounded searches", () => {
    const candidates: CatalystCandidate[] = [
      { cardId: "p3", game: "pokemon", name: "Third Pokemon", rank: 3 },
      { cardId: "o2", game: "one-piece", name: "Second Pirate", rank: 2, setCode: "OP14" },
      { cardId: "p1", game: "pokemon", name: "First Pokemon", rank: 1, setCode: "TWM" },
      { cardId: "o1", game: "one-piece", name: "First Pirate", rank: 1, setCode: "OP13" },
      { cardId: "p2", game: "pokemon", name: "Second Pokemon", rank: 2 },
      { cardId: "o3", game: "one-piece", name: "Third Pirate", rank: 3 },
    ];

    const queries = buildFirecrawlCatalystSearchQueries(
      candidates,
      new Date("2026-07-12T12:00:00.000Z")
    );

    expect(queries).toHaveLength(MAX_CATALYST_SEARCH_QUERIES);
    expect(queries.map((query) => query.cardId)).toEqual([
      "set-intelligence:pokemon",
      "set-intelligence:one-piece",
      "p1",
      "o1",
    ]);
    expect(queries.map((query) => query.game)).toEqual([
      "pokemon",
      "one-piece",
      "pokemon",
      "one-piece",
    ]);
    expect(queries.every((query) => query.query.includes("July 2026"))).toBe(true);
    expect(queries.every((query) => query.query.length <= MAX_CATALYST_SEARCH_QUERY_LENGTH)).toBe(
      true
    );
    expect(queries.every((query) => query.allowedDomains.length > 0)).toBe(true);
    expect(queries.map((query) => query.mode)).toEqual([
      "set-intelligence",
      "set-intelligence",
      "candidate",
      "candidate",
    ]);
  });

  it("honors a lower maximum, sanitizes operators and never emits empty names", () => {
    const queries = buildFirecrawlCatalystSearchQueries(
      [
        {
          cardId: "safe",
          game: "pokemon",
          name: `Pikachu \" OR site:evil.example ${"very ".repeat(80)}`,
          rank: 1,
        },
        { cardId: "empty", game: "pokemon", name: "   ", rank: 2 },
      ],
      new Date("2026-01-01T00:00:00.000Z"),
      { maxQueries: 2 }
    );

    expect(queries).toHaveLength(2);
    const candidateQuery = queries.find((query) => query.mode === "candidate");
    expect(candidateQuery?.candidateName).not.toContain('"');
    expect(candidateQuery?.candidateName).not.toMatch(/\bOR\b/);
    expect(candidateQuery?.query).toContain("January 2026");
    expect(candidateQuery?.query.length).toBeLessThanOrEqual(MAX_CATALYST_SEARCH_QUERY_LENGTH);
  });
});

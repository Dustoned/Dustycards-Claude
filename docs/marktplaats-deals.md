# Marktplaats deals

DustyCards keeps the web request path out of the marketplace scan. Codex performs
the browser work externally; the app only exports a read-only reference snapshot
and imports the final compact report.

## Daily workflow

1. Run `npm run marktplaats:export`.
2. Search Marktplaats with Codex browser/web tools. Do not use Firecrawl.
3. Open every candidate advert and read its full description. The title alone is
   never sufficient for a definitive match.
4. Write `data/marktplaats/report-latest.json` with `schemaVersion: 1`.
5. Run `npm run marktplaats:import -- --in data/marktplaats/report-latest.json`.
6. Verify the result under `For Sale -> Marktplaats Deals` at `/?tab=selling&sellingView=marktplaats`.

The daily report should contain at least 10 description-checked selections whenever Marktplaats
has 10 usable listings. Use `matchStatus: "matched"` for offers below market value. If fewer than
10 real deals exist, fill the remainder with the closest verified offers using
`matchStatus: "shortlist"`; these may be at or above market value and are labelled separately in
the app. Use `review` only when the exact card, language, grade, or offer contents remain uncertain.

## Production automation

The scheduled Codex workflow runs the small export and import commands on the production host over
SSH. It downloads only the reference JSON, performs all Marktplaats discovery and description
analysis externally, and uploads the finished report for import. This keeps crawling out of the
Next.js process while ensuring the For Sale page uses the production price refresh and production
database.

The generated reference is ignored by Git and contains:

- all cards with the current CardMarket English/NM value;
- the existing DustyCards expansion total;
- CardMarket graded values and eBay sold graded medians with their source currency.

## Report contract

```json
{
  "schemaVersion": 1,
  "scan": {
    "id": "marktplaats-2026-08-17T09-00-00+02-00",
    "startedAt": "2026-08-17T07:00:00.000Z",
    "finishedAt": "2026-08-17T07:20:00.000Z",
    "referenceExportedAt": "2026-08-17T06:59:00.000Z",
    "listingsChecked": 120,
    "completeCoverage": false,
    "removedExternalIds": [],
    "warning": null
  },
  "deals": [
    {
      "kind": "raw",
      "title": "Listing title",
      "listingUrl": "https://www.marktplaats.nl/v/example",
      "cardId": "dustycards-card-id",
      "episodeId": null,
      "listingPriceEur": 80,
      "shippingEur": 6.95,
      "marketValueEur": 110,
      "language": "English",
      "condition": "Near Mint",
      "gradingCompany": null,
      "gradingGrade": null,
      "matchConfidence": 0.97,
      "matchStatus": "matched",
      "descriptionChecked": true,
      "descriptionSummary": "The description offers one genuine English card for a fixed price.",
      "offerContents": "1x exact card printing",
      "matchNotes": "Name, set and card number match title, photos and description."
    }
  ]
}
```

Savings and discount are always recomputed by the importer from
`marketValueEur - listingPriceEur`. `shippingEur` is stored and displayed but is
never part of that calculation. A matched graded listing needs an exact grading
company and grade. A matched raw listing must be explicitly English. Missing or
ambiguous description evidence must use `matchStatus: "review"`.

`completeCoverage` should remain false unless the run actually revisited the full
tracked result set. Individual adverts confirmed as unavailable can always be
removed safely through `removedExternalIds`.

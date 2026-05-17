export type PatchNoteTone = "new" | "improved" | "fixed" | "system";

export interface PatchNoteEntry {
  version: string;
  releasedAt: string;
  title: string;
  summary: string;
  tone: PatchNoteTone;
  highlights: string[];
}

export interface RoadmapItem {
  title: string;
  status: "Completed" | "Planned" | "In progress" | "Next" | "Waiting";
  summary: string;
}

export const patchNotes: PatchNoteEntry[] = [
  {
    version: "1.0.24",
    releasedAt: "May 17, 2026",
    title: "Sealed language charts",
    summary: "Sealed product charts now handle CardMarket language prices the same way card detail does.",
    tone: "improved",
    highlights: [
      "Sealed detail now has Market, EU, DE, FR, ES, and IT chart series where data is available.",
      "The selected sealed series drives the chart, current price, 7D average, and 30D average.",
      "Removed the duplicate language price rows so sealed pricing looks cleaner and closer to normal cards.",
    ],
  },
  {
    version: "1.0.23",
    releasedAt: "May 17, 2026",
    title: "Sealed detail and sync polish",
    summary: "Sealed product detail, pricing freshness, local sync safety, modal styling, and promo numbers were cleaned up.",
    tone: "improved",
    highlights: [
      "Sealed product detail now matches the normal card detail layout more closely.",
      "Card detail is clearer about eBay sold pricing freshness and avoids stale graded values overriding stronger raw prices.",
      "Local development no longer runs background price sync unless it is explicitly enabled.",
      "Collection popups now share the same clean glassy action row without the old dark footer bar.",
      "Black Star promo card numbers now show the printed single promo number, such as SM241.",
    ],
  },
  {
    version: "1.0.22",
    releasedAt: "May 17, 2026",
    title: "Card metadata restored",
    summary: "Card tiles show the card number and clickable set name again.",
    tone: "fixed",
    highlights: [
      "Restored the original collection card metadata line.",
      "Restored set links in card rows and grids where they were available before.",
    ],
  },
  {
    version: "1.0.21",
    releasedAt: "May 17, 2026",
    title: "Cleaner card number labels",
    summary: "Card grids now keep the printed card number visible without repeating the same set name on every card.",
    tone: "improved",
    highlights: [
      "Collection card rows, tables, and tiles now show only the card number in the compact meta line.",
      "Expansion card rows and grids use the same cleaner number-only treatment.",
    ],
  },
  {
    version: "1.0.20",
    releasedAt: "May 17, 2026",
    title: "Printed card numbers",
    summary: "Cards can now show and search the number printed on the card, like 144/131.",
    tone: "new",
    highlights: [
      "Added stored printed card numbers separate from the raw sync number.",
      "Backfilled Pokemon printed references from TCGdex official set counts.",
      "Search can match printed references while keeping sync-safe raw numbers intact.",
    ],
  },
  {
    version: "1.0.19",
    releasedAt: "May 17, 2026",
    title: "Want quick view number clarity",
    summary: "Card numbers in want binder quick view are easier to read.",
    tone: "improved",
    highlights: [
      "Card number badges are larger and higher contrast.",
      "Mobile quick view keeps card identity easier to scan.",
    ],
  },
  {
    version: "1.0.18",
    releasedAt: "May 17, 2026",
    title: "Wantlist quick view polish",
    summary: "Want binder quick view is cleaner, focused, and can add cards directly.",
    tone: "improved",
    highlights: [
      "Quick view rows now prioritize card image, name, number, and rarity.",
      "Prices are smaller so the missing card info is easier to scan.",
      "Quick view card rows are clickable and open card detail.",
      "Only one quick view opens at once, without stretching the full tile row.",
      "The old hide button is now an add-to-binder action.",
    ],
  },
  {
    version: "1.0.17",
    releasedAt: "May 17, 2026",
    title: "Want binder detail pages",
    summary: "Wantlist binder tiles now open a full binder-style missing cards page.",
    tone: "improved",
    highlights: [
      "Clicking a want binder opens a dedicated page with header, chart, and missing cards.",
      "Planner tiles keep the same compact footprint as collection binders.",
      "Quick view is still available as a small secondary action on each tile.",
    ],
  },
  {
    version: "1.0.16",
    releasedAt: "May 17, 2026",
    title: "Want binder tile sizing",
    summary: "Wantlist planner binder tiles now match the collection binder tile footprint.",
    tone: "fixed",
    highlights: [
      "Uses the same fixed tile width as collection binders.",
      "Collapsed wants tiles no longer show the extra top-missing block.",
      "Missing cards stay available after clicking the binder tile open.",
    ],
  },
  {
    version: "1.0.15",
    releasedAt: "May 17, 2026",
    title: "Wantlist planner polish",
    summary: "Binder wants now load immediately and use clickable binder-style tiles.",
    tone: "improved",
    highlights: [
      "Missing binder wants are prepared before the Wants page renders.",
      "Planner binders now look like collection binder tiles with wants-focused metrics.",
      "Clicking a binder tile opens the missing card list directly inside the tile.",
    ],
  },
  {
    version: "1.0.14",
    releasedAt: "May 17, 2026",
    title: "Roadmap status cleanup",
    summary: "Wantlist planner is now marked completed in the roadmap.",
    tone: "improved",
    highlights: [
      "Added a completed roadmap state.",
      "Marked Wantlist planner as completed after the live release.",
      "Kept the upcoming roadmap focused on the next larger features.",
    ],
  },
  {
    version: "1.0.13",
    releasedAt: "May 17, 2026",
    title: "Wantlist planner",
    summary: "Linked binder missing cards now flow into Wants automatically.",
    tone: "new",
    highlights: [
      "Missing cards from linked set binders are added to Wants without a manual repair step.",
      "Wants now groups binder goals into a compact Missing by Binder planner.",
      "Hiding a planner card keeps it out of auto-sync until hidden cards are reset.",
    ],
  },
  {
    version: "1.0.12",
    releasedAt: "May 17, 2026",
    title: "Card detail cleanup",
    summary: "Removed the noisy price intelligence strip from card detail.",
    tone: "fixed",
    highlights: [
      "Kept the compact price status line under the chart.",
      "Removed duplicated confidence, source, freshness, sample, and history tiles.",
      "Card detail is cleaner again on desktop and mobile.",
    ],
  },
  {
    version: "1.0.11",
    releasedAt: "May 17, 2026",
    title: "Price intelligence layer",
    summary: "Card detail now explains price confidence instead of only showing raw numbers.",
    tone: "new",
    highlights: [
      "Added compact confidence, source, freshness, and history signals under the price chart.",
      "eBay sold graded prices now show sample quality and USD to EUR conversion context.",
      "Thin-data warnings make noisy prices easier to spot before buying or selling.",
    ],
  },
  {
    version: "1.0.9",
    releasedAt: "May 17, 2026",
    title: "Roadmap cleanup",
    summary: "Roadmap now focuses on bigger product improvements instead of small bug-fix tasks.",
    tone: "improved",
    highlights: [
      "Removed bug-fix style roadmap items.",
      "Added larger feature ideas for collection, deals, grading, alerts, and sharing.",
      "Kept Japanese support visible as waiting on TCGGO data.",
    ],
  },
  {
    version: "1.0.8",
    releasedAt: "May 17, 2026",
    title: "Expanded roadmap",
    summary: "Roadmap now lists more useful longer-term app improvements.",
    tone: "improved",
    highlights: [
      "Added Japanese support as a waiting-on-data-source item.",
      "Added clearer next improvements for pricing, collection, sync, and mobile UX.",
      "Roadmap stays compact inside the Updates tab.",
    ],
  },
  {
    version: "1.0.7",
    releasedAt: "May 17, 2026",
    title: "Patch notes and roadmap",
    summary: "Added a compact Updates tab in Settings so every release has a clear note.",
    tone: "new",
    highlights: [
      "New Patch Notes window in Settings.",
      "Small roadmap section for upcoming app polish.",
      "Patch notes are stored in a dedicated app file for each release.",
    ],
  },
  {
    version: "1.0.6",
    releasedAt: "May 17, 2026",
    title: "Smarter binder tiles",
    summary: "Binder tiles now show what the set is doing, not only lifetime P&L.",
    tone: "improved",
    highlights: [
      "Added completion percentage and missing card count.",
      "Added recent binder value movement with percent change.",
      "Added ROI under P&L while keeping the tile compact on mobile.",
    ],
  },
  {
    version: "1.0.5",
    releasedAt: "May 17, 2026",
    title: "Consistent slab previews",
    summary: "Card detail slabs now match the same visual style used on collection overview tiles.",
    tone: "fixed",
    highlights: [
      "Removed the separate detail slab look.",
      "Matched wrapper, sizing behavior, and tile styling.",
      "Checked desktop and mobile card detail layouts.",
    ],
  },
  {
    version: "1.0.4",
    releasedAt: "May 17, 2026",
    title: "Account page refresh",
    summary: "Account was rebuilt into a cleaner, more professional account area.",
    tone: "improved",
    highlights: [
      "New account overview layout.",
      "Cleaner security and admin sections.",
      "Better mobile spacing and account stats.",
    ],
  },
  {
    version: "1.0.3",
    releasedAt: "May 16, 2026",
    title: "Settings control center",
    summary: "Settings was reorganized into focused tabs with less duplicate information.",
    tone: "improved",
    highlights: [
      "Added Preferences, Collection, System, and Sync tabs.",
      "Grouped related controls into smaller panels.",
      "Moved sync tooling into one cleaner control area.",
    ],
  },
];

export const roadmapItems: RoadmapItem[] = [
  {
    title: "Japanese card support",
    status: "Waiting",
    summary: "Add Japanese library and price flows when TCGGO exposes reliable Japanese data.",
  },
  {
    title: "Price intelligence layer",
    status: "Next",
    summary: "Show source confidence, eBay sold sample context, currency conversion, and thin-data warnings.",
  },
  {
    title: "Price alerts and watch rules",
    status: "Next",
    summary: "Let users watch cards, binders, sealed, and wants for target prices or sudden movement.",
  },
  {
    title: "Portfolio analytics",
    status: "Planned",
    summary: "Track allocation by set, era, rarity, language, graded/raw, sealed, and total exposure.",
  },
  {
    title: "Binder goals",
    status: "Planned",
    summary: "Rank missing cards by price, rarity, completion impact, and best next buys for each binder.",
  },
  {
    title: "Grading decision helper",
    status: "Planned",
    summary: "Compare raw value, graded comps, expected grade upside, fees, and likely ROI.",
  },
  {
    title: "Deal Radar v2",
    status: "Planned",
    summary: "Add match confidence, risk flags, shipping impact, seller context, and target-margin presets.",
  },
  {
    title: "Wantlist planner",
    status: "Completed",
    summary: "Missing cards from linked binders are now automatically grouped into Wants.",
  },
  {
    title: "Sealed portfolio tools",
    status: "Planned",
    summary: "Track sealed entry price, market movement, position size, ROI, and product-level liquidity.",
  },
  {
    title: "Market timeline",
    status: "Planned",
    summary: "Create a clean timeline of collection value changes, biggest movers, buys, and sold/listing events.",
  },
  {
    title: "Smart collection import",
    status: "Planned",
    summary: "Import CSV or pasted lists, auto-match cards, detect duplicates, and preview changes before saving.",
  },
  {
    title: "Collection export center",
    status: "Planned",
    summary: "Export collection, binders, sealed, wants, and valuation snapshots for backup or spreadsheets.",
  },
  {
    title: "Shareable binder pages",
    status: "Planned",
    summary: "Generate read-only public or private links for selected binders and portfolio views.",
  },
  {
    title: "Personal dashboard widgets",
    status: "Planned",
    summary: "Let users choose which overview modules appear first, with compact cards for their workflow.",
  },
];

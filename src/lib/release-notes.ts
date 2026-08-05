import type { PatchNoteTone, RoadmapItem } from "@/lib/patch-notes";

export interface ReleaseNoteSection {
  title: string;
  highlights: string[];
}

export interface ReleaseNoteChapter {
  version: string;
  releasedAt: string;
  title: string;
  summary: string;
  tone: PatchNoteTone;
  sections: ReleaseNoteSection[];
}

// User-facing release chapters. The complete build-by-build archive remains in
// patch-notes.ts; these chapters describe the finished feature instead of every
// intermediate attempt that led to it. This structure can also be reused by a
// future “What’s new” modal without rewriting release copy.
export const releaseNotes: ReleaseNoteChapter[] = [
  {
    version: "3.11.0",
    releasedAt: "August 5, 2026",
    title: "Faster opening, reliable navigation and a readable update history",
    summary:
      "DustyCards opens with useful collection content sooner, keeps a single tap alive when a heavy route is loading and presents the app’s history as clear feature chapters.",
    tone: "improved",
    sections: [
      {
        title: "Faster app launch",
        highlights: [
          "The phone launch screen now appears immediately and disappears as soon as the real app frame is ready, avoiding a long unexplained black screen.",
          "Home loads the essential collection overview first; featured cards, value drivers and sudden drops arrive progressively afterwards.",
          "Collection overview results and exchange rates reuse safer caches, while low-priority images decode lazily instead of competing with the first screen.",
        ],
      },
      {
        title: "One tap stays one tap",
        highlights: [
          "Every internal route gets immediate progress feedback plus a compact destination label when loading takes longer than expected.",
          "Navigation progress observes one in-flight transition without cancelling it; genuinely slow routes offer an explicit direct-open action instead of silently starting duplicate requests.",
          "Search, game switches and binder create/edit flows now join the same progress lifecycle instead of navigating silently.",
        ],
      },
      {
        title: "Lighter expansion browsing",
        highlights: [
          "Expansion overview sections skip off-screen layout work until they approach the viewport.",
          "Large set pages render cards progressively as the collector scrolls instead of mounting an entire set immediately; the tested mobile set dropped from roughly 250 initial images to 58.",
        ],
      },
      {
        title: "Background reliability",
        highlights: [
          "The isolated reprint worker is enabled as a persistent service, so unfinished evidence resumes safely after a server reboot without moving the workload back into web requests.",
          "Patch notes are now grouped by completed feature, with clear headings and version ranges while the detailed build archive stays preserved.",
        ],
      },
    ],
  },
  {
    version: "3.10.0",
    releasedAt: "August 4, 2026",
    title: "Account-synced navigation and quiet background intelligence",
    summary:
      "Personal navigation follows the account across devices, changing web sources are monitored without repeating unchanged work and large catalog jobs stay outside normal browsing.",
    tone: "new",
    sections: [
      {
        title: "Your navigation on every device",
        highlights: [
          "Phone quick-bar buttons, ordered More shortcuts, desktop menu links and pinned sidebar tools are saved to the signed-in account.",
          "The focused mobile navigation editor uses searchable icon tiles, category filters, reorder controls and one account-synced save action.",
          "Quick Access has its own visual treatment and Sealed Market can be placed directly where it is easy to reach.",
        ],
      },
      {
        title: "Monitored release sources",
        highlights: [
          "Upcoming & Leaks and Signal Radar use tagged Firecrawl change monitoring, so unchanged pages reuse their stored result without parsing or image warming again.",
          "Multiple Firecrawl keys form one deduplicated pool with round-robin use, cooldown and failover; Settings reports combined capacity without exposing credentials.",
          "Upcoming reveal art is stored in the server image cache with source-specific fallbacks, and old archive sets are excluded from the upcoming feed.",
        ],
      },
      {
        title: "Low-impact catalog work",
        highlights: [
          "Reprint evidence runs in its own durable, low-priority service with CPU and memory limits, quiet-time pauses and no duplicate work in the web process.",
          "Completed cards are only reconsidered for meaningful artwork or matching-model changes, incomplete evidence, new cards or an occasional quality review.",
          "Admins can see recent active users beside the profile controls on phone and desktop through a compact privacy-safe presence panel.",
        ],
      },
      {
        title: "Cleaner market tools",
        highlights: [
          "Sudden Drops uses aligned Cards and Sealed sections, a compact summary and matching search and sorting controls on widescreen.",
          "Sealed Market no longer repeats CardMarket, eBay and TCGGO actions underneath the chart when those actions already exist in the detail header.",
        ],
      },
    ],
  },
  {
    version: "3.9.0 – 3.9.6",
    releasedAt: "August 4, 2026",
    title: "Connected collection workflows",
    summary:
      "Navigation, alerts, reprints, openings, trading, selling and release intelligence became complete collector workflows instead of isolated screens.",
    tone: "new",
    sections: [
      {
        title: "Find every feature",
        highlights: [
          "Phone More became a complete directory for Market, Collection, Discover and Tools, while desktop gained direct favorites and a pinned sidebar group.",
          "Navigation Settings replaced repeated dropdowns with visual icon slots, grouped pickers, reorder, remove and reset actions.",
          "Openings moved into More and now starts from a clean searchable popup containing the collector’s own sealed products.",
        ],
      },
      {
        title: "Action Center and alerts",
        highlights: [
          "One Action Center combines triggered card, sealed, wants and binder alerts with watched eBay endings, completed Signal Radar outcomes and admin feedback.",
          "Opened notifications store a read receipt, disappear across mounted bells and can trigger again when a genuinely new event occurs.",
          "Admin feedback adds a visible Settings badge so reports and incorrect reprint notices cannot be missed.",
        ],
      },
      {
        title: "Reprints and print families",
        highlights: [
          "Automatic matching stores related artworks and alternate treatments such as gold, rainbow, promo and jumbo editions before Card Detail opens.",
          "Card Detail previews up to four editions and opens the complete family in a clean popup with prices and comparison context.",
          "Collectors can report a wrong relationship; admins can approve or exclude uncertain pairs and those decisions survive later scans.",
        ],
      },
      {
        title: "Trading, selling and openings",
        highlights: [
          "Trade Center compares any two searched cards by live EU value without requiring a friend, and Full Access friends can match Wants against duplicates or listed cards.",
          "Trade search shares the normal card matching logic, keeps old results visible while typing and offers price and release sorting in a readable popup.",
          "The selling ledger records platform, fees, gross result, net proceeds and net P&L for every sold copy.",
          "Sealed Opening Sessions connect an owned product, opening cost, pack count and added pulls into a persistent live ROI record.",
        ],
      },
      {
        title: "Upcoming & Leaks",
        highlights: [
          "A dedicated release page combines scheduled sealed products, revealed singles and source reports from Pokémon, PokeBeach, ICv2 and Bill’s Archive.",
          "Singles are grouped by set in a highest-number-first preview row and open a stripped binder-style gallery with search and number or name sorting.",
          "Released database cards are matched by set number and artwork fingerprint so a reveal can switch from source-only artwork to native Card Detail automatically.",
          "Direct ingestion, Scrape.do and the last successful stored gallery form a layered fallback so a blocked source never empties the page.",
        ],
      },
    ],
  },
  {
    version: "3.8.43 – 3.8.60",
    releasedAt: "August 3 – 4, 2026",
    title: "Smarter search, buying signals and dependable data",
    summary:
      "Search became relevance-first, Signal Radar gained transparent learning and sealed candidates, and the app learned to recover from blocked or exhausted market sources.",
    tone: "improved",
    sections: [
      {
        title: "Search that understands cards",
        highlights: [
          "Best Match ranks by identity, set, number, rarity and DustyCards market interest rather than quietly sorting by price.",
          "Promo references, partial card numbers, compact references and small typing mistakes are recognized while typing.",
          "Search results stay stable while a new query loads, and explanatory stat labels use plain collector language.",
        ],
      },
      {
        title: "Signal Radar learning",
        highlights: [
          "Predictions and outcomes use the same CardMarket English Near Mint price family and receive append-only observations even when the quote is unchanged.",
          "Forecast validation shows logged observations, independent calls, active and completed horizons, maturity dates and meaningful correct-versus-missed outcomes instead of a cryptic 0/50.",
          "Only moves that clear both 15% and EUR 10 affect directional accuracy; tiny changes and low-coverage outcomes remain visible but do not train the model.",
          "Sealed Radar ranks products using EU history, 30/90-day movement, volatility, product type and set lifecycle, while short histories remain clearly capped Learning candidates.",
        ],
      },
      {
        title: "Collector planning",
        highlights: [
          "Wants and want binders show chase-aware Best to buy now guidance using momentum, set importance and completion impact, with low-value pickups deliberately downweighted.",
          "Owned binders can create, rotate and revoke public read-only links without exposing costs, notes or private collection access.",
          "Card, sealed, want and binder price alerts share one target/drop workflow and grouped email sweep.",
        ],
      },
      {
        title: "Reliable refresh and caching",
        highlights: [
          "Submitted cards recover from an exhausted Firecrawl key through Scrape.do and direct CardMarket fallbacks without returning empty JSON errors.",
          "Market and collection caches warm after deploy, graded mover payloads became dramatically lighter and admins can warm the server image cache from Settings.",
          "Nightly backups, startup guards and pre-launch checks protect data while preserving manual refresh access.",
        ],
      },
    ],
  },
  {
    version: "3.8.0 – 3.8.42",
    releasedAt: "July 19 – August 3, 2026",
    title: "Premium details, scanner foundations and complete market workflows",
    summary:
      "Card Detail became a full collector workspace, phone appearance became personal and pricing, selling and sealed history received durable background workflows.",
    tone: "new",
    sections: [
      {
        title: "Premium Card Detail",
        highlights: [
          "A widescreen card workspace combines 2D/3D presentation, raw and graded markets, collection context, forecasting, analysis and evidence in consistent tabs.",
          "Grade Score and PSA 10 estimates, market score, pull rates, language charts, character profiles and related printings add context without replacing source evidence.",
          "Owned Copy preserves natural card-image proportions, and pulled-from-sealed records the exact box, bundle, tin, blister, pack or collection while excluding outer multi-product cases and displays.",
        ],
      },
      {
        title: "Phone themes and controls",
        highlights: [
          "Collectors can choose appearance themes, accents, light/dark behavior and card density with settings that persist across the app.",
          "Mobile card actions, popups, market tiles and 3D motion were aligned with the desktop feature set and safe-area behavior.",
          "Card Scanner gained camera recognition, printed-number OCR, flashlight, live auto-selection and hands-free bulk capture before being paused behind a feature flag for further accuracy work.",
        ],
      },
      {
        title: "Selling and selection",
        highlights: [
          "Long-press selection on phone and desktop multi-select can send many owned cards to For Sale at once.",
          "Bulk pricing can use one total, one per-card price or the saved paid amount for each selected copy.",
          "For Sale gained a compact amber action, purchase-price prefill and expansion selection behavior matching the rest of Collection.",
        ],
      },
      {
        title: "Sealed and quota-safe history",
        highlights: [
          "Sealed prices and history refresh automatically through a dedicated daily lane with accurate gap detection and visible backlog totals.",
          "Quota work prioritizes current prices, reserves capacity for manual actions and stops exactly at reset instead of overrunning the next day.",
          "Sealed products joined Sudden Drops and value-driver detail with their own matching tiles and modal context.",
        ],
      },
    ],
  },
  {
    version: "3.7.0 – 3.7.9",
    releasedAt: "July 18 – 19, 2026",
    title: "Signal Radar v9 and trustworthy graded value",
    summary:
      "Predictions became measurable, graded cards stopped borrowing raw history and submitted cards received independent market recovery.",
    tone: "system",
    sections: [
      {
        title: "Measured predictions",
        highlights: [
          "Signal Radar v9 records every recommendation with its inputs, forecast horizon and later outcome so the system can be backtested instead of judged from screenshots.",
          "Calibration against thousands of historical predictions adjusted upside, scarcity and risk weights while protecting against future-data leakage.",
          "Market Score became the compact shared signal on Card Detail and search rather than multiple competing recommendation strips.",
        ],
      },
      {
        title: "Honest graded accounting",
        highlights: [
          "Graded cards returned to collection value drivers only when comparable graded history exists; raw history can no longer create a fake slab gain.",
          "Collection charts and value-driver totals compare graded-to-graded consistently and exclude unsupported premiums from raw market movement.",
        ],
      },
      {
        title: "Submitted-card resilience",
        highlights: [
          "Self-submitted cards refresh through an independent path with verified Near Mint market rules and safe scraper fallbacks.",
          "Sudden Drops ignores suspicious source jumps and keeps submitted-card failures from breaking the response parser.",
        ],
      },
    ],
  },
  {
    version: "3.6.0 – 3.6.24",
    releasedAt: "July 8 – 12, 2026",
    title: "Social collections and the first complete Signal Radar",
    summary:
      "Friends, live market drops and external catalyst research joined the app, backed by authentication, database and deployment hardening.",
    tone: "new",
    sections: [
      {
        title: "Friends and private access",
        highlights: [
          "Collectors can find friends, view their shared collection overview and exchange Full Access only after both accounts agree.",
          "Private totals, costs, notes and tags remain hidden from ordinary friend access, while featured cards and full collection browsing use familiar layouts.",
        ],
      },
      {
        title: "Sudden Drops",
        highlights: [
          "A rolling 24-hour feed records genuinely new CardMarket English drops, excludes suspicious listings and keeps completed refresh batches from changing the time window.",
          "Home and the dedicated Movers page share filters, direct card highlighting and a consistent fresh-drop definition.",
        ],
      },
      {
        title: "Signal Radar research",
        highlights: [
          "Radar combines raw and graded momentum, scarcity, set and event context, social catalysts and external evidence into focused candidate cards.",
          "Background research learns from stored outcomes over time, with lean source checks, confidence labels and an ultrawide dashboard for comparing candidates.",
        ],
      },
      {
        title: "Security and performance",
        highlights: [
          "Authentication, session cookies, password changes and rate limits were hardened, including revoking old sessions after a password change.",
          "Heavy catalog pages, binders and expansion history gained caching, safer deploy health checks and less repeated database work.",
        ],
      },
    ],
  },
  {
    version: "3.5.0 – 3.5.1",
    releasedAt: "June 28 – July 1, 2026",
    title: "Visible navigation progress and faster sets",
    summary:
      "Page changes stopped feeling frozen and expansion totals began reusing work that only changes after a price sync.",
    tone: "improved",
    sections: [
      {
        title: "Navigation feedback",
        highlights: [
          "A top progress indicator appears immediately when a link is opened and loading skeletons are easier to recognize.",
          "Signed-in user and settings data are shared inside a page render instead of being fetched repeatedly.",
        ],
      },
      {
        title: "Expansion caching",
        highlights: [
          "Pokémon and One Piece expansion totals and price-history calculations reuse short-lived cache entries, making repeat visits nearly instant.",
        ],
      },
    ],
  },
  {
    version: "3.4.0 – 3.4.8",
    releasedAt: "June 28, 2026",
    title: "Authentic PSA and Beckett slabs",
    summary:
      "Graded labels became one scale-safe system across tiles, Card Detail and the 3D viewer, with realistic grade-specific PSA and BGS treatments.",
    tone: "improved",
    sections: [
      {
        title: "One slab system",
        highlights: [
          "PSA, BGS and CGC labels render consistently at every size and reuse the same certificate identity in 2D and 3D.",
          "PSA labels gained realistic trim, security texture, holographic logo, barcode, QR and detailed slab backs.",
        ],
      },
      {
        title: "Beckett details",
        highlights: [
          "BGS labels switch between silver, gold and black treatments based on grade and subgrades.",
          "BGS 10 owners can choose Black Label or Gold Label, and both the front and back of the 3D slab follow the selected treatment.",
        ],
      },
    ],
  },
  {
    version: "3.3.0 – 3.3.9",
    releasedAt: "June 13 – 28, 2026",
    title: "Search, watch lists and non-blocking background sync",
    summary:
      "Core collection pages stayed responsive during database writes, price schedules became fairer and collectors gained better search and deal tracking.",
    tone: "new",
    sections: [
      {
        title: "Search and deal watch",
        highlights: [
          "Search remembers recent queries, filters Singles, Sealed and Sets, and sorts by match, price or newest release.",
          "eBay deals can be saved with price, discount, seller and ended state in a personal watch list.",
          "Settings gained one-click backups and a drill-down Data Quality Center for affected cards.",
        ],
      },
      {
        title: "Responsive database work",
        highlights: [
          "Write-ahead logging keeps page reads moving while prices are written, and restart cleanup unblocks orphaned sync jobs automatically.",
          "Refresh priority respects how overdue each card is, serves important history before commons and still refreshes common cards on a slower schedule.",
          "Mobile pull-to-refresh and cached sync status make manual refresh feel immediate without hammering the database.",
        ],
      },
      {
        title: "Accurate value drivers",
        highlights: [
          "Collection gains and drops use a true two-day window, exclude unsupported graded premiums and make the Net total equal the cards actually shown.",
        ],
      },
    ],
  },
  {
    version: "3.2.0 – 3.2.29",
    releasedAt: "May 22 – 28, 2026",
    title: "Submitted cards, selling and richer market context",
    summary:
      "Collectors gained a complete card-submission workflow, For Sale tracking, pull-rate data and denser phone market views.",
    tone: "new",
    sections: [
      {
        title: "Submit Card",
        highlights: [
          "Collectors can submit cards through Firecrawl-assisted preview, name suggestions, variant guards and visible credit usage.",
          "Server-side admin checks protect Firecrawl settings, while blocked optional catalog endpoints no longer fail an entire price batch.",
        ],
      },
      {
        title: "For Sale and Wants",
        highlights: [
          "Owned cards can be marked For Sale, assigned a sale price, marked sold and tracked separately from active listings.",
          "Vendor buy estimates and bulk sale quotes provide realistic alternatives to market value.",
          "Wants gained clearer hearts, add actions and navigation placement across phone and desktop.",
        ],
      },
      {
        title: "Market and pull-rate context",
        highlights: [
          "ThePriceDex imports booster and box EV, rarity odds and specific-card pull rates with Collectr/Collectrics-style fallbacks where available.",
          "Direct eBay searches replaced a redundant standalone navigation destination, and sealed/value-driver tiles open the correct product detail.",
          "Card Detail, grids, binders and market tiles received denser mobile layouts and more consistent quick actions.",
        ],
      },
    ],
  },
  {
    version: "3.0.0 – 3.1.18",
    releasedAt: "May 19 – 21, 2026",
    title: "The premium DustyCards interface",
    summary:
      "The collection, market and detail experience moved to one compact collector-focused design that works from phone to ultrawide desktop.",
    tone: "new",
    sections: [
      {
        title: "One visual system",
        highlights: [
          "Navigation, page headers, tabs, filters, cards, binders, modals and empty states were rebuilt into the current darker, image-led DustyCards design.",
          "Collection, Wants, Movers and expansions gained dashboard charts, clearer stat cards and consistent responsive spacing.",
          "Search, categories, illustrators, account and Settings use the same premium surfaces rather than separate early-app layouts.",
        ],
      },
      {
        title: "Mobile-first detail",
        highlights: [
          "Card Detail gained compact top actions, stable tabs, safer modals and a fullscreen 3D viewer with a collapsible information sheet.",
          "Phone grids support multiple cards per row, long-press information and image loading tuned for smaller screens.",
          "Featured cards open the same rich Card Detail context as collection tiles, including location, condition, notes, tags and grading information.",
        ],
      },
      {
        title: "Market workspace",
        highlights: [
          "The market structure introduced risers, drops, raw, graded, targets, sealed and deal views with shared charts and source controls.",
        ],
      },
    ],
  },
  {
    version: "2.0.0 – 2.1.17",
    releasedAt: "May 18, 2026",
    title: "Binders, graded cards and polished phone workflows",
    summary:
      "Binders and Wants became visual collection goals, while graded slabs and mobile detail controls became substantially more complete.",
    tone: "improved",
    sections: [
      {
        title: "Binders and Wants",
        highlights: [
          "Binder creation moved into a focused phone popup with linked-set suggestions and clearer Overall Spend language.",
          "Wants Quick View became a real safe-area modal with binder art, progress, search matches, sorting, price filters and direct add actions.",
          "Phone binder tiles use clearer essential metrics, while widescreen quick views scale to multi-column missing-card grids.",
        ],
      },
      {
        title: "Graded collection",
        highlights: [
          "BGS cards store subgrades and selected raw condition, with improved BGS and PSA slab previews in the 3D viewer.",
          "Graded detail actions, price-history language controls and slab backs were made consistent across phone and desktop.",
        ],
      },
      {
        title: "Phone density and controls",
        highlights: [
          "Collectors can save one-to-four-card phone layouts, while card actions, segmented tabs, hover information and 3D framing respect mobile safe areas.",
        ],
      },
    ],
  },
  {
    version: "1.0.3 – 1.1.0",
    releasedAt: "May 16 – 18, 2026",
    title: "Collection dashboard, Wants planner and app foundations",
    summary:
      "The first complete DustyCards workflows established collection dashboards, printed-number search, binder Wants, Settings and an in-app roadmap.",
    tone: "new",
    sections: [
      {
        title: "Collection and market dashboard",
        highlights: [
          "Collection, Wants and Movers received live charts, stat cards, game switching and a value breakdown for raw, graded and sealed items.",
          "Binder tiles added completion, missing count, recent movement and ROI, while card detail showed collection location and removable saved copies.",
        ],
      },
      {
        title: "Wants planner",
        highlights: [
          "Missing cards from linked set binders flow into Wants automatically and can be hidden until the collector resets them.",
          "Dedicated want-binder pages and quick views added number, price and name sorting plus priced/unpriced filters.",
        ],
      },
      {
        title: "Search and pricing foundations",
        highlights: [
          "Printed card numbers are stored separately from sync identifiers and searchable as exact, compact or spaced references.",
          "Price charts gained touch controls, shared refresh schedules and confidence context for thin or stale market data.",
        ],
      },
      {
        title: "Settings and updates",
        highlights: [
          "Settings was organized into Preferences, Collection, System and Sync areas with cleaner account and security controls.",
          "The in-app Updates section introduced patch notes and a roadmap so completed work and future priorities remain visible.",
        ],
      },
    ],
  },
];

export const roadmapItems: RoadmapItem[] = [
  {
    title: "Collection import and export",
    status: "Planned",
    summary:
      "Revisit CSV and pasted-list matching once a representative Collectr export is available for real-world validation.",
  },
];

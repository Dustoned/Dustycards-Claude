"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { Camera, ExternalLink, ScanSearch, Search, ShieldAlert } from "lucide-react";
import MarktplaatsCardDetailButton from "@/components/MarktplaatsCardDetailButton";
import HomeItemDetailProvider from "@/components/HomeItemDetailProvider";
import {
  collectionCardValue, summarizeCollection, PHOTO_VALUE_FACTORS,
  type CollectionCrop, type CollectionPhoto, type CollectionInspectionView,
  type InspectedCollectionCard,
} from "@/lib/marktplaats-collections";

const euro = (amount: number | null) => amount === null ? "Onbekend" : new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(amount);
const date = (value: string) => new Date(value).toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam", dateStyle: "short", timeStyle: "short" });
const border = "rounded-2xl border border-[var(--dc-border)] bg-[var(--dc-surface-primary)]";
const muted = "text-[var(--dc-text-muted)]";
const button = "min-h-11 rounded-xl border border-[var(--dc-border)] px-3 py-2 text-xs font-bold hover:border-[var(--dc-primary)] focus-visible:outline-2 focus-visible:outline-[var(--dc-primary)]";

export function CollectionPhotoCrop({ photo, crop, label }: { photo: CollectionPhoto; crop: CollectionCrop; label: string }) {
  return <div className="relative w-full overflow-hidden rounded-lg bg-black/30" style={{ aspectRatio: `${photo.width * crop.width} / ${photo.height * crop.height}` }}>
    <Image src={photo.url} alt={label} width={photo.width} height={photo.height} unoptimized
      referrerPolicy="no-referrer" loading="lazy"
      style={{ position: "absolute", maxWidth: "none", width: `${100 / crop.width}%`, height: "auto", left: `${-100 * crop.x / crop.width}%`, top: `${-100 * crop.y / crop.height}%` }} />
  </div>;
}

function InspectedCard({ card, inspection }: { card: InspectedCollectionCard; inspection: CollectionInspectionView }) {
  const [selected, setSelected] = useState(0);
  const zoom = useRef<HTMLDialogElement>(null);
  const crop = card.crops[selected];
  const photo = inspection.photos.find((item) => item.id === crop.photoId)!;
  const quote = inspection.catalog[card.cardId ?? ""];
  const value = collectionCardValue(card, quote);
  const side = { front: "Voorkant", back: "Achterkant", detail: "Detail" };
  return <article className={`${border} min-w-0 p-3`}>
    <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 sm:grid-cols-[108px_minmax(0,1fr)]">
      <div className="min-w-0">
        <button type="button" className="w-full" onClick={() => zoom.current?.showModal()} aria-label={`Vergroot uitsnede van ${card.label}`}>
          <CollectionPhotoCrop photo={photo} crop={crop} label={`${card.label} — ${side[crop.side]}, uitsnede uit advertentie`} />
        </button>
        {card.crops.length > 1 && <select aria-label={`Foto van ${card.label}`} value={selected} onChange={(event) => setSelected(Number(event.target.value))}
          className="mt-2 min-h-11 w-full rounded-lg border border-[var(--dc-border)] bg-[var(--dc-surface-primary)] text-xs">
          {card.crops.map((item, index) => <option key={index} value={index}>{side[item.side]} {index + 1}</option>)}
        </select>}
      </div>
      <div className="min-w-0 space-y-2">
        <h4 className="break-words text-sm font-black">{quote?.name ?? card.label}</h4>
        {quote && <p className={`text-xs ${muted}`}>{quote.expansion} · #{quote.number ?? "?"}</p>}
        <p className={`text-xs ${muted}`}>{card.language} · Identiteit {Math.round(card.identityConfidence * 100)}%</p>
        <p className="text-xs font-bold">{card.graded ? "Slab — niet als raw gewaardeerd" : card.duplicateOf ? "Zelfde kaart op andere foto — niet dubbel geteld" : `Foto-conditie: ${card.condition === "unknown" ? "onbekend" : card.condition} (${Math.round(card.conditionConfidence * 100)}%)`}</p>
        <p className={`break-words text-xs ${muted}`}>{card.conditionNotes || "Conditie is niet vast te stellen op deze foto's."}</p>
        <div className="border-t border-[var(--dc-border)] pt-2 text-xs">
          <p>App-referentie EN NM: <strong>{value.nm === null ? "Niet meegerekend" : euro(value.nm)}</strong></p>
          <p className="mt-1 font-bold text-[var(--dc-warning)]">Foto-inschatting: {value.low === null ? "niet vast te stellen" : `${euro(value.low)} – ${euro(value.high)}`}</p>
          {quote?.priceAt && <p className={`mt-1 text-[10px] ${muted}`}>Prijs opgeslagen: {date(quote.priceAt)}</p>}
        </div>
        {quote && <MarktplaatsCardDetailButton cardId={quote.id} label={`Bekijk ${quote.name} in DustyCards`} className={`${button} relative w-full`}>Kaart in onze app →</MarktplaatsCardDetailButton>}
      </div>
    </div>
    <p className={`mt-3 break-words text-xs ${muted}`}>{card.identityEvidence || "Printing nog niet bevestigd: naam, set, nummer en variant moeten leesbaar zijn."}</p>
    <dialog ref={zoom} aria-label={`Uitsnede ${card.label}`} className={`${border} fixed inset-0 m-auto max-h-[90dvh] w-[min(92vw,500px)] overflow-y-auto p-4 text-[var(--dc-text-primary)] backdrop:bg-black/80`}>
      <div className="mb-3 flex items-center justify-between gap-2"><h4 className="text-sm font-bold">{card.label} · {side[crop.side]}</h4><button type="button" className={button} onClick={() => zoom.current?.close()}>Sluiten</button></div>
      <CollectionPhotoCrop photo={photo} crop={crop} label={`${card.label} vergrote uitsnede`} />
      <a className={`${button} mt-3 block text-center`} href={photo.url} target="_blank" rel="noopener noreferrer">Originele foto openen ↗</a>
    </dialog>
  </article>;
}

function Inspection({ inspection, now }: { inspection: CollectionInspectionView; now: string }) {
  const summary = summarizeCollection(inspection);
  const [expanded, setExpanded] = useState(false);
  const [showAllCards, setShowAllCards] = useState(false);
  const stale = Date.parse(now) - Date.parse(inspection.observedAt) > 48 * 60 * 60 * 1_000;
  return <article className={`${border} overflow-hidden`}>
    <div className="p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-[var(--dc-warning)]">{summary.completePhotos ? "Fotoreeks gecontroleerd" : "Fotoanalyse onvolledig"}{stale ? " · oudere scan" : ""}</p>
          <h3 className="break-words text-base font-black">{inspection.title}</h3>
          <p className={`mt-1 text-xs ${muted}`}>Bekeken {date(inspection.observedAt)} · {inspection.externalId}</p>
        </div>
        <a className={`${button} inline-flex items-center gap-2`} href={inspection.listingUrl} target="_blank" rel="noopener noreferrer">Advertentie <ExternalLink size={14} /></a>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
        {[
          ["Vraagprijs", euro(inspection.askingPriceEur)],
          ["Hoogste zichtbaar bod", euro(inspection.highestBidEur)],
          ["EN NM-referentiesom", summary.referencedCards ? euro(summary.nmTotal) : "Nog niet bekend"],
          ["Geschatte deelsom", summary.estimatedCards ? `${euro(summary.low)} – ${euro(summary.high)}` : "Meer foto's nodig"],
        ].map(([label, value]) => <div className={`${border} min-w-0 px-3 py-2.5`} key={label}>
          <p className={`text-[10px] ${muted}`}>{label}</p><p className="mt-1 break-words text-sm font-black sm:text-base">{value}</p>
        </div>)}
      </div>
      <p className={`mt-3 text-xs leading-5 ${muted}`}>
        {inspection.bidCount === null ? "Aantal biedingen onbekend" : `${inspection.bidCount} biedingen`} · Min. bod {euro(inspection.minimumBidEur)} · Verzenden {euro(inspection.shippingEur)}.
        Een bod is geen koopprijs; controleer de actuele advertentie.
      </p>
      <p className={`mt-2 text-xs leading-5 ${muted}`}>
        {summary.inspectedPhotos}/{inspection.totalPhotos ?? "?"} foto’s bekeken · {summary.physicalCards} afzonderlijke kaarten · {summary.referencedCards} met EN NM-referentie · {summary.estimatedCards} met foto-inschatting.
        Onbekende kaarten, bulk, slabs en andere talen tellen niet mee. Dit is geen taxatie van de volledige collectie.
      </p>
      <button className={`${button} mt-4 w-full text-[var(--dc-warning)] sm:w-auto`} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
        {expanded ? "Analyse inklappen" : "Bekijk foto's & kaarten"} · {inspection.cards.length} uitsneden/kaarten
      </button>
    </div>
    {expanded && <div className="space-y-5 border-t border-[var(--dc-border)] p-4 sm:p-5">
      <div>
        <h4 className="mb-2 text-sm font-black">Alle advertentiefoto’s</h4>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {inspection.photos.map((photo, index) => <figure key={photo.id} className="w-40 shrink-0">
            <a href={photo.url} target="_blank" rel="noopener noreferrer">
              <span className="relative block h-28 w-40 overflow-hidden rounded-xl bg-black/20"><Image src={photo.url} alt={`Advertentiefoto ${index + 1}`} fill sizes="160px" unoptimized referrerPolicy="no-referrer" className="object-contain" /></span>
            </a>
            <figcaption className={`mt-1 text-xs ${muted}`}>Foto {index + 1} · {photo.inspected ? "bekeken" : "niet bekeken"}<br />{photo.notes}</figcaption>
          </figure>)}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {inspection.cards.slice(0, showAllCards ? undefined : 24).map((card) => <InspectedCard key={card.id} card={card} inspection={inspection} />)}
      </div>
      {inspection.cards.length > 24 && <button className={button} onClick={() => setShowAllCards(!showAllCards)}>{showAllCards ? "Toon eerste 24" : `Toon alle ${inspection.cards.length} kaarten`}</button>}
      {inspection.risks && <p className="rounded-xl border border-amber-300/20 bg-amber-400/5 p-3 text-xs leading-5"><ShieldAlert className="mr-2 inline" size={16} />{inspection.risks}</p>}
      <details className={`text-xs leading-5 ${muted}`}><summary className="cursor-pointer font-bold">Beschrijving & waarderingsmethode</summary>
        <p className="mt-2 whitespace-pre-wrap break-words">{inspection.description}</p>
        <p className="mt-3">De referentie is de laatst opgeslagen CardMarket EN NM-prijs in DustyCards, geen nieuwe scrape. Foto-inschattingen gebruiken onderstaande voorzichtige rekenfactoren; dit zijn aannames, geen gemeten prijzen per conditie. Geen slijtage zichtbaar betekent niet gegarandeerd NM. Authenticiteit, verborgen schade en verkoopbaarheid blijven onzeker.</p>
        <p className="mt-2">{Object.entries(PHOTO_VALUE_FACTORS).map(([condition, range]) => `${condition}: ${range[0] * 100}–${range[1] * 100}%`).join(" · ")} van NM.</p>
        <p className="mt-2">Minimaal 90% identiteitszekerheid, 75% conditiezekerheid en een gekoppelde voor- én achterkant nodig voor een schatting. Dezelfde fysieke kaart op meerdere foto’s telt één keer. Verzendkosten zijn apart.</p>
      </details>
    </div>}
  </article>;
}

export default function MarktplaatsCollectionsPanel({ inspections, now }: { inspections: CollectionInspectionView[]; now: string }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const normalized = query.trim().toLowerCase();
  const searched = inspections.filter((item) => `${item.title} ${item.cards.map((card) => `${card.label} ${item.catalog[card.cardId ?? ""]?.name ?? ""}`).join(" ")}`.toLowerCase().includes(normalized));
  const matches = (item: CollectionInspectionView, key: string) => key === "all" || (key === "bids" ? item.highestBidEur !== null : key === "complete" ? summarizeCollection(item).completePhotos : summarizeCollection(item).needsReview);
  const visible = searched.filter((item) => matches(item, filter));
  return <HomeItemDetailProvider><section className="space-y-4" aria-label="Pokémon collectieonderzoek">
    <header className={`${border} p-4 sm:p-5`}>
      <div className="flex items-center gap-3"><ScanSearch className="text-[var(--dc-warning)]" size={25} /><h2 className="text-lg font-black">Pokémon Collecties</h2></div>
      <p className={`mt-2 max-w-3xl text-sm leading-6 ${muted}`}>Je geplande Marktplaats-scan, uitgediept per collectie. Bekijk biedingen, alle beschikbare foto’s en iedere herkende of nog onbekende kaart naast onze eigen prijzen.</p>
      <p className={`mt-2 text-xs ${muted}`}>Geen scan bij het openen van deze tab. Biedingen en foto’s zijn een momentopname; prijzen komen uit de opgeslagen app-data.</p>
      <label className="mt-4 flex items-center gap-2 rounded-xl border border-[var(--dc-border)] px-3"><Search size={16} /><input type="search" aria-label="Zoek collecties of kaarten" placeholder="Zoek collectie of Pokémon…" value={query} onChange={(event) => setQuery(event.target.value)} className="min-h-11 min-w-0 flex-1 bg-transparent text-sm outline-none" /></label>
      <div className="mt-3 flex flex-wrap gap-2">
        {[["all", "Alles"], ["bids", "Met biedingen"], ["complete", "Foto's compleet"], ["review", "Verder controleren"]].map(([key, label]) => <button key={key} className={`${button} ${filter === key ? "bg-[var(--dc-primary)] text-white" : ""}`} aria-pressed={filter === key} onClick={() => setFilter(key)}>{label} ({searched.filter((item) => matches(item, key)).length})</button>)}
      </div>
    </header>
    <p className={`text-xs ${muted}`} role="status">{visible.length} collecties · maximaal 50 meest recent bekeken advertenties</p>
    {visible.map((item) => <Inspection key={item.externalId} inspection={item} now={now} />)}
    {!visible.length && <div className={`${border} p-8 text-center`}><Camera className="mx-auto mb-3 text-[var(--dc-warning)]" size={28} /><h3 className="font-black">{inspections.length ? "Geen collecties bij deze filters" : "Nog geen fotoanalyses geïmporteerd"}</h3><p className={`mt-2 text-sm ${muted}`}>{inspections.length ? "Pas je zoekterm aan of kies Alles." : "De geplande scan vult deze tab. De bestaande dealrapporten bevatten nog geen uitsneden of biedingen; die worden niet achteraf verzonnen."}</p></div>}
  </section></HomeItemDetailProvider>;
}

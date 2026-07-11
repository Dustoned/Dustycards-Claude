# DustyCards — visuele eindredactie met gevulde collectie

Deze controle is uitgevoerd op 1920×1080 met een geïsoleerde inspectiekopie van de
gevulde collectie: 1.076 kaarten, 7 binders, 3 sealed units en 153 wants. Er zijn 32
viewportscreenshots gemaakt. Er is geen import, prijsupdate of externe sync gestart.

De beelden staan in `screenshots-ui/final-audit-2026-07-11/` en zijn bewust
git-ignored.

## Totaaloordeel

De gedeelde app-shell, donkere visuele identiteit, Widescreen-hiërarchie en
kaartpresentatie voelen inmiddels als één product. Home, Expansions, Categories,
binder-table en Card Detail zijn de sterkste voorbeelden. De resterende winst zit
vooral in het comprimeren van uitzonderlijk lange beheer-/directorypagina’s en het
visueel gelijkmaken van Sealed Detail aan Card Detail.

## Implementatie na de eindredactie

De vier grootste visuele bevindingen zijn aansluitend uitgevoerd:

- Admin Users is omgebouwd naar een scrollbare gebruikerslijst met één geselecteerd
  detailpaneel. De gemeten pagina ging van circa 12.144 naar 1.308 px;
- Illustrators toont initieel 24 compacte horizontale cards met sticky filters en
  batches van 24. De gemeten pagina ging van circa 14.201 naar 1.957 px;
- Sealed Detail geeft de lange titel de volle middenkolom, plaatst quick actions
  eronder op gewone desktop en gebruikt een kleinere maximale titelmaat;
- Market toont zonder bruikbare historie een compacte uitlegstate in plaats van een
  grote lege chart.

De gerichte master-detail/progressive-disclosure smoke-test en de bestaande
type-, lint- en unitcontroles zijn groen.

## P1 — volgende concrete verbeteringen

### 1. Admin Users: van herhaalde formulieren naar master-detail

**Status: uitgevoerd.**

`28-account-users.png` is circa 12.144 px lang. Iedere gebruiker toont tegelijkertijd
role, disable en twee wachtwoordvelden. Hierdoor voelt de pagina als veertig open
formulieren in plaats van een beheerapp.

Aanpak:

- compacte tabel/rijen met naam, status, rol, collectie en laatste activiteit;
- één geselecteerde gebruiker in een rechterdrawer of detailpaneel;
- password reset alleen achter een expliciete secundaire actie;
- paginering of virtualisatie van 20–25 gebruikers;
- bulkfilters voor Active, Disabled en Admin.

### 2. Illustrators: progressive disclosure

**Status: uitgevoerd.**

`12-illustrators.png` is circa 14.201 px lang voor 561 illustrators. De filters zijn
goed, maar alle resultaten worden als grote visuele tegels onder elkaar opgebouwd.

Aanpak:

- start met één lettergroep en 24–36 resultaten;
- “Show more” per letter of paginering;
- compactere list/grid-density naast de huidige visuele cards;
- sticky zoek-/letterbalk tijdens scrollen;
- hoogte van de eerste tegelrij reduceren zodat identiteit en topkaart direct in het
  eerste viewport zichtbaar zijn.

### 3. Sealed Detail: titel en acties uit elkaar halen

**Status: uitgevoerd.**

`32-sealed-detail-modal.png` heeft inhoudelijk een goede driedeling, maar de lange
producttitel wordt door de drie quick actions tot vijf regels vernauwd. Card Detail
(`31-card-detail-modal.png`) heeft een duidelijkere titel-/actiehiërarchie.

Aanpak:

- tot circa 2200 px quick actions onder de titel plaatsen;
- titel maximaal circa 28–30 px op gewone desktop;
- Set, Paid en Type als rustige horizontale metadata houden;
- lege onderruimte benutten voor collection notes/quantity of de modal op desktop
  content-height laten volgen;
- dezelfde back-, action- en surfacehiërarchie als Card Detail gebruiken.

### 4. Lege grafiekzones compact maken

**Status: uitgevoerd voor de gedeelde Market-header; Home en Wants behouden hun
chart zodra bruikbare geschiedenis beschikbaar is.**

Home Value Drivers, Wants-history en enkele Market scopes reserveren een grote
grafiekzone wanneer weinig of geen geschiedenis beschikbaar is.

Aanpak:

- bij onvoldoende historie een compacte KPI/empty-state van 120–180 px;
- pas de volledige chartverhouding tonen zodra er een bruikbare reeks is;
- uitleg en eerstvolgende actie direct in dezelfde compacte state.

## P2 — polish

- Complete Collection is inhoudelijk sterk maar zeer dicht. Voeg een sticky
  sectiesprong toe voor Binders, Loose, Sealed en Graded.
- Search progressive disclosure werkt; maak Add/Want op desktop eventueel pas bij
  hover/focus prominent om de grid rustiger te maken.
- Sync is functioneel compleet maar admin-dicht. Een sticky statusoverzicht en
  inklapbare “manual tools” maken het sneller scanbaar.
- Market kan een compacte empty-chartvariant gebruiken en de actieve scope sterker
  in de paginatitel tonen.
- Social zonder geselecteerde vriend is correct compact; een korte CTA naar zoeken
  of uitnodigen kan de eerste stap nog duidelijker maken.

## Wat behouden moet blijven

- één gedeelde Widescreen-canvas voor headers, toolbars en kaartgrids;
- Home: chart links, KPI’s rechts en featured cards als visuele afsluiting;
- Expansions en Categories als voorbeeld voor rustige informatiehiërarchie;
- binder-table voor financiële vergelijking en binder-grid voor visueel beheer;
- Card Detail als referentie voor toekomstige detailpagina’s;
- 44 px mobiele controls, scrollbare tabs en de compacte tablet-header.

## Screenshotindex

- `01–07`: Home en alle collectie-tabs;
- `08–19`: Wants, browse, search, markt, Deals en Social;
- `20–25`: alle Settings-tabs;
- `26–28`: alle Account-tabs;
- `29–30`: binder grid en table;
- `31`: Card Detail;
- `32`: Sealed Detail.

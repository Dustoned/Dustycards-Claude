# DustyCards UI-roadmap — 11 juli 2026

Deze roadmap is gebaseerd op een echte walkthrough van de lokaal draaiende app met
een gevulde inspectiecollectie: 1.076 kaartitems, 7 binders, 3 sealed units en 153
wants. Er zijn geen prijs-, catalogus-, Firecrawl- of andere externe synchronisaties
gestart; de bestaande lokale data is bewust als visuele testdata gebruikt.

## Auditstatus en hervatpunt

De hoofdflows zijn visueel gecontroleerd op:

- 5120×1440 ultrawide, met **Widescreen uit én aan**;
- 1920×1080 desktop;
- 390×844 en 360×800 mobiel;
- de kritieke grenzen 767/768 en 1279/1280 px;
- tabel- én gridweergave waar beide bestaan;
- kaart- en sealed-detailmodals;
- mobiele zoek- en More-states.

De auditbeelden staan lokaal in `screenshots-ui/audit-2026-07-11/`. Die map is
bewust git-ignored. De eerste implementatiewave is na deze audit gestart met de
tablet-navigatie en bottom-safe-area.

De latere visuele eindredactie met de gevulde inspectiecollectie en 32 actuele
1920×1080-opnames staat in `docs/ui-final-visual-audit-2026-07-11.md`.

### Implementatiecheckpoint — 11 juli 2026

De volgende onderdelen zijn direct na de audit uitgevoerd en getest:

- compacte hoofdnavigatie toegevoegd voor 768–1279 px;
- bottom-nav-clearance gelijkgetrokken met het volledige bereik tot en met 767 px,
  ook voor Settings en andere pagina’s zonder gewone page-container;
- Widescreen-header- en insightzones begrensd houden op een rustig canvas;
- kaartgalerijen gebruiken op ultrawide de volledige gedeelde UI-canvas, maar breken
  niet langer buiten header, toolbar of paginashell; tabellen blijven begrensd;
- de medium Widescreen-kaartgrid teruggebracht van 20 naar 12 kolommen op het
  geteste scherm;
- Home toont op echte ultrawide twee inzichtpanelen naast elkaar in plaats van
  twee volledige horizontale stroken;
- regressietests toegevoegd voor 767/768/1024/1279/1280 en voor de begrensde
  Widescreen-canvas.

De browsercontrole na implementatie bevestigt dat de begrensde headerzone rustig
blijft, terwijl kaartgalerijen de resterende ultrawide-appbreedte kunnen gebruiken
zonder horizontale pagina-overflow. Dit is de afgeronde eerste basis; de
route-specifieke rechterrails en extra insight-panels uit Wave 2 zijn nog vervolgwerk.

### Implementatiecheckpoint 2 — appwaardige basis

De tweede implementatiewave verwerkt de belangrijkste P0/P1-bevindingen:

- het mobiele responsive contract loopt nu consequent tot en met 767 px;
- mobiele toolbars, segmentknoppen, tabs en belangrijke acties hebben grotere
  touchzones en gebruiken minder geneste panelen;
- Settings- en Accounttabs ondersteunen pijltjestoetsen, Home/End en horizontaal
  scrollen op kleine schermen;
- pinch-zoom is hersteld en kaart- en sealed-modals delen Escape-, focus-trap- en
  focus-returngedrag;
- Login → Register → Verify → Login behoudt nu de oorspronkelijke bestemming en
  een verlopen verificatielink biedt direct herstel met e-mailadres;
- lege collecties openen met een korte quick-start in plaats van grafieken en zes
  nulstatistieken; collectie en sealed gebruiken herbruikbare actiegerichte
  empty-states;
- adminwijzigingen met sessie- of toegangsgevolgen vragen nu expliciete bevestiging
  en accountacties tonen netwerkfouten en voortgang;
- Light/System zijn uit de voorkeuren gehaald zolang de app technisch alleen dark
  ondersteunt;
- Account, foutpagina en Submit Card gebruiken de readable Widescreen-zone.

De lokale database is hierbij niet gemigreerd en er is geen import, prijsupdate of
externe synchronisatie uitgevoerd.

### Vervolgonderzoek — compact checkpoint

Om Codex-gebruik te beperken is de tweede auditronde na de belangrijkste nieuwe
bevindingen gestopt. Er is geen nieuwe brede routecrawl gedaan. Wel zijn de volgende
states met de gevulde inspectiekopie gecontroleerd:

- **320×720 Home:** geen horizontale overflow, maar chart en nul-/statistiekblokken
  nemen het eerste scherm volledig over; veel acties blijven 28–32 px.
- **320×720 binder:** de 3-kolomsgrid blijft bruikbaar met kaarttracks van circa
  95 px. De tabel/listweergave maakte dezelfde pagina circa 8.455 px lang tegenover
  circa 3.986 px in grid. Grid is daarom de logischere mobiele standaard voor grote
  binders; Table blijft een bewuste detailstand.
- **Filters op 320 px:** functioneel compleet, maar opnieuw panel-in-panel en
  quick-filterknoppen van circa 31 px. De toolbar wordt visueel de hoofdinhoud.
- **Selectiemodus op 320 px:** acties breken netjes over twee regels, maar alle
  knoppen zijn slechts circa 26 px hoog. Disabled `Bulk add` blijft paars ogen en
  concurreert daardoor met de geldige actie `Done`.
- **667×375 landscape:** bevestigt het hybride breakpoint. De bottom-nav is nog
  zichtbaar, terwijl Widescreen en de desktop UI-scale al actief zijn.
- **844×390 landscape:** de nieuwe compacte headernavigatie werkt zonder overflow,
  maar header plus chart laten weinig taakruimte over in de lage viewport.

Aanvullende code-audit van auth, account en first-run:

- **P0 verificatieherstel:** `verify=invalid` zegt dat een nieuwe e-mail kan worden
  aangevraagd, maar biedt zonder bekend e-mailadres geen resendactie. Maak een
  zelfstandige expired/invalid-state met e-mailinvoer en resend.
- **P0 deep-linkbehoud:** `next` blijft niet behouden via Login → Register → Verify →
  Login. Bewaar de oorspronkelijke bestemming door de hele flow.
- **P1 echte first-run:** bij een lege collectie renderen chart en zes nulstatcards
  vóór de CTA. Vervang die toestand door een korte quick-start: kaart zoeken,
  binder maken, sealed toevoegen of lokaal importeren.
- **P1 accountveiligheid:** disable, role-change en admin password reset missen een
  bevestiging terwijl ze sessies kunnen beëindigen. Toon gebruiker, gevolg en een
  expliciete confirm; netwerkfouten moeten zichtbaar zijn.
- **P1 toegankelijkheid:** authfouten missen live-regions/veldrelaties, accounttabs
  missen volledige toetsenbordbediening en globale pinch-zoom staat uit.
- **P2 AuthShell:** login/register/reset zijn op ultrawide een kleine losse kaart.
  Gebruik een gedeelde readable form-zone met productcontext op desktop en een
  keyboardvriendelijke, boven uitgelijnde mobiele variant.

Bewijsbeelden van deze compacte ronde staan in
`screenshots-ui/audit-2026-07-11-continuation/` en blijven git-ignored.

### Opgeloste lokale testbeperking

De twee ontbrekende lokale migraties (`add_card_performance_indexes` en
`add_price_changed_at`) zijn na een databaseback-up toegepast. Prisma bevestigt dat
alle 38 migraties nu aanwezig zijn. Expansion Cards, One Piece-details en Sudden
Drops zijn daardoor niet langer geblokkeerd door de lokale schema-state. Hiervoor is
geen externe of betaalde synchronisatie gestart.

## Executive summary

DustyCards heeft al een sterke visuele basis. Op 1920×1080 voelen de sidebar,
dashboardheaders, kaartgrids, prijsgrafieken en de mobiele kaartmodal grotendeels als
één product. De grootste kwaliteitswinst zit niet in een volledige redesign, maar in
het afmaken van het responsive systeem en het terugbrengen van visuele drukte.

De drie belangrijkste conclusies uit de audit, met de huidige implementatiestatus:

1. **Het navigatiegat op tablet/compact desktop was P0 en is opgelost.** Van 768
   tot en met 1279 px is nu compacte hoofdnavigatie aanwezig.
2. **Widescreen blijft en is nu begrensd, maar kan nog rijker worden.** Canvas,
   galerij, tabellen en Home-insights zijn verbeterd; route-specifieke inspectors
   en extra informatiepanelen blijven vervolgwerk.
3. **Mobiele ergonomie is sterk verbeterd.** Het 767px-contract, grotere bediening,
   scrollbare tabs, rustiger More-menu en pinch-zoom staan; zeer compacte metadata
   en enkele route-specifieke acties vragen nog een laatste polishronde.

## Wat al goed werkt

- De donkere visuele identiteit is herkenbaar en consistent.
- 1920×1080 gebruikt de beschikbare ruimte meestal goed.
- De collectie- en bindergrids zijn snel scanbaar en beeldgedreven.
- De mobiele drie-kolomsgrid past op 360 en 390 px zonder pagina-overflow.
- De mobiele kaartmodal is een van de beste schermen: duidelijke hiërarchie,
  grote kaartafbeelding en logische tabs.
- Dashboardgrafieken en kernstatistieken maken waarde en voortgang snel zichtbaar.
- De desktop-sidebar geeft collectie-, browse- en marktfuncties een duidelijke
  informatiearchitectuur.
- Loading, empty states en foutpagina’s hebben al een gedeelde visuele taal.

## Resolutiebeeld

| Bereik | Huidige ervaring | Oordeel |
| --- | --- | --- |
| 360–390 px | Bottom-nav, sterke kaartgrid, grotere controls en scrollbare tabs | Goed fundament; compacte metadata blijft aandachtspunt |
| 641–767 px | Consequente mobiele instellingen en bottom-nav | Breakpointcontract hersteld |
| 768–1279 px | Compacte hoofdnavigatie tussen mobiel en sidebar | P0 opgelost |
| 1280–1920 px | Volledige sidebar en begrensde content | Beste huidige ervaring |
| 5120×1440, Widescreen uit | Ongeveer 1600 px content in een zeer breed scherm | Leesbaar, maar een klein eiland met veel lege ruimte |
| 5120×1440, Widescreen aan | Vrijwel volle resterende breedte | Meer zichtbaar, maar te vlak, te dicht en moeilijk scanbaar |

Op het geteste 5120×1440-scherm rapporteerde de browser circa 4096 CSS-pixels
breedte door de Windows-schaalfactor. De screenshots zijn daarom representatief voor
de daadwerkelijke clientruimte op die monitor, niet alleen een theoretische viewport.

## Geprioriteerde bevindingen

### P0 — eerst oplossen

#### 1. Primair navigatiegat van 768–1279 px

`MobileBottomNav` verdwijnt vanaf `md`, terwijl `DesktopSidebar` pas vanaf `xl`
verschijnt. Op 768, 1024 en 1279 px is daardoor alleen het logo en zoeken aanwezig.
Op 1280 px verschijnt de sidebar abrupt.

Aanpak:

- gebruik de bestaande `HeaderNav` als compact desktop/tabletmodel;
- hanteer één bron voor de drie navigatiestates: phone, compact, sidebar;
- voeg boundary-tests toe op 767/768 en 1279/1280.

Bewijs:

- `767x900-home-clip.png`
- `768x900-home-clip.png`
- `1279x900-home-clip.png`
- `1280x900-home-clip.png`

#### 2. Breakpointcontract en bottom-safe-area lopen uiteen

Mobiele instellingen en globale padding wisselen bij 640 px, terwijl navigatie en
veel componenten bij 768 px wisselen. De bottom-nav is tot 767 px zichtbaar, maar de
algemene onderruimte geldt niet overal en niet in het hele bereik. Settings gebruikt
bovendien geen gewone `.page-container`.

Aanpak:

- leg één responsive contract vast;
- geef de authenticated app-shell de safe-area, niet losse pagina’s;
- test 640/641 en 767/768 met lange Settings-, Wants- en detailpagina’s.

#### 3. Lokale schema/runtime-blokkade

De ontbrekende `Price.changed_at`-migratie maakt belangrijke detailflows niet
bruikbaar. Voor een betrouwbare UI-regressieronde moet de app en database eerst op
dezelfde migratieversie staan.

Aanpak:

- maak migratiestatus onderdeel van `/api/health` en de lokale startcheck;
- toon in development een specifieke schemafout in plaats van alleen “Something
  went wrong”;
- pas pas daarna de Cards-tab van expansion-details opnieuw visueel aan.

**Status:** opgelost. Voor de migratie is een lokale back-up gemaakt en de volledige
expansion/3D-smoke draait weer.

### P1 — grootste zichtbare kwaliteitswinst

#### 4. Widescreen als informatierijke werkruimte

De Widescreen-switch is waardevol en blijft bestaan. Het probleem is de binaire
uitwerking:

- uit: de standaardcanvas is circa 1600 px en laat veel ruimte ongebruikt;
- aan: de hele resterende breedte wordt vrijgegeven;
- medium kaartgrid: 9 kolommen uit versus 20 kolommen aan;
- charts worden extreem breed en relatief plat;
- tabellen krijgen meters afstand tussen inhoudelijk gekoppelde kolommen.

Gewenst model met drie contentzones:

1. **Readable zone** — teksten, formulieren en account/settings rond 1200–1600 px.
2. **Dashboard zone** — grafiek + stats + insights naast elkaar, circa 2200–2600 px.
3. **Gallery zone** — kaart-/setgrids tot circa 2600–3000 px, met maximaal 12–14
   leesbare mediumkolommen.

Gebruik de extra ruimte voor méér inhoud:

- Home: hoofdgrafiek, value drivers en market alerts naast elkaar;
- binder/expansion: grid plus een sticky filter-/selectie-inspector;
- markt: lijst plus vergelijkings- of signaaldetailrail;
- collectie: grid plus allocation/top-sets/filters in een rechterrail;
- tabellen: sticky kaartkolom en compacte gegroepeerde financiële kolommen.

Niet doen: één chart, tabel of rij simpelweg naar 4000+ CSS-pixels rekken.

Bewijs:

- `5120x1440-home.png`
- `5120x1440-home-widescreen-on.png`
- `5120x1440-binder-detail-grid-widescreen-off.png`
- `5120x1440-binder-detail-grid-widescreen-on.png`

#### 5. Grids: goede basis, begrens het informatieniveau

1920×1080 met 8–9 kolommen is de sterkste desktopgrid. Op 360/390 px werken drie
kolommen nog goed voor beeld, naam en prijs. De problemen zitten in extremen:

- 20 ultrawide kolommen maken namen en prijzen onleesbaar;
- mobiele plus/min-acties zijn te klein;
- metadata en P&L concurreren op zeer smalle kaarten;
- incomplete rijen blijven hard links uitgelijnd en laten een groot leeg vlak achter.

Aanpak:

- cap kolommen per size-preset;
- centreer of verbreed een korte laatste/incomplete rij;
- houd op mobiel de hele kaart klikbaar en acties minimaal 44×44 px;
- geef de mobiele gebruiker een rustige 2-koloms- en compacte 3-kolomskeuze;
- maak metadata per density-preset expliciet in plaats van alles kleiner te schalen.

Bewijs:

- `1920x1080-binder-detail-grid.png`
- `390x844-binder-detail-grid-cards.png`
- `360x800-binder-grid-cards.png`
- `390x844-wants-binder-detail-grid-cards.png`

#### 6. Touch-targets, tekst en zoom

Veel interacties zijn kleiner dan een appwaardige 40–44 px:

- collectie- en toolbarsegmenten 28–32 px;
- kaart- en zoekresultaatacties 24–28 px;
- taal-, periode- en modalcontrols vaak rond 26–32 px;
- honderden labels/metadataregels gebruiken 8–11 px;
- pinch-zoom is uitgeschakeld via de viewportconfiguratie.

Aanpak:

- minimale hitbox 44×44 px, ook als het icoon 16 px blijft;
- informatieve tekst normaal minimaal 11–12 px;
- pinch-zoom weer toestaan;
- contrast van `white/30–40` tekst verhogen voor essentiële metadata.

#### 7. Te veel card-in-card en zware toolbars

Veel regio’s bestaan uit een paneel, een subpaneel en daarin opnieuw pills/tegels.
Dat is vooral druk op Home, toolbar-heavy card browsers, Settings en het mobiele
More-menu.

Aanpak:

- één surface per functionele regio;
- subtiele separators voor secundaire groepen;
- minder gelijktijdige borders, shadows en afgeronde containers;
- de belangrijkste actie één duidelijk accent, secundair neutraler.

#### 8. Mobiele tabs en More-menu

Settings toont zes tabs in één rij met zeer kleine labels. Het More-menu bevat 17
bestemmingen in meerdere geneste panels en individuele bordered rows. Functioneel
compleet, maar visueel zwaar.

Aanpak:

- maximaal vier directe tabs; daarna horizontaal scrollen, een dropdown of
  hiërarchisch sectiemenu;
- More als één sheet met eenvoudige groepskoppen, niet iedere link in een eigen
  kaart-in-kaart;
- bovenaan recent/favoriet en account; lange beheerfuncties lager of inklapbaar;
- close-buttons altijd een toegankelijke naam geven.

Bewijs:

- `390x844-settings.png`
- `390x844-settings-sync.png`
- `390x844-mobile-more-menu.png`

#### 9. Modals zijn inhoudelijk sterk maar inconsistent

De kaartmodal is op desktop en mobiel sterk. De sealed-modal gebruikt een ander
shellmodel en heeft meer visuele problemen:

- desktop: lange producttitel breekt in drie regels;
- compacte stattiles knippen “Set”, “Paid” en “Type” af;
- veel ongebruikte verticale ruimte;
- mobiel: meerdere geneste randen en een afgekapt setlabel;
- Escape sluit kaart- en sealed-modal niet;
- focus trap en consistente initiële focus ontbreken;
- de mobiele sealed-closebutton heeft geen bruikbare toegankelijke naam.

Aanpak:

- één gedeelde modal-shell en `useModalA11y`;
- Escape, focus trap, focus return en gelabelde close/back;
- gedeelde header/actionbar;
- lange producttitels en metric cards responsief laten herverdelen.

Bewijs:

- `1920x1080-card-modal-mega-gengar-loaded.png`
- `390x844-card-modal-mega-gengar.png`
- `1920x1080-sealed-modal.png`
- `390x844-sealed-modal.png`

#### 10. Paginabreedtes en componentgedrag zijn niet uniform

Standaardpagina’s, Account, Submit Card, Illustrators en modals hanteren verschillende
caps. De Widescreen-override negeert sommige lokale caps met `!important`. UI Scale
schaalt headers en panels, maar niet consequent sidebar, bottom-nav en controls.

Aanpak:

- expliciete page-shellvarianten: readable, dashboard en gallery;
- caps via componentprops/tokens, niet class-substring-overrides;
- één schaalset voor spacing, typografie, sidebar, nav, cards en modals.

#### 11. Theme-instelling is misleidend

Settings biedt Light, Dark en System, maar de huidige provider forceert dark. Bouw de
drie keuzes echt of bied voorlopig alleen Dark aan.

### P2 — polish en producthelderheid

- Search toont zeer lange pagina’s (op mobiel ruim 11.000 px voor “pikachu”); gebruik
  progressive disclosure per sectie en een duidelijke “toon meer”.
- Social toont op mobiel een groot leeg detailpaneel wanneer niemand is geselecteerd;
  vervang dit door één compacte empty-state/CTA.
- For Sale is met de huidige data een echte lege state; voeg een duidelijke route
  vanuit een kaartactie toe en leg uit hoe kaarten hier terechtkomen.
- `/deals` bestaat, maar staat niet in desktop- of mobiele navigatie. Beslis of dit
  een productflow is of een interne deep link.
- Engelse en Nederlandse strings zijn gemengd.
- Expansion- en setoverzichten kunnen korte/incomplete rijen beter verdelen.
- Loading-skeletons zijn visueel netjes, maar development compile-tijd mag niet als
  productieperformance worden geïnterpreteerd.

## Uitvoeringsroadmap

### Wave 0 — runtime betrouwbaar maken

- Lokale migratiestatus herstellen/zichtbaar maken.
- Een gevulde, geïsoleerde UI-auditseed toevoegen.
- Geen screenshottool meer laten upserten in de live gebruikersdatabase.
- Route-smoke voor expansion Cards, One Piece-detail en Sudden Drops.

**Done wanneer:** de volledige routecheck zonder generieke foutpagina draait en geen
betaalde/externe sync nodig heeft.

**Status:** lokaal uitgevoerd. Er is eerst een databaseback-up gemaakt, beide
openstaande migraties zijn toegepast en de schema- en expansion-smokes zijn groen.

### Wave 1 — responsive fundament

- Compacte navigatie voor 768–1279 px.
- Eén breakpointcontract.
- App-shell bottom-safe-area voor alle pagina’s.
- Tests op 640/641, 767/768 en 1279/1280.

**Done wanneer:** ieder bereik primaire navigatie heeft en geen content onder de
bottom-nav eindigt.

**Status:** uitgevoerd en geautomatiseerd afgedekt op de belangrijkste boundaries.

### Wave 2 — Widescreen workspace v2

- Widescreen-switch behouden.
- Readable/dashboard/gallery page-shells toevoegen.
- Dashboardzone circa 2200–2600 px; galleryzone circa 2600–3000 px.
- Gridkolommen per kaartsize begrenzen, medium maximaal circa 12–14.
- Charts niet onbeperkt rekken; benut restbreedte voor insights/vergelijking.
- Tabellen groeperen, sticky kernkolommen en leesbare maxima geven.

**Done wanneer:** 5120 aantoonbaar meer informatie toont dan 1920, maar namen,
prijzen en kolomrelaties zonder extreem oogreizen leesbaar blijven.

**Status:** gestart. De globale canvas-, grid- en tabelbegrenzing en de dubbele
Home-insightzone zijn uitgevoerd. Kaartgalerijen gebruiken op Widescreen dezelfde
brede canvas als header en toolbar, zonder daarbuiten te steken. Route-specifieke
sidebars/inspectors blijven een mogelijke productuitbreiding.

### Wave 3 — mobiele ergonomie

- 44×44 hitboxes.
- Tekst/contrast minimums.
- Pinch-zoom herstellen.
- Tabs en More-menu vereenvoudigen.
- 2- en 3-koloms density-presets expliciet maken.

**Done wanneer:** 360×800 en 390×844 zonder microscopische acties bruikbaar zijn.

**Status:** uitgevoerd voor het gedeelde systeem. Breakpoints, hoofdcontrols, tabs,
More-menu, Search-resultaten, gridacties, modalcontrols en pinch-zoom zijn aangepast.

### Wave 4 — modal- en interactiesysteem

- Gedeelde modal-shell en toegankelijkheidshook.
- Card/sealed visueel gelijk trekken.
- Lange titels, metrics en actionbars responsief maken.
- Inline errors en loading states standaardiseren.

**Done wanneer:** alle modals met toetsenbord en touch werken en dezelfde patronen
gebruiken.

**Status:** uitgevoerd voor kaart-, sealed- en admin-confirmatiemodals. De sealed
header, lange titel, metrics en quick actions zijn daarnaast responsief opgeschoond.

### Wave 5 — visueel systeem opschonen

- Surface-, radius-, spacing- en elevationschaal vastleggen.
- Legacy globale class-substring-overrides afbouwen.
- Functionele hiërarchie boven decoratieve card-in-card styling zetten.
- Themekeuze eerlijk maken.

**Done wanneer:** nieuwe schermen zonder lokale CSS-correctieblokken aan het systeem
kunnen worden toegevoegd.

**Status:** grotendeels uitgevoerd. De themakeuze is eerlijk gemaakt, mobiele geneste
surfaces zijn verminderd, Search gebruikt progressive disclosure, Social vermijdt een
leeg mobiel detailpaneel en For Sale legt de eerste stap duidelijk uit.

### Wave 6 — professionele regressiematrix

Automatische screenshots en asserts op:

- 360×800, 390×844;
- 640/641 en 767/768;
- 1024×768;
- 1279/1280;
- 1920×1080;
- 5120×1440, Widescreen uit én aan;
- tabel én grid;
- kaart/sealed-modals en open mobile menus.

Naast overflow ook controleren: navigatie aanwezig, bottom-safe-area, aantal
gridkolommen, touch-targets, chartverhouding en visuele diffs.

**Status:** de geautomatiseerde functionele matrix dekt 360/390, 767/768,
1024, 1279/1280, 1440, 1920 en 5120, inclusief grid, kaartmodal, 3D-viewer,
mobiele menu’s en Widescreen. Visuele pixel-diffs blijven optioneel vervolgwerk.

## Optionele productbacklog na deze implementatie

1. Bepalen welke extra inspector Home, binders en markt op ultrawide inhoudelijk
   waardevol genoeg maakt; de kaartgrid gebruikt de breedte inmiddels volledig.
2. Beslissen of Deals een volwaardige navigatiebestemming wordt.
3. Alleen als Light/System echt gebouwd worden de themakeuze opnieuw tonen.
4. Een opgeslagen visuele baseline toevoegen voor pixel-diffs naast de bestaande
   functionele responsive asserts.

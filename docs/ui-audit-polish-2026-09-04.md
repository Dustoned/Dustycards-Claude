# UI-audit en verbeteringen — 4 september 2026

Deze ronde volgt op de account- en collectie-audit in PR #95. De wijzigingen zijn lokaal gecontroleerd met een gemigreerde testdatabase. Er is niet naar productie gedeployd.

## Concrete verbeteringen

| Onderdeel | Bevinding en wijziging |
| --- | --- |
| Home: 19 widgets | Instellingen hadden tikvlakken van 24–36 px, afgekorte uitleg en veel herhaalde tekst. Knoppen zijn nu minstens 44 px, uitleg loopt door en een zoekveld vindt een widget direct. De uitleg benoemt dat breedte op grote desktops geldt. |
| Instellingen opslaan | Een mislukte account-save werd stil vergeten. De laatste mislukte wijziging blijft nu beschikbaar voor opnieuw proberen; nieuwere wijzigingen hebben voorrang. Foutmelding en retry staan ook binnen het customizervenster. Bij herstel van de verbinding wordt opnieuw geprobeerd. |
| Home-kaart openen | Featured Cards reageerde bij HTTP-fouten stil en bij netwerk-/JSON-fouten met een onbehandelde fout. Er verschijnt nu een melding; opnieuw op de kaart klikken probeert het opnieuw. |
| Widgetnavigatie en teksten | Losse aantallen als link zijn vervangen door duidelijke View all-links. Gradingwinst wordt als schatting aangeduid; onbevestigde releases worden zo genoemd. For Sale telt vraagprijzen en vervangende marktprijzen op en benoemt dat nu correct. |
| Kaartdetails | Ongeveer twintig teksten ingekort, onder meer News and research, Tournament evidence en Past prediction results. Geen interne modelversie in de Forecast-intro. Ranges, onzekerheid en waarschuwingen blijven behouden. |
| Collectie in kaartdetails | Een niet-bezette kaart toont geen fictieve Singles-locatie. Ontbrekende aankoopprijs wordt correct benoemd. De collectiesamenvatting opent de Collection-tab op desktop én mobiel. |
| Vensters | Alleen het bovenste venster verwerkt Escape/Tab. Focus gaat naar het formulier en terug naar de juiste knop, ook bij een mobiele knop buiten de parent-dialog. Add/Edit/Sealed/Binder/customizer gebruiken de gedeelde afhandeling; sluitknoppen zijn 44 px. |
| Binderkeuze | Een laadfout wordt getoond met Retry; een bestaande binderselectie blijft behouden. |
| Account | MFA-, wachtwoord- en logoutfeedback staan bij de juiste actie. Herstelcodes zijn te kopiëren en downloaden en blijven bij tabwissels behouden. Onbevestigd opgeslagen codes krijgen een vertrekwaarschuwing. |
| Verificatiemail | Opnieuw versturen gebruikt het actuele e-mailadres dat op het scherm staat. |
| Licht thema | Save password gebruikt de themakleuren met gecontroleerd tekstcontrast van minstens 4,5:1. |
| Mobiele resultaten | Trade center is optioneel open te klappen. Sales/Market-overzichten zijn mobiel inklapbaar. Lege Wants toont geen grote nulstatistieken. |
| Navigatie en toolbar | Collectie-subpagina's houden Collection actief, met voorrang voor eigen snelkoppelingen. Sectienamen worden niet afgekapt. View/Size staat mobiel onder Display; sorteren blijft direct bereikbaar. |
| Settings | Alle zeven secties zijn mobiel direct te kiezen. De drie Sync-subtabs hebben grotere knoppen en pijltjes/Home/End-bediening. Binder Watch vermeldt euro's en de inclusieve minimumgrens. |
| Overige pagina's | Directe binder-aanmaak in de lege toestand; rustigere lege Openings-pagina; technische previewquota ingeklapt bij Submit Card; duidelijkere Social-statussen en grotere acties. |

## Gemeten effect

Met dezelfde lokale reviewcollectie op 390 px staat zoeken bij For Sale nu op circa **502 px**, tegenover circa **1.529 px** in de eerste review. Bij lege Wants staat zoeken op circa **168 px**, tegenover circa **750 px**. Dit zijn layoutmetingen met testdata, geen live datameting.

## Dekking

- 37 routes opnieuw vastgelegd op 1440 en 390 px: 74 paginaweergaven, zonder horizontale pagina-overflow of JavaScriptfouten.
- 50 aanvullende tabweergaven: de zes kaartdetailtabs vanuit zoeken en Signal Radar, zeven Settings-secties, drie accounttabs en drie Sync-subtabs, op desktop en mobiel.
- Aanvullende controles op 360, 768 en 1920 px en in het lichte thema.
- Alle 19 Home-widgetinstellingen op 390 en 1440 px: tonen/verbergen, in-/uitklappen, formaat waar beschikbaar, lijstweergave waar beschikbaar, verplaatsen, zoeken, resetten en serveropslag na herladen.
- Extra Home-screenshots met alle beschikbare widgets zichtbaar; lege/datagebonden onderdelen zijn als zodanig behandeld.

De 19 Home-modules: Portfolio overview, Value drivers, Sudden drops, Market Movers, Graded Movers, Grading Targets, Cheap Rarity, Discount Watch, Signal Radar, Old High-Rarity, Featured cards, Featured Sealed, Collection allocation, Top sets, Wants, For Sale, Upcoming Sealed, Upcoming Singles en Collection shortcuts.

## Validatie

- 247 unit-testbestanden, **1.546 tests geslaagd**.
- ESLint en TypeScript geslaagd; productiebuild geslaagd.
- **22 productiebrowserregressies geslaagd** in `ui-polish.spec.ts`, `account-ui.spec.ts` en `security.spec.ts`: tabnavigatie, alle widgets, opslagfout/retry, kaartdetailfout/retry, MFA-copy/download, contrast, nested dialogs, account- en collectiebeveiliging. De UI-foutinjectietests blokkeren serviceworkers zodat gemockte HTTP-fouten daadwerkelijk de geteste aanvraag raken.
- CI installeert Chromium en voert de nieuwe UI-regressies uit naast de bestaande controles.

## Grenzen en vervolg

Dit is geen claim dat iedere kaart, browser, externe gegevensbron en toestand foutloos is. Live scraper-/mailproviders zijn niet aangeroepen. De lokale snapshot heeft oude prijzen en niet alle externe afbeeldingen.

De uitgebreide oudere kaartdetail-smokes zijn niet als groen meegerekend: de Radar-test verwacht nog een verdwenen aparte shell, de Sealed-test verwacht 24 kaarten waar de compacte preview er 8 toont, en een 3D-holomasker bleef tijdens de lokale productiecheck op loading. De nieuwe tabregressies testen de huidige gedeelde shell; volledige 3D-assetvalidatie blijft een afzonderlijke controle.

Screenshots en meetbestanden staan lokaal onder `audits/2026-09-04/ui-polish`; de oorspronkelijke beelden blijven onder `ui-review` beschikbaar.

## Vervolg — 5 september: minder visuele drukte

- Market heeft op mobiel zoeken en sorteren direct in beeld. Extra filters staan onder More filters met het aantal actieve filters. In-/uitklappen behoudt de selectie; Reset wist de filters. Desktop houdt alle filters direct beschikbaar. Dit geldt voor raw, graded, sealed, Discount Watch en Cheap Rarity.
- Discount Watch en Cheap Rarity tonen één hoofdkop, kortere uitleg en geen drie decoratieve labels boven de resultaten. De aantallen, bron en scope blijven zichtbaar.
- Account toont de tabs direct onder de kop, zonder vier herhaalde statistiekkaarten. Het profiel heeft minder kaders, het e-mailadres de volledige breedte en technische datums/ID staan onder Account details.
- De uitleg bij raw en graded Market is korter.

Twee extra browserregressies controleren vijf Market-routes en Account op 390 en 1440 px: bereikbare filters, actieve-filterteller, behoud na inklappen, reset, horizontale overflow en Account details. Screenshots: `audits/2026-09-05/ui-density`.

Validatie van deze vervolgronde: **24 productiebrowserregressies**, **1.546 unittests**, ESLint, TypeScript en de webpack-productiebuild geslaagd. De twee extra tests leveren twaalf nieuwe desktop-/mobielscreenshots op.

Vervolg: de drie hierboven genoemde oude detailtests en het 3D-laadgedrag zijn opnieuw onderzocht en gecontroleerd. Zie [auditvervolg van 5 september](audit-followup-2026-09-05.md) voor de oplossingen, 30 geslaagde gerichte productiebrowserchecks en de resterende live-toegangsgrenzen.

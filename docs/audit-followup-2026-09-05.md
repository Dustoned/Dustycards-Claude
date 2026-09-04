# Auditvervolg — 5 september 2026

## Opgelost

- Authenticator-setup toont een QR-code naast de bestaande handmatige sleutel en app-link. De server genereert de PNG lokaal; er wordt geen sleutel naar een externe QR-dienst gestuurd. De prepare-respons is niet cachebaar. Een onafhankelijke QR-decoder controleert zowel de generator als de echte API-respons.
- De 3D-textureloader stopt na 15 seconden, ruimt late textures op en annuleert de laadbelofte bij vertrek. Fouten zetten de status op error en bieden Retry 3D view. Een browserregressie breekt een texture-aanvraag en controleert dat opnieuw proberen de viewer herstelt.
- Journey Together en Obsidian Flames: de twee oude TCGGO-logo-URL's geven 404. De bestaande afbeeldingsfallback probeert nu de overeenkomstige TCGdex-logo's, die tijdens de controle HTTP 200 gaven. De lokale image-cache levert beide logo's weer met HTTP 200. Productiedatabases worden niet aangepast.
- Als zowel proxy als oorspronkelijke afbeelding falen, verdwijnt de laadanimatie en verschijnt een toegankelijke Image unavailable-melding. De setdetailheader gebruikt nu ook dit gedeelde gedrag.
- De uitgebreide detailtests zijn bijgewerkt voor de gedeelde Radar-shell, Collection & Reprints, vier Sealed-tabs, acht previewkaarten versus de volledige Featured cards-tab, scrollbare desktopvensters en mobiele actieknoppen buiten de dialoog.
- Die controles vonden een echte mobiele scrollsprong bij een kortere detailtab. Alleen de ruimte die nodig is om de bestaande scrollpositie te behouden wordt nu gereserveerd. De mobiele actieknoppen respecteren ook de bestaande instelbare safe-area-waarden.
- De drie uitgebreide detailregressies zijn toegevoegd aan CI. De bestaande checks voor widgets, account en beveiliging blijven meedraaien.
- De afhankelijkhedencontrole meldde een bestaande kwetsbaarheid in fflate. Een gerichte update naar de verholpen versie bracht npm audit terug naar nul meldingen.

## Live controles en grenzen

Via de bestaande servertoegang zijn alleen statuscontroles uitgevoerd. De app draait. Dagelijkse back-up, sync-scheduler en prijsverversing rapporteerden Result=success en exitcode 0. De dagelijkse back-upexport had een recente wijzigingsdatum en was circa 2,46 GB groot.

De gebruikte serveraccount mag de productie-.env, database en back-upinhoud niet lezen. Daardoor zijn SMTP-authenticatie, echte mailbezorging, actuele productielogo-URL's en een integriteits-/hersteltest van die back-up niet bewezen. Een eerste mailprobe kon de configuratie niet lezen; dat is geen bewijs dat SMTP niet geconfigureerd is. Er is geen echte mail verstuurd, geen betaalde synchronisatie gestart, geen live herstel uitgevoerd en niets gedeployd.

De geslaagde servicestatussen bewijzen dat de jobs eindigden; ze bewijzen niet afzonderlijk dat iedere externe leverancier actuele gegevens leverde.

## Validatie

- 249 unit-testbestanden, **1.552 tests geslaagd**.
- ESLint, TypeScript en de webpack-productiebuild geslaagd.
- **30 gerichte productiebrowserregressies geslaagd**: 27 UI/account/beveiliging en drie uitgebreide standaardkaart-, Radar- en Sealed-detailtests.
- QR-code en herstelde 3D-render visueel gecontroleerd. Screenshots staan onder `audits/2026-09-05/audit-followup`.
- De eerdere onduidelijke 3D-fout is in de productietrace teruggevonden als HTTP 429: de snelle suite deelde één afbeeldingsbudget. Browserfixtures hebben nu afzonderlijke gesimuleerde clientadressen; productielimieten zijn behouden. Afzonderlijke foutinjectie test de nieuwe foutmelding en herstartknop.

Dit sluit de drie expliciet genoemde oudere detailtests af. Het is geen claim dat elke bestaande smoke-test, externe provider of fysieke browser/apparaatcombinatie is getest.

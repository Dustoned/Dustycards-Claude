# Audit van Radar- en Market-logica

## Bereik

De keten van prijsdata naar Buy/Sell/Hold, DustyCards Market-score, opgeslagen zoekrangschikking, raw/graded Radar-scenario's, Sealed Radar en forecast-evaluatie is nagelopen. De bestaande tests voor trends, scenario's, reprint-risico, datadekking, valuta, kalibratie en sortering zijn meegenomen.

## Herstelde fouten

1. **eBay-bewijs in Market:** een oude of afgekapt aangeleverde inventaris kon de score en het vertrouwen verhogen. Alleen een volledige, geldig gedateerde inventaris van maximaal 72 uur oud telt nog mee. Een vraagtrend vereist zeven complete unieke dagen in het relevante weekvenster; de payload bewaart nu ook of een historische dag is afgekapt.
2. **Geschatte balken in zoekresultaten:** vraag en liquiditeit op basis van prijs-/dekkingsproxies bleven neutraal in de totaalscore, maar werden wel opgeslagen als actieve marktvraag. De achtergrondtaak bewaart voor deze rangschikkingsvelden nu uitsluitend de rechtstreeks onderbouwde waarden. De bestaande achtergrondtaak vernieuwt opgeslagen kaartscores in batches; bestaande databasewaarden veranderen pas bij die herberekening.
3. **Oude prijshistorie:** verse inventaris gaf een kaart met oude prijzen opnieuw veel vertrouwen. Prijshistorie ouder dan 30 dagen begrenst het vertrouwen nu op laag.
4. **Dubbel getelde graded bron:** het aantal verkochte exemplaren telde als extra onafhankelijke prijsbron. Een eBay-bron telt nu één keer. Zonder bruikbare huidige prijs is het aantal bronnen nul.
5. **Verkeerde tijdvensters:** een beweging van één dag kon als 7d en 30d worden gepresenteerd. De berekening vereist nu passende tijddekking en verwerpt een te oude referentie over een groot gat.
6. **Ongeldige prijzen:** nul, negatieve waarden, de ontbrekende-prijswaarde 9001 en niet-eindige waarden tellen niet als bruikbare Buy/Sell-prijs. Scenario's met onbruikbare invoer of niet-eindige doelprijzen worden niet gepubliceerd.
7. **Graded Radar-historie:** snapshots van andere grades/valuta en meerdere verversingen op één dag konden vertrouwen verhogen. Alleen unieke dagen van PSA 10 in de geselecteerde valuta tellen. Een sample van nul telt niet als extra bewijs; onbekende valuta worden niet als USD geïnterpreteerd.
8. **Sealed-labels:** een oude quote kon nog Breakout heten. Na drie dagen is dat label begrensd; na zeven dagen blijft maximaal Watch over. Sterk volatiele historie krijgt geen hoog vertrouwen.
9. **Tijdreizen bij evaluatie:** prijzen die pas na het gekozen evaluatiemoment bekend waren konden al in een voorlopige uitkomst verschijnen. Zowel de registratietijd als de effectieve bronquote wordt nu begrensd.
10. **Prijssortering met verschillende valuta:** EUR en USD werden numeriek naast elkaar gesorteerd. Radar sorteert nu op de euro-equivalenten uit de bestaande wisselkoersvoorziening. Bij ontbrekende conversie staat een prijs achter de vergelijkbare prijzen; de zichtbare bronprijs blijft behouden.

Radar-observaties krijgen modelversie `v13-evidence-quality`. Bestaande snapshots worden opnieuw opgebouwd. Het bestaande mechanisme voor herkenbaar gemarkeerde kalibratie uit eerdere modelversies blijft behouden; dit geldt niet als zelfstandige validatie van de nieuwe versie.

## Historische controle

Het bestaande offline script is read-only op de lokale appdatabase uitgevoerd. Dertien kaarten hadden minstens 420 prijsdagen; acht daarvan leverden samen 78 beoordeelbare 90/180-dagenvoorspellingen op. Externe inputs zoals nieuws, eBay en sealed waren neutraal, zoals het script expliciet beschrijft.

| Verwachting | Waarnemingen | Richting correct | Binnen scenarioband |
| --- | ---: | ---: | ---: |
| Sterk omhoog | 4 | 50,0% | 50,0% |
| Gematigd omhoog | 20 | 70,0% | 90,0% |
| Vlak | 42 | 26,2% | 73,8% |
| Omlaag | 12 | 25,0% | 41,7% |

Deze kleine, overlappende selectie is geen representatieve onafhankelijke validatie. De cijfers onderbouwen geen claim van perfecte voorspellingen. Er zijn geen gewichten op deze acht kaarten afgestemd. Scores blijven heuristische rangschikkingen; vertrouwen gaat over de gebruikte gegevens en is geen gekalibreerde kans op rendement. De bestaande publicatiegrenzen voor expliciete forecastkansen vereisen voldoende afgeronde gevallen, unieke kaarten en chronologische kalibratie.

## Validatie en operationele grenzen

Er zijn 22 gerichte regressiegevallen toegevoegd. Alle 249 unit-testbestanden en 1.574 tests slagen; lint en TypeScript slagen. De productiebuild en browserregressies worden opnieuw voor de gewijzigde commit gecontroleerd.

Er is niets naar productie gedeployd. Live mailbezorging en herstel van de productiebackup blijven onbewezen door ontbrekende leestoegang. De eerder gevonden ontwikkelserver-hydratiemismatch is niet als verholpen aangemerkt; de productiecontroles gebruiken de gebouwde app.

# EDGE LAB AI 0.8 — radar piłkarski i laboratorium badawcze

**Bezpłatna aplikacja badawcza, nie zweryfikowany system dochodu z zakładów.**

Adres: https://jakuba777.github.io/edge-lab-radar/

## Aktualne moduły

- Radar — terminarz i szacunkowe prawdopodobieństwa bramek w 16 ligach.
- Market Intelligence 1.0 (BETA) — ręczne porównanie kursu z modelem i bazą oraz diagnostyka opcjonalnych połączeń API.
- Kupony (0.9 – eksperyment) — osobny profil **Pojedyncze**, cztery dotychczasowe profile zestawień, odrzucanie bliskich duplikatów, szacunek ryzyka nietrafienia, argumenty ZA/PRZECIW.
- Łamaki (0.7) — historia HT/FT oraz model obserwacyjny 2/1 i 1/2; bez potwierdzonej przewagi.
- Modele (0.5) — sezon 2025/26 do porównań z modelem Poissona.
- LIVE LAB (0.8) — **wyłącznie REPLAY HISTORYCZNY**, nie podaje wyników na żywo.
- Weryfikacja — historyczne raporty Brier i log-loss; raport ostatniego rozliczonego dnia z listą trafień i pomyłek, rzeczywistą liczbą zdarzeń i sumą oczekiwanych trafień; pojedyncze eksperymenty rozliczane oddzielnie od wielozdarzeniowych symulacji.

## Ekrany na telefonie

Radar: https://jakuba777.github.io/edge-lab-radar/

Rynek: https://jakuba777.github.io/edge-lab-radar/rynek.html

Kupony: https://jakuba777.github.io/edge-lab-radar/kupony.html

Łamaki: https://jakuba777.github.io/edge-lab-radar/lamaki.html

LIVE LAB: https://jakuba777.github.io/edge-lab-radar/live.html

Modele: https://jakuba777.github.io/edge-lab-radar/modele.html

W Safari użyj Udostępnij → Dodaj do ekranu początkowego.

## Zmiany audytowe 31 października 2026

- Dostępne dane historyczne liczymy wyłącznie na podstawie archiwów pre-match i wyników źródła; nie dopisujemy retrospektywnie typów z prywatnych kuponów.
- Ostatni rozliczony dzień na stronie Skuteczność pokazywany jest oddzielnie: dokładne mecze, zwycięskie i przegrane hipotezy, Brier i porównanie oczekiwanej oraz faktycznej liczby trafień.
- Pojedyncze analizy z profilu Pojedyncze są archiwizowane, a następnie osobno rozliczane w polu `single_research`. Historyczne `simulated_coupons` nadal oznacza wyłącznie kombinacje co najmniej 2 zdarzeń.
- W kombinacjach blokujemy istotne duplikaty i ograniczamy ponowne użycie tego samego zdarzenia w prezentowanych wariantach. Jeżeli nie ma wystarczającej liczby różnorodnych hipotez, pokazujemy mniej zestawień.
- W archiwum historii najpierw najnowsze rozliczone, potem oczekujące od najbliższej daty; backend przechowuje do 30 najbliższych przyszłych wskazań do wyświetlenia.
- **Nie ma gwarancji, że zdjęcie prywatnego kuponu obejmuje wszystkie zdarzenia.** Nie przenosimy prywatnej historii zawartych zakładów ani identyfikatorów kuponów do publicznych plików GitHub.
- Brak real-time LIVE i brak potwierdzonej przewagi względem kursów. Brak automatycznego obstawiania.

## Pozostałe mecze dzisiaj — badanie 4/4

Od 31 października ekran Kupony zawiera sekcję **Dzisiejsze badania przedmeczowe**.
Jeśli source CSV posiada godzinę, a ostatnie pobranie nie jest starsze niż 8 godzin,
pokażemy tylko mecze z godziną późniejszą niż bieżąca Europa/Warszawa + 15 minut.
Terminarz open-matchday nie gwarantuje formalnie strefy czasowej ani rzeczywistego
statusu rozpoczęcia, dlatego wszystkie dzisiejsze analizy są warunkowe, a czas
trzeba sprawdzić w oficjalnym terminarzu.

Standardowy generator kuponów nadal wymaga co najmniej 6 meczów domowych
i 6 wyjazdowych oraz minimum 55 wcześniejszych spotkań w lidze.
Osobny **tryb badawczy 4/4** pozwala obejrzeć niepewne oszacowania nawet wtedy,
gdy zabraknie prób do generatora; nie generuje zakładów i nie jest
dodawany do audytowanych symulacji kuponowych.

Z karty dzisiejszej analizy można skopiować obserwację i czas jej utworzenia
do prywatnych notatek. Takie zapisy nie są niezależnymi archiwami ani
potwierdzeniem wyniku, dopóki nie mają niezmiennego zapisu i niezależnego
rozliczenia. Po rozpoczęciu meczu opcja eksportu danej hipotezy jest blokowana.

## Market Intelligence 1.0 — wdrożenie minimalne

Adres: https://jakuba777.github.io/edge-lab-radar/rynek.html

- Bez żadnych kluczy API panel pobiera obecne dane terminarza/wyników z GitHub Pages i porównuje szacowanie modelu z **kursem wpisanym ręcznie**. Kurs nie jest wysyłany na serwer ani zapisywany.
- Model jest nieskalibrowany: obliczona różnica wobec progu rentowności NIE stanowi dowodu przewagi nad rynkiem.
- Automatyczny krok `scripts/market_feed.py` podczas GitHub Actions sprawdza dwa opcjonalne źródła: API-Football (GET `/fixtures?live=all`) i OddsPapi (GET `/v4/odds-by-tournaments`, źródło `superbet.pl`).
- **Na stronę trafiają tylko agregaty diagnostyczne i stan połączeń, nigdy surowe kursy, dane LIVE, konta, tokeny ani loginy.** Nie uruchamiamy transmisji LIVE bez weryfikacji licencji danych i właściwego backendu.
- Brak konfiguracji nie zatrzymuje publikacji: status `not_configured` jest prawidłowym stanem.

### Opcjonalna konfiguracja w GitHub

1. W repozytorium wejdź w Settings → Secrets and variables → Actions.
2. Dodaj **Repository secret** `API_FOOTBALL_KEY`, jeśli masz własny klucz API-Football.
3. Dodaj **Repository secret** `ODDSPAPI_KEY`, jeśli masz własny klucz OddsPapi.
4. Dodaj **Repository variable** `ODDSPAPI_TOURNAMENT_IDS` z maksymalnie trzema ID rozgrywek, np. `17,8` (sprawdź aktualne ID w /v4/tournaments).
5. Uruchom Actions → Aktualizacja danych i publikacja EDGE LAB → Run workflow lub poczekaj na harmonogram (4 razy dziennie). Sprawdź na stronie Rynek status połączeń; nie udostępniaj kluczy w czacie ani w publicznych plikach.

API-Football: https://www.api-football.com/documentation_v3
OddsPapi: https://oddspapi.io/en/docs/get-odds-by-tournaments
Warunki danych: https://oddspapi.io/en/legal/terms (zastrzeżenia dot. dalszego udostępniania danych).
**API dostawcy ≠ autoryzowana integracja prywatnego konta Superbet.** Żadnego logowania, scrapingu ani zakładania kuponów.

## LIVE LAB 0.8 — znaczenie danych

Źródło to sezon open-matchday 2026/27, skopiowany przez GitHub Actions
do statycznych plików. Te dane **NIE SĄ LIVE**.

Skrypt scripts/live_replay08.py:

1. Odrzuca brakujące i nierozpoznane minuty bramek.
2. Sprawdza, czy liczba minut zgadza się z liczbą goli; w niebudzących
   wątpliwości przypadkach porównuje także liczbę goli do przerwy.
3. Wymaga 40 wyników w lidze, minimum 55% kompletnego pokrycia
   wszystkich wyników i minimum 60% dla spotkań z co najmniej jedną bramką.
4. Odtwarza migawki 45., 60. i 75. minuty. Pokazuje tylko bramki
   zdobyte do tej minuty i prognozuje gola w kolejne 15 minut.
5. Porównuje model warunkowy względem tempa ostatnich 15 minut z
   częstością zdarzenia w danej lidze, używając wyłącznie spotkań
   z wcześniejszych dni.
6. Raportuje próbę od października 2026 r. i nie dopuszcza do
   mocnych wniosków. Trzy migawki jednego meczu nie są niezależne.

Model nie zna zespołu, który zdobył każdą bramkę, ani faktycznych
bieżących kursów, strzałów, jakości sytuacji xG, składów czy zmian
tempa innych niż częstość bramek. Nie może wiarygodnie obiecać
zyskownych zakładów LIVE.

## Prawdziwy LIVE — warunki przed uruchomieniem

Po pierwsze: test nieodpłatnego źródła API na 1–2 ligach bez
przedpłaty za abonament.

Po drugie: weryfikacja czasu wydarzenia, opóźnienia API, opóźnienia
udostępnienia aktualnego kursu oraz rzeczywistej dostępności ofert.

Po trzecie: osobny backend, w którym znajduje się prywatny klucz API,
nigdy statyczna strona GitHub Pages.

Po czwarte: archiwum sygnałów zapisanych przed wynikiem zdarzenia,
kalibracja, kontrola odświeżania i automatyczne blokowanie starych
lub niekompletnych danych.

Po piąte: dopiero po niezależnym teście jakości oszacowanie różnicy
między prawdopodobieństwem i faktycznie dostępnym kursem, uwzględniające
polskie podatki i pozostałe koszty. Nie ma automatycznego obstawiania.

## Bezpieczeństwo

Repozytorium jest PUBLICZNE. Nie umieszczaj w nim tokenów, plików
z hasłami, danych logowania, plików .env ani danych prywatnych.
GitHub Pages serwuje statyczne pliki; skrypty przeglądarki pobierają
dane wyłącznie z tej samej domeny HTTPS.

Harmonogram publikacji: cztery próby dziennie w GitHub Actions.
Testy: python -m unittest discover -s tests -v.
Replay: python scripts/live_replay08.py po pobraniu danych.

**Aplikacja nie posiada potwierdzonej przewagi finansowej nad rynkiem.**

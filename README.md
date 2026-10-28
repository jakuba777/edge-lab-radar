# EDGE LAB AI 0.8 — radar piłkarski i laboratorium badawcze

**Bezpłatna aplikacja badawcza, nie zweryfikowany system dochodu z zakładów.**

Adres: https://jakuba777.github.io/edge-lab-radar/

## Aktualne moduły

- Radar — terminarz i szacunkowe prawdopodobieństwa bramek w 16 ligach.
- Kupony (0.6) — cztery profile zestawień 2–4 meczów oraz Bet Builder, argumenty ZA/PRZECIW.
- Łamaki (0.7) — historia HT/FT oraz model obserwacyjny 2/1 i 1/2; bez potwierdzonej przewagi.
- Modele (0.5) — sezon 2025/26 do porównań z modelem Poissona.
- LIVE LAB (0.8) — **wyłącznie REPLAY HISTORYCZNY**, nie podaje wyników na żywo.
- Weryfikacja — historyczne raporty Brier i log-loss.

## Ekrany na telefonie

Radar: https://jakuba777.github.io/edge-lab-radar/

Kupony: https://jakuba777.github.io/edge-lab-radar/kupony.html

Łamaki: https://jakuba777.github.io/edge-lab-radar/lamaki.html

LIVE LAB: https://jakuba777.github.io/edge-lab-radar/live.html

Modele: https://jakuba777.github.io/edge-lab-radar/modele.html

W Safari użyj Udostępnij → Dodaj do ekranu początkowego.

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

# EDGE LAB AI 0.3.1 — radar statystyczny na iPhone

**Status:** prototyp badawczy. Wymaga uruchomienia GitHub Pages oraz pomyślnego procesu GitHub Actions. Nie stanowi źródła zweryfikowanych typów ani porady finansowej.

## Uruchomienie

1. Repozytorium musi pozostać publiczne w GitHub Free.
2. Otwórz Settings → Pages → Build and deployment i wybierz **Source: GitHub Actions**.
3. Sprawdź zakładkę Actions → workflow **Aktualizacja danych i publikacja EDGE LAB**; uruchom ręcznie przyciskiem **Run workflow**, jeśli trzeba.
4. Poczekaj na zielone zadania build oraz deploy. Otwórz faktyczny adres pokazany w Settings → Pages.
5. Na iPhonie: Safari → Udostępnij → Dodaj do ekranu początkowego.

Strona pobiera wyłącznie pliki `./data/...` ze swojej domeny HTTPS. GitHub Actions raz na sześć godzin próbuje aktualizować publiczne CSV z [open-matchday](https://github.com/oladeeayo/open-matchday). To nie są dane LIVE. Przy braku poprawnych źródeł proces nie publikuje nowej wersji. Dane starsze niż 48 godzin wyłączają ranking analiz.

## Ochrona danych

- Brak prywatnych kont użytkownika, reklam, trackerów, kluczy API, logowania do bukmachera lub banku.
- Nie dodawaj do repozytorium plików prywatnych, tokenów, zrzutów z kont ani `.env`.
- Kod jest publiczny. W GitHub włącz 2FA/passkey i ukrywanie adresu e-mail.
- Automatyzacje używają przypiętych SHA akcji, bez nieaufanych pull requestów; uprawnienia build/deploy są rozdzielone.
- CSP ogranicza połączenia JS do własnego hosta i dane z CSV są HTML-escaped.
- HTTPS ogranicza podsłuch, lecz nie eliminuje phishingu, przejęcia konta ani błędów dostawców.

## Analizy

W konfiguracji 8 lig. System porównuje wyniki historyczne z terminarzem, tworzy eksperymentalny model Poissona dla goli (minimum 4 mecze domowe i 4 wyjazdowe), szacuje wspólne zdarzenia Bet Buildera z jednej siatki wyników i liczy próg rentowności przy ręcznie podanym **kursie całej kombinacji** po podatku 12%.

**Nie istnieje jeszcze potwierdzona przewaga kursowa ani kalibracja modelu.** Brak kursów LIVE, składów, pełnych statystyk zawodników oraz modeli kartek i rożnych. Możliwy jest brak hipotez danego dnia. Nie stawiaj pieniędzy na podstawie eksperymentalnego wyniku.

Źródło danych: open-matchday, użytek osobisty/niekomercyjny. Zakłady mogą prowadzić do strat. 18+.

# EDGE LAB 2.0 — Value Engine: specyfikacja wdrożeniowa

Status: projekt do przeglądu; nie jest potwierdzeniem przewagi ani automatycznym systemem obstawiania.

## Priorytet
Rozbudować istniejące Market Intelligence i Kupony, zamiast tworzyć drugi równoległy generator. Domyślnie 1–3 różne mecze; dopuszczać brak propozycji.

## Dane wejściowe
- match_id, liga, kickoff_utc (ISO 8601), source_updated_at, home, away;
- market_id, selection, decimal_odds, bookmaker, odds_timestamp, market_status;
- model_version, predicted_probability, calibration_version, sample_size, uncertainty_interval;
- snapshot_id, prediction_created_at, immutable pre-match record.
- Brak kursu lub przestarzałe dane => brak statusu VALUE; żadnych wymyślonych kursów.

## Matematyka
Dla polskiego podatku 12% od stawki, gdy ma zastosowanie:
- break_even_probability = 1 / (0.88 * decimal_odds)
- expected_roi = predicted_probability * decimal_odds * 0.88 - 1
- lower_bound_roi = lower_confidence_probability * decimal_odds * 0.88 - 1
- Dla zakładów bez tego podatku stosować właściwy model rozliczenia; nie mieszać kwot brutto/netto.
- VALUE_CANDIDATE tylko gdy dolna granica ROI > 0, dane świeże, rynek aktywny i model przeszedł kalibrację; próg do eksperymentalnej selekcji, nie gwarancja zysku.

## Rynki
O1.5, O2.5, O3.5, BTTS, 1X2; dla każdego osobna kalibracja. Rozkład bramek Poissona/Dixon-Coles to baseline, nie dowód przewagi. Unikać wyprowadzania niezależnych prawdopodobieństw ze skorelowanych rynków.

## Kupony
- Single, Double, Triple; oddzielny track record.
- Jeden match_id maksymalnie raz na kupon.
- Kontrola zależności między spotkaniami (wspólne źródło błędu modelu, składy, liga).
- Łączne prawdopodobieństwo mnożyć wyłącznie przy uzasadnionej niezależności; w innym wypadku oznaczyć jako nieoszacowane.
- Limit ekspozycji na jedno zdarzenie we wszystkich symulacjach; liczba kombinacji nie może maskować duplikatów.
- Kurs docelowy jest filtrem prezentacji, nigdy celem optymalizacji w oderwaniu od EV.

## Audyt
- Nieedytowalne prognozy sprzed kickoff; wynik tylko z niezależnie zweryfikowanego źródła.
- Rozdzielić: prognozy, wirtualne kupony, rzeczywiste zakłady (prywatne, nie publikować na GitHub Pages).
- Brier, log-loss, reliability bins, ROI po podatku, CLV (gdy kurs zamknięcia dostępny), liczebność próby i przedziały ufności.
- Walk-forward, baseline implied market probability (po usunięciu marży), brak leakage.
- Osobno raportować wynik każdego rynku i każdej wersji modelu.
- Status NO_EDGE gdy brak dostatecznych danych lub potwierdzonej przewagi.

## Kolejność prac
1. Inwentaryzacja źródeł istniejących ekranów, skryptów i kontraktów JSON.
2. Testy funkcji EV, podatku, brakujących kursów, czasu Warsaw/UTC, duplikatów.
3. Dodanie oceny wartości do obecnego ekranu Rynek.
4. Ograniczenie kuponów do 1–3 i odrębne archiwa.
5. Backtest walk-forward oraz raport porównawczy; dopiero potem eksperyment prospektywny.

## Kryteria akceptacji
- Żaden kurs demonstracyjny nie jest wyświetlany jako aktualny.
- Brak rekomendacji przy brakujących danych, ujemnym dolnym EV lub niedostatecznej kalibracji.
- Brak mieszania prawdziwych zakładów i symulacji.
- Każdy typ ma identyfikowalny snapshot danych, wersję modelu i czas utworzenia.
- Nowe funkcje nie psują obecnych ekranów ani harmonogramu aktualizacji.

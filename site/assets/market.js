'use strict';
/* EDGE LAB Market Intelligence 1.0. Only same-origin public match data.
   Entered odds stay in browser memory: no accounts, bookmaker APIs or bets. */
(function () {
  const C = window.EDGECOUPONS;
  const $ = id => document.getElementById(id);
  const state = {matches: [], ready: false, selectedId: ''};
  const today = () => new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
  const number = value => Number(value).toFixed(2).replace('.', ',');
  const percent = value => Number.isFinite(value) ? (value * 100).toFixed(1).replace('.', ',') + '%' : '—';
  const el = (tag, text, cls) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = String(text);
    if (cls) node.className = cls;
    return node;
  };
  const label = {
    o15: 'Powyżej 1,5 gola', o25: 'Powyżej 2,5 gola',
    u35: 'Poniżej 3,5 gola', btts: 'Obie strzelą',
    hg: 'Gol gospodarzy', ag: 'Gol gości'
  };
  function compare(p, base, raw) {
    const n = Number(String(raw).trim().replace(',', '.'));
    if (!String(raw).trim() || !Number.isFinite(n) || n <= 1 || n > 1000) return null;
    return {odds: n, implied: 1 / n, threshold: 1 / (.88 * n),
      model: p, base, difference: p - 1 / (.88 * n)};
  }
  function kickoffKey(match) {
    const time = String(match.time || '').trim();
    const t = time.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    const minute = t && +t[1] < 24 && +t[2] < 60 ? +t[1] * 60 + +t[2] : 1440;
    return match.date + ':' + String(minute).padStart(4, '0');
  }
  async function getText(url) {
    const r = await fetch(url, {cache: 'no-store', credentials: 'omit', mode: 'same-origin'});
    if (!r.ok) throw Error('Brak danych: HTTP ' + r.status);
    return r.text();
  }
  async function getJSON(url) {
    const r = await fetch(url, {cache: 'no-store', credentials: 'omit', mode: 'same-origin'});
    if (!r.ok) throw Error('Brak danych: HTTP ' + r.status);
    return r.json();
  }
  function appendMetric(root, heading, value) {
    const item = el('div');
    item.appendChild(el('small', heading));
    item.appendChild(el('strong', value));
    root.appendChild(item);
  }
  function renderComparison() {
    const output = $('market-output');
    output.replaceChildren();
    if (!state.ready) {
      output.appendChild(el('p', 'Brak aktualnego modelu. Porównanie jest wstrzymane.', 'market-error'));
      return;
    }
    const match = state.matches.find(x => x.id === $('market-match').value);
    const market = $('market-type').value;
    if (!match || !Object.prototype.hasOwnProperty.call(label, market)) {
      output.appendChild(el('p', 'Wybierz mecz i rynek.', 'caption'));
      return;
    }
    const p = match.model.ps[market];
    const base = match.model.base[market];
    const raw = $('market-odds').value;
    const result = compare(p, base, raw);
    if (!result) {
      output.appendChild(el('p', 'Wpisz poprawny rzeczywisty kurs dziesiętny, większy od 1.', 'market-error'));
      return;
    }
    const snapshot = el('div', undefined, 'snapshot');
    appendMetric(snapshot, 'Coupon Core 0.6', percent(result.model));
    appendMetric(snapshot, 'Baza ligowa', percent(result.base));
    appendMetric(snapshot, 'Implikowane z kursu', percent(result.implied));
    appendMetric(snapshot, 'Próg po 12% podatku', percent(result.threshold));
    output.appendChild(snapshot);
    output.appendChild(el('p', 'Różnica model – próg: ' +
      (result.difference >= 0 ? '+' : '') + (result.difference * 100).toFixed(1).replace('.', ',') +
      ' punktów procentowych. Kurs: ' + number(result.odds) + '.', 'market-source'));
    output.appendChild(el('p', 'Różnica NIE jest potwierdzoną przewagą: model jest nieskalibrowany i nie został zweryfikowany względem rynku. ' +
      'Próba: ' + match.model.nH + ' meczów domowych / ' + match.model.nA + ' wyjazdowych. ' +
      'Bez rzeczywistych kursów historycznych nie można wyciągać wniosków o rentowności.',
      'market-disclaimer'));
  }
  async function copyAnalysis() {
    const m = state.matches.find(x => x.id === $('market-match').value);
    const type = $('market-type').value;
    const data = m && state.ready && Object.prototype.hasOwnProperty.call(label, type)
      ? compare(m.model.ps[type], m.model.base[type], $('market-odds').value) : null;
    if (!data) {
      $('market-copy').textContent = 'Najpierw wybierz mecz i poprawny kurs';
      return;
    }
    const lines = [
      'EDGE LAB 1.0 · prywatna notatka badawcza',
      m.date + ' · ' + m.home + ' – ' + m.away + ' (' + m.league + ')',
      label[type],
      'Model Coupon Core 0.6: ' + percent(data.model),
      'Baza ligowa: ' + percent(data.base),
      'Kurs wpisany ręcznie: ' + number(data.odds),
      'Szansa implikowana: ' + percent(data.implied),
      'Próg przy podatku 12%: ' + percent(data.threshold),
      'Różnica model – próg: ' + (data.difference * 100).toFixed(1) + ' pp',
      'Hipoteza nieskalibrowana. Brak potwierdzonej przewagi i bez automatycznego zakładu.'
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      $('market-copy').textContent = 'Skopiowano do schowka';
    } catch (_) {
      $('market-copy').textContent = 'Kopiowanie niedostępne w tej przeglądarce';
    }
  }
  function showUpcoming() {
    const root = $('market-upcoming');
    root.replaceChildren();
    if (!state.matches.length) {
      root.appendChild(el('p', 'Brak spotkań z wystarczającą historią na najbliższe 14 dni.', 'panel empty'));
      return;
    }
    for (const m of state.matches.slice(0, 20)) {
      const btn = el('button', undefined, 'market-match');
      btn.type = 'button';
      btn.dataset.id = m.id;
      btn.appendChild(el('small', m.league + ' · ' + m.date + (m.time ? ' · ' + m.time + ' (czas źródłowy)' : ' · godzina nieznana')));
      btn.appendChild(el('strong', m.home + ' – ' + m.away));
      root.appendChild(btn);
    }
  }
  function setError(message) {
    $('model-error').classList.remove('hidden');
    $('model-error').textContent = message;
  }
  async function loadConnectivity() {
    try {
      const d = await getJSON('./data/market_feed.json');
      if (d.schema !== 1 || !Number.isFinite(Date.parse(d.generated_utc))) throw Error('Nieprawidłowy plik połączeń');
      const age = (Date.now() - Date.parse(d.generated_utc)) / 3600000;
      const fmt = v => {
        if (!v || typeof v.status !== 'string') return 'Błąd statusu';
        if (age > 12 || age < -1) return 'Status nieaktualny';
        if (v.status === 'connected') return 'Połączono (tylko diagnostyka)';
        if (v.status === 'not_configured') return 'Brak klucza API';
        if (v.status === 'needs_tournament_ids') return 'Brak ID lig';
        return 'Błąd połączenia';
      };
      $('football-status').textContent = fmt(d.api_football);
      $('odds-status').textContent = fmt(d.superbet_pl_odds);
      $('connectivity-updated').textContent = 'Ostatnia próba: ' +
        new Date(d.generated_utc).toLocaleString('pl-PL', {timeZone: 'Europe/Warsaw'}) +
        '. Dane kursowe i wydarzenia LIVE nie są publikowane w tym module.';
    } catch (_) {
      $('football-status').textContent = 'Nie skonfigurowano';
      $('odds-status').textContent = 'Nie skonfigurowano';
      $('connectivity-updated').textContent = 'Plik diagnostyczny niedostępny. Ręczne porównywanie kursu działa niezależnie.';
    }
  }
  async function load() {
    $('model-refresh').disabled = true;
    $('model-error').classList.add('hidden');
    $('model-status').textContent = 'Weryfikacja danych…';
    state.ready = false;
    state.matches = [];
    const previous = $('market-match').value;
    try {
      if (!C) throw Error('Nie załadowano silnika analitycznego.');
      const status = await getJSON('./data/status.json');
      if (!Array.isArray(status.leagues) || !status.leagues.length ||
          !status.retrieved_at_utc) throw Error('Nieprawidłowy raport źródła.');
      const age = (Date.now() - Date.parse(status.retrieved_at_utc)) / 3600000;
      if (!Number.isFinite(age) || age < -1 || age > 48) {
        throw Error('Źródło starsze niż 48 godzin lub data niepoprawna. Analiza zablokowana.');
      }
      const batches = await Promise.allSettled(status.leagues.map(async league => {
        if (!/^[A-Za-z0-9_-]+$/.test(league.id)) throw Error('Błędny identyfikator ligi');
        const path = './data/' + league.id + '/';
        const [r, f] = await Promise.all([getText(path + 'results_2627.csv'),
          getText(path + 'fixtures_2627.csv')]);
        const results = C.parseCSV(r);
        const fixtures = C.parseCSV(f);
        if (!results.length || !fixtures.length ||
            !['date', 'home', 'away', 'ft_home', 'ft_away'].every(k => Object.hasOwn(results[0], k)) ||
            !['date', 'home', 'away'].every(k => Object.hasOwn(fixtures[0], k))) {
          throw Error('Niepełny format CSV');
        }
        const history = results.filter(x => C.validDate(x.date) && x.home && x.away &&
              C.n(x.ft_home) !== null && C.n(x.ft_away) !== null)
          .map(x => ({date: x.date, home: x.home, away: x.away,
            hs: C.n(x.ft_home), as: C.n(x.ft_away)}))
          .filter(x => x.hs >= 0 && x.as >= 0 && x.hs <= 14 && x.as <= 14)
          .sort((a,b) => a.date.localeCompare(b.date));
        const seen = new Set();
        const list = [];
        for (const fixture of fixtures) {
          if (!C.validDate(fixture.date) || !fixture.home || !fixture.away ||
              fixture.home === fixture.away || C.daysBetween(fixture.date, today()) < 1 ||
              C.daysBetween(fixture.date, today()) > 14) continue;
          const id = [league.id, fixture.date, fixture.home, fixture.away].join('|');
          if (seen.has(id)) continue;
          seen.add(id);
          const model = C.analyze(fixture, history);
          if (model) list.push({id, league: league.name, date: fixture.date,
            time: fixture.time || '', home: fixture.home, away: fixture.away, model});
        }
        return list;
      }));
      const ok = batches.filter(x => x.status === 'fulfilled');
      if (!ok.length) throw Error('Nie udało się zweryfikować żadnej ligi.');
      state.matches = ok.flatMap(x => x.value)
        .sort((a,b) => kickoffKey(a).localeCompare(kickoffKey(b)));
      state.ready = true;
      const select = $('market-match');
      select.replaceChildren(el('option', 'Wybierz spotkanie'));
      select.firstChild.value = '';
      for (const m of state.matches.slice(0, 200)) {
        const opt = el('option', m.date + ' · ' + m.home + ' – ' + m.away + ' (' + m.league + ')');
        opt.value = m.id;
        select.appendChild(opt);
      }
      if (state.matches.some(x => x.id === previous)) select.value = previous;
      else if (state.matches.length) select.value = state.matches[0].id;
      $('model-status').textContent = 'Gotowe do porównania — wyłącznie prematch';
      $('model-updated').textContent = 'Dane: ' + new Date(status.retrieved_at_utc)
        .toLocaleString('pl-PL', {timeZone: 'Europe/Warsaw'}) +
        '. Nie są LIVE. Godziny w terminarzu mogą mieć inną strefę.';
      $('model-leagues').textContent = String(ok.length);
      $('model-count').textContent = String(state.matches.length);
      $('model-age').textContent = Math.floor(age) + ' h';
      if (ok.length !== batches.length) setError(
        'Nie wszystkie ligi zostały załadowane (' + (batches.length - ok.length) + ' pominiętych).');
      showUpcoming();
      renderComparison();
    } catch (e) {
      state.ready = false;
      $('model-status').textContent = 'Dane niedostępne';
      setError(String(e.message || e));
      $('model-leagues').textContent = '—';
      $('model-count').textContent = '—';
      $('model-age').textContent = '—';
      $('market-match').replaceChildren(el('option', 'Brak aktualnego terminarza'));
      $('market-upcoming').replaceChildren(el('div', 'Analiza wstrzymana: dane nieaktualne lub niedostępne.', 'panel empty'));
      renderComparison();
    } finally {
      $('model-refresh').disabled = false;
    }
  }
  document.addEventListener('DOMContentLoaded', () => {
    $('model-refresh').addEventListener('click', () => {load(); loadConnectivity();});
    $('market-compare').addEventListener('click', renderComparison);
    $('market-copy').addEventListener('click', copyAnalysis);
    $('market-match').addEventListener('change', renderComparison);
    $('market-type').addEventListener('change', renderComparison);
    $('market-odds').addEventListener('input', renderComparison);
    $('market-upcoming').addEventListener('click', e => {
      const button = e.target.closest('button[data-id]');
      if (!button) return;
      $('market-match').value = button.dataset.id;
      renderComparison();
      $('market-match').scrollIntoView({block: 'center', behavior: 'smooth'});
    });
    load();
    loadConnectivity();
  });
})();

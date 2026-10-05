/*
 * Oportunități de voluntariat: listă (panou de plecări), filtre, fereastra de detalii și legături directe.
 *
 * LEGĂTURI DIRECTE (pot fi trimise prietenilor, funcționează cu butonul Înapoi):
 *   #/evenimente                    lista
 *   #/evenimente/12                 lista, cu detaliile oportunității 12 deschise
 *   #/evenimente?cause=Mediu        lista, cu filtrul "Cauză: Mediu" deja pus (la fel pentru county, city, age, when, mode)
 *
 * FORMATUL UNUI EVENIMENT (doar id și title sunt obligatorii; ce lipsește nu se afișează,
 * iar un filtru apare doar dacă există date pentru el):
 *   {
 *     id: 7, title: "Plantare de copaci", organization: "Grupul Verde", cause: "Mediu",
 *     city: "Brașov", county: "Brașov", address: "Parcul din Noua",
 *     mode: "in-person" | "remote" | "hybrid",
 *     ageMin: 14, ageMax: 18,
 *     start: "2027-03-20T10:00:00Z",            // ISO 8601 (sau doar "2027-03-20")
 *     commitment: "4 ore, o singură dată", spots: 30,
 *     summary: "Descriere scurtă", tasks: ["..."], requirements: ["..."],
 *     schedule: [{ day: "Sâmbătă", time: "10:00 – 14:00", activity: "Plantare" }],
 *     contact: "email@organizatie.ro", accessible: true, language: "Română", pay: "Gratuit"
 *   }
 *
 * CUM CONECTEZI BACKENDUL
 *   1. window.APP_CONFIG = { eventsSource: 'api' } în interface.html (implicit: 'sample' = demo_data.json).
 *   2. Ce întoarce acum GET /events/ se transformă în fromApi() de mai jos. Când backendul primește
 *      câmpuri noi (vârstă, mod, județ, sarcini...), le mapezi DOAR acolo; filtrele apar singure.
 *   3. Sau pui propria sursă:  App.evenimente.setSource({ list: async () => [ ...evenimente... ] });
 *   4. Filtre noi: adaugă o linie în FILTERS.
 */
(function () {
  'use strict';
  const { h } = App;

  /* ---------- Etichete și formatare ---------- */
  const MODE_LABEL = { 'in-person': 'La fața locului', remote: 'Online', hybrid: 'Mixt' };
  const WHEN_LABEL = { weekend: 'Weekend', weekday: 'În timpul săptămânii' };
  const DAYS = ['Dum', 'Lun', 'Mar', 'Mie', 'Joi', 'Vin', 'Sâm'];
  const DAYS_LONG = ['duminică', 'luni', 'marți', 'miercuri', 'joi', 'vineri', 'sâmbătă'];
  const MONTHS = ['ian', 'feb', 'mar', 'apr', 'mai', 'iun', 'iul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const pad = (n) => String(n).padStart(2, '0');

  const format = {
    // { primary: "Sâm 09:00", secondary: "12 oct" }
    when(ev) {
      const d = ev._date;
      if (!d) return { primary: 'Data de stabilit', secondary: '' };
      const time = ev._hasTime ? ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) : '';
      return { primary: DAYS[d.getDay()] + time, secondary: d.getDate() + ' ' + MONTHS[d.getMonth()] };
    },
    whenLong(ev) {
      const d = ev._date;
      if (!d) return '';
      const time = ev._hasTime ? ', ora ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) : '';
      return DAYS_LONG[d.getDay()] + ', ' + d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear() + time;
    },
    age(ev) {
      if (ev.ageMin != null && ev.ageMax != null) return ev.ageMin + '–' + ev.ageMax + ' ani';
      if (ev.ageMin != null) return 'de la ' + ev.ageMin + ' ani';
      if (ev.ageMax != null) return 'până la ' + ev.ageMax + ' ani';
      return '';
    },
    spots(ev) {
      if (ev.spots == null) return '';
      return ev.spots + (ev.spots === 1 ? ' loc' : ' locuri');
    },
  };

  const unique = (items, key) =>
    [...new Set(items.map((ev) => ev[key]).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'ro'));
  const asOptions = (values) => values.map((v) => [v, v]);
  const present = (items, key, labels) =>
    Object.keys(labels).filter((v) => items.some((ev) => ev[key] === v)).map((v) => [v, labels[v]]);

  /* ---------- Filtre (adaugă aici altele) ---------- */
  // type: search | chips | select. `options(items)` întoarce [[valoare, etichetă], ...]; fără opțiuni, filtrul nu apare.
  const FILTERS = [
    {
      key: 'search', type: 'search', label: 'Caută', placeholder: 'ex: câini, matematică, curățenie',
      match: (ev, v) => [ev.title, ev.summary, ev.organization, ev.cause, ev.place].some((t) => (t || '').toLowerCase().includes(v)),
    },
    { key: 'cause', type: 'chips', label: 'Cauză', options: (items) => asOptions(unique(items, 'cause')) },
    { key: 'county', type: 'select', label: 'Județ', all: 'Toată țara', options: (items) => asOptions(unique(items, 'county')) },
    { key: 'city', type: 'select', label: 'Oraș', all: 'Toate orașele', options: (items) => asOptions(unique(items, 'city')) },
    {
      key: 'age', type: 'select', label: 'Vârsta mea', all: 'Orice vârstă',
      options: (items) => (items.some((ev) => ev.ageMin != null || ev.ageMax != null)
        ? [14, 15, 16, 17, 18].map((a) => [String(a), a + ' ani']) : []),
      match: (ev, v) => (ev.ageMin == null || ev.ageMin <= +v) && (ev.ageMax == null || ev.ageMax >= +v),
    },
    { key: 'when', type: 'select', label: 'Program', all: 'Oricând', options: (items) => present(items, 'when', WHEN_LABEL) },
    { key: 'mode', type: 'select', label: 'Cum participi', all: 'Oricum', options: (items) => present(items, 'mode', MODE_LABEL) },
    { key: 'pay', type: 'select', label: 'Plată', all: 'Oricare', options: (items) => asOptions(unique(items, 'pay')) },
    { key: 'language', type: 'select', label: 'Limbă', all: 'Oricare', options: (items) => asOptions(unique(items, 'language')) },
  ];

  /* ---------- Surse de date ---------- */
  const ACTION_LABEL = {
    direct: 'Direct', logistics: 'Logistică', 'creative / digital': 'Creativ / digital',
    voluntariat: 'Voluntariat', 'educație': 'Educație', cultural: 'Cultural',
  };
  const PAY_LABEL = { free: 'Gratuit', gratuit: 'Gratuit', paid: 'Plătit', platit: 'Plătit' };
  const DEMO_CAUSE_LABEL = {
    environment: 'Mediu', education: 'Educație', community: 'Comunitate',
    animal_welfare: 'Animale', charity: 'Caritate', other: 'Altele',
  };
  const DEMO_CITY_METADATA = {
    'cluj-napoca': { name: 'Cluj-Napoca', county: 'Cluj' },
    iasi: { name: 'Iași', county: 'Iași' },
    brasov: { name: 'Brașov', county: 'Brașov' },
    bucuresti: { name: 'București', county: 'București' },
  };

  function fromRequestPayload(payload, id, image, ageMin) {
    const location = payload.location.split(',').map((part) => part.trim()).filter(Boolean);
    if (location[location.length - 1].toLowerCase() === 'romania') location.pop();
    const rawCity = location.pop() || '';
    const cityKey = rawCity.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const cityMetadata = DEMO_CITY_METADATA[cityKey];
    const city = cityMetadata ? cityMetadata.name : rawCity;
    const address = location.join(', ');
    const start = new Date(payload.start_datetime);
    const end = new Date(payload.end_datetime);
    const durationMinutes = Math.round((end - start) / 60000);
    const hours = Math.floor(durationMinutes / 60);
    const minutes = durationMinutes % 60;
    const duration = [
      hours ? hours + (hours === 1 ? ' oră' : ' ore') : '',
      minutes ? minutes + ' min' : '',
    ].filter(Boolean).join(' și ');
    const time = (date) => pad(date.getHours()) + ':' + pad(date.getMinutes());

    return {
      id,
      image,
      title: payload.title,
      organization: payload.organizer_name,
      cause: DEMO_CAUSE_LABEL[payload.category],
      city,
      county: cityMetadata ? cityMetadata.county : undefined,
      mode: 'in-person',
      address: address || undefined,
      ageMin,
      start: payload.start_datetime,
      commitment: duration ? duration + ', o singură dată' : undefined,
      spots: payload.volunteers_needed,
      summary: payload.description,
      tasks: [payload.volunteer_tasks],
      requirements: payload.requirements ? [payload.requirements] : [],
      schedule: [{
        day: DAYS_LONG[start.getDay()],
        time: time(start) + ' – ' + time(end),
        activity: payload.title,
      }],
      contact: [payload.contact_email, payload.contact_phone].filter(Boolean).join(' · '),
    };
  }

  function fromDemoRequest(request, index) {
    return fromRequestPayload(
      request.payload,
      'demo-' + (index + 1),
      request.image ? new URL(request.image, window.DEMO_EVENTS_URL).href : undefined,
      index % 10 < 7 ? 16 : 14,
    );
  }

  function fromPublishedRequest(request) {
    const payload = {
      title: request.title,
      organizer_name: request.organizer_name,
      category: request.category,
      location: request.location,
      start_datetime: request.start_datetime,
      end_datetime: request.end_datetime,
      volunteers_needed: request.volunteers_needed,
      description: request.description,
      volunteer_tasks: request.volunteer_tasks,
      requirements: request.requirements,
      contact_email: request.contact_email,
      contact_phone: request.contact_phone,
    };
    return fromRequestPayload(
      payload,
      'request-' + request.id,
      request.image_url ? new URL(request.image_url, App.cfg.apiBase).href : undefined,
      14,
    );
  }

  // Transformă un rând din GET /events/ (Filter.py) în formatul de mai sus.
  // Acum backendul are doar: id, title, city, date, pay_type, pay, action, accessibility, language (+ distance_km).
  function fromApi(row) {
    const action = String(row.action || '').toLowerCase();
    return {
      id: row.id,
      title: row.title,
      cause: ACTION_LABEL[action] || (action ? action.charAt(0).toUpperCase() + action.slice(1) : undefined),
      city: row.city || undefined,
      start: row.date,
      pay: row.pay_type ? PAY_LABEL[String(row.pay_type).toLowerCase()] || row.pay_type : undefined,
      language: row.language || undefined,
      accessible: !!row.accessibility,
      distanceKm: row.distance_km,
    };
  }

  const sources = {
    sample: {
      async list() {
        if (!window.DEMO_EVENTS_URL) throw new Error('Nu este configurată sursa datelor demo.');
        const [response, published] = await Promise.all([
          fetch(window.DEMO_EVENTS_URL),
          App.api('/published-events/', { auth: false }),
        ]);
        if (!response.ok) throw new Error('Nu am putut încărca datele demo (' + response.status + ').');
        const data = await response.json();
        if (!Array.isArray(data.event_requests)) throw new Error('Format invalid pentru datele demo.');
        if (!Array.isArray(published)) throw new Error('Format invalid pentru oportunitățile aprobate.');
        return data.event_requests.map(fromDemoRequest).concat(published.map(fromPublishedRequest));
      },
    },
    api: {
      async list() {
        const [data, published] = await Promise.all([
          App.api('/events/', { auth: false }),
          App.api('/published-events/', { auth: false }),
        ]);
        return data.events.map(fromApi).concat(published.map(fromPublishedRequest));
      },
    },
  };
  let source = sources[App.cfg.eventsSource] || sources.sample;

  /* ---------- Date normalizate, cu cache ---------- */
  const store = { items: null, promise: null };

  function normalize(raw) {
    const ev = Object.assign({}, raw);
    ev.id = String(raw.id);
    const date = raw.start ? new Date(raw.start) : null;
    ev._date = date && !isNaN(date) ? date : null;
    ev._hasTime = /[T ]\d{1,2}:\d{2}/.test(String(raw.start || ''));
    ev.place = ev.mode === 'remote'
      ? 'Online'
      : [ev.city, ev.county && ev.county !== ev.city ? ev.county : ''].filter(Boolean).join(', ');
    ev.when = ev._date ? (ev._date.getDay() === 0 || ev._date.getDay() === 6 ? 'weekend' : 'weekday') : undefined;
    return ev;
  }

  function loadItems(force) {
    if (store.promise && !force) return store.promise;
    store.promise = source.list().then((list) => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      store.items = list.map(normalize)
        .filter((ev) => !ev._date || ev._date >= today) // oportunitățile trecute nu mai sunt oportunități
        .sort((a, b) => (a._date ? a._date.getTime() : Infinity) - (b._date ? b._date.getTime() : Infinity));
      return store.items;
    });
    store.promise.catch(() => { store.promise = null; });
    return store.promise;
  }

  /* ---------- Piese de interfață ---------- */
  const board = (cls, children) => h('div', { class: 'board ' + cls }, children);

  function boardRow(ev, index) {
    const when = format.when(ev);
    return h('a', { class: 'board-row', href: '#/evenimente/' + ev.id, style: '--i:' + index },
      h('div', { class: 'board-photo' },
        ev.image ? h('img', { class: 'board-thumb', src: ev.image, alt: '', loading: 'lazy' }) : null),
      h('div', { class: 'board-when' }, when.primary, when.secondary ? h('small', null, when.secondary) : null),
      h('div', { class: 'board-title' },
        h('strong', null, ev.title),
        ev.cause ? h('span', null, ev.cause + (ev.organization ? ', ' + ev.organization : '')) : (ev.organization ? h('span', null, ev.organization) : null)),
      h('div', { class: 'board-place' }, ev.place || ''),
      h('div', { class: 'board-extra' },
        h('span', { class: 'board-age' }, format.age(ev)),
        h('span', { class: 'board-spots' }, format.spots(ev))));
  }

  const boardHead = () => h('div', { class: 'board-head', 'aria-hidden': 'true' },
    h('span', { class: 'board-head-photo' }), h('span', { class: 'board-head-when' }, 'Când'),
    h('span', { class: 'board-head-title' }, 'Ce'), h('span', { class: 'board-head-place' }, 'Unde'),
    h('span', { class: 'board-head-age' }, 'Vârstă'), h('span', { class: 'board-head-spots' }, 'Locuri'));

  function skeleton(rows) {
    return h('div', { class: 'board light skeleton', role: 'status', 'aria-label': 'Se încarcă oportunitățile' },
      Array.from({ length: rows }, () => h('div', { class: 'board-row' },
        h('div', { class: 'board-photo' }, h('span', { class: 'skel w1' })),
        h('div', { class: 'board-when' }, h('span', { class: 'skel w1' })),
        h('div', { class: 'board-title' }, h('span', { class: 'skel w2' }), h('span', { class: 'skel w3' })),
        h('div', { class: 'board-place' }, h('span', { class: 'skel w3' })),
        h('div', { class: 'board-extra' }, h('span', { class: 'skel w3' })))));
  }

  const section = (title, content) => (content ? h('section', null, h('h3', null, title), content) : null);
  const list = (items) => (items && items.length ? h('ul', null, items.map((t) => h('li', null, t))) : null);

  function fact(label, value) {
    return value ? h('div', null, h('dt', null, label), h('dd', null, value)) : null;
  }

  function detail(ev, dialog) {
    const role = App.session.role;
    let primary = null;
    let note = null;
    if (role === 'organization' || role === 'admin') {
      note = h('p', { class: 'muted' }, 'Aplicarea este pentru conturile de elev. Cu un cont de ' + (role === 'admin' ? 'administrator' : 'organizație') + ' poți doar vedea oportunitatea.');
    } else {
      primary = h('a', { class: 'btn primary', href: '#/aplica/' + ev.id }, 'Aplică la această oportunitate');
      if (!App.session.name) note = h('p', { class: 'muted' }, 'Ai nevoie de un cont de elev. Te ducem la autentificare, apoi revii aici.');
    }
    const schedule = ev.schedule && ev.schedule.length
      ? h('table', { class: 'schedule' },
        h('thead', null, h('tr', null, h('th', null, 'Ziua'), h('th', null, 'Interval'), h('th', null, 'Activitate'))),
        h('tbody', null, ev.schedule.map((s) => h('tr', null, h('td', null, s.day), h('td', null, s.time), h('td', null, s.activity)))))
      : null;
    return [
      h('div', { class: 'ev-dialog-body' },
        ev.image ? h('img', { class: 'ev-image', src: ev.image, alt: ev.title }) : null,
        h('div', null,
          ev.cause ? h('span', { class: 'ev-tag' }, ev.cause) : null,
          h('h2', { id: 'ev-title' }, ev.title),
          ev.summary ? h('p', { class: 'ev-lead' }, ev.summary) : null),
        h('dl', { class: 'facts' },
          fact('Când', format.whenLong(ev)),
          fact('Unde', [ev.place, ev.mode === 'remote' ? '' : ev.address].filter(Boolean).join(', ')),
          fact('Cum participi', MODE_LABEL[ev.mode]),
          fact('Vârstă', format.age(ev)),
          fact('Cât timp', ev.commitment),
          fact('Locuri', format.spots(ev)),
          fact('Organizator', ev.organization),
          fact('Limbă', ev.language),
          fact('Plată', ev.pay),
          fact('Acces', ev.accessible ? 'Accesibil persoanelor cu dizabilități' : '')),
        section('Ce vei face', list(ev.tasks)),
        section('Ce trebuie să ai', list(ev.requirements)),
        section('Program', schedule),
        section('Contact organizator', ev.contact ? h('p', null, ev.contact) : null)),
      h('div', { class: 'ev-cta' }, primary,
        h('button', { type: 'button', class: 'btn ghost', onclick: () => dialog.close() }, 'Închide'),
        note),
    ];
  }

  /* ---------- Pagina ---------- */
  const view = {
    id: 'evenimente',
    label: 'Oportunități',
    order: 10,
    keepScroll: true, // deschiderea detaliilor nu trebuie să arunce pagina în sus

    render(el) {
      const ui = this.ui = {
        values: {},
        openId: null,
        ignoreClose: false,
        dialog: h('dialog', { class: 'ev-dialog', 'aria-labelledby': 'ev-title' }),
        finder: h('form', { class: 'finder', role: 'search' }),
        bar: h('div', { class: 'result-bar' }),
        results: h('div', { 'aria-live': 'polite' }),
      };
      ui.finder.addEventListener('submit', (e) => e.preventDefault());
      ui.dialog.addEventListener('click', (e) => { if (e.target === ui.dialog) ui.dialog.close(); });
      ui.dialog.addEventListener('close', () => {
        if (ui.ignoreClose) { ui.ignoreClose = false; return; }
        ui.openId = null;
        if (/^#\/evenimente\/[^/?]+/.test(location.hash)) location.hash = '#/evenimente';
      });
      el.append(
        h('div', { class: 'heading' }, h('div', null, h('h2', null, 'Oportunități de voluntariat'),
          h('p', { class: 'lead', style: 'margin:8px 0 0' }, 'Alege după loc, cauză, vârstă și program. Deschide o oportunitate ca să vezi ce ai de făcut.'))),
        ui.finder, ui.bar, ui.results, ui.dialog);
    },

    show(el, route) {
      const ui = this.ui;
      const query = route && route.query;
      if (query && [...query.keys()].length) {
        FILTERS.forEach((f) => { if (query.has(f.key)) ui.values[f.key] = query.get(f.key); });
        history.replaceState(null, '', '#/evenimente' + (route.sub ? '/' + route.sub : ''));
      }
      const wanted = route && route.sub ? route.sub.split('/')[0] : '';
      if (store.items) { this.paint(); this.syncDialog(wanted); return; }
      this.loadAndPaint(wanted);
    },

    hide() {
      const ui = this.ui;
      if (ui && ui.dialog.open) { ui.ignoreClose = true; ui.dialog.close(); ui.openId = null; }
    },

    async loadAndPaint(wanted, force) {
      const ui = this.ui;
      ui.bar.replaceChildren();
      ui.results.replaceChildren(skeleton(4));
      ui.results.setAttribute('aria-busy', 'true');
      try {
        await loadItems(force);
        ui.results.removeAttribute('aria-busy');
        this.paint();
        this.syncDialog(wanted);
      } catch (err) {
        ui.results.removeAttribute('aria-busy');
        ui.finder.replaceChildren();
        ui.results.replaceChildren(h('div', { class: 'panel-note error', role: 'alert' },
          h('h3', null, 'Nu am putut încărca oportunitățile'),
          h('p', null, err.message),
          h('div', { class: 'actions' },
            h('button', { type: 'button', class: 'btn', onclick: () => this.loadAndPaint(wanted, true) }, 'Încearcă din nou'))));
      }
    },

    // Reconstruiește controalele (după încărcare sau după ștergerea unor filtre) și apoi lista.
    paint() {
      const ui = this.ui;
      const items = store.items;
      this.filters = FILTERS.map((f) => Object.assign({}, f, { current: f.options ? f.options(items) : [] }))
        .filter((f) => f.type === 'search' || f.current.length);
      // O valoare venită din link sau rămasă din alt moment, care nu mai există în date, se ignoră.
      this.filters.forEach((f) => {
        const v = ui.values[f.key];
        if (v && f.type !== 'search' && !f.current.some(([val]) => val === v)) delete ui.values[f.key];
      });

      const search = this.filters.find((f) => f.type === 'search');
      const chips = this.filters.find((f) => f.type === 'chips');
      const selects = this.filters.filter((f) => f.type === 'select');
      this.chipButtons = [];

      const searchField = search && h('label', { class: 'field search' }, h('span', null, search.label),
        h('input', {
          type: 'search', placeholder: search.placeholder, value: ui.values.search || '', autocomplete: 'off',
          oninput: (e) => { ui.values.search = e.target.value.trim().toLowerCase(); this.refresh(); },
        }));

      const chipGroup = chips && h('div', { role: 'group', 'aria-label': chips.label, class: 'chip-row' },
        [['', 'Toate']].concat(chips.current).map(([value, label]) => {
          const btn = h('button', {
            type: 'button', class: 'chip-btn', 'data-value': value,
            onclick: () => { ui.values.cause = value; this.refresh(); },
          }, label);
          this.chipButtons.push(btn);
          return btn;
        }));

      const activeSelects = selects.filter((f) => ui.values[f.key]).length;
      const moreFilters = selects.length && h('details', { class: 'more-filters' },
        h('summary', null, 'Mai multe filtre' + (activeSelects ? ' (' + activeSelects + ' active)' : '')),
        h('div', { class: 'row' }, selects.map((f) => h('label', { class: 'field' }, h('span', null, f.label),
          h('select', { onchange: (e) => { ui.values[f.key] = e.target.value; this.refresh(); } },
            h('option', { value: '' }, f.all),
            f.current.map(([value, label]) => h('option', { value, selected: ui.values[f.key] === value }, label)))))));
      if (moreFilters) moreFilters.open = activeSelects > 0 || window.matchMedia('(min-width: 760px)').matches;

      ui.finder.replaceChildren(...[searchField, chipGroup, moreFilters].filter(Boolean));
      this.refresh();
    },

    shown() {
      const ui = this.ui;
      return store.items.filter((ev) => this.filters.every((f) => {
        const v = ui.values[f.key];
        if (!v) return true;
        if (f.match) return f.match(ev, v);
        return String(ev[f.key] ?? '') === v;
      }));
    },

    activeLabels() {
      const ui = this.ui;
      return this.filters.filter((f) => f.type !== 'search' && ui.values[f.key]).map((f) => {
        const hit = f.current.find(([val]) => val === ui.values[f.key]);
        return { key: f.key, text: f.label + ': ' + (hit ? hit[1] : ui.values[f.key]) };
      }).concat(ui.values.search ? [{ key: 'search', text: 'Căutare: „' + ui.values.search + '”' }] : []);
    },

    clearFilter(key) {
      delete this.ui.values[key];
      this.paint();
    },

    // Actualizează doar lista, bara de rezultate și starea butoanelor (nu atinge câmpurile în care scrie omul).
    refresh() {
      const ui = this.ui;
      const shown = this.shown();
      const active = this.activeLabels();
      this.chipButtons.forEach((btn) => btn.setAttribute('aria-pressed', String((ui.values.cause || '') === btn.dataset.value)));

      App.fill(ui.bar,
        h('p', { class: 'status-line', style: 'margin:0' },
          shown.length === 1 ? '1 oportunitate' : shown.length + ' oportunități', ', în ordinea datei'),
        active.length
          ? h('div', { class: 'active-filters' },
            active.map((a) => h('button', { type: 'button', class: 'btn ghost', 'aria-label': 'Scoate filtrul ' + a.text, onclick: () => this.clearFilter(a.key) }, a.text + ' ×')),
            h('button', { type: 'button', class: 'btn ghost', onclick: () => { ui.values = {}; this.paint(); } }, 'Șterge toate filtrele'))
          : null);

      if (!shown.length) { ui.results.replaceChildren(this.emptyState(active)); return; }
      ui.results.replaceChildren(board('light', [boardHead(), shown.map((ev, i) => boardRow(ev, i))]));
    },

    emptyState(active) {
      const ui = this.ui;
      if (!store.items.length) {
        return h('div', { class: 'panel-note' },
          h('h3', null, 'Încă nu sunt oportunități publicate'),
          h('p', null, 'Revino în câteva zile. Dacă faci parte dintr-o organizație, poți propune o activitate din contul organizației.'));
      }
      return h('div', { class: 'panel-note' },
        h('h3', null, 'Nicio oportunitate nu se potrivește'),
        h('p', null, 'Ai ales: ' + active.map((a) => a.text).join(', ') + '.'),
        h('p', null, 'Ca să vezi mai multe rezultate, scoate un filtru sau caută mai larg:'),
        h('div', { class: 'actions' },
          active.map((a) => h('button', { type: 'button', class: 'btn ghost', onclick: () => this.clearFilter(a.key) }, 'Scoate: ' + a.text)),
          h('button', { type: 'button', class: 'btn', onclick: () => { ui.values = {}; this.paint(); } }, 'Șterge toate filtrele')));
    },

    // Deschide / închide fereastra de detalii în funcție de adresă (#/evenimente/ID).
    syncDialog(id) {
      const ui = this.ui;
      if (!id) {
        if (ui.dialog.open) { ui.ignoreClose = true; ui.dialog.close(); }
        ui.openId = null;
        return;
      }
      const ev = store.items.find((e) => e.id === id);
      if (!ev) {
        if (ui.dialog.open) { ui.ignoreClose = true; ui.dialog.close(); }
        ui.openId = null;
        App.toast('Nu am găsit această oportunitate. Poate a trecut data sau a fost retrasă.', 'error');
        history.replaceState(null, '', '#/evenimente');
        return;
      }
      if (ui.openId === id && ui.dialog.open) return;
      ui.dialog.replaceChildren(...detail(ev, ui.dialog));
      ui.openId = id;
      if (!ui.dialog.open) ui.dialog.showModal();
      ui.dialog.scrollTop = 0;
    },
  };
  App.register(view);

  /* ---------- Ce pot folosi celelalte pagini ---------- */
  App.evenimente = {
    FILTERS, fromApi, format, MODE_LABEL,
    ui: { row: boardRow, head: boardHead, skeleton },
    all: (force) => loadItems(force),
    async get(id) {
      const items = await loadItems();
      return items.find((ev) => ev.id === String(id)) || null;
    },
    async upcoming(n) { return (await loadItems()).slice(0, n); },
    async causes() {
      const items = await loadItems();
      const counts = new Map();
      items.forEach((ev) => { if (ev.cause) counts.set(ev.cause, (counts.get(ev.cause) || 0) + 1); });
      return [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ro'));
    },
    setSource(newSource) {
      source = newSource;
      store.items = null;
      store.promise = null;
      // App.register keeps a copy of the page object, so ask the registry for the live one.
      const live = App.getView('evenimente');
      if (live && live.mounted && live.el.classList.contains('active')) live.loadAndPaint('', true);
    },
    refresh() {
      store.items = null;
      store.promise = null;
      const live = App.getView('evenimente');
      if (live && live.mounted && live.el.classList.contains('active')) live.loadAndPaint('', true);
    },
  };
})();

/*
 * Evenimente - lista de anunțuri de voluntariat + fereastra de detalii la click.
 * Versiune generală a exemplului lui Robert: nu mai are date scrise în cod, ia evenimentele
 * dintr-o SURSĂ care se poate schimba (exemple sau backend).
 *
 * FORMATUL UNUI EVENIMENT (toate câmpurile în afară de id și title sunt opționale;
 * ce lipsește pur și simplu nu se afișează):
 *   {
 *     id: 5,
 *     title: "Plantare de copaci",
 *     organization: "Grupul Eco Local",
 *     city: "București",              country: "România",
 *     category: "Mediu",              availability: "Weekend",
 *     description: "Plantăm puieți și îngrijim zonele verzi din cartier.",
 *     image: "https://.../poza-principala.jpg",
 *     photos: ["https://.../poza-1.jpg", "https://.../poza-2.jpg"],
 *     schedule: [{ day: "Sâmbătă", time: "09:00 - 13:00", activity: "Plantare" }],
 *     contact: "eco@grupulecolocal.ro",
 *     date: "2027-03-20", pay: "Gratuit", language: "Romanian", accessibility: true
 *   }
 *
 * CUM CONECTEZI BACKENDUL
 *   1. Alege sursa în interface.html, înainte de core.js:
 *        <script>window.APP_CONFIG = { eventsSource: 'api' };</script>      // 'sample' (implicit) sau 'api'
 *   2. Dacă backendul întoarce alte câmpuri, schimbă DOAR funcția fromApi() de mai jos.
 *   3. Sau pune propria sursă din orice alt fișier:
 *        App.evenimente.setSource({ list: async () => [ ...evenimente în formatul de mai sus... ] });
 *   4. Filtre noi: adaugă o linie în FILTERS. Opțiunile dintr-un select se iau automat din date.
 */
(function () {
  'use strict';
  const { h } = App;

  /* ---------- Filtre (adaugă aici altele) ---------- */
  const FILTERS = [
    {
      key: 'search', label: 'Caută', type: 'search', placeholder: 'Titlu sau descriere...',
      match: (ev, value) => [ev.title, ev.description, ev.organization].some((t) => (t || '').toLowerCase().includes(value)),
    },
    { key: 'city', label: 'Oraș', type: 'select', all: 'Toate orașele' },
    { key: 'category', label: 'Categorie', type: 'select', all: 'Toate categoriile' },
    { key: 'availability', label: 'Disponibilitate', type: 'select', all: 'Oricând' },
    { key: 'pay', label: 'Plată', type: 'select', all: 'Oricare' },
    { key: 'language', label: 'Limbă', type: 'select', all: 'Oricare' },
  ];

  /* ---------- Surse de date ---------- */
  const PAY_LABEL = { free: 'Gratuit', paid: 'Plătit' };
  const ACTION_LABEL = { direct: 'Direct', logistics: 'Logistică', 'creative / digital': 'Creativ / digital' };

  // Weekend / În timpul săptămânii, dedus din data evenimentului (dacă o avem).
  function availabilityFromDate(date) {
    const d = new Date(date);
    if (isNaN(d)) return undefined;
    return d.getDay() === 0 || d.getDay() === 6 ? 'Weekend' : 'Săptămână';
  }

  // Transformă un rând din GET /events/ (Filter.py) în formatul de mai sus.
  // Dacă backendul primește câmpuri noi (descriere, poze, orar, contact...), le mapezi aici.
  function fromApi(row) {
    return {
      id: row.id,
      title: row.title,
      organization: row.organization,
      city: row.city,
      country: row.country,
      category: ACTION_LABEL[row.action] || row.action,
      availability: row.availability || availabilityFromDate(row.date),
      description: row.description,
      image: row.image,
      photos: row.photos,
      schedule: row.schedule,
      contact: row.contact,
      date: row.date,
      pay: row.pay_type === 'paid' ? 'Plătit' + (row.pay ? ' (' + row.pay + ')' : '') : PAY_LABEL[row.pay_type],
      language: row.language,
      accessibility: !!row.accessibility,
    };
  }

  const sources = {
    sample: { label: 'Date de exemplu', list: async () => window.EXEMPLE_EVENIMENTE || [] },
    api: {
      label: null,
      list: async () => (await App.api('/events/', { auth: false })).events.map(fromApi),
    },
  };
  let source = sources[App.cfg.eventsSource] || sources.sample;

  /* ---------- Randare ---------- */
  const isUrl = (u) => typeof u === 'string' && /^https?:\/\//i.test(u);

  function picture(url, alt, cls) {
    if (!isUrl(url)) return h('div', { class: cls + ' ev-noimg' });
    return h('img', { class: cls, src: url, alt, loading: 'lazy', onerror: (e) => e.target.replaceWith(h('div', { class: cls + ' ev-noimg' })) });
  }

  function card(ev, open) {
    const place = [ev.city, ev.availability].filter(Boolean).join(' • ');
    const node = h('article', { class: 'card ev-card', tabindex: 0, role: 'button' },
      picture(ev.image, ev.title, 'ev-cover'),
      h('div', { class: 'content' },
        ev.category ? h('div', { class: 'category' }, ev.category) : null,
        h('h3', null, ev.title),
        ev.organization ? h('p', { class: 'ev-org' }, ev.organization) : null,
        place ? h('p', null, place) : null));
    node.addEventListener('click', () => open(ev));
    node.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(ev); } });
    return node;
  }

  function detailRow(label, value) {
    return value ? h('p', null, h('b', null, label + ': '), value) : null;
  }

  function buildDetails(ev, dialog) {
    const photos = (ev.photos || []).filter(isUrl);
    const schedule = ev.schedule || [];
    return [
      picture(ev.image, ev.title, 'ev-detail-image'),
      h('div', { class: 'ev-detail-body' },
        ev.category ? h('span', { class: 'ev-tag' }, ev.category) : null,
        h('h2', null, ev.title),
        detailRow('Organizație', ev.organization),
        detailRow('Locație', [ev.city, ev.country].filter(Boolean).join(', ')),
        detailRow('Data', ev.date),
        detailRow('Disponibilitate', ev.availability),
        detailRow('Plată', ev.pay),
        detailRow('Limbă', ev.language),
        ev.accessibility ? h('p', null, '♿ Accesibil') : null,
        ev.description ? [h('h3', null, 'Descriere'), h('p', null, ev.description)] : null,
        photos.length ? [h('h3', null, 'Poze'),
          h('div', { class: 'ev-gallery' }, photos.map((p) => h('img', { src: p, alt: 'Fotografie: ' + ev.title, loading: 'lazy' })))] : null,
        schedule.length ? [h('h3', null, 'Orar'),
          h('table', { class: 'ev-schedule' },
            h('thead', null, h('tr', null, h('th', null, 'Ziua'), h('th', null, 'Interval'), h('th', null, 'Activitate'))),
            h('tbody', null, schedule.map((s) => h('tr', null, h('td', null, s.day), h('td', null, s.time), h('td', null, s.activity)))))] : null,
        detailRow('Contact', ev.contact),
        h('button', { type: 'button', class: 'btn', onclick: () => dialog.close() }, 'Închide')),
    ];
  }

  /* ---------- Pagina ---------- */
  App.register({
    id: 'evenimente',
    label: 'Evenimente',
    order: 10,
    render(el) {
      const state = { items: [], values: {} };
      const dialog = h('dialog', { class: 'ev-dialog' });
      dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); }); // click pe fundal închide
      const controls = h('div', { class: 'row' });
      const grid = h('div', { class: 'grid' });
      const status = h('p', { class: 'status-line' });
      const banner = h('p', { class: 'ev-banner' });
      this.dom = { state, controls, grid, status, banner };

      const open = (ev) => { dialog.replaceChildren(...buildDetails(ev, dialog)); dialog.showModal(); };

      const apply = () => {
        const shown = state.items.filter((ev) => FILTERS.every((f) => {
          const value = state.values[f.key];
          if (!value) return true;
          if (f.match) return f.match(ev, value.toLowerCase());
          return String(ev[f.key] ?? '') === value;
        }));
        grid.replaceChildren(...shown.map((ev) => card(ev, open)));
        status.className = 'status-line';
        status.textContent = shown.length ? shown.length + ' anunțuri.' : 'Nu există anunțuri care corespund filtrelor.';
      };

      // Controalele se refac din datele încărcate: un select apare doar dacă există valori pentru el.
      this.buildControls = () => {
        controls.replaceChildren(...FILTERS.map((f) => {
          if (f.type === 'search') {
            return h('label', { class: 'field' }, h('span', null, f.label),
              h('input', { type: 'search', placeholder: f.placeholder, value: state.values[f.key] || '',
                oninput: (e) => { state.values[f.key] = e.target.value.trim(); apply(); } }));
          }
          const options = [...new Set(state.items.map((ev) => ev[f.key]).filter(Boolean))].sort();
          if (!options.length) return null;
          return h('label', { class: 'field' }, h('span', null, f.label),
            h('select', { onchange: (e) => { state.values[f.key] = e.target.value; apply(); } },
              h('option', { value: '' }, f.all),
              options.map((o) => h('option', { value: o, selected: state.values[f.key] === o }, o))));
        }));
      };

      this.load = async () => {
        status.className = 'status-line';
        status.textContent = 'Se încarcă…';
        grid.replaceChildren();
        banner.textContent = source.label ? '⚠ ' + source.label + ' – nu sunt evenimente reale.' : '';
        banner.hidden = !source.label;
        try {
          state.items = await source.list();
          this.buildControls();
          apply();
        } catch (err) {
          status.className = 'status-line error';
          status.textContent = err.message;
        }
      };

      el.append(
        h('div', { class: 'heading' }, h('div', null, h('div', { class: 'eyebrow' }, 'Voluntariat'), h('h2', null, 'Anunțuri de voluntariat'))),
        banner, h('div', { class: 'form filter-form' }, controls), status, grid, dialog);
    },
    show() { this.load(); },
  });

  /* ---------- Ce poate folosi restul aplicației ---------- */
  App.evenimente = {
    FILTERS,
    fromApi,
    setSource(newSource) {
      source = newSource;
      const view = App.getView('evenimente');
      if (view && view.mounted) view.load();
    },
  };
})();

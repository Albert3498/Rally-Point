/* Events: public search of published events (GET /events/). */
(function () {
  'use strict';
  const { h } = App;

  // Keep these in sync with ALLOWED_* in Filter.py.
  const PAY = [['free', 'Gratuit'], ['paid', 'Plătit']];
  const ACTIONS = [['direct', 'Direct'], ['logistics', 'Logistică'], ['creative / digital', 'Creativ / digital']];
  const LANGUAGES = ['Romanian', 'English', 'Russian', 'French', 'Arabic', 'Spanish', 'Sign Language'];
  const YES_NO = [['true', 'Da'], ['false', 'Nu']];

  function select(name, label, options) {
    return h('label', { class: 'field' }, h('span', null, label),
      h('select', { name },
        h('option', { value: '' }, 'Oricare'),
        options.map((o) => Array.isArray(o)
          ? h('option', { value: o[0] }, o[1])
          : h('option', { value: o }, o))));
  }

  function input(name, label, attrs) {
    return h('label', { class: 'field' }, h('span', null, label), h('input', Object.assign({ name }, attrs)));
  }

  function eventCard(ev) {
    const place = [ev.city, ev.country].filter(Boolean).join(', ');
    const pay = ev.pay_type === 'paid' ? 'Plătit' + (ev.pay ? ' (' + ev.pay + ')' : '') : 'Gratuit';
    return h('article', { class: 'card' },
      h('div', { class: 'content' },
        h('div', { class: 'category' }, ev.action || 'Eveniment'),
        h('h3', null, ev.title),
        h('div', { class: 'meta' },
          place ? h('div', null, '⌖ ' + place) : null,
          ev.date ? h('div', null, '◷ ' + ev.date) : null,
          h('div', null, '€ ' + pay),
          ev.language ? h('div', null, 'Limbă: ' + ev.language) : null,
          ev.accessibility ? h('div', null, '♿ Accesibil') : null,
          ev.distance_km != null ? h('div', null, '↔ ' + ev.distance_km + ' km distanță') : null)));
  }

  App.register({
    id: 'events',
    label: 'Evenimente',
    order: 10,
    render(el) {
      const results = h('div', { class: 'grid', id: 'event-results' });
      const status = h('p', { class: 'status-line' });
      const form = h('form', { class: 'form filter-form' },
        h('div', { class: 'row' },
          input('name', 'Titlu', { placeholder: 'caută după titlu' }),
          input('city', 'Oraș'),
          input('country', 'Țară'),
          input('distance', 'Distanță maximă (km)', { type: 'number', min: 1, placeholder: 'necesită oraș sau țară' })),
        h('div', { class: 'row' },
          input('date', 'De la data', { type: 'date' }),
          select('pay', 'Plată', PAY),
          select('action', 'Tip activitate', ACTIONS),
          select('language', 'Limbă', LANGUAGES),
          select('accessibility', 'Accesibil', YES_NO)),
        h('div', { class: 'actions' },
          h('button', { type: 'submit', class: 'btn primary' }, 'Caută'),
          h('button', { type: 'reset', class: 'btn ghost' }, 'Resetează')));

      async function search() {
        status.className = 'status-line';
        status.textContent = 'Se încarcă…';
        results.replaceChildren();
        try {
          const params = Object.fromEntries(new FormData(form));
          const data = await App.api('/events/', { params, auth: false });
          results.replaceChildren(...data.events.map(eventCard));
          status.textContent = data.events.length ? data.events.length + ' evenimente găsite.' : 'Niciun eveniment nu corespunde căutării.';
        } catch (err) {
          status.className = 'status-line error';
          status.textContent = err.message;
        }
      }

      form.addEventListener('submit', (e) => { e.preventDefault(); search(); });
      form.addEventListener('reset', () => setTimeout(search));
      el.append(
        h('div', { class: 'heading' }, h('div', null, h('div', { class: 'eyebrow' }, 'Evenimente'), h('h2', null, 'Găsește un eveniment'))),
        form, status, results);
      this.search = search;
    },
    show() { if (!this.loaded) { this.loaded = true; this.search(); } },
  });
})();

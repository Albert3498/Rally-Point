/* Volunteers: search registered users by aptitude, city and country (GET /users/search/). */
(function () {
  'use strict';
  const { h } = App;

  function personCard(user) {
    return h('article', { class: 'card' },
      h('div', { class: 'content' },
        h('div', { class: 'category' }, [user.city, user.country].filter(Boolean).join(', ') || 'Voluntar'),
        h('h3', null, user.name),
        h('div', { class: 'chips' },
          user.aptitudes.length
            ? user.aptitudes.map((a) => h('span', { class: 'chip' }, a))
            : h('span', { class: 'muted' }, 'Nicio aptitudine adăugată'))));
  }

  App.register({
    id: 'volunteers',
    label: 'Voluntari',
    access: 'user',
    order: 20,
    render(el) {
      const results = h('div', { class: 'grid' });
      const status = h('p', { class: 'status-line' });
      const aptitudes = h('input', { name: 'aptitude', placeholder: 'ex: python, design' });
      const city = h('input', { name: 'city' });
      const country = h('input', { name: 'country' });
      const form = h('form', { class: 'form filter-form' },
        h('div', { class: 'row' },
          h('label', { class: 'field' }, h('span', null, 'Aptitudini (toate trebuie să se potrivească)'), aptitudes),
          h('label', { class: 'field' }, h('span', null, 'Oraș'), city),
          h('label', { class: 'field' }, h('span', null, 'Țară'), country)),
        h('div', { class: 'actions' },
          h('button', { type: 'submit', class: 'btn primary' }, 'Caută'),
          h('button', { type: 'reset', class: 'btn ghost' }, 'Resetează')));

      async function search() {
        status.className = 'status-line';
        status.textContent = 'Se încarcă…';
        results.replaceChildren();
        try {
          const wanted = aptitudes.value.split(',').map((a) => a.trim()).filter(Boolean);
          const users = await App.api('/users/search/', {
            params: { aptitude: wanted, city: city.value.trim(), country: country.value.trim() },
          });
          results.replaceChildren(...users.map(personCard));
          status.textContent = users.length ? users.length + ' voluntari găsiți.' : 'Niciun voluntar nu corespunde căutării.';
        } catch (err) {
          status.className = 'status-line error';
          status.textContent = err.message;
        }
      }

      form.addEventListener('submit', (e) => { e.preventDefault(); search(); });
      form.addEventListener('reset', () => setTimeout(search));
      el.append(
        h('div', { class: 'heading' }, h('div', null, h('div', { class: 'eyebrow' }, 'Voluntari'), h('h2', null, 'Caută voluntari'))),
        form, status, results);
      this.search = search;
    },
    show() { this.search(); },
  });
})();

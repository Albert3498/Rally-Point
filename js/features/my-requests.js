/* My requests: GET /event-requests/me/ (requires login). */
(function () {
  'use strict';
  const { h } = App;

  App.register({
    id: 'my-requests',
    label: 'Cererile mele',
    access: 'organization',
    order: 40,
    render(el) {
      this.list = h('div', { class: 'stack' });
      this.status = h('p', { class: 'status-line' });
      el.append(
        h('div', { class: 'heading' }, h('div', null, h('div', { class: 'eyebrow' }, 'Organizatori'), h('h2', null, 'Cererile mele'))),
        this.status, this.list);
    },
    async show() {
      this.status.className = 'status-line';
      this.status.textContent = 'Se încarcă…';
      try {
        const requests = await App.api('/event-requests/me/');
        this.list.replaceChildren(...requests.map((r) => App.ui.requestCard(r)));
        this.status.textContent = requests.length ? '' : 'Nu ai trimis încă nicio cerere.';
      } catch (err) {
        this.status.className = 'status-line error';
        this.status.textContent = err.message;
      }
    },
  });
})();

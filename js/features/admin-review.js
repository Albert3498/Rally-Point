/* Admin review: list all event requests and approve/reject them (admin only). */
(function () {
  'use strict';
  const { h } = App;

  App.register({
    id: 'admin',
    label: 'Administrare',
    access: 'admin',
    order: 90,
    render(el) {
      this.list = h('div', { class: 'stack' });
      this.status = h('p', { class: 'status-line' });
      this.syncStatus = h('p', { class: 'status-line', role: 'status' });
      this.syncButton = h('button', {
        type: 'button',
        class: 'btn primary',
        onclick: () => this.syncAutomaticEvents(),
      }, 'Sincronizează evenimente externe');
      this.filter = h('select', { name: 'status' },
        h('option', { value: 'pending' }, 'În așteptare'),
        h('option', { value: 'approved' }, 'Aprobate'),
        h('option', { value: 'rejected' }, 'Respinse'),
        h('option', { value: '' }, 'Toate'));
      this.filter.addEventListener('change', () => this.load());
      el.append(
        h('div', { class: 'heading' },
          h('div', null, h('div', { class: 'eyebrow' }, 'Administrare'), h('h2', null, 'Cereri de evenimente')),
          h('label', { class: 'field inline' }, h('span', null, 'Stare'), this.filter)),
        h('section', { class: 'panel' },
          h('h3', null, 'Evenimente automate'),
          h('p', null, 'Importă sau actualizează anunțurile furnizorului extern.'),
          this.syncButton,
          this.syncStatus),
        this.status, this.list);
    },
    show() { this.load(); },

    async syncAutomaticEvents() {
      this.syncButton.disabled = true;
      this.syncStatus.className = 'status-line';
      this.syncStatus.textContent = 'Se sincronizează…';
      try {
        const result = await App.api('/events/automatic-sync', { method: 'POST' });
        const count = result.count || 0;
        this.syncStatus.textContent = `${count} evenimente externe sincronizate.`;
        App.toast('Evenimentele au fost sincronizate.');
      } catch (err) {
        this.syncStatus.className = 'status-line error';
        this.syncStatus.textContent = err.message;
      } finally {
        this.syncButton.disabled = false;
      }
    },

    async load() {
      this.status.className = 'status-line';
      this.status.textContent = 'Se încarcă…';
      try {
        const requests = await App.api('/admin/event-requests/', { params: { status: this.filter.value } });
        this.list.replaceChildren(...requests.map((r) => this.card(r)));
        this.status.textContent = requests.length ? '' : 'Nicio cerere în această categorie.';
      } catch (err) {
        this.status.className = 'status-line error';
        this.status.textContent = err.message;
      }
    },

    card(request) {
      if (request.status !== 'pending') return App.ui.requestCard(request);

      const note = h('textarea', { rows: 2, maxlength: 2000, placeholder: 'Notă pentru organizator (opțional)' });
      const msg = h('div', { class: 'form-msg', role: 'alert' });
      const decide = async (status) => {
        buttons.forEach((b) => { b.disabled = true; });
        try {
          const body = { status };
          if (note.value.trim()) body.review_note = note.value;
          await App.api('/admin/event-requests/' + request.id + '/review/', { method: 'PATCH', body });
          App.toast(status === 'approved' ? 'Cererea a fost aprobată.' : 'Cererea a fost respinsă.');
          this.load();
        } catch (err) {
          msg.className = 'form-msg error';
          msg.textContent = err.message;
          buttons.forEach((b) => { b.disabled = false; });
          if (err.status === 409) this.load();
        }
      };
      const approve = h('button', { type: 'button', class: 'btn primary', onclick: () => decide('approved') }, 'Aprobă');
      const reject = h('button', { type: 'button', class: 'btn danger', onclick: () => decide('rejected') }, 'Respinge');
      const buttons = [approve, reject];
      return App.ui.requestCard(request, h('div', { class: 'review-box' }, note, msg, h('div', { class: 'actions' }, approve, reject)));
    },
  });
})();

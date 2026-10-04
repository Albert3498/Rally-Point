/*
 * Aplicare la o oportunitate: #/aplica/<id> (doar conturi de elev).
 *
 * BACKEND LIPSĂ: serverul NU are încă un endpoint pentru aplicații. Trimiterea trece printr-o SURSĂ:
 *   - 'mock' (implicit): nu trimite nimic nicăieri, doar păstrează în browser ce a aplicat omul, ca să arate
 *     confirmarea și să nu aplice de două ori. Pagina spune clar că e mod demonstrativ.
 *   - 'api': aici se leagă endpoint-ul real când există. Contractul de mai jos e doar o PROPUNERE, nu există pe server:
 *       POST /applications/   { event_id, contact, message, availability_confirmed, parent_aware }
 *   Alegere:  window.APP_CONFIG = { applySource: 'api' }  în interface.html.
 */
(function () {
  'use strict';
  const { h } = App;

  /* ---------- Sursa de trimitere ---------- */
  const STORAGE_KEY = 'volunteer.demo-applications';

  function readDemo() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch { return {}; }
  }

  const sources = {
    mock: {
      demo: true,
      async has(application) {
        return (readDemo()[application.name] || []).includes(String(application.eventId));
      },
      async submit(application) {
        await new Promise((resolve) => setTimeout(resolve, 600)); // timp de "trimitere", ca să se vadă starea de încărcare
        const all = readDemo();
        all[application.name] = (all[application.name] || []).concat(String(application.eventId));
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(all)); } catch { /* fără stocare: confirmarea tot se arată */ }
        return { demo: true };
      },
    },
    api: {
      demo: false,
      async has() { return false; },
      async submit() {
        throw new Error('Aplicațiile nu se pot trimite încă: serverul nu are o funcție pentru ele. Anunță echipa.');
      },
    },
  };
  let source = sources[App.cfg.applySource] || sources.mock;

  /* ---------- Validare ---------- */
  const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  const isPhone = (v) => /^\+?[\d\s().-]{9,20}$/.test(v) && v.replace(/\D/g, '').length >= 9;

  function field(label, control, hint, id) {
    return h('div', { class: 'field' },
      h('label', { for: id }, h('span', null, label)),
      control,
      hint ? h('small', { id: id + '-hint' }, hint) : null,
      h('p', { class: 'field-error', id: id + '-error', hidden: true }));
  }

  function setError(id, input, message) {
    const box = document.getElementById(id + '-error');
    box.textContent = message || '';
    box.hidden = !message;
    if (message) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
    input.setAttribute('aria-describedby', (document.getElementById(id + '-hint') ? id + '-hint ' : '') + (message ? id + '-error' : ''));
  }

  /* ---------- Pagina ---------- */
  const view = {
    id: 'aplica',
    label: 'Aplică',
    access: 'user', // fără cont se merge la autentificare și apoi înapoi aici
    nav: false,

    render(el) {
      this.root = h('div', { class: 'container' });
      el.append(this.root);
    },

    async show(el, route) {
      const id = route && route.sub ? route.sub.split('/')[0] : '';
      this.root.replaceChildren(h('p', { class: 'status-line', role: 'status' }, 'Se încarcă oportunitatea…'));
      let ev;
      try {
        ev = await App.evenimente.get(id);
      } catch (err) {
        this.root.replaceChildren(h('div', { class: 'panel-note error', role: 'alert' },
          h('h3', null, 'Nu am putut încărca oportunitatea'), h('p', null, err.message),
          h('div', { class: 'actions' }, h('button', { type: 'button', class: 'btn', onclick: () => this.show(el, route) }, 'Încearcă din nou'))));
        return;
      }
      if (!ev) {
        this.root.replaceChildren(h('div', { class: 'panel-note' },
          h('h3', null, 'Nu am găsit această oportunitate'),
          h('p', null, 'Poate a trecut data sau a fost retrasă. Vezi ce alte activități sunt disponibile.'),
          h('div', { class: 'actions' }, h('a', { class: 'btn primary', href: '#/evenimente' }, 'Vezi oportunitățile'))));
        return;
      }
      const role = App.session.role;
      if (role === 'organization' || role === 'admin') {
        this.root.replaceChildren(h('div', { class: 'panel-note' },
          h('h3', null, 'Acest cont nu poate aplica'),
          h('p', null, 'Aplicarea este pentru conturile de elev. Poți vedea oportunitatea, dar nu poți aplica la ea.'),
          h('div', { class: 'actions' }, h('a', { class: 'btn primary', href: '#/evenimente/' + ev.id }, 'Înapoi la oportunitate'))));
        return;
      }
      const application = { eventId: ev.id, eventTitle: ev.title, name: App.session.name };
      if (await source.has(application)) {
        this.root.replaceChildren(h('div', { class: 'panel-note' },
          h('h3', null, 'Ai aplicat deja la această oportunitate'),
          h('p', null, ev.title + '. Organizatorul te va contacta. Dacă ai o problemă, scrie-i direct' + (ev.contact ? ' la ' + ev.contact : '') + '.'),
          h('div', { class: 'actions' }, h('a', { class: 'btn primary', href: '#/evenimente' }, 'Vezi alte oportunități'))));
        return;
      }
      this.paintForm(ev);
    },

    paintForm(ev) {
      const f = App.evenimente.format;
      const contact = h('input', { id: 'ap-contact', name: 'contact', autocomplete: 'tel', inputmode: 'text', 'aria-required': 'true' });
      const message = h('textarea', { id: 'ap-message', name: 'message', rows: 4, maxlength: 500 });
      const available = h('input', { type: 'checkbox', id: 'ap-available', name: 'available' });
      const parent = h('input', { type: 'checkbox', id: 'ap-parent', name: 'parent' });
      const status = h('p', { class: 'form-msg', role: 'alert', id: 'ap-status' });
      const submit = h('button', { type: 'submit', class: 'btn primary' }, 'Trimite aplicația');
      const form = h('form', { class: 'form wide', novalidate: true, 'aria-label': 'Aplicație pentru ' + ev.title },
        field('Cum te poate contacta organizatorul?', contact, 'Un număr de telefon sau un email. Îl primește organizatorul acestei oportunități.', 'ap-contact'),
        field('Câteva rânduri despre tine (opțional)', message, 'De ce te interesează activitatea? Ai mai făcut așa ceva? Maximum 500 de caractere.', 'ap-message'),
        h('div', { class: 'field' },
          h('label', { class: 'check' }, available, h('span', null, 'Pot fi prezent/ă în intervalul indicat' + (f.whenLong(ev) ? ' (' + f.whenLong(ev) + ')' : '') + '.')),
          h('p', { class: 'field-error', id: 'ap-available-error', hidden: true })),
        h('div', { class: 'field' },
          h('label', { class: 'check' }, parent, h('span', null, 'Un părinte sau tutore știe că aplic la această activitate.')),
          h('p', { class: 'field-error', id: 'ap-parent-error', hidden: true })),
        status,
        h('div', { class: 'actions' }, submit, h('a', { class: 'btn ghost', href: '#/evenimente/' + ev.id }, 'Renunț')));

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        status.textContent = '';
        const value = contact.value.trim();
        const problems = [];
        if (!(isEmail(value) || isPhone(value))) {
          setError('ap-contact', contact, 'Scrie un număr de telefon sau un email valid.');
          problems.push(contact);
        } else setError('ap-contact', contact, '');
        [[available, 'ap-available', 'Bifează ca să știm că poți veni.'], [parent, 'ap-parent', 'Bifează ca să putem trimite aplicația.']].forEach(([box, id, msg]) => {
          const err = document.getElementById(id + '-error');
          err.textContent = box.checked ? '' : msg;
          err.hidden = box.checked;
          if (!box.checked) box.setAttribute('aria-invalid', 'true'); else box.removeAttribute('aria-invalid');
          if (!box.checked) problems.push(box);
        });
        if (problems.length) { problems[0].focus(); return; }

        submit.disabled = true;
        submit.textContent = 'Se trimite…';
        try {
          await source.submit({
            eventId: ev.id, eventTitle: ev.title, name: App.session.name,
            contact: value, message: message.value.trim(), availabilityConfirmed: true, parentAware: true,
          });
          this.paintSuccess(ev, value);
        } catch (err) {
          status.className = 'form-msg error';
          status.textContent = 'Nu am putut trimite aplicația. ' + err.message + ' Datele tale sunt încă aici, poți încerca din nou.';
          submit.disabled = false;
          submit.textContent = 'Trimite aplicația';
        }
      });

      App.fill(this.root,
        h('a', { class: 'back-link', href: '#/evenimente/' + ev.id }, 'Înapoi la oportunitate'),
        h('div', { class: 'heading' }, h('div', null,
          h('h2', null, 'Aplică la: ' + ev.title),
          h('p', { class: 'lead', style: 'margin:8px 0 0' },
            [f.whenLong(ev), ev.place, f.age(ev), ev.commitment].filter(Boolean).join('. ') + '.'))),
        source.demo ? h('p', { class: 'mock-banner' }, 'Mod demonstrativ: aplicația ta nu ajunge încă la organizator, pentru că serverul nu are încă această funcție. Poți totuși parcurge pașii.') : null,
        h('div', { class: 'apply-layout' },
          form,
          h('aside', { class: 'apply-aside', 'aria-label': 'Ce urmează' },
            ev.tasks && ev.tasks.length ? h('div', null, h('h3', null, 'Ce vei face'), h('ul', null, ev.tasks.map((t) => h('li', null, t)))) : null,
            h('div', null, h('h3', null, 'După ce trimiți'),
              h('ol', null,
                h('li', null, 'Organizatorul vede aplicația ta.'),
                h('li', null, 'Te contactează ca să confirme și să-ți dea detaliile.'),
                h('li', null, 'Dacă nu mai poți veni, spune-i cât mai devreme.'))))));
    },

    paintSuccess(ev, contactValue) {
      const title = h('h3', { tabindex: '-1' }, 'Aplicația ta a fost trimisă');
      this.root.replaceChildren(h('div', { class: 'panel-note success', role: 'status' },
        title,
        h('p', null, 'Am înregistrat aplicația ta la „' + ev.title + '”.' + (source.demo ? ' (Mod demonstrativ: nu a ajuns încă la un organizator real.)' : '')),
        h('h3', { style: 'font-size:1.1rem;margin-top:18px' }, 'Ce urmează'),
        h('ol', null,
          h('li', null, 'Organizatorul vede aplicația ta.'),
          h('li', null, 'Te contactează la ' + contactValue + ' ca să confirme și să-ți dea detaliile.'),
          h('li', null, 'Dacă nu mai poți veni, anunță-l cât mai devreme.')),
        h('div', { class: 'actions' },
          h('a', { class: 'btn primary', href: '#/evenimente' }, 'Vezi alte oportunități'),
          h('a', { class: 'btn ghost', href: '#/home' }, 'Înapoi acasă'))));
      title.focus();
    },
  };
  App.register(view);

  App.aplica = { setSource(newSource) { source = newSource; }, sources };
})();

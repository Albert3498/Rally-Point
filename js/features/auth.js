/* Authentication: login page, register page and the account area in the header. */
(function () {
  'use strict';
  const { h } = App;

  function field(label, input, hint) {
    return h('label', { class: 'field' }, h('span', null, label), input, hint ? h('small', null, hint) : null);
  }

  function message(form, text, kind = 'error') {
    form.querySelector('.form-msg').className = 'form-msg ' + kind;
    form.querySelector('.form-msg').textContent = text;
  }

  function submitHandler(form, work) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = form.querySelector('button[type=submit]');
      button.disabled = true;
      message(form, '', 'ok');
      try {
        await work();
      } catch (err) {
        message(form, err.message);
      } finally {
        button.disabled = false;
      }
    });
  }

  /* ----- Login ----- */
  App.register({
    id: 'login',
    label: 'Autentificare',
    access: 'guest',
    nav: false,
    render(el) {
      const name = h('input', { name: 'name', required: true, autocomplete: 'username' });
      const password = h('input', { name: 'password', type: 'password', required: true, autocomplete: 'current-password' });
      const form = h('form', { class: 'form auth-card' },
        h('div', { class: 'eyebrow' }, 'Cont'),
        h('h2', null, 'Autentificare'),
        field('Nume', name),
        field('Parolă', password),
        h('div', { class: 'form-msg', role: 'alert' }),
        h('button', { type: 'submit', class: 'btn primary' }, 'Intră în cont'),
        h('p', { class: 'form-alt' }, 'Nu ai cont? ', h('a', { href: '#/register' }, 'Creează unul')),
      );
      submitHandler(form, async () => {
        const next = new URLSearchParams((location.hash.split('?')[1]) || '').get('next');
        await App.login(name.value, password.value);
        App.toast('Bine ai venit, ' + App.session.name + '!');
        // The session listener has already routed home; send the user where they were headed.
        if (next && next.startsWith('#/')) location.hash = next;
      });
      el.append(form);
    },
    show(el) { el.querySelector('form').reset(); el.querySelector('.form-msg').textContent = ''; },
  });

  /* ----- Register ----- */
  App.register({
    id: 'register',
    label: 'Cont nou',
    access: 'guest',
    nav: false,
    render(el) {
      // Keep in sync with MIN_STUDENT_AGE / MAX_STUDENT_AGE in Authentification.py.
      const MIN_AGE = 14, MAX_AGE = 18;
      const now = new Date();
      const isoDate = (d) => d.toISOString().slice(0, 10);
      const youngest = isoDate(new Date(now.getFullYear() - MIN_AGE, now.getMonth(), now.getDate(), 12));
      const oldest = isoDate(new Date(now.getFullYear() - MAX_AGE - 1, now.getMonth(), now.getDate() + 1, 12));
      const inputs = {
        type: h('select', { name: 'account_type' },
          h('option', { value: 'student' }, 'Elev (14–18 ani)'),
          h('option', { value: 'organization' }, 'Organizație / ONG (adulți)')),
        name: h('input', { name: 'name', required: true, autocomplete: 'name' }),
        password: h('input', { name: 'password', type: 'password', required: true, autocomplete: 'new-password' }),
        birthdate: h('input', { name: 'birthdate', type: 'date', required: true, min: oldest, max: youngest }),
        email: h('input', { name: 'email', type: 'email', autocomplete: 'email' }),
        city: h('input', { name: 'city', required: true }),
        country: h('input', { name: 'country', required: true }),
        aptitudes: h('input', { name: 'aptitudes', placeholder: 'ex: python, design, predare' }),
      };
      const nameLabel = h('span', null);
      const nameHint = h('small', null);
      // Fields that exist for one account type only; the hidden ones are disabled so the browser skips them.
      const studentOnly = [
        field('Data nașterii', inputs.birthdate, 'Conturile de elev sunt doar pentru vârsta 14–18 ani.'),
        field('Aptitudini', inputs.aptitudes, 'Separate prin virgulă. Altor utilizatori le vor folosi la căutare.'),
      ];
      const organizationOnly = [
        field('Email de contact', inputs.email, 'Folosit pentru a lua legătura cu organizația.'),
      ];
      function syncAccountType() {
        const isOrg = inputs.type.value === 'organization';
        nameLabel.textContent = isOrg ? 'Numele organizației' : 'Nume';
        nameHint.textContent = isOrg
          ? 'Litere, cifre, spații și - . & , ( )'
          : 'Doar litere și spații.';
        studentOnly.forEach((f) => { f.hidden = isOrg; });
        organizationOnly.forEach((f) => { f.hidden = !isOrg; });
        inputs.birthdate.disabled = isOrg;
        inputs.aptitudes.disabled = isOrg;
        inputs.email.disabled = !isOrg;
        inputs.email.required = isOrg;
      }
      inputs.type.addEventListener('change', syncAccountType);
      const form = h('form', { class: 'form auth-card' },
        h('div', { class: 'eyebrow' }, 'Cont'),
        h('h2', null, 'Creează un cont'),
        field('Tip de cont', inputs.type),
        h('label', { class: 'field' }, nameLabel, inputs.name, nameHint),
        field('Parolă', inputs.password),
        studentOnly[0],
        organizationOnly,
        h('div', { class: 'row' },
          field('Oraș', inputs.city),
          field('Țară', inputs.country)),
        studentOnly[1],
        h('div', { class: 'form-msg', role: 'alert' }),
        h('button', { type: 'submit', class: 'btn primary' }, 'Creează contul'),
        h('p', { class: 'form-alt' }, 'Ai deja cont? ', h('a', { href: '#/login' }, 'Autentifică-te')),
      );
      syncAccountType();
      submitHandler(form, async () => {
        const isOrg = inputs.type.value === 'organization';
        const name = inputs.name.value.trim();
        const body = {
          account_type: inputs.type.value,
          name,
          password: inputs.password.value,
          city: inputs.city.value,
          country: inputs.country.value,
        };
        if (isOrg) {
          body.email = inputs.email.value;
        } else {
          body.birthdate = inputs.birthdate.value;
          body.aptitudes = inputs.aptitudes.value.split(',').map((a) => a.trim()).filter(Boolean);
        }
        await App.api('/register/', { method: 'POST', auth: false, body });
        await App.login(name, inputs.password.value);
        App.toast('Cont creat. Bine ai venit, ' + App.session.name + '!');
      });
      el.append(form);
    },
  });

  /* ----- Account area in the header (#account) ----- */
  function renderAccount() {
    const slot = document.getElementById('account');
    if (!slot) return;
    if (App.session.name) {
      slot.replaceChildren(
        h('span', { class: 'account-name' }, App.session.name,
          App.session.role === 'admin' ? h('em', null, ' · admin') : null,
          App.session.role === 'organization' ? h('em', null, ' · organizație') : null),
        h('button', { type: 'button', class: 'btn ghost small', onclick: () => App.logout() }, 'Ieșire'),
      );
    } else {
      slot.replaceChildren(
        h('button', { type: 'button', class: 'btn ghost small', onclick: () => App.go('login') }, 'Autentificare'),
        h('button', { type: 'button', class: 'btn primary small', onclick: () => App.go('register') }, 'Cont nou'),
      );
    }
  }
  App.onSession(renderAccount);
  document.addEventListener('DOMContentLoaded', renderAccount);
})();

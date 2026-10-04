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
      const today = new Date().toISOString().slice(0, 10);
      const inputs = {
        name: h('input', { name: 'name', required: true, autocomplete: 'name' }),
        password: h('input', { name: 'password', type: 'password', required: true, autocomplete: 'new-password' }),
        birthdate: h('input', { name: 'birthdate', type: 'date', required: true, max: today }),
        city: h('input', { name: 'city', required: true }),
        country: h('input', { name: 'country', required: true }),
        aptitudes: h('input', { name: 'aptitudes', placeholder: 'ex: python, design, predare' }),
      };
      const form = h('form', { class: 'form auth-card' },
        h('div', { class: 'eyebrow' }, 'Cont'),
        h('h2', null, 'Creează un cont'),
        field('Nume', inputs.name, 'Doar litere și spații.'),
        field('Parolă', inputs.password),
        field('Data nașterii', inputs.birthdate),
        h('div', { class: 'row' },
          field('Oraș', inputs.city),
          field('Țară', inputs.country)),
        field('Aptitudini', inputs.aptitudes, 'Separate prin virgulă. Altor utilizatori le vor folosi la căutare.'),
        h('div', { class: 'form-msg', role: 'alert' }),
        h('button', { type: 'submit', class: 'btn primary' }, 'Creează contul'),
        h('p', { class: 'form-alt' }, 'Ai deja cont? ', h('a', { href: '#/login' }, 'Autentifică-te')),
      );
      submitHandler(form, async () => {
        const name = App.normalizeName(inputs.name.value);
        const aptitudes = inputs.aptitudes.value.split(',').map((a) => a.trim()).filter(Boolean);
        await App.api('/register/', {
          method: 'POST',
          auth: false,
          body: {
            name,
            password: inputs.password.value,
            birthdate: inputs.birthdate.value,
            city: inputs.city.value,
            country: inputs.country.value,
            aptitudes,
          },
        });
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
          App.session.role === 'admin' ? h('em', null, ' · admin') : null),
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

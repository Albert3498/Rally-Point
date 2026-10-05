/* Propose an event: POST /event-requests/ (requires login). */
(function () {
  'use strict';
  const { h } = App;

  const CATEGORIES = [
    ['environment', 'Mediu'], ['education', 'Educație'], ['community', 'Comunitate'],
    ['animal_welfare', 'Protecția animalelor'], ['charity', 'Caritate'], ['other', 'Altele'],
  ];

  function field(label, control, hint) {
    return h('label', { class: 'field' }, h('span', null, label), control, hint ? h('small', null, hint) : null);
  }

  // <input type="datetime-local"> has no timezone; the API requires one, so send an absolute (UTC) instant.
  function toIso(localValue) {
    return new Date(localValue).toISOString();
  }

  function optional(value) {
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  }

  App.register({
    id: 'request-event',
    label: 'Propune un eveniment',
    access: 'organization',
    order: 30,
    render(el) {
      const f = {
        title: h('input', { name: 'title', required: true, minlength: 5, maxlength: 150 }),
        category: h('select', { name: 'category', required: true }, CATEGORIES.map(([v, t]) => h('option', { value: v }, t))),
        description: h('textarea', { name: 'description', required: true, minlength: 20, maxlength: 5000, rows: 4 }),
        start: h('input', { name: 'start', type: 'datetime-local', required: true }),
        end: h('input', { name: 'end', type: 'datetime-local', required: true }),
        location: h('input', { name: 'location', required: true, minlength: 3, maxlength: 300 }),
        volunteers: h('input', { name: 'volunteers', type: 'number', required: true, min: 1, value: 5 }),
        tasks: h('textarea', { name: 'tasks', required: true, minlength: 10, maxlength: 3000, rows: 3 }),
        organizer: h('input', { name: 'organizer', required: true, minlength: 2, maxlength: 150 }),
        email: h('input', { name: 'email', type: 'email', required: true }),
        phone: h('input', { name: 'phone', type: 'tel' }),
        image: h('input', { name: 'image', type: 'file', accept: 'image/jpeg,image/png,image/webp' }),
        requirements: h('textarea', { name: 'requirements', rows: 2 }),
        notes: h('textarea', { name: 'notes', rows: 2 }),
      };
      const imagePreview = h('img', { class: 'request-image-preview', alt: 'Previzualizare fotografie' });
      imagePreview.hidden = true;
      let previewUrl = '';
      f.image.addEventListener('change', () => {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        previewUrl = '';
        const file = f.image.files[0];
        if (!file) {
          imagePreview.hidden = true;
          imagePreview.removeAttribute('src');
          return;
        }
        previewUrl = URL.createObjectURL(file);
        imagePreview.src = previewUrl;
        imagePreview.hidden = false;
      });
      const message = h('div', { class: 'form-msg', role: 'alert' });
      const submit = h('button', { type: 'submit', class: 'btn primary' }, 'Trimite cererea');
      const form = h('form', { class: 'form wide' },
        field('Titlu', f.title, '5–150 caractere.'),
        h('div', { class: 'row' }, field('Categorie', f.category), field('Voluntari necesari', f.volunteers)),
        field('Descriere', f.description, 'Minim 20 de caractere.'),
        h('div', { class: 'row' }, field('Început', f.start), field('Sfârșit', f.end)),
        field('Locație', f.location),
        field('Sarcinile voluntarilor', f.tasks, 'Minim 10 caractere.'),
        h('div', { class: 'row' }, field('Organizator', f.organizer), field('Email de contact', f.email), field('Telefon (opțional)', f.phone)),
        field('Fotografie pentru oportunitate (opțional)', f.image, 'JPEG, PNG sau WebP, maximum 5 MB. Va apărea în Descoperă după aprobare.'),
        imagePreview,
        field('Cerințe (opțional)', f.requirements),
        field('Note suplimentare (opțional)', f.notes),
        message,
        h('div', { class: 'actions' }, submit));

      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        message.textContent = '';
        if (f.image.files[0] && f.image.files[0].size > 5 * 1024 * 1024) {
          message.className = 'form-msg error';
          message.textContent = 'Fotografia trebuie să aibă cel mult 5 MB.';
          return;
        }
        submit.disabled = true;
        try {
          const body = new FormData();
          body.append('data', JSON.stringify({
            title: f.title.value,
            description: f.description.value,
            category: f.category.value,
            start_datetime: toIso(f.start.value),
            end_datetime: toIso(f.end.value),
            location: f.location.value,
            volunteers_needed: Number(f.volunteers.value),
            volunteer_tasks: f.tasks.value,
            organizer_name: f.organizer.value,
            contact_email: f.email.value,
            contact_phone: optional(f.phone.value),
            requirements: optional(f.requirements.value),
            additional_notes: optional(f.notes.value),
          }));
          if (f.image.files[0]) body.append('image', f.image.files[0]);
          await App.api('/event-requests/', {
            method: 'POST',
            body,
          });
          form.reset();
          if (previewUrl) URL.revokeObjectURL(previewUrl);
          previewUrl = '';
          imagePreview.removeAttribute('src');
          imagePreview.hidden = true;
          App.toast('Cererea a fost trimisă și așteaptă aprobarea.');
          App.go('my-requests');
        } catch (err) {
          message.className = 'form-msg error';
          message.textContent = err.message;
        } finally {
          submit.disabled = false;
        }
      });

      el.append(
        h('div', { class: 'heading' }, h('div', null, h('div', { class: 'eyebrow' }, 'Organizatori'), h('h2', null, 'Propune un eveniment'))),
        h('p', { class: 'lead' }, 'Un administrator îți va analiza cererea. O vei vedea la „Cererile mele”.'),
        form);
    },
  });
})();

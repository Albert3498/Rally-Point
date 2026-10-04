/*
 * Shared UI piece: App.ui.requestCard(request, actionsElement?) renders one event request.
 * Used by "my requests" and the admin review page - load this file before them.
 */
(function () {
  'use strict';
  const { h } = App;

  const STATUS_LABEL = { pending: 'În așteptare', approved: 'Aprobată', rejected: 'Respinsă' };
  const CATEGORY_LABEL = {
    environment: 'Mediu',
    education: 'Educație',
    community: 'Comunitate',
    animal_welfare: 'Protecția animalelor',
    charity: 'Caritate',
    other: 'Altele',
  };

  function row(label, value) {
    return value ? h('div', null, h('b', null, label + ': '), value) : null;
  }

  App.ui.CATEGORY_LABEL = CATEGORY_LABEL;
  App.ui.requestCard = function (request, actions) {
    return h('article', { class: 'card request-card' },
      h('div', { class: 'content' },
        h('div', { class: 'request-top' },
          h('div', { class: 'category' }, CATEGORY_LABEL[request.category] || request.category),
          h('span', { class: 'badge ' + request.status }, STATUS_LABEL[request.status] || request.status)),
        h('h3', null, request.title),
        h('p', null, request.description),
        h('div', { class: 'meta' },
          row('Când', App.fmtDate(request.start_datetime) + ' – ' + App.fmtDate(request.end_datetime)),
          row('Unde', request.location),
          row('Voluntari necesari', String(request.volunteers_needed)),
          row('Sarcini', request.volunteer_tasks),
          row('Organizator', request.organizer_name),
          row('Email', request.contact_email),
          row('Telefon', request.contact_phone),
          row('Cerințe', request.requirements),
          row('Note', request.additional_notes),
          row('Trimisă', App.fmtDate(request.created_at))),
        request.review_note ? h('div', { class: 'info' }, h('b', null, 'Nota administratorului:'), ' ' + request.review_note) : null,
        actions || null));
  };
})();

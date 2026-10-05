/*
 * Vertical, snap-scrolling event discovery feed.
 * Uses the same event store and detail route as the opportunities list.
 */
(function () {
  'use strict';
  const { h } = App;

  function scrollToCard(feed, index) {
    const cards = feed.querySelectorAll('.discover-card');
    const card = cards[index];
    if (!card) return;
    feed.scrollTo({
      top: card.getBoundingClientRect().top - feed.getBoundingClientRect().top + feed.scrollTop,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    });
  }

  function eventCard(ev, index) {
    const when = App.evenimente.format.when(ev);
    const groupedRoles = ev.roleGroups && ev.roleGroups.length ? ev.roleGroups.length : 0;
    const meta = [
      groupedRoles ? App.evenimente.format.whenLong(ev) : when.primary + (when.secondary ? ' · ' + when.secondary : ''),
      ev.place,
      App.evenimente.format.age(ev),
      App.evenimente.format.spots(ev),
      groupedRoles ? groupedRoles + (groupedRoles === 1 ? ' rol în eveniment' : ' roluri în eveniment') : '',
    ].filter(Boolean);

    return h('article', { class: 'discover-card', 'aria-labelledby': 'discover-title-' + index },
      ev.image
        ? h('figure', { class: 'discover-visual' },
          h('img', { class: 'discover-image', src: ev.image, alt: ev.imageAlt || ev.title, loading: index < 2 ? 'eager' : 'lazy' }),
          ev.imageIsIllustrative ? h('figcaption', { class: 'discover-image-caption' }, 'Imagine ilustrativă') : null)
        : h('div', { class: 'discover-image discover-image-empty', 'aria-hidden': 'true' }, 'Voluntar'),
      h('div', { class: 'discover-content' },
        h('div', { class: 'discover-card-topline' },
          ev.cause ? h('span', { class: 'discover-cause' }, ev.cause) : h('span')),
        h('h2', { id: 'discover-title-' + index }, ev.title),
        ev.summary ? h('p', { class: 'discover-description' }, ev.summary) : null,
        h('ul', { class: 'discover-meta', 'aria-label': 'Detalii despre oportunitate' },
          meta.map((item) => h('li', null, item))),
        h('div', { class: 'discover-card-actions' },
          h('a', { class: 'btn primary', href: '#/evenimente/' + encodeURIComponent(ev.id) },
            groupedRoles ? 'Vezi cele ' + groupedRoles + ' roluri' : 'Mă interesează'),
          h('span', { class: 'discover-hint' }, 'Derulează pentru următoarea oportunitate'))));
  }

  App.register({
    id: 'descopera',
    label: 'Descoperă',
    order: 5,

    render(el) {
      this.feed = h('div', {
        class: 'discover-feed',
        role: 'region',
        'aria-label': 'Oportunități de voluntariat. Derulează vertical pentru a le explora.',
        tabindex: '0',
      });
      this.wheelLocked = false;
      this.feed.addEventListener('wheel', (event) => {
        if (!document.documentElement.classList.contains('discover-scroll')
          || window.matchMedia('(max-width: 860px)').matches
          || event.ctrlKey || event.shiftKey || Math.abs(event.deltaY) < 8) return;

        const cards = [...this.feed.querySelectorAll('.discover-card')];
        if (!cards.length) return;
        if (this.wheelLocked) {
          event.preventDefault();
          window.clearTimeout(this.wheelTimer);
          this.wheelTimer = window.setTimeout(() => { this.wheelLocked = false; }, 180);
          return;
        }
        const current = cards.reduce((closest, card, index) => {
          const top = card.getBoundingClientRect().top - this.feed.getBoundingClientRect().top + this.feed.scrollTop;
          const currentTop = cards[closest].getBoundingClientRect().top - this.feed.getBoundingClientRect().top + this.feed.scrollTop;
          return Math.abs(top - this.feed.scrollTop) < Math.abs(currentTop - this.feed.scrollTop) ? index : closest;
        }, 0);
        const next = current + (event.deltaY > 0 ? 1 : -1);
        if (next < 0 || next >= cards.length) return;
        event.preventDefault();
        event.preventDefault();
        this.wheelLocked = true;
        scrollToCard(this.feed, next);
        this.wheelTimer = window.setTimeout(() => { this.wheelLocked = false; }, 180);
      }, { passive: false });
      this.feed.addEventListener('keydown', (event) => {
        if (!document.documentElement.classList.contains('discover-scroll')
          || event.target.closest('a, button, input, select, textarea')) return;
        if (!['ArrowDown', 'PageDown', 'ArrowUp', 'PageUp'].includes(event.key)) return;

        const cards = [...this.feed.querySelectorAll('.discover-card')];
        const current = cards.reduce((closest, card, index) => {
          const top = card.getBoundingClientRect().top - this.feed.getBoundingClientRect().top + this.feed.scrollTop;
          const currentTop = cards[closest].getBoundingClientRect().top - this.feed.getBoundingClientRect().top + this.feed.scrollTop;
          return Math.abs(top - this.feed.scrollTop) < Math.abs(currentTop - this.feed.scrollTop) ? index : closest;
        }, 0);
        const next = current + (event.key === 'ArrowDown' || event.key === 'PageDown' ? 1 : -1);
        if (next < 0 || next >= cards.length) return;
        event.preventDefault();
        scrollToCard(this.feed, next);
      });
      this.syncHeader = () => {
        const header = document.querySelector('.site-header');
        if (header) {
          document.documentElement.style.setProperty('--discover-header-height', header.getBoundingClientRect().height + 'px');
        }
      };
      el.append(
        h('div', { class: 'container discover-page' },
          h('header', { class: 'discover-heading' },
            h('p', { class: 'discover-eyebrow' }, 'Găsește următoarea experiență'),
            h('h1', null, 'Descoperă voluntariatul'),
            h('p', { class: 'lead' }, 'Explorează oportunitățile una câte una. Când una ți se potrivește, apasă „Mă interesează” pentru detalii și înscriere.')),
          h('div', { class: 'discover-feed-slot', 'aria-live': 'polite' }, this.feed)));
    },

    show() {
      document.documentElement.classList.add('discover-scroll');
      this.syncHeader();
      window.addEventListener('resize', this.syncHeader);
      window.requestAnimationFrame(this.syncHeader);
      this.load();
    },

    hide() {
      document.documentElement.classList.remove('discover-scroll');
      document.documentElement.style.removeProperty('--discover-header-height');
      window.removeEventListener('resize', this.syncHeader);
    },

    async load() {
      this.feed.setAttribute('aria-busy', 'true');
      this.feed.replaceChildren(
        h('div', { class: 'panel-note discover-message', role: 'status' }, 'Se încarcă oportunitățile...'));
      try {
        const events = await App.evenimente.all();
        this.feed.removeAttribute('aria-busy');
        if (!events.length) {
          this.feed.replaceChildren(h('div', { class: 'panel-note discover-message' },
            h('h2', null, 'Nu sunt oportunități disponibile momentan'),
            h('p', null, 'Revino mai târziu pentru a descoperi activități noi.')));
          return;
        }
        this.feed.replaceChildren(...events.map((ev, index) => eventCard(ev, index)));
        this.feed.scrollTop = 0;
      } catch (err) {
        this.feed.removeAttribute('aria-busy');
        this.feed.replaceChildren(h('div', { class: 'panel-note error discover-message', role: 'alert' },
          h('h2', null, 'Nu am putut încărca oportunitățile'),
          h('p', null, err.message),
          h('button', { type: 'button', class: 'btn', onclick: () => this.load() }, 'Încearcă din nou')));
      }
    },
  });
})();

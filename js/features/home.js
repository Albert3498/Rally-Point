/*
 * Pagina de start: ce se întâmplă în curând (panoul), cum funcționează, cauzele și pentru cine e platforma.
 * Datele vin din App.evenimente (aceeași sursă ca lista de oportunități), deci aici nu se leagă nimic separat.
 */
(function () {
  'use strict';
  const { h } = App;

  const inContainer = (...kids) => h('div', { class: 'container' }, kids);

  App.register({
    id: 'home',
    label: 'Acasă',
    order: 0,

    render(el) {
      const dom = this.dom = {
        heroActions: h('div', { class: 'actions' }),
        boardSlot: h('div', { 'aria-live': 'polite' }),
        causeList: h('ul', { class: 'cause-list' }),
        causeNote: h('p', { class: 'status-line' }),
        orgActions: h('div', { class: 'actions' }),
      };

      el.append(
        h('section', { class: 'hero' }, inContainer(
          h('div', { class: 'hero-text' },
            h('p', { class: 'eyebrow' }, 'Binele începe aproape de tine'),
            h('h1', null, 'Fă loc binelui în orașul tău.'),
            h('p', null, 'Descoperă experiențe de voluntariat potrivite vârstei, programului și lucrurilor care contează pentru tine.'),
            dom.heroActions),
          h('figure', { class: 'hero-image' },
            h('img', {
              src: 'images/demo/events/event-01.jpg',
              alt: 'Lumina soarelui pătrunde printre copaci într-o pădure',
              fetchpriority: 'high',
            })),
          h('div', { class: 'board-title-row' },
            h('h2', null, 'În curând'),
            h('a', { class: 'btn ghost small', href: '#/evenimente' }, 'Toate oportunitățile')),
          dom.boardSlot)),

        h('section', { class: 'section', id: 'cum-functioneaza' }, inContainer(
          h('h2', null, 'Cum funcționează'),
          h('ol', { class: 'steps' },
            h('li', null, h('h3', null, 'Alegi'),
              h('p', null, 'Filtrezi după oraș, vârstă și program. Fiecare oportunitate arată ce ai de făcut și cât timp îți ia.')),
            h('li', null, h('h3', null, 'Aplici'),
              h('p', null, 'Completezi o aplicație scurtă. Un părinte sau tutore trebuie să știe că aplici.')),
            h('li', null, h('h3', null, 'Organizatorul te contactează'),
              h('p', null, 'Primești detaliile direct de la cei care organizează activitatea.'))))),

        h('section', { class: 'section' }, inContainer(
          h('h2', null, 'Alege după cauză'),
          dom.causeNote,
          dom.causeList)),

        h('section', { class: 'section', id: 'pentru-organizatii' }, inContainer(
          h('h2', null, 'Pentru organizații, școli și părinți'),
          h('div', { class: 'audiences' },
            h('div', null, h('h3', null, 'Organizații'),
              h('p', null, 'Ai o activitate la care ai nevoie de voluntari? Creează un cont de organizație și trimite o propunere.'),
              dom.orgActions),
            h('div', null, h('h3', null, 'Școli'),
              h('p', null, 'Poți trimite elevii spre activități potrivite vârstei lor. Fiecare oportunitate arată vârsta, programul și locul.')),
            h('div', null, h('h3', null, 'Părinți'),
              h('ul', null,
                h('li', null, 'Vezi vârsta, locul și programul fiecărei activități.'),
                h('li', null, 'Aplicarea cere confirmarea că ești la curent.'),
                h('li', null, 'Platforma nu verifică încă organizațiile: confirmă detaliile direct cu organizatorul, înainte de prima activitate.')))))));
    },

    show() {
      this.paintActions();
      this.fill();
    },

    paintActions() {
      const dom = this.dom;
      const { name, role } = App.session;
      App.fill(dom.heroActions,
        h('a', { class: 'btn primary', href: '#/evenimente' }, 'Vezi oportunitățile'),
        !name ? h('a', { class: 'btn ghost', href: '#/register' }, 'Creează cont de elev') : null);
      App.fill(dom.orgActions,
        role === 'organization'
          ? h('a', { class: 'btn ghost', href: '#/request-event' }, 'Propune o activitate')
          : (!name ? h('a', { class: 'btn ghost', href: '#/register' }, 'Creează cont de organizație') : null));
    },

    async fill() {
      const dom = this.dom;
      const ui = App.evenimente.ui;
      if (!this.loaded) dom.boardSlot.replaceChildren(ui.skeleton(3));
      try {
        const [upcoming, causes] = await Promise.all([App.evenimente.upcoming(5), App.evenimente.causes()]);
        this.loaded = true;
        App.fill(dom.boardSlot,
          upcoming.length
            ? h('div', { class: 'board light' + (this.flipped ? '' : ' flip') }, [ui.head(), upcoming.map((ev, i) => ui.row(ev, i))])
            : h('div', { class: 'panel-note' }, h('h3', null, 'Încă nu sunt oportunități publicate'),
              h('p', null, 'Revino în câteva zile.')));
        this.flipped = true;

        dom.causeNote.textContent = causes.length ? '' : 'Cauzele apar aici imediat ce există oportunități.';
        dom.causeList.replaceChildren(...causes.map((c) => h('li', null,
          h('a', { class: 'cause-row', href: '#/evenimente?cause=' + encodeURIComponent(c.name) },
            h('strong', null, c.name),
            h('span', null, c.count === 1 ? '1 oportunitate' : c.count + ' oportunități')))));
      } catch (err) {
        dom.boardSlot.replaceChildren(h('div', { class: 'panel-note error', role: 'alert' },
          h('h3', null, 'Nu am putut încărca oportunitățile'),
          h('p', null, err.message),
          h('div', { class: 'actions' }, h('button', { type: 'button', class: 'btn', onclick: () => this.fill() }, 'Încearcă din nou'))));
      }
    },
  });
})();

/* Home: the informational page already written in interface.html (#view-home). */
(function () {
  'use strict';

  App.register({
    id: 'home',
    label: 'Acasă',
    order: 0,
    render(el) {
      const cards = [...el.querySelectorAll('.card')];
      const search = el.querySelector('#search');
      const empty = el.querySelector('#empty');
      let category = 'all';

      function applyFilters() {
        const q = search.value.toLowerCase().trim();
        let visible = 0;
        cards.forEach((card) => {
          const ok = (category === 'all' || card.dataset.cat === category)
            && (!q || (card.dataset.text + ' ' + card.innerText).toLowerCase().includes(q));
          card.style.display = ok ? 'block' : 'none';
          if (ok) visible++;
        });
        empty.style.display = visible ? 'none' : 'block';
      }

      el.querySelectorAll('.filter').forEach((button) => {
        button.addEventListener('click', () => {
          el.querySelectorAll('.filter').forEach((other) => other.classList.remove('active'));
          button.classList.add('active');
          category = button.dataset.cat;
          applyFilters();
        });
      });
      search.addEventListener('input', applyFilters);
    },
  });

  // Shortcuts to the two sections of the home page (they scroll, they are not separate pages).
  App.addNav({ label: 'Activități IT', href: '#/home/activities', order: 1 });
  App.addNav({ label: 'Ghid', href: '#/home/guide', order: 2 });
})();

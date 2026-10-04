/*
 * Evenimente de exemplu (de la Robert) - folosite cât timp backendul nu are încă date reale.
 * Formatul complet este descris în js/features/evenimente.js. Pentru a trece pe backend:
 * window.APP_CONFIG = { eventsSource: 'api' } în interface.html. Acest fișier se poate șterge după aceea.
 */
window.EXEMPLE_EVENIMENTE = [
  {
    id: 1,
    title: 'Curățenie în Parcul Herăstrău',
    organization: 'Asociația Verde Urban',
    city: 'București',
    category: 'Mediu',
    availability: 'Weekend',
    description: 'Ajutăm la colectarea deșeurilor, sortarea reciclabilelor și amenajarea unor zone verzi din parc. Se oferă mănuși, saci și apă.',
    image: 'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=900',
    photos: [
      'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=600',
      'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=600',
      'https://images.unsplash.com/photo-1502082553048-f009c37129b9?w=600',
    ],
    schedule: [
      { day: 'Sâmbătă', time: '09:00 - 12:00', activity: 'Colectare deșeuri' },
      { day: 'Duminică', time: '10:00 - 13:00', activity: 'Plantare și sortare reciclabile' },
    ],
    contact: 'contact@verdeurban.ro',
  },
  {
    id: 2,
    title: 'Ajutor pentru adăpostul de animale',
    organization: 'Prieteni Patrupăioși',
    city: 'Cluj-Napoca',
    category: 'Animale',
    availability: 'Săptămână',
    description: 'Căutăm voluntari pentru hrănirea câinilor, curățarea boxelor, plimbări și socializarea animalelor din adăpost.',
    image: 'https://images.unsplash.com/photo-1548199973-03cce0bbc87b?w=900',
    photos: [
      'https://images.unsplash.com/photo-1548199973-03cce0bbc87b?w=600',
      'https://images.unsplash.com/photo-1601758228041-f3b2795255f1?w=600',
    ],
    schedule: [
      { day: 'Luni și Miercuri', time: '16:00 - 18:00', activity: 'Hrănire și curățenie' },
      { day: 'Vineri', time: '17:00 - 19:00', activity: 'Plimbări și socializare' },
    ],
    contact: 'voluntariat@prienipatrupaiosi.ro',
  },
  {
    id: 3,
    title: 'Cursuri de sprijin școlar pentru copii',
    organization: 'Educație pentru Toți',
    city: 'Iași',
    category: 'Educație',
    availability: 'Săptămână',
    description: 'Voluntarii susțin elevii din clasele primare la teme, citit și matematică. Nu este necesară experiență didactică, doar răbdare și disponibilitate.',
    image: 'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=900',
    photos: [
      'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=600',
      'https://images.unsplash.com/photo-1427504494785-3a9ca7044f45?w=600',
    ],
    schedule: [
      { day: 'Marți', time: '17:00 - 19:00', activity: 'Teme și citit' },
      { day: 'Joi', time: '17:00 - 19:00', activity: 'Matematică și jocuri educaționale' },
    ],
    contact: 'hello@educatiepentrototi.ro',
  },
  {
    id: 4,
    title: 'Pachete pentru persoane în nevoie',
    organization: 'Ajutor Social București',
    city: 'București',
    category: 'Social',
    availability: 'Weekend',
    description: 'Asamblăm și distribuim pachete cu alimente, produse de igienă și haine pentru persoane vulnerabile din București.',
    image: 'https://images.unsplash.com/photo-1593113598332-cd288d649433?w=900',
    photos: [
      'https://images.unsplash.com/photo-1593113598332-cd288d649433?w=600',
      'https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?w=600',
    ],
    schedule: [
      { day: 'Sâmbătă', time: '10:00 - 14:00', activity: 'Asamblare pachete' },
      { day: 'Duminică', time: '11:00 - 15:00', activity: 'Distribuție în comunitate' },
    ],
    contact: 'ajutor@socialbucuresti.ro',
  },
  {
    id: 5,
    title: 'Plantare de copaci',
    organization: 'Grupul Eco Local',
    city: 'București',
    category: 'Mediu',
    availability: 'Weekend',
    description: 'Plantăm puieți și îngrijim zonele verzi din cartier.',
    // fără poze: arată cum se comportă pagina când lipsesc imaginile
    schedule: [{ day: 'Sâmbătă', time: '09:00 - 13:00', activity: 'Plantare' }],
    contact: 'eco@grupulecolocal.ro',
  },
];

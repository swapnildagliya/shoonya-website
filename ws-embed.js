// ws-embed.js — Shoonya style page embed
// Served from: https://classes.shoonyadance.com/ws-embed.js
// v5 · 2026-06-19 — add inline "Add your classes to your calendar" buttons after
//                   the date list: one direct .ics download per class/level, built
//                   from the live publicSchedule feed (holiday + teacher-break aware).
// v4 · 2026-06-10 — auto-hide stale "Spring 2026 classes still running" notes
//                   baked into older Level/Pricing blocks, from 14 Jun onward
// v3 · 2026-06-09 — drop-in packs moved to the Block Studio levels block (not the
//                   embed); Yoga "also" card now reads "Tue & Wed · Open"
//
// Usage — replace the Practical code block on any style page with:
//   <div id="ws-prac-root"></div>
//   <script src="https://classes.shoonyadance.com/ws-embed.js"></script>
//
// The script reads window.location.pathname, finds the matching page data,
// and injects the Practical + Also at Shoonya block automatically.
// Update this file → all style pages get the change on next load.
// Cache-bust by appending ?v=YYYYMMDD to the src in Squarespace if needed.

(function () {
  'use strict';

  // ── Canonical slug map ────────────────────────────────────────────────────
  // Single source of truth for all style page URLs on www.shoonyadance.com.
  // Update here when a slug changes — all "Also at Shoonya" cards inherit it.
  var SLUGS = {
    'Argentine Tango':         '/argentijnse-tango-danslessen-gent',
    'Flamenco':                '/flamenco-danslessen-in-gent',
    'Ballet':                  '/ballet-voor-volwassenen-in-gent',
    'Kizomba':                 '/kizomba-danslessen-in-gent',
    'Bachata':                 '/bachata-dance-classes-in-ghent',
    'Cuban Salsa':             '/cuban-salsa-in-gent',
    'Rueda de Casino':         '/rueda-de-casino-danslessen-gent',
    'Lindy Hop':               '/lindy-hop-danslessen-in-gent',
    'Solo Jazz':               '/solo-jazz-danslessen-in-gent',
    'Tap Dance':               '/tapdans-lessen-in-gent',
    'Raqs Sharqi':             '/raqs-sharqi-danslessen-in-gent',
    'African Congolese Dance': '/afrikaanse-congolese-dans-gent',
    'Burlesque':               '/burlesque-lessen-in-gent',
    'Cissy Ball':              '/cissy-ball-danslessen-in-gent',
    'Bollyfolk':               '/bollyfolk-danslessen-in-gent',
    'Bollywood':               '/bollywood-danslessen-in-gent',
    'Bhangra':                 '/bhangra-danslessen-in-gent',
    'Indian Semi-Classical':   '/kathak-danslessen-in-gent',
    'Yoga':                    '/yoga-lessen-in-gent',
    'Indian Dance Technique':  '/indian-dance-in-belgium',
    'Pilates for Dancers':     '/pilates-voor-dansers-gent',
    'Dance & Fit':             '/dance-fit-gent',
    'Bachata Solo Style':      '/bachata-solo-style-gent',
    'Oriental Flow':           '/oriental-flow-gent'
  };

  // ── Add-to-calendar (inline .ics download) ────────────────────────────────
  // Style pages list session dates as plain display text (no machine dates), so
  // we pull the real per-class dates from the same publicSchedule feed the
  // schedule page uses (holiday- AND teacher-break-aware), and build the .ics
  // in-browser. One file → all pages; downloads right on the style page, no jump.
  var SCHED_FEED = 'https://script.google.com/macros/s/AKfycbwh9PSrNxMUkBaMayhyfnU3XDzL76khEm7RL932CJ83qqm7dTG9afA-WB1cZYKSrcs3/exec';
  var SCHED_SEMESTER = 'Semester 1 — 2026/2027';
  var _feedPromise = null;

  function styleForPath(path) {
    for (var name in SLUGS) { if (SLUGS[name] === path) return name; }
    return null;
  }

  function fetchSchedule() {
    if (_feedPromise) return _feedPromise;
    _feedPromise = fetch(SCHED_FEED + '?action=publicSchedule&semester=' + encodeURIComponent(SCHED_SEMESTER))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { return (j && j.ok && Array.isArray(j.slots)) ? j.slots : null; })
      .catch(function () { return null; }); // offline / CORS → no button, no breakage
    return _feedPromise;
  }

  function hhmm(s) { var m = String(s).match(/(\d{1,2}):(\d{2})/); return m ? (('0' + m[1]).slice(-2) + ':' + m[2]) : ''; }

  // Empty slotDates in the feed = full-term class → compute the STANDARD calendar
  // (school holidays only), exactly as the schedule page does. NOT "no dates".
  var TERM = { start: '2026-09-14', end: '2027-01-30' };
  var HOLIDAYS = [{ start: '2026-11-01', end: '2026-11-08' }, { start: '2026-12-20', end: '2027-01-10' }];
  var DAY_IDX = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  function computeStdDates(dayCode) {
    var tgt = DAY_IDX[dayCode]; if (tgt == null) return [];
    var end = new Date(TERM.end + 'T12:00:00');
    var hol = HOLIDAYS.map(function (h) { return [new Date(h.start + 'T00:00:00').getTime(), new Date(h.end + 'T23:59:59').getTime()]; });
    var d = new Date(TERM.start + 'T12:00:00');
    while (d.getDay() !== tgt) d.setDate(d.getDate() + 1);
    var out = [];
    while (d.getTime() <= end.getTime()) {
      var iso = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
      var t = d.getTime();
      if (!hol.some(function (h) { return t >= h[0] && t <= h[1]; })) out.push(iso);
      d.setDate(d.getDate() + 7);
    }
    return out;
  }
  function sessionDates(slot) { return (slot.slotDates && slot.slotDates.length) ? slot.slotDates : computeStdDates(slot.day); }

  // Build a multi-VEVENT .ics (one event per session — same logic as the schedule
  // page; DTSTART+RDATE silently drops dates in Apple/Google one-shot import).
  function buildICS(slot) {
    var dates = sessionDates(slot);
    var start = hhmm(slot.start), end = hhmm(slot.end);
    if (!dates.length || !start || !end) return null;
    var dt = function (d, t) { return d.replace(/-/g, '') + 'T' + t.replace(':', '') + '00'; };
    var e2 = function (v) { return String(v).replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n'); };
    var slug = (slot.style + '-' + slot.day + '-' + (slot.studio || '') + '-' + start).toLowerCase().replace(/[^a-z0-9]+/g, '-');
    var summary = e2(slot.style + ' · Shoonya');
    var loc = e2((slot.studioName || slot.studio || '') + ' · Shoonya Dance Centre, Stapelplein 41, 9000 Gent');
    var desc = e2((slot.level || '') + (slot.teacher ? ' · with ' + slot.teacher : '') + '. Class times only.');
    var L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Shoonya Dance Centre//Styles//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'BEGIN:VTIMEZONE', 'TZID:Europe/Brussels',
      'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200', 'TZNAME:CEST', 'DTSTART:19700329T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'END:DAYLIGHT',
      'BEGIN:STANDARD', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100', 'TZNAME:CET', 'DTSTART:19701025T030000', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD',
      'END:VTIMEZONE'];
    dates.forEach(function (d) {
      L.push('BEGIN:VEVENT', 'UID:' + slug + '-' + d.replace(/-/g, '') + '@styles.shoonyadance.com',
        'DTSTART;TZID=Europe/Brussels:' + dt(d, start), 'DTEND;TZID=Europe/Brussels:' + dt(d, end),
        'SUMMARY:' + summary, 'LOCATION:' + loc, 'DESCRIPTION:' + desc, 'END:VEVENT');
    });
    L.push('END:VCALENDAR');
    return L.join('\r\n');
  }

  // ── Drop-in packs ─────────────────────────────────────────────────────────
  // The casual-attendance classes (Pilates, Dance & Fit, Wednesday Yoga) offer
  // 3- and 5-session packs instead of single drop-ins. Same Zoho workshop form
  // for all three — the pack/event is selected inside the form.
  // NB: Zoho lists these under "Festivals & Events" (no native drop-in type yet).
  var DROPIN_URL = 'https://creatorapp.zohopublic.eu/developer_shoonyadance/shoonya-dance-studio/form-perma/Workshop_Registration_Form/uOO7GVYHQEJn5dSVDz7z1nTXXeEfD0AZ4PJvtQJ0ZbMRum3tBX30zxQHC02n9b3bvTO6ORFDsVCfS4bJQF1VOZdBMZquYuPb4xx8';
  var DROPIN_PACKS = [
    { label: '3 sessions', price: '€40.50' },
    { label: '5 sessions', price: '€67.50' }
  ];

  // ── Per-page data ─────────────────────────────────────────────────────────
  // Keys = Squarespace page path (no trailing slash, lowercase).
  // also[] = [styleName, meta] — styleName must match a key in SLUGS above.
  // dropinPacks = { note, packs, url } — renders the drop-in pack section.
  var PAGES = {
    '/argentijnse-tango-danslessen-gent': {
      wear:  'Comfortable, form-fitting dancewear. Smooth-soled indoor shoes that allow you to pivot easily — thick socks work fine for beginners. Change into dance shoes outside the studio.',
      bring: 'Water bottle. Dance shoes (or thick socks to start).',
      partner: { required: true },
      also:  [['Bachata','Tuesday · L1/L2/L3'],['Cuban Salsa','Monday · L1/L2/L3/L4'],['Flamenco','Tuesday · L1/L2/L3']]
    },
    '/flamenco-danslessen-in-gent': {
      wear:  'Comfortable clothing you can move freely in. A flamenco skirt is welcome but not required. Flamenco heels or chapins (lace boots) — change into dance shoes outside the studio, no street shoes inside.',
      bring: 'Water bottle.',
      shoeGuide: {
        brands: [
          { name: 'Senovilla',      note: 'Professional, excellent sound',  badge: 'BEST' },
          { name: 'Gallardo',       note: 'Oldest brand, very reliable' },
          { name: 'Antonio Garcia', note: 'Solid professional option' },
          { name: 'Begoña Cervera', note: 'Beautiful — mostly high heels' },
          { name: 'Menkes',         note: 'Reliable professional brand' },
          { name: 'Artefyl',        note: 'Sturdy but hard sole' },
          { name: 'Sodanza',        note: 'Semi-professional, lower price' },
          { name: 'Gladys',         note: 'Not recommended — avoid', warn: true }
        ],
        advice: 'Invest in a professional-level shoe — it improves your dancing immediately. Avoid open-sided models. Chapins (lace boots) are a great alternative to heels. Max heel height 5 cm. Width: normal (A) or extra wide (AA). Material: leather lasts longer, suede adapts faster. Some shoes take weeks to break in — borrow from a classmate before buying online.',
        whereToBuy: [
          { name: 'Flamencoschool La Juana', location: 'Houthalen-Helchteren (has a shop)' },
          { name: 'The Danceshop',           location: 'Lille, France (Begoña Cervera)' }
        ]
      },
      also:  [['Ballet','Friday · L1/L2/L3'],['Indian Semi-Classical','Wednesday · L2'],['Tap Dance','Mon–Sat · L1–L4']]
    },
    '/ballet-voor-volwassenen-in-gent': {
      wear:  'Comfortable, form-fitting dancewear. Ballet shoes or socks — no street shoes in the studio.',
      bring: 'Water bottle. Small hand towel for sweat.',
      also:  [['Yoga','Tue & Wed · Open'],['Flamenco','Tuesday · L1/L2/L3'],['Indian Dance Technique','Tuesday · Open']]
    },
    '/kizomba-danslessen-in-gent': {
      wear:  'Comfortable, form-fitting dancewear. Appropriate dance shoes or socks.',
      bring: 'Water bottle.',
      partner: { required: true },
      also:  [['African Congolese Dance','Saturday · Open'],['Argentine Tango','Thursday · L1 & L2'],['Bachata','Tuesday · L1/L2/L3']]
    },
    '/bachata-dance-classes-in-ghent': {
      wear:  'Indoor dance shoes with suede or smooth leather soles — or socks. No street shoes in the studio.',
      bring: 'Water bottle. Dance shoes (or thick socks to start).',
      partner: { required: true, evening: { text: '2nd Friday of the month, 20:00–01:00', url: '/calendar' }, guide: 'No prior Bachata? Start at Level 1. Some experience? Level 2. Speak with us before joining Level 3.' },
      also:  [['Cuban Salsa','Monday · L1/L2/L3/L4'],['Rueda de Casino','Thursday · L1/L2'],['Argentine Tango','Thursday · L1 & L2']]
    },
    '/cuban-salsa-in-gent': {
      wear:  'Comfortable, form-fitting dancewear. Appropriate dance shoes or socks.',
      bring: 'Water bottle.',
      partner: { required: true, evening: { text: '2nd Friday of the month, 20:00–01:00', url: '/calendar' } },
      also:  [['Bachata','Tuesday · L1/L2/L3'],['Rueda de Casino','Thursday · L1/L2'],['Flamenco','Tuesday · L1/L2/L3']]
    },
    '/rueda-de-casino-danslessen-gent': {
      wear:  'Comfortable, form-fitting dancewear. Appropriate dance shoes or socks.',
      bring: 'Water bottle.',
      partner: { required: true, evening: { text: '2nd Friday of the month, 20:00–01:00', url: '/calendar' }, guide: 'Pre-requisite: You must have completed at least 2 seasons of Cuban Salsa classes to join this group. Note: Only current students can join the Rueda de Casino level 2/3 batches.' },
      also:  [['Bachata','Tuesday · L1/L2/L3'],['Lindy Hop','Wednesday · L1/L2'],['African Congolese Dance','Saturday · Open']]
    },
    '/lindy-hop-danslessen-in-gent': {
      wear:  'Comfortable, form-fitting dancewear. Appropriate dance shoes or socks.',
      bring: 'Water bottle.',
      also:  [['Solo Jazz','Wednesday · Open'],['Argentine Tango','Thursday · L1 & L2'],['Tap Dance','Mon–Sat · L1–L4']]
    },
    '/solo-jazz-danslessen-in-gent': {
      wear:  'Comfortable, form-fitting dancewear. Appropriate dance shoes or socks.',
      bring: 'Water bottle.',
      also:  [['Lindy Hop','Wednesday · L1/L2'],['Tap Dance','Mon–Sat · L1–L4'],['Burlesque','Monday · L1/L2']]
    },
    '/tapdans-lessen-in-gent': {
      wear:  'Tap dance shoes. Beginners: shoes are available to borrow free of charge for your first year — no purchase needed to start.',
      bring: 'Water bottle.',
      also:  [['Lindy Hop','Wednesday · L1/L2'],['Solo Jazz','Wednesday · Open'],['Flamenco','Tuesday · L1/L2/L3']]
    },
    '/raqs-sharqi-danslessen-in-gent': {
      wear:  'Comfortable, stretchy clothing. Come barefoot.',
      bring: 'Water bottle.',
      also:  [['Flamenco','Tuesday · L1/L2/L3'],['Bachata','Tuesday · L1/L2/L3'],['Bollywood','Thursday · L2 & L3']]
    },
    '/afrikaanse-congolese-dans-gent': {
      wear:  'Comfortable, form-fitting dancewear. Appropriate dance shoes or socks.',
      bring: 'Water bottle.',
      also:  [['Kizomba','Wednesday · L1/L2/L3'],['Raqs Sharqi','Monday · L1/L2/L3'],['Bhangra','Wednesday · L2']]
    },
    '/burlesque-lessen-in-gent': {
      wear:  'Comfortable, form-fitting dancewear. Appropriate dance shoes or socks.',
      bring: 'Water bottle.',
      also:  [['Cissy Ball','Monday · Open'],['Solo Jazz','Wednesday · Open'],['Oriental Flow','Saturday · Open']]
    },
    '/cissy-ball-danslessen-in-gent': {
      wear:  'Comfortable, form-fitting dancewear. Appropriate dance shoes or socks.',
      bring: 'Water bottle.',
      also:  [['Burlesque','Monday · L1/L2'],['Argentine Tango','Thursday · L1 & L2'],['Indian Dance Technique','Tuesday · Open']]
    },
    '/bollyfolk-danslessen-in-gent': {
      wear:  'Comfortable dancewear. Come barefoot — no shoes in Studio Aakash.',
      bring: 'Water bottle.',
      also:  [['Yoga','Tue & Wed · Open'],['Bollywood','Thursday · L2 & L3'],['Flamenco','Tuesday · L1/L2/L3']]
    },
    '/bollywood-danslessen-in-gent': {
      wear:  'Comfortable dancewear. Come barefoot — no shoes in Studio Aakash.',
      bring: 'Water bottle.',
      also:  [['Bhangra','Wednesday · L2'],['Bollyfolk','Tuesday · Open'],['Raqs Sharqi','Monday · L1/L2/L3']]
    },
    '/bhangra-danslessen-in-gent': {
      wear:  'Comfortable dancewear. Come barefoot — no shoes in Studio Aakash.',
      bring: 'Water bottle.',
      also:  [['Bollyfolk','Tuesday · Open'],['Bollywood','Thursday · L2 & L3'],['Indian Semi-Classical','Wednesday · L2']]
    },
    '/kathak-danslessen-in-gent': {
      wear:  'Comfortable dancewear. Come barefoot — no shoes in Studio Aakash.',
      bring: 'Water bottle. Ghungroo (ankle bells) if you have them.',
      also:  [['Indian Dance Technique','Tuesday · Open'],['Bollyfolk','Tuesday · Open'],['Bollywood','Thursday · L2 & L3']]
    },
    '/yoga-lessen-in-gent': {
      wear:  'Comfortable, stretchy clothing. Come barefoot.',
      bring: 'Water bottle. Yoga mat if you have one — mats available at Shoonya. Using a studio mat? Bring a yoga towel to lay over it. Small hand towel for sweat.',
      dropinPacks: {
        note:  'Prefer flexibility? Choose any dates from the Wednesday schedule above and come for 3 or 5 sessions — no semester commitment needed.',
        packs: DROPIN_PACKS,
        url:   DROPIN_URL
      },
      also:  [['Indian Dance Technique','Tuesday · Open'],['Bollyfolk','Tuesday · Open'],['Pilates for Dancers','Tue & Wed · Open']]
    },
    '/indian-dance-in-belgium': {
      wear:  'Comfortable dancewear. Come barefoot — no shoes in Studio Aakash.',
      bring: 'Water bottle.',
      also:  [['Yoga','Tue & Wed · Open'],['Bollyfolk','Tuesday · Open'],['Ballet','Friday · L1/L2/L3']]
    },
    '/pilates-voor-dansers-gent': {
      wear:  'Comfortable, stretchy clothing. Barefoot or grip socks.',
      bring: 'Water bottle. Yoga mat if you have one — mats available at Shoonya. Using a studio mat? Bring a yoga towel to lay over it. Small hand towel for sweat.',
      dropinPacks: {
        note:  'Prefer flexibility? Choose any dates from the schedule above and come for 3 or 5 sessions — no semester commitment needed.',
        packs: DROPIN_PACKS,
        url:   DROPIN_URL
      },
      also:  [['Dance & Fit','Wednesday · Open'],['Yoga','Tue & Wed · Open'],['Raqs Sharqi','Monday · L1/L2/L3']]
    },
    '/dance-fit-gent': {
      wear:  'Comfortable sportswear. Indoor shoes or barefoot.',
      bring: 'Water bottle. Small hand towel for sweat.',
      dropinPacks: {
        note:  'Prefer flexibility? Choose any dates from the schedule above and come for 3 or 5 sessions — no semester commitment needed.',
        packs: DROPIN_PACKS,
        url:   DROPIN_URL
      },
      also:  [['Pilates for Dancers','Tue & Wed · Open'],['Raqs Sharqi','Monday · L1/L2/L3'],['Yoga','Tue & Wed · Open']]
    },
    '/bachata-solo-style-gent': {
      wear:  'Indoor dance shoes with suede or smooth leather soles — or socks.',
      bring: 'Water bottle.',
      also:  [['Bachata','Tuesday · L1/L2/L3'],['Cuban Salsa','Monday · L1/L2/L3/L4'],['Rueda de Casino','Thursday · L1/L2']]
    },
    '/oriental-flow-gent': {
      wear:  'Comfortable dancewear you can move freely in. Barefoot or soft dance shoes.',
      bring: 'Water bottle. Hip scarf optional.',
      also:  [['Raqs Sharqi','Monday · Open'],['Kizomba','Wednesday · Open'],['Burlesque','Thursday · L1/L2']]
    }
  };

  // ── Component CSS ─────────────────────────────────────────────────────────
  var COMP_CSS = [
    '.wsep-prac{width:100%;font-family:\'PT Serif\',Georgia,serif;}',
    '.wsep-prac .sec-label{font-size:.72rem;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#1a1a1a;margin:0 0 .5rem;}',
    '.wsep-prac h2.section-h{font-family:\'Marcellus\',serif;font-weight:400;font-size:1.6rem;color:#1a1a1a;margin:0 0 1.25rem;}',
    '.wsep-prac .prac-grid{display:grid;grid-template-columns:1fr 1fr;gap:1.5rem 2rem;margin-bottom:2rem;}',
    '@media(max-width:700px){.wsep-prac .prac-grid{grid-template-columns:1fr;}}',
    '.wsep-prac .prac-item h4{font-family:\'Marcellus\',serif;font-weight:400;font-size:1rem;color:#1a1a1a;margin:0 0 .4rem;}',
    '.wsep-prac .prac-item p{font-size:.88rem;color:#444;margin:0;line-height:1.55;}',
    '.wsep-prac .also-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:1rem;margin-top:.75rem;}',
    '@media(max-width:700px){.wsep-prac .also-grid{grid-template-columns:1fr;}}',
    '.wsep-prac .also-card{position:relative;background:#B564F7;color:#fff;border-radius:10px;padding:1.5rem 1.4rem;transition:opacity .15s;}',
    '.wsep-prac .also-card:hover{opacity:.9;}',
    '.wsep-prac .also-card h3{font-family:\'Marcellus\',serif;font-weight:400;font-size:1.1rem;color:#fff;margin:0 0 .35rem;}',
    '.wsep-prac .also-card .also-meta{font-size:.78rem;color:rgba(255,255,255,.85);margin:0 0 .9rem;}',
    '.wsep-prac .also-card .also-cta{font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#fff;}',
    '.wsep-prac a.also-link,.wsep-prac a.also-link:link,.wsep-prac a.also-link:visited,.wsep-prac a.also-link:hover,.wsep-prac a.also-link:focus,.wsep-prac a.also-link:active{position:absolute;inset:0;display:block;z-index:1;background:transparent!important;background-color:transparent!important;background-image:none!important;color:transparent!important;text-decoration:none!important;border:0!important;box-shadow:none!important;outline:none!important;pointer-events:auto!important;cursor:pointer!important;}',
    '.wsep-prac .wsep-shoe{margin-bottom:2rem;}',
    '.wsep-prac .wsep-shoe-sub{font-size:.68rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#888;margin:0 0 .75rem;}',
    '.wsep-prac .wsep-shoe-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:.5rem .75rem;margin-bottom:1rem;}',
    '@media(max-width:700px){.wsep-prac .wsep-shoe-grid{grid-template-columns:repeat(2,1fr);}}',
    '.wsep-prac .wsep-shoe-item{padding:.5rem .65rem;border-radius:6px;background:#faf8f4;}',
    '.wsep-prac .wsep-shoe-name{font-size:.83rem;font-weight:700;color:#1a1a1a;display:flex;align-items:center;gap:.4rem;flex-wrap:wrap;}',
    '.wsep-prac .wsep-shoe-badge{font-size:.58rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;background:#1a1a1a;color:#fff;padding:.1rem .35rem;border-radius:3px;}',
    '.wsep-prac .wsep-shoe-note{font-size:.75rem;color:#666;margin-top:.15rem;line-height:1.4;}',
    '.wsep-prac .wsep-shoe-warn .wsep-shoe-note{color:#c0392b;}',
    '.wsep-prac .wsep-shoe-advice{font-size:.83rem;color:#444;line-height:1.6;margin-bottom:.75rem;}',
    '.wsep-prac .wsep-shoe-buy-label{font-size:.68rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#888;margin-bottom:.35rem;}',
    '.wsep-prac .wsep-shoe-buy-list{font-size:.83rem;color:#444;line-height:1.6;}',
    '.wsep-prac .wsep-pi-info{border:1.5px solid #e8dcf8;border-radius:8px;padding:.65rem .9rem;margin-bottom:2rem;display:flex;flex-direction:column;gap:0;}',
    '.wsep-prac .wsep-pi-row{display:flex;gap:.65rem;align-items:flex-start;padding:.55rem 0;border-bottom:1px solid #f0e8fb;}',
    '.wsep-prac .wsep-pi-row:last-child{border-bottom:none;padding-bottom:0;}',
    '.wsep-prac .wsep-pi-row:first-child{padding-top:0;}',
    '.wsep-prac .wsep-pi-icon{font-size:.9rem;margin-top:.1rem;flex-shrink:0;}',
    '.wsep-prac .wsep-pi-text{font-size:.83rem;color:#444;line-height:1.55;}',
    '.wsep-prac .wsep-pi-text strong{color:#1a1a1a;font-weight:700;}',
    '.wsep-prac .wsep-pi-text a,.wsep-prac .wsep-pi-text a:link,.wsep-prac .wsep-pi-text a:visited{color:#B564F7;text-decoration:none;pointer-events:auto!important;cursor:pointer!important;}',
    '.wsep-prac .wsep-pi-text a:hover{text-decoration:underline;}',
    '.wsep-prac .wsep-dropin{border-top:1.5px dashed #d4bef7;padding-top:1.1rem;margin:0 0 2rem;}',
    '.wsep-prac .wsep-dropin-label{font-size:.72rem;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#B564F7;margin:0 0 .4rem;}',
    '.wsep-prac .wsep-dropin-note{font-size:.85rem;color:#444;line-height:1.55;margin:0 0 .9rem;}',
    '.wsep-prac .wsep-dropin-packs{display:flex;gap:.65rem;margin-bottom:.9rem;}',
    '.wsep-prac .wsep-dropin-pack{flex:1;border:1.5px solid #d4bef7;border-radius:8px;padding:.7rem .75rem;text-align:center;background:#faf4ff;}',
    '.wsep-prac .wsep-dropin-sessions{font-size:.68rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#B564F7;margin-bottom:.2rem;}',
    '.wsep-prac .wsep-dropin-price{font-family:\'Marcellus\',serif;font-size:1.2rem;color:#1a1a1a;}',
    '.wsep-prac a.wsep-dropin-btn,.wsep-prac a.wsep-dropin-btn:link,.wsep-prac a.wsep-dropin-btn:visited,.wsep-prac a.wsep-dropin-btn:hover,.wsep-prac a.wsep-dropin-btn:focus,.wsep-prac a.wsep-dropin-btn:active{display:block;text-align:center;background:transparent!important;color:#B564F7!important;font-family:\'PT Serif\',Georgia,serif!important;font-size:.85rem;font-weight:700;letter-spacing:.04em;text-decoration:none!important;border:1.5px solid #B564F7!important;border-radius:7px;padding:.6rem 1rem;pointer-events:auto!important;cursor:pointer!important;box-shadow:none!important;outline:none!important;}',
    '.wsep-prac a.wsep-dropin-btn:hover{background:#B564F7!important;color:#fff!important;}',
    // Add-to-calendar buttons — sit outside .wsep-prac (next to the date list), so unscoped.
    '.wsep-cal-group{margin:.75rem 0 1.25rem;}',
    '.wsep-cal-head{font-size:.7rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#7E4FBF;margin:0 0 .5rem;}',
    'a.wsep-cal-link,a.wsep-cal-link:link,a.wsep-cal-link:visited,a.wsep-cal-link:hover,a.wsep-cal-link:focus,a.wsep-cal-link:active{display:inline-block;margin:0 .5rem .5rem 0;font-family:\'PT Serif\',Georgia,serif!important;font-size:.82rem;font-weight:700;letter-spacing:.02em;color:#B564F7!important;background:transparent!important;text-decoration:none!important;border:1.5px solid #B564F7!important;border-radius:7px;padding:.5rem .9rem;pointer-events:auto!important;cursor:pointer!important;box-shadow:none!important;outline:none!important;}',
    'a.wsep-cal-link:hover{background:#B564F7!important;color:#fff!important;}'
  ].join('\n');

  // ── Helpers ───────────────────────────────────────────────────────────────

  function esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function injectStyles() {
    if (document.getElementById('wsep-css')) return;
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Marcellus&family=PT+Serif:ital,wght@0,400;0,700;1,400&display=swap';
    document.head.appendChild(link);
    var style = document.createElement('style');
    style.id = 'wsep-css';
    style.textContent = COMP_CSS;
    document.head.appendChild(style);
  }

  function buildShoeGuide(guide) {
    if (!guide) return '';
    var brandsHtml = guide.brands.map(function (b) {
      var badge = b.badge ? '<span class="wsep-shoe-badge">' + esc(b.badge) + '</span>' : '';
      return '<div class="wsep-shoe-item' + (b.warn ? ' wsep-shoe-warn' : '') + '">' +
        '<div class="wsep-shoe-name">' + esc(b.name) + badge + '</div>' +
        '<div class="wsep-shoe-note">' + esc(b.note) + '</div>' +
        '</div>';
    }).join('');
    var buyHtml = '';
    if (guide.whereToBuy && guide.whereToBuy.length) {
      var items = guide.whereToBuy.map(function (s) {
        return '<strong>' + esc(s.name) + '</strong> — ' + esc(s.location);
      }).join(' &nbsp;·&nbsp; ');
      buyHtml = '<p class="wsep-shoe-buy-label">Where to buy</p>' +
        '<p class="wsep-shoe-buy-list">' + items + '</p>';
    }
    return '<div class="wsep-shoe">' +
      '<p class="sec-label">Flamenco shoes</p>' +
      '<p class="wsep-shoe-sub">Recommended brands</p>' +
      '<div class="wsep-shoe-grid">' + brandsHtml + '</div>' +
      (guide.advice ? '<p class="wsep-shoe-advice">' + esc(guide.advice) + '</p>' : '') +
      buyHtml +
      '</div>';
  }

  function buildPartnerStrip(partner) {
    if (!partner) return '';
    var rows = [];
    var forumUrl = 'https://www.facebook.com/groups/1405926722822445';
    if (partner.required) {
      rows.push(
        '<div class="wsep-pi-row">' +
          '<span class="wsep-pi-icon" aria-hidden="true">👫</span>' +
          '<span class="wsep-pi-text"><strong>Partner registration required</strong> — please register together with your dance partner. ' +
          'Looking for a partner? <a href="' + forumUrl + '" target="_blank" rel="noopener noreferrer">Join the Shoonya Dance Forum →</a></span>' +
        '</div>'
      );
    }
    if (partner.evening) {
      var pe = partner.evening;
      var peLink = pe.url
        ? '<a href="' + esc(pe.url) + '">' + esc(pe.text) + '</a>'
        : esc(pe.text);
      rows.push(
        '<div class="wsep-pi-row">' +
          '<span class="wsep-pi-icon" aria-hidden="true">🎵</span>' +
          '<span class="wsep-pi-text"><strong>Practice evening</strong> — Salsa &amp; Bachata social: ' + peLink + '</span>' +
        '</div>'
      );
    }
    if (partner.guide) {
      rows.push(
        '<div class="wsep-pi-row">' +
          '<span class="wsep-pi-icon" aria-hidden="true">💬</span>' +
          '<span class="wsep-pi-text"><strong>Which level?</strong> — ' + esc(partner.guide) + '</span>' +
        '</div>'
      );
    }
    if (!rows.length) return '';
    return '<div class="wsep-pi-info">' + rows.join('') + '</div>';
  }

  function buildDropinPacks(dp) {
    if (!dp || !dp.packs || !dp.packs.length) return '';
    var tiles = dp.packs.map(function (p) {
      return '<div class="wsep-dropin-pack">' +
        '<div class="wsep-dropin-sessions">' + esc(p.label) + '</div>' +
        '<div class="wsep-dropin-price">' + esc(p.price) + '</div>' +
        '</div>';
    }).join('');
    return '<div class="wsep-dropin">' +
      '<p class="wsep-dropin-label">Drop-in packs</p>' +
      (dp.note ? '<p class="wsep-dropin-note">' + esc(dp.note) + '</p>' : '') +
      '<div class="wsep-dropin-packs">' + tiles + '</div>' +
      '<a class="wsep-dropin-btn" href="' + esc(dp.url) + '" target="_blank" rel="noopener noreferrer">Book drop-in pack →</a>' +
      '</div>';
  }

  function buildPractical(data) {
    var cards = data.also.map(function (pair) {
      var name = pair[0], meta = pair[1];
      var slug = SLUGS[name] || '#';
      return '<div class="also-card">' +
        '<h3>' + esc(name) + '</h3>' +
        '<div class="also-meta">' + esc(meta) + '</div>' +
        '<span class="also-cta">View →</span>' +
        '<a class="also-link" href="' + slug + '" aria-label="' + esc(name) + '"></a>' +
        '</div>';
    }).join('');

    return '<div class="wsep-prac">' +
      '<p class="sec-label">Practical</p>' +
      '<div class="prac-grid">' +
        '<div class="prac-item"><h4>What to wear</h4><p>' + esc(data.wear) + '</p></div>' +
        '<div class="prac-item"><h4>What to bring</h4><p>' + esc(data.bring) + '</p></div>' +
      '</div>' +
      buildShoeGuide(data.shoeGuide) +
      buildPartnerStrip(data.partner) +
      // Drop-in packs now live in the Block Studio levels block (per-day cards),
      // NOT here — rendering them in the embed too would duplicate them on the page.
      '<p class="sec-label">Also at Shoonya</p>' +
      '<h2 class="section-h">You might also like</h2>' +
      '<div class="also-grid">' + cards + '</div>' +
      '</div>';
  }

  // ── Seasonal note auto-hide ───────────────────────────────────────────────
  // Older pasted Level/Pricing blocks have a static <p class="spring-note"> baked
  // in at generation time (no build-time date logic). Once spring 2026 has ended
  // (last class 13 Jun 2026) that note reads wrong, so hide it everywhere from
  // 14 Jun onward. Runs on a few delayed passes because Squarespace injects code
  // blocks asynchronously. Safe no-op before the cutoff and on pages with no note.
  function hideExpiredSpringNotes() {
    try {
      if (new Date() < new Date('2026-06-14T00:00:00')) return;
      var notes = document.querySelectorAll('.spring-note');
      for (var i = 0; i < notes.length; i++) notes[i].style.display = 'none';
    } catch (e) {}
  }

  // ── Add-to-calendar buttons ───────────────────────────────────────────────
  // Adds direct-download .ics buttons under each date-list block. The style
  // pages already group classes by day (Mon/Wed/Thu cards, one date list each),
  // so we attach THAT day's level buttons to THAT day's card — keeping the page's
  // existing day grouping intact. Purely additive: only READS the page (anchor,
  // language, day) and INSERTS its own blocks; never edits or removes content.
  // Idempotent (_calDone flag). Runs on delayed passes (date blocks load async).
  var DAY_ORDER = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 7 };
  var _calDone = false;

  // Day code from a token like "ma", "Mon", "vrijdag", "Thursday" (NL + EN).
  function dayCode(tok) {
    tok = String(tok).toLowerCase().replace(/[^a-z]/g, '');
    if (tok === 'ma' || tok === 'mon' || tok.indexOf('maan') === 0 || tok.indexOf('mon') === 0) return 'mon';
    if (tok === 'di' || tok.indexOf('dins') === 0 || tok.indexOf('tue') === 0) return 'tue';
    if (tok === 'wo' || tok.indexOf('woen') === 0 || tok.indexOf('wed') === 0) return 'wed';
    if (tok === 'do' || tok.indexOf('dond') === 0 || tok.indexOf('thu') === 0) return 'thu';
    if (tok === 'vr' || tok.indexOf('vrij') === 0 || tok.indexOf('fri') === 0) return 'fri';
    if (tok === 'za' || tok.indexOf('zat') === 0 || tok.indexOf('sat') === 0) return 'sat';
    if (tok === 'zo' || tok.indexOf('zon') === 0 || tok.indexOf('sun') === 0) return 'sun';
    return null;
  }

  // Which day does this date-list block belong to? Read its first listed date.
  function blockDay(details) {
    try {
      var span = details.querySelector('[class*="date-grid"] span') || (details.querySelector('div') && details.querySelector('div').querySelector('span'));
      if (!span) return null;
      return dayCode(span.textContent.trim().split(/\s+/)[0]);
    } catch (e) { return null; }
  }

  // The class START times shown in this block's card. Generator layouts differ:
  // a 'per-level' card shows ONE class time → matches one class; a 'day' card shows
  // several level rows → matches several. We take the START of each "HH:MM–HH:MM"
  // range (group 1 only, so a class's END time never collides with the next's START).
  function cardStarts(details) {
    var card = details.closest('[class*="level-card"]') || details.closest('[class*="card"]') || details.parentElement;
    var set = {};
    var txt = card ? card.textContent : '';
    var re = /(\d{1,2}:\d{2})\s*[–\-—]\s*\d{1,2}:\d{2}/g, m;
    while ((m = re.exec(txt))) set[hhmm(m[1])] = 1;
    return set;
  }

  function calButton(slot, nl) {
    var ics = buildICS(slot); if (!ics) return null;
    var lvl = (slot.level || '').trim(); if (nl) lvl = lvl.replace(/Level/i, 'Niveau');
    var dayShort = (nl
      ? { mon: 'ma', tue: 'di', wed: 'wo', thu: 'do', fri: 'vr', sat: 'za', sun: 'zo' }
      : { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' })[slot.day] || slot.day;
    var a = document.createElement('a');
    a.className = 'wsep-cal-link';
    a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
    a.download = (slot.style + '-' + (slot.level || '') + '-' + slot.day + '-shoonya').toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.ics';
    a.textContent = '📅 ' + (lvl ? lvl + ' · ' : '') + dayShort + ' ' + hhmm(slot.start) + (nl ? ' — agenda' : ' — calendar');
    return a;
  }

  function injectCalendarButtons() {
    try {
      if (_calDone) return;
      var path = (window.location.pathname || '').replace(/\/$/, '').toLowerCase();
      var styleName = styleForPath(path);
      if (!styleName) return;
      if (!document.querySelector('details[class*="-date-list"]')) return; // not in DOM yet
      fetchSchedule().then(function (slots) {
        if (_calDone || !slots) return;
        var anchors = [].slice.call(document.querySelectorAll('details[class*="-date-list"]'));
        if (!anchors.length) return;
        var mine = slots.filter(function (s) { return (s.style || '').toLowerCase() === styleName.toLowerCase(); });
        if (!mine.length) return;
        mine.sort(function (a, b) { return (DAY_ORDER[a.day] || 9) - (DAY_ORDER[b.day] || 9) || hhmm(a.start).localeCompare(hhmm(b.start)); });
        injectStyles();
        _calDone = true;
        var rendered = {};
        var key = function (s) { return s.day + '|' + hhmm(s.start); };
        function makeGroup(list, nl) {
          var g = document.createElement('div'); g.className = 'wsep-cal-group';
          var h = document.createElement('div'); h.className = 'wsep-cal-head';
          h.textContent = nl ? 'Zet je lessen in je agenda' : 'Add your classes to your calendar';
          g.appendChild(h);
          list.forEach(function (s) { var b = calButton(s, nl); if (b) { g.appendChild(b); rendered[key(s)] = 1; } });
          return g;
        }
        // Attach buttons to each date-list block, matched by the block's day +
        // the class start-times shown in its card. Works for both layouts:
        //  • per-level card (one time)  → one button
        //  • day card (several rows)    → that day's buttons
        anchors.forEach(function (a) {
          var sum = a.querySelector('summary');
          var nl = /bekijk|sessies/.test((sum ? sum.textContent : '').toLowerCase());
          var day = blockDay(a);
          var starts = cardStarts(a);
          var hasStarts = Object.keys(starts).length > 0;
          var list = mine.filter(function (s) {
            if (rendered[key(s)]) return false;
            if (day && s.day !== day) return false;
            return hasStarts ? !!starts[hhmm(s.start)] : true;
          });
          if (!list.length) return;
          var g = makeGroup(list, nl);
          if (g.children.length > 1 && a.parentNode) a.parentNode.insertBefore(g, a.nextSibling);
        });
        // Safety: any class not matched to a day block → append under the last list.
        var leftover = mine.filter(function (s) { return !rendered[key(s)]; });
        if (leftover.length) {
          var last = anchors[anchors.length - 1];
          var sumL = last.querySelector('summary');
          var nlL = /bekijk|sessies/.test((sumL ? sumL.textContent : '').toLowerCase());
          var g2 = makeGroup(leftover, nlL);
          if (g2.children.length > 1 && last.parentNode) last.parentNode.insertBefore(g2, last.nextSibling);
        }
      });
    } catch (e) {}
  }

  // ── Entry point ───────────────────────────────────────────────────────────
  // Squarespace injects code blocks asynchronously, so #ws-prac-root may not
  // exist when DOMContentLoaded fires. Poll until it appears (max 3 seconds).

  function render() {
    var path = (window.location.pathname || '').replace(/\/$/, '').toLowerCase();
    var data = PAGES[path];
    if (!data) return; // no entry for this URL — do nothing

    var pracRoot = document.getElementById('ws-prac-root');
    if (pracRoot) {
      injectStyles();
      pracRoot.innerHTML = buildPractical(data);
    }
  }

  function init() {
    render();
    // Hide expired seasonal notes now and on a few delayed passes (the static
    // spring-note block is a separate Squarespace code block, injected async).
    hideExpiredSpringNotes();
    injectCalendarButtons();
    setTimeout(hideExpiredSpringNotes, 500);
    setTimeout(hideExpiredSpringNotes, 1500);
    setTimeout(hideExpiredSpringNotes, 3000);
    setTimeout(injectCalendarButtons, 600);
    setTimeout(injectCalendarButtons, 1600);
    setTimeout(injectCalendarButtons, 3200);
    // If the div wasn't in the DOM yet, poll every 100ms for up to 3 seconds
    if (!document.getElementById('ws-prac-root')) {
      var attempts = 0;
      var poll = setInterval(function () {
        attempts++;
        if (document.getElementById('ws-prac-root')) {
          clearInterval(poll);
          render();
        } else if (attempts >= 30) {
          clearInterval(poll); // give up after 3s
        }
      }, 100);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();

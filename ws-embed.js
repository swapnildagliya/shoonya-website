// ws-embed.js — Shoonya style page embed
// Served from: https://schooljaar.shoonyadance.com/ws-embed.js  ← the LIVE host.
//   ⚠️ This line used to say classes.shoonyadance.com. It was wrong, and it cost a session:
//   all 24 Squarespace style pages load the schooljaar copy. `classes` and `styles` serve
//   older copies of this file that NOTHING loads. The classes URL is aspirational — left over
//   from a subdomain rename that was prepared and REVERTED (truth/decisions.md §599: GitHub
//   Pages 404s the old domain instead of redirecting, so there is no zero-downtime path with
//   one repo). Deploy to `shoonya-website`; the other two repos are not load-bearing.
// v6 · 2026-06-19 — inject Course/CourseInstance JSON-LD per style page from the
//                   feed (style/level/day/time/dates/teacher/studio), so weekly
//                   classes are machine-readable for search + answer engines.
//                   No price/Offer yet (prices are computed tiers — add later).
// v5.1 · 2026-06-19 — match buttons to cards by day + START TIME (was day-only,
//                   which piled both same-day levels onto one per-level card).
//                   Time parsing accepts ":" / "." / "u"/"h" (NL Weglot renders
//                   "18.30 uur"). Card-title level number as fallback if no time.
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

  // Style names in the feed do not always match the SLUGS keys exactly. The sheet carries
  // "Raqs Sharqi (bellydance)" while SLUGS says "Raqs Sharqi", and an exact lowercase compare
  // silently produced NO add-to-calendar buttons on that page — for months, invisibly, because
  // the page otherwise looks fine. Normalise by dropping any trailing parenthetical and
  // collapsing whitespace before comparing. Fixes the class of bug, not just this one name.
  function styleKey(s) {
    return String(s || '').toLowerCase().replace(/\s*\([^)]*\)\s*$/, '').replace(/\s+/g, ' ').trim();
  }
  function sameStyle(a, b) { return styleKey(a) === styleKey(b); }

  // ONE shared in-flight promise for the whole page — both the calendar buttons and the
  // Levels block read it. Never add a second fetch of this URL: two concurrent requests to
  // the same Apps Script /exec get serialised per user and one of them comes back 404.
  //
  // Retry, because a single request is not reliable either: /exec 302s to
  // script.googleusercontent.com and that hop intermittently 404s. A miss used to mean the
  // Levels block silently rendered nothing (observed live on Kizomba, 2026-08-12), so a
  // transient blip must not be indistinguishable from "no data". Three attempts, ~600ms
  // apart; still resolves null if all fail, so a genuine outage degrades to "no block"
  // rather than a broken page.
  function fetchSchedule() {
    if (_feedPromise) return _feedPromise;
    var url = SCHED_FEED + '?action=publicSchedule&semester=' + encodeURIComponent(SCHED_SEMESTER);
    // 4 attempts with widening backoff (0.6s / 1.2s / 2.4s). The endpoint 404s often enough
    // that three was not always sufficient.
    // Per-attempt timeout. Measured 2026-08-12: a SUCCESSFUL response takes 3–9s, but a
    // failing one sat for ~14s before returning 404. Without a cap, one bad attempt costs
    // more than the whole retry chain. 12s is above the slowest observed success and below
    // the observed failure, so it cuts dead requests without killing slow-but-good ones.
    var attempt = function (n) {
      var ctl = (typeof AbortController === 'function') ? new AbortController() : null;
      var timer = setTimeout(function () { if (ctl) try { ctl.abort(); } catch (e) {} }, 12000);
      return fetch(url, ctl ? { signal: ctl.signal } : undefined)
        .then(function (r) { clearTimeout(timer); return r.ok ? r.json() : null; })
        .then(function (j) { return (j && j.ok && Array.isArray(j.slots)) ? j.slots : null; })
        .catch(function () { clearTimeout(timer); return null; })
        .then(function (slots) {
          if (slots || n >= 4) return slots;
          var wait = 600 * Math.pow(2, n - 1);
          return new Promise(function (res) { setTimeout(res, wait); }).then(function () { return attempt(n + 1); });
        });
    };

    // Cache, for two distinct reasons:
    //  1. SPEED — the Apps Script round-trip is ~4s on a good run and longer when it retries,
    //     which a visitor reads as "there is nothing here". A fresh cache paints instantly,
    //     including when moving between style pages.
    //  2. RESILIENCE — when every retry fails (it happens), a STALE cache is served rather
    //     than nothing. Slightly old class times beat a blank section by a mile. Only a
    //     first-ever visitor during an outage now sees no block at all.
    // The schedule changes a few times a semester, so 30 min of staleness is harmless.
    var fresh = _readFeedCache(false);
    if (fresh) { _feedPromise = Promise.resolve(fresh); return _feedPromise; }

    _feedPromise = attempt(1).then(function (slots) {
      if (slots) { _writeFeedCache(slots); return slots; }
      var stale = _readFeedCache(true);          // any age — better than an empty section
      if (stale) { try { console.warn('[ws-levels] feed unreachable — serving cached schedule'); } catch (e) {} }
      return stale;
    });
    return _feedPromise;
  }

  var FEED_CACHE_KEY = 'ws_sched_v1_' + SCHED_SEMESTER;
  var FEED_CACHE_TTL = 30 * 60 * 1000;

  // allowStale=true ignores the TTL — used only as the last resort when the feed is down.
  function _readFeedCache(allowStale) {
    try {
      var raw = localStorage.getItem(FEED_CACHE_KEY);
      if (!raw) return null;
      var o = JSON.parse(raw);
      if (!o || !Array.isArray(o.slots) || !o.slots.length || !o.t) return null;
      if (!allowStale && Date.now() - o.t > FEED_CACHE_TTL) return null;   // keep it: may serve stale later
      return o.slots;
    } catch (e) { return null; }   // private mode / quota / bad JSON → just fetch
  }

  function _writeFeedCache(slots) {
    try { localStorage.setItem(FEED_CACHE_KEY, JSON.stringify({ t: Date.now(), slots: slots })); } catch (e) {}
  }

  // Accept ":" (feed/EN), "." and "u"/"h" (NL/Weglot renders "18.30 uur" / "18u30").
  function hhmm(s) { var m = String(s).match(/(\d{1,2})[:.uh](\d{2})/i); return m ? (('0' + m[1]).slice(-2) + ':' + m[2]) : ''; }

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
    '/professional-morning-training-gent': {
      wear:  'Whatever you feel comfortable moving in — this is a space to just be yourself. Socks or bare feet; whatever you are used to. No street shoes in the studio.',
      bring: 'Water bottle. Small hand towel for sweat.',
      also:  [['Ballet','Mon & Thu mornings · Int/Adv'],['Pilates for Dancers','Tue & Wed · Open'],['Yoga','Tue & Wed · Open']]
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
  // blocks asynchronously. Safe no-op before the cutoff and on pages with no
  // stale spring note.
  function hideExpiredSpringNotes() {
    try {
      if (new Date() < new Date('2026-06-14T00:00:00')) return;
      var notes = document.querySelectorAll('.spring-note');
      for (var i = 0; i < notes.length; i++) {
        if (/spring 2026 classes still running/i.test(notes[i].textContent || '')) {
          notes[i].style.display = 'none';
        }
      }
    } catch (e) {}
  }

  // ── Hero CTA safety repair ───────────────────────────────────────────────
  // Native Squarespace hero buttons are edited by hand. If a copied page keeps
  // another style's URL on the "REGISTER FOR SEP 2026" button, repair it to the
  // local registration section instead of sending visitors to the wrong class.
  function repairHeroRegisterLinks() {
    try {
      var path = (window.location.pathname || '').replace(/\/$/, '').toLowerCase();
      if (!PAGES[path]) return;
      var links = document.querySelectorAll('a[href]');
      for (var i = 0; i < links.length; i++) {
        var link = links[i];
        var text = (link.textContent || '').replace(/\s+/g, ' ').trim().toUpperCase();
        if (text.indexOf('REGISTER FOR SEP 2026') < 0) continue;
        var href = link.getAttribute('href') || '';
        if (href === '#register') continue;
        link.setAttribute('href', '#register');
        link.removeAttribute('target');
        link.removeAttribute('rel');
      }
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
    // Time separators: ":" (EN/feed), "." and "u"/"h" (NL/Weglot). Requires a range
    // (two times + dash) so prices like "€34.6" never register as a time.
    var re = /(\d{1,2}[:.uh]\d{2})\s*[–\-—]\s*\d{1,2}[:.uh]\d{2}/gi, m;
    while ((m = re.exec(txt))) { var t = hhmm(m[1]); if (t) set[t] = 1; }
    return set;
  }

  // Level number from the card's TITLE only (e.g. "Niveau 2" / "Level 2") — not the
  // whole card, because descriptions reference other levels ("…eerst niveau 2…").
  // Fallback signal for per-level cards if the time format ever fails to parse.
  function cardLevel(details) {
    var card = details.closest('[class*="level-card"]') || details.closest('[class*="card"]') || details.parentElement;
    var t = card && (card.querySelector('[class*="level-title"]') || card.querySelector('h1,h2,h3,h4'));
    var txt = t ? t.textContent.toLowerCase() : '';
    var m = txt.match(/(?:niveau|level)\s*(\d)/) || txt.match(/\bl(\d)\b/);
    return m ? m[1] : null;
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
      if (!document.querySelector('details[class*="date-list"]')) return; // not in DOM yet
      fetchSchedule().then(function (slots) {
        if (_calDone || !slots) return;
        var anchors = [].slice.call(document.querySelectorAll('details[class*="date-list"]'));
        if (!anchors.length) return;
        var mine = slots.filter(function (s) { return sameStyle(s.style, styleName); });
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
        // Attach buttons to each date-list block. Match the block's classes by:
        //  1) day (from the block's first date) + class START time shown in its card
        //     → handles per-level cards (one time) and day cards (several rows).
        //  2) if no time parses, fall back to the card's TITLE level number + day.
        // If neither signal is present, render nothing for that block (safe — never
        // dump all-day buttons onto one card, which mis-assigned same-day levels).
        anchors.forEach(function (a) {
          var sum = a.querySelector('summary');
          var nl = /bekijk|sessies/.test((sum ? sum.textContent : '').toLowerCase());
          var day = blockDay(a);
          var starts = cardStarts(a);
          var hasStarts = Object.keys(starts).length > 0;
          var lvl = hasStarts ? null : cardLevel(a);
          var list = mine.filter(function (s) {
            if (rendered[key(s)]) return false;
            if (day && s.day !== day) return false;
            if (hasStarts) return !!starts[hhmm(s.start)];
            if (lvl) { var n = (String(s.level).match(/\d/) || [])[0]; return n === lvl; }
            return false;
          });
          if (!list.length) return;
          var g = makeGroup(list, nl);
          if (g.children.length > 1 && a.parentNode) a.parentNode.insertBefore(g, a.nextSibling);
        });
      });
    } catch (e) {}
  }

  // ── Course / CourseInstance schema (F-07) ─────────────────────────────────
  // Inject Course + CourseInstance JSON-LD built from the same feed, so weekly
  // classes are machine-readable for search + answer engines (style/level/day/
  // time/dates/teacher/studio). No price/Offer yet — prices are computed tiers;
  // add later from a sync-safe source. One graph per style page, injected once.
  var _courseDone = false;
  var COURSE_DAYNAME = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
  function toMin(t) { var m = String(t).match(/(\d{1,2}):(\d{2})/); return m ? (+m[1] * 60 + +m[2]) : 0; }

  function injectCourseSchema() {
    try {
      if (_courseDone || document.getElementById('wsep-course-jsonld')) return;
      var path = (window.location.pathname || '').replace(/\/$/, '').toLowerCase();
      var styleName = styleForPath(path);
      if (!styleName) return;
      fetchSchedule().then(function (slots) {
        if (_courseDone || document.getElementById('wsep-course-jsonld') || !slots) return;
        var mine = slots.filter(function (s) { return sameStyle(s.style, styleName); });
        if (!mine.length) return;
        mine.sort(function (a, b) { return (DAY_ORDER[a.day] || 9) - (DAY_ORDER[b.day] || 9) || hhmm(a.start).localeCompare(hhmm(b.start)); });
        var base = (location.origin + location.pathname).replace(/\/$/, '');
        var levels = [], days = [];
        mine.forEach(function (s) {
          var lv = (s.level || '').trim(); if (lv && levels.indexOf(lv) < 0) levels.push(lv);
          var d = COURSE_DAYNAME[s.day]; if (d && days.indexOf(d) < 0) days.push(d);
        });
        var instances = mine.map(function (s) {
          var dates = sessionDates(s); if (!dates.length) return null;
          var start = hhmm(s.start), end = hhmm(s.end), dur = toMin(end) - toMin(start);
          var teacher = (s.teacher || '').split('(')[0].trim();
          var ci = {
            '@type': 'CourseInstance',
            '@id': base + '/#instance-' + s.day + '-' + start.replace(':', ''),
            name: s.style + (s.level ? (' — ' + s.level) : ''),
            courseMode: 'onsite',
            startDate: dates[0],
            endDate: dates[dates.length - 1],
            location: {
              '@type': 'Place',
              name: (s.studioName || s.studio || 'Shoonya Dance Centre') + ' · Shoonya Dance Centre',
              address: { '@type': 'PostalAddress', streetAddress: 'Stapelplein 41', postalCode: '9000', addressLocality: 'Gent', addressCountry: 'BE' }
            }
          };
          if (dur > 0) ci.courseWorkload = 'PT' + dur + 'M';
          if (teacher) ci.instructor = { '@type': 'Person', name: teacher };
          return ci;
        }).filter(Boolean);
        if (!instances.length) return;
        _courseDone = true;
        var descr = 'Weekly ' + styleName + ' classes for adults in Ghent at Shoonya Dance Centre'
          + (levels.length ? (' — levels: ' + levels.join(', ')) : '')
          + (days.length ? (' · ' + days.join(', ')) : '') + '. Sep 2026 to Jan 2027.';
        var graph = {
          '@context': 'https://schema.org',
          '@graph': [
            { '@type': 'Organization', '@id': 'https://www.shoonyadance.com/#organization', name: 'Shoonya Dance Centre', url: 'https://www.shoonyadance.com/' },
            {
              '@type': 'Course',
              '@id': base + '/#course',
              name: styleName + ' classes in Ghent',
              description: descr,
              provider: { '@id': 'https://www.shoonyadance.com/#organization' },
              inLanguage: 'en',
              hasCourseInstance: instances
            }
          ]
        };
        var sc = document.createElement('script');
        sc.type = 'application/ld+json';
        sc.id = 'wsep-course-jsonld';
        sc.textContent = JSON.stringify(graph);
        document.head.appendChild(sc);
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
    // Levels block first: injectCalendarButtons() anchors on the dates list it renders, so
    // ordering matters. injectLevelsBlock re-runs the calendar pass itself once it has painted.
    injectLevelsBlock();
    repairHeroRegisterLinks();
    // Hide expired seasonal notes now and on a few delayed passes (the static
    // spring-note block is a separate Squarespace code block, injected async).
    hideExpiredSpringNotes();
    injectCalendarButtons();
    injectCourseSchema();
    setTimeout(repairHeroRegisterLinks, 500);
    setTimeout(repairHeroRegisterLinks, 1500);
    setTimeout(repairHeroRegisterLinks, 3000);
    setTimeout(hideExpiredSpringNotes, 500);
    setTimeout(hideExpiredSpringNotes, 1500);
    setTimeout(hideExpiredSpringNotes, 3000);
    setTimeout(injectCalendarButtons, 600);
    setTimeout(injectCalendarButtons, 1600);
    setTimeout(injectCalendarButtons, 3200);
    // If a root div wasn't in the DOM yet, poll every 100ms until it appears.
    //
    // ⚠️ #ws-levels-root MUST be polled for, exactly like #ws-prac-root. Squarespace injects
    // code blocks asynchronously, so on a real page the div frequently does not exist when
    // init() runs. injectLevelsBlock() bails on its FIRST line when the root is missing —
    // and that is the one exit path that logs no warning, so the failure looks like "the
    // feed broke" when it is really "the div wasn't there yet". This cost a blank Kizomba
    // block on 2026-08-12: it passed every local test because a static fixture always has
    // the div before the script runs, which is the one condition Squarespace never meets.
    var _pracSeen  = !!document.getElementById('ws-prac-root');
    var _levelSeen = !!document.getElementById('ws-levels-root');
    if (!_pracSeen || !_levelSeen) {
      var attempts = 0;
      var poll = setInterval(function () {
        attempts++;
        if (!_pracSeen && document.getElementById('ws-prac-root')) { _pracSeen = true; render(); }
        // injectLevelsBlock() self-guards via data-ws-done, so a repeat call is harmless.
        if (!_levelSeen && document.getElementById('ws-levels-root')) { _levelSeen = true; injectLevelsBlock(); }
        if ((_pracSeen && _levelSeen) || attempts >= 100) clearInterval(poll); // give up after 10s
      }, 100);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ── Levels & Registration, rendered live ──────────────────────────────────
  // Replaces the pasted, frozen Levels block. The renderer is extracted from
  // semester-content-generator.html into the GENERATED region below by
  // scripts/build-ws-embed.mjs, so the generator stays the single source of truth.
  //
  // ⚠️ Reads `publicSchedule`, NOT the Block Studio feed. The Block Studio endpoint carries
  // the same data in a friendlier shape, but it is served BY Apps Script and is therefore
  // same-origin only — from www.shoonyadance.com it returns 404. That cost a blank block on
  // a live page (2026-08-12). Any feed used here must be fetched from the page's own origin
  // in a real browser before it is trusted; curl proves nothing about CORS.
  // ⚠️ Delegates to fetchSchedule() — do NOT give this its own fetch again.
  // It previously issued its own identical request, so init() fired TWO concurrent calls to
  // the same /exec URL (one from injectCalendarButtons, one from injectLevelsBlock). Apps
  // Script serialises concurrent executions per user: one request came back 200 and the other
  // 404, non-deterministically. Whichever pass lost the race got null and bailed with
  // "[ws-levels] publicSchedule feed unavailable", so the levels block rendered NOTHING.
  // That race — not the feed shape — is what made the Kizomba block go blank (2026-08-12);
  // it also explains why the same page rendered fine on one load and empty on the next.
  // Both callers want the identical URL and the identical slot array, so they now share one
  // in-flight promise. Reproduced and verified in a browser, not by curl.
  function fetchPublicSlots() {
    return fetchSchedule();
  }

  var WS_DAY_LONG = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday',
                      fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };

  // publicSchedule is a FLAT slot list; the renderer wants
  // { name, meta:{descByLevel}, levels:[{ level, sessionCount, slots:[…] }] }.
  function wsStyleFromSlots(styleName, allSlots) {
    var ws = (WS_LEVELS.styleData && WS_LEVELS.styleData[styleName]) || {};
    var names = [styleName].concat(ws.mergeStyles || []);
    // Tolerant compare, same reason as injectCalendarButtons: the feed's "Raqs Sharqi
    // (bellydance)" does not equal the SLUGS key "Raqs Sharqi".
    var mine = allSlots.filter(function (s) {
      for (var i = 0; i < names.length; i++) if (sameStyle(s.style, names[i])) return true;
      return false;
    });

    // A teacher moved to their own page must not appear here too.
    if (ws.excludeTeachers && ws.excludeTeachers.length) {
      mine = mine.filter(function (s) { return ws.excludeTeachers.indexOf(s.teacher) < 0; });
    }
    if (!mine.length) return null;

    // GROUP by levelName ("Level 1"), but DISPLAY the full label ("Level 1 — Flamenco &
    // Sevillanas"). The feed splits "Level 1 — Foundation" into levelName + displayLabel; an
    // earlier version of this adapter keyed and displayed on levelName only, which silently
    // dropped the label — the block showed a bare "Level 1" while the pasted block and the
    // add-to-calendar button both carried the full name. Grouping still uses the short key so
    // alternate timings for one level merge correctly.
    // descByLevel stays keyed on the SHORT name; the renderer falls back to
    // descs['Level ' + n], so descriptions still resolve against the long display label.
    var byLevel = {}, order = [], descByLevel = {}, displayByKey = {};
    mine.forEach(function (s) {
      var key = s.levelName || s.level || 'Open Level';
      if (!byLevel[key]) { byLevel[key] = []; order.push(key); displayByKey[key] = s.level || key; }
      if (s.levelDescription && !descByLevel[key]) descByLevel[key] = s.levelDescription;
      byLevel[key].push({
        day: WS_DAY_LONG[s.day] || s.day,
        start: s.start, end: s.end, duration: s.duration,
        teacher: s.teacher,
        // The renderer does `slot.coTeachers ? ' & ' + slot.coTeachers : ''` — it wants a
        // STRING. publicSchedule already sends one; an array here would render a stray '&'.
        coTeachers: (typeof s.coTeachers === 'string') ? s.coTeachers : (s.coTeachers || []).join(', '),
        studio: s.studioName || s.studio,
        dates: s.dates || s.slotDates || []
      });
    });

    var levels = order.map(function (key) {
      var sl = byLevel[key];
      // Multiple weekly slots for ONE level are alternate timings, not extra sessions:
      // sessions = MAX across slots, never the sum. (CLAUDE.md, multi-slot rule.)
      var counts = sl.map(function (x) { return (x.dates || []).length; });
      return { level: displayByKey[key] || key, _realLevel: key,
               sessionCount: Math.max.apply(null, counts.concat([0])), slots: sl };
    });

    return { name: styleName, meta: { descByLevel: descByLevel }, levels: levels };
  }

  function injectLevelsBlock() {
    var root = document.getElementById('ws-levels-root');
    if (!root || root.getAttribute('data-ws-done')) return;
    var warn = function (m) { try { console.warn('[ws-levels] ' + m); } catch (e) {} };
    var styleName = styleForPath((window.location.pathname || '').replace(/\/$/, '').toLowerCase());
    if (!styleName) return warn('no style mapped to ' + window.location.pathname);
    fetchPublicSlots().then(function (allSlots) {
      if (!allSlots) return warn('publicSchedule feed unavailable');
      try {
        var style = wsStyleFromSlots(styleName, allSlots);
        if (!style) return warn('no slots in the feed for "' + styleName + '"');
        var ws = (WS_LEVELS.styleData && WS_LEVELS.styleData[styleName]) || {};
        var descs = Object.keys(style.meta.descByLevel).length
          ? style.meta.descByLevel : (ws.descriptionsByLevel || null);
        root.innerHTML = WS_LEVELS.render(style, descs, ws);
        root.setAttribute('data-ws-done', '1');
        if (typeof injectCalendarButtons === 'function') { _calDone = false; injectCalendarButtons(); }
      } catch (e) { warn('render failed: ' + (e && e.message)); }
    });
  }

  // ─── BEGIN GENERATED — from semester-content-generator.html · do not hand-edit ───
  // Regenerate with: node scripts/build-ws-embed.mjs — never hand-edit inside the markers.
  var WS_LEVELS = (function () {

  var WS_STYLE_DATA = {
    "Argentine Tango": {
      "descriptionsByLevel": {
        "Level 1": "An unpredictable encounter unfolds between two individuals — a unique and privileged moment filled with spontaneity. In Level 1, our exploration centers on unveiling the true essence of tango: a floating, intense, and timeless dance where two bodies gracefully unite in space, merging into a single rhythmic harmony. You will discover this social, sensual, and improvisational couple's dance, learning how to connect in a comfortable embrace while smoothly navigating the dance floor in the traditional counterclockwise direction.",
        "Level 2": "A breeze from Buenos Aires rustles through Ghent. Building on your foundations, Level 2 introduces the intricate rules and codes that govern the traditional milonga. You will learn the conventional signs of the mirada and cabeceo — the gentle exchanges affirming a mutual invitation to dance. We will also deepen your musicality by exploring Tandas (sets of four pieces) and Cortinas (musical interludes). In this realm, barriers of age or language dissolve; what matters most is your shared experience of this deeply improvised dance for two."
      },
      "partnerRequired": true,
      "partnerForumUrl": "https://www.facebook.com/groups/1405926722822445",
      "teacherLabel": "Gisela & Sergio"
    },
    "Ballet": {
      "excludeTeachers": [
        "Tono Ferriol"
      ]
    },
    "Contemporary dance": {
      "descriptionsByLevel": {
        "Contemporary": "Join a professional yet pressure-free contemporary class designed for professional and semi-professional dancers. Our focus is to stay in shape and refine technique in a warm, welcoming environment. Beyond the structured training, there will be space to explore and connect with your own personal movement.",
        "Ballet": "Join a professional yet pressure-free classical ballet class designed for professional and semi-professional dancers. Our focus is to stay in shape and refine technique in a warm, welcoming environment. Beyond the structured training, there will be space to explore and connect with your own personal movement."
      },
      "passPricing": {
        "label": "Class passes",
        "cta": "Book a pass →",
        "note": "One pass, all four classes — spend it on ballet, contemporary, or any mix of the two. No semester commitment. In the registration form choose <strong>Festivals &amp; Events</strong>, then this class, then your pass size."
      },
      "mergeStyles": [
        {
          "style": "Ballet",
          "teacher": "Tono Ferriol",
          "label": "Ballet"
        }
      ]
    },
    "Kizomba": {
      "partnerRequired": true,
      "partnerForumUrl": "https://www.facebook.com/groups/1405926722822445"
    },
    "Bachata": {
      "partnerRequired": true,
      "partnerForumUrl": "https://www.facebook.com/groups/1405926722822445"
    },
    "Cuban Salsa": {
      "partnerRequired": true,
      "partnerForumUrl": "https://www.facebook.com/groups/1405926722822445"
    },
    "Rueda de Casino": {
      "partnerRequired": true,
      "partnerForumUrl": "https://www.facebook.com/groups/1405926722822445"
    },
    "Lindy Hop": {
      "descriptionsByLevel": {
        "Level 1": "Foundation is the entry point to Lindy Hop at Shoonya. No experience needed — the class builds from scratch: the pulse, the basic footwork patterns, and the connection between lead and follow. Following Upside Down's Everybody Leads, Everybody Follows principle, both roles are taught from day one.",
        "Foundation": "Foundation is the entry point to Lindy Hop at Shoonya. No experience needed — the class builds from scratch: the pulse, the basic footwork patterns, and the connection between lead and follow. Following Upside Down's Everybody Leads, Everybody Follows principle, both roles are taught from day one.",
        "Level 2": "Open is for dancers who have completed Foundation or have equivalent social dance experience. The focus moves to developing personal style, musicality, and the improvisational vocabulary that makes every dance feel unique. Both roles are always welcome.",
        "Open": "Open is for dancers who have completed Foundation or have equivalent social dance experience. The focus moves to developing personal style, musicality, and the improvisational vocabulary that makes every dance feel unique. Both roles are always welcome."
      },
      "teacherLabel": "Upside Down"
    },
    "Solo Jazz": {
      "teacherLabel": "Upside Down"
    },
    "Tap Dance": {
      "teacherLabel": "Tapdance Promotion"
    },
    "Raqs Sharqi": {
      "descriptionsByLevel": {
        "Level 1": "This class is your entry point into the world of raqs sharqi — the elegant classical dance of Egypt. We work on building solid foundations: correct posture and alignment, essential body mechanics, and the basic vocabulary of movement that Raqs Sharqi (oriental dance / bellydance) is built on. Alongside technique, we begin developing musical awareness — learning to listen to the music and respond to it with our bodies. Through dance combinations and guided movement exploration, you'll start to discover what your body is capable of and how to move with intention and ease. No previous dance experience is required.",
        "Level 2": "This class is for dancers who already have a solid grounding in raqs sharqi fundamentals (equivalent to Level 1 or comparable experience). Each year, the group focuses on a specific thematic topic. This year, we work with a variety of Egyptian rhythmic patterns — saidi, baladi, malfuf, ayoub, fellahi, vox, masmoudi kabir, samai and others — and through them, we explore the distinct dance styles, aesthetics and characters that belong to each tradition. Hip technique is refined and deepened in context, so the body learns not just how to move, but why.",
        "Level 3": "This is the most advanced group, and a space for dancers who are ready to expand beyond the familiar. This year, building on a strong foundation in traditional raqs sharqi, we explore a conscious, feeling-full approach to movement — bringing sensitivity and personal artistry into dialogue with the dance. This year, we are drawn into the world of contemporary qanun music, moving to the lyrical and luminous sounds of artists such as Farah Fersi and Maya Youssef. Here, tradition and innovation meet, and you are invited to shape your own dance expression — refined, personal, and alive."
      }
    },
    "Bollyfolk": {
      "descriptionsByLevel": {
        "Level 2": "<strong>This semester: Cheraw & Lavani.</strong> Cheraw is the bamboo dance of Mizoram — dancers step in and out of clapping bamboo poles, light feet and sharp timing. Lavani comes from Maharashtra: bold, theatrical, full of hip work and strong eye expression. Deeper material, longer choreography, more cultural context. Builds on Bollyfolk Open. Age 12+.",
        "Open": "<strong>This semester: Garba Choreography & Khoriya.</strong> Garba comes from Gujarat — a Navratri circle dance built on light footwork, gentle claps, and community. Khoriya is the women's celebration dance of Haryana — strong, grounded footwork, swinging arms, and the joy of the village square. Age 12+.",
        "Open Level": "<strong>This semester: Garba Choreography & Khoriya.</strong> Garba comes from Gujarat — a Navratri circle dance built on light footwork, gentle claps, and community. Khoriya is the women's celebration dance of Haryana — strong, grounded footwork, swinging arms, and the joy of the village square. Age 12+.",
        "Level 1": "<strong>This semester: Garba Choreography & Khoriya.</strong> Garba comes from Gujarat — a Navratri circle dance built on light footwork, gentle claps, and community. Khoriya is the women's celebration dance of Haryana — strong, grounded footwork, swinging arms, and the joy of the village square. Age 12+."
      },
      "teacherLabel": "Swapnil Dagliya"
    },
    "Bollywood": {
      "teacherLabel": "Swapnil Dagliya"
    },
    "Bhangra": {
      "starterSeries": {
        "label": "4-Week Starter Series",
        "sessions": 4
      },
      "teacherLabel": "Swapnil Dagliya"
    },
    "Indian Semi-Classical": {
      "starterSeries": {
        "label": "4-Week Starter Series",
        "sessions": 4
      },
      "teacherLabel": "Swapnil Dagliya"
    },
    "Yoga": {
      "dropinDays": [
        "Wednesday"
      ],
      "teacherLabel": "Swapnil Dagliya"
    },
    "Indian Dance Technique": {
      "teacherLabel": "Swapnil Dagliya"
    },
    "Pilates for Dancers": {
      "dropinDays": [
        "Tuesday",
        "Wednesday"
      ]
    },
    "Dance & Fit": {
      "dropinDays": [
        "Wednesday"
      ]
    },
    "Oriental Flow": {
      "descriptionsByLevel": {
        "Open": "Oriental Flow is a technique that sits at the intersection of several practices I have been working with for years: contemporary dance and oriental dance, yoga, and somatic techniques that have helped me reconnect with my body, release tension, and find some flow. The first part of this training, which will last 90 mins in each session, will focus on preparing the physical body to connect with the breath, the spine, and the joints, encouraging freedom in the joints, so that we can move into the second part of the class. In the second part, we will begin working with oriental dance technique itself and its fundamental principles, such as isolations, fragmentations, and spirals.",
        "Level 1": "Oriental Flow is a technique that sits at the intersection of several practices I have been working with for years: contemporary dance and oriental dance, yoga, and somatic techniques that have helped me reconnect with my body, release tension, and find some flow. The first part of this training, which will last 90 mins in each session, will focus on preparing the physical body to connect with the breath, the spine, and the joints, encouraging freedom in the joints, so that we can move into the second part of the class. In the second part, we will begin working with oriental dance technique itself and its fundamental principles, such as isolations, fragmentations, and spirals."
      }
    }
  };

const WS_PRICE_TIERS = {
  30:  { full: 124, student: 110 },  // 10-session starter / miniseries baseline
  60:  { full: 198, student: 175 },
  70:  { full: 223, student: 197 },
  75:  { full: 231, student: 204 },
  90:  { full: 248, student: 219 },
  105: { full: 272, student: 240 },
};

const WS_STD_SESSIONS = 16;

const WS_REG_URL = '/register/';

const WS_SPRING_SCHEDULE_URL = 'https://classes.shoonyadance.com/schedule-spring-2026';

const WS_SPRING_NOTE = null;

const WS_SEMESTER_DATES = 'Sep 14 – Jan 30';

const WS_ZOHO_STARTER_URL = 'https://creatorapp.zohopublic.eu/developer_shoonyadance/shoonya-dance-studio/form-perma/Workshop_Registration_Form/uOO7GVYHQEJn5dSVDz7z1nTXXeEfD0AZ4PJvtQJ0ZbMRum3tBX30zxQHC02n9b3bvTO6ORFDsVCfS4bJQF1VOZdBMZquYuPb4xx8';

const WS_DROPIN_URL = WS_ZOHO_STARTER_URL;

const WS_DROPIN_PACKS = [{ n: '3 sessions', price: '€40.50' }, { n: '5 sessions', price: '€67.50' }];

const WS_DROPIN_NOTE = 'Prefer flexibility? Pick any 3 or 5 dates from the schedule above — no semester commitment needed.';

const WS_PASS_URL = WS_ZOHO_STARTER_URL;

const WS_PASS_PACKS = [
  { n: '5 classes',  price: '€80'  },
  { n: '10 classes', price: '€150' },
  { n: '15 classes', price: '€215' },
  { n: '20 classes', price: '€280' }
];

const WS_GOOGLE_FONTS = "https://fonts.googleapis.com/css2?family=Marcellus&family=PT+Serif:ital,wght@0,400;0,700;1,400&display=swap";

const WS_SEO = {
  'Argentine Tango':       { title: 'Argentine Tango Classes in Ghent | Shoonya Dance Centre',          description: 'Argentine Tango in Ghent with Gisela & Sergio, co-founders of Estación Tango Brussels. All levels — from first embrace to social milonga. Register for September 2026.' },
  'Flamenco':              { title: 'Flamenco Classes in Ghent | Shoonya Dance Centre',                 description: 'Authentic flamenco in Ghent with La Liz — trained in Seville and Jerez, 25+ years experience. Braceos, zapateado, choreography. All levels, September 2026.' },
  'Flamenco & Sevillanas': { title: 'Flamenco and Sevillanas in Ghent | Shoonya Dance Centre',         description: 'Flamenco and Sevillanas classes in Ghent with La Liz. Monthly Sevillanas practice evenings included. Trained in Seville and Jerez. All levels welcome.' },
  'Ballet':                { title: 'Adult Ballet Classes in Ghent | Shoonya Dance Centre',             description: 'Ballet for adults in Ghent with Shirley De Muer — graduate of the Royal Ballet School of Antwerp. Technique, posture, and musicality for all levels.' },
  'Contemporary dance':    { title: 'Contemporary & Ballet Training in Ghent | Shoonya Dance Centre',   description: 'Morning contemporary and ballet training in Ghent for professional and semi-professional dancers, with Tono Ferriol. Monday and Thursday, flexible class passes.' },
  'Kizomba':               { title: 'Kizomba Classes in Ghent | Shoonya Dance Centre',                 description: 'Kizomba in Ghent with Sonja KikiZomba — Belgium\'s pioneer of Kizomba teaching since 2006. Levels 2, 3 and 4. Authentic Angolan partner dance, Ghent.' },
  'Bachata':               { title: 'Bachata Classes in Ghent | Shoonya Dance Centre',                 description: 'Bachata classes in Ghent with World Champion Alex and Lenka Badriyah. Dominican partner dance — rhythm, connection, and confidence. All levels, Gent.' },
  'Cuban Salsa':           { title: 'Cuban Salsa Classes in Ghent | Shoonya Dance Centre',             description: 'Cuban Salsa (Casino) in Ghent with 3× World Champion Alex and Ioanna. Circular partner dance rooted in son cubano. All levels from beginner to advanced.' },
  'Rueda de Casino':       { title: 'Rueda de Casino Classes in Ghent | Shoonya Dance Centre',         description: 'Rueda de Casino in Ghent — Cuban Salsa in a circle with partner changes. With World Champion Alex and Ioanna. Pre-req: 2 seasons of Cuban Salsa.' },
  'Lindy Hop':             { title: 'Lindy Hop Classes in Ghent | Shoonya Dance Centre',               description: 'Lindy Hop swing dance classes in Ghent with Upside Down — Ghent\'s own swing & jazz organisation. All levels, everybody leads and follows. September 2026.' },
  'Solo Jazz':             { title: 'Solo Jazz Dance Classes in Ghent | Shoonya Dance Centre',         description: 'Solo Jazz in Ghent — Harlem steps, swing vocabulary and improvisation with the Upside Down team. Open level, no experience needed. September 2026, Gent.' },
  'Jazzy Workout':         { title: 'Jazzy Workout Classes in Ghent | Shoonya Dance Centre',           description: 'Jazzy Workout in Ghent — jazz dance and swing movement in a feel-good fitness class. Taught by the Upside Down team. No partner needed, all levels welcome.' },
  'Tap Dance':             { title: 'Tap Dance Classes in Ghent | Shoonya Dance Centre',               description: 'Tap dance classes in Ghent with Tapdance Promotion — Lut Vermeulen and team. Levels 1–4, home of the annual Ghent Tap Festival. Register September 2026.' },
  'Raqs Sharqi':           { title: 'Belly Dance Classes in Ghent | Shoonya Dance Centre',             description: 'Raqs Sharqi (belly dance) in Ghent with Lenka Badriyah — Silver Belly Dancer of the Universe 2012. Egyptian classical bellydance, all levels. September 2026.' },
  'African Congolese Dance':{ title: 'African Dance Classes in Ghent | Shoonya Dance Centre',          description: 'Congolese traditional dance and Congolese Rumba in Ghent with Joseph Simako Said — choreographer from DR Congo. Body rhythm, energy, and community spirit.' },
  'Burlesque':             { title: 'Burlesque Classes in Ghent | Shoonya Dance Centre',               description: 'Burlesque performance classes in Ghent for adults 18+. Stage presence, storytelling and confidence with Zoe Bizoe, Hendrik Lebon and Tine De Pauw.' },
  'Cissy Ball':            { title: 'Cissy Ball Classes in Ghent | Shoonya Dance Centre',              description: 'Cissy Ball in Ghent — dance from your inner joy with Hendrik Lebon. No steps to memorise, no counts. Performance skills and pure expression for all levels.' },
  'Bollyfolk':             { title: 'Bollyfolk Dance Classes in Ghent | Shoonya Dance Centre',         description: 'Bollyfolk in Ghent — Bollywood and Indian folk dance in one feel-good class with Swapnil Dagliya. Open level, no experience needed. September 2026.' },
  'Bollywood':             { title: 'Bollywood Dance Classes in Ghent | Shoonya Dance Centre',         description: 'Bollywood dance classes in Ghent with Swapnil Dagliya. Indian cinema dance — energetic, expressive, and always moving. Levels 2 and 3, September 2026.' },
  'Bhangra':               { title: 'Bhangra Dance Classes in Ghent | Shoonya Dance Centre',           description: 'Bhangra in Ghent with certified Learn Bhangra® instructor Swapnil Dagliya. The most exuberant folk dance of Punjab — big arms, big energy. Level 2.' },
  'Indian Semi-Classical': { title: 'Indian Classical Dance Classes in Ghent | Shoonya',              description: 'Indian Semi-Classical dance in Ghent — Kathak footwork, expressive gestures, and storytelling through movement. Taught by Swapnil Dagliya. Level 2.' },
  'Yoga':                  { title: 'Yoga Classes in Ghent | Shoonya Dance Centre',                   description: 'Yoga classes in Ghent for dancers and non-dancers. Iyengar-lineage practice taught by Swapnil Dagliya, certified yoga teacher since 2011, Pune.' },
  'Indian Dance Technique':{ title: 'Indian Dance Technique in Ghent | Shoonya Dance Centre',         description: 'Indian Dance Technique in Ghent — foundation of Indian classical and folk dance. Vocabulary, posture, and coordination. Open level, Shoonya Dance Centre.' },
  'Pilates for Dancers':   { title: 'Pilates for Dancers in Ghent | Shoonya Dance Centre',            description: 'Pilates for Dancers in Ghent with Lenka Badriyah. Core stability, joint mobility, and deep strength for movers of all backgrounds. Shoonya Dance Centre.' },
  'Dance & Fit':           { title: 'Dance & Fit Classes in Ghent | Shoonya Dance Centre',            description: 'Dance & Fit in Ghent with Lenka Badriyah — energetic dance fitness for all levels. Morning classes that set you up for the day. No experience needed.' },
  'Bachata Solo Style':  { title: 'Bachata Solo Style in Ghent | Shoonya Dance Centre',           description: 'Bachata Solo Style classes in Ghent with Ioanna — 10-session miniseries, October to December. Body movement, arm styling, and footwork. No partner needed. All genders welcome.' },
  'Oriental Flow':         { title: 'Oriental Flow Classes in Ghent | Shoonya Dance Centre',          description: 'Oriental Flow in Ghent — traditional Middle Eastern dance meets contemporary movement. Taught by Nathalie El Ghoul, dance artist with 30+ years experience.' },
};

const WS_ABSENCE_REASON = 'teacher away';

const WS_HOLIDAYS = [
  { name: 'Herfstvakantie', start: '2026-11-01', end: '2026-11-08' },
  { name: 'Kerstvakantie', start: '2026-12-20', end: '2027-01-10' }
];

function wsDateGridHtml(dates, p) {
  const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const MON  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const fmt  = d => MON[d.getMonth()] + ' ' + d.getDate();
  const holidayFor = d => WS_HOLIDAYS.find(h =>
    d >= new Date(h.start + 'T00:00:00') && d <= new Date(h.end + 'T23:59:59')) || null;

  const sorted = [...dates].sort();
  const out = [];
  sorted.forEach((iso, i) => {
    if (i > 0) {
      const prev = new Date(sorted[i - 1] + 'T12:00:00');
      const cur  = new Date(iso + 'T12:00:00');
      // Every weekly slot that falls between two consecutive class dates.
      const skipped = [];
      for (const t = new Date(prev); ; ) {
        t.setDate(t.getDate() + 7);
        if (t >= cur) break;
        skipped.push(new Date(t));
      }
      // A single gap can be BOTH a school holiday and a teacher absence — exclusions are
      // per teacher, so two teachers on the same weekday can have different gaps. Group the
      // skipped weeks by cause, in order, and emit one row per run.
      let run = [];
      const flush = () => {
        if (!run.length) return;
        const hol = run[0].hol;
        if (hol) {
          const hs = new Date(hol.start + 'T12:00:00'), he = new Date(hol.end + 'T12:00:00');
          const range = hs.getMonth() === he.getMonth()
            ? MON[hs.getMonth()] + ' ' + hs.getDate() + '\u2013' + he.getDate()
            : fmt(hs) + ' \u2013 ' + fmt(he);
          out.push(`<span class="date-skip">\u2014 ${hol.name} (${range}) \u2014</span>`);
        } else {
          // "Dec 9 & 16", not "Dec 9 & Dec 16" — repeat the month only when it changes.
          let lastMon = -1;
          const label = run.map(x => {
            const t = x.d.getMonth() === lastMon ? String(x.d.getDate()) : fmt(x.d);
            lastMon = x.d.getMonth();
            return t;
          }).join(' & ');
          out.push(`<span class="date-skip">\u2014 ${label}: no class (${WS_ABSENCE_REASON}) \u2014</span>`);
        }
        run = [];
      };
      skipped.forEach(d => {
        const hol = holidayFor(d);
        if (run.length && (run[0].hol || null) !== hol) flush();
        run.push({ d, hol });
      });
      flush();
    }
    const dt = new Date(iso + 'T12:00:00');
    out.push(`<span>${DAYS[dt.getDay()]} ${dt.getDate()} ${MON[dt.getMonth()]}</span>`);
  });
  return out.join('');
}

function wsEur(n) {
  const v = Number(n);
  if (!isFinite(v)) return n;
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

function wsComputePrice(duration, sessionCount, fallbackFull, fallbackStudent) {
  const tier = WS_PRICE_TIERS[duration];
  const sc   = sessionCount || WS_STD_SESSIONS;
  const base = tier || (fallbackFull ? { full: fallbackFull, student: fallbackStudent || null } : null);
  if (!base || !base.full) return null;
  const isStd = sc === WS_STD_SESSIONS;
  const fp = isStd ? base.full    : Math.round(base.full    * sc / WS_STD_SESSIONS);
  const sp = base.student ? (isStd ? base.student : Math.ceil(base.student * sc / WS_STD_SESSIONS)) : null;
  const up = Math.round(fp * 0.2 * 100) / 100;
  return { full: fp, student: sp, uitpas: up };
}

function wsMakePrefix(styleName) {
  return (styleName || '').toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ').trim().split(/\s+/)
    .map(w => w[0] || '').join('').slice(0, 5) || 'st';
}

function wsShortDay(day) {
  return (day || '').slice(0, 3);
}

function wsClassifyLayout(levels) {
  if (!levels || !levels.length) return 'none';
  const dayCounts = {};
  levels.forEach(lv => {
    (lv.slots || []).forEach(s => {
      if (s.day) dayCounts[s.day] = (dayCounts[s.day] || 0) + 1;
    });
  });
  const distinctDays = Object.keys(dayCounts).length;
  // Day-based: 5+ levels
  if (levels.length >= 5) return 'day';
  // Day-based: single day with 3+ levels (e.g. Bachata L1/L2/L3 all Tuesday)
  if (distinctDays === 1 && levels.length >= 3) return 'day';
  // Day-based: multiple days where at least one day has 2+ levels
  if (distinctDays > 1 && Object.values(dayCounts).some(c => c > 1)) return 'day';
  return 'per-level';
}

function wsTrialPillHtml() {
  return `<link href="https://fonts.googleapis.com/css2?family=PT+Serif:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet">
<div style="display:flex;align-items:center;gap:1rem;border-left:4px solid #D85A30;padding:.85rem 1.25rem;background:#FAECE7;border-radius:0 10px 10px 0;">
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#D85A30" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0;"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
  <div>
    <div style="font-size:.85rem;font-weight:700;color:#4A1B0C;font-family:'PT Serif',serif;line-height:1.4;">Free trial week · 14–19 September</div>
    <div style="font-size:.75rem;color:#993C1D;font-family:'PT Serif',serif;margin-top:.1rem;line-height:1.4;">Drop in to any class, no registration needed — subject to availability</div>
  </div>
</div>`;
}

function wsDropinSectionHtml(prefix, note, cfg) {
  const p = prefix;
  cfg = cfg || {};
  const packs = cfg.packs || WS_DROPIN_PACKS;
  const label = cfg.label || 'Drop-in packs';
  const cta   = cfg.cta   || 'Book drop-in pack →';
  const url   = cfg.url   || WS_DROPIN_URL;
  const tiles = packs.map(pk =>
    `<div class="${p}-dropin-pack"><div class="${p}-dropin-sessions">${pk.n}</div><div class="${p}-dropin-price">${pk.price}</div></div>`
  ).join('');
  return `<div class="${p}-dropin-section">
            <div><p class="${p}-dropin-label">${label}</p>
            <p class="${p}-dropin-note">${note || WS_DROPIN_NOTE}</p></div>
            <div class="${p}-dropin-packs">${tiles}</div>
            <a class="${p}-dropin-register dropin-register" href="${url}" target="_blank" rel="noopener">${cta}</a>
          </div>`;
}

function wsPerLevelCard(lv, idx, meta, prefix, isStarterSeries, levelDesc, opts) {
  opts = opts || {};
  const p = prefix;
  const slots = (opts.slotOverride ? [opts.slotOverride] : lv.slots) || [];
  const slot = slots[0] || {};
  const sc    = lv.sessionCount || WS_STD_SESSIONS;
  // Canonical price from slot duration (correct even when multiple levels share one meta.fullPrice)
  const price = wsComputePrice(slot.duration || null, sc, meta.fullPrice, meta.studentPrice);

  // Multi-slot: parallel timings (same level, different days e.g. Tue + Wed)
  const isMultiSlot = slots.length > 1;

  let priceLabel = '';
  // Pass-priced styles carry no semester term price — the shared pass table below
  // the cards is the only pricing. Never fall through to wsComputePrice here: the
  // tier price would be flatly wrong for a pass product.
  if (opts.passOnly) {
    priceLabel = `<p class="${p}-semester-only-note">Sold as a flexible pass — see pricing below</p>`;
  } else if (price) {
    const { full: fp, student: sp, uitpas: up } = price;
    if (isStarterSeries) {
      priceLabel = `<div class="${p}-price-row">
          <div class="${p}-price-col"><div class="${p}-price-amount">€${wsEur(fp)}</div><div class="${p}-price-label">Full price</div></div>
        </div>`;
    } else {
      priceLabel = `<div class="${p}-price-row">
          <div class="${p}-price-col"><div class="${p}-price-amount">€${wsEur(fp)}</div><div class="${p}-price-label">Full</div></div>
          <div class="${p}-price-col"><div class="${p}-price-amount">€${sp ? wsEur(sp) : '—'}</div><div class="${p}-price-label">Student / 2+</div></div>
          <div class="${p}-price-col"><div class="${p}-price-amount">€${wsEur(up)}</div><div class="${p}-price-label">UiTPAS −80%</div></div>
        </div>`;
    }
  }

  const levelName = opts.title || lv.level || ('Level ' + (idx + 1));
  // Level source for the badge: `_realLevel` is the feed's own level, preserved
  // by wsMergedStyle when a merged page relabels its cards. Without it an
  // "Int/Adv" class relabelled to "Ballet" would look unlevelled.
  const _lvlSrc = lv._realLevel || (opts.title ? (lv.level || '') : levelName);
  // Word-based levels ("Int/Adv", "Advanced", "Intermediate") are NOT beginner
  // classes. Before 2026-08-02 only "Level N" was recognised, so every one of
  // them rendered "Beginners welcome" + "No experience needed. Start here." —
  // the exact opposite of the truth for an Int/Adv professional class.
  const _isAdvWord = /int\s*\/?\s*adv|advanced|intermediate|gevorderd/i.test(_lvlSrc);
  const isL2plus = /level [2-9]|l[2-9]/i.test(_lvlSrc) || _isAdvWord;
  const _lvNum = parseInt((levelName.match(/\d+/) || [])[0]);
  const _l2Label = _isAdvWord
    ? (/int\s*\/?\s*adv/i.test(_lvlSrc) ? 'Int / Adv'
       : /advanced/i.test(_lvlSrc) ? 'Advanced' : 'Intermediate')
    : (_lvNum >= 4 ? 'Advanced' : _lvNum === 3 ? 'Intermediate' : 'Prior experience needed');
  const badgeClass = isStarterSeries ? '' : (isL2plus ? `${p}-badge-l2` : '');
  const badgeText = isStarterSeries ? '4-week series' : (isL2plus ? _l2Label : 'Beginners welcome');
  const cardClass = isStarterSeries ? `${p}-level-card ${p}-starter` : `${p}-level-card`;

  // When field: show all slots if parallel timings, otherwise just slot[0]
  const whenHtml = isMultiSlot
    ? slots.map(s => `<span style="display:block;">${s.day || '?'} ${s.start || ''}–${s.end || ''}</span>`).join('')
    : `${slot.day || '?'} ${slot.start || ''}–${slot.end || ''}`;

  // Dates: merge all slots' dates, dedupe, sort
  const _allDates = [...new Set(slots.flatMap(s => s.dates || []))].sort();
  // Month span of THIS card's dates. Was hardcoded "Sep–Jan", which is wrong for
  // any class that stops early (Tono's mornings end 10 Dec).
  const _mAbbr = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const _mOf = d => _mAbbr[new Date(d + 'T12:00:00').getMonth()];
  const _runMonths = _allDates.length
    ? (_mOf(_allDates[0]) === _mOf(_allDates[_allDates.length - 1])
        ? _mOf(_allDates[0])
        : _mOf(_allDates[0]) + '–' + _mOf(_allDates[_allDates.length - 1]))
    : 'Sep–Jan';
  const datesHtml = _allDates.length
    ? `<details class="${p}-date-list"><summary>${sc} sessions · ${_runMonths} · see all dates</summary>
          <div class="${p}-date-grid" translate="no">${wsDateGridHtml(_allDates, p)}</div>
        </details>`
    : `<!-- dates not yet in sheet — run runApplyPersonalExclusions() to populate col S -->`;

  const teacherAnchor = (slot.teacher || '').toLowerCase().split(' ')[0] || 'teacher';

  const registerUrl = isStarterSeries ? WS_ZOHO_STARTER_URL : WS_REG_URL;

  const descBlock = levelDesc
    ? `<div class="${p}-level-desc">${levelDesc}</div>`
    : '';

  return `        <div class="${cardClass}">
          <div class="${p}-card-top">
            <div>
              <div class="${p}-level-title">${levelName}</div>
              ${isStarterSeries
                ? `<div class="${p}-level-who">4-week intro — enrol any semester start</div>`
                : isL2plus
                  ? `<div class="${p}-level-who"><!-- tagline e.g. "Building on the foundation." --></div>`
                  : `<div class="${p}-level-who">No experience needed. Start here.</div>`
              }
            </div>
            <div class="${p}-level-badge ${badgeClass}">${badgeText}</div>
          </div>
          ${descBlock}
          <div class="${p}-level-meta">
            <div class="${p}-meta-item"><strong>When</strong><span>${whenHtml}</span></div>
            <div class="${p}-meta-item"><strong>Where</strong><span>${slot.studio ? 'Studio ' + String(slot.studio).replace(/^Studio\s+/i, '') : '?'}</span></div>
            <div class="${p}-meta-item"><strong>Teacher</strong><span>${slot.teacher || '?'}${slot.coTeachers ? ' & ' + slot.coTeachers : ''}</span></div>
            <div class="${p}-meta-item"><strong>Duration</strong><span>${slot.duration || '?'} min</span></div>
          </div>
          ${datesHtml}
          ${priceLabel}
          ${opts.semesterOnly ? `<p class="${p}-semester-only-note">Semester registration only</p>` : ''}
          ${opts.passOnly ? '' : `<a class="${p}-register-link register-link" href="${registerUrl}">${opts.dropinHtml ? 'Register for semester →' : 'Register →'}</a>`}
          ${opts.dropinHtml || ''}
        </div>`;
}

function wsDayCard(dayName, dayLevels, meta, prefix, descs) {
  const p = prefix;

  // Sort chronologically by start time so cards read in clock order
  dayLevels = [...dayLevels].sort((a, b) => (a.slot.start || '').localeCompare(b.slot.start || ''));

  // Detect whether all levels share the same teacher
  const _uniqueTeachers = [...new Set(dayLevels.map(e => (e.slot.teacher || '').trim()).filter(Boolean))];
  const _allSameTeacher = _uniqueTeachers.length <= 1;

  // Build level-by-level time rows
  const levelRows = dayLevels.map((entry, i) => {
    const lv = entry.lv;
    const slot = entry.slot;
    const sc = lv.sessionCount || WS_STD_SESSIONS;
    // Canonical price from slot duration — correct even for mixed-duration day cards
    const price = wsComputePrice(slot.duration || null, sc, meta.fullPrice, meta.studentPrice);
    const fp = price ? price.full    : null;
    const sp = price ? price.student : null;
    const up = price ? price.uitpas  : null;
    // Same word-based-level fix as wsPerLevelCard: "Int/Adv" is not a beginner
    // class. Ballet carries Shirley's Level 1/2/3 alongside Tono's Int/Adv, so
    // this path renders both and must label each correctly.
    const _dSrc = lv._realLevel || lv.level || '';
    const _dAdvWord = /int\s*\/?\s*adv|advanced|intermediate|gevorderd/i.test(_dSrc);
    const isL2plus = /level [2-9]|l[2-9]/i.test(_dSrc) || _dAdvWord;
    const _dNum = parseInt((_dSrc.match(/\d+/) || [])[0]);
    const _dLabel = _dAdvWord
      ? (/int\s*\/?\s*adv/i.test(_dSrc) ? 'Int / Adv'
         : /advanced/i.test(_dSrc) ? 'Advanced' : 'Intermediate')
      : (isL2plus ? (_dNum >= 4 ? 'Advanced' : _dNum === 3 ? 'Intermediate' : 'Prior experience needed') : 'Beginners welcome');
    const levelDesc = descs ? (descs[lv.level] || descs['Level ' + _dNum] || '') : '';
    return `<div class="${p}-day-level">
              <div class="${p}-day-level-row">
                <span class="${p}-day-level-name">${lv.level || 'Level'}</span>
                <span class="${p}-day-level-time">${slot.start || ''}–${slot.end || ''} · ${slot.duration || '?'} min</span>
                <span class="${p}-day-level-badge ${isL2plus ? p + '-badge-l2' : ''}">${_dLabel}</span>
              </div>
              ${fp ? `<div class="${p}-day-pricing">€${wsEur(fp)}${sp ? ' · €' + wsEur(sp) + ' student' : ''} · €${wsEur(up)} UiTPAS</div>` : ''}
              ${!_allSameTeacher ? `<div class="${p}-day-level-teacher">Teacher: ${slot.teacher || '?'}</div>` : ''}
              ${levelDesc ? `<details class="${p}-day-desc"${i === 0 ? ' open' : ''}><summary class="${p}-day-desc-sum">About this level</summary><p class="${p}-day-desc-text">${levelDesc}</p></details>` : ''}
            </div>`;
  }).join('');

  // Use first slot for When/Where/Teacher
  const firstSlot = (dayLevels[0] && dayLevels[0].slot) || {};
  const lastSlot  = (dayLevels[dayLevels.length - 1] && dayLevels[dayLevels.length - 1].slot) || {};
  const timeRange = `${firstSlot.start || ''}–${lastSlot.end || ''}`;
  const teacherAnchor = (firstSlot.teacher || '').toLowerCase().split(' ')[0] || 'teacher';

  const datesHtml = (firstSlot.dates && firstSlot.dates.length)
    ? `<details class="${p}-date-list"><summary>${dayLevels[0].lv.sessionCount || 14} sessions · Sep–Jan · see all dates</summary>
          <div class="${p}-date-grid" translate="no">${wsDateGridHtml(firstSlot.dates, p)}</div>
        </details>`
    : '';

  return `        <div class="${p}-level-card">
          <div class="${p}-card-top">
            <div>
              <div class="${p}-level-title">${dayName} evenings</div>
              <div class="${p}-level-who">${dayLevels.map(e => e.lv.level || 'Level').join(' + ')}</div>
            </div>
            <div class="${p}-level-badge">${dayLevels.length} classes</div>
          </div>
          <div class="${p}-day-levels">${levelRows}</div>
          <hr style="border:none;border-top:1px solid #e4e0db;margin:.85rem 0;">
          <div class="${p}-level-meta">
            <div class="${p}-meta-item"><strong>When</strong><span>${dayName} ${timeRange}</span></div>
            <div class="${p}-meta-item"><strong>Where</strong><span>${firstSlot.studio ? 'Studio ' + String(firstSlot.studio).replace(/^Studio\s+/i, '') : '?'}</span></div>
            <div class="${p}-meta-item"><strong>Teacher</strong><span>${_allSameTeacher
              ? (firstSlot.teacher || '?') + (firstSlot.coTeachers ? ' & ' + firstSlot.coTeachers : '')
              : dayLevels.map(e => `${e.lv.level}: ${e.slot.teacher || '?'}`).join('<br>')
            }</span></div>
          </div>
          ${datesHtml}
          <a class="${p}-register-link register-link" href="${WS_REG_URL}">Register →</a>
        </div>`;
}

function wsLevelsHtml(style, descsByLevel, wsData) {
  const meta   = style.meta   || {};
  let   levels = Array.isArray(style.levels) ? style.levels : [];

  // ── Starter Series ────────────────────────────────────────────────────────
  // A 4-week on-ramp sold alongside the semester course (Bhangra EUR 50, ISC EUR 58).
  // It is NOT a level in the sheet, so it has to be synthesised: same day / time /
  // teacher / studio as the style's first slot, the first `sessions` dates of that
  // slot, and the standard tier prorated 4/16 — which is exactly where 50 and 58 come
  // from, so nothing is hardcoded.
  //
  // Restored 2026-08-12. It had vanished from both the generator and the feed while the
  // offering was still running and still advertised in the pages' own About text; the
  // pasted blocks were the only place it survived. Confirmed still running by Swapnil.
  // `isStarterSeries` is keyed on /starter/i in the level name, so the label must
  // contain the word "Starter".
  const _starter = wsData && wsData.starterSeries;
  if (_starter && levels.length) {
    const _base = (levels[0].slots || [])[0];
    if (_base) {
      const _n = _starter.sessions || 4;
      levels = levels.concat([{
        level: _starter.label || (_n + '-Week Starter Series'),
        sessionCount: _n,
        slots: [Object.assign({}, _base, { dates: (_base.dates || []).slice(0, _n) })]
      }]);
    }
  }
  const _descs = (descsByLevel && Object.keys(descsByLevel).length ? descsByLevel : null) || meta.descByLevel || {};
  const p      = wsMakePrefix(style.name);
  // Pass-priced styles always render per-level (one card per day-slot) so each
  // class gets its own card above the shared pass table. Without this override
  // wsClassifyLayout sees two levels back-to-back on the same day (Tono's Ballet
  // 10:00 + Contemporary 11:30) and picks the day-based layout, which has no
  // pass-table branch.
  const layout = (wsData && wsData.passPricing) ? 'per-level' : wsClassifyLayout(levels);

  // The "Semester" stat used to print the WS_SEMESTER_DATES constant on every
  // block, which is wrong for any class that does not run the whole semester
  // (Tono's mornings are Sep 28 – Dec 10, not Sep 14 – Jan 30). Derive it from
  // this style's own slot dates and fall back to the constant only when the
  // sheet has no dates yet.
  const _runDates = [...new Set(levels.flatMap(lv => (lv.slots || []).flatMap(s => s.dates || [])))].sort();
  const _fmtRun = d => {
    const dt = new Date(d + 'T12:00:00');
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return months[dt.getMonth()] + ' ' + dt.getDate();
  };
  const _styleRunRange = _runDates.length
    ? _fmtRun(_runDates[0]) + ' – ' + _fmtRun(_runDates[_runDates.length - 1])
    : WS_SEMESTER_DATES;

  // Collect all unique days for semester-tag
  const allDays = [];
  levels.forEach(lv => (lv.slots || []).forEach(s => { if (s.day && !allDays.includes(s.day)) allDays.push(s.day); }));
  const dayOrder = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  allDays.sort((a, b) => dayOrder.indexOf(a) - dayOrder.indexOf(b));
  // Determine time-of-day label per day from first matching slot
  const _slotsByDay = {};
  levels.forEach(lv => (lv.slots || []).forEach(s => { if (s.day && !_slotsByDay[s.day]) _slotsByDay[s.day] = s; }));
  const _timeLabel = s => {
    const h = parseInt((s.start || '00:00').split(':')[0]);
    return h < 12 ? 'mornings' : h < 17 ? 'afternoons' : 'evenings';
  };
  const semesterTagDays = allDays.map(d => wsShortDay(d) + ' ' + (_slotsByDay[d] ? _timeLabel(_slotsByDay[d]) : 'evenings')).join(' + ');

  // Drop-in styles (Pilates / Dance & Fit / Wed Yoga) render one card per day-slot.
  // Pass-priced styles reuse the drop-in day-card machinery: every day they run on
  // is a "pass day", so each slot gets its own card and ONE shared pass table
  // renders below them (the pass is spendable across all of them).
  const _passCfg = (wsData && wsData.passPricing) ? wsData.passPricing : null;
  const _dropinDays = _passCfg
    ? [...new Set(levels.flatMap(lv => (lv.slots || []).map(s => s.day)).filter(Boolean))]
    : ((wsData && Array.isArray(wsData.dropinDays)) ? wsData.dropinDays : null);
  const _totalSlots = levels.reduce((n, lv) => n + ((lv.slots || []).length), 0);
  // Count how many cards will actually render — per-level: one per level (or one per
  // day-slot for drop-in styles); day-based: one per unique day.
  const renderedCardCount = layout === 'day'
    ? dayOrder.filter(d => allDays.includes(d)).length
    : (_dropinDays ? _totalSlots : levels.length);
  const isSingleCard = renderedCardCount === 1;
  const gridCols = isSingleCard ? '1fr' : '1fr 1fr';
  const gridExtra = isSingleCard ? 'max-width:640px;margin:0 auto;' : '';

  // Generate cards
  let cardsHtml = '';
  let dropinBelowHtml = '';   // shared drop-in section rendered below the cards (multi-day drop-in styles)
  if (layout === 'per-level' && _dropinDays) {
    // Drop-in styles: one card per day-slot.
    // • Single drop-in day (e.g. Wed Yoga): drop-in block under that day's card,
    //   "Semester registration only" note on the others.
    // • Multiple drop-in days (e.g. Pilates Tue+Wed): ONE shared drop-in section
    //   below both cards — the pack covers any day, so don't repeat it per card.
    const _tod = s => { const h = parseInt((s.start || '0').split(':')[0]); return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening'; };
    const _multiDropin = _dropinDays.length > 1;
    const cards = [];
    levels.forEach((lv, i) => {
      const levelDesc = _descs[lv.level] || _descs['Level ' + (i + 1)] || '';
      // This path renders ONE CARD PER SLOT, so a level taught on two days (Yoga Tue+Thu,
      // Pilates Tue+Wed) produced the same description twice on one page. The description
      // belongs to the level, not the slot — emit it on the first card only (D-024: each
      // fact exactly once per surface).
      let _descUsed = false;
      (lv.slots || []).forEach(s => {
        const isDropin = _dropinDays.includes(s.day);
        cards.push(wsPerLevelCard(lv, i, meta, p, false, _descUsed ? '' : levelDesc, {
          slotOverride: s,
          // Pass/merged pages carry more than one style, so the card title leads
          // with the level label; drop-in pages keep the plain "Monday morning".
          title: (_passCfg && lv.level ? lv.level + ' · ' : '') + (s.day || '') + ' ' + _tod(s),
          dropinHtml: (!_passCfg && !_multiDropin && isDropin) ? wsDropinSectionHtml(p) : '',
          semesterOnly: (!_passCfg && !_multiDropin && !isDropin),
          passOnly: !!_passCfg
        }));
        _descUsed = true;
      });
    });
    cardsHtml = cards.join('\n');
    if (_passCfg) {
      dropinBelowHtml = '\n  <div style="max-width:640px;margin:1.5rem auto 0;">' +
        wsDropinSectionHtml(p, _passCfg.note, {
          packs: _passCfg.packs || WS_PASS_PACKS,
          label: _passCfg.label || 'Class passes',
          cta:   _passCfg.cta   || 'Book a pass →',
          url:   _passCfg.url   || WS_PASS_URL
        }) + '</div>';
    } else if (_multiDropin) {
      const _note = 'Prefer flexibility? Come to any ' + _dropinDays.join(' or ') +
        ' session — pick 3 or 5 dates, no semester commitment needed.';
      dropinBelowHtml = '\n  <div style="max-width:640px;margin:1.5rem auto 0;">' + wsDropinSectionHtml(p, _note) + '</div>';
    }
  } else if (layout === 'per-level') {
    cardsHtml = levels.map((lv, i) => {
      const isStarter = /starter/i.test(lv.level || '');
      // A starter series is NOT "level i+1". The positional fallback handed it whatever level
      // happened to sit at that index, so the identical description rendered twice on one page
      // — observed on Indian Semi-Classical 2026-08-12, where the Level 2 text repeated verbatim
      // on the 4-Week Starter card. A starter card gets a description only if one is keyed to it.
      const levelDesc = _descs[lv.level] || (isStarter ? '' : (_descs['Level ' + (i + 1)] || ''));
      return wsPerLevelCard(lv, i, meta, p, isStarter, levelDesc);
    }).join('\n');
  } else {
    // Day-based: group slots by day
    const byDay = {};
    levels.forEach(lv => {
      (lv.slots || []).forEach(slot => {
        const day = slot.day || 'Unknown';
        if (!byDay[day]) byDay[day] = [];
        byDay[day].push({ lv, slot });
      });
    });
    dayOrder.filter(d => byDay[d]).forEach(day => {
      cardsHtml += wsDayCard(day, byDay[day], meta, p, _descs) + '\n';
    });
  }

  const fullCss = `<link href="${WS_GOOGLE_FONTS}" rel="stylesheet">
<style>
.${p}-reg{width:100%;font-family:'PT Serif',Georgia,serif;}
.${p}-reg .section-label{font-size:.72rem;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#1a1a1a;font-family:'Marcellus',serif;margin:0 0 .5rem;}
.${p}-reg h2.section-h{font-family:'Marcellus',serif;font-weight:400;font-size:1.6rem;color:#1a1a1a;margin:0 0 .5rem;}
.${p}-reg .stat-row{display:flex;flex-wrap:wrap;gap:.75rem 2rem;margin:.65rem 0 1.5rem;align-items:flex-start;}
.${p}-reg .stat-item{display:flex;flex-direction:column;gap:.15rem;}
.${p}-reg .stat-val{font-size:.85rem;font-weight:400;color:#1a1a1a;font-family:'Marcellus',serif;}
.${p}-reg .stat-key{font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#6b6b6b;}
.${p}-reg .stat-div{width:1px;background:rgba(0,0,0,.12);align-self:stretch;margin:.1rem 0;}
@media(max-width:500px){.${p}-reg .stat-div{display:none;}}
.${p}-reg .level-cards{display:grid;grid-template-columns:${gridCols};gap:1rem;width:100%;${gridExtra}}
@media(max-width:700px){.${p}-reg .level-cards{grid-template-columns:1fr;}}
@media(max-width:480px){.${p}-reg .${p}-level-meta{grid-template-columns:1fr;}}
.${p}-reg .${p}-level-card{background:#fff;border:1.5px solid #e4e0db;border-radius:10px;padding:1.35rem 1.4rem;display:flex;flex-direction:column;gap:.85rem;}
.${p}-reg .${p}-starter{background:#F5ECFF;border-color:#B564F7;}
.${p}-reg .${p}-card-top{display:flex;justify-content:space-between;align-items:flex-start;gap:.75rem;}
.${p}-reg .${p}-level-title{font-family:'Marcellus',serif;font-weight:400;font-size:1.15rem;color:#1a1a1a;margin:0;}
.${p}-reg .${p}-level-who{font-size:.8rem;color:#6b6b6b;margin-top:.2rem;}
.${p}-reg .${p}-level-badge{font-size:.65rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;background:#F5ECFF;color:#B564F7;border-radius:99px;padding:.25rem .75rem;white-space:nowrap;flex-shrink:0;}
.${p}-reg .${p}-badge-l2{background:#1a1a1a;color:#fff;}
.${p}-reg .${p}-level-prereq{font-size:.78rem;color:#555;line-height:1.55;font-style:italic;background:#FAF8F4;border-left:3px solid #B564F7;padding:.55rem .8rem;border-radius:0 4px 4px 0;}
.${p}-reg .${p}-level-desc{font-size:.82rem;color:#555;line-height:1.55;margin-bottom:.25rem;}
.${p}-reg .${p}-level-meta{display:grid;grid-template-columns:1fr 1fr;gap:.5rem .75rem;}
.${p}-reg .${p}-meta-item{font-size:.8rem;color:#6b6b6b;display:flex;flex-direction:column;gap:.1rem;}
.${p}-reg .${p}-meta-item strong{font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#1a1a1a;}
.${p}-reg .${p}-meta-item a{color:#1a1a1a;text-decoration:underline;}
.${p}-reg .${p}-date-list{border:1px solid #e4e0db;border-radius:6px;overflow:hidden;}
.${p}-reg .${p}-date-list summary{padding:.55rem .85rem;font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#B564F7;cursor:pointer;min-height:44px;display:flex;align-items:center;}
.${p}-reg .${p}-date-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:.3rem;padding:.65rem .85rem;background:#faf8f4;}
.${p}-reg .${p}-date-grid span{font-size:.72rem;color:#444;}
.${p}-reg .${p}-date-grid .date-skip{grid-column:1/-1;text-align:center;font-size:.7rem;color:#B564F7;font-style:italic;padding:.25rem 0;border-top:1px dashed #e4e0db;}
.${p}-reg .${p}-price-row{display:flex;border:1.5px solid #e4e0db;border-radius:8px;overflow:hidden;}
.${p}-reg .${p}-price-col{flex:1;padding:.65rem .75rem;text-align:center;border-right:1px solid #e4e0db;}
.${p}-reg .${p}-price-col:last-child{border-right:none;}
@media(max-width:480px){.${p}-reg .${p}-price-row{flex-direction:column;}.${p}-reg .${p}-price-col{border-right:none;border-bottom:1px solid #e4e0db;}.${p}-reg .${p}-price-col:last-child{border-bottom:none;}}
.${p}-reg .${p}-price-amount{font-family:'Marcellus',serif;font-size:1.1rem;color:#1a1a1a;}
.${p}-reg .${p}-price-label{font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#5a5a5a;margin-top:.15rem;}
.${p}-reg .${p}-day-levels{display:flex;flex-direction:column;gap:.65rem;}
.${p}-reg .${p}-day-level{background:#faf8f4;border-radius:6px;padding:.6rem .8rem;}
.${p}-reg .${p}-day-level-row{display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;}
.${p}-reg .${p}-day-level-name{font-size:.85rem;font-weight:700;color:#1a1a1a;flex:1;}
.${p}-reg .${p}-day-level-time{font-size:.78rem;color:#6b6b6b;}
.${p}-reg .${p}-day-level-badge{font-size:.72rem;font-weight:700;text-transform:uppercase;background:#F5ECFF;color:#B564F7;border-radius:99px;padding:.15rem .55rem;}
.${p}-reg .${p}-day-pricing{font-size:.75rem;color:#6b6b6b;margin-top:.3rem;}
.${p}-reg .${p}-day-desc{border-top:1px solid #e4e0db;margin-top:.5rem;padding-top:.4rem;}
.${p}-reg .${p}-day-level-teacher{font-size:.75rem;color:#666;margin-top:.2rem;}
.${p}-reg .${p}-day-desc-sum{font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#B564F7;cursor:pointer;list-style:none;padding:.1rem 0;}
.${p}-reg .${p}-day-desc-sum::-webkit-details-marker{display:none;}
.${p}-reg .${p}-day-desc-text{font-size:.8rem;color:#555;line-height:1.6;margin:.5rem 0 0;}
.${p}-reg a.register-link,
.${p}-reg a.register-link:link,
.${p}-reg a.register-link:visited,
.${p}-reg a.register-link:hover,
.${p}-reg a.register-link:focus,
.${p}-reg a.register-link:active{display:block!important;width:100%!important;box-sizing:border-box!important;padding:.75rem 1rem!important;background:#000!important;background-color:#000!important;background-image:none!important;color:#ffffff!important;text-align:center!important;text-decoration:none!important;font-size:.82rem!important;font-weight:700!important;letter-spacing:.08em!important;text-transform:uppercase!important;border-radius:8px!important;border:0!important;box-shadow:none!important;transition:background .15s!important;pointer-events:auto!important;cursor:pointer!important;}
.${p}-reg a.register-link:hover{background:#B564F7!important;background-color:#B564F7!important;}
.${p}-reg .spring-note{display:flex;align-items:center;gap:.5rem;font-size:.8rem;color:#5a3a7a;background:#f5ecff;border:1px solid #e0ccf8;border-radius:6px;padding:.55rem .9rem;margin-top:1.25rem;}
.${p}-reg .spring-note a{color:#B564F7;text-decoration:none;font-weight:700;}
.${p}-reg .spring-note a:hover{text-decoration:underline;}
.${p}-reg .${p}-semester-only-note{font-size:.75rem;color:#6b6b6b;text-align:center;padding:.35rem 0 0;margin:0;}
.${p}-reg .${p}-dropin-section{border-top:1.5px dashed #d4bef7;padding-top:1rem;margin-top:.25rem;display:flex;flex-direction:column;gap:.75rem;}
.${p}-reg .${p}-dropin-label{font-size:.68rem;font-weight:700;letter-spacing:.13em;text-transform:uppercase;color:#B564F7;margin:0 0 .35rem;}
.${p}-reg .${p}-dropin-note{font-size:.78rem;color:#6b6b6b;margin:0;line-height:1.5;}
.${p}-reg .${p}-dropin-packs{display:flex;gap:.65rem;}
.${p}-reg .${p}-dropin-pack{flex:1;border:1.5px solid #d4bef7;border-radius:8px;padding:.7rem .75rem;text-align:center;background:#faf4ff;}
.${p}-reg .${p}-dropin-sessions{font-size:.68rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#B564F7;margin-bottom:.2rem;}
.${p}-reg .${p}-dropin-price{font-family:'Marcellus',serif;font-size:1.2rem;color:#1a1a1a;}
.${p}-reg a.dropin-register,
.${p}-reg a.dropin-register:link,
.${p}-reg a.dropin-register:visited,
.${p}-reg a.dropin-register:hover,
.${p}-reg a.dropin-register:focus,
.${p}-reg a.dropin-register:active{display:block!important;text-align:center!important;background:transparent!important;background-color:transparent!important;background-image:none!important;color:#B564F7!important;font-family:'PT Serif',Georgia,serif!important;font-size:.85rem!important;font-weight:700!important;letter-spacing:.04em!important;text-decoration:none!important;border:1.5px solid #B564F7!important;border-radius:7px!important;padding:.6rem 1rem!important;box-shadow:none!important;outline:none!important;pointer-events:auto!important;cursor:pointer!important;}
.${p}-reg a.dropin-register:hover{background:#B564F7!important;background-color:#B564F7!important;color:#fff!important;}
.${p}-reg .${p}-partner-callout{display:flex;gap:.6rem;align-items:flex-start;background:#F5ECFF;border:1.5px solid #dbc5f8;border-radius:8px;padding:.7rem 1rem;margin-bottom:1.25rem;font-size:.83rem;color:#3a1a5c;line-height:1.55;}
.${p}-reg .${p}-partner-callout strong{font-weight:700;}
.${p}-reg .${p}-partner-callout a{color:#B564F7;text-decoration:none;}
.${p}-reg .${p}-partner-callout a:hover{text-decoration:underline;}
</style>
<div class="${p}-reg">
  ${isSingleCard ? `<div style="max-width:640px;margin:0 auto;">` : ''}
  <h2 class="section-h">Levels &amp; registration</h2>
  <div class="stat-row">
    <div class="stat-item"><span class="stat-val">${_styleRunRange}</span><span class="stat-key">Semester</span></div>
    <div class="stat-div"></div>
    <div class="stat-item"><span class="stat-val">${Math.max(...levels.map(lv => lv.sessionCount || 16))} sessions</span><span class="stat-key">Classes</span></div>
    <div class="stat-div"></div>
    <div class="stat-item"><span class="stat-val">${semesterTagDays || '—'}</span><span class="stat-key">Schedule</span></div>
    <div class="stat-div"></div>
    <div class="stat-item"><span class="stat-val">${levels.length} ${levels.length === 1 ? 'level' : 'levels'}</span><span class="stat-key">Levels</span></div>
  </div>
  ${wsData && wsData.partnerRequired ? `<div class="${p}-partner-callout">
    <span aria-hidden="true">&#128107;</span>
    <span><strong>Partner required</strong> — please register together with your dance partner.${wsData.partnerForumUrl ? ` Looking for one? <a href="${wsData.partnerForumUrl}">Join the Shoonya Dance Forum →</a>` : ''}</span>
  </div>` : ''}
  <div class="level-cards">
${cardsHtml}  </div>${dropinBelowHtml}
  ${WS_SPRING_NOTE ? `<p class="spring-note"><span aria-hidden="true">&#127800;</span><span>${WS_SPRING_NOTE} — <a href="${WS_SPRING_SCHEDULE_URL}">view the spring schedule →</a></span></p>` : ''}
  ${isSingleCard ? `</div>` : ''}
</div>`;

  return fullCss;
}

  return { render: wsLevelsHtml, styleData: WS_STYLE_DATA, computePrice: wsComputePrice,
           classifyLayout: wsClassifyLayout, makePrefix: wsMakePrefix };
  })();
  // ─── END GENERATED ───

})();

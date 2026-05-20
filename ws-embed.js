// ws-embed.js — Shoonya style page embed
// Served from: https://schooljaar.shoonyadance.com/ws-embed.js
// v1 · 2026-05-20
//
// Usage — replace the Practical code block on any style page with:
//   <div id="ws-prac-root"></div>
//   <script src="https://schooljaar.shoonyadance.com/ws-embed.js"></script>
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
    'Indian Semi-Classical':   '/indian-semi-classical-gent',
    'Yoga':                    '/yoga-lessen-in-gent',
    'Indian Dance Technique':  '/indian-dance-in-belgium',
    'Pilates for Dancers':     '/pilates-voor-dansers-gent',
    'Dance & Fit':             '/dance-fit-gent',
    'Bachata Solo Style':      '/bachata-solo-style-gent',
    'Oriental Flow':           '/oriental-flow-gent'
  };

  // ── Per-page data ─────────────────────────────────────────────────────────
  // Keys = Squarespace page path (no trailing slash, lowercase).
  // also[] = [styleName, meta] — styleName must match a key in SLUGS above.
  var PAGES = {
    '/argentijnse-tango-danslessen-gent': {
      wear:  'Indoor dance shoes with suede or smooth leather soles — or socks.',
      bring: 'Water bottle.',
      also:  [['Bachata','Tuesday · L1/L2/L3'],['Cuban Salsa','Monday · L1/L2/L3/L4'],['Flamenco','Tuesday · L1/L2/L3']]
    },
    '/flamenco-danslessen-in-gent': {
      wear:  'Flamenco dress or skirt, flamenco shoes (heels recommended). Never barefoot.',
      bring: 'Water bottle.',
      also:  [['Ballet','Friday · L1/L2/L3'],['Indian Semi-Classical','Wednesday · L2'],['Tap Dance','Mon–Sat · L1–L4']]
    },
    '/ballet-voor-volwassenen-in-gent': {
      wear:  'Comfortable, form-fitting dancewear. Appropriate dance shoes or socks.',
      bring: 'Water bottle.',
      also:  [['Yoga','Tuesday · Open'],['Flamenco','Tuesday · L1/L2/L3'],['Indian Dance Technique','Tuesday · Open']]
    },
    '/kizomba-danslessen-in-gent': {
      wear:  'Comfortable, form-fitting dancewear. Appropriate dance shoes or socks.',
      bring: 'Water bottle.',
      also:  [['African Congolese Dance','Saturday · Open'],['Argentine Tango','Thursday · L1 & L2'],['Bachata','Tuesday · L1/L2/L3']]
    },
    '/bachata-dance-classes-in-ghent': {
      wear:  'Comfortable, form-fitting dancewear. Appropriate dance shoes or socks.',
      bring: 'Water bottle.',
      also:  [['Cuban Salsa','Monday · L1/L2/L3/L4'],['Rueda de Casino','Thursday · L1/L2'],['Argentine Tango','Thursday · L1 & L2']]
    },
    '/cuban-salsa-in-gent': {
      wear:  'Comfortable, form-fitting dancewear. Appropriate dance shoes or socks.',
      bring: 'Water bottle.',
      also:  [['Bachata','Tuesday · L1/L2/L3'],['Rueda de Casino','Thursday · L1/L2'],['Flamenco','Tuesday · L1/L2/L3']]
    },
    '/rueda-de-casino-danslessen-gent': {
      wear:  'Comfortable, form-fitting dancewear. Appropriate dance shoes or socks.',
      bring: 'Water bottle.',
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
      wear:  'Comfortable, form-fitting dancewear. Appropriate dance shoes or socks.',
      bring: 'Water bottle.',
      also:  [['Lindy Hop','Wednesday · L1/L2'],['Solo Jazz','Wednesday · Open'],['Flamenco','Tuesday · L1/L2/L3']]
    },
    '/raqs-sharqi-danslessen-in-gent': {
      wear:  'Comfortable, stretchy clothing. Barefoot or grip socks.',
      bring: 'Water bottle. Yoga mat if you have one — mats available at Shoonya.',
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
      also:  [['Yoga','Tuesday · Open'],['Bollywood','Thursday · L2 & L3'],['Flamenco','Tuesday · L1/L2/L3']]
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
    '/indian-semi-classical-gent': {
      wear:  'Comfortable dancewear. Come barefoot — no shoes in Studio Aakash.',
      bring: 'Water bottle.',
      also:  [['Indian Dance Technique','Tuesday · Open'],['Bollyfolk','Tuesday · Open'],['Bollywood','Thursday · L2 & L3']]
    },
    '/yoga-lessen-in-gent': {
      wear:  'Comfortable, stretchy clothing. Come barefoot.',
      bring: 'Water bottle. Yoga mat if you have one — mats available at Shoonya.',
      also:  [['Indian Dance Technique','Tuesday · Open'],['Bollyfolk','Tuesday · Open'],['Pilates for Dancers','Tue & Wed · Open']]
    },
    '/indian-dance-in-belgium': {
      wear:  'Comfortable dancewear. Come barefoot — no shoes in Studio Aakash.',
      bring: 'Water bottle.',
      also:  [['Yoga','Tuesday · Open'],['Bollyfolk','Tuesday · Open'],['Ballet','Friday · L1/L2/L3']]
    },
    '/pilates-voor-dansers-gent': {
      wear:  'Comfortable, stretchy clothing. Barefoot or grip socks.',
      bring: 'Water bottle. Yoga mat if you have one — mats available at Shoonya.',
      also:  [['Dance & Fit','Wednesday · Open'],['Yoga','Tuesday · Open'],['Raqs Sharqi','Monday · L1/L2/L3']]
    },
    '/dance-fit-gent': {
      wear:  'Comfortable sportswear. Indoor shoes or barefoot.',
      bring: 'Water bottle.',
      also:  [['Pilates for Dancers','Tue & Wed · Open'],['Raqs Sharqi','Monday · L1/L2/L3'],['Yoga','Tuesday · Open']]
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
    '.wsep-prac a.also-link,.wsep-prac a.also-link:link,.wsep-prac a.also-link:visited,.wsep-prac a.also-link:hover,.wsep-prac a.also-link:focus,.wsep-prac a.also-link:active{position:absolute;inset:0;display:block;z-index:1;background:transparent!important;background-color:transparent!important;background-image:none!important;color:transparent!important;text-decoration:none!important;border:0!important;box-shadow:none!important;outline:none!important;pointer-events:auto!important;cursor:pointer!important;}'
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
      '<p class="sec-label">Also at Shoonya</p>' +
      '<h2 class="section-h">You might also like</h2>' +
      '<div class="also-grid">' + cards + '</div>' +
      '</div>';
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

/* =====================================================================
 *  YOUR FIXED IDENTITY — edit these lines and every screen updates:
 *  the teacher board, the students' phones and the certificates.
 * ===================================================================== */
const BRAND = {
  appName: ['Class', 'Live'],                       // big 3D title (two words: navy + gold)
  subtitle: 'Live Classroom Competition',           // navy pill under the title
  ribbon: ['Think', 'Compete', 'Create the Future'],// motto between two gold lines
  teacherFirst: 'T. Zainab',                        // used as text where the image can't show
  teacherLast: 'Alaraimi',
  signature: '/signature-navy.png',                 // YOUR real signature (also signature-gold.png / signature-white.png)
  certificateTeacher: 'Ms. Zainab Alaraimi',        // printed on certificates
  school: '',                                       // e.g. 'Al Noor School' (optional)
};

/* ---------------- hand-drawn doodles (navy ink + gold) ---------------- */
const INK = '#13254f', GOLD = '#d4af37', GOLD_D = '#a8841f';
const ART = {
  crown: `<svg viewBox="0 0 140 96" aria-hidden="true"><defs><linearGradient id="gC" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbe9a8"/><stop offset=".5" stop-color="#e2bf55"/><stop offset="1" stop-color="#b08a22"/></linearGradient></defs>
    <g stroke="${GOLD_D}" stroke-width="3" stroke-linejoin="round"><path d="M22 72 L16 28 L46 50 L70 16 L94 50 L124 28 L118 72 Z" fill="url(#gC)"/><rect x="20" y="70" width="100" height="14" rx="5" fill="url(#gC)"/></g>
    <g fill="#fff4d1" stroke="${GOLD_D}" stroke-width="2.5"><circle cx="16" cy="26" r="6"/><circle cx="70" cy="13" r="7"/><circle cx="124" cy="26" r="6"/></g>
    <g stroke="${GOLD}" stroke-width="3.5" stroke-linecap="round"><path d="M4 12 L12 18"/><path d="M136 12 L128 18"/><path d="M40 4 L44 12"/><path d="M100 4 L96 12"/></g></svg>`,
  plane: `<svg viewBox="0 0 130 90" aria-hidden="true"><g stroke="${GOLD_D}" stroke-width="2.5" stroke-linejoin="round"><path d="M6 44 L124 6 L62 84 L50 56 Z" fill="#ecc95c"/><path d="M50 56 L124 6" fill="none"/><path d="M50 56 L54 76 L62 63 Z" fill="#c9a030"/></g></svg>`,
  trail: `<svg viewBox="0 0 170 120" aria-hidden="true"><path d="M160 12 C 100 -2, 40 30, 64 62 C 86 92, 136 70, 114 50 C 92 30, 32 70, 8 112" fill="none" stroke="${INK}" stroke-width="2.6" stroke-dasharray="8 9" stroke-linecap="round"/></svg>`,
  star: `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 3 L24.6 15 L37 15.6 L27.2 23.4 L30.6 36 L20 28.6 L9.4 36 L12.8 23.4 L3 15.6 L15.4 15 Z" fill="none" stroke="${INK}" stroke-width="2.8" stroke-linejoin="round"/></svg>`,
  starGold: `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 3 L24.6 15 L37 15.6 L27.2 23.4 L30.6 36 L20 28.6 L9.4 36 L12.8 23.4 L3 15.6 L15.4 15 Z" fill="#ecc95c" stroke="${GOLD_D}" stroke-width="2.4" stroke-linejoin="round"/></svg>`,
  starNavy: `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 3 L24.6 15 L37 15.6 L27.2 23.4 L30.6 36 L20 28.6 L9.4 36 L12.8 23.4 L3 15.6 L15.4 15 Z" fill="${INK}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/></svg>`,
  sparkle: `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 2 C21 14 26 19 38 20 C26 21 21 26 20 38 C19 26 14 21 2 20 C14 19 19 14 20 2Z" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/></svg>`,
  bulb: `<svg viewBox="0 0 70 80" aria-hidden="true"><g stroke="${GOLD_D}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M35 16 a16 16 0 0 1 10 28.5 c-2 2-3 4-3 7 h-14 c0-3-1-5-3-7 A16 16 0 0 1 35 16z" fill="#fff4d1"/><path d="M29 57 h12 M30 62 h10 M32 67 h6" fill="none"/><path d="M35 2 v7 M12 10 l5 5 M58 10 l-5 5 M4 32 h7 M66 32 h-7" stroke="${GOLD}" stroke-width="3"/></g></svg>`,
  heart: `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 35 C 3 23, 3 8, 13 8 C 17 8, 20 12, 20 12 C 20 12, 23 8, 27 8 C 37 8, 37 23, 20 35Z" fill="#e85d8a" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/></svg>`,
  people: `<svg viewBox="0 0 120 34" aria-hidden="true" fill="${INK}">${[0, 1, 2, 3, 4].map(i => `<circle cx="${12 + i * 24}" cy="9" r="6.5"/><path d="M${1 + i * 24} 33 a11 11 0 0 1 22 0z"/>`).join('')}</svg>`,
  books: `<svg viewBox="0 0 230 170" aria-hidden="true" font-family="Lilita One, CL Black, Arial Black, sans-serif" text-anchor="middle">
    <g stroke="${INK}" stroke-width="1.6" stroke-linejoin="round">
      <rect x="30" y="8" width="170" height="28" rx="5" fill="${INK}" transform="rotate(-3 115 22)"/>
      <rect x="18" y="40" width="186" height="28" rx="5" fill="#f9c0d3"/>
      <rect x="26" y="72" width="178" height="28" rx="5" fill="#fbd97a" transform="rotate(1.5 115 86)"/>
      <rect x="14" y="104" width="196" height="28" rx="5" fill="#a5e2c8"/>
      <rect x="20" y="136" width="200" height="28" rx="5" fill="#d3c8f1" transform="rotate(-1 120 150)"/></g>
    <g font-size="15" fill="${INK}"><text x="115" y="28" fill="#f3d98a" transform="rotate(-3 115 22)">IDEAS</text><text x="111" y="60">SKILLS</text>
      <text x="115" y="92" transform="rotate(1.5 115 86)">TEAMWORK</text><text x="112" y="124">LEADERSHIP</text><text x="120" y="156" font-size="13" transform="rotate(-1 120 150)">A BRIGHTER TOMORROW</text></g>
    <g fill="${GOLD}"><path d="M196 18 l2 4 4 1 -4 1 -2 4 -2 -4 -4 -1 4 -1z"/><path d="M190 50 l2 4 4 1 -4 1 -2 4 -2 -4 -4 -1 4 -1z"/><path d="M194 114 l2 4 4 1 -4 1 -2 4 -2 -4 -4 -1 4 -1z"/></g></svg>`,
  pencils: `<svg viewBox="0 0 120 90" aria-hidden="true"><g stroke="${INK}" stroke-width="1.5" stroke-linejoin="round">
    <path d="M22 90 V22 l6-16 6 16 V90" fill="${INK}"/><path d="M22 22 l6-16 6 16z" fill="#f3d98a"/><path d="M26.5 10 l1.5-4 1.5 4z" fill="${INK}"/>
    <path d="M48 90 V30 l7-14 7 14 V90" fill="#d4af37"/><path d="M48 30 l7-14 7 14z" fill="#fff4d1"/>
    <rect x="72" y="18" width="13" height="72" rx="3" fill="${INK}"/><rect x="70" y="10" width="17" height="14" rx="4" fill="${INK}"/><rect x="72" y="26" width="13" height="5" fill="#d4af37" stroke="none"/>
    <path d="M94 90 V26 l5-14 5 14 V90" fill="#e9c75a"/><path d="M94 26 l5-14 5 14z" fill="#fff"/></g></svg>`,
};

/* Background doodle layer shared by the board and phones */
function doodleLayer() {
  // Formal identity: no background doodles, books, pencil cup or sticky-note slogans.
  return '<div class="doodles" aria-hidden="true"></div>';
}
function signatureHTML(cls = '', color = 'navy') {
  const src = color === 'navy' ? BRAND.signature : `/signature-${color}.png`;
  return `<span class="signature ${cls}"><img src="${src}" alt="${esc(BRAND.teacherFirst + ' ' + BRAND.teacherLast)}" draggable="false"></span>`;
}
function fx3d(text, color = 'navy', extra = '') {
  return `<span class="fx3d ${color} ${extra}" data-text="${esc(text)}">${esc(text)}</span>`;
}
function title3D(cls = '') {
  const [a, b] = BRAND.appName;
  return `<h1 class="title3d ${cls}" aria-label="${esc(BRAND.appName.join(' '))}">${fx3d(a, 'navy', 'serif')}${b ? fx3d(b, 'gold', 'serif') : ''}</h1>`;
}

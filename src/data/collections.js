/**
 * TOUR ARCHIVE — collection research + catalogue records
 *
 * Collections are research files grouped by tournament / championship moment;
 * historical notes are sourced from public records (see `sources` on each).
 * The `items` below are CATALOGUE RECORDS, not displayed stock — they enrich a
 * real listing when it carries the matching TA-XX-NN catalogue number, and are
 * never shown for sale on their own. Displayed stock comes from the photo
 * manifest (public/stock/) and the marketplaces.
 */

export const BRAND = {
  name: 'Tour Archive',
  mark: 'TOUR ARCHIVE',
  tagline: 'Vintage golf, sourced by tournament.',
  since: 'Est. MMXXVI',
  blurb:
    'We thrift, authenticate and catalogue golf apparel by the championship it belongs to. Every piece is one of one. When it is gone, it is gone.',
};

/* ------------------------------------------------------------------ */
/* Collections                                                         */
/* ------------------------------------------------------------------ */

export const collections = [
  {
    id: 'tour-championship-2026',
    drop: 'Drop No. 01',
    name: 'The Tour Championship',
    place: 'East Lake, Atlanta',
    years: '2026',
    status: 'upcoming',
    statusLabel: 'First drop',
    releaseNote: 'Opens tournament week',
    heroLine: 'Thirty players, Bobby Jones’s home club, and the first drop in the archive.',
    summary:
      'Our opening collection, released around the 2026 TOUR Championship at East Lake — Atlanta golf tradition, Jones-era knitwear, and the sun-struck colour of Georgia in late August.',
    // Derived from the course itself: sun-struck zoysia fairway, August haze,
    // Piedmont clay. See the research file in the repo for the reasoning.
    palette: ['#7D8B5A', '#B8C3C0', '#3B342D'],
    accent: '#A65C3C',
    essay: [
      'The season ends where American golf grew up. Bobby Jones was six years old, standing beside his father, on the day East Lake’s course opened in July 1908; it is where Stewart Maiden taught him the swing, where he played his first round and his last, and the club whose junior championship he won at nine before winning thirteen majors in twenty tries. The tournament trophy is a sterling replica of Calamity Jane — the hickory-shafted putter that survived the 1925 clubhouse fire because Jones would not leave it in the bag room.',
      'The modern game’s richest week is settled with a copy of an amateur’s putter from a hundred years ago. That is the whole thesis of this archive in a single object, and it is why the first drop opens here: Jones-era knitwear silhouettes, Atlanta club clothing, and lighter Southern lambswool in the register of zoysia fairways and Piedmont clay rather than Highland tweed.',
      'It is also a finite moment. From 2028 the finale begins rotating venues, making 2026 one of the last two years the season ends at East Lake as an annual fixture. Pieces are being photographed and catalogued now — the drop opens tournament week, 27 to 30 August.',
    ],
    facts: [
      { k: 'Championship', v: '2026 TOUR Championship' },
      { k: 'Rounds', v: '27 – 30 August 2026' },
      { k: 'Course', v: 'East Lake Golf Club, Atlanta' },
      { k: 'Field', v: 'FedEx Cup final 30' },
      { k: 'Defending', v: 'Tommy Fleetwood, −18' },
      { k: 'Trophy', v: 'Calamity Jane replica' },
    ],
    sources: [
      { label: 'PGA Tour — 2026 TOUR Championship', url: 'https://www.pgatour.com/tournaments/2026/tour-championship/R2026060/overview' },
      { label: 'East Lake Golf Club — history', url: 'https://eastlakegolfclub.com/history/' },
      { label: 'New Georgia Encyclopedia — Bobby Jones', url: 'https://www.georgiaencyclopedia.org/articles/people/bobby-jones-1902-1971/' },
      { label: 'AJC — East Lake and the rotation era', url: 'https://www.ajc.com/sports/2026/06/east-lake-out-as-permanent-host-for-tour-championship-after-2027/' },
    ],
  },
  {
    id: 'duel-in-the-sun',
    drop: 'File No. 01',
    name: 'Duel in the Sun',
    place: 'Turnberry, Ayrshire',
    years: '1977 — 1986',
    status: 'archived',
    statusLabel: 'Archive file',
    releaseNote: 'File published July',
    heroLine: 'Two men, a heatwave, and the last nine holes of the 106th Open.',
    summary:
      'Sun-bleached Scottish knitwear from the Ailsa course era — cable vests, gorse-yellow lambswool and wind shirts cut for a links gale.',
    palette: ['#C8B489', '#7E8C7C', '#2E3B44'],
    accent: '#B08D57',
    essay: [
      'Turnberry had never hosted an Open before 1977. Ayrshire turned it on regardless: four days of heatwave on a coast that is famous for the opposite. Jack Nicklaus and Tom Watson arrived at the weekend tied on 138, shot matching 65s on Saturday, and then walked away from the rest of the field entirely — a two-man championship played in front of a gallery that had stopped pretending to watch anyone else.',
      'Watson took it by a stroke, 268 to 269, both totals under the old Open record. Turnberry later renamed its 18th for the occasion. What the archive remembers is the clothing: lightweight lambswool in colours that had been washed out by salt and sun, cable knit worn over open collars, and the flat, functional wind shirt that Scottish links golf has never improved upon.',
      'This drop leans into the palette of that week — gorse yellow, sea grey, bleached sand. Most of it came out of Virginia estate lots, where Scottish knitwear has been quietly accumulating in club closets for fifty years; the rest arrived by submission from collectors in the UK.',
    ],
    facts: [
      { k: 'Championship', v: '106th Open Championship' },
      { k: 'Course', v: 'Turnberry, Ailsa' },
      { k: 'Winner', v: 'Tom Watson, 268 (−12)' },
      { k: 'Runner-up', v: 'Jack Nicklaus, 269' },
    ],
    sources: [
      { label: 'The Open — Remembering the Duel in the Sun', url: 'https://www.theopen.com/latest/duel-in-the-sun-nicklaus-vs-watson-at-the-106th-open' },
      { label: '106th Open, Turnberry 1977', url: 'https://www.theopen.com/previous-opens/106th-open-turnberry-1977' },
    ],
  },
  {
    id: 'the-clambake',
    drop: 'File No. 02',
    name: 'The Clambake',
    place: 'Monterey Peninsula, California',
    years: '1947 — 1985',
    status: 'archived',
    statusLabel: 'Archive file',
    releaseNote: 'File published June',
    heroLine: 'Bing put up three thousand dollars of his own money. Golf never recovered.',
    summary:
      'Fog-grey cardigans, cypress-green windcheaters and Monterey pro-am knitwear from the celebrity era at Pebble Beach and Cypress Point.',
    palette: ['#9AA3A0', '#3F5A45', '#D9CFC0'],
    accent: '#3F5A45',
    essay: [
      'Bing Crosby started his pro-am in 1937 near San Diego with three thousand dollars of his own money and an invitation list drawn from his address book. After the war he moved it to the Monterey Peninsula, and the Clambake became the first PGA event played across three courses — Pebble Beach, Cypress Point and Monterey Peninsula Country Club — and the first to be defined by who was in the gallery as much as who was in contention.',
      'Every celebrity tournament that followed borrowed the template: Hope in Palm Springs, Andy Williams in San Diego, Sammy Davis Jr. in Hartford. The Crosby name came off the event after 1985.',
      'The clothing from those decades is the softest in the archive. Monterey in February is cold, wet and grey, and the answer was layered lambswool, unlined cotton shells and the sort of cardigan a man wears with a cigarette and a two-shot lead.',
    ],
    facts: [
      { k: 'Founded', v: '1937, by Bing Crosby' },
      { k: 'Moved to Pebble', v: '1947' },
      { k: 'Courses', v: 'Pebble Beach · Cypress Point · MPCC' },
      { k: 'Crosby name retired', v: 'After 1985' },
    ],
    sources: [
      { label: 'Golf Heritage Society — The Crosby Clambake', url: 'https://www.golfheritage.org/blog/the-crosby-clambake/' },
      { label: 'AT&T Pebble Beach Pro-Am — history', url: 'https://en.wikipedia.org/wiki/AT%26T_Pebble_Beach_Pro-Am' },
    ],
  },
  {
    id: 'georgia-pines',
    drop: 'File No. 03',
    name: 'Georgia Pines',
    place: 'Augusta, Georgia',
    years: '1968 — 1992',
    status: 'archived',
    statusLabel: 'Archive file',
    releaseNote: 'File published April',
    heroLine: 'Pine, azalea and the particular green of a Southern spring.',
    summary:
      'The Southern spring swing — pine-green lambswool, azalea pink piqué and the pastel-on-cream palette of April golf in Georgia.',
    palette: ['#2F4A34', '#D98E9B', '#EFE7D6'],
    accent: '#2F4A34',
    essay: [
      'No week in golf has a stronger colour story. The Southern spring swing runs on a palette that has barely moved in sixty years: pine green, azalea pink, dogwood white and the warm cream of a clubhouse cardigan that has been through thirty launderings.',
      'This collection gathers apparel from the Augusta era of the late sixties through the early nineties — piqué polos with tipped collars, lambswool V-necks worn under blazers, and the cotton-poplin outerwear that Georgia weather demands twice in an afternoon.',
      'Nothing here is tournament-issue. It is the clothing of the week around it: members, patrons, and the men who watched from under the pines.',
    ],
    facts: [
      { k: 'Region', v: 'Augusta & the Southern swing' },
      { k: 'Season', v: 'First full week of April' },
      { k: 'Signature palette', v: 'Pine · azalea · dogwood' },
      { k: 'Dominant fabric', v: 'Lambswool & cotton piqué' },
    ],
    sources: [
      { label: 'Erthe Golf — vintage golf clothing, a style history', url: 'https://erthegolf.com/blogs/news/top-10-best-vintage-golf-clothing-pieces-to-buy-now-a-style-history' },
    ],
  },
  {
    id: 'war-on-the-shore',
    drop: 'File No. 04',
    name: 'War on the Shore',
    place: 'Kiawah Island, South Carolina',
    years: '1979 — 1995',
    status: 'archived',
    statusLabel: 'Archive file',
    releaseNote: 'File published February',
    heroLine: 'Crested sweaters, team stripes, and the most hostile week the Ryder Cup ever had.',
    summary:
      'Team-issue crests and match-play stripes. Ryder Cup–era knitwear from the crested-sweater decades through Kiawah in 1991.',
    palette: ['#1F3352', '#8E2436', '#DED6C6'],
    accent: '#8E2436',
    essay: [
      'Crested sweaters ruled Ryder Cup dressing with an iron fist through the seventies and into the early eighties — a crew or V-neck, a chest crest, a year embroidered underneath, and very little else. The 1981 baby-blue run is the high-water mark of the template.',
      'By 1991 the tone had changed. Kiawah Island — "the War on the Shore" — was the most openly hostile week the match has produced, and the clothing turned with it: block stripes, heavier team shells, visors.',
      'This file is the crest-and-stripe reference: the template we buy against whenever team-issue knitwear surfaces. It anchors the sourcing list for a future Ryder Cup drop.',
    ],
    facts: [
      { k: 'Defining match', v: '1991, Kiawah Island Ocean Course' },
      { k: 'Nickname', v: '“The War on the Shore”' },
      { k: 'Template era', v: 'Crested sweaters, 1971 — 1983' },
      { k: 'Archive status', v: 'Sold through, 9 days' },
    ],
    sources: [
      { label: 'Golf Digest — Ryder Cup uniforms through the years', url: 'https://www.golfdigest.com/story/ryder-cup-us-team-uniforms-through-the-years-golf-style-fashion' },
      { label: 'Ryder Cup — clothing through the years', url: 'https://www.rydercup.com/news-media/ryder-cup-clothing-through-the-years' },
    ],
  },
  {
    id: 'desert-classic',
    drop: 'File No. 05',
    name: 'Desert Classic',
    place: 'Palm Springs, California',
    years: '1965 — 1988',
    status: 'archived',
    statusLabel: 'Archive file',
    releaseNote: 'File published January',
    heroLine: 'Bob Hope, five rounds, and the loudest trousers in the history of the tour.',
    summary:
      'Palm Springs in full colour — mesh knits, terry visors and the polyester slacks that the desert pro-am made unavoidable.',
    palette: ['#D9743F', '#6F7F4E', '#E8D9B5'],
    accent: '#D9743F',
    essay: [
      'Hope ran his desert tournament on the Crosby template and then turned the volume up. Five rounds, four courses, a celebrity field and a Palm Springs colour sense that has aged into something genuinely wonderful.',
      'The desert wardrobe is the most technically interesting era in this archive: open mesh knits built to breathe at 95 degrees, terry-lined visors, and doubleknit polyester trousers in colours no mill would sign off on today.',
      'Wear them as they were worn — flat front, no break, with a knit shirt tucked.',
    ],
    facts: [
      { k: 'Host', v: 'Bob Hope, Palm Springs' },
      { k: 'Format', v: 'Five rounds, multiple courses' },
      { k: 'Signature fabric', v: 'Open mesh & doubleknit' },
      { k: 'Archive status', v: 'Sold through' },
    ],
    sources: [
      { label: 'MyGolfSpy — what happened to celebrity golf tournaments', url: 'https://mygolfspy.com/news-opinion/historys-mysteries-what-happened-to-celebrity-golf-tournaments/' },
    ],
  },
  {
    id: 'the-amateur-line',
    drop: 'File No. 06',
    name: 'The Amateur Line',
    place: 'Walker Cup & the collegiate circuit',
    years: '1971 — 1993',
    status: 'archived',
    statusLabel: 'Archive file',
    releaseNote: 'Research file',
    heroLine: 'The last golf played for nothing at all.',
    summary:
      'Walker Cup and collegiate-issue pieces — heavyweight rugbies, tipped cardigans, blazer-weight knits with university crests.',
    palette: ['#25324F', '#8A6A2F', '#EDE6D8'],
    accent: '#8A6A2F',
    essay: [
      'Amateur golf dresses differently. There are no sponsors on the chest, so the crest does all the work — a university shield, a national badge, a year and nothing more.',
      'This drop pulls from the Walker Cup and the American collegiate circuit between 1971 and 1993: heavyweight cotton rugbies with rubber buttons, tipped lambswool cardigans, and the sort of navy V-neck that has been worn under a blazer for a century.',
      'This file feeds the sourcing list: crested rugbies, tipped cardigans and blazer-weight knits are what we hunt for under it. When enough of the wardrobe is assembled, it becomes a drop.',
    ],
    facts: [
      { k: 'Competition', v: 'Walker Cup & NCAA circuit' },
      { k: 'Marking', v: 'Crest only — no sponsor' },
      { k: 'Status', v: 'Sourcing' },
    ],
    sources: [
      { label: 'Erthe Golf — the return of retro style', url: 'https://erthegolf.com/blogs/news/vintage-golf-clothing-the-return-of-retro-style-in-modern-golf-fashion' },
    ],
  },
];

/* ------------------------------------------------------------------ */
/* Inventory                                                           */
/* ------------------------------------------------------------------ */

const EBAY = (q) => `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(q)}`;
const ETSY = (q) => `https://www.etsy.com/search?q=${encodeURIComponent(q)}`;

export const items = [
  /* ---------------- Duel in the Sun ---------------- */
  {
    id: 'ds-01', collection: 'duel-in-the-sun', garment: 'vest',
    name: 'Cable-Knit Lambswool Slipover', brand: 'Pringle of Scotland', year: '1979',
    category: 'Knitwear', size: 'M', condition: 'Excellent', price: 285,
    colorway: ['#E4CF8E', '#C9B172', '#7C6B3E'], colorName: 'Gorse Yellow',
    story: 'Full-fashioned lambswool slipover in the gorse yellow that Ayrshire wears for two weeks a year. Ribbed V-neck, deep armhole cut for a full shoulder turn.',
    details: ['100% lambswool, full-fashioned', 'Made in Hawick, Scotland', 'Original woven neck label intact', 'No moth, no pilling at the underarm'],
    measurements: { Chest: '21"', Length: '25.5"', Shoulder: '17"' },
    market: { label: 'Comparable Pringle slipovers', url: EBAY('vintage Pringle of Scotland lambswool golf slipover') },
  },
  {
    id: 'ds-02', collection: 'duel-in-the-sun', garment: 'windshirt',
    name: 'Ailsa Links Wind Shirt', brand: 'Slazenger', year: '1981',
    category: 'Outerwear', size: 'L', condition: 'Very Good', price: 240,
    colorway: ['#8C9A93', '#5E6B66', '#2F3A36'], colorName: 'Sea Grey',
    story: 'Unlined cotton-nylon shell with a knit storm collar — the flat, functional links wind shirt that Scottish golf has never had to improve on.',
    details: ['Cotton/nylon shell, unlined', 'Knit storm collar and cuffs', 'Half-zip with brass pull', 'Light wear at the cuff ribs'],
    measurements: { Chest: '23"', Length: '27"', Sleeve: '25"' },
    market: { label: 'Comparable Slazenger shells', url: EBAY('vintage Slazenger golf wind shirt 1980s') },
  },
  {
    id: 'ds-03', collection: 'duel-in-the-sun', garment: 'sweater',
    name: 'Argyle V-Neck, Bleached Sand', brand: 'Lyle & Scott', year: '1977',
    category: 'Knitwear', size: 'M', condition: 'Excellent', price: 320,
    colorway: ['#D8C7A4', '#9A8C63', '#4C5A63'], colorName: 'Bleached Sand',
    story: 'The argyle that every photograph from that July has in the background. Intarsia diamond front, plain back, worn soft.',
    details: ['Intarsia argyle front panel', 'Lambswool, made in Scotland', 'Golden Eagle chest mark', 'Two small reweaves at the hem — noted, priced in'],
    measurements: { Chest: '21.5"', Length: '26"', Sleeve: '24"' },
    market: { label: 'Comparable Lyle & Scott argyles', url: EBAY('vintage Lyle and Scott argyle golf sweater Scotland') },
  },
  {
    id: 'ds-04', collection: 'duel-in-the-sun', garment: 'polo',
    name: 'Tipped Piqué Polo, Claret', brand: 'Izod Lacoste', year: '1978',
    category: 'Shirting', size: 'M', condition: 'Very Good', price: 165,
    colorway: ['#7A2B38', '#D8CEB8', '#3A3730'], colorName: 'Claret',
    story: 'Heavy piqué with a tipped collar and the flat two-button placket of the period. The tennis-to-golf silhouette in its best colour.',
    details: ['Heavyweight cotton piqué', 'Tipped collar and cuff', 'Alligator chest patch, sound', 'Made in USA'],
    measurements: { Chest: '20.5"', Length: '28"', Shoulder: '17.5"' },
    market: { label: 'Comparable Izod Lacoste polos', url: EBAY('vintage Izod Lacoste golf polo 1970s') },
  },
  {
    id: 'ds-05', collection: 'duel-in-the-sun', garment: 'cap',
    name: 'Ayrshire Wool Flat Cap', brand: 'Kangol', year: '1980',
    category: 'Headwear', size: 'One size', condition: 'Excellent', price: 95,
    colorway: ['#6E7168', '#4A4D46', '#B4A98C'], colorName: 'Moss Tweed',
    story: 'Eight-panel wool tweed cap, the standing uniform of a links gallery. Sits low, stays on in a gale.',
    details: ['Wool tweed, eight-panel', 'Satin lining intact', 'Made in Great Britain', 'Brim stiffener sound'],
    measurements: { Circumference: '22.5"' },
    market: { label: 'Comparable wool flat caps', url: EBAY('vintage Kangol wool tweed flat cap made in England') },
  },
  {
    id: 'ds-06', collection: 'duel-in-the-sun', garment: 'trousers',
    name: 'Twill Links Trouser', brand: 'Daks Simpson', year: '1982',
    category: 'Trousers', size: '34 × 30', condition: 'Very Good', price: 210,
    colorway: ['#B9A67F', '#8E7C57', '#3B3730'], colorName: 'Fawn',
    story: 'Cotton twill, flat front, self-belt side adjusters. Cut straight through the thigh with almost no break — exactly right over a spiked shoe.',
    details: ['Cotton twill, flat front', 'Side adjusters, no belt loops', 'Made in England', 'Hem let down once, cleanly'],
    measurements: { Waist: '34"', Inseam: '30"', Leg: '8.5"' },
    market: { label: 'Comparable Daks trousers', url: EBAY('vintage Daks Simpson cotton golf trousers side adjusters') },
  },

  /* ---------------- The Clambake ---------------- */
  {
    id: 'cb-01', collection: 'the-clambake', garment: 'cardigan',
    name: 'Monterey Shawl Cardigan', brand: 'Munsingwear', year: '1968',
    category: 'Knitwear', size: 'L', condition: 'Excellent', price: 340,
    colorway: ['#A7ADA6', '#767E77', '#2F3B33'], colorName: 'Fog Grey',
    story: 'Shawl-collar lambswool with leather-wrapped buttons. February on the Peninsula is cold and wet, and this is the answer.',
    details: ['Lambswool, shawl collar', 'Leather-wrapped buttons, all present', 'Penguin chest mark', 'Made in USA'],
    measurements: { Chest: '23"', Length: '27.5"', Sleeve: '25"' },
    market: { label: 'Comparable Munsingwear cardigans', url: EBAY('vintage Munsingwear shawl collar golf cardigan') },
  },
  {
    id: 'cb-02', collection: 'the-clambake', garment: 'windshirt',
    name: 'Cypress Point Windcheater', brand: 'Baracuta', year: '1972',
    category: 'Outerwear', size: 'M', condition: 'Very Good', price: 425,
    colorway: ['#3F5A45', '#2A3D2F', '#C9BCA1'], colorName: 'Cypress Green',
    story: 'G9 in a deep cypress green with the umbrella-check lining. Standing collar, elasticated cuff, and the only outerwear the Peninsula has ever needed.',
    details: ['Cotton/poly shell, check lining', 'Standing collar with throat latch', 'Made in England', 'Lining sound; one collar-tip crease'],
    measurements: { Chest: '22"', Length: '25"', Sleeve: '24.5"' },
    market: { label: 'Comparable Baracuta G9s', url: EBAY('vintage Baracuta G9 harrington made in England') },
  },
  {
    id: 'cb-03', collection: 'the-clambake', garment: 'sweater',
    name: 'Pro-Am Crew, Abalone', brand: 'Alan Paine', year: '1975',
    category: 'Knitwear', size: 'M', condition: 'Excellent', price: 265,
    colorway: ['#D6CEC0', '#A9A093', '#5C6A5F'], colorName: 'Abalone',
    story: 'Fine-gauge Botany wool crew in a soft shell grey. The layer that goes under everything else in this collection.',
    details: ['Botany wool, fine gauge', 'Made in England', 'Ribbed crew, deep cuff', 'No repairs'],
    measurements: { Chest: '21"', Length: '25.5"', Sleeve: '24"' },
    market: { label: 'Comparable Alan Paine knits', url: EBAY('vintage Alan Paine botany wool golf sweater England') },
  },
  {
    id: 'cb-04', collection: 'the-clambake', garment: 'polo',
    name: 'Clambake Mesh Knit', brand: 'Munsingwear Grand Slam', year: '1974',
    category: 'Shirting', size: 'L', condition: 'Very Good', price: 155,
    colorway: ['#C8CDC5', '#7C8A7E', '#38423A'], colorName: 'Sea Mist',
    story: 'Open mesh knit with a self collar — cool enough for a warm round, dense enough to layer under the cardigan when the fog comes back in.',
    details: ['Open mesh cotton knit', 'Grand Slam placket', 'Made in USA', 'Even fade, no holes'],
    measurements: { Chest: '22"', Length: '29"', Shoulder: '18"' },
    market: { label: 'Comparable Grand Slam knits', url: ETSY('vintage Munsingwear Grand Slam mesh golf shirt') },
  },
  {
    id: 'cb-05', collection: 'the-clambake', garment: 'jacket',
    name: 'Peninsula Rain Shell', brand: 'Peter Storm', year: '1979',
    category: 'Outerwear', size: 'L', condition: 'Good', price: 185,
    colorway: ['#5B6B72', '#39464C', '#D2C7B0'], colorName: 'Harbour Blue',
    story: 'Half-zip cagoule with a drawcord hood, folded into its own chest pocket. Honest, unglamorous, and the reason anybody finished the 1979 field.',
    details: ['Coated nylon, half-zip cagoule', 'Packs into chest pocket', 'Made in England', 'Coating crazed at the shoulder — sold as-is'],
    measurements: { Chest: '24"', Length: '30"', Sleeve: '25"' },
    market: { label: 'Comparable cagoules', url: EBAY('vintage Peter Storm cagoule packable made in England') },
  },
  {
    id: 'cb-06', collection: 'the-clambake', garment: 'cap',
    name: 'Houndstooth Golf Cap', brand: 'Hanna Hats', year: '1977',
    category: 'Headwear', size: 'One size', condition: 'Excellent', price: 110,
    colorway: ['#DCD6C8', '#4A4A44', '#8B8577'], colorName: 'Houndstooth',
    story: 'Irish wool houndstooth in the small-scale pattern that reads as texture from ten feet. Unstructured, packable, correct.',
    details: ['Irish wool houndstooth', 'Unstructured crown', 'Made in Donegal', 'Sweatband clean'],
    measurements: { Circumference: '22"' },
    market: { label: 'Comparable Irish wool caps', url: ETSY('vintage Irish wool houndstooth golf cap Donegal') },
  },

  /* ---------------- Georgia Pines ---------------- */
  {
    id: 'gp-01', collection: 'georgia-pines', garment: 'sweater',
    name: 'Pine Green Lambswool V-Neck', brand: 'Ralph Lauren Golf', year: '1989',
    category: 'Knitwear', size: 'M', condition: 'Excellent', price: 295,
    colorway: ['#2F4A34', '#1F3324', '#E3D9C4'], colorName: 'Pine Green',
    story: 'Deep pine lambswool, cut trim, worn under a blazer for thirty years and it shows nowhere. The single most useful sweater in this archive.',
    details: ['Lambswool, two-ply', 'Embroidered chest mark', 'Original label, Hong Kong', 'No pilling, no repairs'],
    measurements: { Chest: '21"', Length: '26"', Sleeve: '24.5"' },
    market: { label: 'Comparable RL Golf knits', url: EBAY('vintage Ralph Lauren golf lambswool v-neck sweater') },
  },
  {
    id: 'gp-02', collection: 'georgia-pines', garment: 'polo',
    name: 'Azalea Piqué Polo', brand: 'Izod', year: '1985',
    category: 'Shirting', size: 'M', condition: 'Excellent', price: 145,
    colorway: ['#D98E9B', '#B96D7C', '#EFE7D6'], colorName: 'Azalea',
    story: 'Full azalea pink in heavyweight piqué. It is a loud colour worn quietly — flat collar, no branding beyond the chest.',
    details: ['Heavyweight cotton piqué', 'Two-button placket, flat collar', 'Made in USA', 'Colour true, no sun stripe'],
    measurements: { Chest: '20.5"', Length: '28.5"', Shoulder: '17.5"' },
    market: { label: 'Comparable Izod polos', url: EBAY('vintage Izod pink pique golf polo made in USA') },
  },
  {
    id: 'gp-03', collection: 'georgia-pines', garment: 'cardigan',
    name: 'Dogwood Cotton Cardigan', brand: 'Brooks Brothers', year: '1978',
    category: 'Knitwear', size: 'L', condition: 'Very Good', price: 250,
    colorway: ['#EFE7D6', '#CFC3A8', '#2F4A34'], colorName: 'Dogwood Cream',
    story: 'Cotton cardigan in clubhouse cream with a pine-green tip at the neck and cuff. Spring golf in a single garment.',
    details: ['Cotton, tipped rib', 'Mother-of-pearl buttons', 'Made in USA', 'One button replaced, matched'],
    measurements: { Chest: '22.5"', Length: '27"', Sleeve: '25"' },
    market: { label: 'Comparable tipped cardigans', url: EBAY('vintage Brooks Brothers cotton tipped cardigan tennis golf') },
  },
  {
    id: 'gp-04', collection: 'georgia-pines', garment: 'jacket',
    name: 'Poplin Clubhouse Jacket', brand: 'London Fog', year: '1972',
    category: 'Outerwear', size: 'L', condition: 'Very Good', price: 230,
    colorway: ['#C2B295', '#96876B', '#2F4A34'], colorName: 'Sand Poplin',
    story: 'Cotton poplin with a knit collar and slash pockets. Georgia weather changes twice an afternoon and this covers both halves.',
    details: ['Cotton poplin, unlined body', 'Knit collar and cuffs', 'Made in USA', 'Cuff ribs relaxed'],
    measurements: { Chest: '23.5"', Length: '27"', Sleeve: '25"' },
    market: { label: 'Comparable poplin jackets', url: EBAY('vintage London Fog cotton golf jacket knit collar') },
  },
  {
    id: 'gp-05', collection: 'georgia-pines', garment: 'trousers',
    name: 'Cream Cotton Golf Trouser', brand: 'Corbin', year: '1976',
    category: 'Trousers', size: '32 × 31', condition: 'Excellent', price: 195,
    colorway: ['#E5DAC1', '#C0B393', '#3B3730'], colorName: 'Clubhouse Cream',
    story: 'Flat-front cotton in a warm cream, cut with a proper rise. Wears with everything else in this drop and most of the last one.',
    details: ['Cotton, flat front', 'Full rise, straight leg', 'Made in USA', 'Unaltered, original hem'],
    measurements: { Waist: '32"', Inseam: '31"', Rise: '12"' },
    market: { label: 'Comparable trad trousers', url: EBAY('vintage Corbin cotton flat front trousers made in USA') },
  },
  {
    id: 'gp-06', collection: 'georgia-pines', garment: 'vest',
    name: 'Pine & Cream Argyle Slipover', brand: 'Lord Jeff', year: '1971',
    category: 'Knitwear', size: 'M', condition: 'Very Good', price: 175,
    colorway: ['#EFE7D6', '#2F4A34', '#D98E9B'], colorName: 'Pine on Cream',
    story: 'Cream ground, pine diamonds, a single azalea overline. The colour story of this entire collection in one slipover.',
    details: ['Wool intarsia argyle', 'Ribbed V-neck and armhole', 'Made in USA', 'One small reweave at the back hem'],
    measurements: { Chest: '20.5"', Length: '25"', Shoulder: '16.5"' },
    market: { label: 'Comparable argyle slipovers', url: ETSY('vintage argyle golf sweater vest wool cream green') },
  },

  /* ---------------- War on the Shore ---------------- */
  {
    id: 'ws-01', collection: 'war-on-the-shore', garment: 'sweater',
    name: 'Crested Team Crew, 1983', brand: 'Glenmuir', year: '1983',
    category: 'Knitwear', size: 'L', condition: 'Excellent', price: 385, sold: true,
    colorway: ['#1F3352', '#152540', '#C9A961'], colorName: 'Team Navy',
    story: 'The crested-sweater template at its peak: crew neck, chest crest, year underneath, nothing else. Made in Lanark for the match era.',
    details: ['Lambswool, made in Scotland', 'Embroidered chest crest', 'Original crest, not reapplied', 'Sold — archive reference'],
    measurements: { Chest: '23"', Length: '26.5"', Sleeve: '25"' },
    market: { label: 'Comparable crested knits', url: EBAY('vintage Glenmuir crested golf sweater made in Scotland') },
  },
  {
    id: 'ws-02', collection: 'war-on-the-shore', garment: 'windshirt',
    name: 'Ocean Course Team Shell', brand: 'Sunderland of Scotland', year: '1991',
    category: 'Outerwear', size: 'M', condition: 'Very Good', price: 295, sold: true,
    colorway: ['#8E2436', '#6A1A28', '#DED6C6'], colorName: 'Cardinal',
    story: 'Block-striped team shell from the year the match turned hostile. Half-zip, storm flap, and a colour that carries across a fairway.',
    details: ['Waterproof shell, half-zip', 'Block stripe at chest', 'Made in Glasgow', 'Sold — archive reference'],
    measurements: { Chest: '22"', Length: '27"', Sleeve: '25"' },
    market: { label: 'Comparable Sunderland shells', url: EBAY('vintage Sunderland of Scotland golf jacket 1990s') },
  },
  {
    id: 'ws-03', collection: 'war-on-the-shore', garment: 'polo',
    name: 'Match Play Block Stripe', brand: 'Antigua', year: '1991',
    category: 'Shirting', size: 'L', condition: 'Very Good', price: 130, sold: true,
    colorway: ['#DED6C6', '#1F3352', '#8E2436'], colorName: 'Match Stripe',
    story: 'Wide block stripes in team navy and cardinal on a stone ground. Nineties cut — long body, generous shoulder.',
    details: ['Cotton jersey, engineered stripe', 'Three-button placket', 'Made in USA', 'Sold — archive reference'],
    measurements: { Chest: '23"', Length: '30"', Shoulder: '19"' },
    market: { label: 'Comparable striped golf polos', url: EBAY('vintage 1990s block stripe golf polo shirt') },
  },
  {
    id: 'ws-04', collection: 'war-on-the-shore', garment: 'vest',
    name: 'Crested Slipover, Baby Blue', brand: 'Pringle of Scotland', year: '1981',
    category: 'Knitwear', size: 'M', condition: 'Excellent', price: 310, sold: true,
    colorway: ['#A8C0D6', '#7A9BB8', '#1F3352'], colorName: 'Baby Blue',
    story: 'The 1981 colourway. Baby-blue lambswool slipover with a navy crest — the single most photographed sweater of the crested era.',
    details: ['Lambswool, full-fashioned', 'Navy embroidered crest', 'Made in Hawick', 'Sold — archive reference'],
    measurements: { Chest: '21"', Length: '25"', Shoulder: '17"' },
    market: { label: 'Comparable Pringle slipovers', url: EBAY('vintage Pringle crested golf slipover baby blue') },
  },
  {
    id: 'ws-05', collection: 'war-on-the-shore', garment: 'cap',
    name: 'Team Visor, Cardinal', brand: 'Ahead', year: '1993',
    category: 'Headwear', size: 'One size', condition: 'Very Good', price: 75, sold: true,
    colorway: ['#8E2436', '#DED6C6', '#1F3352'], colorName: 'Cardinal',
    story: 'Rolled-brim visor, terry sweatband, chest-crest colours. Nineties team-issue and instantly of its decade.',
    details: ['Cotton twill, rolled brim', 'Terry sweatband', 'Adjustable back strap', 'Sold — archive reference'],
    measurements: { Circumference: 'Adjustable' },
    market: { label: 'Comparable team visors', url: ETSY('vintage 1990s golf visor terry sweatband') },
  },
  {
    id: 'ws-06', collection: 'war-on-the-shore', garment: 'jacket',
    name: 'Crested Blouson', brand: 'Burberrys', year: '1986',
    category: 'Outerwear', size: 'L', condition: 'Excellent', price: 465, sold: true,
    colorway: ['#DED6C6', '#B4A88E', '#1F3352'], colorName: 'Stone',
    story: 'Cotton blouson in stone with a knit hem and a navy crest at the chest. The one piece in this drop that works entirely off the course.',
    details: ['Cotton gabardine blouson', 'Check-lined body', 'Made in England', 'Sold — archive reference'],
    measurements: { Chest: '24"', Length: '26"', Sleeve: '25.5"' },
    market: { label: 'Comparable blousons', url: EBAY('vintage Burberrys cotton blouson jacket made in England') },
  },

  /* ---------------- Desert Classic ---------------- */
  {
    id: 'dc-01', collection: 'desert-classic', garment: 'polo',
    name: 'Open Mesh Knit, Sunset', brand: 'Jack Nicklaus', year: '1976',
    category: 'Shirting', size: 'L', condition: 'Very Good', price: 140, sold: true,
    colorway: ['#D9743F', '#B85C2E', '#E8D9B5'], colorName: 'Sunset Coral',
    story: 'Wide open mesh built to breathe at ninety-five degrees. Bear mark at the chest, self collar, long body.',
    details: ['Open mesh knit', 'Golden Bear chest mark', 'Made in USA', 'Sold — archive reference'],
    measurements: { Chest: '22"', Length: '29"', Shoulder: '18.5"' },
    market: { label: 'Comparable mesh knits', url: EBAY('vintage Jack Nicklaus golden bear mesh golf shirt') },
  },
  {
    id: 'dc-02', collection: 'desert-classic', garment: 'trousers',
    name: 'Doubleknit Desert Slack', brand: 'Haggar', year: '1974',
    category: 'Trousers', size: '34 × 30', condition: 'Excellent', price: 165, sold: true,
    colorway: ['#6F7F4E', '#55633B', '#E8D9B5'], colorName: 'Saguaro',
    story: 'Polyester doubleknit in a green no mill would sign off on now. Flat front, wide belt loops, sharp permanent crease.',
    details: ['Polyester doubleknit', 'Permanent crease intact', 'Made in USA', 'Sold — archive reference'],
    measurements: { Waist: '34"', Inseam: '30"', Leg: '9"' },
    market: { label: 'Comparable doubleknit slacks', url: ETSY('vintage 1970s polyester doubleknit golf slacks') },
  },
  {
    id: 'dc-03', collection: 'desert-classic', garment: 'cap',
    name: 'Terry-Lined Desert Visor', brand: 'Titleist', year: '1982',
    category: 'Headwear', size: 'One size', condition: 'Very Good', price: 65, sold: true,
    colorway: ['#E8D9B5', '#D9743F', '#6F7F4E'], colorName: 'Sand',
    story: 'Wide-brim visor with a full terry lining. Palm Springs practical, and the most-worn shape of the desert decade.',
    details: ['Cotton twill, wide brim', 'Full terry lining', 'Adjustable strap', 'Sold — archive reference'],
    measurements: { Circumference: 'Adjustable' },
    market: { label: 'Comparable golf visors', url: EBAY('vintage Titleist golf visor 1980s terry') },
  },
  {
    id: 'dc-04', collection: 'desert-classic', garment: 'windshirt',
    name: 'Palm Springs Warm-Up', brand: 'Adidas', year: '1985',
    category: 'Outerwear', size: 'M', condition: 'Good', price: 175, sold: true,
    colorway: ['#E8D9B5', '#D9743F', '#3D4A55'], colorName: 'Desert Stripe',
    story: 'Nylon warm-up shell with triple-stripe sleeves in coral on sand. Loud, light, and correct for the tournament it came from.',
    details: ['Nylon shell, mesh-lined body', 'Triple stripe sleeve', 'Made in West Germany', 'Sold — archive reference'],
    measurements: { Chest: '22"', Length: '26"', Sleeve: '24"' },
    market: { label: 'Comparable warm-up shells', url: EBAY('vintage adidas nylon track jacket west germany 1980s') },
  },
  {
    id: 'dc-05', collection: 'desert-classic', garment: 'sweater',
    name: 'Desert Crew, Cactus', brand: 'Robert Bruce', year: '1970',
    category: 'Knitwear', size: 'M', condition: 'Very Good', price: 155, sold: true,
    colorway: ['#6F7F4E', '#4F5C38', '#E8D9B5'], colorName: 'Cactus',
    story: 'Light acrylic-wool crew for a desert evening — the layer that came out of the cart bag when the sun went behind the mountains.',
    details: ['Acrylic/wool blend, fine gauge', 'Ribbed crew and cuff', 'Made in USA', 'Sold — archive reference'],
    measurements: { Chest: '21"', Length: '25.5"', Sleeve: '24"' },
    market: { label: 'Comparable 70s crews', url: ETSY('vintage 1970s golf sweater crew neck green') },
  },
  {
    id: 'dc-06', collection: 'desert-classic', garment: 'cardigan',
    name: 'Clubhouse Cardigan, Coral', brand: 'Puritan', year: '1973',
    category: 'Knitwear', size: 'L', condition: 'Good', price: 145, sold: true,
    colorway: ['#D9743F', '#A85A31', '#E8D9B5'], colorName: 'Coral',
    story: 'Button-through cardigan in full coral with contrast tipping. Palm Springs at seven in the evening, drink in hand.',
    details: ['Acrylic knit, button through', 'Contrast tipped rib', 'Made in USA', 'Sold — archive reference'],
    measurements: { Chest: '23"', Length: '27"', Sleeve: '25"' },
    market: { label: 'Comparable 70s cardigans', url: ETSY('vintage 1970s tipped cardigan sweater orange') },
  },

  /* ---------------- The Amateur Line ---------------- */
  {
    id: 'al-01', collection: 'the-amateur-line', garment: 'rugby',
    name: 'Heavyweight Crest Rugby', brand: 'Barbarian', year: '1988',
    category: 'Shirting', size: 'L', condition: 'Excellent', price: 220, upcoming: true,
    colorway: ['#25324F', '#EDE6D8', '#8A6A2F'], colorName: 'Navy & Cream',
    story: 'Twelve-ounce cotton, rubber buttons, twill neck reinforcement. Built for a sport it was never used for and better for it.',
    details: ['12oz cotton jersey', 'Rubber buttons, twill placket', 'Made in Canada', 'Catalogue record'],
    measurements: { Chest: '23.5"', Length: '29"', Sleeve: '25"' },
    market: { label: 'Comparable heavyweight rugbies', url: EBAY('vintage Barbarian rugby shirt made in Canada heavyweight') },
  },
  {
    id: 'al-02', collection: 'the-amateur-line', garment: 'cardigan',
    name: 'Tipped Lambswool Cardigan', brand: 'Peter Scott', year: '1979',
    category: 'Knitwear', size: 'M', condition: 'Excellent', price: 275, upcoming: true,
    colorway: ['#EDE6D8', '#25324F', '#8A6A2F'], colorName: 'Cream & Navy',
    story: 'Cricket-tipped lambswool cardigan, navy and gold at the V and cuff. Amateur golf, university lawn, blazer weather.',
    details: ['Lambswool, cricket tipping', 'Made in Hawick, Scotland', 'Original horn buttons', 'Catalogue record'],
    measurements: { Chest: '21.5"', Length: '27"', Sleeve: '24.5"' },
    market: { label: 'Comparable tipped cardigans', url: EBAY('vintage cricket cardigan lambswool tipped made in Scotland') },
  },
  {
    id: 'al-03', collection: 'the-amateur-line', garment: 'sweater',
    name: 'University Crest V-Neck', brand: 'Champion', year: '1984',
    category: 'Knitwear', size: 'L', condition: 'Very Good', price: 190, upcoming: true,
    colorway: ['#25324F', '#1A2338', '#8A6A2F'], colorName: 'Collegiate Navy',
    story: 'Navy V-neck with a chain-stitched university shield at the chest. No sponsor, no logo — the crest does all the work.',
    details: ['Wool blend, V-neck', 'Chain-stitch crest', 'Made in USA', 'Catalogue record'],
    measurements: { Chest: '22.5"', Length: '26.5"', Sleeve: '25"' },
    market: { label: 'Comparable crest knits', url: ETSY('vintage collegiate crest v-neck sweater navy') },
  },
  {
    id: 'al-04', collection: 'the-amateur-line', garment: 'jacket',
    name: 'Walker Cup Era Blazer Shell', brand: 'Gant', year: '1976',
    category: 'Outerwear', size: 'M', condition: 'Excellent', price: 310, upcoming: true,
    colorway: ['#25324F', '#EDE6D8', '#8A6A2F'], colorName: 'Match Navy',
    story: 'Unstructured cotton shell cut on blazer lines — patch pockets, three buttons, no padding. Wears as a jacket, packs like a shirt.',
    details: ['Cotton poplin, unstructured', 'Patch pockets, three button', 'Made in USA', 'Catalogue record'],
    measurements: { Chest: '22"', Length: '28"', Sleeve: '24.5"' },
    market: { label: 'Comparable unstructured shells', url: EBAY('vintage Gant cotton unstructured blazer jacket made in USA') },
  },
  {
    id: 'al-05', collection: 'the-amateur-line', garment: 'polo',
    name: 'Amateur Piqué, Cream', brand: 'Fred Perry', year: '1981',
    category: 'Shirting', size: 'M', condition: 'Very Good', price: 135, upcoming: true,
    colorway: ['#EDE6D8', '#25324F', '#8A6A2F'], colorName: 'Cream & Gold',
    story: 'Twin-tipped piqué in cream with navy and gold at the collar. The tennis-to-golf crossover in its most restrained form.',
    details: ['Cotton piqué, twin tipped', 'Laurel wreath chest mark', 'Made in England', 'Catalogue record'],
    measurements: { Chest: '20.5"', Length: '27.5"', Shoulder: '17"' },
    market: { label: 'Comparable Fred Perry piqué', url: EBAY('vintage Fred Perry twin tipped polo made in England') },
  },
  {
    id: 'al-06', collection: 'the-amateur-line', garment: 'trousers',
    name: 'Collegiate Flannel Trouser', brand: 'Southwick', year: '1973',
    category: 'Trousers', size: '33 × 31', condition: 'Excellent', price: 240, upcoming: true,
    colorway: ['#5D6470', '#454B55', '#EDE6D8'], colorName: 'Grey Flannel',
    story: 'Mid-grey flannel, flat front, full rise. Autumn amateur golf, then straight into the clubhouse without changing.',
    details: ['Wool flannel, flat front', 'Full rise, cuffed hem', 'Made in USA', 'Catalogue record'],
    measurements: { Waist: '33"', Inseam: '31"', Rise: '12.5"' },
    market: { label: 'Comparable flannel trousers', url: EBAY('vintage Southwick grey flannel trousers made in USA') },
  },
];

/* ------------------------------------------------------------------ */
/* Journal — editorial                                                 */
/* ------------------------------------------------------------------ */

export const journal = [
  {
    id: 'reading-a-neck-label',
    title: 'Reading a Neck Label',
    kicker: 'Authentication',
    date: 'July 2026',
    excerpt: 'Country of manufacture, fibre content and the shape of the typography will date a sweater within five years. Here is how we do it.',
    body: [
      'Nearly everything we buy is dated from the neck label before it is dated from the garment. A Scottish knit with a woven "Made in Hawick" and a two-line fibre content sits in a narrow window. Once the fibre content moves to a separate care tag, you are past it.',
      'American sportswear is easier still. Union labels changed shape at known dates, and the shift from "Made in USA" alone to a country-plus-RN number is a hard boundary.',
      'None of this is conclusive on its own. We buy on three agreements: label, construction, and the way the garment has aged. Two out of three is not a purchase.',
    ],
  },
  {
    id: 'the-case-for-the-slipover',
    title: 'The Case for the Slipover',
    kicker: 'Style',
    date: 'June 2026',
    excerpt: 'The sleeveless V-neck is the most useful thing in golf and the hardest to wear badly. An argument, in four parts.',
    body: [
      'The slipover solves the only real problem in golf dressing: you need warmth on the body and total freedom at the shoulder. A sweater vest gives you both, and it is the reason the shape has not meaningfully changed since the 1920s.',
      'Fit is the whole game. The armhole should sit close enough to show the shirt sleeve cleanly, and the hem should finish at the belt — not below it.',
      'Buy them in lambswool, buy them one size down from your sweater size, and buy them in colours that have already been washed out by the sun.',
    ],
  },
  {
    id: 'sourcing-in-virginia',
    title: 'Sourcing in Virginia',
    kicker: 'Field Notes',
    date: 'May 2026',
    excerpt: 'Nine days, four thrift stores a town, and the reason a mid-Atlantic state is the backbone of this archive.',
    body: [
      'Virginia is the best sourcing ground in America for golf apparel, for an unglamorous reason: the state has been playing this game since the 1890s, the money that played it stayed put, and the closets were never cleared out. What ends up in a church sale in Richmond or an estate lot outside Charlottesville is the wardrobe of somebody who belonged to a club for forty years.',
      'We work a route rather than a search — the Tidewater, then up through Richmond, Charlottesville and into the Shenandoah — and we buy on fibre and finish before we buy on label. The find of this trip was a full-fashioned slipover with a hand-linked neck, sitting on a rail at four dollars.',
      'The rest we do not walk to. Submissions come in from everywhere — Scotland, Japan, a garage in Adelaide — and we appraise them the same way and pay outright. If you have something, send photographs.',
    ],
  },
];

/* ------------------------------------------------------------------ */
/* Derived helpers                                                     */
/* ------------------------------------------------------------------ */

export const getCollection = (id) => collections.find((c) => c.id === id) || null;
export const getItem = (id) => items.find((i) => i.id === id) || null;
export const itemsIn = (collectionId) => items.filter((i) => i.collection === collectionId);
export const getJournal = (id) => journal.find((j) => j.id === id) || null;

export const isAvailable = (item) => !item.sold && !item.upcoming;
export const itemStatus = (item) =>
  item.sold ? 'Sold' : item.upcoming ? 'Reserved for the drop' : 'Available — 1 of 1';

export const categories = [...new Set(items.map((i) => i.category))].sort();
export const eras = ['1968 — 1975', '1976 — 1983', '1984 — 1993', '1994 — 2005', 'Modern'];
export const eraOf = (item) => {
  // "1979" and "1990s" both date a garment; Number("1990s") is NaN, and the
  // old fall-through filed 2010s fleece under 1984–1993.
  const y = Number(String(item.year).match(/(19|20)\d{2}/)?.[0]);
  if (!Number.isFinite(y)) return null;
  if (y <= 1975) return eras[0];
  if (y <= 1983) return eras[1];
  if (y <= 1993) return eras[2];
  if (y <= 2005) return eras[3];
  return eras[4];
};

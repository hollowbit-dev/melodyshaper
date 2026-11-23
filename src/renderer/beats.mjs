// Drum presets: the common, generic grooves of each style. Each line is one bar on the sixteenth-note grid.
const k = (kick, snare, hat, extra = {}) => ({ ...(kick ? { kick } : {}), ...(snare ? { snare } : {}), ...(hat ? { hat } : {}), ...extra });
const EIGHTS = 'x.x.x.x.x.x.x.x.', SIXTEENS = 'xxxxxxxxxxxxxxxx', QUARTERS = 'x...x...x...x...', OFFBEATS = '..x...x...x...x.', BACKBEAT = '....x.......x...';

const LIBRARY_44 = [
  ['Pop', [
    ['pop1', 'Pop straight', k('x.......x.......', BACKBEAT, EIGHTS)],
    ['pop2', 'Pop bounce', k('x.....x.x.......', BACKBEAT, EIGHTS)],
    ['pop3', 'Pop clap', { kick: 'x.......x.x.....', clap: BACKBEAT, hat: EIGHTS }],
    ['pop4', 'Synth pop', { kick: QUARTERS, snare: BACKBEAT, hat: OFFBEATS, tamb: '....x.......x...' }],
    ['pop5', 'Indie pop', k('x..x....x.......', BACKBEAT, SIXTEENS)],
    ['pop6', 'Power ballad', { kick: 'x.......x.......', snare: '........x.......', ride: QUARTERS }],
    ['pop7', 'Tambourine pop', { kick: 'x.....x...x.....', snare: BACKBEAT, tamb: EIGHTS }],
    ['pop8', 'Soft ballad', { kick: 'x.........x.....', rim: BACKBEAT, shaker: EIGHTS }],
  ]],
  ['Rock', [
    ['rock1', 'Rock eighths', k('x.......x.x.....', BACKBEAT, EIGHTS)],
    ['rock2', 'Driving rock', k('x.x.....x.x.....', BACKBEAT, EIGHTS)],
    ['rock3', 'Open hat rock', { kick: 'x.......x.x.....', snare: BACKBEAT, openhat: EIGHTS }],
    ['rock4', 'Punk', k('x.x.x.x.x.x.x.x.', BACKBEAT, EIGHTS)],
    ['rock5', 'Hard rock', { kick: 'x..x..x.x.......', snare: BACKBEAT, ride: EIGHTS }],
    ['rock6', 'Metal gallop', k('x.xxx.xxx.xxx.xx', BACKBEAT, QUARTERS)],
    ['rock7', 'Tom groove', { kick: 'x.....x.x.......', snare: BACKBEAT, tom: '..x.......x.....', lowtom: '......x.......x.' }],
    ['rock8', 'Half-time rock', k('x.....x...x.....', '........x.......', EIGHTS)],
  ]],
  ['Funk', [
    ['funk1', 'Funk sixteenths', k('x..x..x...x.....', '....x..x.x..x...', SIXTEENS)],
    ['funk2', 'Syncopated funk', k('x.x...x..x......', '....x.......x..x', SIXTEENS)],
    ['funk3', 'Ghost notes', { kick: 'x......x..x.....', snare: '....x..x.x..x.x.', hat: EIGHTS }],
    ['funk4', 'Open hat funk', { kick: 'x..x....x.x.....', snare: BACKBEAT, hat: 'x.x.x.x.x.x.x...', openhat: '..............x.' }],
    ['funk5', 'Disco funk', { kick: QUARTERS, snare: BACKBEAT, hat: EIGHTS, openhat: OFFBEATS }],
    ['funk6', 'Cowbell funk', { kick: 'x..x..x...x.....', snare: BACKBEAT, cowbell: QUARTERS, hat: EIGHTS }],
    ['funk7', 'Linear funk', { kick: 'x.....x...x.....', snare: '....x.....x.x...', hat: '..x.x...x...x.x.' }],
  ]],
  ['Hip-hop', [
    ['hh1', 'Boom bap', k('x......x..x.....', BACKBEAT, EIGHTS)],
    ['hh2', 'Lazy boom bap', k('x.........xx....', BACKBEAT, EIGHTS)],
    ['hh3', 'Rim hip-hop', { kick: 'x.....x...x.....', rim: BACKBEAT, hat: EIGHTS }],
    ['hh4', 'Trap', { kick: 'x.....x.......x.', clap: '........x.......', hat: 'x.x.xxx.x.x.xxxx' }],
    ['hh5', 'Trap rolls', { kick: 'x..x......x.....', snare: '........x.......', hat: SIXTEENS }],
    ['hh6', 'Drill', { kick: 'x.....x...x..x..', snare: '...x....x.......', hat: 'x..x..x.x..x..x.' }],
    ['hh7', 'Lo-fi', { kick: 'x.......x.x.....', rim: BACKBEAT, shaker: EIGHTS }],
    ['hh8', 'Old school', { kick: 'x.......x..x....', clap: BACKBEAT, hat: EIGHTS, cowbell: '..x.......x.....' }],
  ]],
  ['R&B and soul', [
    ['rnb1', 'Slow jam', { kick: 'x.........x.....', snare: BACKBEAT, hat: EIGHTS, shaker: OFFBEATS }],
    ['rnb2', 'Neo soul', { kick: 'x......x..x.....', rim: '....x..x....x...', hat: EIGHTS }],
    ['rnb3', 'Modern R&B', { kick: 'x..x......x.....', clap: BACKBEAT, hat: 'x.x.xxx.x.x.x.xx' }],
    ['rnb4', 'Motown', { kick: 'x...x...x...x...', snare: BACKBEAT, tamb: BACKBEAT, hat: EIGHTS }],
    ['rnb5', 'Gospel', { kick: 'x.....x.x.......', snare: BACKBEAT, clap: BACKBEAT, ride: EIGHTS }],
    ['rnb6', 'Shuffle soul', { kick: 'x.....x.x.......', snare: BACKBEAT, hat: 'x..xx..xx..xx..x' }],
  ]],
  ['Dance', [
    ['dance1', 'House', { kick: QUARTERS, clap: BACKBEAT, hat: OFFBEATS }],
    ['dance2', 'Deep house', { kick: QUARTERS, rim: '...x..x....x..x.', hat: OFFBEATS, shaker: SIXTEENS }],
    ['dance3', 'Techno', { kick: QUARTERS, rim: '......x.......x.', openhat: OFFBEATS, hat: SIXTEENS }],
    ['dance4', 'Disco', { kick: QUARTERS, snare: BACKBEAT, openhat: OFFBEATS, hat: EIGHTS }],
    ['dance5', 'Trance', { kick: QUARTERS, clap: BACKBEAT, openhat: OFFBEATS, ride: QUARTERS }],
    ['dance6', 'UK garage', { kick: 'x.....x...x.....', snare: BACKBEAT, hat: '..x..x....x..x..' }],
    ['dance7', 'Breakbeat', { kick: 'x.x.......x.....', snare: '....x..x.x..x...', hat: EIGHTS }],
    ['dance8', 'Drum and bass', { kick: 'x.........x.....', snare: '....x..x.....x..', hat: EIGHTS }],
    ['dance9', 'Dubstep', { kick: 'x.........x.....', snare: '........x.......', hat: 'x..x..x..x..x.x.' }],
  ]],
  ['Latin', [
    ['latin1', 'Reggaeton', { kick: QUARTERS, snare: '...x..x....x..x.', hat: EIGHTS }],
    ['latin2', 'Bossa nova', { kick: 'x..x....x..x....', rim: 'x..x..x...x..x..', shaker: EIGHTS }],
    ['latin3', 'Samba', { kick: 'x..xx..xx..xx..x', tamb: 'x.xxx.xxx.xxx.xx', agogo: 'x..x..x...x.x...' }],
    ['latin4', 'Salsa', { claves: 'x..x..x...x.x...', conga: '..xx......xx....', lowconga: '......xx......xx', cowbell: QUARTERS }],
    ['latin5', 'Cha-cha', { kick: 'x.......x.......', conga: '......xx......xx', guiro: QUARTERS, cowbell: QUARTERS }],
    ['latin6', 'Rumba', { claves: 'x..x...x..x.x...', lowconga: '...x.......x....', conga: '......x.......x.', shaker: EIGHTS }],
    ['latin7', 'Mambo', { kick: '...x..x....x..x.', cowbell: EIGHTS, bongo: 'xx..xx..xx..xx..', claves: '..x.x...x..x..x.' }],
    ['latin8', 'Cumbia', { kick: 'x.......x.......', guiro: 'x.xxx.xxx.xxx.xx', lowconga: '....x.......x...', conga: '......x.......x.' }],
  ]],
  ['Reggae and island', [
    ['reg1', 'One drop', { kick: '........x.......', rim: '........x.......', hat: EIGHTS }],
    ['reg2', 'Rockers', { kick: QUARTERS, rim: '........x.......', hat: OFFBEATS }],
    ['reg3', 'Steppers', { kick: QUARTERS, snare: '..x...x...x...x.', hat: EIGHTS }],
    ['reg4', 'Ska', { kick: 'x.......x.......', snare: BACKBEAT, hat: OFFBEATS }],
    ['reg5', 'Dancehall', { kick: 'x..x..x.x..x..x.', snare: '...x..x....x..x.', hat: EIGHTS }],
    ['reg6', 'Afrobeats', { kick: 'x..x....x..x....', rim: '...x..x....x..x.', shaker: SIXTEENS, conga: '......x.......x.' }],
  ]],
  ['Jazz and blues', [
    ['jazz1', 'Swing ride', { ride: 'x...x..xx...x..x', hat: BACKBEAT, kick: 'x.......x.......' }],
    ['jazz2', 'Bebop', { ride: 'x...x..xx...x..x', hat: BACKBEAT, snare: '.......x...x....', kick: '..........x.....' }],
    ['jazz3', 'Jazz ballad', { ride: QUARTERS, rim: '............x...', kick: 'x...............' }],
    ['jazz4', 'Blues shuffle', { kick: 'x.....x.x.....x.', snare: BACKBEAT, hat: 'x..xx..xx..xx..x' }],
    ['jazz5', 'Slow blues', { kick: 'x.......x.......', snare: BACKBEAT, ride: 'x..xx..xx..xx..x' }],
    ['jazz6', 'Jazz funk', { kick: 'x..x....x.x.....', snare: '....x..x....x...', ride: EIGHTS }],
    ['jazz7', 'New Orleans', { kick: 'x..x..x...x.....', snare: '...x..x....x.x..', hat: BACKBEAT, tamb: EIGHTS }],
  ]],
  ['Country and folk', [
    ['folk1', 'Train beat', { kick: 'x.......x.......', snare: 'xxxxxxxxxxxxxxxx', hat: BACKBEAT }],
    ['folk2', 'Two-step', { kick: 'x.......x.......', rim: BACKBEAT, hat: EIGHTS }],
    ['folk3', 'Folk stomp', { kick: QUARTERS, clap: BACKBEAT, tamb: OFFBEATS }],
    ['folk4', 'Campfire', { framedrum: 'x.......x.......', shaker: EIGHTS, rim: BACKBEAT }],
    ['folk5', 'Americana', { kick: 'x.....x.x.......', rim: BACKBEAT, shaker: EIGHTS, tamb: BACKBEAT }],
    ['folk6', 'Cajon groove', { cajon: 'x.....x.x.......', cajonslap: BACKBEAT, shaker: EIGHTS }],
    ['folk7', 'Cajon funk', { cajon: 'x..x....x.x.....', cajonslap: '....x..x....x...', cabasa: EIGHTS }],
  ]],
  ['World', [
    ['world1', 'Maqsoum', { darbuka: 'x..x....x.......', framedrum: '......x.....x...', rim: '..x...x...x...x.' }],
    ['world2', 'Baladi', { darbuka: 'x.x.....x.......', framedrum: '......x.....x...', tamb: EIGHTS }],
    ['world3', 'Afro six', { lowconga: 'x.....x.........', conga: '...x.....x..x...', agogo: 'x.x.xx.x.x.x....', shaker: EIGHTS }],
    ['world4', 'Bongo groove', { bongo: 'x.x...x.x.x...x.', lowbongo: '...x.....x...x..', shaker: EIGHTS }],
    ['world5', 'Log and bell', { woodblock: 'x..x..x...x.x...', lowtom: 'x.......x.......', triangle: QUARTERS }],
    ['world6', 'Festive bells', { kick: 'x.......x.......', sleigh: EIGHTS, triangle: BACKBEAT }],
    ['world7', 'March', { kick: 'x.......x.......', snare: 'x.xxx.xxx.xxx.xx', crash: 'x...............' }],
  ]],
];

// Other time signatures have their own feel, so they get their own bars.
const E12 = 'x.x.x.x.x.x.';
const LIBRARY_34 = [['More styles', [
  ['w34a', 'Jazz waltz', { ride: 'x...x..xx...', hat: '....x...x...', kick: 'x...........' }],
  ['w34b', 'Rock waltz', { kick: 'x.....x.....', snare: '....x...x...', hat: E12 }],
  ['w34c', 'Folk waltz', { framedrum: 'x...........', rim: '....x...x...', shaker: E12 }],
  ['w34d', 'Cajon waltz', { cajon: 'x.....x.....', cajonslap: '....x.......', shaker: E12 }],
  ['w34e', 'Tambourine waltz', { kick: 'x...........', tamb: '....x...x...', hat: E12 }],
  ['w34f', 'Bolero', { kick: 'x...........', snare: 'x.xxx.x.x.x.', ride: 'x...x...x...' }],
  ['w34g', 'Mazurka', { kick: 'x...........', snare: '....x.......', woodblock: '....x...x...' }],
  ['w34h', 'Soft brushes', { rim: '....x...x...', shaker: 'xxxxxxxxxxxx', kick: 'x...........' }],
]]];
const LIBRARY_68 = [['More styles', [
  ['s68a', 'Slow rock 6/8', { kick: 'x.....x.....', snare: '......x.....', ride: E12 }],
  ['s68b', 'Soul 6/8', { kick: 'x...x.x.....', snare: '......x.....', hat: E12 }],
  ['s68c', 'Jig', { kick: 'x.....x.....', framedrum: '..x.x...x.x.', tamb: E12 }],
  ['s68d', 'Tarantella', { kick: 'x.....x.....', tamb: 'xxxxxxxxxxxx', rim: '...x.....x..' }],
  ['s68e', 'Afro 6/8', { lowconga: 'x.....x.....', conga: '...x.....x..', agogo: 'x.x.xx.x.x.x', shaker: E12 }],
  ['s68f', 'Cajon 6/8', { cajon: 'x.....x.....', cajonslap: '......x.....', shaker: E12 }],
  ['s68g', 'March 6/8', { kick: 'x.....x.....', snare: 'x.xx.xx.xx.x', crash: 'x...........' }],
  ['s68h', 'Lullaby', { rim: '......x.....', shaker: E12, kick: 'x...........' }],
]]];
const E20 = 'x.x.x.x.x.x.x.x.x.x.';
const LIBRARY_54 = [['More styles', [
  ['f54a', 'Jazz five', { ride: 'x...x..xx...x...x...', hat: '....x.......x.......', kick: 'x...........x.......' }],
  ['f54b', 'Rock five', { kick: 'x.....x.....x.......', snare: '........x.......x...', hat: E20 }],
  ['f54c', 'Funk five', { kick: 'x..x....x...x..x....', snare: '....x.......x.....x.', hat: 'xxxxxxxxxxxxxxxxxxxx' }],
  ['f54d', 'Balkan five', { darbuka: 'x.....x.....x.......', framedrum: '....x.......x...x...', tamb: E20 }],
  ['f54e', 'Cajon five', { cajon: 'x...........x.......', cajonslap: '........x.......x...', shaker: E20 }],
  ['f54f', 'Latin five', { claves: 'x..x..x...x.x...x...', lowconga: '...x.......x........', conga: '......x.........x...', shaker: E20 }],
  ['f54g', 'Ballad five', { kick: 'x...............x...', rim: '........x...........', shaker: E20 }],
  ['f54h', 'Bell five', { kick: 'x...........x.......', agogo: 'x.x.xx.x.x.xx.x.x.x.', rim: '....x.......x.......' }],
]]];

const LIBRARY = { '4/4': LIBRARY_44, '3/4': LIBRARY_34, '6/8': LIBRARY_68, '5/4': LIBRARY_54 };
const toBeat = ([id, name, hits]) => ({ id, name, hits });

// Styles for one time signature. The first group is always the everyday starters.
export const beatGroups = (meter, starters) => [{ name: 'Essentials', beats: starters }, ...LIBRARY[meter].map(([name, list]) => ({ name, beats: list.map(toBeat) }))];

/* Regression: zombie encounters enter a combat round first.
 * Run: node test/combat-round.test.js
 */
const fs = require('fs'), vm = require('vm'), path = require('path');
const DIR = path.join(__dirname, '..', 'js') + path.sep;
const src = fs.readFileSync(DIR + 'data.js', 'utf8') + '\n'
  + fs.readFileSync(DIR + 'engine.js', 'utf8') + '\n'
  + fs.readFileSync(DIR + 'combat-round.js', 'utf8') + '\n'
  + ';globalThis.__Engine = Engine;';
const sandbox = { Math, JSON, console, Date };
vm.createContext(sandbox); vm.runInContext(src, sandbox);
const E = sandbox.__Engine;

let fail = 0;
const A = (c, m) => { if (!c) { console.log('  FAIL:', m); fail++; } else console.log('  OK:', m); };
const zh = (hex) => hex.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
const student = zh('\\u5b66\\u751f');
const female = zh('\\u5973');
const baton = zh('\\u8b66\\u68cd');
const market = zh('\\u8d85\\u5e02');

E.newGame({ name: 'combat-test', gender: female, age: 24, profession: student, period: 'mid', seed: 31 });
E.state.inventory = [baton];
let calls = 0;
E.judge = () => (++calls === 1)
  ? { roll: 90, target: 60, success: false, tier: 'fail', margin: -30 }
  : { roll: 20, target: 60, success: true, tier: 'pass', margin: 40 };
let res = { parts: [], deltas: {}, gains: [], losses: [] };
const win = E.resolveZombieCombat(res, { source: 'test encounter', difficulty: 0 });
A(win.success === true, 'weapon advantage can turn the second STR roll into a zombie kill');
A(calls === 2 && res.combat[0].advantage === true, 'advantage performs two STR rolls');
A((res.deltas.hp || 0) === 0 && (res.deltas.infection || 0) === 0, 'successful zombie kill does not cost HP or infection');
A((res.deltas.san || 0) < 0 && (res.deltas.hunger || 0) < 0 && (res.deltas.hydration || 0) < 0, 'successful zombie kill costs extra San, hunger, and hydration');

E.newGame({ name: 'combat-test', gender: female, age: 24, profession: student, period: 'mid', seed: 32 });
E.state.inventory = [];
E.judge = () => ({ roll: 95, target: 30, success: false, tier: 'fumble', margin: -65 });
res = { parts: [], deltas: {}, gains: [], losses: [] };
const lose = E.resolveZombieCombat(res, { source: 'test crush', difficulty: -10, severe: true });
A(lose.success === false, 'failed STR combat enters the injury branch');
A((res.deltas.hp || 0) < 0, 'combat failure is what costs HP');

E.newGame({ name: 'combat-test', gender: female, age: 24, profession: student, period: 'mid', seed: 33 });
E.state.inventory = [baton];
const oldRnd = E.rnd;
E.rnd = () => 0;
let seq = [
  { roll: 20, target: 60, success: true, tier: 'pass', margin: 40 },
  { roll: 90, target: 60, success: false, tier: 'fail', margin: -30 },
  { roll: 88, target: 60, success: false, tier: 'fail', margin: -28 },
  { roll: 12, target: 60, success: true, tier: 'pass', margin: 48 },
];
E.judge = () => seq.shift() || { roll: 12, target: 60, success: true, tier: 'pass', margin: 48 };
const out = E.runAction('scavenge', { location: market });
E.rnd = oldRnd;
A(out.combat && out.combat[0] && out.combat[0].enemy, 'scavenge zombie encounter records combat round details');
A(out.combat[0].success === true && (out.deltas.hp || 0) === 0 && (out.deltas.infection || 0) === 0, 'successful scavenge combat does not directly injure the player');

console.log(fail ? `\n${fail} FAIL` : '\nALL PASS');
process.exit(fail ? 1 : 0);

/* 回归测试：开局特质 —— 限制数量、应用属性/物品/伤势，并兼容旧存档。
 * 跑：node test/traits.test.js */
const fs = require('fs'), vm = require('vm'), path = require('path');
const DIR = path.join(__dirname, '..', 'js') + path.sep;
const src = fs.readFileSync(DIR + 'data.js', 'utf8') + '\n' + fs.readFileSync(DIR + 'engine.js', 'utf8')
  + '\n;globalThis.__Engine = Engine; globalThis.__GameData = GameData;';
const sandbox = { Math, JSON, console, Date };
vm.createContext(sandbox); vm.runInContext(src, sandbox);
const E = sandbox.__Engine;

let fail = 0;
const A = (c, m) => { if (!c) { console.log('  ✗ FAIL:', m); fail++; } else console.log('  ✓', m); };
const base = { name: '测试者', gender: '女', age: 24, profession: '学生', period: 'mid', seed: 1234 };

E.newGame({ ...base, traits: [] });
const baseStr = E.state.attrs.str;
E.newGame({ ...base, traits: ['strong'] });
A(E.state.attrs.str === baseStr + 8, '强健会把力量初始值提高 8');
A(E.state.vitals.hp === 100, '强健的生命加成会被上限正确 clamp');

E.newGame({ ...base, traits: ['strong', 'nimble', 'bookish', 'anxious', 'old_wound', 'notorious'] });
A(E.state.traits.join(',') === 'strong,nimble,anxious,old_wound', '最多保留 2 个正面 + 2 个负面特质');
A(E.state.flags.injuries.fracture === 1, '旧伤会带来起始轻微骨伤');
A(E.state.vitals.san === 88, '易惊会降低开局 San');

E.newGame({ ...base, traits: ['field_medic'] });
A(E.state.inventory.filter(x => x === '绷带').length === 2, '会包扎开局额外携带两份绷带');

const oldSave = JSON.parse(E.serialize());
delete oldSave.state.traits;
E.load(oldSave);
A(Array.isArray(E.state.traits) && E.state.traits.length === 0, '旧存档没有 traits 时自动兼容为空数组');

console.log(fail ? `\n${fail} FAIL` : '\nALL PASS');
process.exit(fail ? 1 : 0);

/* 回归测试：缺水 bug —— 背包满时拾得的水进了仓库，喝水/用物应能从仓库取用。
 * 跑：node test/water.test.js （需 Node，纯逻辑、不依赖浏览器） */
const fs = require('fs'), vm = require('vm'), path = require('path');
const DIR = path.join(__dirname, '..', 'js') + path.sep;
const src = fs.readFileSync(DIR + 'data.js', 'utf8') + '\n' + fs.readFileSync(DIR + 'engine.js', 'utf8')
  + '\n;globalThis.__Engine = Engine; globalThis.__GameData = GameData;';
const sandbox = { Math, JSON, console, Date };
vm.createContext(sandbox); vm.runInContext(src, sandbox);
const E = sandbox.__Engine;

E.state = {
  inventory: ['菜刀', '现金', '相册', '旧衣物', '电池', '创可贴'], warehouse: [],
  vitals: { hp: 80, hpCap: 100, hunger: 60, hydration: 20, san: 60, infection: 0 },
  flags: {}, week: 1, buffs: [], companions: [],
};
let fail = 0;
const A = (c, m) => { if (!c) { console.log('  ✗ FAIL:', m); fail++; } else console.log('  ✓', m); };

E.addItem('矿泉水');                       // 背包满 → 进仓库
A(E.state.warehouse.includes('矿泉水') && !E.state.inventory.includes('矿泉水'),
  '背包满时「矿泉水」进了据点仓库、不在背包');

const before = E.state.vitals.hydration;
const r = E.useItem('矿泉水');             // 应能从仓库取用
A(r.ok === true, 'useItem 能从仓库取用「矿泉水」');
A(E.state.vitals.hydration > before, '喝完水分上升、不再一直缺水');

console.log(fail ? `\n${fail} FAIL` : '\nALL PASS');
process.exit(fail ? 1 : 0);

/* 回归测试：职业开局重构 —— d100 属性、时期装备、职业归类、枪械训练与第一印象。
 * 跑：node test/profession-start.test.js */
const fs = require('fs'), vm = require('vm'), path = require('path');
const DIR = path.join(__dirname, '..', 'js') + path.sep;
const src = fs.readFileSync(DIR + 'data.js', 'utf8') + '\n' + fs.readFileSync(DIR + 'engine.js', 'utf8')
  + '\n;globalThis.__Engine = Engine; globalThis.__GameData = GameData;';
const sandbox = { Math, JSON, console, Date };
vm.createContext(sandbox); vm.runInContext(src, sandbox);
const E = sandbox.__Engine;

let fail = 0;
const A = (c, m) => { if (!c) { console.log('  ✗ FAIL:', m); fail++; } else console.log('  ✓', m); };

E.newGame({ name: '测职业', gender: '女', age: 24, profession: '医生', period: 'early', seed: 11 });
A(E.state.day >= 1 && E.state.day <= 5, '爆发初期为第 1-5 天');
A(E.state.inventory.includes('急救包') && E.state.inventory.filter(x => x === '抗生素').length === 3, '医生初期携带完整医疗包');
A(Object.values(E.state.attrs).every(v => v >= 1 && v <= 95), '开局属性封顶 95');
A(E.state.flags.creation.attrRolls.int.base >= 1 && E.state.flags.creation.attrRolls.int.base <= 100, '属性记录 d100 原始骰值');

E.newGame({ name: '测职业', gender: '女', age: 24, profession: '医生', period: 'late', seed: 11 });
A(E.state.day >= 15, '爆发后期至少第 15 天');
A(!E.state.inventory.includes('急救包') && E.state.inventory.includes('绷带'), '医生后期医疗物资缩水');

E.newGame({ name: '测职业', gender: '女', age: 24, profession: '护士', period: 'mid', seed: 12 });
A(E.state.professionKey === '医生' && E.state.profession.includes('护士'), '自定义职业「护士」归入医生系');

E.newGame({ name: '测枪', gender: '女', age: 30, profession: '民警', period: 'mid', seed: 13 });
A(E.canUseFirearm('手枪(弹药4)') === true, '民警可使用手枪');
A(E.canUseFirearm('步枪(弹药8)') === false, '民警不能直接使用步枪');

E.newGame({ name: '测枪', gender: '女', age: 30, profession: '武警/军警', period: 'mid', seed: 13 });
A(E.canUseFirearm('步枪(弹药8)') === true && E.carryCap() === 16, '武警/军警可用长枪且战术背包扩容');

E.newGame({ name: '测印象', gender: '女', age: 30, profession: '医生', period: 'mid', seed: 14 });
A(E.professionImpression({ profession: '民警', factionId: 'whitetower' }, 'whitetower').total > 0, '医生遇到白塔医援/民警有正面第一印象');

E.newGame({ name: '测印象', gender: '女', age: 30, profession: '小偷', period: 'late', seed: 14 });
A(E.professionImpression({ profession: '民警', factionId: 'oldguard' }, 'oldguard').total < 0, '小偷后期遇到旧警戒线/民警有负面第一印象');

console.log(fail ? `\n${fail} FAIL` : '\nALL PASS');
process.exit(fail ? 1 : 0);

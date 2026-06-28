/* 回归测试：队友互动增强 —— 请求、照顾、背叛、牺牲事件。
 * 跑：node test/companions.test.js */
const fs = require('fs'), vm = require('vm'), path = require('path');
const DIR = path.join(__dirname, '..', 'js') + path.sep;
const src = ['data.js', 'engine.js', 'upgrades.js'].map(f => fs.readFileSync(DIR + f, 'utf8')).join('\n')
  + '\n;globalThis.__Engine = Engine;';
const sandbox = { Math, JSON, console, Date, window: {} };
vm.createContext(sandbox); vm.runInContext(src, sandbox);
const E = sandbox.__Engine;
let fail = 0;
const A = (c, m) => { if (!c) { console.log('  ✗ FAIL:', m); fail++; } else console.log('  ✓', m); };

E.newGame({ name: '测队友', gender: '女', age: 24, profession: '学生', period: 'mid', seed: 77 });
const helper = { name: '白医生', profession: '医生', factionId: 'whitetower', factionName: '白塔医援', personality: 'medic', fear: '感染', stress: 20, wound: 0, affinity: 35, memories: [] };
const hurt = { name: '陈强', profession: '工人', factionId: 'nanqiao', factionName: '南桥营地', personality: 'brave', fear: '尸群', stress: 72, wound: 52, affinity: 10, memories: [] };
E.state.companions = [helper, hurt];
E.state.relations = { 白医生: 35, 陈强: 10 };
E.ensureCompanions();

let res = { parts: [], deltas: {}, gains: [], losses: [] };
E.companionRequest(hurt, res);
A(res.companionEvents[0].type === 'request', '队友请求会写入 companionEvents');
A(hurt.lastEvent && hurt.lastEvent.type === 'request', '队友请求会写入最近事件');

const beforeWound = hurt.wound;
res = { parts: [], deltas: {}, gains: [], losses: [] };
E.companionCare(helper, hurt, res);
A(hurt.wound < beforeWound, '队友照顾会降低伤势');
A(res.companionEvents[0].type === 'care', '队友照顾会写入事件');

const betrayer = { name: '许冷', profession: '小偷', factionId: 'rustfang', factionName: '铁锈帮', personality: 'opportunist', fear: '饥饿', stress: 92, wound: 5, affinity: -45, memories: [] };
E.state.companions.push(betrayer);
E.state.relations['许冷'] = -45;
E.state.inventory = ['背包', '罐头', '瓶装水'];
res = { parts: [], deltas: {}, gains: [], losses: [] };
E.companionBetrayal(betrayer, res);
A(!E.state.companions.includes(betrayer), '背叛会让队友离队');
A(res.losses.length >= 1, '背叛会带走物资');
A(res.companionEvents[0].type === 'betrayal', '背叛会写入事件');

const loyal = { name: '周明', profession: '民警', factionId: 'oldguard', factionName: '旧警戒线', personality: 'caring', fear: '黑暗', stress: 20, wound: 0, affinity: 80, memories: [] };
E.state.companions.push(loyal);
E.state.relations['周明'] = 80;
res = { parts: [], deltas: { hp: -20 }, gains: [], losses: [], deaths: [] };
E.companionSacrifice(loyal, res);
A(!E.state.companions.includes(loyal), '牺牲会让队友离队');
A(res.deaths.includes('周明'), '牺牲会进入死亡名单');
A(res.deltas.hp > -20, '牺牲会减轻玩家生命损失');
A(res.companionEvents[0].type === 'sacrifice', '牺牲会写入事件');
const noHeal = { name: 'NoHeal', profession: 'guard', factionId: 'oldguard', factionName: 'oldguard', personality: 'caring', fear: 'dark', stress: 20, wound: 0, affinity: 80, memories: [] };
E.state.companions.push(noHeal);
E.state.relations.NoHeal = 80;
res = { parts: [], deltas: {}, gains: [], losses: [], deaths: [] };
E.companionSacrifice(noHeal, res);
A((res.deltas.hp || 0) <= 0, '牺牲不会在没有受伤时凭空回血');

console.log(fail ? `\n${fail} FAIL` : '\nALL PASS');
process.exit(fail ? 1 : 0);

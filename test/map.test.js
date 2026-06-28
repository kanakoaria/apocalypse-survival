/* 回归测试：青阳市路线图 —— 已发现路线可视化，堵塞路线用 blocked 状态展示。
 * 跑：node test/map.test.js */
const fs = require('fs'), vm = require('vm'), path = require('path');
const DIR = path.join(__dirname, '..', 'js') + path.sep;
const src = ['data.js', 'engine.js', 'offline.js', 'narrator.js', 'ui.js']
  .map(f => fs.readFileSync(DIR + f, 'utf8')).join('\n')
  + '\n;globalThis.__Engine = Engine; globalThis.__UI = UI; globalThis.__GameData = GameData;';
const element = () => ({ innerHTML: '', value: '', onclick: null, classList: { add(){}, remove(){}, toggle(){} }, style: {},
  querySelectorAll(){ return []; }, addEventListener(){}, appendChild(){}, remove() {} });
const sandbox = {
  Math, JSON, console, Date,
  window: { addEventListener() {} },
  document: { getElementById: element, querySelectorAll() { return []; }, querySelector() { return element(); }, createElement: element, body: { appendChild() {} } },
  localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
  setTimeout() { return 0; }, clearTimeout() {}, confirm() { return true; }, Blob: function Blob() {},
  URL: { createObjectURL() { return 'blob:test'; }, revokeObjectURL() {} }, FileReader: function FileReader() {},
};
vm.createContext(sandbox); vm.runInContext(src, sandbox);
const E = sandbox.__Engine, UI = sandbox.__UI, GameData = sandbox.__GameData;
let fail = 0;
const A = (c, m) => { if (!c) { console.log('  ✗ FAIL:', m); fail++; } else console.log('  ✓', m); };

E.newGame({ name: '测图', gender: '女', age: 24, profession: '学生', period: 'mid', seed: 9 });
let html = UI.routeMapHTML(E.routeIntel());
A(html.includes('city-map') && html.includes('map-route'), '路线图生成 SVG 和路线边');
A(html.includes(`已发现 8/${GameData.ROUTES.length}`), '初始显示 8 条已发现路线');
A(html.includes('庇护所') && html.includes('医院') && html.includes('仓库'), '路线图包含核心地点标签');

E.state.flags.routes['service-tunnel'].known = true;
E.state.flags.routes['service-tunnel'].blocked = true;
html = UI.routeMapHTML(E.routeIntel());
A(html.includes('map-route blocked'), '堵塞路线会标记为 blocked');
A(html.includes(`已发现 9/${GameData.ROUTES.length}`), '发现隐藏路线后计数更新');

console.log(fail ? `\n${fail} FAIL` : '\nALL PASS');
process.exit(fail ? 1 : 0);

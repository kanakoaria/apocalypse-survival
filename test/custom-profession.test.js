/* Regression: custom profession point-buy and explicit detail outcomes. */
const fs = require('fs'), vm = require('vm'), path = require('path');
const DIR = path.join(__dirname, '..', 'js') + path.sep;
const src = [
  'data.js',
  'engine.js',
  'offline.js',
  'narrator.js',
  'ui.js',
  'career-start.js',
  'custom-profession.js',
].map(f => fs.readFileSync(DIR + f, 'utf8')).join('\n')
  + '\n;globalThis.__Engine = Engine; globalThis.__UI = UI;';
const sandbox = { Math, JSON, console, Date };
sandbox.window = sandbox;
sandbox.addEventListener = () => {};
vm.createContext(sandbox); vm.runInContext(src, sandbox);
const E = sandbox.__Engine;
const UI = sandbox.__UI;

let fail = 0;
const A = (c, m) => { if (!c) { console.log('  FAIL:', m); fail++; } else console.log('  OK:', m); };
const allocation = { str: 80, agi: 40, int: 70, per: 55, elo: 35, luck: 30, chm: 40 };

E.newGame({ name: '点数测试', gender: '女', age: 24, profession: '护士', period: 'mid', seed: 41, customAttrs: allocation });
A(E.state.professionKey === '医生' && E.state.profession.includes('护士'), 'custom profession still maps to the closest career family');
A(Object.values(E.state.flags.creation.customAttrs).reduce((a, b) => a + b, 0) === 350, 'custom allocation keeps a fixed total of 350');
A(E.state.attrs.str === 80 && E.state.attrs.int === 70 && E.state.attrs.chm === 40, 'custom allocation replaces random career attribute rolls');
A(E.state.flags.creation.attrRolls.int.careerMod === 0 && E.state.flags.creation.attrRolls.int.source === 'custom-point-buy', 'career bias does not change custom point total');

const detail = UI.detailLines('action', {
  parts: [
    '感知判定@超市：20/60 成功',
    '力量80/60·敏捷20/60 → 1/2',
    '遇见 王强。魅力70/60·口才20/60',
  ],
});
A(detail[0].includes('结果：成功'), 'single explicit check detail shows success');
A(detail[1].includes('判定1失败') && detail[1].includes('判定2成功'), 'multi-check detail shows each check outcome');
A(detail[2].includes('判定1失败') && detail[2].includes('判定2成功'), 'plain roll/target pairs are annotated with success/failure');

console.log(fail ? `\n${fail} FAIL` : '\nALL PASS');
process.exit(fail ? 1 : 0);

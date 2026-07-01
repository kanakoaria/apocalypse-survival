/* 回归测试：流式(SSE)解析 —— 假 Claude / OpenAI SSE 串喂给解析器，
 * 断言累积文本正确、跨块残行被缓冲、末尾 ```json``` 世界变更块被剥离。
 * 无需浏览器。跑：node test/stream_parser.test.js */
const fs = require('fs'), vm = require('vm'), path = require('path');
const DIR = path.join(__dirname, '..', 'js') + path.sep;
const src = fs.readFileSync(DIR + 'narrator.js', 'utf8') + '\n;globalThis.__Narrator = Narrator;';
const sandbox = { JSON, console };
vm.createContext(sandbox); vm.runInContext(src, sandbox);
const N = sandbox.__Narrator;

let fail = 0;
const A = (c, m) => { if (!c) { console.log('  ✗ FAIL:', m); fail++; } else console.log('  ✓', m); };

// 把整串按固定小块切开 push，逼出「一个 data 行被切成两块」的跨块缓冲路径
function feedChunked(parser, str, size) {
  for (let i = 0; i < str.length; i += size) parser.push(str.slice(i, i + size));
  parser.flush();
}

// —— Claude：content_block_delta.text_delta 累积，message_stop 结束 ——
const claudeBody =
  '**「活着，是唯一的奢侈。」**\n\n你还活着。\n\n1. 出门寻找物资\n2. 躲着不动\n' +
  '```json\n{"items_gained":["绷带"],"relations":{"卫军":8}}\n```';
// 把正文拆成 3 段增量（其中一段跨越 json 围栏），逐条塑成 SSE data 行
const claudeParts = [claudeBody.slice(0, 20), claudeBody.slice(20, 45), claudeBody.slice(45)];
let claudeSSE =
  'event: message_start\n' +
  'data: {"type":"message_start","message":{"id":"msg_1"}}\n\n' +
  'event: content_block_start\n' +
  'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n';
for (const p of claudeParts) {
  claudeSSE += 'event: content_block_delta\n' +
    'data: ' + JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: p } }) + '\n\n';
}
claudeSSE +=
  'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n' +
  'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}\n\n' +
  'event: message_stop\ndata: {"type":"message_stop"}\n\n';

let claudeEmitted = '';
const cp = N.makeStreamParser('claude', (t) => { claudeEmitted += t; });
feedChunked(cp, claudeSSE, 7);   // 7 字节小块 → 频繁切断 data 行
A(cp.text() === claudeBody, 'Claude：累积文本与原文一致（跨块残行正确缓冲）');
A(claudeEmitted === claudeBody, 'Claude：onChunk 增量之和 == 完整文本');
A(cp.done === true, 'Claude：message_stop 后 done=true');

const cd = N.parseDelta(cp.text());
A(!/```/.test(cd.text) && !/items_gained/.test(cd.text), 'Claude：显示文本已剥离末尾 ```json``` 块');
A(cd.text.includes('你还活着。') && cd.text.includes('1. 出门寻找物资'), 'Claude：正文与编号选项保留');
A(cd.delta && cd.delta.items_gained[0] === '绷带' && cd.delta.relations['卫军'] === 8, 'Claude：world-change 块解析成 delta 供引擎落地');

// —— OpenAI/DeepSeek：choices[0].delta.content 累积，data: [DONE] 结束 ——
const oaiBody = '夜里很冷。\n\n1. 生火\n2. 蜷着\n```json\n{"items_lost":["火柴"]}\n```';
const oaiParts = [oaiBody.slice(0, 10), oaiBody.slice(10, 24), oaiBody.slice(24)];
let oaiSSE = '';
for (const p of oaiParts) {
  oaiSSE += 'data: ' + JSON.stringify({ choices: [{ delta: { content: p } }] }) + '\n\n';
}
oaiSSE += 'data: [DONE]\n\n';

let oaiEmitted = '';
const op = N.makeStreamParser('openai', (t) => { oaiEmitted += t; });
feedChunked(op, oaiSSE, 5);
A(op.text() === oaiBody, 'OpenAI：累积文本与原文一致');
A(oaiEmitted === oaiBody, 'OpenAI：onChunk 增量之和 == 完整文本');
A(op.done === true, 'OpenAI：data: [DONE] 后 done=true');

const od = N.parseDelta(op.text());
A(!/```/.test(od.text), 'OpenAI：显示文本已剥离末尾 ```json``` 块');
A(od.delta && od.delta.items_lost[0] === '火柴', 'OpenAI：world-change 块解析成 delta');

// 空白/心跳行不应崩溃或产出文本
const noise = N.makeStreamParser('claude', () => {});
noise.push(': ping\n\n');            // SSE 注释行
noise.push('data: \n\n');            // 空 data
noise.push('data: not-json\n\n');    // 非 JSON
noise.flush();
A(noise.text() === '', '噪声行（注释/空/非JSON）被安全忽略');

if (fail) { console.log(`\n${fail} 项失败`); process.exit(1); }
console.log('\n全部通过');

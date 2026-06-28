/* 回归测试：4 人联机服务器房间、人数限制、房主权威同步。 */
const mp = require('../.codex/multiplayer-server.js');
let fail = 0;
const A = (cond, msg) => { if (!cond) { console.log('  ✗ FAIL:', msg); fail++; } else console.log('  ✓', msg); };
const fake = name => ({ id: name, sent: [], send(msg) { this.sent.push(msg); } });

A(/^[A-Z0-9]{4}$/.test(mp.createRoomCode()), '房间码是 4 位可读字符');
A(mp.cleanRoom(' ab-12 ') === 'AB12', '房间码会规范化');
A(mp.cleanName('  一名很长很长很长的幸存者  ').length <= 16, '昵称会限制长度');

const hub = mp.createHub();
const host = fake('host');
hub.handle(host, { type: 'hello', name: '房主', create: true });
const code = host.roomCode;
A(!!code && hub.rooms.has(code), '创建房间成功');
A(host.sent.some(m => m.type === 'welcome' && m.hostId === 'host'), '首位玩家成为房主');

const p2 = fake('p2'), p3 = fake('p3'), p4 = fake('p4'), p5 = fake('p5');
hub.handle(p2, { type: 'hello', name: '二号', room: code });
hub.handle(p3, { type: 'hello', name: '三号', room: code });
hub.handle(p4, { type: 'hello', name: '四号', room: code });
hub.handle(p5, { type: 'hello', name: '五号', room: code });
A(hub.rooms.get(code).clients.length === 4, '房间最多容纳 4 人');
A(p5.sent.some(m => m.type === 'error'), '第 5 人会收到满员错误');

hub.handle(p2, { type: 'state', state: { week: 99 }, seed: 2, log: 'bad' });
A(hub.rooms.get(code).state == null, '非房主不能同步世界状态');
A(p2.sent.some(m => m.type === 'error' && /只有房主/.test(m.message)), '非房主写状态会被拒绝');

hub.handle(host, { type: 'state', state: { week: 2 }, seed: 123, log: '<p>ok</p>' });
A(hub.rooms.get(code).state.week === 2, '房主可以同步世界状态');
A(p2.sent.some(m => m.type === 'state' && m.state.week === 2), '房主状态会广播给队员');

hub.handle(p3, { type: 'proposal', text: '去超市搜索' });
A(host.sent.some(m => m.type === 'proposal' && m.text === '去超市搜索'), '队员行动建议会广播给房主');

hub.leave(host);
A(hub.rooms.get(code).hostId === 'p2', '房主离开后会移交房主');

console.log(fail ? `\n${fail} FAIL` : '\nALL PASS');
process.exit(fail ? 1 : 0);

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_ROOT = path.resolve(__dirname, '..');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.png': 'image/png',
  '.md': 'text/markdown; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};
const MAX_PLAYERS = 4;

function createRoomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  const bytes = crypto.randomBytes(4);
  for (let i = 0; i < 4; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

function clientId() {
  return crypto.randomBytes(8).toString('hex');
}

function cleanName(name) {
  return String(name || '幸存者').trim().slice(0, 16) || '幸存者';
}

function cleanRoom(room) {
  return String(room || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
}

function now() {
  return Date.now();
}

function createHub() {
  const rooms = new Map();

  const playersFor = room => room.clients.map(c => ({ id: c.id, name: c.name, host: c.id === room.hostId }));
  const send = (client, msg) => client && client.send && client.send(msg);
  const broadcast = (room, msg, exceptId = null) => {
    if (!room) return;
    for (const c of room.clients) if (c.id !== exceptId) send(c, msg);
  };
  const system = (room, text) => broadcast(room, { type: 'chat', system: true, from: '系统', text, ts: now() });
  const players = room => broadcast(room, { type: 'players', room: room.code, hostId: room.hostId, players: playersFor(room) });
  const error = (client, message) => send(client, { type: 'error', message });

  const join = (client, msg = {}) => {
    if (client.roomCode) leave(client);
    let code = cleanRoom(msg.room);
    const creating = !!msg.create || !code;
    if (!code) {
      do { code = createRoomCode(); } while (rooms.has(code));
    }
    let room = rooms.get(code);
    if (!room && !creating) return error(client, '房间不存在，检查房间码或先让房主创建。');
    if (!room) {
      room = { code, clients: [], hostId: null, state: null, seed: 1, log: '', updatedAt: now(), createdAt: now() };
      rooms.set(code, room);
    }
    if (room.clients.length >= MAX_PLAYERS) return error(client, '房间已满，最多 4 人。');

    client.name = cleanName(msg.name);
    client.roomCode = code;
    room.clients.push(client);
    if (!room.hostId) room.hostId = client.id;

    send(client, {
      type: 'welcome',
      id: client.id,
      room: code,
      hostId: room.hostId,
      players: playersFor(room),
      maxPlayers: MAX_PLAYERS,
      state: room.state,
      seed: room.seed,
      log: room.log,
      updatedAt: room.updatedAt,
    });
    players(room);
    system(room, `${client.name} 加入了房间。`);
    return true;
  };

  const leave = client => {
    if (!client || !client.roomCode) return;
    const room = rooms.get(client.roomCode);
    if (!room) { client.roomCode = null; return; }
    room.clients = room.clients.filter(c => c !== client);
    const oldHost = room.hostId;
    if (room.hostId === client.id) room.hostId = room.clients[0] ? room.clients[0].id : null;
    client.roomCode = null;
    if (!room.clients.length) {
      rooms.delete(room.code);
      return;
    }
    system(room, `${client.name || '一名玩家'} 离开了房间。`);
    if (oldHost !== room.hostId) system(room, '房主离开，房主权限已移交给下一位玩家。');
    players(room);
  };

  const handle = (client, msg = {}) => {
    if (msg.type === 'hello') return join(client, msg);
    const room = rooms.get(client.roomCode);
    if (!room) return error(client, '尚未加入房间。');

    if (msg.type === 'chat') {
      const text = String(msg.text || '').trim().slice(0, 300);
      if (!text) return;
      return broadcast(room, { type: 'chat', id: client.id, from: client.name, text, ts: now() });
    }
    if (msg.type === 'proposal') {
      const text = String(msg.text || '').trim().slice(0, 300);
      if (!text) return;
      return broadcast(room, { type: 'proposal', id: client.id, from: client.name, text, ts: now() });
    }
    if (msg.type === 'state') {
      if (client.id !== room.hostId) return error(client, '只有房主可以同步世界状态。');
      room.state = msg.state || null;
      room.seed = Number.isFinite(+msg.seed) ? +msg.seed : room.seed;
      room.log = String(msg.log || '').slice(-90000);
      room.updatedAt = now();
      return broadcast(room, { type: 'state', state: room.state, seed: room.seed, log: room.log, updatedAt: room.updatedAt }, client.id);
    }
    if (msg.type === 'ping') return send(client, { type: 'pong', ts: now() });
    return error(client, '未知联机消息。');
  };

  return { rooms, join, leave, handle, playersFor, broadcast };
}

function encodeFrame(text) {
  const payload = Buffer.from(String(text));
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  header[0] = 0x81;
  return Buffer.concat([header, payload]);
}

function decodeFrames(buffer) {
  const messages = [];
  let offset = 0;
  while (offset + 2 <= buffer.length) {
    const first = buffer[offset];
    const second = buffer[offset + 1];
    const opcode = first & 0x0f;
    const masked = !!(second & 0x80);
    let len = second & 0x7f;
    let headerLen = 2;
    if (len === 126) {
      if (offset + 4 > buffer.length) break;
      len = buffer.readUInt16BE(offset + 2);
      headerLen = 4;
    } else if (len === 127) {
      if (offset + 10 > buffer.length) break;
      len = Number(buffer.readBigUInt64BE(offset + 2));
      headerLen = 10;
    }
    const maskLen = masked ? 4 : 0;
    const frameEnd = offset + headerLen + maskLen + len;
    if (frameEnd > buffer.length) break;
    if (opcode === 0x8) return { messages, rest: buffer.slice(frameEnd), close: true };
    if (opcode === 0x1) {
      let payload = buffer.slice(offset + headerLen + maskLen, frameEnd);
      if (masked) {
        const mask = buffer.slice(offset + headerLen, offset + headerLen + 4);
        payload = Buffer.from(payload.map((b, i) => b ^ mask[i % 4]));
      }
      messages.push(payload.toString('utf8'));
    }
    offset = frameEnd;
  }
  return { messages, rest: buffer.slice(offset), close: false };
}

function sendJson(socket, msg) {
  if (!socket || socket.destroyed) return;
  socket.write(encodeFrame(JSON.stringify(msg)));
}

function safeFile(root, pathname) {
  let route = decodeURIComponent(pathname || '/');
  if (route === '/' || route === '') route = '/index.html';
  const file = path.resolve(root, '.' + route);
  return file.startsWith(root) ? file : null;
}

function createServer({ root = DEFAULT_ROOT, hub = createHub() } = {}) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname === '/health') {
      const body = JSON.stringify({ ok: true, rooms: hub.rooms.size, maxPlayers: MAX_PLAYERS });
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(body);
      return;
    }
    const file = safeFile(root, url.pathname);
    if (!file) {
      res.writeHead(403);
      res.end('forbidden');
      return;
    }
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    });
  });

  server.on('upgrade', (req, socket) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname !== '/ws') {
      socket.destroy();
      return;
    }
    const key = req.headers['sec-websocket-key'];
    if (!key) {
      socket.destroy();
      return;
    }
    const accept = crypto.createHash('sha1')
      .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
      .digest('base64');
    socket.write([
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${accept}`,
      '',
      '',
    ].join('\r\n'));

    const client = {
      id: clientId(),
      socket,
      name: '幸存者',
      roomCode: null,
      send(msg) { sendJson(socket, msg); },
    };
    let buffer = Buffer.alloc(0);
    socket.on('data', chunk => {
      buffer = Buffer.concat([buffer, chunk]);
      const decoded = decodeFrames(buffer);
      buffer = decoded.rest;
      if (decoded.close) {
        hub.leave(client);
        socket.end();
        return;
      }
      for (const text of decoded.messages) {
        try { hub.handle(client, JSON.parse(text)); }
        catch (e) { client.send({ type: 'error', message: '消息格式错误。' }); }
      }
    });
    socket.on('close', () => hub.leave(client));
    socket.on('error', () => hub.leave(client));
  });
  server.hub = hub;
  return server;
}

if (require.main === module) {
  const port = Number(process.env.PORT || 8125);
  const host = process.env.HOST || '127.0.0.1';
  const server = createServer();
  server.listen(port, host, () => {
    console.log(`4-player multiplayer server: http://${host}:${port}/`);
  });
}

module.exports = { createServer, createHub, createRoomCode, cleanRoom, cleanName, encodeFrame, decodeFrames, safeFile, MAX_PLAYERS };

/* 4 人联机原型：轻服务器房间 + 房主权威同步。单机模式不依赖它。 */
const Multiplayer = {
  socket: null,
  status: 'offline',
  id: null,
  room: '',
  hostId: '',
  players: [],
  messages: [],
  proposals: [],
  broadcastTimer: null,
  patched: false,

  init() { this.patchUI(); },
  isConnected() { return this.socket && this.socket.readyState === WebSocket.OPEN && !!this.room; },
  isHost() { return this.isConnected() && this.id && this.hostId === this.id; },
  esc(s) {
    return String(s == null ? '' : s).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
  },
  toast(text) { if (window.UI && UI.toast) UI.toast(text); },
  defaultUrl() {
    const local = !location.hostname || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    const host = local ? '127.0.0.1' : location.hostname;
    const port = location.port && location.port !== '8124' ? location.port : '8125';
    return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${host}:${port}/ws`;
  },

  patchUI() {
    if (this.patched || !window.UI) return;
    this.patched = true;
    const mp = this;
    const wrap = (name, fn) => {
      const original = UI[name];
      if (typeof original !== 'function') return;
      UI[name] = fn(original.bind(UI));
    };

    wrap('renderSetup', original => function(...args) {
      const ret = original(...args);
      mp.mountSetupButton();
      mp.renderWidget();
      return ret;
    });
    wrap('renderGame', original => function(...args) {
      const ret = original(...args);
      mp.mountGameButton();
      mp.renderWidget();
      mp.applyClientLock();
      return ret;
    });
    wrap('renderActions', original => function(...args) {
      const ret = original(...args);
      mp.applyClientLock();
      return ret;
    });
    wrap('freeCommand', original => async function(...args) {
      if (mp.isConnected() && !mp.isHost()) return mp.submitCmdProposal();
      return original(...args);
    });
    wrap('autosave', original => function(...args) {
      const ret = original(...args);
      mp.scheduleBroadcast('autosave');
      return ret;
    });
  },

  mountSetupButton() {
    const form = document.querySelector('.form');
    if (!form || document.getElementById('f-multiplayer')) return;
    const btn = document.createElement('button');
    btn.id = 'f-multiplayer';
    btn.type = 'button';
    btn.className = 'ghost wide';
    btn.textContent = '4 人联机大厅';
    btn.onclick = () => this.openLobby();
    const firstLabel = form.querySelector('label');
    form.insertBefore(btn, firstLabel || form.firstChild);
  },

  mountGameButton() {
    const bar = document.querySelector('.inputbar');
    if (!bar || document.getElementById('open-multiplayer')) return;
    const btn = document.createElement('button');
    btn.id = 'open-multiplayer';
    btn.type = 'button';
    btn.className = 'ghost';
    btn.title = '4 人联机大厅';
    btn.textContent = '联机';
    btn.onclick = () => this.openLobby();
    const settings = document.getElementById('open-settings');
    bar.insertBefore(btn, settings || null);
  },

  openLobby() {
    let modal = document.getElementById('mp-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'mp-modal';
      modal.className = 'modal hidden';
      document.body.appendChild(modal);
    }
    const name = localStorage.getItem('mp_name') || (Engine.state && Engine.state.name) || '';
    modal.innerHTML = `
      <div class="modal-box mp-modal-box">
        <h2>4 人联机大厅</h2>
        <p class="hint">先启动本地联机服务器，再创建或加入房间。房主推进游戏，其他玩家同步观看并提交行动建议。</p>
        <label>你的昵称 <input id="mp-name" maxlength="16" value="${this.esc(name)}" placeholder="幸存者"></label>
        <label>服务器 <input id="mp-url" value="${this.esc(this.defaultUrl())}"></label>
        <label>房间码 <input id="mp-room" maxlength="8" value="${this.esc(this.room)}" placeholder="创建房间可留空"></label>
        <div class="mp-lobby-status">${this.statusLine()}</div>
        <div class="row">
          <button class="primary" id="mp-create">创建房间</button>
          <button class="ghost" id="mp-join">加入房间</button>
        </div>
        <div class="row">
          <button class="ghost" id="mp-disconnect">断开联机</button>
          <button class="ghost" id="mp-close">关闭</button>
        </div>
      </div>`;
    modal.classList.remove('hidden');
    document.getElementById('mp-create').onclick = () => this.connectFromModal(true);
    document.getElementById('mp-join').onclick = () => this.connectFromModal(false);
    document.getElementById('mp-disconnect').onclick = () => this.disconnect();
    document.getElementById('mp-close').onclick = () => modal.classList.add('hidden');
  },

  connectFromModal(create) {
    const name = document.getElementById('mp-name').value.trim() || '幸存者';
    const url = document.getElementById('mp-url').value.trim() || this.defaultUrl();
    const room = document.getElementById('mp-room').value.trim().toUpperCase();
    if (!create && !room) return this.toast('加入房间需要填写房间码。');
    localStorage.setItem('mp_name', name);
    this.connect({ url, name, room, create });
  },

  connect({ url, name, room, create }) {
    this.disconnect(false);
    this.status = 'connecting';
    this.renderWidget();
    try { this.socket = new WebSocket(url); }
    catch (e) { this.status = 'offline'; this.toast('联机地址无效。'); return; }
    this.socket.onopen = () => this.send({ type: 'hello', name, room, create });
    this.socket.onmessage = ev => {
      try { this.receive(JSON.parse(ev.data)); }
      catch (e) { this.toast('收到无法解析的联机消息。'); }
    };
    this.socket.onclose = () => {
      const hadRoom = !!this.room;
      this.status = 'offline'; this.id = null; this.room = ''; this.hostId = ''; this.players = [];
      this.renderWidget();
      if (hadRoom) this.toast('联机已断开。');
    };
    this.socket.onerror = () => this.toast('联机连接失败，请确认服务器已启动。');
  },

  disconnect(showToast = true) {
    if (this.socket) {
      try { this.socket.close(); } catch (e) {}
    }
    this.socket = null;
    this.status = 'offline'; this.id = null; this.room = ''; this.hostId = ''; this.players = [];
    this.renderWidget();
    if (showToast) this.toast('已断开联机。');
  },

  send(msg) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify(msg));
    return true;
  },

  receive(msg) {
    if (msg.type === 'welcome') {
      this.status = 'online';
      this.id = msg.id; this.room = msg.room; this.hostId = msg.hostId; this.players = msg.players || [];
      const roomInput = document.getElementById('mp-room'); if (roomInput) roomInput.value = this.room;
      this.toast(this.isHost() ? `已创建房间 ${this.room}，你是房主。` : `已加入房间 ${this.room}。`);
      if (msg.state) this.applySnapshot(msg);
      this.renderWidget();
      this.applyClientLock();
      return;
    }
    if (msg.type === 'players') {
      const wasHost = this.isHost();
      this.hostId = msg.hostId; this.players = msg.players || [];
      if (!wasHost && this.isHost()) this.toast('你现在是房主，可以推进游戏。');
      this.renderWidget(); this.applyClientLock();
      return;
    }
    if (msg.type === 'chat') {
      this.messages.push(msg); this.messages = this.messages.slice(-12);
      this.renderWidget();
      return;
    }
    if (msg.type === 'proposal') {
      this.proposals.unshift(msg); this.proposals = this.proposals.slice(0, 8);
      if (this.isHost() && window.UI && UI.pushSystem && !msg.system) UI.pushSystem(`${msg.from} 建议：${msg.text}`);
      this.renderWidget();
      return;
    }
    if (msg.type === 'state') return this.applySnapshot(msg);
    if (msg.type === 'error') return this.toast(msg.message || '联机错误。');
  },

  statusLine() {
    if (this.status === 'connecting') return '正在连接服务器...';
    if (!this.isConnected()) return '未联机';
    return `房间 ${this.room} · ${this.isHost() ? '房主' : '队员'} · ${this.players.length}/4`;
  },

  renderWidget() {
    let box = document.getElementById('mp-widget');
    if (!this.isConnected() && this.status !== 'connecting') {
      if (box) box.remove();
      return;
    }
    if (!box) {
      box = document.createElement('section');
      box.id = 'mp-widget';
      document.body.appendChild(box);
    }
    const players = this.players.map(p => `<li class="${p.host ? 'host' : ''}"><span>${this.esc(p.name)}</span><b>${p.host ? '房主' : '队员'}</b></li>`).join('') || '<li><span>等待连接</span><b>...</b></li>';
    const proposals = this.proposals.length
      ? this.proposals.map((p, i) => `<button class="mp-proposal" data-p="${i}" title="填入输入框"><b>${this.esc(p.from)}</b><span>${this.esc(p.text)}</span></button>`).join('')
      : '<p class="mp-empty">还没有行动建议</p>';
    const messages = this.messages.length
      ? this.messages.map(m => `<p class="${m.system ? 'sys' : ''}"><b>${this.esc(m.from || '系统')}</b>${this.esc(m.text)}</p>`).join('')
      : '<p class="mp-empty">聊天会显示在这里</p>';
    box.innerHTML = `
      <div class="mp-head"><b>${this.statusLine()}</b><button id="mp-leave" title="断开联机">×</button></div>
      <ul class="mp-players">${players}</ul>
      <div class="mp-block"><em>行动建议</em><div class="mp-proposal-list">${proposals}</div></div>
      <div class="mp-block"><em>聊天</em><div class="mp-chatlog">${messages}</div></div>
      <form id="mp-chat-form"><input id="mp-chat-input" maxlength="160" placeholder="给队伍发消息"><button>发送</button></form>`;
    document.getElementById('mp-leave').onclick = () => this.disconnect();
    const form = document.getElementById('mp-chat-form');
    form.onsubmit = e => {
      e.preventDefault();
      const inp = document.getElementById('mp-chat-input');
      const text = inp.value.trim();
      if (!text) return;
      inp.value = '';
      this.send({ type: 'chat', text });
    };
    box.querySelectorAll('[data-p]').forEach(btn => btn.onclick = () => {
      if (!this.isHost()) return;
      const p = this.proposals[+btn.dataset.p];
      const cmd = document.getElementById('cmd');
      if (p && cmd) { cmd.value = p.text; cmd.focus(); }
    });
  },

  submitCmdProposal() {
    const inp = document.getElementById('cmd');
    const text = inp ? inp.value.trim() : '';
    if (!text) return;
    inp.value = '';
    this.propose(text);
  },

  propose(text) {
    if (!this.isConnected()) return this.toast('还没有加入联机房间。');
    const body = String(text || '').trim();
    if (!body) return;
    this.send({ type: 'proposal', text: body });
    if (window.UI && UI.pushPlayer) UI.pushPlayer(`联机建议：${body}`);
  },

  applyClientLock() {
    if (!this.isConnected() || this.isHost()) return;
    const actions = document.getElementById('actions');
    if (!actions) return;
    if (!actions.querySelector('.mp-client-note')) {
      const note = document.createElement('span');
      note.className = 'mp-client-note';
      note.textContent = '队员模式：点击行动或输入文字，会提交给房主。';
      actions.insertBefore(note, actions.firstChild);
    }
    actions.querySelectorAll('button').forEach(btn => {
      const text = btn.textContent.trim();
      btn.disabled = false;
      btn.classList.add('mp-propose-act');
      btn.title = '提交行动建议给房主';
      btn.onclick = e => { e.preventDefault(); this.propose(text); };
    });
  },

  captureLog() {
    const log = document.getElementById('log');
    return log ? log.innerHTML : '';
  },

  scheduleBroadcast(reason) {
    if (!this.isHost() || !window.Engine || !Engine.state) return;
    clearTimeout(this.broadcastTimer);
    this.broadcastTimer = setTimeout(() => this.broadcastSnapshot(reason), 160);
  },

  broadcastSnapshot(reason) {
    if (!this.isHost() || !Engine.state) return;
    this.send({
      type: 'state',
      reason,
      seed: Engine._seed || 1,
      state: JSON.parse(JSON.stringify(Engine.state)),
      log: this.captureLog(),
    });
  },

  applySnapshot(msg) {
    if (this.isHost() || !msg.state || !window.Engine || !window.UI) return;
    Engine.load({ v: 1, seed: msg.seed || 1, state: msg.state });
    if (!document.querySelector('.game')) UI.renderGame();
    const log = document.getElementById('log');
    if (log && msg.log) { log.innerHTML = msg.log; log.scrollTop = log.scrollHeight; }
    UI.renderActions();
    UI.renderPanel();
    this.mountGameButton();
    this.renderWidget();
  },
};

window.Multiplayer = Multiplayer;
if (window.UI) Multiplayer.init();

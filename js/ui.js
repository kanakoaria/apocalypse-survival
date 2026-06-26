/* ===========================================================================
 * ui.js — 界面控制器
 * 建角 / 主界面 / 可点选项 / 叙事输出 / 状态面板(可交互) / 设置 / 存档 / 结局。
 * 数值逻辑都在 engine.js，这里只负责呈现与交互。
 * ======================================================================== */

const UI = {
  el(id) { return document.getElementById(id); },
  busy: false,
  SAVE_KEY: 'ar_save',
  SAVE_FILE_PREFIX: '末日求生-青阳市',

  init() {
    Narrator.load();
    this.renderSetup();
    this.bindSettings();
  },

  /* ---------------- 建角界面 ---------------- */
  renderSetup() {
    const profOpts = Object.keys(GameData.PROFESSIONS)
      .map(p => `<option value="${p}">${p}　—　${GameData.PROFESSIONS[p].note}</option>`).join('');
    const save = this.getSave();
    const cont = (save && !save.state.over)
      ? `<button class="ghost wide" id="f-continue">▸ 继续上一局（${save.state.name} · 第 ${save.state.week} 周）</button>` : '';
    const saveTools = save
      ? `<div class="save-tools">
          <button class="ghost" id="f-export">导出存档</button>
          <button class="ghost" id="f-import">导入存档</button>
        </div>`
      : `<button class="ghost wide" id="f-import">导入存档</button>`;
    this.el('app').innerHTML = `
      <div class="setup">
        <h1>末日求生<span>· 青阳市</span></h1>
        <p class="tag">文字末日生存 RPG。数值由后台摇骰决定，叙事随境而生。唯一的结局是死亡。</p>
        <div class="form">
          ${cont}
          ${saveTools}
          <label>姓名 <input id="f-name" value="" placeholder="你的名字"></label>
          <div class="row">
            <label>性别
              <select id="f-gender"><option>女</option><option>男</option><option>不明</option></select>
            </label>
            <label>年龄 <input id="f-age" type="number" min="16" max="70" value="24"></label>
          </div>
          <label>职业
            <select id="f-prof">${profOpts}</select>
          </label>
          <label>开局时期
            <select id="f-period">
              <option value="early">爆发初期（1-10 天，幸存者尚多）</option>
              <option value="mid" selected>爆发中期（11-30 天）</option>
              <option value="late">爆发后期（31 天+，最凶险）</option>
            </select>
          </label>
          <p class="hint">提示：可招募队友 ≤ 5 名，且队友死亡率与普通 NPC 相同。NPC 善恶并存、好感极难提升，随时可能背刺。</p>
          <div class="row">
            <button class="primary" id="f-start">进入青阳市</button>
            <button class="ghost" id="f-settings">⚙ 叙事 AI 设置</button>
          </div>
          <p class="hint" id="ai-status"></p>
        </div>
      </div>`;
    this.el('f-start').onclick = () => this.start();
    this.el('f-settings').onclick = () => this.openSettings();
    if (cont) this.el('f-continue').onclick = () => this.continueGame();
    if (save) this.el('f-export').onclick = () => this.exportSave();
    this.el('f-import').onclick = () => this.importSave();
    this.refreshAIStatus();
  },

  refreshAIStatus() {
    const s = this.el('ai-status'); if (!s) return;
    const c = Narrator.cfg;
    s.innerHTML = c.provider === 'offline' || !c.apiKey
      ? '当前：<b>离线涌现叙事</b>（无需 API key，开箱即玩；接入 AI 后叙事更自由多变）'
      : `当前：<b>${c.provider === 'claude' ? 'Claude' : 'OpenAI 兼容'}</b> · 模型 ${Narrator.defaultModel()}`;
  },

  async start() {
    const name = (this.el('f-name').value || '无名者').trim();
    Engine.newGame({
      name,
      gender: this.el('f-gender').value,
      age: this.el('f-age').value,
      profession: this.el('f-prof').value,
      period: this.el('f-period').value,
    });
    this.renderGame();
    await this.narrate('intro');
    this.autosave();
  },

  continueGame() {
    const save = this.getSave();
    if (!save) return;
    Engine.load(save);
    this.renderGame();
    this.pushDivider(`继续 · 第 ${Engine.state.week} 周`);
    this.pushNarr(`你睁开眼，青阳市还在。还活着，就还得做选择。`);
    this.renderActions(); this.renderPanel();
  },

  /* ---------------- 主游戏界面 ---------------- */
  renderGame() {
    this.el('app').innerHTML = `
      <div class="topbar">
        <span class="brand">末日求生 · 青阳市</span>
        <button class="ghost mini" id="toggle-panel">状态</button>
      </div>
      <div class="game">
        <main class="narrative" id="log"></main>
        <aside class="panel" id="panel"></aside>
      </div>
      <div class="mascot-layer" id="mascots" aria-hidden="true"></div>
      <div class="dock">
        <div class="actions" id="actions"></div>
        <div class="inputbar">
          <input id="cmd" placeholder="也可直接输入自由行动 / 对话，回车发送" autocomplete="off">
          <button id="send">发送</button>
          <button class="ghost" id="open-settings" title="叙事 AI 设置">⚙</button>
        </div>
      </div>`;
    this.renderActions();
    this.renderPanel();
    this.el('send').onclick = () => this.freeCommand();
    this.el('cmd').onkeydown = e => { if (e.key === 'Enter') this.freeCommand(); };
    this.el('open-settings').onclick = () => this.openSettings();
    this.el('toggle-panel').onclick = () => document.querySelector('.game').classList.toggle('show-panel');
  },

  renderActions() {
    const s = Engine.state;
    const box = this.el('actions');
    if (s.over) {
      box.innerHTML = `<button class="primary" id="restart">重新开始</button>`;
      this.el('restart').onclick = () => this.renderSetup(); return;
    }
    if (s.ap <= 0) {
      box.innerHTML = `<div class="ap-done">本周行动力已用尽</div><button class="primary" id="weekend">▶ 进入周末结算</button>`;
      this.el('weekend').onclick = () => this.weekend();
      return;
    }
    box.innerHTML = `<span class="ap-pip">行动力 ${s.ap}/4</span>` + GameData.ACTIONS.filter(a => a.id !== 'free').map(a =>
      `<button class="act" data-id="${a.id}" title="${a.desc}">${a.name}</button>`).join('');
    box.querySelectorAll('.act').forEach(b => b.onclick = () => this.chooseAction(b.dataset.id));
  },

  chooseAction(id) {
    if (this.busy) return;
    const def = GameData.ACTIONS.find(a => a.id === id);
    if (!def) return;
    if (def.pickLocation) {
      const title = id === 'recruit' ? '去哪里接触幸存者：' : '选择搜刮地点：';
      this.subMenu(title, this.locationOptions(), loc => this.doAction(id, { location: loc }));
    } else if (def.pickClearLocation) {
      this.subMenu('清理哪片区域：', this.locationOptions(), loc => this.doAction(id, { location: loc }));
    } else if (def.pickTrainAttr) {
      const trainable = GameData.ATTRS.filter(a => !['luck', 'chm'].includes(a.key));
      this.subMenu('训练哪项属性：', trainable.map(a => a.name),
        name => this.doAction(id, { trainAttr: GameData.ATTRS.find(a => a.name === name).key }));
    } else if (def.pickProcess) {
      this.subMenu('选择加工方式：', this.processOptions(), recipeId => this.doAction(id, { recipeId }));
    } else {
      this.doAction(id, {});
    }
  },

  optionItems(options) {
    return options.map(o => typeof o === 'string' ? { value: o, label: o } : o);
  },

  locationOptions() {
    return Object.keys(GameData.LOCATIONS).map(name => {
      const routeTag = Engine.routeLabel(name).replace(/^.* · /, '');
      const factions = Engine.factionsAtLocation(name).map(id => Engine.factionName(id)).join(' / ');
      return {
        value: name,
        label: `${name}（${Engine.locationThreatName(name)} · 总风险${Engine.actionRiskPct(name)}% · ${routeTag}）`,
        title: `${Engine.routeTitle(name)}；常见势力：${factions}`,
      };
    });
  },

  processOptions() {
    return (GameData.PROCESS_RECIPES || []).map(r => {
      const missing = Engine.processMissing(r);
      const tag = missing.length ? `缺 ${missing.join('、')}` : '可做';
      return { value: r.id, label: `${r.name}（${tag}）`, title: r.desc || r.name };
    });
  },

  processRecipeFromText(text) {
    const t = String(text || '');
    if (/净水|净化|烧水|过滤/.test(t)) return 'purify-water';
    if (/泡面|方便面|煮面/.test(t)) return 'cook-noodles';
    if (/腐肉|生肉|处理肉|烤肉/.test(t)) return 'cook-raw';
    if (/热饮|热巧克力|安神饮|甜饮/.test(t)) return 'warm-drink';
    return null;
  },

  subMenu(title, options, cb) {
    const box = this.el('actions');
    const items = this.optionItems(options);
    box.innerHTML = `<div class="submenu-t">${this.esc(title)}</div>` +
      items.map((o, i) => `<button class="act" data-i="${i}" title="${this.esc(o.title || o.label)}">${this.esc(o.label)}</button>`).join('') +
      `<button class="ghost" data-i="__back">返回</button>`;
    box.querySelectorAll('button').forEach(b => b.onclick = () => {
      if (b.dataset.i === '__back') return this.renderActions();
      cb(items[+b.dataset.i].value);
    });
  },

  locationFromText(text) {
    return Object.keys(GameData.LOCATIONS).find(name => String(text || '').includes(name)) || null;
  },

  trainAttrFromText(text) {
    const t = String(text || '');
    return GameData.ATTRS
      .filter(a => !['luck', 'chm'].includes(a.key))
      .find(a => t.includes(a.name) || new RegExp(`练.{0,2}${a.name[0]}`).test(t))?.key || null;
  },

  wantsForageCommand(text) {
    return /找|寻找|搜|搜刮|翻找|觅食|采集|接雨|过滤|烧水|探索/.test(String(text || ''));
  },

  wantsDrinkCommand(text) {
    const t = String(text || '');
    if (this.wantsForageCommand(t)) return false;
    return /喝水|饮水|补水|喝点|喝一口|喝.*(矿泉水|瓶装水|雨水|水)/.test(t);
  },

  wantsEatCommand(text) {
    const t = String(text || '');
    if (this.wantsForageCommand(t)) return false;
    return /吃饭|吃东西|吃点|吃些|进食|用餐|开饭|口粮|垫垫|充饥|填肚|吃.*(罐头|饼干|干粮|泡面|能量棒|巧克力|食物)/.test(t);
  },

  routeTypedCommand(text) {
    const t = String(text || '').trim();
    const loc = this.locationFromText(t);
    const attr = this.trainAttrFromText(t);
    if (/结算|周末/.test(t)) return { kind: 'weekend' };
    const recipeId = this.processRecipeFromText(t);
    if (recipeId) return { kind: 'action', id: 'process', opt: { recipeId } };
    if (/加工补给|做饭|煮饭|烹饪|处理食物|做吃的/.test(t)) return { kind: 'action', id: 'process', opt: {} };
    if (/处理伤|包扎|伤口|医疗|止血|疗伤/.test(t)) return { kind: 'hint', what: 'med' };
    if (this.wantsDrinkCommand(t)) return { kind: 'hint', what: 'water' };
    if (this.wantsEatCommand(t)) return { kind: 'hint', what: 'food' };

    if (loc && /清理|清剿|肃清|杀|丧尸|尸群/.test(t)) {
      return { kind: 'action', id: 'clear', opt: { location: loc } };
    }
    if (loc && /找人|幸存者|招募|交流|打听|交涉|交易|谈/.test(t)) {
      return { kind: 'action', id: 'recruit', opt: { location: loc } };
    }

    const scoutLike = /侦察|观察|探路|踩点|望风|盯梢/.test(t);
    if (loc && !scoutLike && /去|到|进|进入|搜|找|翻|看看|检查|探索|摸进|潜入/.test(t)) {
      return { kind: 'action', id: 'scavenge', opt: { location: loc } };
    }

    const it = this.matchIntent(t);
    if (it.kind === 'action') {
      const opt = {};
      if ((it.id === 'scavenge' || it.id === 'clear' || it.id === 'recruit') && loc) opt.location = loc;
      if (it.id === 'train' && attr) opt.trainAttr = attr;
      if (it.id === 'process' && it.recipeId) opt.recipeId = it.recipeId;
      return { kind: 'action', id: it.id, opt };
    }
    if (it.kind === 'hint' || it.kind === 'weekend') return it;
    return null;
  },

  /* ---------------- 行动执行 ---------------- */
  async doAction(id, opt) {
    if (this.busy) return;
    const res = Engine.runAction(id, opt);
    if (res.error) { this.toast(res.error); this.renderActions(); return; }
    if (opt && opt.sourceText) this.pushPlayer(`“${opt.sourceText}” → ${res.action}${res.location ? '·' + res.location : ''}`);
    else this.pushPlayer(`▷ ${res.action}${res.location ? '·' + res.location : ''}`);
    await this.narrate('action', res);
    this.afterTurn();
  },

  async freeCommand() {
    const inp = this.el('cmd'); const text = inp.value.trim();
    if (!text || this.busy) return;
    inp.value = '';
    const s = Engine.state;
    if (s.over) return;
    const routed = this.routeTypedCommand(text);
    if (routed && routed.kind === 'weekend') {
      if (s.ap <= 0) { this.pushPlayer(`“${text}”`); await this.weekend(); }
      else this.toast('还有行动力，先把这周过完。');
      return;
    }
    if (routed && routed.kind === 'hint') {
      this.pushPlayer(`“${text}”`);
      this.autoUse(routed.what);
      return;
    }
    if (s.ap <= 0) { this.toast('本周行动力已用尽，请先进行周末结算。'); return; }
    if (routed && routed.kind === 'action') {
      const def = GameData.ACTIONS.find(a => a.id === routed.id);
      const opt = { ...(routed.opt || {}) };
      opt.sourceText = text;
      if (def.pickLocation && !opt.location) {
        this.pushPlayer(`“${text}”`);
        this.subMenu('选择搜刮地点：', this.locationOptions(), loc => this.doAction(routed.id, { location: loc, sourceText: text }));
        return;
      }
      if (def.pickClearLocation && !opt.location) {
        this.pushPlayer(`“${text}”`);
        this.subMenu('清理哪片区域：', this.locationOptions(), loc => this.doAction(routed.id, { location: loc, sourceText: text }));
        return;
      }
      if (def.pickTrainAttr && !opt.trainAttr) {
        const trainable = GameData.ATTRS.filter(a => !['luck', 'chm'].includes(a.key));
        this.pushPlayer(`“${text}”`);
        this.subMenu('训练哪项属性：', trainable.map(a => a.name),
          name => this.doAction(routed.id, { trainAttr: GameData.ATTRS.find(a => a.name === name).key, sourceText: text }));
        return;
      }
      if (def.pickProcess && !opt.recipeId) {
        this.pushPlayer(`“${text}”`);
        this.subMenu('选择加工方式：', this.processOptions(), recipeId => this.doAction(routed.id, { recipeId, sourceText: text }));
        return;
      }
      await this.doAction(routed.id, opt);
      return;
    }
    const res = Engine.runAction('free', { freeText: text });
    if (res.error) { this.toast(res.error); return; }
    this.pushPlayer(`“${text}”`);
    await this.narrate('action', res);
    this.afterTurn();
  },

  async weekend() {
    if (this.busy) return;
    const res = Engine.endWeek();
    this.pushDivider(`周末结算 · 第 ${res.week} 周`);
    await this.narrate('weekend', res);
    this.afterTurn();
  },

  afterTurn() {
    this.renderActions();
    this.renderPanel();
    this.autosave();
    if (Engine.state.over) this.onGameOver();
  },

  /* ---------------- 可点选项：把选项文字映射到行动 ---------------- */
  lockChoice(btnEl) {
    if (!btnEl) return;
    const wrap = btnEl.closest('.choices');
    if (wrap) wrap.querySelectorAll('.choice').forEach(b => { b.disabled = true; if (b === btnEl) b.classList.add('chosen'); });
  },

  onChoice(text, btnEl) {
    if (this.busy) return;
    const s = Engine.state;
    const it = this.matchIntent(text);

    if (it.kind === 'weekend') {
      if (s.ap <= 0) { this.lockChoice(btnEl); this.weekend(); }
      else this.toast('还有行动力，先把这周过完。');
      return;
    }
    if (it.kind === 'hint') {
      if (this.autoUse(it.what)) this.lockChoice(btnEl);
      return;
    }   // 直接用最合适的物品，结果显示在正文
    if (it.kind === 'action') {
      if (s.ap <= 0) { this.toast('本周行动力已用尽，请先周末结算。'); return; }
      const def = GameData.ACTIONS.find(a => a.id === it.id);
      this.lockChoice(btnEl);
      // 需要二级选择时，把子选项也做成正文内可点项（保持在叙事流里）
      if (def.pickLocation) {
        const title = it.id === 'recruit' ? '去哪里接触幸存者？' : '去哪里搜？';
        this.pushSubChoices(title, this.locationOptions(), loc => this.doAction(it.id, { location: loc }));
      } else if (def.pickClearLocation) {
        this.pushSubChoices('清理哪片区域？', this.locationOptions(), loc => this.doAction(it.id, { location: loc }));
      } else if (def.pickTrainAttr) {
        const tr = GameData.ATTRS.filter(a => !['luck', 'chm'].includes(a.key));
        this.pushSubChoices('训练哪一项？', tr.map(a => a.name), nm => this.doAction(it.id, { trainAttr: GameData.ATTRS.find(a => a.name === nm).key }));
      } else if (def.pickProcess) {
        if (it.recipeId) this.doAction(it.id, { recipeId: it.recipeId });
        else this.pushSubChoices('加工哪一种补给？', this.processOptions(), recipeId => this.doAction(it.id, { recipeId }));
      } else {
        this.doAction(it.id, {});
      }
      return;
    }
    // free
    if (s.ap <= 0) { this.toast('本周行动力已用尽，请先周末结算。'); return; }
    this.lockChoice(btnEl);
    this.el('cmd').value = it.text;
    this.freeCommand();
  },

  // 正文内的二级可点选项（去哪搜 / 练什么）
  pushSubChoices(title, options, cb) {
    const log = this.el('log');
    const items = this.optionItems(options);
    const wrap = document.createElement('div'); wrap.className = 'msg narr';
    wrap.innerHTML = `<p class="dim">${this.esc(title)}</p>`;
    const oc = document.createElement('div'); oc.className = 'choices';
    items.forEach((o, i) => {
      const b = document.createElement('button');
      b.className = 'choice'; b.innerHTML = `<span class="num">${i + 1}</span>${this.esc(o.label)}`;
      if (o.title) b.title = o.title;
      b.onclick = () => {
        oc.querySelectorAll('.choice').forEach(x => { x.disabled = true; if (x === b) x.classList.add('chosen'); });
        cb(o.value);
      };
      oc.appendChild(b);
    });
    wrap.appendChild(oc);
    log.appendChild(wrap); log.scrollTop = log.scrollHeight;
  },

  // 点「处理伤口 / 吃饭 / 喝水」→ 自动使用携带里最合适的一件（不耗行动力，不摇骰）
  autoUse(category) {
    const want = category === 'med' ? ['med'] : category === 'water' ? ['water'] : ['food', 'raw'];
    let best = null;
    for (const it of Engine.state.inventory) {
      const eff = Engine._effectFor(it);
      if (!eff || !want.includes(eff.type)) continue;
      const treatScore = Object.values(eff.treats || {}).reduce((sum, n) => sum + n, 0) * 24;
      const score = treatScore + (eff.hp ? eff.hp[0] + eff.hp[1] : 0) + (eff.hunger ? eff.hunger[0] + eff.hunger[1] : 0) + (eff.hydration ? eff.hydration[0] + eff.hydration[1] : 0);
      if (!best || score > best.score) best = { name: it, score };
    }
    if (!best) {
      const msg = category === 'med'
        ? '背包里没有医疗物品，可继续选择别的行动。'
        : category === 'water'
          ? '背包里没有水，可继续选择别的行动。'
          : '背包里没有食物，可继续选择别的行动。';
      this.toast(msg);
      this.pushSystem(msg);
      return false;
    }
    return this.useCarried(best.name);
  },

  matchIntent(raw) {
    const t = raw.replace(/^\s*\d+[\.\、:：]?\s*/, '').trim();
    const ap = Engine.state.ap;
    if (ap <= 0 && /结算|周末/.test(t)) return { kind: 'weekend' };
    const recipeId = this.processRecipeFromText(t);
    if (recipeId) return { kind: 'action', id: 'process', recipeId };
    if (/加工补给|做饭|煮饭|烹饪|处理食物|做吃的/.test(t)) return { kind: 'action', id: 'process' };
    if (/处理伤|包扎|伤口|医疗|止血|疗伤/.test(t)) return { kind: 'hint', what: 'med' };
    if (this.wantsDrinkCommand(t)) return { kind: 'hint', what: 'water' };
    if (this.wantsEatCommand(t)) return { kind: 'hint', what: 'food' };
    const map = [
      ['scavenge', /寻找物资|搜刮|找.{0,6}(物资|食物|水|药|补给|吃的)|翻找|搜一?搜|换个?地方|出门搜|出去找|搜物资/],
      ['fortify',  /修缮|加固|庇护所|修补|筑/],
      ['clear',    /清理|清剿|清.{0,3}丧尸|清.{0,3}尸|肃清|打丧尸|杀丧尸|处理.{0,3}尸/],
      ['recruit',  /招募|交流|幸存者|找人|碰.{0,3}活人|结识/],
      ['craft',    /制造|改装|打造|做.{0,3}(武器|护甲)/],
      ['process',  /加工补给|做饭|煮饭|烹饪|净水|烧水|过滤|煮泡面|处理腐肉|热饮|做吃的/],
      ['train',    /训练|锻炼|练[力敏智感口]|练.{0,4}(力量|敏捷|智力|感知|口才)/],
      ['research', /研究|阅读|翻阅|看书|读.{0,2}书|查资料/],
      ['chat',     /闲聊|聊天|玩牌|与队友/],
      ['pray',     /祈祷|冥想|放松|调适/],
      ['rest',     /休整|休息|睡|歇/],
    ];
    for (const [id, re] of map) if (re.test(t)) return { kind: 'action', id };
    return { kind: 'free', text: t };
  },

  /* ---------------- 叙事输出 ---------------- */
  async narrate(kind, payload) {
    this.busy = true;
    const wait = this.pushNarr('「……」', { temp: true });
    let out;
    try { out = await Narrator.narrate(kind, payload); }
    catch (e) { out = { text: '（叙事出错：' + e.message + '）', delta: null }; }
    wait.remove();
    this.pushNarr(out.text, { detail: this.detailLines(kind, payload) });
    // AI 模式可能附带物品/关系变更：引擎校验落地，绝不含数值
    if (out.delta) {
      const ap = Engine.applyAIDelta(out.delta);
      const line = this.aiDeltaText(ap);
      if (line) { this.pushSystem(line); this.renderPanel(); this.autosave(); }
    }
    this.busy = false;
  },

  aiDeltaText(ap) {
    if (!ap) return '';
    const bits = [];
    if (ap.gained.length) bits.push('获得 ' + ap.gained.join('、'));
    if (ap.lost.length) bits.push('失去 ' + ap.lost.join('、'));
    const rel = Object.entries(ap.relations || {});
    if (rel.length) bits.push(rel.map(([n, v]) => `${n}好感→${v}`).join('，'));
    return bits.join(' · ');
  },

  detailLines(kind, payload) {
    if (!payload) return null;
    const lines = [];
    if (payload.parts) lines.push(...payload.parts);
    if (kind === 'weekend' && payload.event) lines.unshift(`随机事件：${payload.event.title}`);
    if (payload.threatChanges && payload.threatChanges.length) {
      lines.push('区域变化：' + payload.threatChanges.map(c => `${c.location}${c.before}→${c.after}`).join('，'));
    }
    if (payload.routeChanges && payload.routeChanges.length) {
      const routeText = payload.routeChanges.map(c => {
        if (c.discover) return `发现${c.name}${c.blocked ? '(堵塞)' : ''}`;
        if (c.unblock) return `打通${c.name}`;
        if (c.block) return `${c.name}堵塞`;
        return `${c.name}${c.before}→${c.after}`;
      }).join('，');
      lines.push('路线变化：' + routeText);
    }
    if (payload.injuryChanges && payload.injuryChanges.length) {
      lines.push('伤势变化：' + payload.injuryChanges.map(c => `${c.name}${c.before}→${c.after}${c.reason ? '(' + c.reason + ')' : ''}`).join('，'));
    }
    if (payload.factionChanges && payload.factionChanges.length) {
      lines.push('势力变化：' + payload.factionChanges.map(c => `${c.name}${c.before}→${c.after}${c.reason ? '(' + c.reason + ')' : ''}`).join('，'));
    }
    if (payload.companionChanges && payload.companionChanges.length) {
      lines.push('队友变化：' + payload.companionChanges.map(c => `${c.name}${c.field}${c.before}→${c.after}${c.reason ? '(' + c.reason + ')' : ''}`).join('，'));
    }
    if (payload.storyChanges && payload.storyChanges.length) {
      const storyText = payload.storyChanges.map(c => {
        if (c.type === 'stage') return `推进至「${c.name}」`;
        if (c.type === 'pulse') return `回响「${c.name}」`;
        return `发现「${c.name}」`;
      }).join('，');
      lines.push('主线谜团：' + storyText);
    }
    const d = payload.deltas;
    if (d) {
      const names = { hp: '生命', hunger: '饱腹', hydration: '水分', san: 'San', infection: '感染' };
      const ds = Object.keys(d).filter(k => d[k]).map(k => `${names[k] || k}${d[k] > 0 ? '+' : ''}${d[k]}`);
      if (ds.length) lines.push('结算：' + ds.join('，'));
    }
    return lines.length ? lines : null;
  },

  // 解析叙事文本：分出正文段落与编号选项，选项渲染成可点按钮
  pushNarr(text, { temp = false, detail = null } = {}) {
    const log = this.el('log');
    const wrap = document.createElement('div');
    wrap.className = 'msg narr' + (temp ? ' temp' : '');

    const lines = (text || '').split('\n');
    const proseLines = [], options = [];
    for (const ln of lines) {
      if (/^\s*\d+[\.\、]/.test(ln)) options.push(ln.replace(/^\s*\d+[\.\、]\s*/, '').trim());
      else proseLines.push(ln);
    }
    wrap.innerHTML = this.fmtProse(proseLines.join('\n'));

    if (detail && detail.length) {
      const det = document.createElement('details');
      det.className = 'check';
      det.innerHTML = `<summary>判定详情</summary>` + detail.map(d => `<div>${this.esc(d)}</div>`).join('');
      wrap.appendChild(det);
    }
    if (options.length && !temp) {
      const oc = document.createElement('div'); oc.className = 'choices';
      options.forEach((o, i) => {
        const b = document.createElement('button');
        b.className = 'choice'; b.innerHTML = `<span class="num">${i + 1}</span>${this.esc(o)}`;
        b.onclick = () => this.onChoice(o, b);
        oc.appendChild(b);
      });
      wrap.appendChild(oc);
    }
    log.appendChild(wrap);
    log.scrollTop = log.scrollHeight;
    return wrap;
  },

  pushPlayer(text) {
    const log = this.el('log');
    const d = document.createElement('div');
    d.className = 'msg player'; d.textContent = text;
    log.appendChild(d); log.scrollTop = log.scrollHeight;
  },
  pushSystem(text) {
    const log = this.el('log');
    const d = document.createElement('div');
    d.className = 'msg sys'; d.textContent = '· ' + text;
    log.appendChild(d); log.scrollTop = log.scrollHeight;
  },
  pushDivider(text) {
    const log = this.el('log');
    const d = document.createElement('div');
    d.className = 'divider'; d.innerHTML = `<span>${this.esc(text)}</span>`;
    log.appendChild(d); log.scrollTop = log.scrollHeight;
  },

  esc(t) { return (t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); },
  fmtProse(t) {
    let h = this.esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    return h.split('\n').map(l => l.trim() ? `<p>${l}</p>` : '').join('');
  },

  mascotState() {
    const s = Engine.state, v = s.vitals;
    const heroTags = [];
    if (v.infection >= 61) heroTags.push('infected');
    else if (v.infection >= 31) heroTags.push('fever');
    const injuries = Engine.injuryIntel ? Engine.injuryIntel() : [];
    if (injuries.some(i => i.type === 'bleeding' && i.value >= 2)) heroTags.push('bleeding');
    else if (injuries.some(i => i.type === 'fracture')) heroTags.push('fracture');
    else if (injuries.some(i => i.type === 'fever')) heroTags.push('fever');
    if (v.hp <= 19) heroTags.push('critical');
    else if (v.hp <= 49) heroTags.push('hurt');
    if (v.san <= 19) heroTags.push('panic');
    else if (v.san <= 49) heroTags.push('sad');
    if (v.hydration <= 19) heroTags.push('dehydrate');
    else if (v.hydration <= 49) heroTags.push('thirsty');
    if (v.hunger <= 19) heroTags.push('starve');
    else if (v.hunger <= 49) heroTags.push('hungry');
    const heroMood = heroTags[0] || 'steady';
    const heroText = {
      infected: '感染发热', fever: '低烧', bleeding: '失血', fracture: '骨伤', critical: '濒死', hurt: '受伤', panic: '崩溃边缘', sad: '低落', dehydrate: '脱水', thirsty: '口渴', starve: '虚脱', hungry: '饿', steady: '还撑着'
    }[heroMood];

    let companion = null;
    if (s.companions && s.companions.length) {
      const sorted = [...Engine.ensureCompanions()].sort((a, b) => ((b.stress || 0) + (b.wound || 0)) - ((a.stress || 0) + (a.wound || 0)));
      const c = sorted[0];
      const tags = [];
      if ((c.wound || 0) >= 55) tags.push('critical');
      else if ((c.wound || 0) >= 25) tags.push('hurt');
      if ((c.stress || 0) >= 85) tags.push('panic');
      else if ((c.stress || 0) >= 60) tags.push('sad');
      const mood = tags[0] || 'steady';
      companion = { name: c.name, role: '队友', mood, text: mood === 'critical' ? '重伤' : mood === 'hurt' ? '挂彩' : mood === 'panic' ? '快崩了' : mood === 'sad' ? '紧绷' : '跟上了' };
    }
    return { hero: { name: s.name || '你', role: '主角', mood: heroMood, text: heroText }, companion };
  },

  mascotHTML(m, extra = '') {
    const name = this.esc(m.name).slice(0, 8);
    return `<div class="mascot ${extra} mood-${m.mood}" title="${this.esc(m.role)}：${this.esc(m.text)}">
      <div class="m-bubble"><b>${name}</b><span>${this.esc(m.text)}</span></div>
      <div class="m-sprite">
        <i class="m-hair"></i><i class="m-head"></i><i class="m-eye left"></i><i class="m-eye right"></i><i class="m-mouth"></i>
        <i class="m-body"></i><i class="m-arm left"></i><i class="m-arm right"></i><i class="m-leg left"></i><i class="m-leg right"></i>
        <i class="m-heart"></i><i class="m-bandage"></i>
      </div>
    </div>`;
  },

  renderMascots() {
    const box = this.el('mascots');
    if (!box || !Engine.state) return;
    const m = this.mascotState();
    box.innerHTML = this.mascotHTML(m.hero, 'hero') + (m.companion ? this.mascotHTML(m.companion, 'ally') : '');
  },

  /* ---------------- 状态面板（可交互） ---------------- */
  renderPanel() {
    const s = Engine.state, v = s.vitals;
    const bar = (key) => {
      const def = GameData.VITALS.find(x => x.key === key);
      const val = v[key], pct = Math.round((val / def.max) * 100);
      const tier = GameData.vitalTier(key, val);
      const capNote = key === 'hp' && s.hpCap < 100 ? `<i>/上限${s.hpCap}</i>` : '';
      const warn = (key === 'infection' && val >= 31) || (key !== 'infection' && val <= 19) ? ' warn' : '';
      return `<div class="vital ${key}${warn}">
        <div class="vrow"><span>${def.name}</span><span>${val}${capNote} <em>${tier}</em></span></div>
        <div class="track"><div class="fill" style="width:${pct}%"></div></div></div>`;
    };
    const attrs = GameData.ATTRS.map(a =>
      `<div class="attr"><span>${a.name}</span><b>${s.attrs[a.key]}</b></div>`).join('');
    const buffs = s.buffs.length
      ? s.buffs.map(b => `<div class="buff" title="${b.desc}">「${b.name}」</div>`).join('') : '<span class="dim">无</span>';
    const injuryList = Engine.injuryIntel ? Engine.injuryIntel() : [];
    const injuries = injuryList.length
      ? injuryList.map(i => `<div class="injury i-${i.type}" title="${this.esc(i.desc)}"><b>${this.esc(i.name)}</b><span>${this.esc(i.level)}</span></div>`).join('')
      : '<span class="dim">暂无持续伤势</span>';

    const carried = s.inventory.length
      ? s.inventory.map((it, i) => {
          const usable = Engine.usable(it);
          const btn = it.startsWith('背包') ? ''
            : usable ? `<button class="ibtn use" data-use="${i}">用</button>`
            : `<button class="ibtn dep" data-dep="${i}">存</button>`;
          return `<li${usable ? ' class="u"' : ''}><span>${it}</span>${btn}</li>`;
        }).join('')
      : '<li class="dim">空</li>';
    const ware = s.warehouse.length
      ? s.warehouse.map((it, i) => `<li><span>${it}</span><button class="ibtn wd" data-wd="${i}">取</button></li>`).join('')
      : '<li class="dim">空</li>';

    const comps = s.companions.length ? s.companions.map(c => {
      const p = Engine.companionPersonality(c.personality);
      const stress = Engine.stressName(c.stress || 0);
      const wound = Engine.woundName(c.wound || 0);
      const loyalty = Engine.companionLoyalty(c);
      const mem = c.memories && c.memories.length ? `<div class="dim small">记忆：${this.esc(c.memories[0])}</div>` : '';
      return `<div class="comp"><b>${c.name}</b> <span class="dim">${c.profession}${c.factionName ? ' · ' + c.factionName : ''}</span>
        <span class="aff ${c.affinity < 0 ? 'neg' : ''}">好感 ${c.affinity}</span>
        <div class="cstats"><em>${this.esc(p.name)}</em><em>惧${this.esc(c.fear)}</em><em class="${(c.stress || 0) >= 60 ? 'bad' : ''}">${stress}</em><em class="${(c.wound || 0) >= 25 ? 'bad' : ''}">${wound}</em><em>忠诚 ${loyalty}</em></div>
        <div class="dim small">${c.top.map(t => t.name + t.val).join(' · ')}</div>${mem}</div>`;
    }).join('')
      : '<span class="dim">独身一人</span>';
    const rels = Object.keys(s.relations).length
      ? Object.entries(s.relations).map(([n, a]) => `<div class="rel"><span>${n}</span><b class="${a < 0 ? 'neg' : ''}">${a}</b></div>`).join('')
      : '<span class="dim">尚无熟人</span>';
    const zones = Object.keys(GameData.LOCATIONS).map(name => {
      const lv = Engine.locationThreat(name);
      return `<div class="zone z${lv}"><span>${name}<em>${Engine.locationThreatName(name)}</em></span><b>${Engine.locationRiskPct(name)}%</b></div>`;
    }).join('');
    const routes = Engine.routeIntel().map(r =>
      `<div class="route ${r.status === '堵塞' ? 'blocked' : r.noise >= 3 ? 'loud' : ''}" title="${this.esc(r.note)}">
        <span><b>${this.esc(r.name)}</b><em>${this.esc(r.from)}→${this.esc(r.to)}</em></span>
        <strong>${this.esc(r.status)} · 噪${r.noise} · ${r.risk >= 0 ? '+' : ''}${r.risk}%</strong>
      </div>`).join('');
    const factions = Engine.factionIntel().map(f =>
      `<div class="faction ${f.rep < -20 ? 'bad' : f.rep >= 35 ? 'good' : ''}" title="${this.esc(f.note)}">
        <span><b>${this.esc(f.name)}</b><em>${this.esc(f.type)} · ${this.esc(f.locations.join('/'))}</em></span>
        <strong>${this.esc(f.stance)} ${f.rep >= 0 ? '+' : ''}${f.rep}</strong>
      </div>`).join('');
    const story = Engine.storyIntel();
    const storyNeed = story.nextNeed == null ? '核心线索已接近完整' : `距「${this.esc(story.nextName)}」 ${story.clueCount}/${story.nextNeed}`;
    const storyPct = story.nextNeed == null ? 100 : Math.min(100, Math.round((story.clueCount / Math.max(1, story.nextNeed)) * 100));
    const storyClues = story.clues.length
      ? story.clues.slice(-5).reverse().map(c => `<div class="story-clue" title="${this.esc(c.text)}"><b>${this.esc(c.name)}</b><span>${this.esc(c.text)}</span></div>`).join('')
      : '<span class="dim">暂无线索</span>';

    this.el('panel').innerHTML = `
      <div class="phead">
        <div class="who"><b>${s.name}</b> · ${s.gender} · ${s.age}岁 · ${s.profession}</div>
        <div class="time">第 <b>${s.week}</b> 周 · 第 ${s.day} 天 · 行动力 <b>${s.ap}</b>/4</div>
      </div>
      <div class="vitals">${GameData.VITALS.map(x => bar(x.key)).join('')}</div>
      <div class="sec injury-sec"><h3>持续伤势</h3><div class="injuries">${injuries}</div></div>
      <div class="sec priority-sec"><h3>属性</h3><div class="attrs priority-attrs">${attrs}</div></div>
      <div class="sec priority-sec carry-sec"><h3>携带物品 <span class="dim">(${s.inventory.length}/${Engine.carryCap()})</span></h3>
        <ul class="inv carried priority-inv">${carried}</ul></div>
      <div class="sec"><h3>状态加成</h3><div class="buffs">${buffs}</div></div>
      <div class="sec"><h3>区域态势 <span class="dim">(区域风险)</span></h3><div class="zones">${zones}</div></div>
      <div class="sec"><h3>路线情报 <span class="dim">(外出额外风险)</span></h3><div class="routes">${routes}</div></div>
      <div class="sec"><h3>势力声望</h3><div class="factions">${factions}</div></div>
      <div class="sec"><h3>主线谜团</h3>
        <div class="storybox">
          <div class="story-stage"><b>${this.esc(story.title)} · ${this.esc(story.stageName)}</b><span>${story.clueCount}/${story.total}</span></div>
          <div class="story-desc">${this.esc(story.desc)}</div>
          <div class="story-progress" title="${this.esc(storyNeed)}"><i style="width:${storyPct}%"></i></div>
          <div class="story-meta">${storyNeed}</div>
          <div class="story-clues">${storyClues}</div>
        </div>
      </div>
      <div class="sec"><h3>队友 <span class="dim">(${s.companions.length}/5)</span></h3>${comps}</div>
      <div class="sec"><h3>人际关系</h3>${rels}</div>
      <div class="sec"><h3>庇护所仓库 <span class="dim">(${s.warehouse.length})</span></h3>
        <ul class="inv">${ware}</ul></div>
      <div class="sec save-sec"><h3>存档</h3>
        <div class="save-actions">
          <button class="sbtn" id="save-export">导出</button>
          <button class="sbtn" id="save-import">导入</button>
        </div>
      </div>`;

    // 物品交互（不耗行动力）
    this.el('save-export').onclick = () => this.exportSave();
    this.el('save-import').onclick = () => this.importSave();
    this.el('panel').querySelectorAll('[data-use]').forEach(b => b.onclick = () => this.useCarried(s.inventory[+b.dataset.use]));
    this.el('panel').querySelectorAll('[data-dep]').forEach(b => b.onclick = () => { Engine.deposit(s.inventory[+b.dataset.dep]); this.renderPanel(); this.autosave(); });
    this.el('panel').querySelectorAll('[data-wd]').forEach(b => b.onclick = () => {
      const name = s.warehouse[+b.dataset.wd];
      if (!Engine.withdraw(name)) this.toast('背包已满，先腾出空间'); else { this.renderPanel(); this.autosave(); }
    });
    this.renderMascots();
  },

  useCarried(name) {
    const r = Engine.useItem(name);
    if (!r.ok) { this.toast(r.msg); return false; }
    this.pushSystem(r.msg + this.deltaText(r.deltas));
    this.renderPanel();
    this.autosave();
    if (Engine.state.over) this.onGameOver();
    return true;
  },
  deltaText(d) {
    const names = { hp: '生命', hunger: '饱腹', hydration: '水分', san: 'San', infection: '感染' };
    const ds = Object.keys(d || {}).filter(k => d[k]).map(k => `${names[k] || k}${d[k] > 0 ? '+' : ''}${d[k]}`);
    return ds.length ? '（' + ds.join('，') + '）' : '';
  },

  onGameOver() {
    this.pushDivider('游戏结束');
    this.pushNarr(`**${Engine.state.overReason}**\n\n你在青阳市存活了 ${Engine.state.week} 周。\n这座城市不会记得你，但你确实曾经挣扎过。`);
    this.renderActions();
    try { localStorage.removeItem(this.SAVE_KEY); } catch (e) {}
  },

  toast(msg) {
    const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.classList.add('show'), 10);
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2400);
  },

  /* ---------------- 存档 ---------------- */
  autosave() { try { localStorage.setItem(this.SAVE_KEY, Engine.serialize()); } catch (e) {} },
  getSave() { try { const j = localStorage.getItem(this.SAVE_KEY); return j ? JSON.parse(j) : null; } catch (e) { return null; } },
  activeSaveRaw() {
    if (Engine.state) {
      const raw = Engine.serialize();
      try { localStorage.setItem(this.SAVE_KEY, raw); } catch (e) {}
      return raw;
    }
    try { return localStorage.getItem(this.SAVE_KEY); } catch (e) { return null; }
  },
  saveFileName(save) {
    const s = save && save.state ? save.state : {};
    const name = String(s.name || '无名者').replace(/[\\/:*?"<>|]/g, '_').slice(0, 24);
    const week = Number.isFinite(+s.week) ? s.week : 1;
    return `${this.SAVE_FILE_PREFIX}-${name}-第${week}周.json`;
  },
  exportSave() {
    const raw = this.activeSaveRaw();
    if (!raw) { this.toast('没有可导出的存档'); return; }
    let save;
    try { save = JSON.parse(raw); } catch (e) { this.toast('当前存档损坏，无法导出'); return; }
    const blob = new Blob([JSON.stringify(save, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = this.saveFileName(save);
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    this.toast('存档已导出');
  },
  importSave() {
    if (this.getSave() && !confirm('导入会覆盖当前自动存档，继续？')) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = () => {
      const file = input.files && input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => this.loadImportedSave(reader.result);
      reader.onerror = () => this.toast('读取存档失败');
      reader.readAsText(file, 'utf-8');
    };
    input.click();
  },
  loadImportedSave(raw) {
    let save;
    try { save = JSON.parse(raw); }
    catch (e) { this.toast('不是有效的 JSON 存档'); return; }
    const err = this.validateSave(save);
    if (err) { this.toast(err); return; }
    try {
      Engine.load(save);
      localStorage.setItem(this.SAVE_KEY, Engine.serialize());
    } catch (e) {
      this.toast('导入失败：存档结构不完整');
      return;
    }
    this.renderGame();
    this.pushDivider(`导入 · 第 ${Engine.state.week} 周`);
    this.pushNarr(`你把一份旧记录重新压进青阳市的黑夜里。名字、伤口、欠下的债，都回来了。`);
    this.renderActions();
    this.renderPanel();
    this.toast('存档已导入');
  },
  validateSave(save) {
    if (!save || typeof save !== 'object') return '存档格式不正确';
    if (!save.state || typeof save.state !== 'object') return '存档缺少角色状态';
    const s = save.state;
    if (!s.vitals || !s.attrs) return '存档缺少数值面板';
    const vitalKeys = ['hp', 'hunger', 'san', 'infection'];
    if (s.vitals.hydration != null && !Number.isFinite(+s.vitals.hydration)) return '存档水分无效';
    const attrKeys = GameData.ATTRS.map(a => a.key);
    if (!vitalKeys.every(k => Number.isFinite(+s.vitals[k]))) return '存档生命/饱腹/San/感染无效';
    if (!attrKeys.every(k => Number.isFinite(+s.attrs[k]))) return '存档属性无效';
    if (!Array.isArray(s.inventory)) return '存档物品列表无效';
    if (!Array.isArray(s.companions) || !Array.isArray(s.buffs)) return '存档队友或状态列表无效';
    return null;
  },

  /* ---------------- 设置弹窗 ---------------- */
  bindSettings() {
    const m = document.createElement('div'); m.id = 'modal'; m.className = 'modal hidden';
    m.innerHTML = `
      <div class="modal-box">
        <h2>叙事 AI 设置</h2>
        <p class="hint">游戏数值始终由本地引擎裁定；AI 只负责把结果写成叙事。无 key 时为离线涌现叙事，一样能玩。</p>
        <label>叙事来源
          <select id="m-provider">
            <option value="offline">离线涌现叙事（无需 key）</option>
            <option value="claude">Claude（api.anthropic.com）</option>
            <option value="openai">OpenAI 兼容 / DeepSeek</option>
          </select>
        </label>
        <label>API Key <input id="m-key" type="password" placeholder="sk-..."></label>
        <label>模型 <input id="m-model" placeholder="claude-sonnet-4-6 或 deepseek-chat"></label>
        <label id="m-base-wrap">Base URL（OpenAI 兼容时）<input id="m-base" placeholder="https://api.deepseek.com"></label>
        <p class="hint">注：浏览器直连第三方 API 需对方允许 CORS。Key 仅存于本机 localStorage。</p>
        <div class="row">
          <button class="primary" id="m-save">保存</button>
          <button class="ghost" id="m-close">取消</button>
        </div>
      </div>`;
    document.body.appendChild(m);
    this.el('m-save').onclick = () => {
      Narrator.save({
        provider: this.el('m-provider').value,
        apiKey: this.el('m-key').value.trim(),
        model: this.el('m-model').value.trim(),
        baseUrl: this.el('m-base').value.trim(),
      });
      this.closeSettings(); this.refreshAIStatus(); this.toast('已保存设置');
    };
    this.el('m-close').onclick = () => this.closeSettings();
    this.el('m-provider').onchange = () => this.el('m-base-wrap').style.display =
      this.el('m-provider').value === 'openai' ? '' : 'none';
  },

  openSettings() {
    const c = Narrator.cfg;
    this.el('m-provider').value = c.provider || 'offline';
    this.el('m-key').value = c.apiKey || '';
    this.el('m-model').value = c.model || '';
    this.el('m-base').value = c.baseUrl || '';
    this.el('m-base-wrap').style.display = c.provider === 'openai' ? '' : 'none';
    this.el('modal').classList.remove('hidden');
  },
  closeSettings() { this.el('modal').classList.add('hidden'); },
};

window.addEventListener('DOMContentLoaded', () => UI.init());

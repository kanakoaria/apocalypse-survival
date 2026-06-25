/* ===========================================================================
 * engine.js — 确定性游戏引擎
 * 一切数值、骰子、行动力、衰减、死亡判定都在代码里算（不交给 LLM）。
 * 这满足设定里「玩家手输加属性无效，要后台摇筛子决定」的要求：
 * 数字永远正确、不可作弊；LLM 只把引擎算好的结果写成叙事。
 * ======================================================================== */

const Engine = {

  state: null,

  /* ---------- 随机数（可注入种子，便于复现/测试） ---------- */
  _seed: 1,
  seed(n) { this._seed = n >>> 0 || 1; },
  rnd() {
    // xorshift32：避免依赖 Math.random，便于存档复现
    let x = this._seed;
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    this._seed = x >>> 0;
    return (this._seed % 100000) / 100000;
  },
  randInt(a, b) { return a + Math.floor(this.rnd() * (b - a + 1)); },
  pick(arr) { return arr[Math.floor(this.rnd() * arr.length)]; },
  clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); },

  /* ---------- 区域威胁：每个地点会随行动/事件恶化或缓和 ---------- */
  baseLocationThreat(locName) {
    const loc = GameData.LOCATIONS[locName];
    return this.clamp(Math.round(((loc && loc.risk) || 0.35) * 6), 1, 5);
  },
  initLocationThreats() {
    const out = {};
    for (const name of Object.keys(GameData.LOCATIONS)) out[name] = this.baseLocationThreat(name);
    return out;
  },
  ensureLocationThreats() {
    if (!this.state.flags) this.state.flags = {};
    if (!this.state.flags.locationThreats) this.state.flags.locationThreats = {};
    const threat = this.state.flags.locationThreats;
    for (const name of Object.keys(GameData.LOCATIONS)) {
      if (!Number.isFinite(+threat[name])) threat[name] = this.baseLocationThreat(name);
      threat[name] = this.clamp(Math.round(+threat[name]), 0, 5);
    }
    return threat;
  },
  locationThreat(locName) {
    if (!this.state) return this.baseLocationThreat(locName);
    const threat = this.ensureLocationThreats();
    const val = Number.isFinite(+threat[locName]) ? +threat[locName] : this.baseLocationThreat(locName);
    return this.clamp(Math.round(val), 0, 5);
  },
  locationThreatName(locName) {
    return ['冷清', '低危', '可疑', '危险', '高危', '死地'][this.locationThreat(locName)] || '未知';
  },
  locationRisk(locName) {
    const loc = GameData.LOCATIONS[locName] || { risk: 0.35 };
    const localDrift = this.locationThreat(locName) - this.baseLocationThreat(locName);
    const globalThreat = this.state && this.state.flags ? (this.state.flags.threat || 2) : 2;
    return this.clamp(loc.risk + localDrift * 0.08 + (globalThreat - 2) * 0.03, 0.05, 0.90);
  },
  locationRiskPct(locName) { return Math.round(this.locationRisk(locName) * 100); },
  adjustLocationThreat(locName, delta) {
    const threat = this.ensureLocationThreats();
    const before = this.locationThreat(locName);
    threat[locName] = this.clamp(before + delta, 0, 5);
    const after = threat[locName];
    return { location: locName, before, after, delta: after - before };
  },
  mostThreatenedLocation() {
    this.ensureLocationThreats();
    return Object.keys(GameData.LOCATIONS).sort((a, b) =>
      (this.locationThreat(b) - this.locationThreat(a)) || (this.locationRisk(b) - this.locationRisk(a))
    )[0];
  },

  /* ---------- 路线图：路径、噪音、路障与隐藏捷径 ---------- */
  routeDef(id) { return GameData.ROUTES.find(r => r.id === id); },
  initRoutes() {
    const out = {};
    for (const r of GameData.ROUTES) {
      out[r.id] = {
        known: !r.hidden,
        blocked: !!r.blocked,
        noise: this.clamp(Math.round(r.noise || 0), 0, 4),
      };
    }
    return out;
  },
  ensureRoutes() {
    if (!this.state.flags) this.state.flags = {};
    if (!this.state.flags.routes) this.state.flags.routes = {};
    const routes = this.state.flags.routes;
    for (const r of GameData.ROUTES) {
      if (!routes[r.id]) routes[r.id] = { known: !r.hidden, blocked: !!r.blocked, noise: r.noise || 0 };
      routes[r.id].known = !!routes[r.id].known;
      routes[r.id].blocked = !!routes[r.id].blocked;
      routes[r.id].noise = this.clamp(Math.round(+routes[r.id].noise || 0), 0, 4);
    }
    return routes;
  },
  routeState(id) {
    const routes = this.ensureRoutes();
    return routes[id] || { known: false, blocked: false, noise: 0 };
  },
  routeNoiseName(n) { return ['静', '低噪', '嘈杂', '危险声源', '尸群注意'][this.clamp(Math.round(n), 0, 4)] || '未知'; },
  routeStatusName(route) {
    const st = this.routeState(route.id);
    if (!st.known) return '未知';
    if (st.blocked) return '堵塞';
    if (st.noise >= 3) return '高噪';
    if (route.risk < 0) return '捷径';
    return '通行';
  },
  knownRoutes() { return GameData.ROUTES.filter(r => this.routeState(r.id).known); },
  routeEdgeRisk(route) {
    const st = this.routeState(route.id);
    return this.clamp((route.risk || 0) + st.noise * 0.03 + (st.blocked ? 0.12 : 0), -0.08, 0.30);
  },
  findRoute(from, to, allowBlocked = false) {
    if (from === to) return [];
    const nodes = new Set([from, to, GameData.HOME, ...Object.keys(GameData.LOCATIONS)]);
    const dist = {}, prev = {}, used = {};
    for (const n of nodes) dist[n] = Infinity;
    dist[from] = 0;
    while (true) {
      let cur = null;
      for (const n of nodes) if (!used[n] && (cur == null || dist[n] < dist[cur])) cur = n;
      if (cur == null || dist[cur] === Infinity) break;
      if (cur === to) break;
      used[cur] = true;
      for (const r of GameData.ROUTES) {
        const st = this.routeState(r.id);
        if (!st.known || (!allowBlocked && st.blocked)) continue;
        const next = r.from === cur ? r.to : r.to === cur ? r.from : null;
        if (!next) continue;
        nodes.add(next);
        const cost = 1 + Math.max(0, this.routeEdgeRisk(r)) * 4 + st.noise * 0.2 + (st.blocked ? 3 : 0);
        if (dist[cur] + cost < (dist[next] ?? Infinity)) {
          dist[next] = dist[cur] + cost;
          prev[next] = cur;
        }
      }
    }
    if (!prev[to]) return null;
    const path = [];
    let cur = to;
    while (cur !== from) {
      const p = prev[cur];
      const route = GameData.ROUTES.find(r => (r.from === p && r.to === cur) || (r.from === cur && r.to === p));
      if (!route) return null;
      path.unshift(route.id);
      cur = p;
    }
    return path;
  },
  routeTo(locName) {
    const home = GameData.HOME || '庇护所';
    let ids = this.findRoute(home, locName, false);
    let blocked = false;
    if (!ids) { ids = this.findRoute(home, locName, true) || []; blocked = true; }
    const routes = ids.map(id => this.routeDef(id)).filter(Boolean);
    const nodes = [home];
    for (const r of routes) {
      const last = nodes[nodes.length - 1];
      nodes.push(r.from === last ? r.to : r.from);
    }
    const risk = routes.reduce((sum, r) => sum + this.routeEdgeRisk(r), 0);
    const noise = routes.reduce((sum, r) => sum + this.routeState(r.id).noise, 0);
    return {
      from: home,
      to: locName,
      routeIds: ids,
      names: routes.map(r => r.name),
      nodePath: nodes,
      risk: this.clamp(risk, -0.10, 0.45),
      noise,
      blocked: blocked || routes.some(r => this.routeState(r.id).blocked),
    };
  },
  actionRisk(locName) { return this.clamp(this.locationRisk(locName) + this.routeTo(locName).risk, 0.05, 0.95); },
  actionRiskPct(locName) { return Math.round(this.actionRisk(locName) * 100); },
  routeLabel(locName) {
    const r = this.routeTo(locName);
    if (!r.names.length) return '无已知路线';
    const risk = Math.round(r.risk * 100);
    const tag = r.blocked ? '有路障' : risk <= 0 ? '捷径' : r.noise >= 4 ? '很吵' : `路线${risk >= 0 ? '+' : ''}${risk}%`;
    return `${r.nodePath.join('→')} · ${tag}`;
  },
  routeTitle(locName) {
    const r = this.routeTo(locName);
    if (!r.names.length) return '地图上还没有通向这里的可靠路线。';
    return `${r.names.join(' / ')}；额外风险 ${signedPct(r.risk)}；噪音 ${r.noise}`;
  },
  routeIntel() {
    return this.knownRoutes().map(r => {
      const st = this.routeState(r.id);
      return {
        id: r.id, name: r.name, from: r.from, to: r.to,
        status: this.routeStatusName(r), noise: st.noise, risk: Math.round(this.routeEdgeRisk(r) * 100), note: r.note || '',
      };
    });
  },
  adjustRouteNoise(routeId, delta) {
    const st = this.routeState(routeId);
    const before = st.noise;
    st.noise = this.clamp(before + delta, 0, 4);
    return { route: routeId, before, after: st.noise, delta: st.noise - before };
  },
  adjustPathNoise(routeInfo, delta, res) {
    if (!routeInfo || !routeInfo.routeIds) return [];
    const changes = [];
    for (const id of routeInfo.routeIds) {
      const ch = this.adjustRouteNoise(id, delta);
      if (ch.delta) {
        const def = this.routeDef(id);
        changes.push({ id, name: def ? def.name : id, before: ch.before, after: ch.after, delta: ch.delta });
      }
    }
    if (res && changes.length) res.routeChanges = [...(res.routeChanges || []), ...changes];
    return changes;
  },
  discoverRouteNear(locName, res) {
    const routes = this.ensureRoutes();
    const candidates = GameData.ROUTES.filter(r => r.hidden && !routes[r.id].known && (r.from === locName || r.to === locName));
    if (!candidates.length) return null;
    const r = this.pick(candidates);
    routes[r.id].known = true;
    routes[r.id].blocked = !!r.blocked;
    const ch = { id: r.id, name: r.name, discover: true, blocked: routes[r.id].blocked };
    if (res) {
      res.routeChanges = [...(res.routeChanges || []), ch];
      res.parts.push(`发现路线：${r.name}${routes[r.id].blocked ? '（入口堵塞）' : ''}`);
    }
    return r;
  },
  unblockRouteNear(locName, res) {
    const routes = this.ensureRoutes();
    const candidates = GameData.ROUTES.filter(r => routes[r.id].known && routes[r.id].blocked && (r.from === locName || r.to === locName));
    if (!candidates.length) return null;
    const r = this.pick(candidates);
    routes[r.id].blocked = false;
    const ch = { id: r.id, name: r.name, unblock: true };
    if (res) {
      res.routeChanges = [...(res.routeChanges || []), ch];
      res.parts.push(`打通路线：${r.name}`);
    }
    return r;
  },

  /* ---------- 势力声望：影响 NPC 态度、招募与冲突 ---------- */
  initFactions() {
    const out = {};
    for (const id of Object.keys(GameData.FACTIONS)) out[id] = { rep: GameData.FACTIONS[id].base || 0, known: true };
    return out;
  },
  ensureFactions() {
    if (!this.state.flags) this.state.flags = {};
    if (!this.state.flags.factions) this.state.flags.factions = {};
    const factions = this.state.flags.factions;
    for (const id of Object.keys(GameData.FACTIONS)) {
      if (!factions[id]) factions[id] = { rep: GameData.FACTIONS[id].base || 0, known: true };
      factions[id].rep = this.clamp(Math.round(+factions[id].rep || 0), -100, 100);
      factions[id].known = factions[id].known !== false;
    }
    return factions;
  },
  factionRep(id) { return this.ensureFactions()[id]?.rep || 0; },
  factionName(id) { return GameData.FACTIONS[id] ? GameData.FACTIONS[id].name : '无所属'; },
  factionRelationName(rep) {
    if (rep <= -60) return '死敌';
    if (rep <= -25) return '敌对';
    if (rep < 10) return '戒备';
    if (rep < 35) return '中立';
    if (rep < 65) return '友善';
    return '同盟';
  },
  factionIntel() {
    const factions = this.ensureFactions();
    return Object.keys(GameData.FACTIONS).map(id => {
      const f = GameData.FACTIONS[id], rep = factions[id].rep;
      return { id, name: f.name, type: f.type, rep, stance: this.factionRelationName(rep), traits: f.traits, locations: f.locations, note: f.note };
    }).sort((a, b) => b.rep - a.rep);
  },
  factionsAtLocation(locName) {
    const ids = Object.keys(GameData.FACTIONS).filter(id => (GameData.FACTIONS[id].locations || []).includes(locName));
    return ids.length ? ids : Object.keys(GameData.FACTIONS);
  },
  pickFaction(locName) {
    const candidates = locName ? this.factionsAtLocation(locName) : Object.keys(GameData.FACTIONS);
    return this.pick(candidates);
  },
  adjustFaction(id, delta, res, reason = '') {
    if (!id || !GameData.FACTIONS[id]) return null;
    const factions = this.ensureFactions();
    const before = factions[id].rep;
    factions[id].rep = this.clamp(before + delta, -100, 100);
    const after = factions[id].rep;
    if (res && before !== after) {
      res.factionChanges = [...(res.factionChanges || []), { id, name: this.factionName(id), before, after, delta: after - before, reason }];
    }
    return { id, before, after, delta: after - before };
  },

  /* ---------- 主线谜团：线索发现与阶段推进 ---------- */
  initStory() {
    return { title: GameData.STORY.title, stage: 0, clues: [], flags: {}, pulses: 0 };
  },
  ensureStory() {
    if (!this.state.flags) this.state.flags = {};
    if (!this.state.flags.story) this.state.flags.story = this.initStory();
    const story = this.state.flags.story;
    if (!Array.isArray(story.clues)) story.clues = [];
    if (!story.flags) story.flags = {};
    const maxStage = Math.max(0, (GameData.STORY.stages || []).length - 1);
    story.stage = this.clamp(Math.round(+story.stage || 0), 0, maxStage);
    story.pulses = Math.max(0, Math.round(+story.pulses || 0));
    story.title = story.title || GameData.STORY.title;
    story.clues = [...new Set(story.clues)].filter(id => GameData.STORY.clues[id]);
    return story;
  },
  storyStage() {
    const story = this.ensureStory();
    return GameData.STORY.stages[story.stage] || GameData.STORY.stages[0];
  },
  storyClueCount() { return this.ensureStory().clues.length; },
  undiscoveredStoryClues(source = null) {
    const known = new Set(this.ensureStory().clues);
    return Object.keys(GameData.STORY.clues).filter(id => {
      const clue = GameData.STORY.clues[id];
      if (known.has(id)) return false;
      if (!source) return true;
      return (clue.locations || []).includes(source);
    });
  },
  pickStoryClue(ids) {
    if (!ids.length) return null;
    const total = ids.reduce((sum, id) => sum + (GameData.STORY.clues[id].weight || 1), 0);
    let n = this.rnd() * total;
    for (const id of ids) {
      n -= GameData.STORY.clues[id].weight || 1;
      if (n <= 0) return id;
    }
    return ids[ids.length - 1];
  },
  discoverStoryClue(id, res, reason = '') {
    const clue = GameData.STORY.clues[id];
    if (!clue) return false;
    const story = this.ensureStory();
    if (story.clues.includes(id)) return false;
    story.clues.push(id);
    if (res) {
      if (!res.parts) res.parts = [];
      res.storyChanges = [...(res.storyChanges || []), { type: 'clue', id, name: clue.name, text: clue.text, reason }];
      res.parts.push(`主线线索：${clue.name}${reason ? '（' + reason + '）' : ''}`);
    }
    this.advanceStory(res);
    return true;
  },
  tryDiscoverStoryClue(source, res, chance = 0.25, reason = '') {
    if (this.rnd() > chance) return false;
    let ids = this.undiscoveredStoryClues(source);
    if (!ids.length && source === '研究') ids = this.undiscoveredStoryClues(null);
    const id = this.pickStoryClue(ids);
    return id ? this.discoverStoryClue(id, res, reason || source || '线索') : false;
  },
  advanceStory(res) {
    const story = this.ensureStory();
    const stages = GameData.STORY.stages || [];
    let changed = false;
    while (story.stage < stages.length - 1 && story.clues.length >= (stages[story.stage + 1].need || 0)) {
      story.stage += 1;
      changed = true;
      const stage = stages[story.stage];
      if (res) {
        if (!res.parts) res.parts = [];
        res.storyChanges = [...(res.storyChanges || []), { type: 'stage', stage: story.stage, name: stage.name, desc: stage.desc, need: stage.need }];
        res.parts.push(`主线推进：${stage.name}——${stage.desc}`);
      }
    }
    return changed;
  },
  researchStory(res, judge) {
    if (judge.success) {
      const chance = judge.tier === 'crit' ? 0.92 : 0.58;
      if (!this.tryDiscoverStoryClue('研究', res, chance, '研究整理') && this.storyClueCount() >= 2) {
        if (this.advanceStory(res)) return;
        res.parts.push('你把已有线索重新排了一遍，越来越确定它们指向同一个地方。');
      }
    } else if (judge.tier === 'fumble' && this.storyClueCount() > 0) {
      res.deltas.san = (res.deltas.san || 0) - 2;
      res.parts.push('那些线索越看越像在互相盯着你，San -2。');
    }
  },
  applyStoryPulse(res, ev) {
    const story = this.ensureStory();
    if (ev.id === 'diary') this.tryDiscoverStoryClue('周末', res, 1, '遗留日记');
    else if (ev.id === 'stranger') this.tryDiscoverStoryClue('周末', res, 0.55, '流浪者传闻');
    else if (ev.id === 'caravan') this.tryDiscoverStoryClue('周末', res, 0.45, '车队消息');
    else if (ev.id === 'traitor' && story.clues.length) {
      res.storyChanges = [...(res.storyChanges || []), { type: 'pulse', name: this.storyStage().name, text: '有人也在找这些线索。' }];
    }
    const stage = this.storyStage();
    const pulseChance = story.stage > 0 ? 0.35 + story.stage * 0.05 : 0.08;
    if (!res.storyChanges && this.rnd() < pulseChance) {
      res.storyChanges = [{ type: 'pulse', name: stage.name, text: stage.desc }];
    }
    story.pulses += 1;
  },
  storyIntel() {
    const story = this.ensureStory();
    const stages = GameData.STORY.stages || [];
    const stage = stages[story.stage] || stages[0] || { name: '未知', desc: '', need: 0 };
    const next = stages[story.stage + 1] || null;
    return {
      title: story.title || GameData.STORY.title,
      stageIndex: story.stage,
      stageName: stage.name,
      desc: stage.desc,
      clueCount: story.clues.length,
      total: Object.keys(GameData.STORY.clues).length,
      nextNeed: next ? next.need : null,
      nextName: next ? next.name : null,
      clues: story.clues.map(id => ({ id, ...GameData.STORY.clues[id] })).filter(x => x.name),
    };
  },
  locationFromText(text) {
    const t = String(text || '');
    return Object.keys(GameData.LOCATIONS).find(name => t.includes(name)) || null;
  },
  bestAttr(keys) {
    const s = this.state;
    return (keys || ['luck']).reduce((best, key) => (s.attrs[key] || 0) > (s.attrs[best] || 0) ? key : best, (keys || ['luck'])[0]);
  },
  freeIntent(text) {
    const t = String(text || '');
    return GameData.FREE_INTENTS.find(rule => rule.re.test(t)) || GameData.FREE_INTENTS[GameData.FREE_INTENTS.length - 1];
  },
  resolveFreeOutcome(res, intent, judge, locName, risk) {
    const s = this.state;
    const routeInfo = locName ? this.routeTo(locName) : null;
    if (judge.success) {
      if (intent.id === 'scout') {
        if (locName) {
          const drop = judge.tier === 'crit' ? -2 : -1;
          const drift = this.adjustLocationThreat(locName, drop);
          if (drift.delta) res.parts.push(`${locName}威胁 ${drift.before}→${drift.after}`);
          const rch = this.adjustPathNoise(routeInfo, judge.tier === 'crit' ? -2 : -1, res);
          if (rch.length) res.parts.push(`沿途动静被摸清：${rch.map(c => `${c.name}${c.before}→${c.after}`).join('，')}`);
          if (judge.tier === 'crit' || this.rnd() < 0.55) this.discoverRouteNear(locName, res);
        }
        if (judge.tier === 'crit' || this.rnd() < 0.35) res.gains.push(this.pick(intent.gains));
        this.addBuff('摸清路线', '下一次危险行动前，你对周边动向更有把握', s.week + 1);
        res.parts.push('你摸清了一条能用的路。');
      } else if (intent.id === 'breach') {
        res.gains.push(this.pick(intent.gains));
        if (locName) this.unblockRouteNear(locName, res) || this.discoverRouteNear(locName, res);
        res.parts.push('你撬开了一个缺口，顺手拆下还能用的东西。');
      } else if (intent.id === 'repair') {
        if (judge.tier === 'crit') res.gains.push(this.pick(intent.gains));
        this.addBuff('维护完毕', '据点里的小毛病少了一些', s.week + 1);
        if (routeInfo) this.adjustPathNoise(routeInfo, -1, res);
        res.parts.push('你把能修的地方收拾了一遍。');
      } else if (intent.id === 'talk') {
        if (this.rnd() < 0.45) {
          const npc = this.genNPC();
          res.meet = npc.name;
          s.relations[npc.name] = this.randInt(-5, 15);
          res.parts.push(`你试探到了一个活人：${npc.name}（${npc.profession}），关系 ${s.relations[npc.name]}`);
        } else {
          res.gains.push(this.pick(intent.gains));
          res.parts.push('你没有交出底牌，但换来了一点消息。');
        }
      } else if (intent.id === 'hide') {
        this.addBuff('低调行踪', '你暂时没有惊动太多东西', s.week + 1);
        if (locName) {
          const drift = this.adjustLocationThreat(locName, -1);
          if (drift.delta) res.parts.push(`${locName}威胁 ${drift.before}→${drift.after}`);
          const rch = this.adjustPathNoise(routeInfo, -1, res);
          if (rch.length) res.parts.push(`路线保持低调：${rch.map(c => `${c.name}${c.before}→${c.after}`).join('，')}`);
        }
        res.parts.push('你把声响压到最低，避开了不该碰的麻烦。');
      } else if (intent.id === 'forage') {
        res.gains.push(this.pick(intent.gains));
        if (judge.tier === 'crit') res.gains.push(this.pick(intent.gains));
        res.parts.push('你从废墟边角抠出了一点能入口的东西。');
      } else if (intent.id === 'organize') {
        if (this.rnd() < 0.45) res.gains.push(this.pick(intent.gains));
        this.addBuff('据点有序', '仓促之间也少了几分慌乱', s.week + 1);
        res.parts.push('你把据点重新理了一遍，心里有了点底。');
      } else {
        if (judge.tier === 'crit') res.gains.push(this.pick(['抗生素', '工具箱', '汽油', '罐头']));
        else res.deltas.san = (res.deltas.san || 0) + this.randInt(1, 4);
        if (routeInfo && this.rnd() < 0.25) this.adjustPathNoise(routeInfo, 1, res);
        res.parts.push('这次冒险没有完全白费。');
      }
    } else {
      res.deltas.san = (res.deltas.san || 0) - this.randInt(1, 6);
      if (judge.tier === 'fumble' || this.rnd() < risk) {
        const dmg = this.randInt(judge.tier === 'fumble' ? 8 : 3, judge.tier === 'fumble' ? 18 : 12);
        res.deltas.hp = (res.deltas.hp || 0) - dmg;
        res.parts.push(`行动走坏，受创 -${dmg} HP`);
        if (locName) {
          const drift = this.adjustLocationThreat(locName, 1);
          if (drift.delta) res.parts.push(`${locName}被惊动，威胁 ${drift.before}→${drift.after}`);
          const rch = this.adjustPathNoise(routeInfo, judge.tier === 'fumble' ? 2 : 1, res);
          if (rch.length) res.parts.push(`路线被惊动：${rch.map(c => `${c.name}${c.before}→${c.after}`).join('，')}`);
        }
        if (this.rnd() < 0.12) {
          const inf = this.randInt(5, 15);
          res.deltas.infection = (res.deltas.infection || 0) + inf;
          res.parts.push(`接触污染，感染 +${inf}`);
        }
      } else {
        res.parts.push('你没有得到什么，只是把时间和体力丢进废墟里。');
      }
    }
  },
  /* ---------- 新游戏 / 建角 ---------- */
  newGame({ name, gender, age, profession, period, seed }) {
    if (seed != null) this.seed(seed); else this.seed(Date.now() % 2147483647 || 7);
    const prof = GameData.PROFESSIONS[profession] || { bias: {}, items: [], note: '' };

    // 随机基础属性 + 职业倾向
    const attrs = {};
    for (const a of GameData.ATTRS) {
      const base = this.randInt(25, 60);
      attrs[a.key] = this.clamp(base + (prof.bias[a.key] || 0), 1, 100);
    }

    const periodDay = { early: this.randInt(1, 10), mid: this.randInt(11, 30), late: this.randInt(31, 60) }[period] || 1;

    this.state = {
      name, gender, age: +age, profession,
      period, day: periodDay,
      week: 1, ap: 4,                       // 每周 4 行动力
      attrs,
      vitals: { hp: 100, hunger: 100, san: 100, infection: 0 },
      hpCap: 100,                           // 感染会压低生命上限
      inventory: this.expandStacks([...prof.items, '背包']),  // 携带（受背包容量限制）
      warehouse: [],                        // 庇护所仓库（容量大，需在据点存取）
      companions: [],                       // {name, profession, faction, personality, fear, stress, wound, affinity}
      relations: {},                        // npcName -> affinity(-100..100)
      buffs: [],                            // {name, desc, expireWeek}
      flags: { antidepCount: 0, locationThreats: this.initLocationThreats(), routes: this.initRoutes(), factions: this.initFactions(), story: this.initStory() },
      log: [],                              // 机制日志（给叙事器/调试）
      over: false, overReason: '',
    };
    return this.state;
  },

  /* ---------- 判定：d100 vs 有效属性（含分级修正与幸运浮动） ---------- */
  // 返回 { roll, target, success, tier, margin }
  judge(attrKey, difficulty = 0) {
    const s = this.state;
    const mod = GameData.modifiers(s.vitals);
    let target = s.attrs[attrKey] || 30;
    target = target * (1 + (mod[attrKey] || 0));     // 分级百分比修正
    target += difficulty;                            // 正=更易，负=更难
    target += (s.attrs.luck - 50) * 0.15;            // 幸运微调走向
    target = this.clamp(target, 3, 97);

    const roll = this.randInt(1, 100);
    const success = roll <= target;
    const margin = target - roll;
    let tier;
    if (roll <= 5 || margin >= 40) tier = 'crit';        // 大成功
    else if (success) tier = 'pass';
    else if (roll >= 96 || margin <= -40) tier = 'fumble'; // 大失败
    else tier = 'fail';
    return { roll, target: Math.round(target), success, tier, margin };
  },

  /* ---------- 改数值（带上限/下限与死亡判定） ---------- */
  applyVitals(delta) {
    const s = this.state, v = s.vitals;
    for (const k in delta) {
      if (k === 'infection') v.infection = this.clamp(v.infection + delta[k], 0, 100);
      else if (k === 'hp')   v.hp = this.clamp(v.hp + delta[k], 0, s.hpCap);
      else                   v[k] = this.clamp(v[k] + delta[k], 0, 100);
    }
    this.checkDeath();
  },

  // 把 "罐头×2" 这类堆叠展开成多份独立单位，便于逐件使用
  expandStacks(items) {
    const out = [];
    for (const it of items.flat()) {
      const m = /^(.+?)×(\d+)$/.exec(it);
      if (m) { const n = Math.min(+m[2], 20); for (let i = 0; i < n; i++) out.push(m[1]); }
      else out.push(it);
    }
    return out;
  },
  carryCap() { return this.hasCarried('背包') ? 12 : 6; },

  // 拾得物资：先进背包，背包满则暂存据点仓库
  addItem(...items) {
    const stash = [];
    for (const it of this.expandStacks(items)) {
      if (this.state.inventory.length < this.carryCap()) this.state.inventory.push(it);
      else { this.state.warehouse.push(it); stash.push(it); }
    }
    return stash; // 返回被迫存仓的物品（供叙事提示）
  },
  hasCarried(name) { return this.state.inventory.some(i => i.startsWith(name)); },
  hasItem(name) { return this.hasCarried(name) || this.state.warehouse.some(i => i.startsWith(name)); },
  removeItem(name) {
    let i = this.state.inventory.findIndex(x => x.startsWith(name));
    if (i >= 0) return this.state.inventory.splice(i, 1)[0];
    i = this.state.warehouse.findIndex(x => x.startsWith(name));
    if (i >= 0) return this.state.warehouse.splice(i, 1)[0];
    return null;
  },

  /* ---------- 队友深度：性格、恐惧、压力、伤势、忠诚 ---------- */
  companionPersonality(key) { return GameData.COMPANION_PERSONALITIES[key] || GameData.COMPANION_PERSONALITIES.cautious; },
  stressName(v) {
    if (v >= 85) return '崩溃边缘';
    if (v >= 60) return '紧绷';
    if (v >= 35) return '不安';
    return '稳定';
  },
  woundName(v) {
    if (v >= 85) return '濒危';
    if (v >= 55) return '重伤';
    if (v >= 25) return '轻伤';
    return '健康';
  },
  companionLoyalty(c) {
    const p = this.companionPersonality(c.personality);
    const factionRep = c.factionId ? this.factionRep(c.factionId) : 0;
    return this.clamp(Math.round((c.affinity || 0) + factionRep * 0.25 - (c.stress || 0) * 0.25 - (c.wound || 0) * 0.15 + (p.loyaltyBias || 0)), -100, 100);
  },
  initCompanionDepth(c) {
    if (!c) return c;
    const personalities = Object.keys(GameData.COMPANION_PERSONALITIES);
    if (!c.personality) c.personality = this.pick(personalities);
    if (!c.fear) c.fear = this.pick(GameData.COMPANION_FEARS);
    if (!Number.isFinite(+c.stress)) c.stress = this.randInt(10, 30);
    if (!Number.isFinite(+c.wound)) c.wound = 0;
    if (!Array.isArray(c.memories)) c.memories = [];
    c.stress = this.clamp(Math.round(+c.stress), 0, 100);
    c.wound = this.clamp(Math.round(+c.wound), 0, 100);
    c.loyalty = this.companionLoyalty(c);
    return c;
  },
  ensureCompanions() {
    if (!this.state || !Array.isArray(this.state.companions)) return [];
    this.state.companions.forEach(c => this.initCompanionDepth(c));
    return this.state.companions;
  },
  companionMemory(c, text) {
    if (!c.memories) c.memories = [];
    c.memories.unshift(text);
    c.memories = c.memories.slice(0, 3);
  },
  adjustCompanionStress(c, delta, res, reason = '') {
    this.initCompanionDepth(c);
    const p = this.companionPersonality(c.personality);
    const before = c.stress;
    const adj = delta > 0 ? delta + (p.stressBias || 0) : delta;
    c.stress = this.clamp(before + adj, 0, 100);
    c.loyalty = this.companionLoyalty(c);
    if (res && before !== c.stress) {
      res.companionChanges = [...(res.companionChanges || []), { name: c.name, field: '压力', before, after: c.stress, delta: c.stress - before, reason }];
    }
  },
  injureCompanion(c, amount, res, reason = '受伤') {
    this.initCompanionDepth(c);
    const before = c.wound;
    c.wound = this.clamp(before + amount, 0, 100);
    this.adjustCompanionStress(c, Math.ceil(amount / 3), res, reason);
    c.loyalty = this.companionLoyalty(c);
    if (res && before !== c.wound) {
      res.companionChanges = [...(res.companionChanges || []), { name: c.name, field: '伤势', before, after: c.wound, delta: c.wound - before, reason }];
      res.parts.push(`${c.name} ${reason}，伤势 ${before}→${c.wound}`);
    }
  },
  healCompanion(c, amount, res, reason = '缓过来') {
    this.initCompanionDepth(c);
    const before = c.wound;
    c.wound = this.clamp(before - amount, 0, 100);
    c.loyalty = this.companionLoyalty(c);
    if (res && before !== c.wound) res.companionChanges = [...(res.companionChanges || []), { name: c.name, field: '伤势', before, after: c.wound, delta: c.wound - before, reason }];
  },
  applyCompanionAction(actionId, res) {
    const comps = this.ensureCompanions();
    if (!comps.length || this.state.over) return;
    const danger = { scavenge: 7, clear: 13, recruit: 4, craft: 2, fortify: 2, train: 1, research: 1, free: 5 }[actionId] || 0;
    if (danger > 0) {
      for (const c of comps) {
        const p = this.companionPersonality(c.personality);
        let stress = danger + Math.max(0, (res.locationRisk || res.freeRisk || 0) - 50) / 12;
        if (actionId === 'clear') stress += 4;
        if (res.meet) stress += 3;
        if (res.freeLocation && c.fear && res.freeLocation.includes(c.fear)) stress += 5;
        if (res.location && c.fear && res.location.includes(c.fear)) stress += 5;
        if (res.deltas && (res.deltas.hp < 0 || res.deltas.infection > 0)) stress += 4;
        stress -= (p.dangerBias || 0);
        this.adjustCompanionStress(c, Math.round(stress), res, actionId);
        if ((actionId === 'clear' || res.meet) && this.rnd() < Math.max(0.03, danger / 100 + (c.wound || 0) / 250)) {
          this.injureCompanion(c, this.randInt(8, actionId === 'clear' ? 24 : 15), res, '掩护中受伤');
        }
        if (c.stress >= 85 && this.rnd() < 0.18) {
          this.adjustRelation(c.name, -this.randInt(4, 10));
          this.companionMemory(c, '压力濒临失控');
          res.parts.push(`${c.name} 快绷不住了，好感下降。`);
        }
      }
    }
    if (actionId === 'rest') {
      for (const c of comps) {
        this.adjustCompanionStress(c, -this.randInt(8, 16), res, '休整');
        this.healCompanion(c, this.randInt(4, 10), res, '休整包扎');
      }
    }
  },
  adjustRelation(npc, d) {
    const s = this.state;
    s.relations[npc] = this.clamp((s.relations[npc] || 0) + d, -100, 100);
    const c = s.companions.find(c => c.name === npc);
    if (c) { c.affinity = s.relations[npc]; c.loyalty = this.companionLoyalty(c); }
  },

  // 据点内整理：携带↔仓库互转（不耗行动力）
  deposit(name) { const it = this._take('inventory', name); if (it) this.state.warehouse.push(it); return it; },
  withdraw(name) {
    if (this.state.inventory.length >= this.carryCap()) return null; // 背包满
    const it = this._take('warehouse', name); if (it) this.state.inventory.push(it); return it;
  },
  _take(where, name) {
    const arr = this.state[where];
    const i = arr.findIndex(x => x === name || x.startsWith(name));
    return i >= 0 ? arr.splice(i, 1)[0] : null;
  },

  /* ---------- 使用物品（吃 / 治疗 / 抗感染）——不耗行动力 ---------- */
  // 返回 { ok, item, msg, deltas } ；数值仍由引擎裁定并 clamp
  useItem(name) {
    const eff = this._effectFor(name);
    if (!eff) return { ok: false, msg: '这件物品无法直接使用。' };
    const s = this.state, v = s.vitals;

    // 消毒剂：仅在感染 <61 时有效，否则不消耗、不浪费
    if (eff.type === 'disinfect' && v.infection >= 61) {
      return { ok: false, msg: '感染已深入骨髓，消毒剂再也压不住了。' };
    }
    // 取出一件
    if (!this._take('inventory', name)) return { ok: false, msg: '背包里没有这件物品。' };

    const deltas = {};
    const rng = (a) => Array.isArray(a) ? this.randInt(a[0], a[1]) : a;
    if (eff.hp) deltas.hp = rng(eff.hp);
    if (eff.hunger) deltas.hunger = rng(eff.hunger);
    if (eff.san) deltas.san = rng(eff.san);
    if (eff.infection) deltas.infection = rng(eff.infection);

    let extra = '';
    if (eff.type === 'cure') {                 // 抗生素：压制 + 早期减感染
      s.flags.suppressInfection = s.week;       // 本周末感染不上升
      if (v.infection > 0 && v.infection < 61) deltas.infection = -this.randInt(5, 12);
      else extra = '（仅能延缓，无法逆转深度感染）';
    }
    if (eff.type === 'disinfect') deltas.infection = -this.randInt(10, 20);
    if (eff.type === 'antidep') {              // 抗抑郁药：多次用有副作用
      s.flags.antidepCount = (s.flags.antidepCount || 0) + 1;
      if (this.rnd() < s.flags.antidepCount * 0.18) {
        deltas.san = (deltas.san || 0) - this.randInt(3, 8);
        extra = '（药物副作用上来了，反而更恍惚）';
      }
    }
    // 生食/腐食风险
    if (eff.type === 'raw' && this.rnd() < 0.35) {
      deltas.infection = (deltas.infection || 0) + this.randInt(3, 10);
      extra = '（入口就知道坏了，肚子翻江倒海）';
    }

    this.applyVitals(deltas);
    return { ok: true, item: name, msg: (eff.msg || `使用了${name}`) + extra, deltas };
  },

  _effectFor(name) {
    const T = GameData.ITEM_EFFECTS;
    for (const k in T) if (name === k || name.startsWith(k)) return T[k];
    return null;
  },
  usable(name) { return !!this._effectFor(name); },

  /* ---------- AI 叙事增量：只接受「物品 / 关系」，绝不含生存数值与属性 ----------
   * 这是 AI 模式下的涌现剧情通道：LLM 声明它在叙事里实际发生的物品增减、NPC 好感变化，
   * 引擎在此校验并 clamp 后落地。hp/hunger/san/infection/attrs 等键即使出现也一律忽略——
   * 那些永远由引擎裁定，杜绝作弊与数字漂移。 */
  applyAIDelta(delta) {
    if (!delta || typeof delta !== 'object') return null;
    const out = { gained: [], lost: [], relations: {} };
    const clip = (s) => String(s).slice(0, 24).trim();

    const g = Array.isArray(delta.items_gained) ? delta.items_gained.slice(0, 6) : [];
    for (const it of g) if (it && typeof it === 'string') { const name = clip(it); this.addItem(name); out.gained.push(name); }

    const l = Array.isArray(delta.items_lost) ? delta.items_lost.slice(0, 6) : [];
    for (const it of l) if (it && typeof it === 'string') { const r = this.removeItem(clip(it)); if (r) out.lost.push(r); }

    if (delta.relations && typeof delta.relations === 'object') {
      for (const k of Object.keys(delta.relations).slice(0, 8)) {
        const v = Math.round(+delta.relations[k]);
        const name = clip(k);
        if (name && !isNaN(v) && v !== 0) {
          this.adjustRelation(name, Math.max(-25, Math.min(25, v))); // 单回合单 NPC 幅度封顶
          out.relations[name] = this.state.relations[name];
        }
      }
    }
    return out;
  },

  /* ---------- 感染对生命上限的侵蚀（每次行动结算时调用） ---------- */
  applyInfectionDecay() {
    const v = this.state.vitals;
    if (v.infection >= 61) this.state.hpCap = this.clamp(this.state.hpCap - 10, 0, 100);
    else if (v.infection >= 31) this.state.hpCap = this.clamp(this.state.hpCap - 3, 0, 100);
    if (this.state.vitals.hp > this.state.hpCap) this.state.vitals.hp = this.state.hpCap;
  },

  /* ---------- 执行一个行动，返回机制结果(交给叙事器润色) ---------- */
  // opt: { location?, trainAttr?, freeText? }
  runAction(actionId, opt = {}) {
    const s = this.state;
    if (s.over) return { error: '游戏已结束。' };
    if (s.ap <= 0) return { error: '本周行动力已用尽，进入周末结算。' };
    const def = GameData.ACTIONS.find(a => a.id === actionId);
    if (!def) return { error: '未知行动。' };

    const res = { action: def.name, actionId, parts: [], deltas: {}, gains: [], losses: [], meet: null };

    // 通用：每次行动消耗饱腹（设定：每点行动力额外扣 5 饱食度）
    let hungerCost = 5;

    switch (actionId) {
      case 'scavenge': {
        const locName = opt.location || this.pick(Object.keys(GameData.LOCATIONS));
        const loc = GameData.LOCATIONS[locName];
        const routeInfo = this.routeTo(locName);
        const areaRisk = this.locationRisk(locName);
        const risk = this.actionRisk(locName);
        res.location = locName;
        res.route = routeInfo;
        res.areaRisk = Math.round(areaRisk * 100);
        res.routeRisk = Math.round(routeInfo.risk * 100);
        res.locationThreat = this.locationThreat(locName);
        res.locationRisk = Math.round(risk * 100);
        const per = this.judge('per');
        const luck = this.judge('luck');
        if (routeInfo.names.length) res.parts.push(`路线@${routeInfo.nodePath.join('→')}：${routeInfo.names.join(' / ')}，额外风险${signedPct(routeInfo.risk)}，噪音${routeInfo.noise}`);
        res.parts.push(`区域态势@${locName}：${this.locationThreatName(locName)}，区域${res.areaRisk}% / 总风险约${res.locationRisk}%`);
        res.parts.push(`感知判定@${locName}：${per.roll}/${per.target} ${tierCN(per.tier)}`);
        // 收获
        const n = per.tier === 'crit' ? 3 : per.success ? 2 : per.tier === 'fumble' ? 0 : 1;
        for (let i = 0; i < n; i++) res.gains.push(this.pick(loc.loot));
        // 意外（幸运差 + 动态地点风险 + 路线风险）
        if (!luck.success && this.rnd() < risk) {
          const enemy = this.rnd() < 0.6 ? '丧尸' : '敌对幸存者';
          res.meet = enemy;
          const dmg = this.randInt(5, 20);
          res.deltas.hp = (res.deltas.hp || 0) - dmg;
          res.parts.push(`遭遇${enemy}，受创 -${dmg} HP`);
          if (enemy === '丧尸' && this.rnd() < 0.4) {
            // 设定：咬伤 +40~60，抓伤 +15~30
            const bite = this.rnd() < 0.4;
            const inf = bite ? this.randInt(40, 60) : this.randInt(15, 30);
            res.deltas.infection = (res.deltas.infection || 0) + inf;
            res.parts.push(`被${bite ? '咬' : '抓'}伤，感染 +${inf}`);
          }
          const drift = this.adjustLocationThreat(locName, luck.tier === 'fumble' ? 2 : 1);
          if (drift.delta) res.parts.push(`${locName}动静扩大，威胁 ${drift.before}→${drift.after}`);
          const rch = this.adjustPathNoise(routeInfo, luck.tier === 'fumble' ? 2 : 1, res);
          if (rch.length) res.parts.push(`路线噪音：${rch.map(c => `${c.name}${c.before}→${c.after}`).join('，')}`);
          this.maybeKillCompanions(res, 0.10); // 队友也可能在遭遇中丧命
        } else if (per.tier === 'crit') {
          const drift = this.adjustLocationThreat(locName, -1);
          if (drift.delta) res.parts.push(`你摸清了${locName}的空隙，威胁 ${drift.before}→${drift.after}`);
          const rch = this.adjustPathNoise(routeInfo, -1, res);
          if (rch.length) res.parts.push(`路线压低动静：${rch.map(c => `${c.name}${c.before}→${c.after}`).join('，')}`);
          if (this.rnd() < 0.55) this.discoverRouteNear(locName, res);
        } else if (per.success && this.rnd() < 0.18) {
          this.discoverRouteNear(locName, res);
        }
        const clueChance = per.tier === 'crit' ? 0.72 : per.success ? 0.34 : per.tier === 'fumble' ? 0.04 : 0.12;
        this.tryDiscoverStoryClue(locName, res, clueChance, '现场搜刮');
        if (res.gains.length) res.parts.push(`拾得：${res.gains.join('、')}`);
        break;
      }
      case 'fortify': {
        const j = this.judge(s.attrs.str >= s.attrs.int ? 'str' : 'int');
        res.parts.push(`修缮判定：${j.roll}/${j.target} ${tierCN(j.tier)}`);
        if (j.success) {
          s.flags.shelterLv = (s.flags.shelterLv || 0) + (j.tier === 'crit' ? 2 : 1);
          this.addBuff('据点加固', '夜袭概率下降、睡眠San恢复+', s.week + 99);
          res.parts.push(`庇护所防御等级 → ${s.flags.shelterLv}`);
        } else {
          res.parts.push('加固失败，浪费了部分建材。');
          this.removeItem('木板'); this.removeItem('铁皮');
        }
        break;
      }

      case 'train': {
        const a = opt.trainAttr;
        if (!a || a === 'luck' || a === 'chm') return { error: '该属性不可训练（魅力/幸运除外仅靠物品）。' };
        if (!this.hasItem('罐头') && !this.hasItem('压缩饼干') && !this.hasItem('压缩干粮') && !this.hasItem('能量棒')) {
          // 仍可练，但效果差
        }
        const j = this.judge('int', 5);
        const gain = j.tier === 'crit' ? 3 : j.success ? 2 : 1;
        s.attrs[a] = this.clamp(s.attrs[a] + gain, 1, 100);
        hungerCost += 10; // 额外消耗口粮
        this.removeItem('罐头') || this.removeItem('压缩饼干') || this.removeItem('能量棒');
        res.parts.push(`${attrName(a)} 永久 +${gain}（消耗口粮与水）`);
        break;
      }

      case 'craft': {
        const j = this.judge(s.attrs.int >= s.attrs.str ? 'int' : 'str');
        res.parts.push(`制造判定：${j.roll}/${j.target} ${tierCN(j.tier)}`);
        if (j.success) {
          const item = this.pick(['加固长矛', '钉刺棒球棍', '简易护甲', '消音匕首', '燃烧瓶×2', '陷阱套件']);
          res.gains.push(item);
          res.parts.push(`造出：${item}`);
        } else { res.parts.push('制造失败，材料报废。'); this.removeItem('钢管'); this.removeItem('木板'); }
        break;
      }

      case 'clear': {
        const locName = opt.location || this.mostThreatenedLocation();
        const routeInfo = this.routeTo(locName);
        res.location = locName;
        res.route = routeInfo;
        res.areaRisk = this.locationRiskPct(locName);
        res.routeRisk = Math.round(routeInfo.risk * 100);
        res.locationThreat = this.locationThreat(locName);
        res.locationRisk = this.actionRiskPct(locName);
        const difficulty = -Math.max(0, res.locationThreat - 2) * 5 - Math.round(Math.max(0, routeInfo.risk) * 18);
        const j1 = this.judge('str', difficulty); const j2 = this.judge('agi', difficulty);
        const ok = (j1.success ? 1 : 0) + (j2.success ? 1 : 0);
        if (routeInfo.names.length) res.parts.push(`进攻路线@${routeInfo.nodePath.join('→')}：${routeInfo.names.join(' / ')}，额外风险${signedPct(routeInfo.risk)}，噪音${routeInfo.noise}`);
        res.parts.push(`清理区域@${locName}：${this.locationThreatName(locName)}，区域${res.areaRisk}% / 总风险约${res.locationRisk}%`);
        res.parts.push(`力量${j1.roll}/${j1.target}·敏捷${j2.roll}/${j2.target} → ${ok}/2`);
        if (ok === 2) {
          s.flags.threat = Math.max(0, (s.flags.threat || 2) - 1);
          const drop = (j1.tier === 'crit' || j2.tier === 'crit') ? 2 : 1;
          const drift = this.adjustLocationThreat(locName, -drop);
          const rch = this.adjustPathNoise(routeInfo, -1, res);
          res.gains.push(this.pick(['碎布料', '生锈钢筋', '半盒子弹', '腐臭的钥匙', '完好的靴子']));
          res.parts.push(`清剿成功，${locName}威胁 ${drift.before}→${drift.after}。`);
          if (rch.length) res.parts.push(`沿途安静下来：${rch.map(c => `${c.name}${c.before}→${c.after}`).join('，')}`);
          if (this.rnd() < 0.35) this.discoverRouteNear(locName, res);
          this.unblockRouteNear(locName, res);
        } else {
          const dmg = this.randInt(8, 25);
          res.deltas.hp = (res.deltas.hp || 0) - dmg;
          const drift = this.adjustLocationThreat(locName, 1);
          const rch = this.adjustPathNoise(routeInfo, 1, res);
          res.parts.push(`被围攻，重伤 -${dmg} HP，${locName}威胁 ${drift.before}→${drift.after}`);
          if (rch.length) res.parts.push(`撤退路线被惊动：${rch.map(c => `${c.name}${c.before}→${c.after}`).join('，')}`);
          if (this.rnd() < 0.45) {           // 被咬概率高，感染重（设定 +40~60）
            const inf = this.randInt(40, 60); res.deltas.infection = inf; res.parts.push(`被撕咬，感染 +${inf}`);
          }
          this.maybeKillCompanions(res, 0.15);
        }
        res.deltas.san = (res.deltas.san || 0) - this.randInt(2, 6);
        break;
      }
      case 'recruit': {
        const locName = opt.location || this.pick(Object.keys(GameData.LOCATIONS));
        const routeInfo = this.routeTo(locName);
        const factionId = this.pickFaction(locName);
        const factionRep = this.factionRep(factionId);
        const repMod = Math.round(factionRep / 5);
        res.location = locName;
        res.route = routeInfo;
        res.factionId = factionId;
        res.factionName = this.factionName(factionId);
        res.factionRep = factionRep;
        if (routeInfo.names.length) res.parts.push(`接触路线@${routeInfo.nodePath.join('→')}：${routeInfo.names.join(' / ')}，额外风险${signedPct(routeInfo.risk)}`);
        res.parts.push(`势力接触@${locName}：${res.factionName}（${this.factionRelationName(factionRep)} ${factionRep}）`);
        const meet = this.judge('per', -8 + repMod);
        if (!meet.success && this.rnd() < 0.45) {
          res.parts.push('搜寻无果，没遇到任何愿意露面的活人。');
          if (factionRep < -20) this.adjustFaction(factionId, -1, res, '互相戒备');
          break;
        }
        const npc = this.genNPC(factionId);
        res.meet = npc.name;
        res.npc = npc;
        const chm = this.judge('chm', repMod);
        const elo = this.judge('elo', repMod);
        const baseRel = this.clamp(Math.round((chm.margin + elo.margin) / 4 + factionRep / 3), -60, 60);
        this.state.relations[npc.name] = baseRel;
        res.parts.push(`遇见 ${npc.name}（${npc.profession} / ${res.factionName}）。魅力${chm.roll}/${chm.target}·口才${elo.roll}/${elo.target}`);
        if (elo.success && chm.success && factionRep > -35 && this.state.companions.length < 5) {
          npc.affinity = this.state.relations[npc.name];
          npc.loyalty = this.companionLoyalty(npc);
          this.state.companions.push(npc);
          this.adjustFaction(factionId, 4, res, '成功招募');
          res.parts.push(`${npc.name} 同意加入！（队友死亡率与普通NPC相同）`);
        } else if (elo.tier === 'fumble' || (factionRep <= -60 && !elo.success)) {
          const dmg = this.randInt(3, 14);
          res.deltas.hp = (res.deltas.hp || 0) - dmg;
          this.adjustRelation(npc.name, -20);
          this.adjustFaction(factionId, -6, res, '交涉冲突');
          this.adjustPathNoise(routeInfo, 1, res);
          res.parts.push(`谈崩，${npc.name} 拔刀相向，你受创 -${dmg} HP。`);
        } else {
          const delta = (elo.success || chm.success) ? 2 : -2;
          this.adjustFaction(factionId, delta, res, delta > 0 ? '克制接触' : '试探失败');
          if (elo.success || chm.success) {
            res.gains.push(this.pick(['势力口信', '临时通行暗号', '半张交易清单', '安全路线']));
            res.parts.push(`${npc.name} 未答应同行，但留下了一点势力消息。`);
          } else {
            res.parts.push(`${npc.name} 没答应，也没有把后背留给你。`);
          }
        }
        if (res.meet) this.tryDiscoverStoryClue(locName, res, 0.24, '幸存者传闻');
        break;
      }
      case 'rest': {
        if ((s.flags.threat || 2) >= 4) { res.parts.push('据点不安全，无法安心休整。'); }
        res.deltas.hp = 15; res.deltas.san = 10;
        hungerCost = Math.floor(hungerCost / 2); // 饱腹消耗减半
        res.parts.push('深度休整：生命 +15、San +10、饱腹消耗减半。');
        break;
      }

      case 'research': {
        const j = this.judge('int');
        res.parts.push(`研究判定：${j.roll}/${j.target} ${tierCN(j.tier)}`);
        if (j.success) {
          if (this.rnd() < 0.5) { s.attrs.int = this.clamp(s.attrs.int + 1, 1, 100); res.parts.push('智力 +1（融会贯通）'); }
          else { res.gains.push(this.pick(['制造配方:简易弩', '城区情报图', '丧尸习性笔记', '草药知识'])); res.parts.push(`习得：${res.gains[res.gains.length-1]}`); }
        } else res.parts.push('一无所获，只是消磨了时间。');
        this.researchStory(res, j);
        break;
      }

      case 'chat': {
        if (!s.companions.length) return { error: '没有队友可以闲聊。' };
        const c = this.pick(this.ensureCompanions());
        const p = this.companionPersonality(c.personality);
        const relGain = this.randInt(3, 8) + (p.name === '冷面' ? -1 : 0);
        const calm = this.randInt(10, 20) + (p.name === '照护者' ? 5 : 0);
        this.adjustRelation(c.name, relGain);
        this.adjustCompanionStress(c, -calm, res, '闲聊');
        if (c.wound > 0 && (p.name === '照护者' || this.rnd() < 0.35)) this.healCompanion(c, this.randInt(3, 8), res, '互相包扎');
        res.companion = c.name;
        res.companionState = { personality: p.name, fear: c.fear, stress: c.stress, wound: c.wound, loyalty: c.loyalty };
        res.deltas.san = this.randInt(5, 10);
        this.addBuff('点头之交', '夜间遇袭警示成功率+10%', s.week + 1);
        this.companionMemory(c, '一次认真闲聊');
        res.parts.push(`与 ${c.name} 闲聊，好感 +${relGain}，压力 -${calm}，San +${res.deltas.san}。`);
        break;
      }

      case 'pray': {
        res.deltas.san = this.randInt(10, 20);
        this.addBuff('心境平和', '本周San消耗减半', s.week + 1);
        res.parts.push(`冥想：San +${res.deltas.san}，获得Buff「心境平和」。`);
        break;
      }

      case 'free': {
        res.free = opt.freeText || '';
        const intent = this.freeIntent(res.free);
        const attr = this.bestAttr(intent.attrs);
        const locName = opt.location || this.locationFromText(res.free);
        const routeInfo = locName ? this.routeTo(locName) : null;
        const baseRisk = intent.risk == null ? 0.18 : intent.risk;
        const routeRisk = routeInfo ? Math.max(0, routeInfo.risk) * 0.35 : 0;
        const risk = this.clamp(baseRisk + (locName ? this.locationRisk(locName) * 0.25 + routeRisk : 0), 0.03, 0.75);
        const j = this.judge(attr, intent.difficulty || 0);
        res.freeIntent = intent.name;
        res.freeIntentId = intent.id;
        res.freeAttr = attr;
        res.freeLocation = locName;
        res.route = routeInfo;
        res.freeRisk = Math.round(risk * 100);
        res.freeSuccess = j.success;
        res.freeTier = j.tier;
        res.parts.push(`自主行动：${res.free || '(无描述)'}`);
        if (routeInfo && routeInfo.names.length) res.parts.push(`路线@${routeInfo.nodePath.join('→')}：${routeInfo.names.join(' / ')}，额外风险${signedPct(routeInfo.risk)}，噪音${routeInfo.noise}`);
        if (locName) res.parts.push(`涉及区域@${locName}：${this.locationThreatName(locName)}，区域风险约${this.locationRiskPct(locName)}%`);
        res.parts.push(`自主判定(${intent.name}/${attrName(attr)})：${j.roll}/${j.target} ${tierCN(j.tier)}`);
        this.resolveFreeOutcome(res, intent, j, locName, risk);
        if (j.success && ['scout', 'talk', 'organize'].includes(intent.id)) {
          this.tryDiscoverStoryClue(locName || '研究', res, j.tier === 'crit' ? 0.50 : 0.20, '自主行动');
        }
        break;
      }
    }

    // 结算饱腹消耗 + 应用数值变化
    res.deltas.hunger = (res.deltas.hunger || 0) - hungerCost;
    const stashed = this.addItem(...res.gains);
    if (stashed.length) res.parts.push(`背包已满，${stashed.join('、')}暂存据点仓库`);
    this.applyVitals(res.deltas);
    this.applyInfectionDecay();
    this.applyCompanionAction(actionId, res);

    s.ap -= 1;
    s.log.push({ week: s.week, ...res });
    res.apLeft = s.ap;
    res.weekendReady = s.ap <= 0;
    return res;
  },

  /* ---------- 周末结算：随机事件 + 进入下一周 ---------- */
  endWeek() {
    const s = this.state;
    const ev = this.pick(GameData.EVENTS);
    const out = { event: ev, parts: [], deltas: {}, gains: [], meet: null };
    if (ev.effect) out.deltas = { ...ev.effect };
    if (ev.gain) { out.gains = [...ev.gain]; out.stashed = this.addItem(...ev.gain); }
    if (ev.meet) out.meet = this.genNPC();
    this.applyEventThreat(ev, out);
    this.applyStoryPulse(out, ev);
    // 基础代谢：-15/周
    out.deltas.hunger = (out.deltas.hunger || 0) - 15;
    // 感染恶化（无血清，缓慢上升）；本周用过抗生素则压制
    const suppressed = s.flags.suppressInfection === s.week;
    if (!suppressed && s.vitals.infection > 0 && s.vitals.infection < 91)
      out.deltas.infection = (out.deltas.infection || 0) + this.randInt(2, 6);
    s.flags.suppressInfection = null;

    // 凶险事件可能夺走队友，也会加重压力
    if (ev.good === false && s.companions.length) {
      for (const c of this.ensureCompanions()) this.adjustCompanionStress(c, this.randInt(5, 14), out, ev.title);
      this.maybeKillCompanions(out, 0.12);
    } else if (s.companions.length && ev.good === true) {
      for (const c of this.ensureCompanions()) this.adjustCompanionStress(c, -this.randInt(2, 8), out, ev.title);
    }

    this.applyVitals(out.deltas);
    this.applyInfectionDecay();

    // 过期 buff
    s.buffs = s.buffs.filter(b => b.expireWeek > s.week);

    if (!s.over) {
      s.week += 1; s.day += 7; s.ap = 4;
    }
    out.week = s.week;
    return out;
  },

  /* ---------- 死亡判定 ---------- */
  checkDeath() {
    const s = this.state, v = s.vitals;
    if (s.over) return;
    if (v.hp <= 0) this.gameOver('生命归零，你倒在了青阳市的废墟里。');
    else if (v.hunger <= 0) this.gameOver('饥饿吞噬了你，再没能站起来。');
    else if (v.san <= 0) this.gameOver('精神彻底崩溃，你成了又一个青阳市的疯子。');
    else if (v.infection >= 100) this.gameOver('体温升到顶点，你的瞳孔浑浊下去——你转化了。');
  },
  gameOver(reason) { this.state.over = true; this.state.overReason = reason; },

  applyEventThreat(ev, res) {
    const changes = [];
    const routeChanges = [];
    const note = (loc, delta) => {
      const ch = this.adjustLocationThreat(loc, delta);
      if (ch.delta) changes.push(ch);
    };
    const routeNote = (routeId, delta = 0, opts = {}) => {
      const def = this.routeDef(routeId);
      if (!def) return;
      const st = this.routeState(routeId);
      if (!st.known && !opts.discover) return;
      const item = { id: routeId, name: def.name };
      if (opts.discover) { st.known = true; item.discover = true; }
      if (delta) {
        const ch = this.adjustRouteNoise(routeId, delta);
        if (ch.delta) Object.assign(item, { before: ch.before, after: ch.after, delta: ch.delta });
      }
      if (opts.block && !st.blocked) { st.blocked = true; item.block = true; }
      if (opts.unblock && st.blocked) { st.blocked = false; item.unblock = true; }
      if (item.discover || item.delta || item.block || item.unblock) routeChanges.push(item);
    };
    const randomKnownRoute = () => this.pick(this.knownRoutes()).id;

    if (ev.id === 'horde_far') {
      note(this.pick(Object.keys(GameData.LOCATIONS)), 1);
      routeNote(randomKnownRoute(), 1);
    } else if (ev.id === 'horde_near') {
      const loc = this.mostThreatenedLocation();
      note(loc, 1);
      note(this.pick(Object.keys(GameData.LOCATIONS)), 1);
      routeChanges.push(...this.adjustPathNoise(this.routeTo(loc), 1));
      this.state.flags.threat = (this.state.flags.threat || 2) + 1;
    } else if (ev.id === 'wildfire') {
      note(this.pick(['居民区', '超市', '加油站', '仓库']), 1);
      routeNote(this.pick(['market-gas', 'warehouse-gas']), 1, { block: this.rnd() < 0.35 });
    } else if (ev.id === 'quake') {
      note('医院', 1); note('仓库', 1);
      routeNote(this.pick(['res-hospital', 'pharmacy-hospital', 'market-warehouse']), 1, { block: this.rnd() < 0.30 });
    } else if (ev.id === 'traitor') {
      this.state.flags.threat = (this.state.flags.threat || 2) + 1;
      routeNote(randomKnownRoute(), 1);
    } else if (ev.id === 'caravan') {
      note(this.pick(Object.keys(GameData.LOCATIONS)), -1);
      routeNote(randomKnownRoute(), -1);
    } else if (ev.id === 'rainstorm') {
      note(this.pick(Object.keys(GameData.LOCATIONS)), -1);
      if (this.rnd() < 0.45) routeNote('drain-hospital', 0, { discover: true });
      else routeNote(randomKnownRoute(), -1);
    }
    if (ev.id === 'stranger') this.adjustFaction(this.pick(Object.keys(GameData.FACTIONS)), 1, res, '流浪者传话');
    else if (ev.id === 'caravan') this.adjustFaction('blackmarket', 3, res, '贸易车队路过');
    else if (ev.id === 'traitor') { this.adjustFaction('nanqiao', -3, res, '告密传闻'); this.adjustFaction('rustfang', -2, res, '位置暴露'); }
    else if (ev.id === 'horde_near') this.adjustFaction('oldguard', 1, res, '共同警戒');
    else if (ev.id === 'supply') this.adjustFaction('whitetower', 1, res, '补给消息');
    else if (ev.id === 'wildfire') this.adjustFaction('blackmarket', -1, res, '道路受阻');
    res.threatChanges = changes;
    res.routeChanges = [...(res.routeChanges || []), ...routeChanges];
  },
  /* ---------- 工具 ---------- */
  addBuff(name, desc, expireWeek) {
    this.state.buffs = this.state.buffs.filter(b => b.name !== name);
    this.state.buffs.push({ name, desc, expireWeek });
  },

  genNPC(factionId = null) {
    const surnames = '赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金'.split('');
    const given = ['', '伟', '芳', '娜', '强', '军', '磊', '洋', '勇', '艳', '杰', '涛', '明', '霞', '超', '秀英'];
    const name = this.pick(surnames) + (this.pick(given) || this.pick(surnames));
    const prof = this.pick(Object.keys(GameData.PROFESSIONS));
    const fid = factionId || this.pickFaction();
    const top = GameData.ATTRS.slice(0, 5).map(a => ({ name: a.name, val: this.randInt(20, 80) }))
      .sort((x, y) => y.val - x.val).slice(0, 3);
    return this.initCompanionDepth({ name, profession: prof, factionId: fid, factionName: this.factionName(fid), top, affinity: 0 });
  },

  // 队友死亡判定（死亡率与普通 NPC 相同）：好感越高越倾向于拼命相救，略降概率
  maybeKillCompanions(res, baseChance) {
    res.deaths = res.deaths || [];
    const s = this.state;
    for (const c of [...this.ensureCompanions()]) {
      const loyalty = this.companionLoyalty(c);
      const ch = Math.max(0.02, baseChance + (c.wound || 0) * 0.0012 + (c.stress || 0) * 0.0008 - Math.max(0, loyalty) * 0.0007);
      if (this.rnd() < ch) {
        s.companions = s.companions.filter(x => x !== c);
        res.deaths.push(c.name);
        // 目睹队友死亡：San -15~20（死状惨烈更高）
        const grim = this.rnd() < 0.35;
        const sanHit = grim ? this.randInt(16, 35) : this.randInt(15, 20);
        res.deltas = res.deltas || {};
        res.deltas.san = (res.deltas.san || 0) - sanHit;
        res.parts.push(`${c.name} 死了${grim ? '，死状惨烈' : ''}。San -${sanHit}`);
        for (const other of this.ensureCompanions()) {
          const p = this.companionPersonality(other.personality);
          this.adjustCompanionStress(other, p.name === '顾家' ? 18 : 10, res, '目睹队友死亡');
        }
      } else if (this.rnd() < baseChance * 0.8) {
        this.injureCompanion(c, this.randInt(6, 18), res, '险些丧命');
      }
    }
    return res.deaths;
  },

  /* ---------- 存档 / 读档 ---------- */
  serialize() { return JSON.stringify({ v: 1, seed: this._seed, state: this.state }); },
  load(json) {
    const o = typeof json === 'string' ? JSON.parse(json) : json;
    if (!o || !o.state) return null;
    this._seed = o.seed || 1;
    this.state = o.state;
    if (!this.state.warehouse) this.state.warehouse = [];     // 旧档兼容
    if (!this.state.flags) this.state.flags = {};
    this.ensureLocationThreats();
    this.ensureRoutes();
    this.ensureFactions();
    this.ensureStory();
    this.ensureCompanions();
    return this.state;
  },
};

/* 小工具：档位/属性中文 */
function tierCN(t) { return { crit: '大成功', pass: '成功', fail: '失败', fumble: '大失败' }[t] || t; }
function attrName(key) { const a = GameData.ATTRS.find(a => a.key === key); return a ? a.name : key; }
function signedPct(v) { const n = Math.round((v || 0) * 100); return (n >= 0 ? '+' : '') + n + '%'; }

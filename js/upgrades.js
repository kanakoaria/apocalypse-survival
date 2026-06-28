/* Runtime upgrades for older hosted builds.
 * This file is intentionally additive: if the main scripts already contain the
 * feature, it leaves them alone; otherwise it patches the missing surface.
 */
(function () {
  if (typeof GameData === 'undefined' || typeof Engine === 'undefined' || typeof UI === 'undefined') return;
  if (window.__ARIA_RUNTIME_UPGRADES__) return;
  window.__ARIA_RUNTIME_UPGRADES__ = true;

  const TRAITS = [
    { id: 'strong', kind: 'positive', name: '强健', desc: '力量 +8，开局生命压力更小。', bias: { str: 8 }, vitals: { hp: 10 } },
    { id: 'nimble', kind: 'positive', name: '轻身', desc: '敏捷 +8，潜行和闪避更稳。', bias: { agi: 8 } },
    { id: 'bookish', kind: 'positive', name: '爱读书', desc: '智力 +8，研究和修理更好。', bias: { int: 8 } },
    { id: 'sharp_eye', kind: 'positive', name: '眼尖', desc: '感知 +8，更容易发现路线和物资。', bias: { per: 8 } },
    { id: 'field_medic', kind: 'positive', name: '会包扎', desc: '开局额外带两份绷带。', items: ['绷带', '绷带'] },
    { id: 'anxious', kind: 'negative', name: '易惊', desc: '开局 San -12。', vitals: { san: -12 } },
    { id: 'old_wound', kind: 'negative', name: '旧伤', desc: '开局带轻微骨伤。', injuries: { fracture: 1 } },
    { id: 'notorious', kind: 'negative', name: '名声差', desc: '口才 -6，魅力 -6。', bias: { elo: -6, chm: -6 } },
    { id: 'weak_stomach', kind: 'negative', name: '坏胃口', desc: '开局饱腹 -10。', vitals: { hunger: -10 } },
  ];
  if (!Array.isArray(GameData.TRAITS)) GameData.TRAITS = TRAITS;

  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const traitMap = () => Object.fromEntries((GameData.TRAITS || []).map(t => [t.id, t]));

  if (!Engine.traitDefs) {
    Engine.normalizeTraits = function (traits = []) {
      const byId = traitMap();
      const out = [];
      const count = { positive: 0, negative: 0 };
      for (const raw of Array.isArray(traits) ? traits : []) {
        const id = String(raw || '');
        const t = byId[id];
        if (!t || out.includes(id)) continue;
        const kind = t.kind === 'negative' ? 'negative' : 'positive';
        if (count[kind] >= 2) continue;
        count[kind] += 1;
        out.push(id);
      }
      return out;
    };
    Engine.traitDefs = function (ids = null) {
      const byId = traitMap();
      const list = ids || (this.state && this.state.traits) || [];
      return (Array.isArray(list) ? list : []).map(id => byId[id]).filter(Boolean);
    };
    Engine.traitNames = function (ids = null) { return this.traitDefs(ids).map(t => t.name); };
  }

  if (!/\btraits\b/.test(String(Engine.newGame))) {
    const nativeNewGame = Engine.newGame.bind(Engine);
    Engine.newGame = function (opts = {}) {
      const traits = this.normalizeTraits ? this.normalizeTraits(opts.traits || []) : [];
      const state = nativeNewGame(opts);
      state.traits = traits;
      const defs = this.traitDefs ? this.traitDefs(traits) : [];
      for (const t of defs) {
        for (const [k, v] of Object.entries(t.bias || {})) {
          state.attrs[k] = clamp((state.attrs[k] || 0) + v, 1, 100);
        }
        for (const [k, v] of Object.entries(t.vitals || {})) {
          const max = k === 'hp' ? state.hpCap || 100 : 100;
          state.vitals[k] = clamp((state.vitals[k] || 0) + v, 0, max);
        }
        if (t.items && this.addItem) this.addItem(...t.items);
        if (t.injuries && this.ensureInjuries) {
          const inj = this.ensureInjuries();
          for (const [k, v] of Object.entries(t.injuries)) inj[k] = clamp((inj[k] || 0) + v, 0, 3);
        }
      }
      return state;
    };
  }

  if (!Engine.__traitLoadPatched && Engine.load) {
    Engine.__traitLoadPatched = true;
    const nativeLoad = Engine.load.bind(Engine);
    Engine.load = function (json) {
      const state = nativeLoad(json);
      if (state && this.normalizeTraits) state.traits = this.normalizeTraits(state.traits || []);
      return state;
    };
  }

  if (!Engine.applyCompanionWeeklyEvents) {
    Object.assign(Engine, {
      companionEventTitle(type) {
        return { request: '队友请求', argument: '队友争吵', care: '队友照顾', solo: '独自行动', betrayal: '背叛', sacrifice: '牺牲' }[type] || '队友事件';
      },
      recordCompanionEvent(res, type, c, text, extra = {}) {
        if (!res) return null;
        const names = Array.isArray(c) ? c.map(x => x.name).filter(Boolean) : [c && c.name].filter(Boolean);
        const ev = { type, title: this.companionEventTitle(type), names, text, week: this.state.week, ...extra };
        res.companionEvents = [...(res.companionEvents || []), ev];
        res.parts = [...(res.parts || []), `${ev.title}：${names.join('、') || '队伍'}——${text}`];
        for (const item of (Array.isArray(c) ? c : [c])) if (item) {
          item.lastEvent = { type, title: ev.title, text, week: this.state.week };
          if (this.companionMemory) this.companionMemory(item, ev.title + '：' + text);
        }
        return ev;
      },
      loseRandomSupply(res, count = 1) {
        const lost = [];
        const pools = [this.state.inventory || [], this.state.warehouse || []];
        for (let n = 0; n < count; n++) {
          const pool = pools.find(arr => arr.some(x => x !== '背包'));
          if (!pool) break;
          const candidates = pool.map((x, i) => ({ x, i })).filter(v => v.x !== '背包');
          const pick = this.pick ? this.pick(candidates) : candidates[0];
          lost.push(pool.splice(pick.i, 1)[0]);
        }
        if (lost.length) res.losses = [...(res.losses || []), ...lost];
        return lost;
      },
      companionRequest(c, res) {
        this.initCompanionDepth(c);
        const need = c.wound >= 45 ? '想先处理伤口，别再把血拖进下一次外出' : c.stress >= 70 ? '请求下一周少冒险一次，他快撑不住了' : '希望你能分一点时间听他说完';
        this.adjustCompanionStress(c, 4, res, '请求未决');
        this.recordCompanionEvent(res, 'request', c, need);
      },
      companionArgument(a, b, res) {
        this.adjustCompanionStress(a, this.randInt(5, 10), res, '争吵');
        this.adjustCompanionStress(b, this.randInt(5, 10), res, '争吵');
        this.adjustRelation(a.name, -this.randInt(2, 5));
        this.adjustRelation(b.name, -this.randInt(2, 5));
        this.recordCompanionEvent(res, 'argument', [a, b], `${a.name} 和 ${b.name} 因为物资分配吵了起来，队伍里的空气变硬了。`);
      },
      companionCare(helper, target, res) {
        const p = this.companionPersonality(helper.personality);
        const amount = this.randInt(6, p.name === '照护者' ? 16 : 11);
        this.healCompanion(target, amount, res, `${helper.name}照顾`);
        this.adjustCompanionStress(target, -this.randInt(4, 9), res, '被照顾');
        this.adjustRelation(target.name, this.randInt(2, 5));
        this.recordCompanionEvent(res, 'care', [helper, target], `${helper.name} 替 ${target.name} 重新处理伤口，至少让他今晚能睡一会儿。`, { amount });
      },
      companionSolo(c, res) {
        this.initCompanionDepth(c);
        const target = Math.max(15, 62 + this.companionLoyalty(c) * 0.25 - (c.stress || 0) * 0.25 - (c.wound || 0) * 0.18);
        const roll = this.randInt(1, 100);
        if (roll <= target) {
          const item = this.pick(['罐头', '瓶装水', '绷带', '能量棒']);
          const stashed = this.addItem(item);
          res.gains = [...(res.gains || []), item];
          if (stashed.length) res.stashed = [...(res.stashed || []), ...stashed];
          this.adjustCompanionStress(c, this.randInt(2, 6), res, '独自行动');
          this.recordCompanionEvent(res, 'solo', c, `${c.name} 天没亮就摸出去，带回了 ${item}。`, { success: true, roll, target: Math.round(target), item });
        } else {
          this.injureCompanion(c, this.randInt(8, 18), res, '独自行动受伤');
          this.recordCompanionEvent(res, 'solo', c, `${c.name} 私自外出，空手回来，还把自己弄伤了。`, { success: false, roll, target: Math.round(target) });
        }
      },
      companionBetrayal(c, res) {
        const lost = this.loseRandomSupply(res, this.randInt(1, 2));
        this.state.companions = this.state.companions.filter(x => x !== c);
        this.adjustRelation(c.name, -30);
        this.recordCompanionEvent(res, 'betrayal', c, `${c.name} 趁夜离开${lost.length ? '，还带走了 ' + lost.join('、') : ''}。`, { lost });
      },
      companionSacrifice(c, res) {
        this.state.companions = this.state.companions.filter(x => x !== c);
        res.deaths = [...(res.deaths || []), c.name];
        res.deltas = res.deltas || {};
        const saved = this.randInt(6, 14);
        res.deltas.hp = Math.min(0, (res.deltas.hp || 0) + saved);
        res.deltas.san = (res.deltas.san || 0) - this.randInt(8, 14);
        this.recordCompanionEvent(res, 'sacrifice', c, `${c.name} 把最后的出口让给了你。你少受了一些伤，但这个名字会留在脑子里。`, { savedHp: saved });
      },
      applyCompanionWeeklyEvents(res) {
        const comps = this.ensureCompanions();
        if (!comps.length || this.state.over) return;
        const low = comps.find(c => this.companionLoyalty(c) <= -35 || ((c.stress || 0) >= 88 && this.companionLoyalty(c) <= -15));
        if (low && this.rnd() < 0.38) return this.companionBetrayal(low, res);
        const hurt = comps.find(c => (c.wound || 0) >= 45 || (c.stress || 0) >= 75);
        if (hurt && this.rnd() < 0.55) return this.companionRequest(hurt, res);
        const wounded = comps.find(c => (c.wound || 0) >= 18);
        const helper = comps.find(c => c !== wounded && ['medic', 'caring'].includes(c.personality));
        if (wounded && helper && this.rnd() < 0.55) return this.companionCare(helper, wounded, res);
        const tense = comps.filter(c => (c.stress || 0) >= 45);
        if (tense.length >= 2 && this.rnd() < 0.42) return this.companionArgument(tense[0], tense[1], res);
        const solo = comps.find(c => ['brave', 'opportunist'].includes(c.personality) && (c.stress || 0) < 75 && (c.wound || 0) < 45);
        if (solo && this.rnd() < 0.30) return this.companionSolo(solo, res);
      },
    });
  }

  if (!Engine.__companionEventHooks) {
    Engine.__companionEventHooks = true;
    const nativeEndWeek = Engine.endWeek && Engine.endWeek.bind(Engine);
    if (nativeEndWeek) Engine.endWeek = function () {
      const out = nativeEndWeek();
      if (out && this.applyCompanionWeeklyEvents) this.applyCompanionWeeklyEvents(out);
      return out;
    };
    const nativeKill = Engine.maybeKillCompanions && Engine.maybeKillCompanions.bind(Engine);
    if (nativeKill) Engine.maybeKillCompanions = function (res, baseChance) {
      const rescuer = this.ensureCompanions().find(c => this.companionLoyalty(c) >= 55 && (c.wound || 0) < 55);
      if (rescuer && res && res.deltas && (res.deltas.hp || 0) < 0 && this.rnd() < Math.min(0.28, baseChance + 0.12)) {
        this.companionSacrifice(rescuer, res);
        return res.deaths || [];
      }
      return nativeKill(res, baseChance);
    };
  }

  if (!UI.traitOptionsHTML) {
    UI.traitOptionsHTML = function () {
      const groups = { positive: [], negative: [] };
      for (const t of GameData.TRAITS || []) groups[t.kind === 'negative' ? 'negative' : 'positive'].push(t);
      const title = { positive: '正面特质', negative: '负面特质' };
      return `<div class="trait-picker">
        <div class="trait-head"><span>开局特质</span><em id="trait-count">正面 0/2 · 负面 0/2</em></div>
        <div class="trait-cols">${Object.entries(groups).map(([kind, list]) => `
          <div class="trait-col"><b>${title[kind]}</b>
            ${list.map(t => `<label class="trait-card ${kind}" title="${this.esc(t.desc)}"><input type="checkbox" value="${this.esc(t.id)}" data-trait="${kind}"><span>${this.esc(t.name)}</span><small>${this.esc(t.desc)}</small></label>`).join('')}
          </div>`).join('')}</div>
      </div>`;
    };
    UI.selectedTraitIds = function () {
      return Array.from(document.querySelectorAll('[data-trait]:checked')).map(x => x.value);
    };
    UI.bindTraitPicker = function () {
      const boxes = Array.from(document.querySelectorAll('[data-trait]'));
      const update = () => {
        const counts = { positive: 0, negative: 0 };
        for (const b of boxes) if (b.checked) counts[b.dataset.trait] = (counts[b.dataset.trait] || 0) + 1;
        const c = this.el('trait-count');
        if (c) c.textContent = `正面 ${counts.positive || 0}/2 · 负面 ${counts.negative || 0}/2`;
      };
      boxes.forEach(b => b.onchange = () => {
        const kind = b.dataset.trait;
        const count = boxes.filter(x => x.dataset.trait === kind && x.checked).length;
        if (count > 2) { b.checked = false; this.toast(kind === 'negative' ? '负面特质最多 2 个' : '正面特质最多 2 个'); }
        update();
      });
      update();
    };
    const nativeRenderSetup = UI.renderSetup.bind(UI);
    UI.renderSetup = function () {
      nativeRenderSetup();
      if (document.querySelector('.trait-picker')) return;
      const hints = Array.from(document.querySelectorAll('.form .hint'));
      const target = hints.find(x => /可招募队友/.test(x.textContent)) || hints[0];
      if (target) target.insertAdjacentHTML('beforebegin', this.traitOptionsHTML());
      this.bindTraitPicker();
    };
    UI.start = async function () {
      const name = (this.el('f-name').value || '无名者').trim();
      Engine.newGame({
        name,
        gender: this.el('f-gender').value,
        age: this.el('f-age').value,
        profession: this.el('f-prof').value,
        period: this.el('f-period').value,
        traits: this.selectedTraitIds(),
      });
      this.renderGame();
      await this.narrate('intro');
      this.autosave();
    };
  }

  if (!UI.routeMapHTML) {
    UI.routeMapHTML = function (routes) {
      const pos = {
        '庇护所': [55, 105], '居民区': [185, 70], '超市': [185, 150],
        '药店': [315, 55], '医院': [435, 90], '仓库': [335, 180], '加油站': [465, 205],
      };
      const known = (routes || []).filter(r => r.known !== false && pos[r.from] && pos[r.to]);
      const line = known.map(r => {
        const a = pos[r.from], b = pos[r.to];
        const cls = ['map-route', r.status === '堵塞' ? 'blocked' : '', r.noise >= 3 ? 'loud' : '', r.risk < 0 ? 'safe' : ''].filter(Boolean).join(' ');
        return `<line class="${cls}" x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}"><title>${this.esc(r.name)} · ${this.esc(r.status)} · 噪${r.noise} · ${r.risk >= 0 ? '+' : ''}${r.risk}%</title></line>`;
      }).join('');
      const nodes = Object.entries(pos).map(([name, p]) => `<g class="map-node"><circle cx="${p[0]}" cy="${p[1]}" r="${name === '庇护所' ? 14 : 10}"></circle><text x="${p[0]}" y="${p[1] - 16}">${this.esc(name)}</text></g>`).join('');
      return `<div class="city-map-wrap"><div class="map-legend"><b>青阳市路线图</b><span>已发现 ${known.length}/${(GameData.ROUTES || []).length}</span><em>红=堵塞 黄=高噪 绿=捷径</em></div><svg class="city-map" viewBox="0 0 520 240" role="img" aria-label="青阳市路线图">${line}${nodes}</svg></div>`;
    };
    const nativeRenderPanel = UI.renderPanel && UI.renderPanel.bind(UI);
    if (nativeRenderPanel) UI.renderPanel = function () {
      nativeRenderPanel();
      const panel = this.el('panel');
      if (!panel || panel.querySelector('.city-map-wrap') || !Engine.routeIntel) return;
      const sections = Array.from(panel.querySelectorAll('.sec'));
      const routesSec = sections.find(sec => /路线情报/.test(sec.textContent));
      if (routesSec) routesSec.insertAdjacentHTML('afterbegin', this.routeMapHTML(Engine.routeIntel()));
    };
  }

  const style = document.createElement('style');
  style.textContent = `
    .trait-picker{border:1px solid var(--line);background:#0b0b0d;border-radius:4px;padding:10px;display:flex;flex-direction:column;gap:9px}
    .trait-head{display:flex;justify-content:space-between;gap:10px;align-items:center;color:var(--ink-dim);font-size:13px}.trait-head span{color:#e7e2da}.trait-head em{font-family:var(--mono);color:var(--ink-faint);font-size:11px}
    .trait-cols{display:grid;grid-template-columns:1fr 1fr;gap:10px}.trait-col{display:flex;flex-direction:column;gap:6px;min-width:0}.trait-col>b{font-size:12px;color:var(--rust);font-weight:normal;letter-spacing:1px}
    .trait-card{display:grid;grid-template-columns:auto 1fr;gap:2px 7px;align-items:start;border:1px solid var(--line2);background:#101114;padding:7px;border-radius:4px;line-height:1.25}.trait-card input{margin-top:2px;accent-color:var(--blood)}.trait-card span{font-size:13px;color:var(--ink)}.trait-card small{grid-column:2;color:var(--ink-faint);font-size:11px;line-height:1.35}
    .trait-card.positive:has(input:checked){border-color:#4a3a1a;background:#17130e}.trait-card.negative:has(input:checked){border-color:var(--blood-deep);background:#1a1012}
    .city-map-wrap{border:1px solid var(--line2);background:#0b0c0d;border-radius:4px;margin:6px 0 10px;padding:8px}.map-legend{display:flex;flex-wrap:wrap;align-items:center;gap:8px;color:var(--ink-faint);font-size:11px}.map-legend b{color:#e7e2da;font-size:12px}.map-legend span{color:var(--rust)}.city-map{width:100%;height:auto;margin-top:5px;display:block}.map-route{stroke:#7b6f5e;stroke-width:3;stroke-linecap:round;opacity:.8}.map-route.loud{stroke:#c49a43}.map-route.safe{stroke:#7f9c6a}.map-route.blocked{stroke:#9b3030;stroke-dasharray:8 5;opacity:1}.map-node circle{fill:#16181b;stroke:#b6a58c;stroke-width:2}.map-node text{fill:#d7d0c4;font-size:12px;text-anchor:middle;font-family:var(--mono)}
    @media(max-width:640px){.trait-cols{grid-template-columns:1fr}.trait-card small{font-size:10.5px}.map-legend{display:block}.map-legend>*{margin-right:8px}}
  `;
  document.head.appendChild(style);
})();

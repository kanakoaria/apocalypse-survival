/* Custom profession point-buy and explicit check-result detail patch. */
(function (global) {
  'use strict';

  const GameDataRef = typeof GameData !== 'undefined' ? GameData : global.GameData;
  const EngineRef = typeof Engine !== 'undefined' ? Engine : global.Engine;
  if (!GameDataRef || !EngineRef) return;

  const ATTR_RULES = Object.freeze({ total: 350, min: 20, max: 85 });
  GameDataRef.CUSTOM_ATTR_POINTS = GameDataRef.CUSTOM_ATTR_POINTS || ATTR_RULES;

  const attrDefs = () => (GameDataRef.ATTRS || []).filter(a => a && a.key);
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const sumAttrs = (attrs) => attrDefs().reduce((sum, a) => sum + (Math.round(+attrs[a.key]) || 0), 0);

  function normalizeCustomAttrs(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const rules = GameDataRef.CUSTOM_ATTR_POINTS || ATTR_RULES;
    const out = {};
    for (const a of attrDefs()) {
      const v = Math.round(+raw[a.key]);
      if (!Number.isFinite(v) || v < rules.min || v > rules.max) return null;
      out[a.key] = v;
    }
    return sumAttrs(out) === rules.total ? out : null;
  }

  function traitDefsFor(engine, ids) {
    if (engine.traitDefs) return engine.traitDefs(ids);
    const list = Array.isArray(GameDataRef.TRAITS)
      ? GameDataRef.TRAITS
      : Object.entries(GameDataRef.TRAITS || {}).map(([id, t]) => ({ id, ...t }));
    return list.filter(t => ids.includes(t.id));
  }

  EngineRef.customAttrRules = function customAttrRules() {
    return GameDataRef.CUSTOM_ATTR_POINTS || ATTR_RULES;
  };
  EngineRef.normalizeCustomAttrs = normalizeCustomAttrs;

  const nativeNewGame = EngineRef.newGame && EngineRef.newGame.bind(EngineRef);
  if (nativeNewGame && !EngineRef.__customProfessionPointBuy) {
    EngineRef.__customProfessionPointBuy = true;
    EngineRef.newGame = function newGameWithCustomAttrs(opts = {}) {
      const chosen = normalizeCustomAttrs(opts.customAttrs);
      const state = nativeNewGame(opts);
      if (!state || !chosen) return state;

      const traitIds = state.traits || opts.traits || [];
      const traitBias = {};
      for (const t of traitDefsFor(this, traitIds)) {
        for (const [k, v] of Object.entries(t.bias || {})) traitBias[k] = (traitBias[k] || 0) + v;
      }

      const attrs = {};
      const attrRolls = {};
      for (const a of attrDefs()) {
        const base = chosen[a.key];
        const traitMod = traitBias[a.key] || 0;
        const value = clamp(base + traitMod, 1, 95);
        attrs[a.key] = value;
        attrRolls[a.key] = { base, careerMod: 0, traitMod, value, source: 'custom-point-buy' };
      }
      state.attrs = attrs;
      state.flags = state.flags || {};
      state.flags.creation = {
        ...(state.flags.creation || {}),
        attrRolls,
        customAttrs: { ...chosen },
        customAttrTotal: sumAttrs(chosen),
      };
      state.flags.profession = {
        ...(state.flags.profession || {}),
        customPointBuy: true,
        customAttrTotal: sumAttrs(chosen),
      };
      return state;
    };
  }

  const UIRef = typeof UI !== 'undefined' ? UI : global.UI;
  if (!UIRef || UIRef.__customProfessionPointBuy) return;
  UIRef.__customProfessionPointBuy = true;

  UIRef.customAttrConfig = function customAttrConfig() {
    return GameDataRef.CUSTOM_ATTR_POINTS || ATTR_RULES;
  };

  UIRef.customAttrHTML = function customAttrHTML() {
    const cfg = this.customAttrConfig();
    const attrs = attrDefs();
    const base = Math.floor(cfg.total / Math.max(1, attrs.length));
    let extra = cfg.total - base * attrs.length;
    const rows = attrs.map(a => {
      const value = base + (extra-- > 0 ? 1 : 0);
      return `<label class="custom-attr-row"><span>${this.esc(a.name)}</span><input data-custom-attr="${this.esc(a.key)}" type="number" min="${cfg.min}" max="${cfg.max}" step="1" value="${value}"></label>`;
    }).join('');
    return `<div class="custom-attr-panel hidden" id="custom-attr-panel">
      <div class="custom-attr-head"><span>自定义属性</span><em id="custom-attr-left">${cfg.total}/${cfg.total}</em></div>
      <div class="custom-attr-grid">${rows}</div>
    </div>`;
  };

  UIRef.customAttrInputs = function customAttrInputs() {
    return Array.from(document.querySelectorAll('[data-custom-attr]'));
  };

  UIRef.bindCustomAttrPicker = function bindCustomAttrPicker() {
    const custom = this.el && this.el('f-prof-custom');
    const panel = this.el && this.el('custom-attr-panel');
    if (!custom || !panel) return;
    const cfg = this.customAttrConfig();
    const inputs = this.customAttrInputs();
    const totalEl = this.el('custom-attr-left');
    const clampInput = (inp) => {
      if (inp.value === '') return;
      const v = clamp(Math.round(+inp.value || cfg.min), cfg.min, cfg.max);
      inp.value = String(v);
    };
    const update = () => {
      const active = !!custom.value.trim();
      panel.classList.toggle('hidden', !active);
      let sum = 0;
      for (const inp of inputs) sum += Math.round(+inp.value) || 0;
      const left = cfg.total - sum;
      panel.classList.toggle('invalid', active && left !== 0);
      if (totalEl) totalEl.textContent = left === 0 ? `${sum}/${cfg.total}` : left > 0 ? `剩余 ${left}` : `超出 ${Math.abs(left)}`;
    };
    inputs.forEach(inp => {
      inp.addEventListener('input', update);
      inp.addEventListener('change', () => { clampInput(inp); update(); });
    });
    custom.addEventListener('input', update);
    update();
  };

  UIRef.customAttrAllocation = function customAttrAllocation() {
    const custom = this.el && this.el('f-prof-custom');
    if (!custom || !custom.value.trim()) return null;
    const cfg = this.customAttrConfig();
    const out = {};
    for (const inp of this.customAttrInputs()) {
      const key = inp.dataset.customAttr;
      const value = Math.round(+inp.value);
      if (!Number.isFinite(value) || value < cfg.min || value > cfg.max) {
        this.toast(`单项属性需在 ${cfg.min}-${cfg.max} 之间`);
        return false;
      }
      out[key] = value;
    }
    const sum = sumAttrs(out);
    if (sum !== cfg.total) {
      this.toast(`自定义职业属性点必须正好 ${cfg.total} 点`);
      return false;
    }
    return out;
  };

  const nativeRenderSetup = UIRef.renderSetup && UIRef.renderSetup.bind(UIRef);
  if (nativeRenderSetup) {
    UIRef.renderSetup = function renderSetupWithCustomAttrs() {
      nativeRenderSetup();
      const custom = this.el && this.el('f-prof-custom');
      if (custom && !this.el('custom-attr-panel')) {
        const label = custom.closest('label');
        const hint = label && label.nextElementSibling && label.nextElementSibling.classList.contains('hint') ? label.nextElementSibling : label;
        if (hint) hint.insertAdjacentHTML('afterend', this.customAttrHTML());
      }
      this.bindCustomAttrPicker();
    };
  }

  UIRef.start = async function startWithCustomAttrs() {
    const customAttrs = this.customAttrAllocation ? this.customAttrAllocation() : null;
    if (customAttrs === false) return;
    const name = (this.el('f-name').value || '无名者').trim();
    EngineRef.newGame({
      name,
      gender: this.el('f-gender').value,
      age: this.el('f-age').value,
      profession: ((this.el('f-prof-custom') && this.el('f-prof-custom').value.trim()) || this.el('f-prof').value),
      traits: this.selectedTraitIds ? this.selectedTraitIds() : [],
      period: this.el('f-period').value,
      customAttrs,
    });
    this.renderGame();
    await this.narrate('intro');
    this.autosave();
  };

  UIRef.checkOutcomeText = function checkOutcomeText(line) {
    const s = String(line || '');
    if (!/\d{1,3}\/\d{1,3}/.test(s) || /结果[:：]/.test(s)) return s;
    const firstRoll = s.search(/\d{1,3}\/\d{1,3}/);
    const tail = s.slice(firstRoll);
    const tiers = [...tail.matchAll(/大成功|大失败|成功|失败/g)].map(m => m[0]);
    if (tiers.length) {
      const detail = tiers.length === 1
        ? (tiers[0].includes('成功') ? '成功' : '失败')
        : tiers.map((t, i) => `判定${i + 1}${t.includes('成功') ? '成功' : '失败'}`).join('、');
      return `${s}（结果：${detail}）`;
    }
    const rolls = [...tail.matchAll(/(\d{1,3})\/(\d{1,3})/g)]
      .map((m, i) => ({ i: i + 1, roll: +m[1], target: +m[2] }))
      .filter(r => Number.isFinite(r.roll) && Number.isFinite(r.target));
    if (rolls.length) {
      const detail = rolls.length === 1
        ? (rolls[0].roll <= rolls[0].target ? '成功' : '失败')
        : rolls.map(r => `判定${r.i}${r.roll <= r.target ? '成功' : '失败'}`).join('、');
      return `${s}（结果：${detail}）`;
    }
    return s;
  };

  const nativeDetailLines = UIRef.detailLines && UIRef.detailLines.bind(UIRef);
  if (nativeDetailLines) {
    UIRef.detailLines = function detailLinesWithOutcome(kind, payload) {
      const lines = nativeDetailLines(kind, payload);
      return lines ? lines.map(line => this.checkOutcomeText(line)) : lines;
    };
  }

  if (typeof document !== 'undefined' && document.head && !document.getElementById('custom-profession-style')) {
    const style = document.createElement('style');
    style.id = 'custom-profession-style';
    style.textContent = `.custom-attr-panel{border:1px solid var(--line);background:#101113;border-radius:4px;padding:10px;margin:-6px 0 10px}.custom-attr-panel.hidden{display:none}.custom-attr-head{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:8px;font-family:var(--mono);font-size:12px;color:var(--ink-faint)}.custom-attr-head span{color:#d8d2c8}.custom-attr-head em{font-style:normal;color:#a9c56a}.custom-attr-panel.invalid .custom-attr-head em{color:var(--blood)}.custom-attr-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px 10px}.custom-attr-row{display:grid;grid-template-columns:48px minmax(0,1fr);align-items:center;gap:8px;margin:0;font-family:var(--mono);font-size:12px;color:var(--ink-dim)}.custom-attr-row input{height:32px;min-width:0;padding:5px 7px;text-align:right;font-family:var(--mono)}@media (max-width:520px){.custom-attr-grid{grid-template-columns:1fr}.custom-attr-row{grid-template-columns:54px minmax(0,1fr)}}`;
    document.head.appendChild(style);
  }
})(typeof window !== 'undefined' ? window : globalThis);

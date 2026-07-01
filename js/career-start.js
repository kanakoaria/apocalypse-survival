/* Career-start runtime patch.
 * Keeps hosted builds aligned with the career opening rules without requiring a
 * full engine rewrite on every GitHub Pages update.
 */
(function () {
  if (typeof GameData === 'undefined' || typeof Engine === 'undefined') return;
  const g = typeof globalThis !== 'undefined' ? globalThis : window;
  if (g.__ARIA_CAREER_START__) return;
  g.__ARIA_CAREER_START__ = true;

  const PERIODS = {
    early: { name: '爆发初期', label: '爆发初期(1-5天)', range: [1, 5], trust: 3, kitKeep: 1.00, utility: '水电气大多仍可用，超市和药店还没被完全搬空。', note: '人们还没有完全接受末日，求助和合作更容易发生。' },
    mid: { name: '爆发中期', label: '爆发中期(6-14天)', range: [6, 14], trust: -1, kitKeep: 0.72, utility: '水电开始不稳定，货架被扫空一半以上。', note: '多数人已经变成丧尸，幸存者开始谨慎、猜疑。' },
    late: { name: '爆发后期', label: '爆发后期(15天+)', range: [15, 45], trust: -5, kitKeep: 0.42, utility: '公共设施基本停摆，能直接入口的补给非常稀少。', note: '每一次接触都像赌命，身份带来的善意被大幅削弱。' },
  };
  const PROFESSIONS = {
    '学生': { bias: { agi: 5, int: 8, chm: 2 }, firearm: 'none', items: ['背包', '学生证', '能量棒×2', '小刀'], kits: { early: ['背包', '学生证', '能量棒×2', '矿泉水', '小刀', '作业本'], mid: ['背包', '学生证', '能量棒', '半瓶矿泉水', '小刀'], late: ['学生证', '能量棒', '小刀'] }, impression: { factions: { nanqiao: 2 }, professions: { 教师: 4, 民警: 1, 小偷: -2 } }, note: '年轻、学得快，但缺乏实战；更容易被教师和互助营地照顾。' },
    '民警': { bias: { str: 10, per: 8, elo: 5 }, firearm: 'pistol', items: ['警棍', '手铐', '手枪(弹药7)', '执法记录仪'], kits: { early: ['警棍', '手铐', '手枪(弹药7)', '执法记录仪', '半瓶矿泉水'], mid: ['警棍', '手枪(弹药4)', '手铐', '执法记录仪'], late: ['警棍', '手枪(弹药2)', '空弹匣', '执法记录仪'] }, impression: { factions: { oldguard: 6, nanqiao: 2, rustfang: -6 }, professions: { 医生: 3, 教师: 2, 小偷: -8, '武警/军警': 4 } }, note: '普通警务训练，可使用手枪；会被守序幸存者信任，也会被劫掠者敌视。' },
    '医生': { bias: { int: 12, per: 6 }, firearm: 'none', items: ['口罩×5', '急救包', '抗生素×3', '手术刀'], kits: { early: ['背包', '口罩×5', '急救包', '抗生素×3', '手术刀'], mid: ['背包', '急救包', '抗生素', '绷带×2', '口罩×2'], late: ['手术刀', '抗生素', '绷带×2'] }, impression: { factions: { whitetower: 8, nanqiao: 4, oldguard: 2, rustfang: -2 }, professions: { 民警: 3, '武警/军警': 3, 教师: 2, 小偷: -5 } }, note: '医疗判定优势，处理伤口与感染更有效；多数幸存者初见会更愿意合作。' },
    '教师': { bias: { int: 8, elo: 8, chm: 5 }, firearm: 'none', items: ['粉笔', '保温杯', '记事本', '老花镜'], kits: { early: ['背包', '粉笔', '保温杯', '记事本', '矿泉水'], mid: ['背包', '保温杯', '记事本', '半瓶矿泉水'], late: ['记事本', '粉笔', '半瓶矿泉水'] }, impression: { factions: { nanqiao: 4, whitetower: 2 }, professions: { 学生: 5, 医生: 2, 小偷: -3 } }, note: '善于沟通与组织，招募说服占优；容易获得普通幸存者的耐心。' },
    '出租车司机': { bias: { per: 8, str: 5, luck: 5 }, firearm: 'none', items: ['车钥匙', '扳手', '半瓶矿泉水', '城区地图'], kits: { early: ['车钥匙', '扳手', '半瓶矿泉水', '城区地图', '打火机'], mid: ['车钥匙', '扳手', '半瓶矿泉水', '城区地图'], late: ['车钥匙', '扳手', '城区地图'] }, impression: { factions: { blackmarket: 4, nanqiao: 1 }, professions: { 工人: 2, 民警: 1 } }, note: '熟悉路况，路线侦察与逃生判断更占优。' },
    '明星': { bias: { chm: 15, elo: 6, str: -3 }, firearm: 'none', items: ['名牌墨镜', '签名笔', '化妆镜', '现金一沓'], kits: { early: ['名牌墨镜', '签名笔', '化妆镜', '现金一沓', '矿泉水'], mid: ['名牌墨镜', '签名笔', '化妆镜', '半瓶矿泉水'], late: ['名牌墨镜', '签名笔'] }, impression: { factions: { nanqiao: 2, blackmarket: 2, rustfang: -3 }, professions: { 教师: 2, 小偷: -4 } }, note: '魅力极高，初见好感占优；但实战弱，越到后期名气越像负担。' },
    '小偷': { bias: { agi: 12, per: 6, luck: 6, chm: -4 }, firearm: 'none', items: ['撬锁工具', '匕首', '黑色帽衫', '战利品袋'], kits: { early: ['撬锁工具', '匕首', '黑色帽衫', '战利品袋', '罐头'], mid: ['撬锁工具', '匕首', '战利品袋'], late: ['撬锁工具', '匕首'] }, impression: { factions: { rustfang: 4, blackmarket: 2, oldguard: -8, whitetower: -5, nanqiao: -3 }, professions: { 民警: -8, 医生: -5, 教师: -3, 工人: -1 } }, note: '潜行与搜刮高手，但职业身份会明显拉低第一印象。' },
    '工人': { bias: { str: 12, int: 4 }, firearm: 'none', items: ['羊角锤', '工作手套', '安全帽', '强力胶带'], kits: { early: ['羊角锤', '工作手套', '安全帽', '强力胶带', '帆布包'], mid: ['羊角锤', '工作手套', '安全帽', '强力胶带'], late: ['羊角锤', '工作手套', '强力胶带'] }, impression: { factions: { nanqiao: 3, blackmarket: 1 }, professions: { 出租车司机: 2, 教师: 1 } }, note: '力量与修缮庇护所占优；看起来可靠，适合做据点型开局。' },
    '武警/军警': { bias: { str: 10, agi: 8, per: 6, elo: 2 }, firearm: 'long', items: ['军刺', '步枪(弹药15)', '战术背包', '压缩干粮×3'], kits: { early: ['军刺', '步枪(弹药12)', '战术背包', '压缩干粮×2', '矿泉水'], mid: ['军刺', '步枪(弹药8)', '战术背包', '压缩干粮'], late: ['军刺', '步枪(弹药3)', '战术背包'] }, impression: { factions: { oldguard: 8, nanqiao: 1, rustfang: -8 }, professions: { 民警: 4, 医生: 3, 小偷: -8 } }, note: '武警/军警可使用步枪或霰弹枪；枪械极稀有，弹药也是不可再生压力。' },
    '厨师': { bias: { str: 5, per: 6, luck: 4 }, firearm: 'none', items: ['菜刀', '打火机', '盐一袋', '铁锅'], kits: { early: ['菜刀', '打火机', '盐一袋', '铁锅', '罐头'], mid: ['菜刀', '打火机', '盐一袋', '铁锅'], late: ['菜刀', '打火机', '盐一袋'] }, impression: { factions: { nanqiao: 3, blackmarket: 1 }, professions: { 工人: 2, 学生: 1 } }, note: '烹饪回复更高，菜刀也是趁手近战武器；食物紧张时更受欢迎。' },
    '普通市民': { bias: { luck: 4 }, firearm: 'none', items: ['背包', '半瓶矿泉水', '罐头'], kits: { early: ['背包', '半瓶矿泉水', '罐头', '旧手机'], mid: ['背包', '半瓶矿泉水', '罐头'], late: ['半瓶矿泉水', '旧手机'] }, impression: { factions: { nanqiao: 1 }, professions: {} }, note: '没有鲜明优势，但也不容易因身份招来强烈偏见。' },
  };
  const ALIASES = [
    { key: '民警', re: /警察|民警|辅警|刑警|交警|巡警/ },
    { key: '医生', re: /医生|医师|护士|护理|药剂师|急救|兽医/ },
    { key: '教师', re: /教师|老师|班主任|教授|讲师/ },
    { key: '出租车司机', re: /司机|出租|网约车|货车|公交|开车/ },
    { key: '明星', re: /明星|偶像|演员|歌手|主播|网红/ },
    { key: '小偷', re: /小偷|盗贼|扒手|窃贼|贼/ },
    { key: '工人', re: /工人|修理|电工|水管|木工|焊工|建筑|装修/ },
    { key: '武警/军警', re: /军人|士兵|武警|军警|退伍|退役|军官|特警/ },
    { key: '厨师', re: /厨师|厨子|餐饮|饭店|烹饪/ },
    { key: '学生', re: /学生|高中|大学|研究生|中学/ },
  ];

  GameData.PERIODS = PERIODS;
  GameData.ITEM_CARRY_CONTAINERS = ['背包', '战术背包', '战利品袋', '挎包', '帆布包'];
  GameData.PROFESSIONS = PROFESSIONS;
  GameData.PROFESSION_ALIASES = ALIASES;

  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const traitList = () => Array.isArray(GameData.TRAITS)
    ? GameData.TRAITS
    : Object.entries(GameData.TRAITS || {}).map(([id, t]) => ({ id, ...t }));

  Object.assign(Engine, {
    periodInfo(period = 'early') { return GameData.PERIODS[period] || GameData.PERIODS.early; },
    periodDay(period = 'early') {
      const range = this.periodInfo(period).range || [1, 5];
      return this.randInt(range[0], range[1]);
    },
    resolveProfession(raw) {
      const text = String(raw || '').trim();
      if (text && GameData.PROFESSIONS[text]) return { key: text, raw: text, label: text, custom: false, def: GameData.PROFESSIONS[text] };
      const alias = (GameData.PROFESSION_ALIASES || []).find(rule => rule.re.test(text));
      if (alias && GameData.PROFESSIONS[alias.key]) {
        return { key: alias.key, raw: text || alias.key, label: text && text !== alias.key ? `${text}（${alias.key}系）` : alias.key, custom: !!text && text !== alias.key, def: GameData.PROFESSIONS[alias.key] };
      }
      const def = GameData.PROFESSIONS['普通市民'];
      return { key: '普通市民', raw: text || '普通市民', label: text || '普通市民', custom: !!text && text !== '普通市民', def };
    },
    professionKit(profInfo, period = 'early') {
      const prof = profInfo.def || profInfo || {};
      return ((prof.kits || {})[period] || prof.items || ['半瓶矿泉水']).slice();
    },
    firearmTrainingName(level) { return { none: '无枪械训练', pistol: '手枪训练', long: '长枪训练' }[level || 'none'] || '无枪械训练'; },
    firearmTraining() { return (this.state && this.state.flags && this.state.flags.profession && this.state.flags.profession.firearm) || 'none'; },
    canUseFirearm(itemName) {
      const item = String(itemName || '');
      if (!/手枪|步枪|霰弹枪|冲锋枪|枪/.test(item)) return true;
      const training = this.firearmTraining();
      if (/步枪|霰弹枪|冲锋枪/.test(item)) return training === 'long';
      if (/手枪/.test(item)) return training === 'pistol' || training === 'long';
      return training !== 'none';
    },
    professionImpression(npc = {}, factionId = null) {
      if (!this.state) return { total: 0, period: 0, profession: 0, detail: [] };
      const player = this.resolveProfession((this.state.flags && this.state.flags.profession && this.state.flags.profession.raw) || this.state.profession);
      const npcInfo = this.resolveProfession(npc.profession || '普通市民');
      const fid = factionId || npc.factionId || null;
      const periodMod = this.periodInfo(this.state.period).trust || 0;
      const pImp = player.def.impression || {}, nImp = npcInfo.def.impression || {};
      let profMod = 0;
      const add = v => { profMod += Math.round(+v || 0); };
      if (pImp.professions) add(pImp.professions[npcInfo.key]);
      if (pImp.factions && fid) add(pImp.factions[fid]);
      if (nImp.professions && nImp.professions[player.key]) add(Math.round(nImp.professions[player.key] / 2));
      return { total: clamp(periodMod + profMod, -20, 20), period: periodMod, profession: profMod, player: player.key, npc: npcInfo.key, factionId: fid };
    },
  });

  const nativeCarryCap = Engine.carryCap && Engine.carryCap.bind(Engine);
  Engine.carryCap = function () {
    const inv = (this.state && this.state.inventory) || [];
    if (inv.some(i => String(i).includes('战术背包'))) return 16;
    const containers = GameData.ITEM_CARRY_CONTAINERS || ['背包'];
    return inv.some(i => containers.some(c => String(i).includes(c))) ? 12 : (nativeCarryCap ? nativeCarryCap() : 6);
  };

  Engine.newGame = function ({ name, gender, age, profession, period, traits = [], seed }) {
    if (seed != null) this.seed(seed); else this.seed(Date.now() % 2147483647 || 7);
    const periodKey = GameData.PERIODS[period] ? period : 'early';
    const periodInfo = this.periodInfo(periodKey);
    const profInfo = this.resolveProfession(profession);
    const prof = profInfo.def;
    const traitIds = this.normalizeTraits ? this.normalizeTraits(traits) : [];
    const defs = this.traitDefs ? this.traitDefs(traitIds) : traitList().filter(t => traitIds.includes(t.id));
    const traitBias = {};
    for (const t of defs) for (const [k, v] of Object.entries(t.bias || {})) traitBias[k] = (traitBias[k] || 0) + v;

    const attrs = {}, attrRolls = {};
    for (const a of GameData.ATTRS) {
      const base = this.randInt(1, 100);
      const careerMod = prof.bias[a.key] || 0;
      const traitMod = traitBias[a.key] || 0;
      const value = clamp(base + careerMod + traitMod, 1, 95);
      attrs[a.key] = value;
      attrRolls[a.key] = { base, careerMod, traitMod, value };
    }

    const vitals = { hp: 100, hunger: 100, hydration: 100, san: 100, infection: 0 };
    let hpCap = 100;
    const baseItems = this.professionKit(profInfo, periodKey);
    const startItems = baseItems.slice();
    const startInjuries = this.initInjuries ? this.initInjuries() : {};
    for (const t of defs) {
      for (const [k, v] of Object.entries(t.vitals || {})) vitals[k] = clamp((vitals[k] ?? 100) + v, 0, 100);
      if (t.hpCap) hpCap = clamp(hpCap + t.hpCap, 20, 120);
      if (t.items) startItems.push(...t.items);
      for (const [k, v] of Object.entries(t.injuries || {})) startInjuries[k] = clamp((startInjuries[k] || 0) + v, 0, 3);
    }
    vitals.hp = clamp(vitals.hp, 1, hpCap);

    this.state = {
      name, gender, age: clamp(Math.round(+age || 24), 16, 70), profession: profInfo.label, professionKey: profInfo.key, traits: traitIds,
      period: periodKey, day: this.periodDay(periodKey), week: 1, ap: 4,
      attrs, vitals, hpCap, inventory: this.expandStacks(startItems), warehouse: [],
      companions: [], relations: {}, buffs: [],
      flags: {
        antidepCount: 0,
        injuries: startInjuries,
        locationThreats: this.initLocationThreats ? this.initLocationThreats() : {},
        routes: this.initRoutes ? this.initRoutes() : {},
        factions: this.initFactions ? this.initFactions() : {},
        story: this.initStory ? this.initStory() : {},
        profession: {
          key: profInfo.key, raw: profInfo.raw, label: profInfo.label, custom: profInfo.custom,
          firearm: prof.firearm || 'none', firearmLabel: this.firearmTrainingName(prof.firearm || 'none'),
          note: prof.note || '', period: periodInfo.name, periodLabel: periodInfo.label,
          periodUtility: periodInfo.utility, periodNote: periodInfo.note,
          baseItems: baseItems.slice(), finalItems: startItems.slice(), kitKeep: periodInfo.kitKeep,
        },
        creation: { attrRolls, period: periodKey, profession: profInfo.key },
      },
      log: [], over: false, overReason: '',
    };
    return this.state;
  };

  const nativeAct = Engine.act && Engine.act.bind(Engine);
  if (nativeAct) Engine.act = function (actionId, opt = {}) {
    const out = nativeAct(actionId, opt);
    if (actionId === 'recruit' && out && !out.error && out.meet && this.professionImpression) {
      const name = typeof out.meet === 'string' ? out.meet : out.meet.name;
      const npc = out.npc || (typeof out.meet === 'object' ? out.meet : { name, profession: '普通市民', factionId: out.factionId });
      const imp = this.professionImpression(npc, out.factionId);
      out.professionImpression = imp;
      if (name && this.state.relations && Number.isFinite(+this.state.relations[name])) {
        this.state.relations[name] = clamp(Math.round(this.state.relations[name] + imp.total), -70, 75);
      }
      if (out.parts && imp.total) out.parts.push(`职业/时期第一印象 ${imp.total >= 0 ? '+' : ''}${imp.total}`);
    }
    return out;
  };

  if (typeof UI !== 'undefined' && UI.renderSetup) {
    const nativeRenderSetup = UI.renderSetup.bind(UI);
    UI.renderSetup = function () {
      nativeRenderSetup();
      const prof = this.el && this.el('f-prof');
      if (prof && !this.el('f-prof-custom')) {
        prof.closest('label').insertAdjacentHTML('afterend', '<label>自定义职业（可选） <input id="f-prof-custom" value="" placeholder="例如：护士、退伍军人、网红、修理工"></label><p class="hint">自定义职业会按关键词归类到最接近的职业系；归不上的按普通市民开局。</p>');
      }
      const period = this.el && this.el('f-period');
      if (period) {
        period.querySelector('[value="early"]').textContent = '爆发初期（1-5 天，物资较多、人心尚未崩）';
        period.querySelector('[value="mid"]').textContent = '爆发中期（6-14 天，物资约七成、互相猜疑）';
        period.querySelector('[value="late"]').textContent = '爆发后期（15 天+，可用补给极少）';
      }
    };
    UI.start = async function () {
      const name = (this.el('f-name').value || '无名者').trim();
      Engine.newGame({
        name,
        gender: this.el('f-gender').value,
        age: this.el('f-age').value,
        profession: ((this.el('f-prof-custom') && this.el('f-prof-custom').value.trim()) || this.el('f-prof').value),
        traits: this.selectedTraitIds ? this.selectedTraitIds() : [],
        period: this.el('f-period').value,
      });
      this.renderGame();
      await this.narrate('intro');
      this.autosave();
    };
    const nativeRenderPanel = UI.renderPanel && UI.renderPanel.bind(UI);
    if (nativeRenderPanel) UI.renderPanel = function () {
      nativeRenderPanel();
      const s = Engine.state, meta = s && s.flags && s.flags.profession;
      const phead = this.el('panel') && this.el('panel').querySelector('.phead');
      if (!meta || !phead || phead.querySelector('.career')) return;
      const time = phead.querySelector('.time');
      if (time) time.insertAdjacentHTML('beforebegin', `<div class="career" title="${this.esc((meta.periodUtility || '') + ' ' + (meta.periodNote || ''))}">职业系 ${this.esc(meta.key)} · ${this.esc(meta.firearmLabel || '无枪械训练')} · ${this.esc(meta.periodLabel || meta.period || '')}</div>`);
    };
  }

  if (typeof document !== 'undefined' && document.createElement && document.head) {
    const style = document.createElement('style');
    style.textContent = '.phead .career{color:#d0b172;font-size:12px;margin-top:5px;line-height:1.35}';
    document.head.appendChild(style);
  }
})();

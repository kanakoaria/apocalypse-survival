/* Zombie encounters now enter one STR combat round before damage is applied. */
(function (global) {
  'use strict';

  const Engine = global.Engine;
  const GameData = global.GameData;
  if (!Engine || !GameData) return;

  const tierName = global.tierCN || ((t) => ({ crit: '大成功', pass: '成功', fail: '失败', fumble: '大失败' }[t] || t));
  const signed = global.signedPct || ((v) => {
    const n = Math.round((v || 0) * 100);
    return (n >= 0 ? '+' : '') + n + '%';
  });
  const ZOMBIE = '丧尸';

  function hasAny(text, words) {
    return words.some(w => String(text || '').includes(w));
  }

  Engine.combatWeaponCandidates = function combatWeaponCandidates() {
    const inv = (this.state && this.state.inventory) || [];
    const trainedGun = typeof this.canUseFirearm === 'function' ? (name) => this.canUseFirearm(name) : () => false;
    const out = [];
    for (const item of inv) {
      const name = String(item || '');
      let bonus = 0, advantage = false, note = '';
      if (hasAny(name, ['步枪', '霰弹枪', '冲锋枪'])) {
        const trained = trainedGun(name);
        bonus = trained ? 20 : 4;
        advantage = trained;
        note = trained ? '受训枪械' : '未受训长枪';
      } else if (hasAny(name, ['手枪'])) {
        const trained = trainedGun(name);
        bonus = trained ? 16 : 3;
        advantage = trained;
        note = trained ? '受训手枪' : '未受训手枪';
      } else if (hasAny(name, ['加固长矛', '钢管', '生锈钢筋', '长矛'])) {
        bonus = 14; advantage = true; note = '长柄武器';
      } else if (hasAny(name, ['警棍', '钉刺棒球棍', '羊角锤', '军刺'])) {
        bonus = 12; advantage = true; note = '可靠近战武器';
      } else if (hasAny(name, ['菜刀', '匕首', '小刀', '手术刀'])) {
        bonus = 8; note = '短兵器';
      } else if (hasAny(name, ['扳手', '铁锅', '安全帽'])) {
        bonus = 6; note = '临时武器';
      }
      if (bonus) out.push({ item: name, bonus, advantage, note });
    }
    return out.sort((a, b) => (b.advantage - a.advantage) || b.bonus - a.bonus);
  };

  Engine.bestCombatWeapon = function bestCombatWeapon() {
    return this.combatWeaponCandidates()[0] || null;
  };

  Engine.combatJudge = function combatJudge(difficulty = 0) {
    const weapon = this.bestCombatWeapon();
    const bonus = weapon ? weapon.bonus : 0;
    const first = this.judge('str', difficulty + bonus);
    let kept = first;
    const rolls = [{ ...first, advantage: false }];
    if (weapon && weapon.advantage) {
      const second = this.judge('str', difficulty + bonus);
      kept = second.margin > first.margin ? second : first;
      rolls[0].advantage = true;
      rolls.push({ ...second, advantage: true });
    }
    return { ...kept, weapon, rolls };
  };

  Engine.resolveZombieCombat = function resolveZombieCombat(res, opts = {}) {
    res.parts = res.parts || [];
    res.deltas = res.deltas || {};
    res.combat = res.combat || [];
    if (!res.meet) res.meet = ZOMBIE;

    const j = this.combatJudge(opts.difficulty || 0);
    const weaponText = j.weapon
      ? `，武器：${j.weapon.item}（${j.weapon.note}${j.weapon.advantage ? '，优势' : `，+${j.weapon.bonus}`}）`
      : '，无武器';
    const rollText = j.rolls.map(r => `${r.roll}/${r.target}`).join(' / ');
    res.parts.push(`${opts.source || '遭遇丧尸'}，进入战斗轮次：力量${rollText} ${tierName(j.tier)}${weaponText}`);

    const entry = { enemy: ZOMBIE, attr: 'str', success: j.success, tier: j.tier, roll: j.roll, target: j.target, advantage: !!(j.weapon && j.weapon.advantage), weapon: j.weapon ? j.weapon.item : null };
    res.combat.push(entry);

    if (j.success) {
      const sanLoss = this.randInt(j.tier === 'crit' ? 3 : 5, j.tier === 'crit' ? 8 : 13);
      const hungerLoss = this.randInt(2, 5);
      const hydrationLoss = this.randInt(2, 6);
      res.deltas.san = (res.deltas.san || 0) - sanLoss;
      res.deltas.hunger = (res.deltas.hunger || 0) - hungerLoss;
      res.deltas.hydration = (res.deltas.hydration || 0) - hydrationLoss;
      res.parts.push(`击杀丧尸，未受伤；近距离处决让 San -${sanLoss}，饱腹 -${hungerLoss}，水分 -${hydrationLoss}`);
      entry.result = 'kill';
    } else {
      const severe = opts.severe || j.tier === 'fumble';
      const dmg = this.randInt(severe ? 10 : 5, severe ? 24 : 15);
      res.deltas.hp = (res.deltas.hp || 0) - dmg;
      res.deltas.san = (res.deltas.san || 0) - this.randInt(2, 7);
      res.parts.push(`战斗失败，被扑倒受创 -${dmg} HP`);
      if (this.rnd() < (severe ? 0.46 : 0.24)) {
        const bite = severe && this.rnd() < 0.55;
        const inf = bite ? this.randInt(40, 60) : this.randInt(15, 30);
        res.deltas.infection = (res.deltas.infection || 0) + inf;
        res.parts.push(`被${bite ? '咬' : '抓'}伤，感染 +${inf}`);
        entry.infection = inf;
      }
      entry.result = 'hurt';
    }
    return entry;
  };

  const originalResolveFreeOutcome = Engine.resolveFreeOutcome;
  Engine.resolveFreeOutcome = function resolveFreeOutcomeWithCombat(res, intent, judge, locName, risk) {
    if (judge.success) return originalResolveFreeOutcome.call(this, res, intent, judge, locName, risk);

    const routeInfo = locName ? this.routeTo(locName) : null;
    res.deltas.san = (res.deltas.san || 0) - this.randInt(1, 6);
    if (judge.tier === 'fumble' || this.rnd() < risk) {
      this.resolveZombieCombat(res, { source: '行动惊动丧尸', difficulty: judge.tier === 'fumble' ? -12 : -6, severe: judge.tier === 'fumble' });
      if (locName) {
        const drift = this.adjustLocationThreat(locName, 1);
        if (drift.delta) res.parts.push(`${locName}被惊动，威胁 ${drift.before}→${drift.after}`);
        const rch = this.adjustPathNoise(routeInfo, judge.tier === 'fumble' ? 2 : 1, res);
        if (rch.length) res.parts.push(`路线被惊动：${rch.map(c => `${c.name}${c.before}→${c.after}`).join('，')}`);
      }
    } else {
      res.parts.push('你没有得到什么，只是把时间和体力丢进废墟里。');
    }
  };

  const originalRunAction = Engine.runAction;

  function begin(engine, actionId) {
    const s = engine.state;
    if (s.over) return { error: '游戏已结束。' };
    if (s.ap <= 0) return { error: '本周行动力已用尽，进入周末结算。' };
    const def = GameData.ACTIONS.find(a => a.id === actionId);
    if (!def) return { error: '未知行动。' };
    return { s, res: { action: def.name, actionId, parts: [], deltas: {}, gains: [], losses: [], meet: null } };
  }

  function finish(engine, actionId, pack, hungerCost = 2, hydrationCost = 3) {
    const { s, res } = pack;
    engine.applyTrauma(res, actionId);
    res.deltas.hunger = (res.deltas.hunger || 0) - hungerCost;
    res.deltas.hydration = (res.deltas.hydration || 0) - hydrationCost;
    const stashed = engine.addItem(...res.gains);
    if (stashed.length) res.parts.push(`背包已满，${stashed.join('、')}暂存据点仓库`);
    engine.applyVitals(res.deltas);
    engine.applyInfectionDecay();
    if (typeof engine.applyCompanionAction === 'function') engine.applyCompanionAction(actionId, res);
    s.ap -= 1;
    s.log.push({ week: s.week, ...res });
    res.apLeft = s.ap;
    res.weekendReady = s.ap <= 0;
    return res;
  }

  function runScavenge(opt = {}) {
    const pack = begin(this, 'scavenge');
    if (pack.error) return pack;
    const { res } = pack;
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
    if (routeInfo.names.length) res.parts.push(`路线@${routeInfo.nodePath.join('→')}：${routeInfo.names.join(' / ')}，额外风险${signed(routeInfo.risk)}，噪音${routeInfo.noise}`);
    res.parts.push(`区域态势@${locName}：${this.locationThreatName(locName)}，区域${res.areaRisk}% / 总风险约${res.locationRisk}%`);
    res.parts.push(`感知判定@${locName}：${per.roll}/${per.target} ${tierName(per.tier)}`);
    const n = per.tier === 'crit' ? 3 : per.success ? 2 : per.tier === 'fumble' ? 0 : 1;
    for (let i = 0; i < n; i++) res.gains.push(this.pick(loc.loot));

    if (!luck.success && this.rnd() < risk) {
      const enemy = this.rnd() < 0.6 ? ZOMBIE : '敌对幸存者';
      res.meet = enemy;
      if (enemy === ZOMBIE) {
        this.resolveZombieCombat(res, { source: `搜刮时遭遇丧尸@${locName}`, difficulty: -Math.round(risk * 18), severe: luck.tier === 'fumble' });
      } else {
        const dmg = this.randInt(5, 20);
        res.deltas.hp = (res.deltas.hp || 0) - dmg;
        res.parts.push(`遭遇${enemy}，受创 -${dmg} HP`);
      }
      const drift = this.adjustLocationThreat(locName, luck.tier === 'fumble' ? 2 : 1);
      if (drift.delta) res.parts.push(`${locName}动静扩大，威胁 ${drift.before}→${drift.after}`);
      const rch = this.adjustPathNoise(routeInfo, luck.tier === 'fumble' ? 2 : 1, res);
      if (rch.length) res.parts.push(`路线噪音：${rch.map(c => `${c.name}${c.before}→${c.after}`).join('，')}`);
      if (enemy !== ZOMBIE || !(res.combat || []).some(c => c.enemy === ZOMBIE && c.success)) this.maybeKillCompanions(res, 0.10);
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
    if (typeof this.tryDiscoverStoryClue === 'function') this.tryDiscoverStoryClue(locName, res, clueChance, '现场搜刮');
    if (res.gains.length) res.parts.push(`拾得：${res.gains.join('、')}`);
    return finish(this, 'scavenge', pack);
  }

  function runClear(opt = {}) {
    const pack = begin(this, 'clear');
    if (pack.error) return pack;
    const { s, res } = pack;
    const locName = opt.location || this.mostThreatenedLocation();
    const routeInfo = this.routeTo(locName);
    res.location = locName;
    res.route = routeInfo;
    res.areaRisk = this.locationRiskPct(locName);
    res.routeRisk = Math.round(routeInfo.risk * 100);
    res.locationThreat = this.locationThreat(locName);
    res.locationRisk = this.actionRiskPct(locName);
    const difficulty = -Math.max(0, res.locationThreat - 2) * 5 - Math.round(Math.max(0, routeInfo.risk) * 18);
    const j1 = this.judge('str', difficulty);
    const j2 = this.judge('agi', difficulty);
    const ok = (j1.success ? 1 : 0) + (j2.success ? 1 : 0);
    if (routeInfo.names.length) res.parts.push(`进攻路线@${routeInfo.nodePath.join('→')}：${routeInfo.names.join(' / ')}，额外风险${signed(routeInfo.risk)}，噪音${routeInfo.noise}`);
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
      const combat = this.resolveZombieCombat(res, { source: `清理失败，被尸群逼近@${locName}`, difficulty: difficulty - 8, severe: true });
      if (combat.success) {
        const drift = this.adjustLocationThreat(locName, -1);
        const rch = this.adjustPathNoise(routeInfo, 1, res);
        res.parts.push(`你在撤退前反杀尸群前锋，${locName}威胁 ${drift.before}→${drift.after}`);
        if (rch.length) res.parts.push(`撤退时仍留下动静：${rch.map(c => `${c.name}${c.before}→${c.after}`).join('，')}`);
      } else {
        const drift = this.adjustLocationThreat(locName, 1);
        const rch = this.adjustPathNoise(routeInfo, 2, res);
        res.parts.push(`被尸群压回据点，${locName}威胁 ${drift.before}→${drift.after}`);
        if (rch.length) res.parts.push(`撤退路线被惊动：${rch.map(c => `${c.name}${c.before}→${c.after}`).join('，')}`);
        this.maybeKillCompanions(res, 0.15);
      }
    }
    res.deltas.san = (res.deltas.san || 0) - this.randInt(2, 6);
    return finish(this, 'clear', pack);
  }

  Engine.runAction = function combatRoundRunAction(actionId, opt = {}) {
    if (actionId === 'scavenge') return runScavenge.call(this, opt);
    if (actionId === 'clear') return runClear.call(this, opt);
    return originalRunAction.call(this, actionId, opt);
  };
})(typeof window !== 'undefined' ? window : globalThis);

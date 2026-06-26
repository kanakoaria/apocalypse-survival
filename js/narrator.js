/* ===========================================================================
 * narrator.js — 叙事器（把引擎算好的机制结果写成叙事）
 * 两种模式：
 *   1) LLM 模式：调用 Claude 或 OpenAI 兼容接口(如 DeepSeek)，BYOK。
 *   2) 离线模式：无 key 时用模板生成叙事，保证游戏开箱即玩、能立刻"看看"。
 * 引擎是唯一的数值权威，LLM 只润色文字、给选项，不改数字。
 * ======================================================================== */

const Narrator = {

  cfg: {
    provider: 'offline',     // 'offline' | 'claude' | 'openai'
    apiKey: '',
    model: '',
    baseUrl: '',             // openai 兼容时可填 DeepSeek 等
  },

  load() {
    try { Object.assign(this.cfg, JSON.parse(localStorage.getItem('ar_cfg') || '{}')); } catch (e) {}
    return this.cfg;
  },
  save(c) { Object.assign(this.cfg, c); localStorage.setItem('ar_cfg', JSON.stringify(this.cfg)); },

  defaultModel() {
    if (this.cfg.provider === 'claude') return this.cfg.model || 'claude-sonnet-4-6';
    if (this.cfg.provider === 'openai') return this.cfg.model || 'deepseek-chat';
    return 'offline';
  },

  /* ---- 把引擎结果摘要成给 LLM 的"本回合事实" ---- */
  factsFor(kind, payload) {
    const s = Engine.state;
    const v = s.vitals;
    const panel = `[当前] 第${s.week}周·第${s.day}天 行动力${s.ap}/4 | 生命${v.hp} 饱腹${v.hunger} 水分${v.hydration} San${v.san} 感染${v.infection} | 队友${s.companions.map(c=>c.name).join('、')||'无'}`;
    if (kind === 'intro') {
      return `${panel}\n玩家：${s.name}，${s.gender}，${s.age}岁，职业${s.profession}。时期：${periodCN(s.period)}。初始物品：${s.inventory.join('、')}。\n请写开场：先用一两句加粗、黑暗压迫的格言式导语，再欢迎玩家、描绘青阳市当下的处境，最后给出第一周的行动方向(2-4 个编号选项)。提醒：可招募队友≤5名，队友死亡率与普通人相同。`;
    }
    if (kind === 'action') {
      const r = payload;
      const lines = [
        `${panel}`,
        `玩家本回合行动：「${r.action}」${r.location ? '·' + r.location : ''}${r.free ? '：' + r.free : ''}`,
        `机制结果(必须照此叙述，不得改数字)：`,
        ...r.parts.map(p => '· ' + p),
      ];
      if (r.meet) lines.push(`· 遭遇/接触：${typeof r.meet === 'string' ? r.meet : r.meet.name}`);
      lines.push(`数值变化：${fmtDeltas(r.deltas)}`);
      lines.push(`把以上写成冷冽叙事，并给出 2-4 个后续编号选项。`);
      return lines.join('\n');
    }
    if (kind === 'weekend') {
      const r = payload;
      return `${panel}\n周末结算·随机事件「${r.event.title}」：${r.event.text}\n数值变化：${fmtDeltas(r.deltas)}${r.gains.length?'，获得：'+r.gains.join('、'):''}${r.meet?'，来访者：'+r.meet.name+'('+r.meet.profession+')':''}\n把这件事写成一段叙事，并自然过渡到第${r.week}周开端，给出 2-4 个行动方向选项。`;
    }
    return panel;
  },

  /* ---- 主入口：返回 { text, delta }；delta 仅含物品/关系，由引擎落地 ---- */
  async narrate(kind, payload) {
    if (this.cfg.provider === 'offline' || !this.cfg.apiKey)
      return { text: this.offline(kind, payload), delta: null };
    const facts = this.factsFor(kind, payload);
    let raw;
    try {
      raw = this.cfg.provider === 'claude' ? await this.callClaude(facts) : await this.callOpenAI(facts);
    } catch (e) {
      return { text: `「叙事服务连接失败，已回退离线」\n（${e.message}）\n\n` + this.offline(kind, payload), delta: null };
    }
    return this.parseDelta(raw);
  },

  // 从 LLM 输出末尾抽取可选的 ```json``` 世界变更块，剥离后返回纯叙事
  parseDelta(raw) {
    let text = (raw || '').trim(), delta = null;
    let m = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```\s*$/);
    if (!m) m = text.match(/(\{[\s\S]*\})\s*$/);
    if (m) {
      try {
        const obj = JSON.parse(m[1]);
        if (obj && (obj.items_gained || obj.items_lost || obj.relations)) {
          delta = obj;
          text = text.slice(0, m.index).trim();
        }
      } catch (e) { /* 非法 JSON：忽略，保留原文 */ }
    }
    return { text, delta };
  },

  async callClaude(userText) {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.cfg.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: this.defaultModel(),
        max_tokens: 1200,
        system: GameData.systemPrompt(),
        messages: [{ role: 'user', content: userText }],
      }),
    });
    if (!r.ok) throw new Error('Claude ' + r.status + ' ' + (await r.text()).slice(0, 200));
    const j = await r.json();
    return j.content.map(c => c.text || '').join('');
  },

  async callOpenAI(userText) {
    const base = this.cfg.baseUrl || 'https://api.deepseek.com';
    const r = await fetch(base.replace(/\/$/, '') + '/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + this.cfg.apiKey },
      body: JSON.stringify({
        model: this.defaultModel(),
        temperature: 1.0,
        max_tokens: 1200,
        messages: [
          { role: 'system', content: GameData.systemPrompt() },
          { role: 'user', content: userText },
        ],
      }),
    });
    if (!r.ok) throw new Error('API ' + r.status + ' ' + (await r.text()).slice(0, 200));
    const j = await r.json();
    return j.choices[0].message.content;
  },

  /* ---- 离线叙事：委托给程序化涌现叙事器 ---- */
  offline(kind, payload) {
    if (typeof OfflineNarrator !== 'undefined') {
      const s = Engine.state;
      if (kind === 'intro') return OfflineNarrator.intro(s);
      if (kind === 'action') return OfflineNarrator.action(s, payload);
      if (kind === 'weekend') return OfflineNarrator.weekend(s, payload);
    }
    return this._offlineFallback(kind, payload);
  },

  /* ---- 旧的简易模板（兜底，正常用不到） ---- */
  _offlineFallback(kind, payload) {
    const s = Engine.state;
    if (kind === 'intro') {
      return `**「活着，是这座城市唯一的奢侈。」**

青阳市。第 ${s.day} 天。
天空是脏抹布的颜色，远处传来那种你已经学会分辨的呻吟——不急、不停，像潮水。${s.name}，${s.age}岁，曾经的${s.profession}。现在你只是一个还没死的人。

你背着仅有的家当：${s.inventory.join('、')}。门外是空的，也可能不是。你得做点什么，否则这一周熬不过去。

1. 出门寻找物资，赌一把今天的运气
2. 先把这处落脚点加固，至少夜里睡得安稳些
3. 四处转转，看能不能碰上别的活人
4. 躲着不动，攒精神（深度休整）`;
    }
    if (kind === 'action') {
      const r = payload;
      const v = s.vitals;
      let body = `你选择了「${r.action}」${r.location ? '——' + r.location : ''}。\n\n`;
      body += r.parts.map(p => '· ' + p).join('\n');
      if (r.meet) body += `\n\n阴影里有动静。${typeof r.meet === 'string' ? '是' + r.meet + '。' : '一个陌生人，' + r.meet.name + '。'}`;
      body += `\n\n${dangerHint(v)}`;
      body += `\n\n（行动力剩 ${s.ap}/4）请选择：\n1. 继续行动\n2. 查看状态、整理物资\n${s.ap<=0?'3. 收尾，进入周末结算':'3. 谨慎撤回据点'}`;
      return body;
    }
    if (kind === 'weekend') {
      const r = payload;
      return `**周末·${r.event.title}**\n\n${r.event.text}\n\n${r.gains.length?'你清点了一下：'+r.gains.join('、')+'。\n\n':''}${r.meet?'门外站着一个人，'+r.meet.name+'，自称'+r.meet.profession+'。\n\n':''}新的一周开始了。第 ${r.week} 周，行动力恢复为 4。\n\n1. 寻找物资\n2. 修缮庇护所\n3. 清理周边丧尸\n4. 深度休整`;
    }
    return '……';
  },
};

function periodCN(p) { return { early: '爆发初期(1-10天)', mid: '爆发中期(11-30天)', late: '爆发后期(31天+)' }[p] || p; }
function fmtDeltas(d) {
  const names = { hp: '生命', hunger: '饱腹', hydration: '水分', san: 'San', infection: '感染' };
  const parts = Object.keys(d || {}).filter(k => d[k]).map(k => `${names[k] || k}${d[k] > 0 ? '+' : ''}${d[k]}`);
  return parts.length ? parts.join('，') : '无明显变化';
}
function dangerHint(v) {
  if (v.infection >= 61) return '你的视野开始发灰，喉咙里有腐烂的味道——感染在啃噬你。';
  if (v.hp <= 19) return '每走一步都疼，血在往外渗。你撑不了多久了。';
  if (v.hunger <= 19) return '胃在绞痛，手开始抖。你需要食物，马上。';
  if (v.hydration <= 19) return '喉咙干得像砂纸，眼前的光开始发白。你必须找到水。';
  if (v.san <= 19) return '有声音在你耳边低语。你不确定那是不是真的。';
  return '你喘了口气，暂时还活着。';
}

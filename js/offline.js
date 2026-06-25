/* ===========================================================================
 * offline.js — 离线「涌现式」叙事器
 * 无 API key 时，不再机械复述数值，而是从片段库按当前处境（地点/伤情/感染/
 * San/队友/周数/事件）程序化拼装出每次都不同、且会回应状态的叙事 + 可点选项。
 * 用 Math.random 做纯叙事随机，不触碰引擎的游戏种子（保持机制可复现）。
 * 引擎仍是唯一数值权威；这里只把它算好的结果写成故事。
 * ======================================================================== */

const OfflineNarrator = {
  pick(a) { return a[Math.floor(Math.random() * a.length)]; },
  chance(p) { return Math.random() < p; },
  some(arr, n) { const c = [...arr]; const o = []; while (o.length < n && c.length) o.push(c.splice(Math.floor(Math.random() * c.length), 1)[0]); return o; },

  /* ---------- 氛围片段库 ---------- */
  sky: ['天空是脏抹布的颜色', '云层低得像要压下来', '空气里浮着焦糊和腐甜混在一起的味道',
        '远处的高楼空着眼眶', '风卷过空街，带来一阵谁也不愿细想的气味', '日头被烟尘滤成一枚锈钉'],
  ambient: ['那种你已经学会分辨的呻吟从某个方向传来，不急、不停，像潮水',
            '一只乌鸦落在路灯上，歪着头看你，又飞走了', '某处有铁皮在风里拍打，一下，又一下',
            '远处一声闷响，然后是更长的寂静', '街角的红绿灯还在徒劳地跳，没有车，也没有人'],

  /* 各地点的搜刮气味 */
  locFlavor: {
    '居民区': ['楼道里散落着没来得及带走的家当', '半开的防盗门后是一个凝固的清晨', '阳台上的衣服早已褪色发硬'],
    '超市':   ['货架大多被翻空，碎玻璃在脚下作响', '收银台前还排着永远不会动的队', '冷柜早断了电，里面的东西不能看也不能闻'],
    '药店':   ['处方单散了一地，药盒被人翻得只剩空壳', '玻璃柜台裂着蛛网般的纹路', '消毒水的气味盖不住底下那股甜腥'],
    '仓库':   ['集装箱在昏暗里堆成迷宫', '叉车歪在通道中央，钥匙还插着', '高处的货物随时可能塌下来'],
    '医院':   ['走廊的轮床上盖着不该掀开的白布', '指示牌指向一个个不再有人的科室', '某间病房里，吊瓶还在一滴一滴地坠'],
    '加油站': ['加油机的屏幕黑着，油枪垂在地上', '便利店的关东煮锅早已结了壳', '地面一摊不知是油还是别的的暗渍'],
  },

  /* 伤情/状态的暗示句（按数值分级触发） */
  dread(v) {
    const out = [];
    if (v.infection >= 61) out.push(this.pick(['你的视野开始发灰，喉咙里有腐烂的味道——它在你身体里安家', '指甲泛起青黑，你尽量不去看自己的手']));
    else if (v.infection >= 31) out.push(this.pick(['伤口周围烧得发烫，那不是普通的炎症', '一阵阵的低热让你分不清白天黑夜']));
    if (v.hp <= 19) out.push(this.pick(['每走一步都疼，血在往外渗，你撑不了多久', '眼前阵阵发黑，你扶着墙才没倒下']));
    else if (v.hp <= 49) out.push(this.pick(['旧伤还没好，新伤又添了一道', '你跛着脚，留意着每一个可能要命的角落']));
    if (v.hunger <= 19) out.push(this.pick(['胃在绞痛，手开始抖，你需要食物，马上', '饿到一定程度，连恐惧都变得遥远']));
    else if (v.hunger <= 49) out.push(this.pick(['肚子空了大半天，脑子转得慢了', '你舔了舔干裂的嘴唇']));
    if (v.san <= 19) out.push(this.pick(['有声音在你耳边低语，你不确定那是不是真的', '镜子般的水洼里，那个影子好像比你慢了半拍']));
    else if (v.san <= 49) out.push(this.pick(['你回头看了一眼，没有人——应该没有', '太安静了，安静得让人想尖叫']));
    return out;
  },

  companionAside(s) {
    if (!s.companions.length) return null;
    const c = this.pick(s.companions);
    if ((c.wound || 0) >= 55) return this.pick([`${c.name} 的脸色发白，伤口又渗出来一点。`, `${c.name} 走得很慢，每一步都像在和疼痛讨价还价。`]);
    if ((c.stress || 0) >= 75) return this.pick([`${c.name} 一直在看身后，手指抖得压不住。`, `${c.name} 低声说自己没事，但眼神已经乱了。`]);
    const trait = c.personality ? `那种${GameData.COMPANION_PERSONALITIES[c.personality]?.name || ''}劲儿还在` : '';
    if (c.affinity >= 40) return this.pick([`${c.name} 一直跟在你侧后方，替你盯着死角。`, `“别逞强。”${c.name} 低声说，把半块饼干塞进你手里。`]);
    if (c.affinity <= -10) return this.pick([`${c.name} 走在后面，你能感觉到那道目光黏在你后颈上。`, `${c.name} 什么也没说，但握刀的手一直没松。`]);
    return this.pick([`${c.name} 沉默地跟着，你们还没熟到能交心。`, `${c.name} 扫了你一眼，你读不出那是什么意思。${trait ? trait + '。' : ''}`]);
  },

  /* ---------- 开场 ---------- */
  intro(s) {
    const epigraph = this.pick([
      '**「活着，是这座城市唯一的奢侈。」**',
      '**「青阳市没有英雄，只有还没轮到的人。」**',
      '**「末日不是某一天到来的，它是一点点把人吃掉的。」**',
      '**「你可以信任任何人——只要你愿意承担那之后的事。」**',
    ]);
    const open = `${epigraph}\n\n青阳市。第 ${s.day} 天。\n${this.pick(this.sky)}，${this.pick(this.ambient)}。`;
    const who = `${s.name}，${s.age}岁，曾经的${s.profession}。${this.pick(['现在你只是一个还没死的人。', '那些头衔在今天一文不值。', '过去像别人的故事，你已经记不太清了。'])}`;
    const items = `你检查仅有的家当：${s.inventory.join('、')}。${this.pick(['门外是空的，也可能不是。', '据点的墙不算厚，但今晚还能挡住点什么。', '你必须在这一周里，为下一周攒出活路。'])}`;
    return `${open}\n\n${who}\n\n${items}\n\n` + this.choiceBlock([
      '出门寻找物资，赌一把今天的运气', '先把这处落脚点加固，至少夜里睡得安稳些',
      '四处转转，看能不能碰上别的活人', '躲着不动，攒一攒精神（深度休整）',
    ]);
  },

  /* ---------- 行动叙事 ---------- */
  action(s, r) {
    const v = s.vitals;
    const id = r.actionId;
    let body = [];

    // 偶尔来一句环境开场
    if (this.chance(0.5)) body.push(`${this.pick(this.sky)}。`);

    // 各行动的核心叙述
    body.push(this[`act_${id}`] ? this[`act_${id}`](s, r) : `你做了你该做的：${r.action}。`);

    // 队友旁白
    if (this.chance(0.55)) { const a = this.companionAside(s); if (a) body.push(a); }

    // 队友死亡（引擎已结算，这里渲染情绪）
    if (r.deaths && r.deaths.length) body.push(this.pick([
      `${r.deaths.join('、')} 没能跟上来。你听见了那个声音——一个人变成"东西"的声音。`,
      `你回头时，${r.deaths.join('、')} 已经被拖进了人群。你没有回去。你不能回去。`,
    ]));

    // 状态暗示
    const dr = this.dread(v);
    if (dr.length) body.push(this.some(dr, Math.min(2, dr.length)).join(''));

    return body.filter(Boolean).join('\n\n') + '\n\n' + this.contextChoices(s, r);
  },

  routeLine(r) {
    const route = r.route;
    if (!route || !route.names || !route.names.length) return '';
    const road = route.names.length === 1 ? route.names[0] : route.names.join('，再转');
    if (route.blocked) return `你不得不绕过堵死的路，从${road}贴边过去，每一步都不省心。`;
    if (route.noise >= 4) return `你沿着${road}过去。那一路太吵，像有什么东西一直跟在后面听。`;
    if (route.risk <= 0) return `你走的是${road}，一条脏旧却少有人注意的捷径。`;
    return `你从${road}绕过去，把脚步声压进尘土里。`;
  },

  storyLine(r) {
    if (!r || !r.storyChanges || !r.storyChanges.length) return '';
    const stage = r.storyChanges.find(c => c.type === 'stage');
    if (stage) return `几条本来散乱的线索终于咬合在一起：${stage.name}。你开始怀疑，青阳市不是单纯地“爆发”了。`;
    const clue = r.storyChanges.find(c => c.type === 'clue');
    if (clue) return `你还找到一条不该被留下的线索——${clue.name}。${clue.text || ''}`;
    const pulse = r.storyChanges.find(c => c.type === 'pulse');
    if (pulse) return `那些旧线索又在脑子里翻动：${pulse.text || pulse.name}。`;
    return '';
  },

  act_scavenge(s, r) {
    const loc = r.location || '废墟';
    const fl = (this.locFlavor[loc] && this.pick(this.locFlavor[loc])) || '到处是被时间和恐慌啃过的痕迹';
    let t = `你摸进${loc}。${fl}。`;
    const route = this.routeLine(r); if (route) t += ` ${route}`;
    if (r.locationThreat >= 4) t += this.pick([' 这一带最近不干净，连风都像在替什么东西带路。', ' 墙角和门缝都透着危险，像有东西刚从这里经过。']);
    else if (r.locationThreat <= 1) t += this.pick([' 这里出奇地冷清，安静得有点不真实。', ' 你踩着旧灰往里走，暂时没有动静。']);
    if (r.meet) {
      if (r.meet === '丧尸' || (typeof r.meet === 'string' && r.meet.includes('丧尸')))
        t += this.pick([' 一具佝偻的身影从阴影里直起来，浑浊的眼睛转向你。来不及退了。', ' 货架后传来湿哑的咀嚼声——它先发现了你。']);
      else t += this.pick([' 一个活人举着家伙堵在出口，眼神比丧尸更难懂。', ' "把东西放下。"黑暗里有人开口，声音发紧。']);
    }
    if (r.gains && r.gains.length) t += this.pick([` 翻找半天，你把 ${r.gains.join('、')} 塞进背包。`, ` 还算走运——${r.gains.join('、')} 到手。`]);
    else t += this.pick(['一无所获，连耗子都比你先到一步。', '空的，全是空的，只有灰尘。']);
    const story = this.storyLine(r); if (story) t += ` ${story}`;
    return t;
  },
  act_fortify(s, r) {
    const ok = r.parts.some(p => p.includes('防御等级'));
    return ok ? this.pick([`你把能钉的都钉死，能堵的都堵上。今晚，这里更像个能活下去的地方了。`,
      `汗水浸透后背，但当你退后看那道加固过的门，心里踏实了一点。`])
      : this.pick([`材料不够，手艺也不够，折腾半天，墙还是那道随时会塌的墙。`, `钉子歪了，木板裂了，你浪费了本就不多的建材。`]);
  },
  act_train(s, r) { return this.pick([`你逼着自己一遍遍重复，肌肉和神经记住了新的东西。${r.parts[0]||''}`,
    `没人教，你只能用错误喂自己。但确实，你比昨天强了一点。`]); },
  act_craft(s, r) {
    const ok = r.gains && r.gains.length;
    return ok ? `你蹲在地上摆弄那些零碎，叮叮当当忙了半天——${r.gains.join('、')} 成了，握在手里有了点底气。`
      : `结构没撑住，材料废了一地。末世不相信差不多。`;
  },
  act_clear(s, r) {
    const loc = r.location || '据点周边';
    const win = r.parts.some(p => p.includes('清剿成功'));
    const route = this.routeLine(r);
    const prefix = route ? `${route} ` : '';
    return win ? this.pick([`${prefix}你抢了先手，在${loc}一个接一个地放倒它们。等最后一具瘫软下去，周围终于安静了。`,
      `${prefix}刀刃卷了口，手臂酸到发麻，但${loc}的威胁被你硬生生砍下去一截。`])
      : this.pick([`${prefix}${loc}的尸群比你想的多。你边打边退，挨了狠的几下才挣脱出来。`, `${prefix}数量压垮了技巧，你是从${loc}连滚带爬逃回来的。`]);
  },
  act_recruit(s, r) {
    if (!r.meet) return this.pick(['你转了一大圈，活人的影子都没见着。这座城比看上去更空。', '几处疑似有人的地方，走近了只剩冷掉的灰烬。']);
    const joined = r.parts.some(p => p.includes('同意加入'));
    const fight = r.parts.some(p => p.includes('拔刀'));
    const name = typeof r.meet === 'string' ? r.meet : r.meet.name;
    const faction = r.factionName ? `，${r.factionName}的人` : '';
    const loc = r.location ? `在${r.location}` : '';
    if (joined) return `${loc}，${name}${faction}打量了你很久，最后把武器收了起来。"……一起，总比一个人强。"——但你们都清楚，这份关系也会被原来的势力记上一笔。`;
    if (fight) return `${loc}，话不投机。${name}${faction}的脸色沉下去，下一秒就动了手，你吃了亏才脱身。在青阳市，开口本身就是冒险。`;
    return `${loc}，${name}${faction}没答应同行，却也没翻脸，临走前压低声音透露了几句本地的门道。`;
  },
  act_rest(s, r) { return this.pick([`你给自己放了一天假。门闩到底，蜷在角落，听着外面的世界继续腐烂。`,
    `难得地，你睡了几个钟头沉觉。醒来时身上的疼淡了些，脑子也清明了些。`]); },
  act_research(s, r) {
    const got = r.parts.some(p => p.includes('习得') || p.includes('智力'));
    const story = this.storyLine(r);
    const base = got ? `你借着微光啃完那些纸页，有些东西忽然就通了。${r.parts.find(p=>p.includes('习得'))||''}`
      : `字句在眼前打转，半天没看进去什么，只是消磨了光阴。`;
    return story ? `${base} ${story}` : base;
  },
  act_chat(s, r) {
    const c = s.companions.find(x => x.name === r.companion) || s.companions[0];
    if (!c) return `你对着冷掉的火光坐了一会儿，没人回答。`;
    const p = GameData.COMPANION_PERSONALITIES[c.personality]?.name || '沉默';
    const fear = c.fear ? `他说自己最怕${c.fear}，说完又像后悔一样闭了嘴。` : '';
    if ((c.stress || 0) >= 60) return `你和 ${c.name} 坐得很近。${p}的人也会累，他说话时声音很低，像怕惊动墙外的东西。${fear}`;
    return this.pick([`你和 ${c.name} 有一搭没一搭地聊着，聊战前的吃食，聊不敢想的以后。火光跳着，夜似乎短了一点。`,
      `${c.name} 难得笑了一下。你们分了一局牌，谁也没认真算输赢。这点没用的快乐，是此刻唯一管用的东西。`]);
  },
  act_pray(s, r) { return this.pick([`你闭上眼，把纷乱的念头一点点理顺。不为求谁庇佑，只为让自己别先垮掉。`,
    `你对着虚空低声说了些什么。没有回应，但胸口那块石头，轻了一些。`]); },
  act_free(s, r) {
    const t = (r.free || '').trim();
    const id = r.freeIntentId || '';
    const loc = r.freeLocation ? `在${r.freeLocation}` : '';
    const place = r.freeLocation || '这片废墟';
    const loot = r.gains && r.gains.length ? `你带回了 ${r.gains.join('、')}。` : '';
    const cost = [];
    if (r.deltas && r.deltas.hp < 0) cost.push('身上添了新伤');
    if (r.deltas && r.deltas.san < 0) cost.push('心里也被刮下一层');
    if (r.deltas && r.deltas.infection > 0) cost.push('污染钻进伤口里');

    if (r.freeIntent) {
      if (r.freeSuccess) {
        const base = {
          scout: `${loc}，你没有急着动手，只是把声音、影子和可能的退路一一记下来。${place}不再只是地图上的一个名字。`,
          breach: `${loc}，你把工具塞进缝隙，屏住气一点点发力。锁舌终于松开，动静比你预想的小。`,
          repair: `你把能拆的拆开，能接的接回去。火花跳了一下，旧机器像个濒死的人，终于又喘上一口气。`,
          talk: `${loc}，你没有把话说满，只试探着递出一句能让人接住的话。末日里，开口和拔刀一样需要准头。`,
          hide: `${loc}，你把身体压低，让呼吸贴着墙面滑过去。危险从不远处经过，却没有回头。`,
          forage: `${loc}，你沿着边角翻找，避开腐坏的东西，只挑还可能入口的带走。`,
          organize: `你把据点里乱七八糟的东西重新归位。门闩、背包、退路，都在你能立刻摸到的位置。`,
          reckless: `你赌了一手。青阳市没有温柔地奖励你，但至少这次，它也没有立刻咬断你的手。`,
        }[id] || `你按自己的想法做了：「${t || '随机应变'}」。这一次，行动没有完全落空。`;
        const extra = [];
        if (r.freeTier === 'crit') extra.push(this.pick(['这一手漂亮得有点不像末世里的事。', '少见地，运气和判断站在了同一边。']));
        if (loot) extra.push(loot);
        if (r.meet) extra.push(`你还摸到了一个活人的影子：${r.meet}。`);
        return [base, ...extra].filter(Boolean).join(' ');
      }

      const fail = {
        scout: `${loc}，你看得太久，也靠得太近。等你意识到自己暴露时，退路已经变窄了。`,
        breach: `${loc}，金属发出一声刺耳的响，像在替你向整条街报信。`,
        repair: `你越修越乱，一个错误牵出另一个错误。旧机器沉默下去，像是在嘲笑你的急躁。`,
        talk: `${loc}，话一出口你就知道不对。对方的眼神冷了下去，空气里的温度也跟着降。`,
        hide: `${loc}，你试图绕开麻烦，却踩进了更糟的声音里。`,
        forage: `${loc}，你翻出的东西不是腐坏，就是已经被人捷足先登。饥饿还在胃里磨刀。`,
        organize: `据点被你翻得更乱，越清点越觉得少了什么。也许是物资，也许只是安全感。`,
        reckless: `你赌错了。青阳市伸出冷硬的手，把你的侥幸往地上一按。`,
      }[id] || `「${t || '随机应变'}」没有按你想的发生。末日里的每个多余动作，都可能变成账单。`;
      const tail = cost.length ? `代价很快找上来：${cost.join('，')}。` : '你没得到什么，只把时间和胆气耗掉了一点。';
      return `${fail} ${tail}`;
    }

    return this.pick([`你按自己的想法做了：「${t || '随机应变'}」。这座城会如何回应，没人保证。`,
      `「${t}」——你这么做了。末日里的每个动作都像往黑暗里伸手。`]);
  },
  /* ---------- 周末事件 ---------- */
  weekend(s, r) {
    const e = r.event;
    let body = [`**周末 · ${e.title}**`, e.text];
    // 事件专属补笔
    const extra = {
      horde_near: '你把灯全灭了，连呼吸都放到最轻。墙那边，是成百上千具不知疲倦的躯体。',
      quake: '尘土从房梁簌簌落下，你抱着头，听见某处承重的东西发出不祥的呻吟。',
      stranger: '门外的人没立刻进来，只是隔着门板，报上了一个名字。',
      caravan: '车队的人警惕又疲惫，枪管不经意地朝着你，交易的规矩他们门儿清。',
      diary: '字迹潦草，越往后越乱，但其中一页清楚地画着一处没人去过的地方。',
      harvest: '你几乎忘了新鲜食物是什么味道，咬下去的瞬间，眼眶有点发热。',
    }[e.id];
    if (extra) body.push(extra);
    if (r.gains && r.gains.length) body.push(`你清点了一下：${r.gains.join('、')}。`);
    if (r.threatChanges && r.threatChanges.length) {
      const worse = r.threatChanges.filter(c => c.delta > 0).map(c => c.location);
      const better = r.threatChanges.filter(c => c.delta < 0).map(c => c.location);
      if (worse.length) body.push(`${worse.join('、')}一带的动静变密了。青阳市把坏消息往你的地图上又涂了一层。`);
      if (better.length) body.push(`${better.join('、')}暂时安静下来，但没人知道能安静多久。`);
    }
    if (r.routeChanges && r.routeChanges.length) {
      const discovered = r.routeChanges.filter(c => c.discover).map(c => c.name);
      const blocked = r.routeChanges.filter(c => c.block).map(c => c.name);
      const unblocked = r.routeChanges.filter(c => c.unblock).map(c => c.name);
      const loud = r.routeChanges.filter(c => c.delta > 0).map(c => c.name);
      const quiet = r.routeChanges.filter(c => c.delta < 0).map(c => c.name);
      if (discovered.length) body.push(`雨水、脚印或别人的错误暴露了新路线：${discovered.join('、')}。`);
      if (blocked.length) body.push(`${blocked.join('、')}被堵住了，地图上有些线开始变得不可靠。`);
      if (unblocked.length) body.push(`${unblocked.join('、')}终于能走了，至少暂时如此。`);
      if (loud.length) body.push(`${loud.join('、')}沿途的动静变大了。`);
      if (quiet.length) body.push(`${quiet.join('、')}沿途安静了些。`);
    }
    if (r.factionChanges && r.factionChanges.length) {
      const up = r.factionChanges.filter(c => c.delta > 0).map(c => c.name);
      const down = r.factionChanges.filter(c => c.delta < 0).map(c => c.name);
      if (up.length) body.push(`${up.join('、')}对你的态度松了一点，但这不等于信任。`);
      if (down.length) body.push(`${down.join('、')}那边开始把你的名字往坏账上记。`);
    }
    const story = this.storyLine(r); if (story) body.push(story);
    if (r.deaths && r.deaths.length) body.push(`这一周，你失去了 ${r.deaths.join('、')}。名单又短了一截。`);
    if (r.meet) body.push(`门外站着一个人，自称 ${r.meet.name}（${r.meet.profession}）。要不要让他进来，是你的事。`);
    body.push(`新的一周开始了。第 ${r.week} 周，行动力恢复为 4。`);
    const dr = this.dread(s.vitals);
    if (dr.length) body.push(dr[0]);
    return body.join('\n\n') + '\n\n' + this.choiceBlock([
      '寻找物资', '修缮庇护所', '清理周边丧尸', '深度休整',
    ]);
  },

  /* ---------- 选项 ---------- */
  // 上下文选项：尽量用「能直接映射到行动」的措辞，点击即触发对应行动
  contextChoices(s, r) {
    const v = s.vitals, opts = [];
    if (s.ap > 0) {
      opts.push('寻找物资');
      if ((s.flags.threat || 2) >= 2) opts.push('清理周边丧尸');
      else opts.push('修缮庇护所');
      if (v.hp <= 49) opts.push('处理伤口');                 // → 提示用医疗物品
      else if (v.hunger <= 49) opts.push('吃点东西');        // → 提示进食
      else if (v.san <= 49) opts.push('祈祷冥想');
      else if (s.companions.length) opts.push('与队友闲聊');
      else opts.push('深度休整');
    } else {
      opts.push('进入周末结算');
      if (v.hp <= 49) opts.push('处理伤口');
      if (v.hunger <= 49) opts.push('吃点东西');
    }
    return this.choiceBlock(opts.slice(0, 4));
  },

  choiceBlock(opts) { return opts.map((o, i) => `${i + 1}. ${o}`).join('\n'); },
};

/* ===========================================================================
 * data.js — 静态内容与规则表
 * 所有「设定数据」集中在这里：属性定义、职业、物品、地点战利品、随机事件、
 * 数值修正表、以及给 LLM 叙事用的系统提示词。
 * 引擎(engine.js)只读这里的表，不写死内容，方便后续扩。
 * ======================================================================== */

const GameData = {

  /* ---- 七项骰值属性（口才=elo，魅力=chm） ---- */
  ATTRS: [
    { key: 'str', name: '力量', desc: '近战伤害、负重、破障' },
    { key: 'agi', name: '敏捷', desc: '闪避、先手、潜行、远程命中' },
    { key: 'int', name: '智力', desc: '科技修复、医疗、陷阱效率' },
    { key: 'per', name: '感知', desc: '侦察、发现隐藏物资、识破陷阱' },
    { key: 'elo', name: '口才', desc: '交易、招募、说服、恐吓' },
    { key: 'luck', name: '幸运', desc: '搜刮质量、致命规避、事件走向' },
    { key: 'chm', name: '魅力', desc: '初始态度、交易价、招募意向、士气' },
  ],

  /* ---- 四条生存数值 ---- */
  VITALS: [
    { key: 'hp',        name: '生命值', max: 100, good: 'high' },
    { key: 'hunger',    name: '饱腹度', max: 100, good: 'high' },
    { key: 'san',       name: 'San值',  max: 100, good: 'high' },
    { key: 'infection', name: '感染度', max: 100, good: 'low'  },
  ],

  /* ---- 职业：属性倾向(在随机基础上叠加) + 初始物品 + 备注 ---- */
  PROFESSIONS: {
    '学生':       { bias: { agi: 5, int: 8 },                items: ['学生证', '能量棒×2', '小刀'],            note: '年轻、学得快，但缺乏实战。' },
    '民警':       { bias: { str: 10, per: 8, elo: 5 },       items: ['警棍', '手铐', '手枪(弹药7)', '执法记录仪'], note: '受过训练，可使用手枪——青阳市极少数能用枪的人之一。' },
    '医生':       { bias: { int: 12, per: 6 },               items: ['口罩×5', '急救包', '抗生素×3', '手术刀'],   note: '医疗判定优势，处理伤口与感染更有效。' },
    '教师':       { bias: { int: 8, elo: 8, chm: 5 },        items: ['粉笔', '保温杯', '记事本', '老花镜'],        note: '善于沟通与组织，招募说服占优。' },
    '出租车司机': { bias: { per: 8, str: 5, luck: 5 },       items: ['车钥匙', '扳手', '半瓶矿泉水', '城区地图'],  note: '熟悉路况，搜刮与逃生路线感知好。' },
    '明星':       { bias: { chm: 15, elo: 6 },               items: ['名牌墨镜', '签名笔', '化妆镜', '现金一沓'],  note: '魅力极高，初见好感占优，但娇气、实战弱。' },
    '小偷':       { bias: { agi: 12, per: 6, luck: 6 },      items: ['撬锁工具', '匕首', '黑色帽衫', '战利品袋'],   note: '潜行与搜刮高手，但易被信任问题困扰。' },
    '工人':       { bias: { str: 12, int: 4 },               items: ['羊角锤', '工作手套', '安全帽', '强力胶带'],   note: '力量与修缮庇护所占优。' },
    '军人':       { bias: { str: 10, agi: 8, per: 6 },       items: ['军刺', '步枪(弹药15)', '战术背包', '压缩干粮×3'], note: '武警/军警——可使用步枪，战斗全能，枪械稀有资源。' },
    '厨师':       { bias: { str: 5, per: 6, luck: 4 },       items: ['菜刀', '打火机', '盐一袋', '铁锅'],          note: '烹饪回复更高，菜刀也是趁手近战武器。' },
  },

  /* ---- 幸存者势力：声望会影响招募、交易与冲突 ---- */
  /* ---- 队友深度模板：性格会影响压力、忠诚和危险行动表现 ---- */
  COMPANION_PERSONALITIES: {
    cautious: { name: '谨慎', desc: '行动前会反复确认退路。危险时压力涨得慢，但不喜欢鲁莽。', stressBias: -1, loyaltyBias: 2, dangerBias: -1 },
    brave: { name: '热血', desc: '愿意冲在前面，容易受伤，也更容易在胜利后信任你。', stressBias: 1, loyaltyBias: 1, dangerBias: 2 },
    cold: { name: '冷面', desc: '情绪不外露，压力稳定，但好感提升很慢。', stressBias: -2, loyaltyBias: -1, dangerBias: 0 },
    caring: { name: '顾家', desc: '很在意队伍里的活人，队友受伤或死亡会让压力暴涨。', stressBias: 2, loyaltyBias: 3, dangerBias: -1 },
    opportunist: { name: '投机', desc: '看重收益和安全，局势坏时更容易动摇。', stressBias: 1, loyaltyBias: -3, dangerBias: 1 },
    medic: { name: '照护者', desc: '习惯照看伤口和情绪，闲聊与休整时效果更好。', stressBias: -1, loyaltyBias: 2, dangerBias: 0 },
  },
  COMPANION_FEARS: ['尸群', '饥饿', '感染', '黑暗', '背叛', '火灾', '枪声', '医院'],
  FACTIONS: {
    'nanqiao': { name: '南桥营地', type: '互助营地', base: 8, locations: ['居民区', '超市'], traits: ['守规矩', '缺药', '人多嘴杂'], note: '由社区幸存者拼出来的临时营地，愿意交换情报，但不轻易收人。' },
    'blackmarket': { name: '黑市车队', type: '流动商队', base: 0, locations: ['超市', '加油站', '仓库'], traits: ['精明', '要价狠', '消息灵'], note: '有车、有枪、有账本。只认筹码，不认交情。' },
    'rustfang': { name: '铁锈帮', type: '劫掠团伙', base: -18, locations: ['仓库', '加油站'], traits: ['暴力', '记仇', '抢燃料'], note: '靠抢劫和恐吓活着，和他们打交道永远带血。' },
    'whitetower': { name: '白塔医援', type: '医疗小组', base: 4, locations: ['药店', '医院'], traits: ['谨慎', '有药', '重视伤员'], note: '几个医生和护工守着残余药品，救人，也筛人。' },
    'oldguard': { name: '旧警戒线', type: '武装残部', base: -4, locations: ['医院', '居民区'], traits: ['纪律化', '疑心重', '枪械稀少'], note: '像军警，又不像。口令、岗哨和坏掉的命令还留在他们身上。' },
  },

  /* ---- 搜刮地点：战利品池 + 风险 ---- */
  LOCATIONS: {
    '居民区': { risk: 0.30, loot: ['罐头', '矿泉水', '创可贴', '旧衣物', '电池', '菜刀', '现金', '相册'] },
    '超市':   { risk: 0.45, loot: ['压缩饼干', '瓶装水×2', '罐头×2', '能量棒', '保鲜膜', '购物车', '巧克力'] },
    '药店':   { risk: 0.40, loot: ['抗生素', '消毒剂', '止痛药', '绷带', '口罩×3', '体温计', '抗抑郁药'] },
    '仓库':   { risk: 0.55, loot: ['木板×3', '铁皮', '钢管', '汽油', '绳索', '工具箱', '帆布'] },
    '医院':   { risk: 0.65, loot: ['急救包', '抗生素×2', '手术刀', '止血带', '吗啡', '担架', '消毒剂×2'] },
    '加油站': { risk: 0.50, loot: ['汽油×2', '机油', '打火机', '泡面×3', '香烟', '改锥'] },
  },

  /* ---- 青阳市路线图：外出行动会经过这些路线，路线噪音/路障会改变风险 ---- */
  HOME: '庇护所',
  ROUTES: [
    { id: 'home-res', from: '庇护所', to: '居民区', name: '旧小区后巷', risk: 0.04, noise: 0, note: '离据点最近，熟悉但容易留下脚印' },
    { id: 'home-market', from: '庇护所', to: '超市', name: '塌陷公交线', risk: 0.08, noise: 1, note: '大道宽，视野好，也更容易暴露' },
    { id: 'res-pharmacy', from: '居民区', to: '药店', name: '药店卷帘门街', risk: 0.06, noise: 0, note: '窄街两侧店铺密集，适合快进快出' },
    { id: 'res-hospital', from: '居民区', to: '医院', name: '住院部侧门路', risk: 0.12, noise: 1, note: '救护车堵死半条路，尸群常在附近徘徊' },
    { id: 'market-warehouse', from: '超市', to: '仓库', name: '货运通道', risk: 0.10, noise: 1, note: '货车残骸多，能藏身，也容易被困' },
    { id: 'market-gas', from: '超市', to: '加油站', name: '城南主干道', risk: 0.11, noise: 2, note: '空旷、直、吵，远处看得见你' },
    { id: 'warehouse-gas', from: '仓库', to: '加油站', name: '油罐车支路', risk: 0.09, noise: 1, note: '燃油味重，遇火就是死路' },
    { id: 'pharmacy-hospital', from: '药店', to: '医院', name: '急诊连廊', risk: 0.09, noise: 1, note: '能缩短去医院的距离，但门后动静很杂' },
    { id: 'drain-hospital', from: '居民区', to: '医院', name: '雨水渠暗道', risk: -0.04, noise: -1, hidden: true, note: '一条脏得要命的低矮暗道，危险少，代价是恶心' },
    { id: 'school-cut', from: '庇护所', to: '药店', name: '学校围墙缺口', risk: -0.02, noise: 0, hidden: true, note: '翻过学校后墙能直抵药店后街' },
    { id: 'service-tunnel', from: '仓库', to: '医院', name: '供热管廊', risk: -0.01, noise: -1, hidden: true, blocked: true, note: '入口被杂物堵住，清出来前只能看着' },
  ],

  /* ---- 物品使用效果（数值范围由引擎摇定并 clamp）----
   * 设定对齐：罐头/压缩饼干 +25~40；烹饪 +15~30；急救包等得当处理 +20~40；
   * 简易医疗 +5~15；抗生素抑制感染；消毒剂仅感染<61有效；抗抑郁药 San+10~20(多次有副作用)。
   * 匹配按 name===key 或 name.startsWith(key)，所以 "抗生素×3" 展开后逐件可用。 */
  ITEM_EFFECTS: {
    // 食物
    '罐头':       { type: 'food',  hunger: [25, 40], msg: '你撬开罐头，冷掉的肉块和油脂一起咽下去' },
    '压缩饼干':   { type: 'food',  hunger: [25, 40], msg: '压缩饼干噎得慌，但顶饿' },
    '压缩干粮':   { type: 'food',  hunger: [25, 40], msg: '军用干粮，难吃，管用' },
    '泡面':       { type: 'food',  hunger: [20, 30], msg: '没有热水，你干嚼了这包泡面' },
    '能量棒':     { type: 'food',  hunger: [15, 25], msg: '一根能量棒，甜得发腻' },
    '巧克力':     { type: 'food',  hunger: [15, 25], san: [2, 5], msg: '久违的甜，舌尖泛起一点活着的实感' },
    '盐':         { type: 'food',  hunger: [3, 6],   msg: '舔了点盐，至少不那么发虚' },
    '腐肉':       { type: 'raw',   hunger: [5, 10],  msg: '你强忍恶心吞下腐肉' },
    // 水
    '矿泉水':     { type: 'water', hunger: [5, 10],  msg: '你灌下半瓶水，喉咙不再冒烟' },
    '瓶装水':     { type: 'water', hunger: [5, 10],  msg: '干净的水，难得' },
    '半瓶矿泉水': { type: 'water', hunger: [3, 6],   msg: '剩下的半瓶水，省着喝' },
    '雨水':       { type: 'water', hunger: [3, 8],   msg: '接来的雨水带着铁锈味' },
    // 医疗
    '急救包':     { type: 'med',   hp: [20, 40], msg: '你仔细清创、上药、包扎' },
    '止血带':     { type: 'med',   hp: [8, 15],  msg: '勒紧止血带，血总算止住' },
    '绷带':       { type: 'med',   hp: [5, 15],  msg: '草草缠上绷带' },
    '创可贴':     { type: 'med',   hp: [3, 8],   msg: '贴了张创可贴，聊胜于无' },
    '止痛药':     { type: 'med',   hp: [3, 8], san: [2, 5], msg: '吞下止痛药，疼意退潮' },
    '吗啡':       { type: 'med',   hp: [5, 12], san: [5, 10], msg: '吗啡推进血管，世界柔软下来' },
    // 抗感染
    '抗生素':     { type: 'cure',     msg: '吞下抗生素，压住体内的躁动' },
    '消毒剂':     { type: 'disinfect', msg: '你用消毒剂灼烧伤口，疼得眼前发白' },
    // 精神
    '抗抑郁药':   { type: 'antidep', san: [10, 20], msg: '药片压下翻涌的念头' },
  },

  /* ---- 周末随机事件（好坏各半） ---- */
  EVENTS: [
    { id: 'rainstorm',  good: false, title: '暴雨倾盆',     text: '连日暴雨灌进据点，物资受潮，饮水却得到补充。', effect: { hunger: -3 }, gain: ['雨水(可饮)'] },
    { id: 'horde_far',  good: false, title: '尸群迁徙(远处)', text: '远处传来海潮般的呻吟，尸群沿主干道涌过，未发现你的据点。', effect: { san: -5 } },
    { id: 'horde_near', good: false, title: '尸群迁徙(近处)', text: '尸群擦着据点外墙而过，你屏住呼吸度过了最漫长的一夜。', effect: { san: -12, hp: -3 } },
    { id: 'quake',      good: false, title: '地震',         text: '大地震颤，庇护所出现裂缝，你被坠物砸中。', effect: { hp: -10, san: -6 } },
    { id: 'wildfire',   good: false, title: '野火蔓延',     text: '城东燃起大火，浓烟蔽日，你不得不彻夜警戒。', effect: { san: -8, hunger: -4 } },
    { id: 'coldsnap',   good: false, title: '极寒突袭',     text: '气温骤降，没有足够燃料，你蜷缩着发抖。', effect: { hp: -6, hunger: -6 } },
    { id: 'traitor',    good: false, title: '叛徒告密',     text: '附近势力似乎得知了你的位置，空气里多了一丝杀机。', effect: { san: -10 } },
    { id: 'cropdmg',    good: false, title: '作物受损',     text: '你勉强种下的菜苗被啃食殆尽。', effect: { hunger: -5 } },
    { id: 'nightmare',  good: false, title: '噩梦缠身',     text: '你梦见所有人死去的样子，惊醒时浑身冷汗。', effect: { san: -8 } },
    { id: 'flu',        good: false, title: '流感传染',     text: '低烧、咳嗽——在末世，普通的病也可能要命。', effect: { hp: -5, hunger: -4 } },

    { id: 'stranger',   good: true,  title: '流浪者叩门',   text: '一个疲惫的幸存者敲响你的门，神色复杂，似乎想交易些什么。', meet: true },
    { id: 'caravan',    good: true,  title: '贸易车队路过', text: '一支武装贸易车队短暂停留，愿意以物易物。', trade: true },
    { id: 'diary',      good: true,  title: '遗留日记',     text: '你在墙缝里翻出一本日记，记载着附近一处未被搜刮的藏匿点。', gain: ['泛黄的日记', '藏匿点线索'] },
    { id: 'supply',     good: true,  title: '意外之物',     text: '雨水冲出一只半埋的行李箱，里面有干净的补给。', gain: ['压缩饼干×2', '抗生素', '瓶装水'] },
    { id: 'harvest',    good: true,  title: '收获季',       text: '你照料的角落竟结出果实，难得的新鲜食物。', effect: { hunger: 20, san: 5 } },
    { id: 'goodsleep',  good: true,  title: '难得安眠',     text: '罕见的平静夜晚，你睡了几个月来最沉的一觉。', effect: { hp: 10, san: 10 } },
  ],

  /* ---- 主线谜团：线索会在搜刮、研究、周末事件中逐步浮现 ---- */
  STORY: {
    title: '零号档案',
    stages: [
      { name: '杂音', need: 0, desc: '青阳市的灾难还只是一堆互相矛盾的传闻。' },
      { name: '冷链疑云', need: 2, desc: '几个地点都指向同一批异常冷链货物。' },
      { name: '白塔病历', need: 4, desc: '医院和药店留下的记录开始互相咬合。' },
      { name: '地下冷库', need: 6, desc: '仓库、加油站和旧警戒线都绕不开一座地下冷库。' },
      { name: '门后真相', need: 8, desc: '你已经接近青阳市爆发的源头，但知道真相未必能救人。' },
    ],
    clues: {
      hospital_log: { name: '急诊分流记录', locations: ['医院', '研究'], weight: 3, text: '急诊楼最早收治的不是咬伤者，而是同一批低温休克病人。' },
      pharmacy_batch: { name: '退回药品批号', locations: ['药店', '研究'], weight: 3, text: '白塔医援退回过一批镇静剂，批号和医院记录里的日期完全一致。' },
      cold_chain: { name: '冷链运输单', locations: ['仓库'], weight: 3, text: '仓库账本显示，灾前夜有三辆冷链车被临时改道，目的地被人撕掉。' },
      gas_broadcast: { name: '加油站电台录音', locations: ['加油站', '研究'], weight: 2, text: '残破电台反复播出同一句话：不要打开地下二号门。' },
      residence_note: { name: '居民求助便签', locations: ['居民区', '周末'], weight: 2, text: '便签上写着：隔壁一家不是被咬的，是从医院回来后才开始发烧。' },
      market_receipt: { name: '超市异常采购单', locations: ['超市'], weight: 2, text: '有人在爆发前大量采购冰块、黑色塑料布和燃油，签名处只有一个白塔印章。' },
      white_tower_case: { name: '白塔病例索引', locations: ['医院', '药店', '研究'], weight: 2, text: '病例索引用代号替代姓名，所有首例患者都被标记为“零号接触”。' },
      convoy_manifest: { name: '车队货运清单', locations: ['仓库', '加油站', '周末'], weight: 2, text: '黑市车队曾护送过一批密封金属箱，护送费高得不像药品。' },
      radio_pattern: { name: '重复电报码', locations: ['研究', '周末'], weight: 1, text: '你把杂讯拆开后发现，那不是求救，而是一串不断重发的门禁编号。' },
      basement_photo: { name: '地下冷库照片', locations: ['医院', '仓库', '研究'], weight: 1, text: '照片背面写着“二号门后不要留活物”，落款是旧警戒线。' },
    },
  },
  /* ---- 11 种周内行动（每个耗 1 行动力） ---- */
  ACTIONS: [
    { id: 'scavenge', name: '寻找物资', need: 'per',  desc: '搜索某地点，感知定收获、幸运定意外。可能遭遇丧尸或敌对者。', pickLocation: true },
    { id: 'fortify',  name: '修缮庇护所', need: 'str', alt: 'int', desc: '加固据点，降低夜袭概率、改善睡眠(San恢复+)。' },
    { id: 'train',    name: '训练属性',  need: null, desc: '专项训练某属性，永久+1~3，消耗2份口粮与水。魅力/幸运不可练。', pickTrainAttr: true },
    { id: 'craft',    name: '制造/改装', need: 'int', alt: 'str', desc: '用材料制作或升级近战/远程武器、护甲。失败浪费材料。' },
    { id: 'clear',    name: '清理丧尸',  need: 'str', combo: 'agi', desc: '主动清剿据点附近尸群，降威胁、得材料，可能重伤。', pickClearLocation: true },
    { id: 'recruit',  name: '交流/招募', need: 'chm', alt: 'elo', desc: '前往某片区域接触幸存者或势力，建立关系或招募。失败可能引发冲突。', pickLocation: true },
    { id: 'rest',     name: '深度休整',  need: null, desc: '完全休息一天。生命+15，San+10，饱腹消耗减半，无风险。' },
    { id: 'research', name: '研究/阅读', need: 'int', desc: '翻阅书籍笔记地图，解锁配方/情报，或提升智力感知。' },
    { id: 'chat',     name: '队友闲聊',  need: null, desc: '与队友非功利互动，提好感、双方San+5~10、得短暂Buff。需有队友。' },
    { id: 'pray',     name: '祈祷/冥想', need: null, desc: '精神调适，San+10~20，得短暂Buff(如本周San消耗减半)。' },
    { id: 'free',     name: '自主发挥',  need: null, desc: '自由行动，注意合理性，诡异行为会掉好感或造成伤害。', freeform: true },
  ],

  /* ---- 自主行动意图：输入无法映射到正式行动时，由引擎按这些规则摇骰裁定 ---- */
  FREE_INTENTS: [
    { id: 'scout', name: '侦察探路', re: /侦察|观察|探路|踩点|望风|查看|调查|摸清|看看|盯梢/, attrs: ['per', 'agi'], difficulty: 5, risk: 0.12, gains: ['城区情报图', '藏匿点线索', '丧尸习性笔记'] },
    { id: 'breach', name: '破障开路', re: /撬|开锁|破门|砸门|撞门|翻墙|翻窗|拆开|破坏/, attrs: ['str', 'agi'], difficulty: -5, risk: 0.22, gains: ['零件', '铁皮', '钢管'] },
    { id: 'repair', name: '修理维护', re: /修|修理|发电|电台|无线电|净水|车|发动|电路|加固/, attrs: ['int', 'per'], difficulty: 0, risk: 0.10, gains: ['零件', '电池', '工具箱'] },
    { id: 'talk', name: '交涉试探', re: /喊|喊话|交涉|谈判|威胁|求助|打听|交易|交换|套话/, attrs: ['elo', 'chm'], difficulty: -3, risk: 0.25, gains: ['情报纸条', '半瓶矿泉水'] },
    { id: 'hide', name: '隐藏绕行', re: /躲|藏|潜行|绕路|避开|埋伏|静观|不出声|屏息/, attrs: ['agi', 'per'], difficulty: 3, risk: 0.08, gains: ['安全路线'] },
    { id: 'forage', name: '觅食取水', re: /找吃|找水|觅食|采集|烧水|接雨|做饭|煮|过滤|找食物/, attrs: ['per', 'luck'], difficulty: 0, risk: 0.15, gains: ['雨水', '能量棒', '泡面'] },
    { id: 'organize', name: '整理据点', re: /整理|清点|分类|归置|布置|巡逻|守夜|检查门窗/, attrs: ['int', 'per'], difficulty: 8, risk: 0.06, gains: ['碎布料', '木板'] },
    { id: 'reckless', name: '冒险尝试', re: /.*/, attrs: ['luck'], difficulty: -8, risk: 0.24, gains: ['意外之物'] },
  ],

  /* ---- 数值分级修正：返回各判定的百分比修正 ---- */
  // 输入当前 vitals，输出 { str: -0.4, int: -0.1, ... , combat: -0.15, fear: +0.1 }
  modifiers(v) {
    const m = { str: 0, agi: 0, int: 0, per: 0, elo: 0, luck: 0, chm: 0, combat: 0, fear: 0 };
    const hp = v.hp, hu = v.hunger, sa = v.san, inf = v.infection;
    // 生命值
    if (hp <= 79 && hp >= 50) m.combat -= 0.05;
    else if (hp <= 49 && hp >= 20) m.combat -= 0.15;
    else if (hp <= 19 && hp >= 1) m.str -= 0.50;
    // 饱腹度
    if (hu <= 49 && hu >= 20) m.int -= 0.10;
    else if (hu <= 19 && hu >= 1) { m.str -= 0.40; m.agi -= 0.30; }
    // San值
    if (sa >= 80) m.fear += 0.10;
    else if (sa <= 79 && sa >= 50) m.per -= 0.05;
    else if (sa <= 49 && sa >= 20) m.elo -= 0.20;
    else if (sa <= 19 && sa >= 1) { m.int -= 0.50; m.per -= 0.40; }
    // 感染度
    if (inf >= 31 && inf <= 60) m.per -= 0.10;
    else if (inf >= 61) m.int -= 0.40;
    return m;
  },

  /* ---- 数值分级的文字状态（用于面板提示） ---- */
  vitalTier(key, val) {
    if (key === 'hp') {
      if (val >= 80) return '健康'; if (val >= 50) return '轻伤';
      if (val >= 20) return '重伤'; if (val >= 1) return '濒死'; return '死亡';
    }
    if (key === 'hunger') {
      if (val >= 80) return '充盈'; if (val >= 50) return '正常';
      if (val >= 20) return '饥饿'; if (val >= 1) return '虚脱'; return '饿死';
    }
    if (key === 'san') {
      if (val >= 80) return '坚定'; if (val >= 50) return '紧张';
      if (val >= 20) return '焦虑'; if (val >= 1) return '疯狂'; return '崩溃';
    }
    if (key === 'infection') {
      if (val === 0) return '洁净'; if (val <= 30) return '潜伏';
      if (val <= 60) return '发热'; if (val <= 90) return '变异';
      if (val <= 99) return '濒临转化'; return '完全转化';
    }
    return '';
  },

  /* ---- 给 LLM 当 GM 的系统提示词（叙事增强模式） ---- */
  // 引擎已经算好了机制结果（骰子/成败/数值变化/战利品），LLM 只负责把它写成
  // 冷冽粗粝、有文学性的叙事，并给出 2-4 个后续选项。数字以引擎为准。
  systemPrompt() {
    return `你是文字末日生存游戏《末日求生·青阳市》的叙事系统(GM)。背景：后启示录的中国青阳市，丧尸横行，幸存者稀少、人性复杂，没有血清、没有救援，唯一的结局是死亡。

风格铁律：
- 语言冷冽、粗粝、有文学性，节奏短促有力。绝不跳出角色，绝不解释规则、不提"骰子/判定/数值/AI/系统提示"等元信息。
- 角色对话用直角以外的弯引号 ""，系统音/特殊指代用 「」。
- 每次输出只写叙事正文(2-5 段)，不要复述状态面板(面板由程序渲染)。
- 结尾给出 2-4 个编号选项，承接当前局势，简短有张力。

机制由程序裁定：我会在用户消息里告诉你本回合发生了什么(玩家行动、成败档位、实际数值变化、获得/失去的物品、遭遇)。你必须严格按这个结果来写，不得擅自更改成败或数字，但可以自由发挥过程细节、环境、NPC 言行与内心。NPC 永远复杂，善恶并存，好感极难提升，随时可能背刺。

输出 = 叙事散文 + 末尾 2-4 个编号选项。正文里不要状态面板、不要解释规则。

可选的世界变更块：如果你在叙事中让玩家【获得/失去了具体物品】或【某个 NPC 的好感发生变化】，可以在整段输出的最末尾、编号选项之后，追加一个 \`\`\`json 代码块来声明这些变化，供程序落地：
\`\`\`json
{"items_gained":["绷带","半瓶水"],"items_lost":["燃烧瓶"],"relations":{"卫军":8}}
\`\`\`
规则：① 只在确有变化时才写，没有就别加这个块；② 内容必须与你写的叙事一致、幅度克制(好感单次 ±1~15)；③ 绝不要写生命/饱腹/San/感染/属性等数值——那些一律由程序裁定，你写了也会被忽略；④ JSON 放在最后且必须合法。`;
  },
};

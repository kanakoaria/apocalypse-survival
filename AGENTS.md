# AGENTS.md — 给协作 AI（Codex / Claude 等）的工作约定

这个仓库由多方协作：**Claude**（这一侧）与 **Codex**（Aria 一侧，远程）可能同时改动。
本文件是共同的「宪法」，动手前请先读完。Codex 会自动加载本文件。

> **项目归属**：本项目由 **Aria** 提出，原始游戏设定出自 Aria。**游戏的整体方向**——世界观、
> 核心机制框架、玩法走向——**以 Aria 的设计意图为准**。实现者（Claude / Codex）的职责是忠实实现
> 与打磨，不要单方面改变游戏大方向；遇到涉及方向的设计抉择，先与 Aria 确认，别擅自定调。
> （在已定方向内补全机制、修 bug、做体验优化，照常进行即可。）

## 一句话项目

文字末日生存 RPG 网页版《末日求生·青阳市》。纯静态（HTML/CSS/JS，**无构建、无依赖、无框架**），
双击 `index.html` 即可玩；可选接入 AI 叙事（Claude / DeepSeek，BYOK）。

## 🔴 头号铁律：数值只归引擎，AI 只管讲故事

游戏的全部**数值裁定**（生命/饱腹/San/感染、七项属性、骰子判定、行动力、衰减、死亡）
**只能在 `js/engine.js` 里发生**。这是为了满足设计要求「玩家手输加属性无效，须后台摇骰」，
也防止 AI 编数字、防作弊、防漂移。

- 叙事器（`narrator.js` / `offline.js`）**绝不**写 `vitals` / `attrs`。
- AI 模式下，LLM 可在输出末尾附 `json` 块声明**仅限两类**变化：物品增减、NPC 好感。
  由 `Engine.applyAIDelta()` 校验+clamp 后落地；其中任何 hp/hunger/san/infection/属性键**一律被忽略**。
- 新增任何「会改数值」的机制 → 放进 engine，不要放进 narrator/ui。

违反这条会破坏游戏平衡与公平性，是本项目唯一不可商量的红线。

## 文件分工（改之前先认准该改哪个）

| 文件 | 职责 | 往这里加什么 |
|---|---|---|
| `index.html` | 入口，按序加载脚本 | 新脚本文件的 `<script>`（注意顺序：data→engine→offline→narrator→ui） |
| `css/style.css` | 视觉 + 可点交互样式 | 样式 |
| `js/data.js` | **静态内容与规则表**（`GameData`） | 职业 / 物品效果 `ITEM_EFFECTS` / 地点 `LOCATIONS` / 事件 `EVENTS` / 行动 `ACTIONS` / 修正表 `modifiers` / 系统提示词 |
| `js/engine.js` | **确定性引擎**（`Engine`） | 任何涉及数值/骰子/物品/队友/存档的逻辑 |
| `js/offline.js` | 离线涌现叙事器（`OfflineNarrator`） | 叙事片段库、按处境拼装的文案 |
| `js/narrator.js` | 叙事路由（`Narrator`，离线/Claude/OpenAI 兼容） | LLM 调用、prompt、delta 解析 |
| `js/ui.js` | 界面控制器（`UI`） | 渲染、点击交互、面板、存档 UI |

> 想加新内容（职业/物品/事件/地点）优先改 **`data.js` 的表**，引擎是数据驱动的，通常不用动逻辑。

## 数据流（一回合）

```
玩家点行动 / 点选项 / 打字
  → Engine.runAction(id, opt)   // 摇骰、改数值、产出机制结果 res
  → Narrator.narrate('action', res) → { text, delta }   // 把 res 写成叙事；AI 可附 delta
  → UI 渲染叙事 + 可点选项；若有 delta → Engine.applyAIDelta（仅物品/关系）
  → UI.afterTurn()  // 刷新面板、自动存档、判定结束
```

`res.parts[]` 是机制日志（显示在「判定详情」可展开块）；`res.deltas` 是数值变化；`res.gains/deaths/meet` 等供叙事引用。

## 代码约定

- **纯 `<script>`，不要 ES module / import-export**：必须能在 `file://` 直接打开。
- **零依赖、零构建**：不引第三方库、不加打包步骤、不加 `package.json` 依赖。
- 全局对象：`GameData` / `Engine` / `OfflineNarrator` / `Narrator` / `UI`，互相通过全局名引用。
- 不用 `Date.now()` 做游戏随机——引擎用可注入种子的 `Engine.rnd()`（xorshift）保证存档可复现；
  纯叙事随机可用 `Math.random()`（只在 `offline.js`，不影响机制种子）。
- **中文标点**：对话用弯引号 `""`，系统音/特殊指代用直角引号 `「」`。
- 文案风格：冷冽、粗粝、有文学性；不跳出角色、不解释规则、不写元信息。

## 本地运行 / 自测

```bash
# 直接打开
open index.html                     # 或 python3 -m http.server 8000

# 语法体检
for f in js/*.js; do node --check "$f"; done

# 无头跑一局（验证引擎逻辑，不依赖浏览器）
node -e 'const fs=require("fs");eval([ "js/data.js","js/engine.js","js/offline.js" ].map(f=>fs.readFileSync(f,"utf8")).join("\n")+`
  Engine.newGame({name:"测试",gender:"女",age:24,profession:"医生",period:"mid",seed:42});
  console.log(Engine.runAction("scavenge",{location:"药店"}).parts);
`)'
```

> `ui.js` / `narrator.js` 含浏览器专用 API（DOM / fetch / localStorage），无头测时只 `eval` data+engine(+offline)。

## 🤝 多智能体协作约定（防撞）

1. **push 前先 `git fetch` 并 `git rebase origin/main`**（或 `git pull --rebase`），别用会产生 merge commit 的拉取。
2. **改动尽量局部**：优先在已有对象里加方法/加表项，避免大范围重排或重命名既有符号（重命名最容易制造冲突）。
3. **不要为风格重新格式化未改动的代码**（缩进/引号/换行），那会把整文件变成冲突。
4. 加了新系统就**顺手更新 `README.md` 和本文件的表**，让对方看到全貌。
5. commit message 写清「改了什么、为什么」，方便对方 rebase 时判断。
6. 如果要做大改动（重构引擎/换数据结构），先在 README 顶部或一个 `NOTES.md` 留一行「我正在改 X」，减少撞车。

有疑问时，**保引擎数值权威这条优先于一切**。

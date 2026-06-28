# 4 人联机原型使用说明

这是一个本地 / 局域网可玩的联机原型，不需要安装 npm 包。

## 启动

```powershell
cd E:\360MoveData\Users\Aria\Documents\游戏\apocalypse-survival
& "C:\Users\Aria\AppData\Local\OpenAI\Codex\runtimes\cua_node\1b23c930bdf84ed6\bin\node.exe" .codex\multiplayer-server.js
```

打开：

```text
http://127.0.0.1:8125/
```

## 怎么玩

1. 第一个玩家点“4 人联机大厅”，点“创建房间”。
2. 复制房间码给其他玩家。
3. 其他玩家打开同一个网址，填房间码，点“加入房间”。
4. 房主创建或继续游戏，状态会同步给队员。
5. 队员不能直接改数值；底部输入框和行动按钮会变成“行动建议”，发给房主决定是否执行。
6. 右上角联机面板可以聊天、查看玩家、查看建议。

## 局域网

如果想让同一 Wi-Fi 下的别人用电脑访问，把服务监听到所有网卡：

```powershell
$env:HOST='0.0.0.0'
$env:PORT='8125'
& "C:\Users\Aria\AppData\Local\OpenAI\Codex\runtimes\cua_node\1b23c930bdf84ed6\bin\node.exe" .codex\multiplayer-server.js
```

然后让别人打开：

```text
http://你的电脑局域网IP:8125/
```

## 注意

- GitHub Pages 只能托管静态网页，不能单独承载 WebSocket 联机房间。
- 如果要让互联网上的朋友直接玩，需要把 `.codex/multiplayer-server.js` 这类 Node 服务部署到服务器，再开放对应网址。
- 当前版本是“房主权威”：房主负责推进现有 Engine，队员同步观看和提建议。这样能保留单机规则稳定性，也方便以后继续做隐藏身份、投票、个人角色卡。

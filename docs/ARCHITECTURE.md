# 架构说明 · Architecture

## 1. 设计目标

1. **一套核心，多端复用**：网页、Electron、Node 测试使用同一份求解/生成/构造逻辑。
2. **可直接离线打开**：不依赖打包器、服务器或 ES Module 的网络加载。
3. **人类逻辑可解释**：求解的每一步都携带结构化的落子/排除、图形高亮与多语文字。
4. **可测试、可回放**：技巧是纯函数；步骤是可序列化数据；UI 只负责展示与交互。

## 2. 分层

```text
┌─────────────────────────────────────────────────────────────┐
│ UI (src/ui)                                                 │
│  index.html · styles.css · app.js · i18n.js                 │
│  Play / Constructor / Solver · 键盘 · 计时 · 导入导出        │
└───────────────▲───────────────────────────────▲─────────────┘
                │                               │
┌───────────────┴───────────────┐  ┌────────────┴─────────────┐
│ Constructor (src/constructor) │  │ Generator (src/generator) │
│ analyze / toGame              │  │ unique dig + difficulty   │
└───────────────▲───────────────┘  └────────────▲─────────────┘
                │                               │
┌───────────────┴───────────────────────────────┴─────────────┐
│ Human Solver Engine (src/engine)                            │
│  index.js: 调度 · 应用步骤 · trace · 评级                    │
│  techniques/*.js: 19 个独立技巧                              │
│  core.js: 棋盘/候选/冲突/解计数/格式                          │
│  util.js: 单元标签/组合/去重/多语步骤引用                     │
└─────────────────────────────────────────────────────────────┘
```

Electron 主进程 `platforms/desktop/main.js` 创建窗口并加载 `.build/web/index.html`，不包含业务逻辑。

## 3. 为什么使用 UMD 经典脚本

浏览器从 `file://` 加载 ES Module 会触发 CORS 限制，无法满足“双击 `index.html` 离线运行”。因此：

- 每个模块使用 UMD 头：Node 下 `module.exports`，浏览器下挂到 `window.Sudoku`；
- `index.html` 按依赖顺序加载脚本；
- 同一个文件既可 `require()` 测试，也可被 Electron/网页直接使用；
- 不依赖模块打包器；同步脚本生成语言包、离线 Worker 和各平台共享资源。

对应测试 `test/i18n.test.js` 会检查脚本顺序、路径存在性与无外部 URL。

## 4. 数据模型

### 4.1 棋盘

- 长度 81 的扁平数组，行优先：`idx(r,c) = r*9+c`。
- 值：`0` 为空格，`1..9` 为数字。
- `UNITS`：27 个单元（9 行、9 列、9 宫），每个单元为 9 个 cell index。
- `PEERS[cell]`：同行/同列/同宫的 20 个 peer。

### 4.2 候选数

- 每个空格一个 9 位 bitmask：bit `(d-1)` 表示候选数 `d`。
- `ALL = 0b111111111 (0x1ff)`。
- 使用 `Uint16Array(81)` 存储，便于快速批量复制与比较。
- 初始候选 = `ALL & ~(peer 已用数字的 bit 并集)`。
- **候选状态是持久的**：一次排除不会被后续基础重新计算“复活”；落子时从 peers 中移除该数字。这样 trace 可被精确回放。

### 4.3 解计数

`core.countSolutions(values, limit)`：

- 先校验冲突；
- 维护行/列/宫的已用 bitmask；
- 每层选择候选数最少的空格（MRV）；
- 找到 `limit` 个解即提前返回。
- `limit=2` 用于唯一解验证与构造器多解判断。

## 5. 技巧接口

每个文件导出：

```js
{
  id: 'xWing',
  tier: 3,
  find(values, candidateMasks) -> step | null
}
```

`step` 契约：

```js
{
  technique: 'xWing',
  tier: 3,
  placements: [{ cell: 40, digit: 5 }],
  eliminations: [{ cell: 31, digit: 7 }],
  highlights: {
    primary: [/* 构成模式的格子 */],
    secondary: [/* 受影响的格子 */],
    cells: [/* 二者并集 */],
    candidates: [{ cell: 31, digit: 7, role: 'pattern'|'eliminate'|'place'|'color-a'|'color-b' }],
    units: [/* 27 个单元索引之一 */]
  },
  explain: { zh: '……', en: '……' },
  data: { /* 调试/测试用的结构信息 */ }
}
```

约束：

- 落子必须是当前存在的候选；
- 排除必须指向当前存在的候选；
- 若不能产生任何实际变化，返回 `null`（避免死循环）；
- 解释必须包含具体格子/数字/单元，不能是模板空话。

## 6. 调度与评级

`engine/index.js` 中固定检测顺序：

```text
nakedSingle → hiddenSingle
→ lockedCandidatesPointing → lockedCandidatesClaiming → nakedPair → hiddenPair
→ nakedTriple → hiddenTriple → xWing → swordfish → skyscraper
→ yWing → xyzWing → twoStringKite
→ jellyfish → uniqueRectangle → simpleColouring → wWing → xyChain
```

每次只取**第一个**能推进的步骤，应用后继续。

- `solveHuman` 返回：
  - `solved` / `stalled` / `contradiction`
  - `steps[]`（完整 trace）
  - `counts`、`tierCounts`、`maxTier`
  - `difficulty`：`maxTier <= 1 → easy`、`2–3 → medium`、`4 → hard`
  - `initial`（values + candidates）供 UI 回放
- `applyStep` 不修改入参；返回新 values/candidates。
- `stateAfter(initial, steps, n)` 与 UI 滑杆跳转、测试回放共用。

### 死循环防护

- 技巧必须产生实际变化；
- `solveHuman` 最多 2000 步；
- `applyStep` 若导致某格候选为空，标记 `contradiction`。

## 7. 生成器

`generator/index.js`：

1. `randomSolution(rng)`：随机数字顺序的回溯终盘。
2. `dig(solution, targetClues, rng)`：随机顺序挖洞，每次以 `countSolutions(..., 2) === 1` 验证；失败回填。
3. `solveHuman` 完整求解，得到 `maxTier`。
4. `accepts(difficulty, rating)` 按档位过滤。

搜索预算：

- `maxAttempts` 与 `timeLimitMs` 双上限，默认 900 次 / 15 秒（实测三档通常 8–200 ms）。
- 找到即返回；失败时返回 `ok: false` 及最后一次候选，UI 保留旧局并提示重试。

难度档位与目标挖洞区间（仅作为搜索起点，不用于难度判定）：

| 难度 | 目标已知数 |
|------|-----------|
| easy | 38–44 |
| medium | 29–34 |
| hard | 23–28 |

## 8. 构造器

`constructor.analyze(input)` 返回：

```js
{ status: 'invalid' | 'conflict' | 'none' | 'multiple' | 'unique',
  conflicts, count, solution, values, emptyCount }
```

- 先做格式/冲突检查；
- 去重后 `countSolutions(..., 2)`：
  - 0 → 无解
  - 2 → 多解
  - 1 → 唯一解，并 `solve` 取答案
- UI 仅当 `unique` 时启用“开始游戏”。

## 9. 网页 UI

`src/ui/app.js` 是唯一的状态与交互控制器，分成三块独立状态机：

### Play

状态：`values / given / notes / solutionValues / selected / notesMode / errorMode / checked / history / hintStep / meta / timer`。

- 候选模式输入 bitmask；
- 错误显示模式：
  - `immediate`：任何与答案不一致的非给定格即时标红；
  - `check`：点击“检查”后标红；
  - `off`：不主动显示错误；
  - 行列宫冲突在非 off 模式下始终可显示。
- 完成：全部 81 格填满且合法（唯一解题目即等于答案）。
- 提示：`engine.findNextStep` 从当前局面找下一步，高亮并允许“应用提示”。

### Constructor

- 值输入 + 手动候选标记；
- 130 ms debounce 后同步分析（计数很快，无需 Worker）；
- 冲突格实时标红；
- 唯一解时显示可用难度/最高技巧，可一键转入 Play。

### Solver

- 启动时校验题目并生成完整 trace；
- 预计算每个前缀的 values/candidates（`states[0..n]`）；
- `index` 表示“已应用多少步”：
  - `index < n`：显示第 `index+1` 步之前的局面 + 该步高亮/解释；
  - `index === n`：显示最终局面；
- 支持上一步、下一步、滑杆跳转、步骤列表、自动播放。

## 10. 国际化（V11）

- 语言包唯一来源：`src/locales/zh-CN.json`、`zh-Hant.json`、`en.json`、`ja.json`、`fr.json`、`es.json`。
- 离线 bundle：`scripts/build-locales.js` → `src/ui/locales-data.js`。
- 全局工具：`t(key, vars)`、`setLang()`、`languages()`、`explain(step)`。
- 静态文案：`data-i18n*` 属性 + `i18n.apply(document)`。
- 技巧解释：引擎输出 `explainKey + explainVars`（cell/unit/digits/cands 等语言中立引用），由 `i18n.explain()` 从语言包生成句子。
- 语言选择：Web/Windows/Android/iOS 使用顶栏下拉；微信使用原生 picker；切换即时重绘所有面板并持久化。
- 切换语言时更新 `<html lang>`、静态文案、动态状态、技巧名、步骤说明、回放/统计、主题名称、日期格式和胜利用语。
- 测试检查 6 份语言包 key/占位符一致、生成 bundle 一致、19 技巧说明在 6 语言下非空且无残留占位符，并禁止 UI 源文件硬编码 CJK 文案。

## 11. 桌面端

- `platforms/desktop/main.js`：`BrowserWindow` + `loadFile(.build/web/index.html)`。
- 安全：`contextIsolation`、`sandbox`、`nodeIntegration:false`，禁止导航/弹窗。
- electron-builder 将 `.build/web/` 和 `platforms/desktop/main.js` 打包进 `app.asar`；核心代码只有一份。
- Windows 目标：`nsis`（安装版）与 `portable`（便携版），x64。

## 12. 性能

实测（本机 Node 22 / x64）：

- 完整求解简单题：~2 ms；
- 完整求解困难题：~8 ms（含高级技巧扫描）；
- 三档题目生成：常见 < 150 ms，最坏受时间预算限制；
- 构造器计数：毫秒级；空白棋盘因 `limit=2` 立即返回“多解”。

UI 的画板渲染为 81 个 DOM 节点 + 每格 9 个候选 span，单次重绘不引入虚拟 DOM 开销。生成过程在按钮点击后通过 `setTimeout` 让加载态先绘制，避免用户看不到反馈。

## 13. 多端共享架构

```text
                         src/ (唯一核心源)
             engine · generator · constructor · i18n
                 │            │               │
        ┌────────┘            │               └────────────┐
        ▼                     ▼                            ▼
  完整 Web 应用         微信小程序核心包               WebView 完整应用
 index.html/styles/src   shared/ (字节级复制)       www / Android assets / iOS public
        │                     │                            │
 ┌──────┼──────────┐          ▼                 ┌──────────┼──────────┐
 ▼      ▼          ▼      WXML/WXSS UI          ▼          ▼          ▼
Web  Electron  Android   (小程序页面)         Capacitor   Android   Electron
              / iOS 共用                    iOS 模拟器   WebView
```

- `scripts/sync-platforms.js` 是唯一的生成入口。
- 生成副本带 `GENERATED_FROM.json`（SHA-256 清单）。
- 微信小程序 UI 使用原生 WXML/WXSS，但页面逻辑只负责视图状态与微信 API；算法全部来自 `shared/`。
- Android / iOS 直接包装完整 Web 应用，因此功能与网页版天然一致。
- `test/wechat.test.js` 与 `test/mobile.test.js` 校验生成副本与 `src/` 字节一致，防止“多端重复实现核心算法”。

### Android 壳

- `MainActivity`：WebView、JS、DOM Storage、本地文件、系统栏 insets、返回键与生命周期。
- `syncWebAssets` Gradle 任务每次构建把 `.build/web/` 复制到 `assets/www`。
- 无 INTERNET 权限；不加载网络 URL。

### iOS 壳

- Capacitor 8.5.3 + Swift Package Manager。
- Xcode target `App`，共享 Scheme `App`，iOS 15+。
- Web 资源位于 `platforms/ios/App/App/public/`，由同一同步脚本生成。
- 仅要求模拟器，不需要代码签名证书或 ipa。

## 14. 回放、统计与主题（V10）

### 14.1 操作回放

共享模块 `src/replay/index.js`：

- `createRecording`：保存题面、答案、难度、初始 values/notes 与开始时间。
- `recordAction`：每次玩家操作后保存完整 values/notes 快照，类型包括：
  `value / erase / notes / undo / hint / reveal`。
- `snapshotAt`：步骤 0 为初始局面，步骤 i 为第 i 个操作后的局面。
- `markEnded`：完成/显示答案/放弃时写入状态和时长。
- 历史上限 12 局，每局 800 个动作；数据以 JSON 保存到各端本地存储。

网页与小程序共用该数据结构，仅存储适配器不同：

```text
Web/Windows/Android/iOS: localStorage
WeChat:                  wx.setStorageSync
```

回放面板支持播放/暂停、上一步/下一步、滑杆跳转和步骤列表；初始局面与每个操作后的候选标记都可还原。

### 14.2 本地统计

共享模块 `src/stats/index.js`：

```js
{
  completed, totalMs, bestMs,
  byDifficulty: { easy: {...}, medium: {...}, hard: {...} },
  recent: [{ difficulty, timeMs, completedAt }]
}
```

- 仅在真正完成一局时记录（显示答案不计入完成统计）。
- 每次完成写入总数、总时长、最快、难度分桶和最近完成。
- `summary()` 计算平均用时并生成 UI 所需数据。
- 统计面板多语展示，支持本地重置。

### 14.3 三套主题

主题由 `data-theme`（网页）/ `.theme-*` class（小程序）驱动：

| 主题 | 网页 `data-theme` | 小程序 class | 默认 |
|------|-------------------|--------------|------|
| 浅色 | `light` | `theme-light` | 是 |
| 深色 | `dark` | `theme-dark` | 否 |
| 护眼 | `eye` | `theme-eye` | 否 |

- 网页通过 CSS 自定义属性覆盖棋盘、卡片、按钮、候选、回放和统计面板样式。
- 小程序 WXSS 同样使用 CSS 变量；`cycleTheme` 同时更新导航栏颜色并写入本地存储。
- 切换主题不修改语言状态；切换语言不修改主题状态。

### 14.4 存储键

```text
sudoku.lang
sudoku.theme
sudoku.replay.current.v1
sudoku.replay.history.v1
sudoku.stats.v1
```

所有端独立存储，不访问后端。

## 15. 拍照/相册识别导入（V12）

- **入口**：`index.html` 的 `#ocrDialog` + `src/ui/ocr.js`；微信为 `pages/index/index.wxml` 的 `ocr` 弹窗。
- **几何内核**：`src/ocr/index.js`（纯 JS，UMD）：
  - 连通域定位棋盘线网络；
  - 四边包络线最小二乘拟合 + 交点求四角；
  - 单应性变换（`squareToQuad`）矫正旋转/透视；
  - 81 格裁切、对比度拉伸、合成图；
  - 字符框映射、81 格合法性校验。
- **识别后端**：可插拔的 `backend.recognize(composite)`：
  - Web/Windows/Android/iOS：Tesseract.js 7 + 单文件 LSTM WASM + 内嵌 `eng` 数据，完全离线；
  - 微信：`src/ocr/classifier.js` 模板分类器（16×16 墨迹 + 孔洞特征），离线运行。
- **接入**：识别结果经构造器 `analyze(..., {rate:true})` 校验；唯一解时调用与文本导入相同的 `loadGame`，因此提示、求解、回放、统计、主题自动一致。
- **资源同步**：`web/assets/vendor/tesseract/` 由 `scripts/sync-platforms.js` 复制到 `www`、Android assets、iOS public；`src/ocr/` 复制到微信 `shared/ocr/`。
- 详见 `docs/OCR.md`。

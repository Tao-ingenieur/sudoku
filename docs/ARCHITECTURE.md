# 架构说明

## 源码分层

| 目录 | 职责 |
| --- | --- |
| `web/` | HTML 入口、样式和离线 OCR 资源输入 |
| `src/engine/` | 棋盘、候选、解计数、人类逻辑求解与 19 种技巧 |
| `src/generator/` | 随机终盘、唯一解挖洞、按技巧等级筛选题目 |
| `src/constructor/` | 格式、冲突、解数量分析和转入游戏 |
| `src/ocr/` | 棋盘定位、透视矫正、切格、识别结果校验和模板分类器 |
| `src/replay/`、`src/stats/` | 操作快照、回放和完成统计 |
| `src/ui/`、`src/locales/` | Web 交互、相机/相册、翻译工具和六语文案 |
| `platforms/` | Electron、Android、iOS 和微信平台适配 |
| `config/`、`scripts/` | 构建配置、同步、测试、发布和校验 |

模块使用经典 UMD 脚本，Node 下通过 `require()` 测试，浏览器中挂到 `Sudoku` 命名空间。
`web/index.html` 按依赖顺序加载 `../src/`，无需浏览器 ES Module 加载。

## 数据和求解接口

棋盘为长度 81 的行优先数组，`0` 表示空格，`1..9` 表示数字。
候选数字用 9 位 bitmask 表示；单元共 27 个，每格有 20 个同行、同列或同宫邻格。
`countSolutions(values, 2)` 用于区分无解、唯一解和多解。

技巧模块提供 `id`、`tier`、`find(values, candidates)`，无有效动作时返回 `null`。
步骤记录 `placements`、`eliminations`、`highlights`、`explainKey` 和 `explainVars`。
解释由语言包生成，不在技巧模块中保存中英文句子。

调度顺序由 `src/engine/index.js` 的 `ORDER` 定义；每次应用第一个能推进的步骤。
`applyStep` 返回新状态并保留已做过的候选排除；`stateAfter` 用于恢复步骤对应的局面。
`solveHuman` 返回 `solved`、`stalled`、`contradiction` 等布尔状态、步骤、技巧计数、
最高等级、难度、初始和最终状态。默认最多 2000 步，未解出时不使用猜测代替逻辑步骤。

生成器先生成终盘，再逐格挖洞并验证唯一解，最后用人类求解器评级。
简单为最高 Tier 1，中等为 Tier 2–3，困难为 Tier 4；只有完整逻辑解出且评级匹配才接受。
默认搜索预算为 600 次尝试或 15 秒，失败时返回 `ok: false`。具体配置见
`src/generator/index.js`，技巧原理见 [TECHNIQUES.md](TECHNIQUES.md)。

## 多平台资源生成

`scripts/sync-platforms.js` 先生成语言包与 OCR 数据，再同步资源：

| 生成位置 | 内容与使用方 |
| --- | --- |
| `src/ui/locales-data.js` | 从 `src/locales/*.json` 生成的离线翻译包 |
| `web/assets/vendor/tesseract/eng-data.js` | 从压缩英语训练数据生成的内嵌语言数据 |
| `web/assets/vendor/tesseract/worker-bundle.js` | 原始 Worker 与 WASM 引导脚本的离线容器 |
| `.build/web/` | 完整离线网页；Electron 和发布流程使用 |
| `platforms/android/app/src/main/assets/www/` | Android WebView 资源 |
| `platforms/ios/App/App/public/` | Capacitor/WKWebView 资源 |
| `platforms/wechat/shared/` | 从 `src/` 复制的核心模块、OCR 几何与翻译模块 |

生成文件不提交 Git。发布 HTML 会把 `../src/` 引用改成包内 `src/` 引用。
校验命令逐文件比较生成内容；发布目录的统一哈希清单位于
`../dist/metadata/SHA256SUMS.txt`，不再为每个资源目录生成独立 JSON 清单。

## 平台适配

- Electron 主进程 `platforms/desktop/main.js` 加载 `.build/web/index.html`，启用
  上下文隔离和沙箱，关闭 Node 集成，限制导航及弹窗，并允许相机所需权限。
- Android 使用 `MainActivity` 中的 WebView，处理相机权限与文件选择；Gradle 从
  `.build/web/` 同步资源。Manifest 不申请 INTERNET 权限。
- iOS 使用 Capacitor、SwiftPM 和 Xcode App Scheme，Web 资源位于 `public/`。
  交付的是工程，编译和模拟器运行需要 macOS/Xcode。
- 微信使用原生 WXML/WXSS 界面，通过 `shared/` 复用数独核心；平台 API 在页面层适配。

Web、Electron、Android、iOS 共用 Web UI，微信单独实现视图层。
OCR 中前四者使用离线 Tesseract，微信使用模板分类器，详见 [OCR.md](OCR.md)。

## 本地状态

回放记录初始局面及每次操作后的 values/notes 快照；统计只记录真正完成的游戏，
显示答案不计入成功完成。主题和语言各自保存，不相互覆盖。

Web、Electron、Android、iOS 使用各自的 `localStorage`，微信使用 `wx.setStorageSync`。
存储键包括 `sudoku.lang`、`sudoku.theme`、`sudoku.replay.current.v1`、
`sudoku.replay.history.v1` 和 `sudoku.stats.v1`。各端数据独立，不通过后端同步。

构建及发布流程见 [BUILD.md](BUILD.md)，自动化覆盖和设备验收见 [TESTING.md](TESTING.md)。

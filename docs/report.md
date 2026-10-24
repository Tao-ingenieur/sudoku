> 历史开发报告，保留功能演进信息。本次导入的是源码快照，不含历史 Git 提交及标签；当前目录和构建方式以 [BUILD.md](BUILD.md) 为准。

# 教学型数独项目开发总结报告

## 1. 项目概述

本项目不是从零新建，而是在给定的 v1.1 数独代码仓库基础上迭代开发。仓库保留了 v0.0.0（手动填数）、v1.0.0（自动出题与唯一解校验）、v1.1.0（收敛为单文件网页版）的历史标签，后续 V2–V11 均在此基础上演进。

项目定位为**教学型数独**：不仅给出答案，还要像人一样逐步推理，告诉学习者“这一步用了什么方法、为什么可以这样填/删候选数”，并支持回放、统计和多语言学习。

目标功能包括：基础游玩、唯一解出题、技巧分级难度、19 种人类解题技巧、分步讲解与回放、题目构造与合法性校验、文本与拍照两种导入方式、操作回放、本地统计、三套主题、六语言界面，以及网页、Windows、微信小程序、Android、iOS 模拟器五个平台。

支持平台清单：

| 平台 | 形态 |
|------|------|
| Web | 可直接双击打开的静态网页 |
| Windows | Electron 安装版 + 便携版 exe |
| 微信小程序 | 原生 WXML/WXSS/JS 工程 |
| Android | WebView 外壳 + debug APK |
| iOS 模拟器 | Capacitor 8.5.3 + SwiftPM 的 Xcode 工程 |

> 说明：任务模板中提到“Tauri 桌面”，实际实现使用的是 **Electron 45 + electron-builder**；模板中的“中英双语”在 V11 已升级为**六语言**。本报告按仓库中的真实实现描述。

## 2. 最终交付物清单

### 2.1 源码与共享模块

- 项目根目录：`index.html`、`styles.css`、`package.json`、`package-lock.json`、`capacitor.config.json`、`README.md`、`README.en.md`、`LICENSE`。
- `src/engine/`：`core.js`、`index.js`、`util.js`，以及 `techniques/` 下 19 个技巧模块：
  `nakedSingle`、`hiddenSingle`、`nakedPair`、`hiddenPair`、`nakedTriple`、`hiddenTriple`、`lockedCandidatesPointing`、`lockedCandidatesClaiming`、`xWing`、`swordfish`、`jellyfish`、`yWing`、`xyzWing`、`skyscraper`、`twoStringKite`、`uniqueRectangle`、`simpleColouring`、`wWing`、`xyChain`。
- `src/generator/`：唯一解题目生成器。
- `src/constructor/`：构造器四态分析（冲突、无解、多解、唯一解）。
- `src/replay/`：操作录制、快照与回放模型。
- `src/stats/`：本地统计模型。
- `src/ui/`：`app.js`、`i18n.js`、`locales-data.js`（由脚本生成）、`ocr.js`（相机/相册与识别进度 UI）。
- `src/ocr/`：`index.js`（棋盘定位、透视矫正、切格、81 格校验）、`classifier.js`（离线模板数字分类）、`templates.js`（14 种字体的 16×16 模板）。
- `web/assets/vendor/tesseract/`：Tesseract 7 运行时、单文件 LSTM WASM、内嵌 `eng` 训练数据。
- `src/locales/`：`zh-CN.json`、`zh-Hant.json`、`en.json`、`ja.json`、`fr.json`、`es.json` 及 `README.md`。
- `scripts/`：`build-locales.js`（语言包构建与一致性校验）、`sync-platforms.js`（跨平台同步与 SHA-256 校验）。
- `test/`：`core.test.js`、`engine.test.js`、`techniques.test.js`、`generator.test.js`、`constructor.test.js`、`features.test.js`、`ui-features.test.js`、`wechat.test.js`、`mobile.test.js`、`i18n.test.js`、`ocr.test.js`，以及 `test/fixtures/` 的三张识别图片。
- `www/`：同步生成的 Web 发布目录（供 Android/iOS 复用）。

### 2.2 各平台工程

- Windows：`desktop/main.js`、`desktop/build/`，由 electron-builder 打包。
- 微信小程序：`platforms/wechat/`，含 `app.js`、`app.json`、`app.wxss`、`pages/index/`、`shared/`、`utils/`、`project.config.json`、`sitemap.json`。
- Android：`android/`，含 Gradle 工程、`app/src/main/java/com/sudokuacademy/app/MainActivity.java`、WebView 资源 `app/src/main/assets/www/`、图标与清单。
- iOS：`ios/App/App.xcodeproj`、`AppDelegate.swift`、`SceneDelegate.swift`、`public/` 静态资源、Capacitor 配置。仅模拟器目标，不产出 ipa。

### 2.3 打包产物

| 产物 | 大小 | SHA-256 |
|------|------|---------|
| `../dist/windows/Sudoku-Academy-Setup-12.0.0.exe` | 110 MB | `e4dda580566bf6b2014610b2414a870e167764702ebfd636de44c592c9b75365` |
| `../dist/windows/Sudoku-Academy-Portable-12.0.0.exe` | 110 MB | `fbbed8397845cee5088eece224f21315a960dc852a12e25b99f1830c226b76f0` |
| `../dist/android/SudokuAcademy-debug.apk` | 3.8 MB | `8eb2401524c1901731787f4dbf126c963b20913a84652753e194af74ec76837b` |

- `release/SHA256SUMS.txt` 汇总以上哈希，可执行 `sha256sum -c release/SHA256SUMS.txt` 校验。
- `release/` 被 gitignore，二进制保留在交付工作区中，不随 git 提交。
- 分平台输出位于 `../dist/`，可直接按目录下载。

### 2.4 文档

`docs/ARCHITECTURE.md`、`docs/TECHNIQUES.md`、`docs/I18N.md`、`docs/OCR.md`、`docs/BUILD.md`、`docs/PLATFORMS.md`、`docs/TESTING.md`、`docs/RELEASE.md`、`docs/report.md`，以及各平台 README 和 `android/APK_DOWNLOAD.md`。

### 2.5 Git 标签清单

`v0.0.0`、`v1.0.0`、`v1.1.0`、`v2.0.0`、`v2.1.0`、`v3.0.0`、`v7.0.0`、`v8.0.0`、`v9.0.0`、`v10.0.0`、`v11.0.0`、`v12.0.0`。

仓库中没有 v4–v6 标签；按任务指定的平台版本号，微信、Android、iOS 分别使用 v7/v8/v9。

### 2.6 验收方式与限制

- **Web**：`file://` 直接打开或本地静态服务器；自动化测试 + 浏览器手工检查。
- **Windows**：直接运行安装版或便携版；未做代码签名，SmartScreen 可能提示未知发布者。
- **微信小程序**：微信开发者工具导入 `platforms/wechat/`；当前 `project.config.json` 使用 `touristappid`，游客模式可本地预览，但真机预览、上传体验版等需替换为自己的 AppID。无需服务器域名。
- **Android**：APK 使用 debug 签名，可侧载安装；未提供应用商店签名包。
- **iOS**：仅模拟器工程，必须在 macOS + Xcode 中打开运行，不生成 ipa、不做真机签名；模拟器无摄像头，OCR 只能从相册选择图片验收。

## 3. 已实现功能清单

### 3.1 基础游玩

- 三档难度出题（简单/中等/困难），基于人类技巧层级评级，而不是仅看空格数。
- 键盘与触摸输入、数字键盘、候选数（笔记）模式、擦除、撤销、重开。
- 即时/手动错误提示模式、检查进度、提示下一步、揭示答案。
- 计时与暂停、线索数/已填数/笔记数展示、完成弹窗。
- 题目导入/导出：支持字符串导入，复制题目、当前盘面或答案。

### 3.2 构造出题

- 在盘面上自行录入线索，实时分析并显示线索数与空格数。
- 四态校验：行列宫冲突、无解、多解、唯一解；冲突时指出冲突格。
- 唯一解时显示技巧难度与等级，可直接开始游戏。
- 构造器支持笔记、擦除、清空、示例题目、导入/导出。

### 3.3 逐步求解引擎

- 19 种人类技巧，按 4 个层级排序检测：基础单数、候选数对/组、锁定候选、鱼/翼/链/唯一矩形/着色等。
- 每步给出落数或候选删除、技巧名称、等级、详细解释和盘面高亮。
- 求解页支持上一步/下一步、拖动进度、自动播放、步骤列表与技巧使用统计。
- 求解前进行冲突/多解/无解分析，并明确提示；无法用已实现技巧推进时如实显示“卡住”，不伪造解决。
- 所有步骤的经验证：落数与真实解一致，删除的候选数绝不属于真实解。

### 3.4 多语言

- V2.1 首先实现中英双语界面与双语技巧讲解；V11 升级为六语言：简体中文、繁體中文、English、日本語、Français、Español。
- 全局语言下拉，切换后界面、技巧名/说明、提示、统计、回放、主题名与对话框即时更新，无需刷新。
- 六语言均使用统一数独术语；语言选择持久化，下次启动自动恢复。

### 3.5 拍照/相册识别导入（V12）

- 游玩页「导入/导出」内新增「拍照识别导入」，与 81 字符文本导入并存。
- 支持实时相机与相册图片；H5 相机被拒绝时自动降级为文件选择。
- 自动定位棋盘、矫正旋转/透视、切成 81 格并识别数字。
- 识别结果与文本导入走同一条校验路径：冲突、无解、多解、唯一解；只有唯一解进入对局。
- 六语言提示覆盖入口、拍摄引导、进度、失败原因与成功提示。
- 网页/Windows/Android/iOS 使用 Tesseract WASM 离线识别；微信使用同几何内核 + 纯 JS 模板分类器，同样离线。
- 详细平台边界见 `docs/OCR.md`。

### 3.6 新增扩展功能

- **操作回放**：记录落数、擦除、笔记、撤销、提示、揭示等操作，存为快照序列；支持播放/暂停、上一步/下一步、拖动定位、动作列表跳转，并在本地保存当前回放与最近 12 条历史记录。完成、揭示或换题时归档。
- **本地统计**：统计总完成数、各难度完成数、最快用时、平均用时，以及最近 30 条完成记录；使用本地存储持久化，可一键重置。
- **主题切换**：明亮、暗色、护眼三套主题，Web、Windows、微信、Android、iOS 均可用；选择本地保存。
- **跨端一致**：以上能力在五个平台均实现，Web 与微信分别使用各自的存储 API，但共享同一套数据模型。

## 4. 版本迭代过程与 Git 记录

| 标签 | 提交 | 核心变更 |
|------|------|----------|
| `v0.0.0` | `0aea712` | 数独格子渲染、手动填数、行列宫冲突校验。 |
| `v1.0.0` | `93da770` | 随机终盘生成、挖洞并做唯一解验证；加入难度与答案显示。 |
| `v1.1.0` | `706add2` | 收敛为单一 `index.html` 的基线版本，融合手填校验与自动出题。 |
| `v2.0.0` | `c22fdd3` | 分层工程化：拆分引擎/生成器/构造器/UI；实现 19 种人类技巧、技巧等级难度与整套 Node 测试（32 个文件）。 |
| `v2.1.0` | `553a329` | 中英双语网页界面、候选数标记、构造器联动；新增 i18n 测试。 |
| `v3.0.0` | `e4e6624` | 逐步求解回放、Electron Windows 安装版与便携版、完整文档与截图。 |
| `v7.0.0` | `f033d00` | 微信小程序原生界面，复制共享核心/生成器/i18n，加入 wx 存储与小程序测试。 |
| `v8.0.0` | `92e0485` | Android Gradle 工程与 WebView 外壳，产出可侧载 debug APK。 |
| `v9.0.0` | `a1613f3` | Capacitor + SwiftPM 的 iOS 模拟器工程，统一各端生成资源并做哈希核对。 |
| — | `3549a93` | 修复工作区导出过滤 `.apk` 的问题，增加 ZIP 与 Base64 下载兼容包。 |
| `v10.0.0` | `5dbb6e2` | 全端操作回放、本地做题统计、明亮/暗色/护眼三主题；新增 replay/stats 模块与测试。 |
| `v11.0.0` | `99d1345` | 六语言 i18n 重构：JSON 语言包为唯一来源、结构化技巧讲解、全平台同步，重建 Windows/Android 产物并补充校验与报告。 |
| `v12.0.0` | `5686b0c` | 全端拍照/相册 OCR 导入：棋盘定位与透视矫正、Tesseract WASM 离线识别、微信模板分类器、81 格校验、六语 OCR 文案，重建 Windows/Android 产物。 |

演进思路：

- **重构**：v1.1 单文件 → v2.0 分层模块；v2.1 的硬编码中英文 → v11 的 JSON 语言包 + 全局翻译器；重复的平台资源 → 单一源码加同步脚本。
- **新增能力**：v1.0 唯一解出题、v2.0 技巧体系、v3.0 分步回放与桌面端、v7–v9 三端平台、v10 操作回放/统计/主题、v11 六语言、v12 全端离线拍照识别。
- 版本号按交付阶段划分；v4–v6 未单独打标签，平台版本直接对应 v7/v8/v9。

## 5. 核心设计方案

### 5.1 架构设计

- 核心计算与 UI 分离：`core`（解析、候选数、行列宫、冲突、求解）、`generator`、`constructor`、`techniques`、`replay`、`stats`、`i18n` 均为 UMD 模块，可在浏览器、Node、微信和 WebView 中使用。
- 各端 UI 独立适配：Web 直接操作 DOM；微信使用原生 WXML/WXSS 与 `Page` 生命周期；Android/iOS 复用同一份 Web UI，由原生外壳加载；Windows 用 Electron 加载同一网页。
- 单一源码：`scripts/sync-platforms.js` 把 `www/` 复制到 Android 与 iOS 资源目录，把共享核心复制到 `platforms/wechat/shared/`，并校验 SHA-256；测试会阻止平台副本与源码不一致。
- 技巧检测按层级顺序执行，统一返回 `{technique, tier, placements, eliminations, highlights, explainKey, explainVars}`，UI 与快捷提示共用同一份结果。

### 5.2 数据方案

- 存储位置：Web/Windows/Android/iOS 使用 `localStorage`；微信使用 `wx.setStorageSync/getStorageSync`。
- 统计键：`sudoku.stats.v1`，包含总完成数、总用时、最佳用时、三档难度分桶（完成数/总用时/最佳）和最近 30 条记录；读取时做容错归一化。
- 回放键：`sudoku.replay.current.v1` 与 `sudoku.replay.history.v1`；每条记录含题目、初始盘面、操作序列、每步快照、状态（完成/揭示/放弃）、用时与时间戳；历史最多 12 条。
- 界面偏好：`sudoku.theme` 与 `sudoku.lang` 分别保存主题和语言。
- 数据只存本机，不做账号、云同步或跨设备迁移。

### 5.3 多语言方案

- `src/locales/<code>.json` 是唯一文案来源，每包 338 个键，覆盖按钮、提示、对话框、技巧名称/描述、统计、回放、主题与语言名。
- `scripts/build-locales.js` 校验六个语言包的键集合与占位符集合完全一致，生成 `src/ui/locales-data.js`；选择生成 JS 而不是运行时 fetch JSON，是为了支持 `file://` 离线打开和微信小程序。
- `src/ui/i18n.js` 暴露 `t()`、`explain()`、`setLang()`、`getLang()`、`onChange()`，以及单元格/列表/单位/日期等格式化函数。
- 技巧算法不保存任何自然语言句子，只保存 `explainKey` 与结构化引用（格、候选数、数字、行/列/宫、链）；`i18n.explain()` 在渲染时按当前语言和列表语法组装文本。
- 语言切换即时生效；Web/Windows 使用原生下拉，微信使用原生 picker，均写入本地存储。日语、法语、西班牙语使用各自习惯的单位词与列表分隔符。

### 5.4 拍照识别方案（V12）

- **几何内核** `src/ocr/index.js`：灰度/二值化 → 连通域找棋盘线网络 → 四边包络线拟合求交点 → 单应性变换 → 81 格裁切与合成图 → 字符框映射 → 合法性校验。旋转与透视都在同一套流程中处理。
- **识别后端**可插拔：浏览器/WebView 使用 Tesseract.js 7 + 单文件 LSTM WASM + 内嵌 `eng` 数据；微信使用纯 JS 模板分类器（16×16 墨迹 + 孔洞特征）。两者都完全离线。
- **离线适配**：训练数据以 `{code,data}` 直接交给 Worker，避免 `file://` 下的 fetch；`worker.min.js` 增加 `code` 字段兼容。首次识别才懒加载，失败自动降级到模板分类器。
- **一致性**：识别成功后调用与文本导入相同的 `loadGame`，因此提示、逐步求解、回放、统计、主题完全一致；构造器负责唯一解校验。
- 平台边界、资源维护与限制见 `docs/OCR.md`。

### 5.5 跨平台策略

- **Web**：经典 `<script>` UMD 加载，无构建依赖，双击即可离线运行。
- **Windows**：Electron 45 外壳，electron-builder 产出 NSIS 安装版与便携版；复用 Web UI。
- **微信小程序**：原生视图层，不能直接运行 DOM 页面，因此重写 WXML/WXSS/JS 页面，共享引擎、生成器、构造器、回放、统计和 i18n。
- **Android**：原生 `Activity` + `WebView` 加载打包进 assets 的 Web 应用；启用网络外的本地资源，无后端依赖。
- **iOS**：Capacitor 8.5.3 + SwiftPM 生成 Xcode 工程，WKWebView 加载 `public/` 下的同一份 Web 应用；仅针对模拟器。

## 6. 测试与自验证情况

### 6.1 自动化测试

`npm test` 共 77 个测试，全部通过，覆盖：

- **核心求解**：解析、候选数、冲突检测、回溯求解、终盘合法性。
- **生成器**：随机出题后验证唯一解，多组随机种子回归。
- **19 种技巧**：每种技巧用构造盘面验证必定命中；删除项必须是活跃候选，落数必须是活跃候选；真实题目的每一步落数/删除项必须与真实解一致。
- **讲解完整性**：每个技巧步骤在六种语言下都能渲染出非空解释，且无未替换的 `{placeholder}`。
- **构造器**：冲突、无解、多解、唯一解四种状态。
- **引擎**：分步应用、状态回放、卡住位置不谎报求解、非法/冲突盘面处理、技巧层级限制。
- **扩展功能**：回放快照与动作计数、统计累计与归一化、主题与语言偏好。
- **UI 静态检查**：页面元素、事件绑定、WXML 标签平衡、微信 Page/wx 模拟。
- **跨端一致性**：`node scripts/sync-platforms.js check` 对 Web/微信/Android/iOS 共享文件做 SHA-256 比对。
- **OCR**：正拍/旋转/透视三张图片端到端识别必须完全一致；无棋盘、重复线索、线索不足等边界；字符框映射；离线资源与 Worker 补丁；微信/网页入口检查。

### 6.2 人工/静态验证

- Web：多语言切换、求解讲解、构造器四态、回放播放/拖动、统计累计、三主题切换均做了浏览器手工验证。
- Windows：检查 NSIS 负载与 `app.asar` 中包含语言包和扩展模块。
- Android：`aapt`/`apksigner` 校验包结构、版本号与 debug 签名；确认 assets 含最新语言包。
- iOS：检查 pbxproj、Scheme、SPM 依赖、public 资源与 12.0.0 版本号；环境无 Xcode，未做编译。
- 微信：Node 模拟 `Page`/`wx` 测试通过，WXML/WXSS/语言选择器/OCR 入口静态检查通过；环境无微信开发者工具，未做 IDE 预览。
- OCR：`node scripts/verify-ocr-browser.js` 用 Chromium 以 `file://` 打开真实页面，上传透视图片，断言棋盘与预期题面一致且未降级。

### 6.3 发现并修复的问题

- 播放/统计面板最初误嵌在求解区，导致排版和切换异常，已调整 DOM 层级。
- 回放页默认选中空记录，已改为优先选择有操作的历史。
- Web 缺少可见的擦除按钮，已补齐。
- 语言切换曾出现递归触发和只刷新部分文案，已改为单向 `apply`/`onChange` 流程。
- 多语言测试初期因平台副本未重建而失败，已把 `build:locales` + `sync-platforms` 纳入构建流程。
- 法语/西班牙语单位冠词、日语术语、页脚版本等译文问题已逐项修正。
- Android 构建缺少 `BuildConfig`，已在 Gradle 中开启 `buildConfig`。
- 工作区导出工具过滤 `.apk`，已提供 ZIP 与 Base64 兼容包。

### 6.4 未完成的验证

没有在本 Linux 容器中完成 iOS 模拟器启动、Android 模拟器/真机运行、微信开发者工具预览和 Windows 实机启动；这些需要 macOS/Xcode、KVM 或对应用工具，报告中不作“已运行”声明。

## 7. 各平台运行指引

### 7.1 OCR 使用（通用）

游玩页侧栏直接点「拍照识别导入」（也可从「导入/导出」进入）→ 打开相机或从相册选择。让棋盘占满画面、保持端正和光线均匀；识别完成后请核对盘面。失败会显示具体原因，可直接重试。

### 7.2 网页

```bash
cd /mnt/tos/workspace/sudoku
python3 -m http.server 8080
# 浏览器打开 http://localhost:8080/
```

也可直接双击 `index.html`。所有脚本为本地经典脚本，不依赖服务器接口。修改 `src/locales/*.json` 后执行 `npm run build:locales`。

### 7.3 Windows

- 安装版：运行 `../dist/windows/Sudoku-Academy-Setup-12.0.0.exe`，按向导安装。
- 便携版：直接运行 `../dist/windows/Sudoku-Academy-Portable-12.0.0.exe`，无需安装。
- 系统要求：Windows 10/11 x64。未签名，可能出现 SmartScreen 提示。
- 拍照识别：有摄像头时用「打开相机」，也可用「从相册选择」；Electron 已放行 media/camera 权限。

### 7.4 微信小程序

1. 打开微信开发者工具，选择“导入项目”。
2. 目录选择 `platforms/wechat/`。
3. 当前 `project.config.json` 的 AppID 为 `touristappid`，可进入游客模式本地预览。
4. 如需真机预览、上传体验版或发布，请在开发者工具中填入自己的小程序 AppID；本项目不需要配置服务器域名。
5. 编译后即可使用六语言、主题、回放、统计与拍照识别功能。
6. 微信 OCR 使用离线模板分类器，不需要服务器域名；相机权限在首次使用时询问。

### 7.5 Android

```bash
cd /mnt/tos/workspace/sudoku/android
./gradlew assembleDebug
# 产物：app/build/outputs/apk/debug/app-debug.apk
adb install -r SudokuAcademy-debug.apk
```

也可把 `../dist/android/SudokuAcademy-debug.apk` 传到手机，允许“安装未知来源应用”后侧载。要求 Android 7.0（API 24）及以上；包名 `com.sudokuacademy.app`，debug 签名，仅用于测试分发。OCR 支持实时相机（WebView 运行时 CAMERA 权限）与系统相册选择。

APK 同时保留在 `android/SudokuAcademy-debug.apk` 供构建/测试使用。

### 7.6 iOS 模拟器

需要 macOS + Xcode：

```bash
npm run ios:sync   # 同步 Web 资源并执行 cap sync ios
open ios/App/App.xcodeproj
```

在 Xcode 中选择 Scheme `App` 与任一 iPhone 模拟器，点击 Run。工程使用 Capacitor 8.5.3 与 SwiftPM，最低 iOS 15。仅验证模拟器，不生成 ipa；Linux 环境无法完成编译和启动验收。**模拟器无硬件摄像头，OCR 请用「从相册选择」验收**；真机已配置相机/相册权限说明。

## 8. 已知局限与后续可优化方向

- **原生端未实机验收**：iOS 无 Xcode、Android 无模拟器、微信无开发者工具，GUI 层只做了工程与静态检查，真实触摸/相机体验需在对应环境复核。
- **OCR 准确率**：依赖拍摄质量与字体；严重透视、强反光、手写数字或非标准 9×9 棋盘可能识别失败。失败会提示重试，不会崩溃。
- **微信 OCR 后端**：受小程序 Worker/WASM 限制，使用模板分类器而非 Tesseract；对印刷体效果较好，复杂照片准确率低于 Web 端。
- **签名与分发**：Windows 未签名，Android 为 debug 签名，均不适合正式商店发布；后续需配置代码签名/发布证书。
- **微信 AppID**：游客模式存在真机预览和发布限制，正式使用需自有 AppID。
- **数据本地化**：统计、回放、主题、语言均只存本机，清缓存会丢失；没有账号、云同步、跨设备统计。
- **回放容量**：历史最多 12 条，当前回放仅保存一局；长期使用需考虑容量与清理策略。
- **无法推进的题型**：只实现 19 种技巧，超出范围的题目会显示“卡住”，不会用暴力搜索冒充人类推理。
- **翻译维护**：六语言为人工维护，新增文案必须同步六个 JSON；构建脚本能检查键和占位符，但不能判断译文质量。
- **无障碍与界面适配**：已有基础 ARIA 和键盘操作，但未做完整屏幕阅读器测试；小屏横屏、超大字体的适配仍可加强。
- **自动化范围**：没有浏览器端 E2E/截图回归，UI 验证以静态检查和手工操作为主。
- **后续方向**：云同步与账号、更多技巧（如强制链、ALS）、每日挑战、题目分享链接、成就系统、更多语言、无障碍完善、正式签名发布、macOS/Linux 桌面包。

## 9. 开发过程复盘

**工作量**：从 v1.1 基线演进到 V12，共 12 个发布标签、13 次主要提交；V11 收尾提交涉及 173 个文件、约 1.8 万行增删；V12 新增 OCR 几何内核、识别后端、相机/相册 UI、平台权限与 8 个 OCR 测试，包含 19 个技巧模块、11 个测试文件、5 个平台工程、6 个语言包和完整文档。核心引擎与 UI 大致保持“一份逻辑、多端外壳”的比例，避免五套实现各自漂移。

**主要难点**：

1. **唯一解生成与技巧评级**：挖洞后必须验证唯一解，还要用人类技巧而非暴力求解来评估难度；生成速度与题目质量需要平衡。
2. **技巧检测的正确性**：鱼、翼、链、唯一矩形等模式容易误删候选数；通过“删除项绝不等于真实解”的测试逐类兜底。
3. **跨平台复用**：浏览器可以加载 UMD，小程序不能直接用 DOM；最终采用共享核心 + 微信原生视图 + WebView/Capacitor 外壳的组合，并用哈希测试防止副本过期。
4. **小程序适配差异**：`localStorage`/DOM 不可用，必须改用 `wx` 存储和 WXML；导航栏标题要动态设置，语言与主题用原生 picker。
5. **移动端触摸交互**：数字键盘、笔记切换、长按/点击选择等在小屏上需要更大的点击区域；WebView 与微信的点击行为也需分别验证。
6. **桌面打包**：Linux 上打 Windows NSIS 包需要 Wine，Electron 二进制下载受网络影响，最终通过镜像与手动安装解决。
7. **iOS 工程生成**：Linux 无法运行 Xcode，只能生成并静态检查 Capacitor/SwiftPM 工程，这也是当前最大的验收缺口。
8. **六语言重构**：最初的中英双语是硬编码在技巧与 UI 中，V11 必须把所有句子拆成“键 + 结构化变量”，同时保证六包键/占位符一致，并同步到四个平台副本。
9. **离线 OCR**：`file://` 下 Worker 无法 fetch 训练数据，改为内嵌 Base64 + Worker 语言对象补丁；相机、文件选择、权限在 Web/Electron/WebView/小程序四套运行时的差异需要分别桥接。
10. **照片几何**：不同角度与透视会使等分裁格失效，最终用四边包络线拟合 + 单应性变换解决；模板分类器还加入孔洞特征区分 5/6/8/9。

**经验**：把“唯一事实来源 + 生成 + 一致性校验”用于语言包和平台资源，能显著减少多端漂移；对教学型数独而言，“讲得对”比“算得快”更重要，因此测试重点放在每一步与真实解的一致性；对无法在当前环境运行的平台，明确标注限制，比声称已验证更可靠。

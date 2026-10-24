> 本文保留详细功能和历史版本说明；当前目录、命令及交付规则以 [构建指南](BUILD.md) 为准。历史 Git 标签不在本次源码快照中。

# 数独学院 · Sudoku Academy

> 一个会讲解每一步的数独：自动出题、用户构造、人类逻辑逐步求解，支持六种语言。
>
> 五端交付：网页版、Windows exe、微信小程序、Android、iOS 模拟器版本。所有平台共享同一套核心求解/生成/校验引擎。
>
> [English README](README.en.md)

![游戏界面](assets/play.png)

| 操作回放 | 本地统计 |
|---|---|
| ![操作回放](assets/replay.png) | ![本地统计](assets/stats.png) |

## 目录

- [功能概览](#功能概览)
- [快速开始](#快速开始)
- [难度如何定义](#难度如何定义)
- [逐步求解器](#逐步求解器)
- [工程结构](#工程结构)
- [测试](#测试)
- [微信小程序](#微信小程序)
- [Android](#android)
- [iOS 模拟器](#ios-模拟器)
- [Windows 桌面端](#windows-桌面端)
- [版本记录](#版本记录)
- [文档](#文档)
- [技术说明与边界](#技术说明与边界)

## 功能概览

### 游戏 Play
- 随机生成合法终盘并以“唯一解”为前提挖洞。
- **按技巧等级分档**：简单只用唯一余数/隐性唯一；中等需要数对、区块排除或中级线逻辑；困难需要唯一矩形、着色、W-Wing 或 XY 链等高级技巧。
- 候选数标记、候选/填数模式切换（`N`）、键盘与数字键盘输入。
- 即时 / 检查时 / 关闭三种错误显示模式。
- 计时、暂停、撤销、重来、完成判定、成绩弹窗、显示答案（保留 V1.1 能力）。
- 提示功能：调用同一逐步求解引擎，给出当前局面中最简单的一步并解释。
- 导入/导出 81 位标准数独字符串（空格可写作 `.` 或 `0`）。
- **拍照/相册识别导入**：相机拍摄或选择图片，离线识别 9×9 棋盘并自动载入；识别结果经过冲突、无解、多解、唯一解校验，与文本导入共用同一路径。
- **操作回放**：记录本局填数、擦除、候选、撤销、提示、显示答案等全部操作；支持播放/暂停、上一步/下一步、滑杆跳转，数据保存在本机。
- **本地统计**：完成题目总数、各难度完成数、单题最快与平均用时；仅本机持久化，六语展示。
- **三套主题**：浅色默认、深色夜间、护眼主题一键循环切换；棋盘、文字、按钮、回放与统计面板同步适配。

![护眼主题](assets/eye.png)

![六语言切换（Français）](assets/i18n-fr.png)

### 构造器 Constructor
- 输入已知数字与候选标记，实时校验。
- 明确区分 **冲突 / 无解 / 多解 / 唯一解** 四种状态。
- 唯一解时一键转入游戏，并继承候选标记。

### 逐步求解 Solver
- 19 个独立技巧实现，每次输出一步：
  - 技巧名称、等级；
  - 精确的受影响格子/候选、成立原因；
  - 当前语言的完整解释；
  - 图形高亮（参与格、排除候选）；
  - 上一步 / 下一步 / 滑杆跳转 / 步骤列表 / 自动播放。
- 不依赖暴力回溯：引擎按“最简单可行动作优先”的人类逻辑推进；若已实现技巧不足以继续，会诚实报告“停滞”，而不是伪装成逐步推理。

### 多语言 i18n（6 种）
- 所有界面文案外置于 `src/locales/*.json`：简体中文、繁體中文、English、日本語、Français、Español。
- 全局 `t()` 工具 + 语言下拉选择；切换即时生效并持久化到本地。
- 求解技巧说明使用结构化 `explainKey + vars`，由语言包渲染，不在算法代码中写死文字。

### 拍照识别（V12）
- H5/Windows/Android/iOS 使用 Tesseract.js 7 + 本地 WASM + 内嵌英文训练数据，完全离线。
- 微信小程序使用同一套几何矫正 + 纯 JS 模板分类器，同样离线，无需云端接口。
- 自动矫正旋转/透视；切格后逐格识别；识别失败给出“未找到棋盘 / 不清晰 / 违反规则 / 无解”等提示。
- 平台边界与资源维护见 [docs/OCR.md](OCR.md)。

### 多端交付
- **网页版**：直接双击 `index.html`，无需服务器、构建或网络。
- **Windows**：Electron 壳加载**同一套** HTML/CSS/JS 与求解引擎；提供 NSIS 安装包与便携版 exe。
- **微信小程序**：原生 WXML/WXSS UI，`require` 由 `src/` 字节级同步的核心模块；可直接导入微信开发者工具。
- **Android**：WebView 壳加载同一离线 Web 应用；Gradle 构建时同步共享资源；提供 debug APK。
- **iOS 模拟器**：Capacitor 8 + Xcode 工程，加载同一 Web 应用；无需证书/真机/ipa。
- 多端共享：19 个技巧求解器、唯一解生成器、构造器校验、难度评级、六语语言包与 OCR 几何内核，不存在第二套数独核心算法。

端矩阵与同步机制见 [docs/PLATFORMS.md](PLATFORMS.md)。

## 快速开始

### 网页版

```bash
# 直接打开（推荐，离线可用）
xdg-open index.html        # Linux
# 或 macOS: open index.html
# 或 Windows: 双击 index.html
```

也可以通过静态服务器运行：

```bash
python3 -m http.server 8080
# 打开 http://localhost:8080/
```

> 说明：为满足 `file://` 直接打开，浏览器端使用经典 UMD 脚本而非 ES Modules；所有模块同时支持 Node `require`，供测试和桌面端复用。

### 测试

```bash
npm install
npm test
```

当前：**77 个测试全部通过**，覆盖 19 个技巧、六语言键/占位符一致性、硬编码遗漏检查、逐步求解、唯一解生成、构造器四态、操作回放、本地统计、三主题、OCR 端到端与离线资源、微信页面逻辑、多端共享文件一致性、Android APK 与 iOS 工程结构。

### 桌面端开发

```bash
npm install
npm start                 # Electron 开发模式
```

### 微信小程序

```bash
# 微信开发者工具 → 导入项目 → 选择 platforms/wechat/
# 模拟器可直接使用 touristappid；真机预览请在 project.config.json 填自己的 AppID
```

详见 [platforms/wechat/README.md](platforms/wechat/README.md)。

### Android

```bash
# 交付 APK
../dist/android/SudokuAcademy-debug.apk

# 重新构建（JDK 17 + Android SDK 35）
export ANDROID_HOME=/path/to/android-sdk
cd android && ./gradlew assembleDebug
```

详见 [android/README.md](android/README.md)。

### iOS 模拟器

```text
open ios/App/App.xcodeproj
# Scheme: App → iPhone Simulator → ⌘R
```

Capacitor/SwiftPM 工程，无需 CocoaPods、Apple 付费证书或 ipa。详见 [ios/README.md](ios/README.md)。

### Windows 安装包

构建产物位于 `../dist/windows/`（构建命令见 [docs/BUILD.md](BUILD.md)）：

| 文件 | 说明 |
|------|------|
| `Sudoku-Academy-Setup-12.0.0.exe` | NSIS 安装包，可选择安装目录，创建桌面/开始菜单快捷方式 |
| `Sudoku-Academy-Portable-12.0.0.exe` | 便携版，无需安装 |

SHA-256 见 [docs/RELEASE.md](RELEASE.md)。

## 难度如何定义

难度**不是**挖洞数量，而是由人类求解器实际需要的最高技巧等级决定：

| 档位 | 允许的最高技巧等级 | 典型技巧 |
|------|------------------|----------|
| 简单 Easy | Tier 1 | 唯一余数、隐性唯一 |
| 中等 Medium | Tier 2–3 | 显性/隐性数对、区块排除、显性/隐性三数组、X-Wing、剑鱼、Y-Wing、摩天楼、双线风筝 |
| 困难 Hard | Tier 4 | 水母、唯一矩形、单数着色、W-Wing、XY-Chain |

生成器流程：

1. 随机回溯生成合法终盘；
2. 随机挖洞，每挖一格都用计数求解器验证唯一解，多解则回填；
3. 用人类逻辑求解器完整求解；
4. 只有“可完整逻辑求解 + 最高技巧落在目标档位”的题目才被接受，否则重新生成。

因此：

- 简单题中不会出现高级技巧；
- 困难题必定需要 Tier 4 技巧；
- 三档不会因挖洞数量相同而倒挂。

## 逐步求解器

技巧按“由易到难”的顺序尝试，记录完整 trace。每一步的标准化结构见 [docs/ARCHITECTURE.md](ARCHITECTURE.md)。

| # | 技巧 | 等级 | 类别 |
|---|------|------|------|
| 1 | 唯一余数 Naked Single | 1 | 基础 |
| 2 | 隐性唯一 Hidden Single | 1 | 基础 |
| 3 | 区块排除（宫→线）Pointing | 2 | 中级 |
| 4 | 区块排除（线→宫）Claiming | 2 | 中级 |
| 5 | 显性数对 Naked Pair | 2 | 中级 |
| 6 | 隐性数对 Hidden Pair | 2 | 中级 |
| 7 | 显性三数组 Naked Triple | 3 | 高级 |
| 8 | 隐性三数组 Hidden Triple | 3 | 高级 |
| 9 | X-Wing | 3 | 高级 |
| 10 | 剑鱼 Swordfish | 3 | 高级 |
| 11 | 摩天楼 Skyscraper | 3 | 高级 |
| 12 | Y-Wing | 3 | 高级 |
| 13 | XYZ-Wing | 3 | 高级 |
| 14 | 双线风筝 Two-String Kite | 3 | 高级 |
| 15 | 水母 Jellyfish | 4 | 专家 |
| 16 | 唯一矩形 Unique Rectangle | 4 | 专家 |
| 17 | 单数着色 Simple Colouring | 4 | 专家 |
| 18 | W-Wing | 4 | 专家 |
| 19 | XY-Chain | 4 | 专家 |

完整原理、检测条件与文件位置见 [docs/TECHNIQUES.md](TECHNIQUES.md)。

## 工程结构

```text
sudoku/
├── index.html                  # 网页入口（file:// 可直接打开）
├── styles.css                  # 设计系统 / 深浅色 / 响应式
├── src/
│   ├── engine/
│   │   ├── core.js             # 棋盘模型、候选、冲突、解计数
│   │   ├── util.js             # 人类求解器公共工具与多语解释辅助
│   │   ├── index.js            # 分步求解调度、trace、评级
│   │   └── techniques/         # 19 个技巧，一技巧一文件
│   ├── generator/index.js      # 唯一解生成 + 技巧难度筛选
│   ├── constructor/index.js    # 冲突/解数量校验与开局转换
│   ├── ocr/
│   │   ├── index.js            # 棋盘定位、透视矫正、切格、81 格校验
│   │   ├── classifier.js       # 离线模板数字分类器（微信/降级）
│   │   └── templates.js        # 14 种字体的 16×16 数字模板
│   └── ui/
│       ├── i18n.js             # 全局 t()、语言检测、技巧说明格式化
│       ├── locales-data.js     # 由 locales/*.json 生成
│       ├── ocr.js              # 相机/相册、Tesseract 加载与进度 UI
│       └── app.js              # 游戏/构造器/求解器/导入导出交互
├── test/                       # Node 原生测试（node:test）
├── locales/                    # 6 个独立 JSON 语言包（文案唯一来源）
├── scripts/build-locales.js    # 语言包 → 离线 JS bundle
├── desktop/
│   ├── main.js                 # Electron 主进程（共享同一份 Web 资源）
│   └── build/icon.ico          # Windows 图标
├── platforms/wechat/         # 微信小程序源码（WXML/WXSS/JS）
│   └── shared/                 # 由 src/ 同步的核心模块
├── android/                    # Android WebView 工程 + debug APK
├── ios/                        # Capacitor Xcode 工程（模拟器）
├── www/                        # Capacitor webDir（由 src/ 生成）
├── scripts/sync-platforms.js   # 多端共享资源生成/校验
├── web/assets/vendor/tesseract/           # 离线 OCR 引擎、WASM 核心与内嵌语言数据
├── capacitor.config.json
├── docs/                       # 架构、技巧、构建、测试、发布、多端文档
├── package.json
└── release/                    # Windows 构建产物（gitignore，交付时保留）
```

数据模型：

- 核心层使用长度 81 的扁平数组，值 `0..9`；
- 候选数使用 9 位 bitmask（`Uint16Array`），bit 0 表示数字 1；
- UI 仍维护 9×9 的语义视图，导出时转为 81 位标准字符串；
- `grid / solution / given` 的 V1.1 数据语义在 UI 层保留并扩展为 `values / solutionValues / given / notes`。

## 测试

```bash
npm test
npm run test:coverage
```

测试文件：

| 文件 | 覆盖 |
|------|------|
| `test/core.test.js` | 解析、格式、冲突、候选、解计数、难度映射 |
| `test/techniques.test.js` | 19 个技巧的可触发模式与正确排除/落子、多语解释、候选合法性 |
| `test/engine.test.js` | 完整分步求解、回放、状态一致性、六语步骤说明、停滞、非法输入、等级限制 |
| `test/generator.test.js` | 三档唯一解生成、真实解对照、无错误排除、确定性 RNG |
| `test/constructor.test.js` | 冲突/无解/多解/唯一解四态、rating、开局转换 |
| `test/features.test.js` | 操作录制/快照回放、JSON 持久化、统计计数/最快/平均/难度分桶 |
| `test/i18n.test.js` | 6 个 locale 文件与生成包一致、键与占位符一致、19 技巧、说明模板、HTML 无硬编码文案 |
| `test/ui-features.test.js` | 网页/小程序回放、统计、擦除按钮、三主题与语言下拉静态检查 |
| `test/wechat.test.js` | 小程序工程结构、共享核心哈希、WXML/WXSS 静态校验、页面逻辑模拟（生成/构造/求解/多语） |
| `test/mobile.test.js` | 所有平台生成资源与 `src/` 一致、Android APK/Manifest/WebView、iOS Capacitor/Xcode 工程结构 |
| `test/ocr.test.js` | 正拍/旋转/透视 fixture 端到端识别、无棋盘、重复线索、81 格映射、离线资源与微信入口 |

CI：`.github/workflows/test.yml` 在 Node 22 上执行 `npm ci && npm test`。

## Windows 桌面端

- 技术选型：Electron（共享 Web 核心，避免重复实现）。
- 安全设置：`contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`，阻止外部导航和弹窗。
- 构建：

```bash
# Linux/macOS 交叉构建 Windows（需要 Wine）
npm run desktop:pack
```

Windows 本机构建无需 Wine：

```powershell
npm install
npm run desktop:pack
```

详细依赖、镜像与故障排查见 [docs/BUILD.md](BUILD.md)。

## 版本记录

| 版本 | 主要变更 | git tag |
|------|---------|---------|
| V0 | 9×9 棋盘、手填、冲突校验 | `v0.0.0` |
| V1 | 随机终盘 + 挖洞 + 唯一解校验 + 按洞数难度 | `v1.0.0` |
| V1.1 | 收敛为单一 `index.html`，融合手填与自动出题 | `v1.1.0` |
| V2.0 | 单文件重构为分层工程；核心/生成器/构造器/19 技巧；技巧等级难度；单元测试 | `v2.0.0` |
| V2.1 | 中英多语完整界面；候选标记、计时、错误模式、导入导出；构造器与游戏联动 | `v2.1.0` |
| V3.0 | 逐步求解回放（高亮/解释/跳转/自动播放）；Electron Windows 双包；完整文档与发布产物 | `v3.0.0` |
| V7.0 | 微信小程序适配（原生 UI + 共享核心）；扫码/模拟器可验收 | `v7.0.0` |
| V8.0 | Android WebView 工程 + debug APK；同一 Web 应用离线运行 | `v8.0.0` |
| V9.0 | iOS Capacitor/Xcode 模拟器工程；多端文档、同步校验与最终验收 | `v9.0.0` |
| V10.0 | 全端操作回放、本地做题统计、浅色/深色/护眼三主题 | `v10.0.0` |
| V11.0 | i18n 重构：6 种语言、locales JSON、语言下拉、多语技巧讲解 | `v11.0.0` |
| V12.0 | 全端拍照/相册 OCR 导入；离线 Tesseract WASM；微信模板分类器；81 格校验与六语文案 | `v12.0.0` |

> 本任务提供的原始压缩包中 `.git/objects` 缺失（只有 refs/reflog），无法直接读取原提交对象；仓库在保留原有 tag 名称与版本内容的前提下重建了 v0.0.0 / v1.0.0 / v1.1.0 基线，并继续分阶段提交新版本。

## 文档

- [架构说明](ARCHITECTURE.md)
- [19 个技巧详解](TECHNIQUES.md)
- [构建与打包](BUILD.md)
- [测试策略](TESTING.md)
- [多端架构与验收](PLATFORMS.md)
- [国际化体系](I18N.md)
- [拍照识别与平台边界](OCR.md)
- [发布产物与校验和](RELEASE.md)

## 技术说明与边界

- **唯一解**：生成器的每一次挖洞都通过 `countSolutions(..., 2)` 校验；构造器把解数量限制在 2 以快速区分“唯一”和“多解”。
- **唯一矩形**：依赖题目唯一解前提。求解多个解的题目时，引擎会关闭唯一矩形（`assumeUnique: false`），并在界面显示警告。
- **人类逻辑边界**：若题目超出 19 个已实现技巧，求解器会报告停滞；不会用猜测/回溯冒充分步推理。生成器只接受能被完整逻辑解出的题目。
- **离线与隐私**：无网络请求、无遥测、无外部字体或 CDN；OCR 资源随应用分发，图片只在本机处理；所有数据留在本地。
- **浏览器**：Chrome/Edge 100+、Firefox 100+、Safari 16+（使用 CSS container units、dialog、color-mix 等现代特性）。
- **多端共享**：微信 `shared/` 与 Android/iOS Web 资源均由 `scripts/sync-platforms.js` 生成；测试比较 SHA-256，禁止修改生成副本而不改源。
- **本地数据**：回放、统计与主题均保存在各端本地存储（浏览器/WebView localStorage、微信 `wx.setStorageSync`），不经过任何服务器。
- **iOS 验收**：仅要求 Xcode 内建模拟器；模拟器无硬件摄像头，拍照识别请用“从相册选择”验收。无 Mac 时按任务规则豁免。当前构建环境无 Xcode，工程为 Capacitor CLI 生成并已做结构解析校验。

## License

MIT

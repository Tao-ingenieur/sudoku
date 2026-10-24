# 测试与质量 · Testing

## 1. 运行

```bash
npm test
npm run test:coverage
```

使用 Node 原生 `node:test` / `node:assert`，无额外测试框架依赖。

## 2. 测试矩阵

| 测试文件 | 数量 | 内容 |
|---------|------|------|
| `test/core.test.js` | 7 | 解析、格式互转、冲突、候选、唯一/多解/无解计数、难度映射 |
| `test/techniques.test.js` | 20 | 19 个技巧各自的触发模式 + 模块 id/等级唯一性 |
| `test/engine.test.js` | 9 | 简单/困难完整求解、真实解对照、回放、状态一致、停滞、非法输入、maxTier |
| `test/generator.test.js` | 5 | 三档各两题、唯一解、技巧等级、解一致、确定性 RNG、错误参数 |
| `test/constructor.test.js` | 8 | 冲突、多解、无解、唯一解、满盘、非法字符串、rating、toGame |
| `test/i18n.test.js` | 7 | 6 locale JSON 与生成包、键/占位符、19 技巧、说明模板、HTML key、无硬编码 CJK、脚本顺序 |
| `test/features.test.js` | 4 | 回放快照/持久化、统计计数/最快/平均/难度分桶 |
| `test/ui-features.test.js` | 2 | 网页/小程序回放、统计、擦除与三主题静态完整性 |
| `test/wechat.test.js` | 4 | 小程序结构、共享核心字节一致、WXML/WXSS、Page/wx 模拟页面流程 |
| `test/mobile.test.js` | 3 | 所有平台生成资源一致、Android APK/Manifest/WebView、iOS Capacitor 工程 |
| `test/ocr.test.js` | 8 | 正拍/旋转/透视端到端识别、无棋盘、重复线索、81 格映射、离线资源与微信入口 |

总计 **77** 个测试。

## 3. 技巧测试方法

每个技巧测试直接构造候选 bitmask，不依赖完整题面：

```js
const cands = new Uint16Array(81);
cands[0] = core.bit(1) | core.bit(2);
// ...
const step = nakedPair.find(values, cands);
assert.equal(step.technique, 'nakedPair');
```

断言：

- 触发正确技巧、等级；
- 排除/落子指向现存候选；
- `explain.zh` 与 `explain.en` 均存在且包含具体信息；
- 不出现 `undefined`；
- 模块集合 ≥ 12（实际 19）。

## 4. 真实题目验证

`generator.test.js` 生成题目后：

1. `countSolutions(..., 2) === 1` 验证唯一解；
2. `core.solve` 与生成器保存的 solution 一致；
3. 逐步应用每个步骤：
   - 每个 placement 等于真实解；
   - 每个 elimination 不包含真实解数字；
   - 不产生 contradiction；
4. 最终 values 必须等于 solution。

`engine.test.js` 对固定简单题/困难题做同样检查，并额外验证：

- `stateAfter(initial, steps, n)` 等于最终 values；
- `replay` 与完整 trace 一致；
- `applyStep` 不修改入参；
- 困难题确实使用高级技巧；
- `maxTier=2` 无法完整解决困难题；
- 停滞的 AI Escargot 被标记为 stalled，而不是 solved。

## 5. 随机压力测试（开发期执行）

开发过程中额外执行：

```text
三档 × 40 seed = 120 题
- 全部唯一解
- 全部按目标技巧档位分类
- 逐步落子/排除与唯一解逐一对照：0 错误
- 19 个技巧全部至少触发一次
```

该脚本未纳入日常 `npm test`，以避免 CI 时间波动；日常测试已包含三档真实生成与逐步对照。

## 6. 六语 i18n 与离线校验

`test/i18n.test.js`：

- 6 个 `src/locales/*.json` 与生成的 `locales-data.js` 完全一致；
- 6 种语言的 key 与占位符集合完全一致；
- 19 个技巧名称/描述在 6 种语言中完整；
- 所有 `explain.*` 模板在 6 种语言中存在；
- `index.html` 中所有 `data-i18n*` key 在 6 种语言中都存在；
- Web/微信 UI 源文件不得含硬编码 CJK 文案；
- 所有 `<script src>` 必须是本地路径，locales-data 在 i18n 之前加载；
- 脚本顺序满足 core → util → techniques → engine → UI。

## 7. 手工验收清单

### 拍照识别（所有平台）
- 打开相机被拒绝时，确认自动降级到文件选择且不崩溃；
- 从相册选择正拍图，确认识别后棋盘与题面一致；
- 用旋转/透视图片，确认自动矫正；
- 用空白图片/非数独图片，确认出现“未找到棋盘”提示；
- 用重复数字图片，确认出现“违反数独规则”提示；
- 识别成功后继续使用提示、求解、回放、统计，确认与文本导入一致；
- iOS 模拟器只用“从相册选择”验收。

### 游戏
- [x] 三档出新题，状态显示难度/已知数/最高技巧；
- [x] 点击格、键盘 1–9、数字键盘、Backspace、方向键；
- [x] 候选模式与自动清理 peer 候选；
- [x] 即时/检查时/关闭三种错误显示；
- [x] 计时、暂停、撤销、重来；
- [x] 填满合法后胜利弹窗；
- [x] 提示显示步骤并可应用；
- [x] 显示答案（结束本局、计时停止、可重来/新题）；
- [x] 导入唯一解/多解/无解/冲突/格式错误；
- [x] 操作回放（播放/暂停/步进/滑杆/本地保存）；
- [x] 本地统计（总数/各难度/最快/平均）；
- [x] 浅色/深色/护眼主题切换，语言不受影响；
- [x] 导出题目、进度、答案。

### 构造器
- [x] 空盘等待输入；
- [x] 冲突实时标红与文字；
- [x] 多解 / 无解 / 唯一解状态；
- [x] 唯一解时启用开始游戏；
- [x] 候选标记保留到游戏；
- [x] 示例、清空、粘贴、复制。

### 求解器
- [x] 六语技巧名、步骤说明、主题/统计/回放文案同步切换；
- [x] 示例题完整解出；
- [x] 每一步技巧名、等级、双语解释；
- [x] 参与格/排除候选高亮；
- [x] 上一步/下一步/滑杆/步骤列表；
- [x] 自动播放与停止；
- [x] 终局显示；
- [x] 停滞/多解提示；
- [x] 六语言下拉切换；全部界面与步骤讲解即时切换。
- [x] 无硬编码 UI 文案；无大面积漏译。

### 桌面端
- [x] Electron 加载同一页面；
- [x] `nodeIntegration=false`、`contextIsolation=true`；
- [x] Windows 安装包 + 便携版构建成功；
- [x] `app.asar` 包含完整 `src` 与 `index.html`。

### 微信小程序
- [x] 回放、统计、三主题、六语与网页一致；
- [x] 标准小程序工程，可直接导入；
- [x] 共享核心字节级同步自 `src/`；
- [x] WXML/WXSS/JSON 完整；
- [x] Node 模拟 `Page`/`wx` 覆盖生成、输入、撤销、构造器、求解器、语言切换；
- [x] WXML 标签平衡、事件处理器、label key、WXSS 括号检查。
- [ ] 微信开发者工具内实际点击（构建环境无微信 IDE）；真机预览需填写评审方 AppID。

### Android
- [x] debug APK 构建成功，Android Debug 证书签名；
- [x] aapt/apksigner 验证包名、启动 Activity、签名；
- [x] APK 内含 `assets/www/src/engine` 与完整 UI；
- [x] Manifest 无 INTERNET 权限；
- [ ] Android 模拟器实际启动（构建环境无 KVM/模拟器）。

### iOS 模拟器
- [x] Capacitor 8.5.3 生成 Xcode 工程 + 共享 Scheme；
- [x] pbxproj 解析成功，target/App、Bundle ID、版本、iOS 15 配置正确；
- [x] SwiftPM 依赖 Capacitor 8.5.3；
- [x] public 内含共享 Web 与完整引擎；
- [ ] Xcode 模拟器实际运行（构建环境为 Linux，无 Xcode；任务允许豁免）。

## 8. UI 冒烟测试（本机）

开发时使用 Chromium DevTools Protocol 驱动真实页面，检查：

- 页面无控制台异常；
- 新题生成、构造器示例校验、开始游戏；
- 求解器示例、步进、滑杆跳转；
- 语言切换后静态/动态文案、状态、步骤列表、胜利弹窗全部同步；
- 深色主题截图。

这些脚本依赖本机 Chromium/显示环境，因此不作为 `npm test` 的一部分；欢迎在 CI 中扩展 Playwright。

## 9. 性能观察

- 生成器对每道题执行多次唯一解计数 + 一次完整人类求解；
- 单题生成常见 < 150 ms；
- 求解器在 27 clue 困难题上约 8 ms；
- 候选/状态使用 TypedArray，UI 重绘 O(81)。

## 10. CI

`.github/workflows/test.yml`：

```yaml
- uses: actions/setup-node@v4
  with: { node-version: 22, cache: npm }
- run: npm ci
- run: npm test
```

`npm test` 同时执行多端共享文件一致性、微信页面逻辑模拟、Android APK/工程结构与 iOS 工程结构检查。桌面/Android 安装包不进入日常 CI（体积与平台工具依赖较大），由发布流程单独构建。

## 11. OCR 测试（V12）

- `test/ocr.test.js`：
  - 正拍、旋转 7°、透视三张 fixture 端到端识别，81 位字符串必须完全一致；
  - 无棋盘图片返回 `noGrid`；
  - 重复数字返回 `conflict`，线索不足返回 `tooFew`；
  - 字符框到 81 格映射、同格多结果取最高置信度；
  - 微信/网页 OCR 入口、相机权限、离线资源与 Worker 补丁检查。
- `node scripts/verify-ocr-browser.js`：
  - 以 `file://` 启动真实网页，上传透视图片；
  - 断言 OCR 弹窗无错误、棋盘与预期题面一致、未降级到模板分类器。
- 当前环境无法自动化的部分：Android 模拟器相机、微信开发者工具真机预览、iOS 模拟器相册选择；需在对应环境按 `docs/OCR.md` 的边界表人工验收。

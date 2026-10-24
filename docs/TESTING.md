# 测试与验收

## 自动化测试

在仓库根目录执行：

```sh
npm ci
npm test
```

`npm test` 先生成翻译包、离线 OCR Worker 和各平台共享资源，再使用 Node 原生
`node:test` 执行 `test/*.test.js`。当前共 77 项测试，实际结果以命令输出为准。

| 测试文件 | 项数 | 覆盖内容 |
| --- | --- | --- |
| `test/core.test.js` | 7 | 解析、冲突、候选、解计数、难度映射 |
| `test/techniques.test.js` | 20 | 19 种技巧的触发与排除、技巧集合 |
| `test/engine.test.js` | 9 | 完整求解、六语解释、回放、停滞与等级限制 |
| `test/generator.test.js` | 5 | 确定性随机数、三档唯一解生成、真实解对照 |
| `test/constructor.test.js` | 8 | 格式、冲突、无解、多解、唯一解与游戏转换 |
| `test/features.test.js` | 4 | 回放快照、JSON 持久化、统计 |
| `test/i18n.test.js` | 7 | 六语 JSON、占位符、技巧说明、HTML 脚本与文案 |
| `test/ui-features.test.js` | 2 | 网页和微信的回放、统计、擦除、主题结构 |
| `test/wechat.test.js` | 4 | 共享代码、工程结构、WXML/WXSS、Page/wx 模拟交互 |
| `test/mobile.test.js` | 3 | 生成资源一致性、Android WebView 和 iOS 工程结构 |
| `test/ocr.test.js` | 8 | 正拍、旋转、透视图片、无棋盘、校验、资源与入口 |

技巧测试使用可触发的候选模式；引擎及生成器测试对照已知解，验证落子正确、排除不损失
真实解，并检查回放结果。平台结构测试不替代真机或模拟器运行。

## 浏览器离线 OCR 验收

```sh
npm run sync:platforms
npm run test:ocr-browser
```

需要 Chromium、Chrome 或 Edge；脚本会查找常见安装位置，也可设置
`PUPPETEER_EXECUTABLE_PATH` 指定可执行文件。

脚本以 `file://` 打开生成的网页、阻止 HTTP/HTTPS 请求，检查法语和英语切换，先导入另一道
有效题目，再上传透视图片。只有实际识别完成、题面与预期一致、后端为 Tesseract，
且没有页面脚本错误或 OCR 降级警告时才通过。

可用环境变量 `SUDOKU_WEB_ENTRY` 指定待验收入口，例如 `web/index.html` 或
`../dist/web/index.html`；相对路径以仓库根目录为基准。

## 安装包及交付校验

```sh
npm run dist:win
npm run dist:android
npm run dist:verify
```

工具链要求见 [构建指南](BUILD.md)。Windows 打包后运行
`scripts/verify-desktop.js`，检查 Electron 入口和 Web 资源是否与本次生成结果一致，
以及 HTML 的本地脚本、样式是否存在于 `app.asar`。

`dist:verify` 校验 `../dist/metadata/SHA256SUMS.txt` 中列出的文件，并拒绝目录里
出现未列入清单的文件。它用于检查交付文件变化，不证明所有设备功能均可用。

## CI

实际流程位于 [build.yml](../.github/workflows/build.yml)：

- Linux：安装 Node 22、JDK 17 和 Android SDK 35，执行锁文件安装、测试及 Android 构建。
- Windows：安装 Node 22，执行锁文件安装、测试、EXE 构建和包内资源校验。
- 两个任务分别上传对应安装包及共享交付件；iOS 只生成工程，不在 CI 中编译。

结果见 [GitHub Actions](https://github.com/Tao-ingenieur/sudoku/actions)。

## 设备验收清单

以下是每次发布时要执行的检查，不是已经完成的验收记录：

- 三档生成题目，输入、擦除、候选、撤销、暂停、提示和完成一局。
- 构造器的冲突、无解、多解、唯一解状态及转入游戏。
- 求解器的步骤高亮、六语解释、步进、滑杆、自动播放及停滞提示。
- 操作回放、完成统计、三套主题、语言切换以及重新启动后的本地数据。
- 相机权限允许/拒绝、相册选择、旋转/透视照片和识别失败提示。
- Windows 安装版及便携版启动；Android 真机或模拟器启动及图片导入。
- 微信开发者工具交互和真机预览；iOS/Xcode 模拟器运行及相册导入。

设备和相机能力说明见 [OCR 文档](OCR.md)。

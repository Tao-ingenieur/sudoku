# Sudoku Academy V12.0.0 — 分平台输出

| 目录 | 内容 | 启动方式 |
|------|------|----------|
| `windows/` | NSIS 安装版、便携版 exe | 双击运行；未签名，SmartScreen 可能提示 |
| `android/` | `SudokuAcademy-debug.apk` | 传到 Android 7.0+ 手机侧载；支持相机/相册 |
| `web/` | `index.html` + `src/` + `assets/` | 直接双击 `index.html`，或 `python3 -m http.server 8080` |
| `ios/` | Capacitor Xcode 工程 | macOS 打开 `ios/App/App.xcodeproj`，选择模拟器运行；模拟器 OCR 仅相册 |
| `wechat/` | 微信小程序工程 | 微信开发者工具导入该目录；touristappid 可游客预览，真机请换自己的 AppID |

## 说明

- 所有平台共用同一套求解、生成、构造、回放/统计与 OCR 几何代码。
- 网页/Windows/Android/iOS 使用离线 Tesseract WASM；微信使用离线模板分类器。
- 拍照识别入口：游玩页侧栏「拍照识别导入」，也可从「导入/导出」进入。
- 校验和见 `metadata/SHA256SUMS.txt`（相对本目录）。
- 各平台相机能力与限制见 [源码仓库的 OCR 文档](https://github.com/Tao-ingenieur/sudoku/blob/main/docs/OCR.md)。

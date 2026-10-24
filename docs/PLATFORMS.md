# 平台与共享代码

| 平台 | 开发源码 | 交付件 |
| --- | --- | --- |
| Web | `web/`、`src/` | `../dist/web/` |
| Windows | `platforms/desktop/` | `../dist/windows/*.exe` |
| Android | `platforms/android/` | `../dist/android/SudokuAcademy-debug.apk` |
| iOS | `platforms/ios/` | `../dist/ios/` Xcode 工程 |
| 微信 | `platforms/wechat/` | `../dist/wechat/` |

Web、Windows、Android、iOS 共用同一 Web 界面；微信使用原生 WXML/WXSS 界面。
各平台共用 `src/` 中的求解、生成、构造、OCR 几何、回放、统计和多语言逻辑。
微信用离线模板分类器；其他平台使用内嵌 Tesseract WASM。

执行 `npm run sync:platforms` 生成资源，`npm run sync:check` 校验同步。
生成目录不提交 Git；构建和测试会先生成所需资源。
配置、工具链及验收规则见 [BUILD.md](BUILD.md)。

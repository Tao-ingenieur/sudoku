# 发布说明

当前源代码版本：12.0.0。交付目录位于仓库外的 `../dist/`。

- `web/`：完整离线网页。
- `windows/`：x64 NSIS 安装版与便携版。
- `android/`：Android 7.0+ 调试 APK。
- `ios/`：带共享 Web 资源的 Xcode 工程，不含 IPA。
- `wechat/`：带共享核心的微信小程序工程。
- `metadata/`：文件校验清单和构建来源记录。

执行方式见 [BUILD.md](BUILD.md)。安装包不提交 Git；可从 GitHub Actions 下载。
原生包重新构建后哈希可能变化。`build-info.json` 会区分本次重建和历史保留文件。

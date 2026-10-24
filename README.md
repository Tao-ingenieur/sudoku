# 数独学院 · Sudoku Academy

离线数独教学应用：唯一解出题、题目构造、19 种人类逻辑技巧逐步讲解、拍照识别、回放和统计。
支持简体中文、繁体中文、English、日本語、Français、Español。
共享源码支持 Web、Windows、Android、iOS 和微信小程序。

[English](docs/README.en.md) · [功能说明](docs/USER_GUIDE.md) · [构建指南](docs/BUILD.md)

![游戏界面](docs/assets/play.png)

## 快速开始

需要 Node.js 22.12+ 和 npm。在本仓库根目录执行：

```sh
npm ci
npm test
npm run serve
```

打开 http://127.0.0.1:8080/ 。`npm start` 启动 Electron 开发版。

## 源码与交付件

```text
repo/                       # 本 Git 仓库
├── web/                    # HTML、CSS、离线 OCR 资源
├── src/                    # 共享引擎、界面、翻译源文件
├── platforms/              # desktop、android、ios、wechat
├── config/                 # 构建配置
├── scripts/                # 同步、测试、构建、发布和校验
├── test/                   # 测试与样本
└── docs/                   # 文档、截图、许可及发布说明模板
../dist/                    # 生成的交付件，不在 Git 仓库中
```

```sh
npm run dist:assets         # Web、iOS 工程、微信工程
npm run dist:win            # 加上 Windows 安装版与便携版
npm run dist:android        # 加上 Android 调试 APK，需要 JDK 17 和 Android SDK 35
npm run dist                # 完整构建，需要 Windows + Android 工具链
npm run dist:verify         # 检查交付清单与文件哈希
```

生成文件和缓存不提交 Git。`src/locales/` 是翻译来源，平台共享资源由 `src/` 生成。
iOS 交付 Xcode 工程，运行需要 macOS/Xcode；本仓库不生成 IPA。
GitHub Actions 分别在 Windows 和 Linux 构建原生安装包，并保存构建产物。

项目源码使用 [MIT License](LICENSE)，离线 OCR 及其他第三方组件保留各自许可，见
[第三方说明](docs/THIRD_PARTY_NOTICES.md)。

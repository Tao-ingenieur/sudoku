# 构建与发布

所有命令均从 `repo/`（Git 仓库根目录）执行。

## 环境

- Node.js 22.12 或更新版本，npm；使用 `npm ci` 按锁文件安装依赖。
- Windows 安装包：Windows x64；其他系统交叉构建需要额外工具。
- Android：JDK 17、Android SDK Platform 35、接受 SDK 许可。
- iOS：生成交付工程不需要 Mac，编译及模拟器运行需要 macOS/Xcode。
- 首次安装依赖和打包会下载工具；生成后的应用支持离线运行。

## 开发和测试

```sh
npm ci
npm test
npm run serve
```

打开 http://127.0.0.1:8080/ 。也可在生成资源后打开 `web/index.html`。
`npm start` 启动 Electron 开发版；`npm run test:ocr-browser` 用 Chromium/Chrome
检查离线图片导入。可用 `PUPPETEER_EXECUTABLE_PATH` 指定浏览器路径。

## 生成资源

```sh
npm run sync:platforms
npm run sync:check
npm run dist:assets
```

`src/locales/*.json` 是翻译源，生成 `src/ui/locales-data.js`。
`web/assets/vendor/tesseract/eng.traineddata.gz` 生成 `eng-data.js`。
Web、Android、iOS 和微信共享资源由同一份 `src/` 生成，生成目录不提交 Git。
`.build/` 是仓库内忽略的中间目录；最终交付目录固定为仓库外的 `../dist/`。
发布 HTML 会将开发入口的 `../src/` 引用转换成包内的 `src/` 引用。

## 原生安装包

```sh
npm run dist:win
npm run dist:android
npm run dist
```

前两条分别执行测试、生成共享交付件并构建对应平台。最后一条要求同一台机器
具备 Windows 和 Android 工具链；遇到失败会返回错误，不会冒充构建成功。

Android 通过 `ANDROID_HOME` 或 `ANDROID_SDK_ROOT` 找到 SDK。Windows 使用
`gradlew.bat`，Linux/macOS 使用 `gradlew`。调试 APK 不使用私人发布密钥，
不同机器上的调试证书可能不同，因此重建 APK 不承诺与历史文件哈希相同。

Windows 图标由现有 iOS AppIcon 生成；安装版和便携版使用同一个离线 Web 包。
Windows 安装包未配置代码签名。

## iOS 和微信

执行 `npm run dist:assets` 后：

- 用 Xcode 打开 `../dist/ios/App/App.xcodeproj`，运行 App Scheme。
- 用微信开发者工具导入 `../dist/wechat/`；真机预览需设置自己的 AppID。
- 修改 UI 源码分别位于 `platforms/ios/`、`platforms/wechat/`，再重新生成交付件。
- `config/capacitor.config.json` 集中保存 Capacitor 配置；项目日常资源同步使用
  `npm run sync:ios`，不依赖在仓库根目录运行 Capacitor CLI。

## 可复现性与检查

```sh
npm run dist:verify
```

`../dist/metadata/SHA256SUMS.txt` 校验所有交付文件；`build-info.json` 记录锁文件
哈希和原生包来源。哈希检查证明交付文件是否变化，不能证明历史二进制来自当前源码。
共享资源要求内容一致；原生包要求能从源码重建并通过检查，不承诺跨环境逐字节一致。

GitHub Actions 在 Linux 构建 Android，在 Windows 构建 EXE，并分别上传交付件。
iOS CI 不编译，交付 Xcode 工程。源码快照不包含以前开发环境中的历史 Git 标签。

# 拍照/相册识别导入（OCR）

V12 新增：从图片识别 9×9 数独并直接载入棋盘，与原有 81 字符文本导入并存。识别全程离线，图片不会上传。

## 1. 入口与交互

- 网页、Windows、Android、iOS：游玩页侧栏直接点击「拍照识别导入」，也可从「导入/导出」弹窗进入。
- 微信小程序：游玩页直接点击「拍照识别导入」，也可从「导入/导出」弹窗进入。
- 弹窗内提供两个入口：
  - **打开相机 / 拍照**：实时相机；浏览器不支持或被拒绝时自动降级为系统图片选择器（`capture=environment`）。
  - **从相册选择**：本地图片文件。
- 拍摄建议固定展示：棋盘占满画面、保持端正；光线均匀、避免阴影反光；保持稳定、数字清晰。
- 识别中显示进度条；失败显示原因，可「重新识别」，不会崩溃或清空当前对局。
- 成功后与文本导入完全一致：校验唯一解后进入游玩，支持提示、逐步求解、回放、统计和主题。

## 2. 离线识别流程

1. **定位棋盘**：灰度化、Otsu 二值化、连通域分析，取最大棋盘线网络。
2. **矫正**：沿上下左右四条边提取“包络线”，最小二乘拟合后求交点，得到四角；用单应性变换把透视/旋转的棋盘拉成 720×720 正方形。
3. **切格**：每格取内部区域（默认 82%），缩放到 64×64，统一对比度，排成 9×9、带间隔的合成图，避免网格线和相邻数字干扰。
4. **识别**：合成图交给 OCR 后端，逐字符映射回 81 格；低置信度单元格会提示用户核对。
5. **校验**：检查每行/每列/每宫无重复、至少 17 个线索；再结合构造器检查无解/多解/唯一解。只有唯一解才会载入对局（与文本导入一致）。
6. **容错**：识别失败时依次尝试不同裁边比例；仍失败则返回“未找到棋盘 / 图片不清晰 / 违反数独规则 / 无解”等明确原因。

## 3. 识别后端与离线资源

### 网页 / Windows / Android / iOS

- 使用 **Tesseract.js 7 + Tesseract WASM LSTM**，只识别数字（白名单 1–9）。
- 资源全部随应用分发，位于 `web/assets/vendor/tesseract/`：
  - `tesseract.min.js`
  - `worker-bundle.js`：由保留在源码仓库中的 Worker 与单文件 WASM 核心生成
  - `eng-data.js`：`eng.traineddata.gz` 的 Base64 内嵌版本，约 1.9 MB
- 为实现 `file://` 离线运行，做了以下适配：
  1. 语言数据以 `{code:'eng', data: Uint8Array}` 直接交给 Worker，不发起网络请求；
  2. 仓库内 `worker.min.js` 增加了对 `{code,data}` 语言对象的兼容（原版仅回退到 `data` 字段）。
  3. Worker 和 WASM 引导脚本嵌入一个 Blob Worker，避免 Chromium 阻止 Worker 导入 `file://` 脚本。
- 首次识别才懒加载 OCR 资源；加载失败（旧 WebView、受限环境）会自动降级到共享模板分类器，功能仍可用。
- 发布包不重复携带原始 Worker 和 WASM 引导文件；使用生成的离线 Worker。实际包大小以交付件为准。

### 微信小程序

微信小程序没有浏览器 `Worker`/`fetch`/DOM，无法直接运行 Tesseract.js。为保证“离线可用”，微信端使用同一套几何预处理 + **纯 JS 模板分类器**：

- `src/ocr/templates.js`：由 14 种常见拉丁/CJK 字体渲染的数字 16×16 模板；
- `src/ocr/classifier.js`：归一化数字墨迹、平移匹配、孔洞特征（区分 5/6/8/9 等）；
- 通过 `wx.createOffscreenCanvas` 读取图片像素，完全本机计算，无云端接口。
- 识别成功率取决于拍摄质量；不清晰时会明确提示重拍。

> 若后续微信基础库提供可用的 WASM/Worker 能力，可在 `recognizeImage` 的 backend 参数中替换为 Tesseract，几何与校验代码无需改动。

## 4. 平台边界（实现现状）

| 平台 | 实时相机 | 相册/文件 | 识别后端 | 备注 |
|------|----------|-----------|----------|------|
| H5 网页 | `getUserMedia`，拒绝权限时降级 | 支持 | Tesseract WASM（离线） | `file://` 或静态服务器均可 |
| Windows | 摄像头可用时 `getUserMedia` | 支持 | Tesseract WASM（离线） | Electron 已放行 media/camera 权限 |
| 微信小程序 | `wx.chooseMedia({sourceType:['camera']})` | 支持 | 纯 JS 模板分类器（离线） | 需相机权限；游客 AppID 可本地预览 |
| Android APK | WebView `getUserMedia` + 运行时 CAMERA 权限 | 系统文件选择器 | Tesseract WASM（离线） | 已接入 `onPermissionRequest` 与 `onShowFileChooser` |
| iOS（真机） | 系统相机（WKWebView） | 支持 | Tesseract WASM（离线） | 已配置 `NSCameraUsageDescription` / `NSPhotoLibraryUsageDescription` |
| iOS 模拟器 | 无硬件摄像头 | **仅相册** | Tesseract WASM（离线） | 模拟器请用“从相册选择”验收 |

## 5. 隐私

图片只在当前进程/设备内解码、裁剪和识别，不写入远端，也不依赖网络。识别结果只保留在棋盘/回放/统计的本地存储中。

## 6. 验证

- `npm test`：OCR 几何、81 格映射、合法性校验、三种图片（正拍/旋转/透视）端到端识别、平台入口与离线资源检查。
- `node scripts/verify-ocr-browser.js`：用 Chromium 以 `file://` 打开真实页面，上传透视图片，断言棋盘与预期题面完全一致且未降级到模板分类器。
- Android 真机相机、微信开发者工具和 iOS 模拟器交互仍需在对应设备环境验收。

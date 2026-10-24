# 微信小程序

1. 微信开发者工具 → 导入项目；
2. 目录选择本目录；
3. `project.config.json` 当前为 `touristappid`，可游客模式本地预览；
4. 真机预览/上传请替换为自己的 AppID。

拍照/相册使用 `wx.chooseMedia`，旧基础库回退 `wx.chooseImage`。
识别使用离线模板分类器，无需服务器域名。

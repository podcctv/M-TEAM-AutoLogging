# M-TEAM 自动化助手

基于 GitHub Actions + Playwright 的 M-TEAM 自动登录、安全验证处理和数据抓取系统。

## ✨ 功能特性

- 🔐 **智能登录** - 支持设备验证和 2FA 双重认证（最多 10 次重试）
- 🎲 **随机延迟** - 0-45 分钟随机启动，模拟真人行为
- 📊 **数据抓取** - 自动获取上传/下载量、分享率、魔力值等
- 📱 **Telegram 通知** - 登录状态和数据报告实时推送
- 🍪 **Cookie 持久化** - 自动更新 GitHub Secrets，减少登录频率

## 🚀 快速开始

### 1. Fork 仓库

点击右上角 Fork 按钮复制到你的账号。

### 2. 配置 Secrets

进入 `Settings > Secrets and variables > Actions`，添加以下 Secrets:

| 名称 | 说明 | 必需 |
|------|------|------|
| `MT_USERNAME` | M-TEAM 用户名 | ✅ |
| `MT_PASSWORD` | M-TEAM 密码 | ✅ |
| `TG_BOT_TOKEN` | Telegram Bot Token | ✅ |
| `TG_USER_ID` | 你的 Telegram 用户 ID | ✅ |
| `REPO_TOKEN` | GitHub PAT (需要 `repo` 权限) | ✅ |
| `MT_COOKIE` | 已保存的 Cookie (自动更新，首次留空) | ⏳ |

> ⚠️ **REPO_TOKEN 权限要求**: 创建 PAT 时必须勾选 `repo` (Full control)，否则 Cookie 无法保存！

### 3. 启用 Actions

进入 `Actions` 标签页，点击 "I understand my workflows, go ahead and enable them"。

### 4. 手动触发测试

点击 `M-TEAM Auto Login` > `Run workflow` 进行首次测试。

## 📋 2FA 验证流程

首次登录会触发 2FA 验证：

1. 脚本检测到 2FA 页面
2. **Telegram 机器人发送提示**
3. 你回复验证码（两种方式）:
   - 直接发送: `123456`
   - 命令格式: `/mtcode 123456`
4. 脚本自动填入验证码
5. **登录成功后 Cookie 自动保存**
6. 下次运行自动使用 Cookie，无需 2FA

## 📁 项目结构

```
M-TEAM-AutoLogging/
├── .github/workflows/mteam-login.yml  # 定时任务 (每12小时)
├── src/
│   ├── config.js       # 配置管理
│   ├── telegram.js     # TG 消息 + 验证码轮询
│   ├── github_api.js   # Cookie 持久化到 Secrets
│   ├── auth.js         # 登录/设备验证/2FA (10次重试)
│   ├── scraper.js      # 数据抓取
│   └── main.js         # 主入口
├── package.json
└── README.md
```

## 🔧 本地测试

```bash
# 安装依赖
npm install
npx playwright install chromium

# 设置环境变量
export MT_USERNAME="your_username"
export MT_PASSWORD="your_password"
export TG_BOT_TOKEN="your_bot_token"
export TG_USER_ID="your_user_id"
export REPO_TOKEN="ghp_xxxxx"
export GITHUB_REPOSITORY="owner/repo"

# 运行
npm start
```

## ⚠️ 注意事项

1. **首次登录**会触发 2FA，请确保 Telegram Bot 可以接收消息
2. **验证码有效期短**，收到提示后请尽快回复
3. **REPO_TOKEN** 必须有 `repo` 权限才能更新 Secrets
4. 建议 **不要频繁运行**，每 12 小时一次已足够

## 📄 License

MIT

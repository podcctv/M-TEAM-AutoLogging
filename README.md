# M-TEAM 自动化助手

基于 GitHub Actions + Playwright 的 M-TEAM 自动登录、安全验证处理和数据抓取系统。

## ✨ 功能特性

- 🔐 **智能登录** - 支持设备验证和 2FA 双重认证
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
| `REPO_TOKEN` | GitHub PAT (需要 `repo` 权限) | ⭕ |
| `MT_COOKIE` | 已保存的 Cookie (自动更新) | ⭕ |

### 3. 启用 Actions

进入 `Actions` 标签页，点击 "I understand my workflows, go ahead and enable them"。

### 4. 手动触发测试

点击 `M-TEAM Auto Login` > `Run workflow` 进行首次测试。

## 📋 工作流程

```
┌─────────────┐    ┌──────────────┐    ┌─────────────┐
│ 定时触发    │───▶│ 随机延迟     │───▶│ 登录处理    │
│ (每12小时)  │    │ (0-45分钟)   │    │             │
└─────────────┘    └──────────────┘    └──────┬──────┘
                                              │
                   ┌──────────────────────────┼──────────────────────────┐
                   │                          ▼                          │
                   │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │
                   │  │ 设备验证    │  │ 2FA 验证    │  │ 正常登录    │  │
                   │  │ TG通知等待  │  │ TG获取验证码│  │             │  │
                   │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  │
                   │         │                │                │         │
                   └─────────┴────────────────┴────────────────┴─────────┘
                                              │
                                              ▼
                   ┌──────────────────────────────────────────────────────┐
                   │                    登录成功                          │
                   │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │
                   │  │ 抓取数据    │──▶ TG 发送报告 │──▶ 更新 Cookie │  │
                   │  └─────────────┘  └─────────────┘  └─────────────┘  │
                   └──────────────────────────────────────────────────────┘
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

# 运行
npm start
```

## 📁 项目结构

```
M-TEAM-AutoLogging/
├── .github/
│   └── workflows/
│       └── mteam-login.yml    # GitHub Actions 工作流
├── src/
│   ├── config.js              # 配置管理
│   ├── telegram.js            # Telegram Bot API
│   ├── github_api.js          # GitHub Secrets 更新
│   ├── auth.js                # 登录与验证处理
│   ├── scraper.js             # 数据抓取
│   └── main.js                # 主入口
├── package.json
└── README.md
```

## ⚠️ 注意事项

1. **首次登录**会触发设备验证，请确保 Telegram Bot 可以接收消息
2. **2FA 验证**需要在 Telegram 中回复 6 位验证码
3. **REPO_TOKEN** 需要 `repo` 权限才能更新 Secrets
4. 建议 **不要频繁运行**，每 12 小时一次已足够

## 📄 License

MIT

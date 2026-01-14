# M-TEAM 自动化登录助手 (Docker 版)

[![Docker Build](https://github.com/podcctv/M-TEAM-AutoLogging/actions/workflows/docker-build.yml/badge.svg)](https://github.com/podcctv/M-TEAM-AutoLogging/actions/workflows/docker-build.yml)

基于 Playwright 的 M-TEAM 自动化登录与数据抓取工具，支持 Docker 部署和 2FA 验证。

## ✨ 功能特点

- 🐳 **Docker 部署**: 开箱即用，支持长期运行
- 🔐 **智能验证**: 自动处理 2FA 验证码交互 (通过 Telegram Bot)
- 💾 **会话保持**: 本地持久化 Session，实现免登录
- 🤖 **定时任务**: 内置 CRON 调度器，每天定时执行
- 📱 **消息通知**: 任务结果实时发送到 Telegram

---

## 🚀 快速开始

### 1. 获取代码

```bash
git clone https://github.com/podcctv/M-TEAM-AutoLogging.git
cd M-TEAM-AutoLogging
```

### 2. 准备工作

你需要准备以下信息：

| 信息 | 获取方式 |
| :--- | :--- |
| M-TEAM 账号密码 | 你的 M-TEAM 登录凭证 |
| Telegram Bot Token | 向 [@BotFather](https://t.me/BotFather) 申请 |
| Telegram User ID | 向 [@userinfobot](https://t.me/userinfobot) 获取 |

### 3. 配置环境变量

复制示例配置文件并编辑：

```bash
cp .env.example .env
nano .env  # 或用其他编辑器
```

填入你的配置信息。

### 4. Docker 部署

```bash
# 构建并启动
docker-compose up -d --build

# 查看日志
docker logs -f mteam-bot
```

> ⚠️ **注意**: 如果修改了代码，需要使用 `--no-cache` 强制重建：
>
> ```bash
> docker-compose build --no-cache
> docker-compose up -d
> ```

### 5. 初次运行 (2FA)

初次运行会触发 2FA 验证：

1. Telegram Bot 会发送验证码请求
2. 直接回复 6 位数字验证码
3. 登录成功后，Session 会自动保存，下次无需再验证

---

## 🛠️ 详细配置

### 环境变量说明

| 变量名 | 说明 | 默认值 | 必填 |
| :--- | :--- | :--- | :--- |
| `MT_USERNAME` | M-TEAM 用户名 | - | ✅ |
| `MT_PASSWORD` | M-TEAM 密码 | - | ✅ |
| `TG_BOT_TOKEN` | Telegram Bot Token | - | ✅ |
| `TG_USER_ID` | Telegram User ID | - | ✅ |
| `CRON_EXPRESSION` | 定时任务 (分 时 日 月 周) | `0 9 * * *` | ❌ |
| `RANDOM_DELAY_MAX` | 随机延迟 (毫秒) | `2700000` | ❌ |
| `RUN_ON_START` | 启动时立即运行 | `false` | ❌ |
| `SKIP_DELAY` | 跳过随机延迟 | `false` | ❌ |

### 🐞 调试模式

初次使用建议开启，方便验证配置：

```bash
# 编辑 .env 文件，设置:
RUN_ON_START=true
SKIP_DELAY=true
```

这样容器启动后会立即执行一次任务，无需等待定时时间。

---

## 📂 数据持久化

| 目录/文件 | 说明 |
| :--- | :--- |
| `./data/session.json` | 浏览器 Session (Cookie + LocalStorage) |

> 💡 建议定期备份 `./data` 目录。

---

## 🔧 常用命令

```bash
# 启动
docker-compose up -d

# 停止
docker-compose down

# 查看日志
docker logs -f mteam-bot

# 强制重建 (代码更新后)
docker-compose build --no-cache && docker-compose up -d

# 进入容器调试
docker exec -it mteam-bot /bin/bash
```

---

## ❓ 常见问题

### Q: 为什么 `RUN_ON_START` 不生效？

A: 请使用 `docker-compose build --no-cache` 强制重建镜像，确保使用最新代码。

### Q: 2FA 验证码总是超时？

A: 确保 Telegram Bot Token 和 User ID 配置正确，且 Bot 已经和你的账号有过对话。

### Q: Session 保存失败？

A: 检查 `./data` 目录权限，确保容器有写入权限。

---

## 📄 License

MIT

---

**免责声明**: 本项目仅供学习交流使用，请勿用于非法用途。

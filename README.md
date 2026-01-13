# M-TEAM 自动化登录助手 (Docker 版)

基于 Playwright 的 M-TEAM 自动化登录与数据抓取工具，支持 Docker 部署和 2FA 验证。

## ✨ 功能特点

- � **Docker 部署**: 开箱即用，支持长期运行
- 🔐 **智能验证**: 自动处理 2FA 验证码交互 (通过 Telegram Bot)
- 💾 **会话保持**: 本地持久化 Session，减少重复登录
- 🤖 **定时任务**: 内置 CRON 调度器，每天定时执行
- � **消息通知**: 任务结果实时发送到 Telegram

## 🚀 快速开始

### 1. 准备工作

你需要准备以下信息：

- **M-TEAM 账号密码**
- **Telegram Bot Token** (向 @BotFather 申请)
- **Telegram User ID** (向 @userinfobot 获取)

### 2. Docker 部署 (推荐)

项目已提供 `docker-compose.yml`，一键启动：

1. **修改配置**
    编辑 `docker-compose.yml`，填入你的账号信息：

    ```yaml
    environment:
      - MT_USERNAME=你的用户名
      - MT_PASSWORD=你的密码
      - TG_BOT_TOKEN=123456:ABC-DEF...
      - TG_USER_ID=123456789
      - CRON_EXPRESSION=0 9 * * *   # 每天上午9点执行
    ```

2. **启动容器**

    ```bash
    docker-compose up -d
    ```

3. **初次运行**
    初次运行可能需要 2FA 验证。请留意 Telegram Bot 发来的消息，直接回复 6 位验证码即可。

### 3. 本地开发

需要 Node.js 18+ 环境。

```bash
# 安装依赖
npm install

# 运行
npm start
```

## 📂 数据持久化

容器内的 `/app/data` 目录会映射到宿主机的 `./data` 目录。

- `session.json`: 保存浏览器的登录状态 (Cookie + Storage)

## �️ 环境变量说明

| 变量名 |说明 | 默认值 |
| :--- | :--- | :--- |
| `MT_USERNAME` | M-TEAM 用户名 | 必填 |
| `MT_PASSWORD` | M-TEAM 密码 | 必填 |
| `TG_BOT_TOKEN` | Telegram Bot Token | 必填 |
| `TG_USER_ID` | Telegram User ID | 必填 |
| `CRON_EXPRESSION` | 定时任务表达式 | `0 9 * * *` |
| `RANDOM_DELAY_MAX` | 随机延迟 (毫秒) | `2700000` (45分钟) |

---
**免责声明**: 本项目仅供学习交流使用，请勿用于非法用途。

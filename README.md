# M-TEAM 自动化登录助手 (Docker 版)

基于 Playwright 的 M-TEAM 自动化登录与数据抓取工具，支持 Docker 部署和 2FA 验证。

## ✨ 功能特点

- 🐳 **Docker 部署**: 开箱即用，支持长期运行
- 🔐 **智能验证**: 自动处理 2FA 验证码交互 (通过 Telegram Bot)
- 💾 **会话保持**: 本地持久化 Session，减少重复登录
- 🤖 **定时任务**: 内置 CRON 调度器，每天定时执行
- 📱 **消息通知**: 任务结果实时发送到 Telegram

## 🚀 快速开始

### 1. 获取代码

```bash
git clone https://github.com/podcctv/M-TEAM-AutoLogging.git
cd M-TEAM-AutoLogging
```

### 2. 准备工作

你需要准备以下信息：

- **M-TEAM 账号密码**
- **Telegram Bot Token** (向 @BotFather 申请)
- **Telegram User ID** (向 @userinfobot 获取)

### 3. Docker 部署 (推荐)

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

### 4. Docker 命令行部署 (可选)

如果你不想使用 docker-compose，也可以直接使用 docker 命令：

1. **构建镜像**

    ```bash
    docker build -t mteam-bot .
    ```

2. **启动容器**
    *(请替换其中的环境变量)*

    ```bash
    docker run -d \
      --name mteam-bot \
      --restart unless-stopped \
      -v $(pwd)/data:/app/data \
      -e MT_USERNAME=你的用户名 \
      -e MT_PASSWORD=你的密码 \
      -e TG_BOT_TOKEN=123456:ABC-DEF... \
      -e TG_USER_ID=123456789 \
      -e CRON_EXPRESSION="0 9 * * *" \
      mteam-bot
    ```

### 5. 本地开发 / 环境变量配置

需要 Node.js 18+ 环境。

1. **安装依赖**

    ```bash
    npm install
    ```

2. **配置环境变量**
    复制示例文件并填入配置：

    ```bash
    cp .env.example .env
    # 编辑 .env 文件，填入你的账号密码
    ```

3. **运行**

    ```bash
    npm start
    ```

## �️ 详细配置说明

### 环境变量 (.env)

配置项支持通过 `docker-compose.yml` 的 `environment` 字段设置，或通过命令行 `-e` 传入。

| 变量名 | 说明 | 默认值 | 必填 |
| :--- | :--- | :--- | :--- |
| `MT_USERNAME` | M-TEAM 用户名 | - | ✅ |
| `MT_PASSWORD` | M-TEAM 密码 | - | ✅ |
| `TG_BOT_TOKEN` | Telegram Bot Token | - | ✅ |
| `TG_USER_ID` | Telegram User ID | - | ✅ |
| `CRON_EXPRESSION` | 定时任务表达式 (秒 分 时 日 月 周) | `0 9 * * *` (每天09:00) | ❌ |
| `RANDOM_DELAY_MAX` | 随机延迟最大时间 (毫秒) | `2700000` (45分钟) | ❌ |
| `RUN_ON_START` | **[调试模式]** 启动时是否立即运行一次 | `false` | ❌ |
| `SKIP_DELAY` | **[调试模式]** 是否跳过随机延迟 | `false` | ❌ |

### 调试模式 (推荐初次使用开启)

如果你希望容器启动后**立即运行**以便检查配置是否正确，请设置 `RUN_ON_START=true`。
同时建议设置 `SKIP_DELAY=true` 以跳过等待时间。

**docker-compose.yml 示例:**

```yaml
environment:
  - RUN_ON_START=true
  - SKIP_DELAY=true
  # ... 其他配置
```

## 📂 数据持久化

容器内的 `/app/data` 目录会映射到宿主机的 `./data` 目录。建议定期备份。

- `session.json`: 保存浏览器的登录状态 (Cookie + Storage)，不仅包含 Cookie，还包含 LocalStorage，实现完美免登录。

---
**免责声明**: 本项目仅供学习交流使用，请勿用于非法用途。

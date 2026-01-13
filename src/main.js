/**
 * M-TEAM 自动化助手 - 主入口
 * 
 * 功能:
 * 1. 随机延迟启动 (模拟真人行为)
 * 2. 登录 M-TEAM (处理设备验证和 2FA)
 * 3. 抓取用户数据
 * 4. 发送 Telegram 通知
 * 5. 更新 GitHub Secrets (Cookie 持久化)
 */

import config, { validateConfig } from './config.js';
import auth from './auth.js';
import scraper from './scraper.js';
import telegram from './telegram.js';
import github from './github_api.js';

/**
 * 随机延迟函数
 * 模拟真人非准点登录行为
 */
async function randomDelay() {
    // 检查是否跳过延迟
    if (process.env.SKIP_DELAY === 'true') {
        console.log('ℹ️ 已设置跳过随机延迟');
        return;
    }

    const maxDelay = config.RANDOM_DELAY_MAX; // 最大 45 分钟
    const delay = Math.floor(Math.random() * maxDelay);
    const minutes = Math.floor(delay / 60000);
    const seconds = Math.floor((delay % 60000) / 1000);

    console.log(`⏳ 随机延迟: ${minutes} 分 ${seconds} 秒`);

    // 在 GitHub Actions 中启用随机延迟
    if (process.env.GITHUB_ACTIONS === 'true') {
        await new Promise(resolve => setTimeout(resolve, delay));
        console.log('✅ 延迟完成，开始执行');
    } else {
        console.log('ℹ️ 本地环境，跳过随机延迟');
    }
}

// 调度器
import schedule from 'node-schedule';

/**
 * 核心任务逻辑
 */
async function runTask() {
    console.log('='.repeat(50));
    console.log('🚀 任务开始执行');
    console.log(`⏰ 当前时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
    console.log('='.repeat(50));

    let browser = null;

    try {
        // 验证配置
        validateConfig();

        // 随机延迟 (仅在 CRON 模式下跳过第一次执行的延迟? 或者每次都延迟?)
        // 在 Docker 守护进程模式下，调度器会准点触发，我们可以在这里加随机延迟
        await randomDelay();

        // 执行登录
        console.log('\n📍 步骤 1: 登录 M-TEAM');
        const loginResult = await auth.login();

        if (!loginResult.success) {
            throw new Error('登录失败');
        }

        browser = loginResult.browser;
        const { page, context } = loginResult;

        // 抓取用户数据
        console.log('\n📍 步骤 2: 抓取用户数据');
        const userData = await scraper.scrapeUserData(page);

        // 发送成功通知
        console.log('\n📍 步骤 3: 发送 Telegram 通知');
        await telegram.sendSuccessReport(userData);

        // 保存登录状态 (本地持久化)
        console.log('\n📍 步骤 4: 保存登录状态');
        try {
            console.log('🔄 获取最终会话状态...');
            const storageState = await context.storageState();

            // 保存到本地文件
            await auth.saveSessionState(storageState);

            // 兼容性: 如果还配置了 GitHub，也尝试推一下(可选)
            if (config.REPO_TOKEN && config.GITHUB_REPOSITORY) {
                // ... 这里的逻辑可以保留也可以删除，为了简化我们暂时跳过，只用本地文件
                console.log('ℹ️ 跳过 GitHub Secret 更新 (Docker 模式使用本地存储)');
            }

        } catch (saveError) {
            console.error('❌ 状态保存失败:', saveError.message);
            await telegram.sendMessage(`⚠️ 状态保存失败: ${saveError.message}`);
        }

        console.log('\n🎉 本次任务执行成功');

    } catch (error) {
        console.error('\n❌ 执行失败:', error.message);
        try {
            await telegram.sendErrorNotice(error.message);
        } catch (notifyError) {
            console.error('⚠️ 发送错误通知失败:', notifyError.message);
        }
    } finally {
        // 关闭浏览器
        if (browser) {
            await auth.closeBrowser(browser);
        }
    }
}

/**
 * 主入口
 */
async function main() {
    console.log('M-TEAM AutoLogging Docker Daemon Started');

    // Debug: 打印配置值
    console.log('🔧 调试: RUN_ON_START 环境变量 =', process.env.RUN_ON_START);
    console.log('🔧 调试: config.RUN_ON_START =', config.RUN_ON_START);

    // 检查是否配置了 CRON 表达式
    // 默认每天上午 9 点: '0 9 * * *'
    const cronExp = process.env.CRON_EXPRESSION;

    if (cronExp) {
        console.log(`📅 定时任务模式已启动: ${cronExp}`);

        // 调试模式：启动即运行
        if (config.RUN_ON_START) {
            console.log('🚀 检测到 RUN_ON_START=true，正在立即执行一次任务...');
            await runTask();
        }

        console.log('⏳ 等待下一次执行...');

        // 立即执行一次 (可选，防止部署后要等很久)
        // await runTask(); 

        schedule.scheduleJob(cronExp, () => {
            runTask();
        });

        // 保持进程活跃
        process.stdin.resume();

        // 优雅退出
        const signals = ['SIGINT', 'SIGTERM', 'SIGQUIT'];
        signals.forEach(signal => {
            process.on(signal, () => {
                console.log(`\n🛑 收到 ${signal}，正在停止...`);
                schedule.gracefulShutdown().then(() => process.exit(0));
            });
        });

    } else {
        // 一次性运行模式 (如果不设 CRON)
        console.log('🚀 一次性运行模式');
        await runTask();
    }
}

main().catch(error => {
    console.error('💥 主进程错误:', error);
    process.exit(1);
});

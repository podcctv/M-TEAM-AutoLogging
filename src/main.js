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

/**
 * 主执行函数
 */
async function main() {
    console.log('='.repeat(50));
    console.log('🚀 M-TEAM 自动化助手启动');
    console.log(`⏰ 启动时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
    console.log('='.repeat(50));

    let browser = null;

    try {
        // 验证配置
        validateConfig();

        // 随机延迟
        await randomDelay();

        // 执行登录
        console.log('\n📍 步骤 1: 登录 M-TEAM');
        const loginResult = await auth.login();

        if (!loginResult.success) {
            throw new Error('登录失败');
        }

        browser = loginResult.browser;
        const { page, cookies, context } = loginResult;

        // 抓取用户数据
        console.log('\n📍 步骤 2: 抓取用户数据');
        const userData = await scraper.scrapeUserData(page);

        // 发送成功通知
        console.log('\n📍 步骤 3: 发送 Telegram 通知');
        await telegram.sendSuccessReport(userData);

        // 更新 GitHub Secrets
        console.log('\n📍 步骤 4: 更新 Cookie Secret');
        if (config.REPO_TOKEN && config.GITHUB_REPOSITORY) {
            await github.updateCookieSecret(cookies);
        } else {
            console.log('ℹ️ 未配置 REPO_TOKEN 或 GITHUB_REPOSITORY，跳过 Secret 更新');
        }

        // 完成
        console.log('\n' + '='.repeat(50));
        console.log('✅ 任务完成');
        console.log('='.repeat(50));

    } catch (error) {
        console.error('\n❌ 执行失败:', error.message);

        // 发送错误通知
        try {
            await telegram.sendErrorNotice(error.message);
        } catch (notifyError) {
            console.error('⚠️ 发送错误通知失败:', notifyError.message);
        }

        // 设置退出码
        process.exitCode = 1;

    } finally {
        // 关闭浏览器
        if (browser) {
            await auth.closeBrowser(browser);
        }
    }
}

// 执行主函数
main().catch(error => {
    console.error('💥 未捕获的错误:', error);
    process.exitCode = 1;
});

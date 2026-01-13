/**
 * 认证模块
 * 处理 M-TEAM 登录、设备验证和 2FA
 */

import { chromium } from 'playwright';
import config from './config.js';
import telegram from './telegram.js';

/**
 * 创建浏览器实例
 */
async function createBrowser() {
    const browser = await chromium.launch({
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--disable-gpu',
        ],
    });

    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 },
        locale: 'zh-CN',
        timezoneId: 'Asia/Shanghai',
    });

    return { browser, context };
}

/**
 * 尝试使用已保存的 Cookie 登录
 */
async function tryLoginWithCookie(context) {
    if (!config.MT_COOKIE) {
        console.log('📝 无已保存的 Cookie');
        return false;
    }

    try {
        const cookies = JSON.parse(config.MT_COOKIE);
        await context.addCookies(cookies);
        console.log('🍪 已加载保存的 Cookie');
        return true;
    } catch (error) {
        console.log('⚠️ Cookie 解析失败:', error.message);
        return false;
    }
}

/**
 * 检查是否需要设备验证
 */
async function checkDeviceApproval(page) {
    // 检查页面是否包含设备验证提示
    const deviceApprovalTexts = [
        '新设备',
        'new device',
        '批准',
        'approve',
        '验证此设备',
    ];

    const pageContent = await page.content();
    const needsApproval = deviceApprovalTexts.some(text =>
        pageContent.toLowerCase().includes(text.toLowerCase())
    );

    if (needsApproval) {
        console.log('🔐 检测到设备验证页面');
        return true;
    }
    return false;
}

/**
 * 处理设备验证
 */
async function handleDeviceApproval(page) {
    console.log('⏳ 处理设备验证...');

    // 获取可能的批准链接
    const approvalLink = await page.evaluate(() => {
        const links = document.querySelectorAll('a[href*="approve"], a[href*="confirm"]');
        return links.length > 0 ? links[0].href : null;
    });

    // 发送 Telegram 通知
    await telegram.sendDeviceApprovalNotice(approvalLink);

    // 等待用户在其他设备上批准
    console.log('⏳ 等待设备批准 (45 秒)...');
    await page.waitForTimeout(config.DEVICE_APPROVAL_WAIT);

    // 刷新页面检查状态
    await page.reload({ waitUntil: 'networkidle' });
}

/**
 * 检查是否需要 2FA 验证
 */
async function check2FA(page) {
    const tfaIndicators = [
        'input[name*="2fa"]',
        'input[name*="totp"]',
        'input[name*="otp"]',
        'input[placeholder*="验证码"]',
        'input[placeholder*="verification"]',
    ];

    for (const selector of tfaIndicators) {
        const element = await page.$(selector);
        if (element) {
            console.log('🔐 检测到 2FA 验证页面');
            return true;
        }
    }

    // 检查页面文本
    const pageContent = await page.content();
    const tfaTexts = ['两步验证', '双重认证', '2FA', 'TOTP', '验证码'];
    return tfaTexts.some(text => pageContent.includes(text));
}

/**
 * 处理 2FA 验证
 */
async function handle2FA(page) {
    console.log('⏳ 处理 2FA 验证...');

    // 请求用户输入验证码
    const code = await telegram.waitForVerificationCode(
        '🔐 *请输入 2FA 验证码*\n\n请回复 6 位数字验证码 (TOTP 或邮箱码):',
        config.TFA_TIMEOUT
    );

    if (!code) {
        throw new Error('2FA 验证码输入超时');
    }

    // 查找验证码输入框
    const inputSelectors = [
        'input[name*="2fa"]',
        'input[name*="totp"]',
        'input[name*="otp"]',
        'input[type="text"][maxlength="6"]',
        'input[placeholder*="验证码"]',
    ];

    let inputElement = null;
    for (const selector of inputSelectors) {
        inputElement = await page.$(selector);
        if (inputElement) break;
    }

    if (!inputElement) {
        throw new Error('未找到验证码输入框');
    }

    // 输入验证码
    await inputElement.fill(code);
    console.log('✅ 验证码已填入');

    // 查找并点击提交按钮
    const submitSelectors = [
        'button[type="submit"]',
        'input[type="submit"]',
        'button:has-text("验证")',
        'button:has-text("确认")',
        'button:has-text("Submit")',
    ];

    for (const selector of submitSelectors) {
        const button = await page.$(selector);
        if (button) {
            await button.click();
            break;
        }
    }

    // 等待页面响应
    await page.waitForLoadState('networkidle');
}

/**
 * 执行用户名密码登录
 */
async function performLogin(page) {
    console.log('🔑 执行登录...');

    // 等待登录表单
    await page.waitForSelector('input[name="username"], input[name="email"], input[id="username"]', {
        timeout: 10000,
    });

    // 填写用户名
    const usernameSelectors = [
        'input[name="username"]',
        'input[name="email"]',
        'input[id="username"]',
    ];

    for (const selector of usernameSelectors) {
        const input = await page.$(selector);
        if (input) {
            await input.fill(config.MT_USERNAME);
            break;
        }
    }

    // 填写密码
    const passwordSelectors = [
        'input[name="password"]',
        'input[type="password"]',
        'input[id="password"]',
    ];

    for (const selector of passwordSelectors) {
        const input = await page.$(selector);
        if (input) {
            await input.fill(config.MT_PASSWORD);
            break;
        }
    }

    // 点击登录按钮
    const loginButtonSelectors = [
        'button:has-text("登 录")',
        'button:has-text("登录")',
        'button:has-text("Sign in")',
        'button:has-text("Login")',
        'button[type="submit"]',
        'input[type="submit"]',
        '#login-btn',
    ];

    let clicked = false;
    for (const selector of loginButtonSelectors) {
        try {
            const button = await page.$(selector);
            if (button) {
                console.log(`🖱️ 点击登录按钮: ${selector}`);
                await button.click();
                clicked = true;
                break;
            }
        } catch (e) {
            // 继续尝试下一个选择器
        }
    }

    if (!clicked) {
        // 尝试使用更通用的方法
        console.log('⚠️ 尝试备用点击方法...');
        await page.click('button >> text=/登.*录/');
    }

    // 等待页面响应 (可能会跳转)
    await page.waitForTimeout(3000);
    await page.waitForLoadState('networkidle');
}

/**
 * 检查登录状态
 */
async function checkLoginStatus(page) {
    const url = page.url();

    // 如果还在登录页面，可能登录失败
    if (url.includes('login')) {
        // 检查是否有错误信息
        const errorTexts = await page.evaluate(() => {
            const errorElements = document.querySelectorAll('.error, .alert-danger, .message-error');
            return Array.from(errorElements).map(el => el.textContent);
        });

        if (errorTexts.length > 0) {
            throw new Error(`登录失败: ${errorTexts.join(', ')}`);
        }

        return false;
    }

    // 检查是否有用户相关元素
    const userIndicators = [
        'a[href*="userdetails"]',
        '.username',
        '#userinfo',
    ];

    for (const selector of userIndicators) {
        const element = await page.$(selector);
        if (element) {
            console.log('✅ 登录状态确认');
            return true;
        }
    }

    return !url.includes('login');
}

/**
 * 提取 Cookie
 */
async function extractCookies(context) {
    const cookies = await context.cookies();
    const cookieJson = JSON.stringify(cookies);
    console.log('🍪 Cookie 已提取');
    return cookieJson;
}

/**
 * 主登录流程
 * @returns {{ success: boolean, cookies: string, page: any, browser: any, context: any }}
 */
export async function login() {
    let browser = null;
    let context = null;
    let page = null;

    try {
        // 初始化 Telegram updates
        await telegram.initUpdates();

        // 创建浏览器
        console.log('🌐 启动浏览器...');
        const browserContext = await createBrowser();
        browser = browserContext.browser;
        context = browserContext.context;

        // 尝试使用已保存的 Cookie
        const hasCookie = await tryLoginWithCookie(context);

        // 创建页面
        page = await context.newPage();

        if (hasCookie) {
            // 尝试直接访问首页
            console.log('🔍 验证 Cookie 有效性...');
            await page.goto(config.MT_INDEX_URL, { waitUntil: 'networkidle' });

            if (await checkLoginStatus(page)) {
                console.log('✅ Cookie 有效，已登录');
                const cookies = await extractCookies(context);
                return { success: true, cookies, page, browser, context };
            }

            console.log('⚠️ Cookie 已失效，需要重新登录');
        }

        // 访问登录页面
        console.log('📍 访问登录页面...');
        await page.goto(config.MT_LOGIN_URL, { waitUntil: 'networkidle' });

        // 执行登录
        await performLogin(page);

        // 检查设备验证
        if (await checkDeviceApproval(page)) {
            await handleDeviceApproval(page);
        }

        // 检查 2FA
        if (await check2FA(page)) {
            await handle2FA(page);
        }

        // 验证登录状态
        if (!(await checkLoginStatus(page))) {
            throw new Error('登录验证失败');
        }

        // 提取 Cookie
        const cookies = await extractCookies(context);

        console.log('✅ 登录成功');
        return { success: true, cookies, page, browser, context };

    } catch (error) {
        console.error('❌ 登录失败:', error.message);

        // 保存错误截图
        if (page) {
            const screenshotPath = '/tmp/error_screenshot.png';
            await page.screenshot({ path: screenshotPath, fullPage: true });
            await telegram.sendErrorNotice(error.message, screenshotPath);
        }

        // 清理资源
        if (browser) {
            await browser.close();
        }

        return { success: false, cookies: null, page: null, browser: null, context: null };
    }
}

/**
 * 关闭浏览器
 */
export async function closeBrowser(browser) {
    if (browser) {
        await browser.close();
        console.log('🌐 浏览器已关闭');
    }
}

export default {
    login,
    closeBrowser,
};

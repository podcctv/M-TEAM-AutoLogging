/**
 * 认证模块
 * 处理 M-TEAM 登录、设备验证和 2FA
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import config from './config.js';
import telegram from './telegram.js';

/**
 * 创建浏览器实例
 * @param {Object|null} storageState - 可选的会话状态
 */
async function createBrowser(storageState = null) {
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

    const contextOptions = {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 },
        locale: 'zh-CN',
        timezoneId: 'Asia/Shanghai',
    };

    // 如果有保存的会话状态，并且有效，则加载
    if (storageState) {
        // 简单的验证
        if (storageState.cookies || storageState.origins) {
            console.log('📦 加载已保存的 StorageState (Cookie + Storage)');
            contextOptions.storageState = storageState;
        }
    }

    const context = await browser.newContext(contextOptions);
    return { browser, context };
}

/**
 * 获取会话状态 (Cookie + LocalStorage)
 */
async function getSessionState() {
    // 1. 优先尝试读取本地文件
    try {
        if (fs.existsSync(config.STORAGE_PATH)) {
            const fileData = fs.readFileSync(config.STORAGE_PATH, 'utf8');
            if (fileData) {
                console.log(`📦 从文件加载会话状态: ${config.STORAGE_PATH}`);
                return JSON.parse(fileData);
            }
        }
    } catch (e) {
        console.log('⚠️ 读取会话文件失败:', e.message);
    }

    // 2. 尝试从环境变量读取 (兼容旧模式)
    if (config.MT_SESSION) {
        try {
            const session = JSON.parse(config.MT_SESSION);
            console.log('📦 从环境变量加载会话状态');
            return session;
        } catch (e) {
            console.log('⚠️ MT_SESSION 环境变量解析失败:', e.message);
        }
    }

    return null;
}

// ... (保持 tryLoginWithCookie, tryRestoreStorage 等辅助函数以备不时之需, 但主要逻辑已改变)
// 为了兼容性，我们可以保留旧的提取函数，但 login 流程将主要使用 snapshot

/**
 * 主登录流程
 */
export async function login() {
    let browser = null;
    let context = null;
    let page = null;

    try {
        // 初始化 Telegram updates
        await telegram.initUpdates();

        // 1. 获取保存的会话状态
        const savedDoc = await getSessionState();

        // 2. 创建浏览器 (带状态)
        console.log('🌐 启动浏览器...');
        const browserContext = await createBrowser(savedDoc);
        browser = browserContext.browser;
        context = browserContext.context;

        // 创建页面
        page = await context.newPage();

        // 3. 验证登录状态
        let isLoggedIn = false;

        if (savedDoc) {
            console.log('🔍 验证会话有效性...');
            try {
                await page.goto(config.MT_INDEX_URL, { waitUntil: 'networkidle' });

                // 检查是否有效
                if (await checkLoginStatus(page)) {
                    console.log('✅ 会话有效，已无需登录');
                    isLoggedIn = true;
                } else {
                    console.log('⚠️ 会话已失效，准备重新登录');
                }
            } catch (e) {
                console.log('⚠️ 验证会话时出错:', e.message);
            }
        }

        // 4. 如果未登录，执行登录流程
        if (!isLoggedIn) {
            console.log('📍 访问登录页面...');
            await page.goto(config.MT_LOGIN_URL, { waitUntil: 'networkidle' });

            await performLogin(page);

            // 检查设备验证 和 2FA
            if (await checkDeviceApproval(page)) {
                await handleDeviceApproval(page);
            }
            if (await check2FA(page)) {
                await handle2FA(page);
            }

            // 再次通过弹窗处理和检查
            await handleAnnouncements(page);

            if (!(await checkLoginStatus(page))) {
                throw new Error('登录验证失败');
            }
            console.log('✅ 登录成功');
        }

        // 5. 统一提取状态 (storageState)
        // 无论是否重新登录，都提取最新的状态
        console.log('💾 提取浏览器完整状态 (Cookies + Storage)...');
        const storageState = await context.storageState();

        // 为了兼容旧的日志显示，提取一下统计信息
        const cookiesCount = storageState.cookies ? storageState.cookies.length : 0;
        const originsCount = storageState.origins ? storageState.origins.length : 0;
        console.log(`📊 状态统计: Cookies(${cookiesCount}) + Origins(${originsCount})`);

        return {
            success: true,
            storageState: JSON.stringify(storageState), // 返回完整的 storageState JSON 字符串
            page,
            browser,
            context
        };

    } catch (error) {
        console.error('❌ 登录失败:', error.message);
        if (page) {
            const screenshotPath = '/tmp/error_screenshot.png';
            await page.screenshot({ path: screenshotPath, fullPage: true });
            await telegram.sendErrorNotice(error.message, screenshotPath);
        }
        if (browser) await browser.close();
        return { success: false, storageState: null, page: null, browser: null, context: null };
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
 * 处理公告弹窗 (Web组招募人员等)
 */
async function handleAnnouncements(page) {
    try {
        console.log('🔍 检查公告弹窗...');
        const confirmSelectors = [
            'button:has-text("確認")',
            'button:has-text("确认")',
            'button:has-text("Confirm")',
            'button:has-text("我知道了")',
            'button:has-text("Close")',
            '.ant-modal-footer button',
            'div[role="dialog"] button'
        ];

        for (const selector of confirmSelectors) {
            const button = await page.$(selector);
            if (button && await button.isVisible()) {
                console.log(`🖱️ 检测到公告弹窗，点击确认: ${selector}`);
                await button.click();
                await page.waitForTimeout(1000); // 等待弹窗消失
                return true;
            }
        }
    } catch (e) {
        console.log('⚠️ 处理弹窗时出错:', e.message);
    }
    return false;
}

/**
 * 检查是否需要 2FA 验证
 */
async function check2FA(page) {
    console.log('🔍 检查是否需要 2FA...');

    // 1. 如果已经登录成功，不需要 2FA
    // (防止首页出现包含 "验证" 字样的公告导致误判)
    try {
        if (await checkLoginStatus(page)) {
            console.log('✅ 已检测到登录状态，无需 2FA');
            return false;
        }
    } catch (e) { }

    // 2. 方法1: 通过选择器检查
    const tfaIndicators = [
        'input[placeholder*="6位"]',
        'input[placeholder*="验证码"]',
        'input[placeholder*="数字"]',
        'input[name*="2fa"]',
        'input[name*="totp"]',
        'input[name*="otp"]',
        'input[name*="code"]',
        'input[type="text"][maxlength="6"]',
    ];

    for (const selector of tfaIndicators) {
        const element = await page.$(selector);
        if (element && await element.isVisible()) {
            console.log(`🔐 检测到 2FA 验证页面 (选择器匹配: ${selector})`);
            return true;
        }
    }

    // 3. 方法2: 检查页面文本内容
    // 注意：增加上下文检查，避免匹配到公告内容
    const pageContent = await page.content();
    const tfaTexts = [
        '输入6位',
        '6位数字',
        '验证码',
        '邮箱验证码',
        '其他验证码',
        '两步验证',
        '双重认证',
        'TOTP',
    ];

    // 排除特定场景 (如招募公告)
    if (pageContent.includes('招募人员') || pageContent.includes('招聘')) {
        console.log('ℹ️ 检测到招募公告，忽略文本匹配');
    } else {
        for (const text of tfaTexts) {
            if (pageContent.includes(text)) {
                // 二次确认：应该有输入框
                const input = await page.$('input');
                if (input) {
                    console.log(`🔐 检测到 2FA 验证页面 (文本匹配: ${text})`);
                    return true;
                }
            }
        }
    }

    return false;
}

/**
 * 处理 2FA 验证 (支持最多 10 次重试)
 */
async function handle2FA(page) {
    console.log('⏳ 处理 2FA 验证...');

    const MAX_ATTEMPTS = 10;
    let attempt = 0;

    while (attempt < MAX_ATTEMPTS) {
        attempt++;
        console.log(`🔄 2FA 验证尝试 ${attempt}/${MAX_ATTEMPTS}`);

        // 构建提示消息
        let prompt = `🔐 *M-TEAM 需要 2FA 验证*\n\n`;
        if (attempt > 1) {
            prompt += `⚠️ 第 ${attempt} 次尝试 (剩余 ${MAX_ATTEMPTS - attempt + 1} 次机会)\n\n`;
        }
        prompt += `请回复 6 位数字验证码:\n• 直接发送: \`123456\`\n• 或命令: \`/mtcode 123456\`\n\n⏰ 等待时间: 2 分钟`;

        // 请求用户输入验证码
        const code = await telegram.waitForVerificationCode(prompt, config.TFA_TIMEOUT);

        if (!code) {
            throw new Error('2FA 验证码输入超时');
        }

        // 查找验证码输入框
        const inputElement = await findCodeInput(page);
        if (!inputElement) {
            // 关键修复：如果在输入验证码前，页面已经跳转或变成了公告，说明可能已经登录了
            // 尝试处理一下弹窗，然后检查登录状态
            await handleAnnouncements(page);
            if (await checkLoginStatus(page)) {
                console.log('✅ 检测到已经登录成功 (2FA 输入框消失)');
                return;
            }
            throw new Error('未找到验证码输入框');
        }

        // 清空并输入验证码
        await inputElement.click();
        await inputElement.fill('');
        await inputElement.fill(code);
        console.log('✅ 验证码已填入');

        // 等待一下确保输入完成
        await page.waitForTimeout(500);

        // 点击提交按钮
        await clickSubmitButton(page, inputElement);

        // 等待页面响应
        await page.waitForTimeout(3000);
        await page.waitForLoadState('networkidle');

        // 关键修复：提交后先处理弹窗
        await handleAnnouncements(page);

        // 关键修复：提交后优先检查是否已登录
        if (await checkLoginStatus(page)) {
            console.log('✅ 登录状态确认，跳出 2FA 循环');
            return;
        }

        // 只有未登录，才检查是否还需要 2FA
        const stillNeed2FA = await check2FA(page);
        if (!stillNeed2FA) {
            console.log('✅ 2FA 验证通过 (不再显示验证框)');
            return;
        }

        // 检查错误消息
        const errorMsg = await getErrorMessage(page);
        if (errorMsg) {
            console.log(`❌ 验证失败: ${errorMsg}`);
            await telegram.sendMessage(`❌ *验证失败*\n\n${errorMsg}\n\n请重新输入验证码...`);
        } else {
            await telegram.sendMessage('❌ 验证码无效，请重新输入...');
        }
    }

    throw new Error(`2FA 验证失败，已超过最大尝试次数 (${MAX_ATTEMPTS} 次)`);
}

/**
 * 查找验证码输入框
 */
async function findCodeInput(page) {
    const inputSelectors = [
        'input[placeholder*="6位"]',
        'input[placeholder*="验证码"]',
        'input[placeholder*="数字"]',
        'input[type="text"][maxlength="6"]',
        'input[name*="code"]',
        'input[name*="2fa"]',
        'input[name*="totp"]',
        'input[name*="otp"]',
        'input[type="text"]:not([name="username"]):not([name="password"])',
    ];

    for (const selector of inputSelectors) {
        try {
            const element = await page.$(selector);
            if (element) {
                console.log(`📝 找到验证码输入框: ${selector}`);
                return element;
            }
        } catch (e) {
            // 继续
        }
    }
    return null;
}

/**
 * 点击提交按钮
 */
async function clickSubmitButton(page, inputElement) {
    const submitSelectors = [
        'button:has-text("登 录")',
        'button:has-text("登录")',
        'button:has-text("验证")',
        'button:has-text("确认")',
        'button:has-text("提交")',
        'button[type="submit"]',
        'input[type="submit"]',
    ];

    for (const selector of submitSelectors) {
        try {
            const button = await page.$(selector);
            if (button) {
                console.log(`🖱️ 点击提交按钮: ${selector}`);
                await button.click();
                return;
            }
        } catch (e) {
            // 继续
        }
    }

    // 备用方法: 按回车键
    console.log('⚠️ 未找到提交按钮，尝试按回车键...');
    await inputElement.press('Enter');
}

/**
 * 获取页面错误消息
 */
async function getErrorMessage(page) {
    try {
        const errorSelectors = [
            '.error',
            '.alert-danger',
            '.message-error',
            '.ant-message-error',
            '[class*="error"]',
        ];

        // 检查页面文本
        const pageText = await page.evaluate(() => document.body.innerText);

        // 匹配常见错误消息
        const errorPatterns = [
            /两步验证未通过[，,]?(.+)/,
            /验证码错误(.+)?/,
            /验证失败(.+)?/,
            /您还有(\d+)次机会/,
        ];

        for (const pattern of errorPatterns) {
            const match = pageText.match(pattern);
            if (match) {
                return match[0];
            }
        }

        // 尝试从元素获取
        for (const selector of errorSelectors) {
            const el = await page.$(selector);
            if (el) {
                const text = await el.textContent();
                if (text && text.includes('验证') || text.includes('错误') || text.includes('失败')) {
                    return text.trim();
                }
            }
        }
    } catch (e) {
        // 忽略
    }
    return null;
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
/**
 * 检查登录状态
 */
async function checkLoginStatus(page) {
    const url = page.url();
    console.log(`🔍 检查登录状态: ${url}`);

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

        console.log('⚠️ 检测到仍在登录页面');
        return false;
    }

    // 检查是否有用户相关元素
    const userIndicators = [
        'a[href*="userdetails"]',
        '.username',
        '#userinfo',
        // 可能的新版选择器
        'div[class*="user-profile"]',
        'span[class*="avatar"]'
    ];

    // 尝试处理遮挡的弹窗
    await handleAnnouncements(page);

    // 0. 优先检查标题 (最准确)
    // 如果标题包含 "首页" 或 "M-Team"，且 URL 不包含 login，基本就是登录了
    try {
        const title = await page.title();
        if ((title.includes('M-Team') || title.includes('首頁') || title.includes('首页')) && !url.includes('login')) {
            console.log(`✅ 登录状态确认 (标题匹配: ${title})`);
            return true;
        }
    } catch (e) { }

    for (const selector of userIndicators) {
        try {
            const element = await page.$(selector);
            if (element) {
                console.log(`✅ 登录状态确认 (匹配: ${selector})`);
                return true;
            }
        } catch (e) { }
    }

    // 截图调试
    console.log('⚠️ 未找到用户元素，当前页面标题:', await page.title());
    await page.screenshot({ path: '/tmp/login_check_fail.png' });
    return !url.includes('login');
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

/**
 * 保存会话状态到文件
 */
export async function saveSessionState(storageState) {
    try {
        const sessionStr = JSON.stringify(storageState, null, 2);

        // 确保目录存在 (使用 path 模块保证跨平台兼容性)
        const dir = path.dirname(config.STORAGE_PATH);
        if (dir && !fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(config.STORAGE_PATH, sessionStr);
        console.log(`💾 会话状态已保存到本地: ${config.STORAGE_PATH}`);
        return true;
    } catch (e) {
        console.error('❌ 保存会话状态失败:', e.message);
        return false;
    }
}

export default {
    login,
    closeBrowser,
    saveSessionState
};

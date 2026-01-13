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
 * 恢复 LocalStorage (及 SessionStorage)
 */
async function tryRestoreStorage(page) {
    if (!config.MT_STORAGE) {
        console.log('📝 无已保存的 LocalStorage');
        return false;
    }

    try {
        const fullStorage = JSON.parse(config.MT_STORAGE);

        // 分离 SessionStorage 和 LocalStorage
        const sessionStorageData = fullStorage._session_storage_dump || null;
        const localStorageData = { ...fullStorage };
        delete localStorageData._session_storage_dump;

        // 恢复 LocalStorage
        await page.evaluate((data) => {
            for (const [key, value] of Object.entries(data)) {
                localStorage.setItem(key, value);
            }
        }, localStorageData);
        console.log(`💾 已恢复 LocalStorage (${Object.keys(localStorageData).length} 项)`);

        // 恢复 SessionStorage (如果有)
        if (sessionStorageData) {
            await page.evaluate((data) => {
                for (const [key, value] of Object.entries(data)) {
                    sessionStorage.setItem(key, value);
                }
            }, sessionStorageData);
            console.log(`💾 已恢复 SessionStorage (${Object.keys(sessionStorageData).length} 项)`);
        }

        return true;
    } catch (error) {
        console.log('⚠️ LocalStorage 解析失败:', error.message);
        return false;
    }
}

/**
 * 提取 LocalStorage (及 SessionStorage)
 * 注意：过滤掉过大的值，以避免超过 GitHub Secrets 限制 (64KB)
 */
async function extractStorage(page) {
    try {
        // 提取 SessionStorage
        const sessionStorageData = await page.evaluate(() => {
            const data = {};
            for (let i = 0; i < sessionStorage.length; i++) {
                const key = sessionStorage.key(i);
                data[key] = sessionStorage.getItem(key);
            }
            return data;
        });

        // 提取 LocalStorage
        const localStorageData = await page.evaluate(() => {
            const data = {};
            const MAX_VALUE_SIZE = 2048; // 2KB 限制

            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                const value = localStorage.getItem(key);

                if (value && value.length > MAX_VALUE_SIZE) {
                    console.warn(`[LocalStorage] ⚠️ 忽略大文件: ${key} (${value.length} 字符)`);
                    continue;
                }

                data[key] = value;
            }
            return data;
        });

        // 合并数据 (SessionStorage 放在特殊键下)
        const fullStorage = {
            ...localStorageData,
            _session_storage_dump: sessionStorageData
        };

        const lsCount = Object.keys(localStorageData).length;
        const ssCount = Object.keys(sessionStorageData).length;

        console.log(`💾 Storage 提取: LS(${lsCount}) + SS(${ssCount})`);

        // 简单的大小检查
        const payload = JSON.stringify(fullStorage);
        if (payload.length > 50000) {
            console.warn(`⚠️ Storage 数据量较大 (${Math.round(payload.length / 1024)}KB)，接近 GitHub Secrets 限制`);
        }

        return payload;
    } catch (error) {
        console.log('⚠️ Storage 提取失败:', error.message);
        return null;
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
 * 提取 Cookie (使用 CDP 获取更完整的 Cookie)
 */
async function extractCookies(context, page = null) {
    try {
        let cookies = [];

        // 优先使用 CDP 获取 (能获取 HttpOnly 和 Secure Cookie)
        if (page) {
            try {
                const client = await page.context().newCDPSession(page);
                const response = await client.send('Network.getAllCookies');
                if (response && response.cookies) {
                    // 转换 CDP Cookie 格式为 Playwright 格式
                    cookies = response.cookies.map(c => ({
                        name: c.name,
                        value: c.value,
                        domain: c.domain,
                        path: c.path,
                        expires: c.expires,
                        httpOnly: c.httpOnly,
                        secure: c.secure,
                        sameSite: c.sameSite
                    }));
                    console.log(`🍪 通过 CDP 提取到 ${cookies.length} 个 Cookie`);
                }
            } catch (cdpError) {
                console.warn('⚠️ CDP 提取失败，回退到常规方法:', cdpError.message);
            }
        }

        // 如果 CDP 失败或没获取到，使用常规方法补救
        if (cookies.length === 0) {
            cookies = await context.cookies();
            console.log(`🍪 常规方法提取到 ${cookies.length} 个 Cookie`);
        }

        const cookieNames = cookies.map(c => c.name).join(', ');
        console.log(`🍪 最终 Cookie 清单: ${cookieNames || '无'}`);

        return JSON.stringify(cookies);
    } catch (error) {
        console.error('❌ Cookie 提取出错:', error.message);
        return '[]';
    }
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

            // 恢复 LocalStorage
            await tryRestoreStorage(page);
            await page.reload({ waitUntil: 'networkidle' });

            if (await checkLoginStatus(page)) {
                console.log('✅ Cookie 有效，已登录');
                const cookies = await extractCookies(context, page);
                const storage = await extractStorage(page);
                return { success: true, cookies, storage, page, browser, context };
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

        // 提取 Cookie 和 LocalStorage
        // 提取 Cookie 和 LocalStorage
        const cookies = await extractCookies(context, page);
        const storage = await extractStorage(page);

        console.log('✅ 登录成功');
        return { success: true, cookies, storage, page, browser, context };

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

        return { success: false, cookies: null, storage: null, page: null, browser: null, context: null };
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
    extractCookies,
    extractStorage
};

/**
 * 数据抓取模块
 * 从 M-TEAM 页面提取用户信息
 */

import config from './config.js';

/**
 * 格式化文件大小
 * @param {string} sizeStr - 原始大小字符串
 * @returns {string} - 格式化后的大小
 */
function formatSize(sizeStr) {
    if (!sizeStr) return 'N/A';
    // 清理并返回大小字符串
    return sizeStr.replace(/\s+/g, ' ').trim();
}

/**
 * 解析比率
 * @param {string} ratioStr - 比率字符串
 * @returns {string} - 格式化的比率
 */
function parseRatio(ratioStr) {
    if (!ratioStr) return 'N/A';

    // 处理无穷大比率
    if (ratioStr.includes('∞') || ratioStr.toLowerCase().includes('inf')) {
        return '∞';
    }

    return ratioStr.trim();
}

/**
 * 抓取用户数据
 * @param {import('playwright').Page} page - Playwright 页面对象
 * @returns {object} - 用户数据
 */
export async function scrapeUserData(page) {
    console.log('📊 开始抓取用户数据...');

    try {
        // 确保在首页或用户详情页
        const currentUrl = page.url();
        if (!currentUrl.includes('index') && !currentUrl.includes('userdetails')) {
            await page.goto(config.MT_INDEX_URL, { waitUntil: 'networkidle' });
        }

        // 抓取页面数据
        const userData = await page.evaluate(() => {
            const data = {
                username: null,
                level: null,
                uploaded: null,
                downloaded: null,
                ratio: null,
                bonus: null,
                hasNewMessage: false,
            };

            // 用户名
            const usernameEl = document.querySelector('a[href*="userdetails"] b, .username, #userinfo a');
            if (usernameEl) {
                data.username = usernameEl.textContent.trim();
            }

            // 用户信息区域
            const userInfoText = document.body.innerText;

            // 上传量
            const uploadMatch = userInfoText.match(/上[传傳]量?[：:\s]*([0-9.,]+\s*[TGMKB]+)/i);
            if (uploadMatch) {
                data.uploaded = uploadMatch[1];
            }

            // 下载量
            const downloadMatch = userInfoText.match(/下[载載]量?[：:\s]*([0-9.,]+\s*[TGMKB]+)/i);
            if (downloadMatch) {
                data.downloaded = downloadMatch[1];
            }

            // 分享率
            const ratioMatch = userInfoText.match(/分享率[：:\s]*([0-9.,∞]+)/i);
            if (ratioMatch) {
                data.ratio = ratioMatch[1];
            }

            // 魔力值
            const bonusMatch = userInfoText.match(/魔力[值点點]?[：:\s]*([0-9.,]+)/i);
            if (bonusMatch) {
                data.bonus = bonusMatch[1];
            }

            // 等级
            const levelEl = document.querySelector('img[class*="rank"], img[src*="class"]');
            if (levelEl) {
                data.level = levelEl.getAttribute('title') || levelEl.getAttribute('alt') || 'N/A';
            }

            // 新消息检测
            const messageIndicators = [
                'a[href*="messages"] .new',
                '.new-message',
                'a[href*="inbox"]:has(.unread)',
            ];

            for (const selector of messageIndicators) {
                const el = document.querySelector(selector);
                if (el) {
                    data.hasNewMessage = true;
                    break;
                }
            }

            // 备用方案：检查消息链接的数字
            const inboxLink = document.querySelector('a[href*="messages"], a[href*="inbox"]');
            if (inboxLink && /\(\d+\)/.test(inboxLink.textContent)) {
                data.hasNewMessage = true;
            }

            return data;
        });

        // 格式化数据
        const formattedData = {
            username: userData.username || 'Unknown',
            level: userData.level || 'N/A',
            uploaded: formatSize(userData.uploaded),
            downloaded: formatSize(userData.downloaded),
            ratio: parseRatio(userData.ratio),
            bonus: userData.bonus || 'N/A',
            hasNewMessage: userData.hasNewMessage,
        };

        console.log('✅ 用户数据抓取完成');
        console.log('   用户名:', formattedData.username);
        console.log('   等级:', formattedData.level);
        console.log('   上传:', formattedData.uploaded);
        console.log('   下载:', formattedData.downloaded);
        console.log('   比率:', formattedData.ratio);
        console.log('   魔力值:', formattedData.bonus);

        return formattedData;

    } catch (error) {
        console.error('❌ 数据抓取失败:', error.message);
        return {
            username: 'Error',
            level: 'N/A',
            uploaded: 'N/A',
            downloaded: 'N/A',
            ratio: 'N/A',
            bonus: 'N/A',
            hasNewMessage: false,
        };
    }
}

/**
 * 抓取更详细的用户信息 (从用户详情页)
 * @param {import('playwright').Page} page 
 */
export async function scrapeDetailedUserData(page) {
    console.log('📊 抓取详细用户信息...');

    try {
        // 查找用户详情链接
        const userDetailsLink = await page.$('a[href*="userdetails"]');
        if (userDetailsLink) {
            await userDetailsLink.click();
            await page.waitForLoadState('networkidle');
        }

        const detailedData = await page.evaluate(() => {
            const data = {};
            const pageText = document.body.innerText;

            // 注册时间
            const regMatch = pageText.match(/注册日期[：:\s]*(.+?)(?:\n|$)/);
            if (regMatch) {
                data.registrationDate = regMatch[1].trim();
            }

            // 最后访问
            const lastAccessMatch = pageText.match(/最[后後]访问[：:\s]*(.+?)(?:\n|$)/);
            if (lastAccessMatch) {
                data.lastAccess = lastAccessMatch[1].trim();
            }

            // 做种数量
            const seedingMatch = pageText.match(/做种数?[：:\s]*(\d+)/);
            if (seedingMatch) {
                data.seedingCount = seedingMatch[1];
            }

            // 下载数量
            const leechingMatch = pageText.match(/下载中?[：:\s]*(\d+)/);
            if (leechingMatch) {
                data.leechingCount = leechingMatch[1];
            }

            return data;
        });

        return detailedData;

    } catch (error) {
        console.error('⚠️ 详细信息抓取失败:', error.message);
        return {};
    }
}

export default {
    scrapeUserData,
    scrapeDetailedUserData,
};

/**
 * 数据抓取模块
 * 从 M-TEAM 页面提取用户信息
 */

import config from './config.js';

/**
 * 格式化文件大小
 */
function formatSize(sizeStr) {
    if (!sizeStr) return 'N/A';
    return sizeStr.replace(/\s+/g, ' ').trim();
}

/**
 * 解析比率
 */
function parseRatio(ratioStr) {
    if (!ratioStr) return 'N/A';
    if (ratioStr.includes('∞') || ratioStr.toLowerCase().includes('inf')) {
        return '∞';
    }
    return ratioStr.trim();
}

/**
 * 抓取用户数据 (导航到用户详情页获取完整信息)
 * @param {import('playwright').Page} page - Playwright 页面对象
 * @returns {object} - 用户数据
 */
export async function scrapeUserData(page) {
    console.log('📊 开始抓取用户数据...');

    try {
        // 确保在首页
        const currentUrl = page.url();
        if (!currentUrl.includes('index') && !currentUrl.includes('userdetails')) {
            await page.goto(config.MT_INDEX_URL, { waitUntil: 'networkidle' });
        }

        // 首先从首页获取基本信息
        console.log('📍 从首页获取基本信息...');
        const basicData = await page.evaluate(() => {
            const data = {
                username: null,
                bonus: null,
                hasNewMessage: false,
            };

            const pageText = document.body.innerText;

            // 用户名 - 从页面左上角获取 (格式: SuperFlanker[退出])
            const usernameMatch = pageText.match(/^([A-Za-z0-9_]+)\[退出\]/m) ||
                pageText.match(/([A-Za-z0-9_]+)\s*\[退出\]/);
            if (usernameMatch) {
                data.username = usernameMatch[1];
            }

            // 魔力值 - 从首页获取 (格式: 魔力值 [使用]: 68)
            const bonusMatch = pageText.match(/魔力值\s*\[使用\][：:\s]*([0-9.,]+)/);
            if (bonusMatch) {
                data.bonus = bonusMatch[1];
            }

            // 检测新消息
            const messageEl = document.querySelector('a[href*="messages"], a[href*="inbox"]');
            if (messageEl && /\(\d+\)/.test(messageEl.textContent)) {
                data.hasNewMessage = true;
            }

            return data;
        });

        // 点击用户名进入详情页
        console.log('📍 导航到用户详情页...');
        const userLink = await page.$('a[href*="userdetails"]');
        if (userLink) {
            await userLink.click();
            await page.waitForLoadState('networkidle');
            await page.waitForTimeout(1000);
        }

        // 从详情页获取完整信息
        console.log('📍 从详情页获取详细信息...');
        const detailData = await page.evaluate(() => {
            const data = {
                username: null,
                level: null,
                uploaded: null,
                downloaded: null,
                ratio: null,
                bonus: null,
                bonusPerHour: null,
                btClient: null,
                ipv4: null,
                ipv6: null,
                seedTime: null,
                downloadTime: null,
            };

            const pageText = document.body.innerText;

            // 用户名 - 从页面标题或表格
            const usernameMatch = pageText.match(/用[户戶]名[：:\s]*([A-Za-z0-9_]+)/);
            if (usernameMatch) {
                data.username = usernameMatch[1];
            }

            // 等级 - 从 img 的 alt 或 title 属性
            const levelImg = document.querySelector('img[src*="class"], img[alt*="User"], img[title]');
            if (levelImg) {
                data.level = levelImg.getAttribute('alt') || levelImg.getAttribute('title') || null;
            }
            // 备用: 从文本匹配
            if (!data.level) {
                const levelMatch = pageText.match(/等[级級][：:\s]*([^\n]+)/);
                if (levelMatch) {
                    data.level = levelMatch[1].trim();
                }
            }

            // 传送信息 (分享率、上传量、下载量)
            // 格式: 傳送 分享率: 58.87 上傳量: 48.74 TB 下載量: 847.79 GB
            const ratioMatch = pageText.match(/分享率[：:\s]*([0-9.,∞]+)/);
            if (ratioMatch) {
                data.ratio = ratioMatch[1];
            }

            const uploadMatch = pageText.match(/上[传傳]量[：:\s]*([0-9.,]+\s*[TGMKB]+)/i);
            if (uploadMatch) {
                data.uploaded = uploadMatch[1];
            }

            const downloadMatch = pageText.match(/下[载載]量[：:\s]*([0-9.,]+\s*[TGMKB]+)/i);
            if (downloadMatch) {
                data.downloaded = downloadMatch[1];
            }

            // 魔力值和时魔
            // 格式: 魔力值 68,557.1 / 時魔 29.157
            const bonusMatch = pageText.match(/魔力[值点點]?[：:\s]*([0-9.,]+)/);
            if (bonusMatch) {
                data.bonus = bonusMatch[1];
            }

            const bonusPerHourMatch = pageText.match(/時魔[：:\s]*([0-9.,]+)/);
            if (bonusPerHourMatch) {
                data.bonusPerHour = bonusPerHourMatch[1];
            }

            // BT客户端信息
            // 格式: qBittorrent/5.1.2
            const clientMatch = pageText.match(/(qBittorrent|uTorrent|Transmission|Deluge|BitComet)[\/\s]*([0-9.]+)?/i);
            if (clientMatch) {
                data.btClient = clientMatch[0];
            }

            // IPv4 和 IPv6
            const ipv4Match = pageText.match(/IPv4[：:\s]*([0-9.*]+)/);
            if (ipv4Match) {
                data.ipv4 = ipv4Match[1];
            }

            const ipv6Match = pageText.match(/IPv6[：:\s]*([A-Fa-f0-9:.*]+|N\/A)/);
            if (ipv6Match) {
                data.ipv6 = ipv6Match[1];
            }

            // 做种时间和下载时间
            const seedTimeMatch = pageText.match(/做[种種]時間[：:\s]*([^\n]+)/);
            if (seedTimeMatch) {
                data.seedTime = seedTimeMatch[1].trim();
            }

            const downloadTimeMatch = pageText.match(/下[载載]時間[：:\s]*([^\n]+)/);
            if (downloadTimeMatch) {
                data.downloadTime = downloadTimeMatch[1].trim();
            }

            return data;
        });

        // 合并数据 (详情页优先)
        const formattedData = {
            username: detailData.username || basicData.username || 'Unknown',
            level: detailData.level || 'N/A',
            uploaded: formatSize(detailData.uploaded),
            downloaded: formatSize(detailData.downloaded),
            ratio: parseRatio(detailData.ratio),
            bonus: detailData.bonus || basicData.bonus || 'N/A',
            bonusPerHour: detailData.bonusPerHour || 'N/A',
            btClient: detailData.btClient || 'N/A',
            ipv4: detailData.ipv4 || 'N/A',
            ipv6: detailData.ipv6 || 'N/A',
            seedTime: detailData.seedTime || 'N/A',
            downloadTime: detailData.downloadTime || 'N/A',
            hasNewMessage: basicData.hasNewMessage,
        };

        console.log('✅ 用户数据抓取完成');
        console.log('   用户名:', formattedData.username);
        console.log('   等级:', formattedData.level);
        console.log('   上传:', formattedData.uploaded);
        console.log('   下载:', formattedData.downloaded);
        console.log('   比率:', formattedData.ratio);
        console.log('   魔力值:', formattedData.bonus);
        console.log('   时魔:', formattedData.bonusPerHour);
        console.log('   BT客户端:', formattedData.btClient);

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
            bonusPerHour: 'N/A',
            btClient: 'N/A',
            ipv4: 'N/A',
            ipv6: 'N/A',
            hasNewMessage: false,
        };
    }
}

export default {
    scrapeUserData,
};

/**
 * GitHub API 模块
 * 用于更新 Repository Secrets (Cookie 持久化)
 */

import { Octokit } from '@octokit/rest';
import _sodium from 'libsodium-wrappers';
import config from './config.js';

let octokit = null;

/**
 * 初始化 Octokit 客户端
 */
function getOctokit() {
    if (!octokit && config.REPO_TOKEN) {
        octokit = new Octokit({
            auth: config.REPO_TOKEN,
        });
    }
    return octokit;
}

/**
 * 解析仓库信息
 * @returns {{ owner: string, repo: string }}
 */
function parseRepository() {
    const [owner, repo] = config.GITHUB_REPOSITORY.split('/');
    if (!owner || !repo) {
        throw new Error('GITHUB_REPOSITORY 格式无效，应为 owner/repo');
    }
    return { owner, repo };
}

/**
 * 获取仓库的公钥 (用于加密 Secrets)
 */
async function getPublicKey() {
    const client = getOctokit();
    if (!client) {
        throw new Error('GitHub API 未初始化，请检查 REPO_TOKEN');
    }

    const { owner, repo } = parseRepository();
    const { data } = await client.rest.actions.getRepoPublicKey({
        owner,
        repo,
    });

    return {
        key: data.key,
        keyId: data.key_id,
    };
}

/**
 * 加密 Secret 值
 * @param {string} value - 要加密的值
 * @param {string} publicKey - Base64 编码的公钥
 * @returns {Promise<string>} - Base64 编码的加密值
 */
async function encryptSecret(value, publicKey) {
    await _sodium.ready;
    const sodium = _sodium;

    // 转换公钥为二进制
    const binkey = sodium.from_base64(publicKey, sodium.base64_variants.ORIGINAL);

    // 转换 secret 为二进制
    const binsec = sodium.from_string(value);

    // 加密
    const encBytes = sodium.crypto_box_seal(binsec, binkey);

    // 转换结果为 Base64
    const output = sodium.to_base64(encBytes, sodium.base64_variants.ORIGINAL);

    return output;
}

/**
 * 更新 GitHub Repository Secret
 * @param {string} secretName - Secret 名称
 * @param {string} secretValue - Secret 值
 */
export async function updateSecret(secretName, secretValue) {
    try {
        const client = getOctokit();
        if (!client) {
            console.log('⚠️ REPO_TOKEN 未配置，跳过 Secret 更新');
            return false;
        }

        const { owner, repo } = parseRepository();
        const { key, keyId } = await getPublicKey();

        const encryptedValue = await encryptSecret(secretValue, key);

        await client.rest.actions.createOrUpdateRepoSecret({
            owner,
            repo,
            secret_name: secretName,
            encrypted_value: encryptedValue,
            key_id: keyId,
        });

        console.log(`✅ Secret ${secretName} 已更新`);
        return true;
    } catch (error) {
        console.error(`❌ 更新 Secret ${secretName} 失败:`, error.message);
        throw error;
    }
}

/**
 * 更新 Cookie Secret
 * @param {string} cookieJson - Cookie JSON 字符串
 */
export async function updateCookieSecret(cookieJson) {
    return await updateSecret('MT_COOKIE', cookieJson);
}

/**
 * 更新 Storage Secret
 * @param {string} storageJson - LocalStorage JSON 字符串
 */
export async function updateStorageSecret(storageJson) {
    return await updateSecret('MT_STORAGE', storageJson);
}

export default {
    updateSecret,
    updateCookieSecret,
    updateStorageSecret,
};


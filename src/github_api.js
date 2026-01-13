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


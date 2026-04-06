/** 单条密码记录 */
export interface PasswordEntry {
  id: string;
  name: string;
  url?: string;
  username: string;
  password: string;
  notes?: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

/** 加密数据块 */
export interface EncryptedData {
  iv: string;        // base64
  ciphertext: string; // base64
}

/** 插件持久化数据（data.json） */
export interface PluginData {
  salt: string | null;
  verifyToken: EncryptedData | null;
  vault: EncryptedData | null;
  settings: PluginSettings;
}

/** 插件设置 */
export interface PluginSettings {
  autoLockMinutes: number;
  clipboardClearSeconds: number;
  defaultPasswordLength: number;
  passwordCharset: 'all' | 'alphanumeric' | 'alpha' | 'numeric';
}

/** 默认设置 */
export const DEFAULT_SETTINGS: PluginSettings = {
  autoLockMinutes: 5,
  clipboardClearSeconds: 30,
  defaultPasswordLength: 16,
  passwordCharset: 'all',
};

/** 默认持久化数据 */
export const DEFAULT_DATA: PluginData = {
  salt: null,
  verifyToken: null,
  vault: null,
  settings: { ...DEFAULT_SETTINGS },
};

/** 密码列表视图类型标识 */
export const VIEW_TYPE_PASSWORD_LIST = 'ohmypass-password-list';

/** 验证令牌明文（用于校验主密码正确性） */
export const VERIFY_PLAINTEXT = 'OHMYPASS_VERIFY_TOKEN_V1';

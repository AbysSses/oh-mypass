import { Plugin } from 'obsidian';
import { PasswordEntry, PluginData, DEFAULT_DATA, VERIFY_PLAINTEXT } from './types';
import { generateSalt, deriveKey, encrypt, decrypt } from './crypto';

/**
 * 数据存取层
 * 管理加密密码条目的 CRUD 操作和持久化
 */
export class PasswordStore {
  private plugin: Plugin;
  private data: PluginData = { ...DEFAULT_DATA };
  private key: CryptoKey | null = null;
  private entries: PasswordEntry[] = [];
  private lastActivity: number = Date.now();

  constructor(plugin: Plugin) {
    this.plugin = plugin;
  }

  /** 加载持久化数据 */
  async load(): Promise<void> {
    const saved = await this.plugin.loadData();
    if (saved) {
      this.data = { ...DEFAULT_DATA, ...saved };
    }
  }

  /** 保存持久化数据 */
  private async save(): Promise<void> {
    await this.plugin.saveData(this.data);
  }

  /** 是否首次使用（未设置主密码） */
  isFirstTime(): boolean {
    return this.data.salt === null;
  }

  /** 是否已解锁 */
  isUnlocked(): boolean {
    return this.key !== null;
  }

  /** 更新最后活动时间 */
  touch(): void {
    this.lastActivity = Date.now();
  }

  /** 检查是否应自动锁定 */
  shouldAutoLock(): boolean {
    const timeout = this.data.settings.autoLockMinutes * 60 * 1000;
    return Date.now() - this.lastActivity > timeout;
  }

  /** 获取设置 */
  getSettings() {
    return this.data.settings;
  }

  /** 更新设置 */
  async updateSettings(partial: Partial<typeof this.data.settings>): Promise<void> {
    this.data.settings = { ...this.data.settings, ...partial };
    await this.save();
  }

  // ── 主密码管理 ──

  /** 首次设置主密码 */
  async setup(password: string): Promise<void> {
    const salt = generateSalt();
    const key = await deriveKey(password, salt);
    const verifyToken = await encrypt(VERIFY_PLAINTEXT, key);

    this.data.salt = salt;
    this.data.verifyToken = verifyToken;
    this.data.vault = await encrypt(JSON.stringify([]), key);
    this.key = key;
    this.entries = [];
    this.touch();

    await this.save();
  }

  /** 用主密码解锁 */
  async unlock(password: string): Promise<boolean> {
    if (!this.data.salt || !this.data.verifyToken) return false;

    const key = await deriveKey(password, this.data.salt);
    const result = await decrypt(this.data.verifyToken, key);

    if (result !== VERIFY_PLAINTEXT) return false;

    this.key = key;

    // 解密 vault
    if (this.data.vault) {
      const json = await decrypt(this.data.vault, key);
      this.entries = json ? JSON.parse(json) : [];
    } else {
      this.entries = [];
    }

    this.touch();
    return true;
  }

  /** 锁定（清除内存中的密钥和明文数据） */
  lock(): void {
    this.key = null;
    this.entries = [];
  }

  /** 修改主密码 */
  async changePassword(oldPassword: string, newPassword: string): Promise<boolean> {
    if (!this.data.salt) return false;

    // 验证旧密码
    const oldKey = await deriveKey(oldPassword, this.data.salt);
    const verify = await decrypt(this.data.verifyToken!, oldKey);
    if (verify !== VERIFY_PLAINTEXT) return false;

    // 使用新密码重新加密
    const newSalt = generateSalt();
    const newKey = await deriveKey(newPassword, newSalt);
    const newVerifyToken = await encrypt(VERIFY_PLAINTEXT, newKey);
    const newVault = await encrypt(JSON.stringify(this.entries), newKey);

    this.data.salt = newSalt;
    this.data.verifyToken = newVerifyToken;
    this.data.vault = newVault;
    this.key = newKey;
    this.touch();

    await this.save();
    return true;
  }

  // ── CRUD ──

  /** 获取所有条目 */
  getEntries(): PasswordEntry[] {
    return [...this.entries];
  }

  /** 按 ID 获取条目 */
  getEntry(id: string): PasswordEntry | undefined {
    return this.entries.find(e => e.id === id);
  }

  /** 添加条目 */
  async addEntry(entry: Omit<PasswordEntry, 'id' | 'createdAt' | 'updatedAt'>): Promise<PasswordEntry> {
    const now = Date.now();
    const newEntry: PasswordEntry = {
      ...entry,
      id: this.generateId(),
      createdAt: now,
      updatedAt: now,
    };
    this.entries.push(newEntry);
    await this.persistVault();
    this.touch();
    return newEntry;
  }

  /** 更新条目 */
  async updateEntry(id: string, updates: Partial<Omit<PasswordEntry, 'id' | 'createdAt'>>): Promise<boolean> {
    const index = this.entries.findIndex(e => e.id === id);
    if (index === -1) return false;

    this.entries[index] = {
      ...this.entries[index],
      ...updates,
      updatedAt: Date.now(),
    };
    await this.persistVault();
    this.touch();
    return true;
  }

  /** 删除条目 */
  async deleteEntry(id: string): Promise<boolean> {
    const index = this.entries.findIndex(e => e.id === id);
    if (index === -1) return false;

    this.entries.splice(index, 1);
    await this.persistVault();
    this.touch();
    return true;
  }

  /** 智能导入：批量添加条目并自动去重/标记冲突 */
  async importEntries(entries: (Omit<PasswordEntry, 'id' | 'createdAt' | 'updatedAt'> & Partial<PasswordEntry>)[]): Promise<{ added: number; skipped: number }> {
    const exactSet = new Set<string>();
    const conflictSet = new Set<string>();

    // 预先计算现有库的特征
    for (const e of this.entries) {
      const baseKey = `${e.name}::${e.username}`;
      conflictSet.add(baseKey);
      exactSet.add(`${baseKey}::${e.password}`);
    }

    let added = 0;
    let skipped = 0;
    const now = Date.now();

    for (const entry of entries) {
      const baseKey = `${entry.name}::${entry.username}`;
      const exactKey = `${baseKey}::${entry.password}`;

      // 1. 完全相同，跳过（去重）
      if (exactSet.has(exactKey)) {
        skipped++;
        continue;
      }

      // 2. 存在冲突（名称和用户名相同，但密码不同），打标签
      if (conflictSet.has(baseKey)) {
        if (!entry.tags.includes('重复条目')) {
          entry.tags.push('重复条目');
        }
      }

      // 3. 作为新条目加入，生成新 ID 防止主键冲突
      this.entries.push({
        ...entry,
        id: this.generateId(),
        createdAt: entry.createdAt || now,
        updatedAt: entry.updatedAt || now,
      });

      // 更新 Set，防止单次导入的文件内部存在重复
      exactSet.add(exactKey);
      conflictSet.add(baseKey);
      added++;
    }

    await this.persistVault();
    this.touch();
    return { added, skipped };
  }

  // ── 标签 ──

  /** 获取所有唯一标签（从条目中动态汇总） */
  getAllTags(): string[] {
    const tagSet = new Set<string>();
    for (const entry of this.entries) {
      for (const tag of entry.tags) {
        tagSet.add(tag);
        // 同时添加父路径标签，例如 "工作/内部" → 也添加 "工作"
        const parts = tag.split('/');
        for (let i = 1; i < parts.length; i++) {
          tagSet.add(parts.slice(0, i).join('/'));
        }
      }
    }
    return Array.from(tagSet).sort();
  }

  /** 构建标签树结构 */
  getTagTree(): TagTreeNode[] {
    const tags = this.getAllTags();
    const root: TagTreeNode[] = [];

    for (const tag of tags) {
      const parts = tag.split('/');
      let current = root;
      let path = '';

      for (const part of parts) {
        path = path ? `${path}/${part}` : part;
        let node = current.find(n => n.name === part);
        if (!node) {
          node = { name: part, fullPath: path, children: [], count: 0 };
          current.push(node);
        }
        // 计算此标签下的条目数
        node.count = this.entries.filter(e =>
          e.tags.some(t => t === node!.fullPath || t.startsWith(node!.fullPath + '/'))
        ).length;
        current = node.children;
      }
    }

    return root;
  }

  // ── 搜索 ──

  /** 按关键词和标签过滤条目 */
  searchEntries(query: string, filterTag?: string): PasswordEntry[] {
    let results = this.entries;

    if (filterTag) {
      results = results.filter(e =>
        e.tags.some(t => t === filterTag || t.startsWith(filterTag + '/'))
      );
    }

    if (query.trim()) {
      const q = query.toLowerCase();
      results = results.filter(e =>
        e.name.toLowerCase().includes(q) ||
        e.username.toLowerCase().includes(q) ||
        (e.url && e.url.toLowerCase().includes(q)) ||
        (e.notes && e.notes.toLowerCase().includes(q)) ||
        e.tags.some(t => t.toLowerCase().includes(q))
      );
    }

    return results;
  }

  // ── 导出用：获取当前密钥 ──

  getKey(): CryptoKey | null {
    return this.key;
  }

  getRawData(): PluginData {
    return this.data;
  }



  // ── 内部方法 ──

  private async persistVault(): Promise<void> {
    if (!this.key) return;
    this.data.vault = await encrypt(JSON.stringify(this.entries), this.key);
    await this.save();
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  }
}

/** 标签树节点 */
export interface TagTreeNode {
  name: string;
  fullPath: string;
  children: TagTreeNode[];
  count: number;
}

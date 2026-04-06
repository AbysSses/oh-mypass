import { PasswordEntry, EncryptedData } from './types';
import { encrypt, decrypt, generateSalt, deriveKey } from './crypto';

/**
 * 导入/导出模块
 */

// ── CSV ──

/** 将条目导出为 CSV 字符串 */
export function entriesToCsv(entries: PasswordEntry[]): string {
  const headers = ['name', 'url', 'username', 'password', 'notes', 'tags'];
  const rows = entries.map(e => [
    csvEscape(e.name),
    csvEscape(e.url || ''),
    csvEscape(e.username),
    csvEscape(e.password),
    csvEscape(e.notes || ''),
    csvEscape(e.tags.join(';')),
  ].join(','));

  return [headers.join(','), ...rows].join('\n');
}

/** 从 CSV 字符串解析条目 */
export function csvToEntries(csv: string): Omit<PasswordEntry, 'id' | 'createdAt' | 'updatedAt'>[] {
  const lines = csv.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];

  // 解析表头，确定列映射
  const headers = parseCsvLine(lines[0]).map(h => h.toLowerCase().trim());
  const nameIdx = findHeaderIndex(headers, ['name', '名称', '服务', 'service', 'title']);
  const urlIdx = findHeaderIndex(headers, ['url', '网址', 'website', 'link']);
  const usernameIdx = findHeaderIndex(headers, ['username', '用户名', 'email', '邮箱', 'login', 'user']);
  const passwordIdx = findHeaderIndex(headers, ['password', '密码', 'pass']);
  const notesIdx = findHeaderIndex(headers, ['notes', '备注', 'note', 'comment', 'comments']);
  const tagsIdx = findHeaderIndex(headers, ['tags', '标签', 'tag', 'category', '分类', 'folder', 'group']);

  const entries: Omit<PasswordEntry, 'id' | 'createdAt' | 'updatedAt'>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const name = nameIdx >= 0 ? cols[nameIdx]?.trim() : '';
    const username = usernameIdx >= 0 ? cols[usernameIdx]?.trim() : '';
    const password = passwordIdx >= 0 ? cols[passwordIdx]?.trim() : '';

    if (!name && !username) continue; // 跳过完全空行
    if (!name && !password) continue; // 至少需要名称或（用户名+密码）
    if (!username && !password) continue; // 没有用户名和密码的条目无意义

      const url = urlIdx >= 0 ? cols[urlIdx]?.trim() : '';
      // 名称回退：优先用 name，否则从 URL 提取域名
      let displayName = name;
      if (!displayName && url) {
        try { displayName = new URL(url).hostname; } catch { displayName = url; }
      }

      entries.push({
        name: displayName || 'Untitled',
        url: url || undefined,
        username: username || '',
        password: password || '',
        notes: notesIdx >= 0 ? cols[notesIdx]?.trim() : undefined,
        tags: tagsIdx >= 0
          ? (cols[tagsIdx] || '').split(';').map(s => s.trim()).filter(Boolean)
          : [],
      });
  }

  return entries;
}

// ── 加密备份 ──

interface EncryptedBackup {
  version: 1;
  salt: string;
  verifyToken: EncryptedData;
  vault: EncryptedData;
}

/** 导出加密备份 */
export async function exportEncryptedBackup(
  entries: PasswordEntry[],
  password: string
): Promise<string> {
  const salt = generateSalt();
  const key = await deriveKey(password, salt);
  const verifyToken = await encrypt('OHMYPASS_BACKUP_V1', key);
  const vault = await encrypt(JSON.stringify(entries), key);

  const backup: EncryptedBackup = { version: 1, salt, verifyToken, vault };
  return JSON.stringify(backup, null, 2);
}

/** 导入加密备份 */
export async function importEncryptedBackup(
  json: string,
  password: string
): Promise<PasswordEntry[] | null> {
  try {
    const backup: EncryptedBackup = JSON.parse(json);
    if (backup.version !== 1) return null;

    const key = await deriveKey(password, backup.salt);
    const verify = await decrypt(backup.verifyToken, key);
    if (verify !== 'OHMYPASS_BACKUP_V1') return null;

    const vaultJson = await decrypt(backup.vault, key);
    if (!vaultJson) return null;

    return JSON.parse(vaultJson);
  } catch {
    return null;
  }
}

// ── CSV 工具函数 ──

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
  }
  result.push(current);
  return result;
}

function findHeaderIndex(headers: string[], candidates: string[]): number {
  for (const candidate of candidates) {
    const idx = headers.indexOf(candidate);
    if (idx >= 0) return idx;
  }
  return -1;
}

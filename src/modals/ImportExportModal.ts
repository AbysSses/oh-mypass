import { App, Modal, Setting, Notice } from 'obsidian';
import { PasswordStore } from '../store';
import { entriesToCsv, csvToEntries, exportEncryptedBackup, importEncryptedBackup } from '../importExport';

/**
 * 导入/导出 Modal
 */
export class ImportExportModal extends Modal {
  private store: PasswordStore;
  private onDone: () => void;

  constructor(app: App, store: PasswordStore, onDone: () => void) {
    super(app);
    this.store = store;
    this.onDone = onDone;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.addClass('ohmypass-modal');

    contentEl.createEl('h2', { text: '📦 导入 / 导出' });

    // ── 导出区域 ──
    contentEl.createEl('h3', { text: '导出' });

    new Setting(contentEl)
      .setName('导出为 CSV')
      .setDesc('导出所有密码为明文 CSV 文件（注意安全！）')
      .addButton(btn => {
        btn.setButtonText('导出 CSV')
          .setWarning()
          .onClick(() => {
            const entries = this.store.getEntries();
            if (entries.length === 0) {
              new Notice('没有密码条目可导出');
              return;
            }
            const csv = entriesToCsv(entries);
            this.downloadFile('ohmypass_export.csv', csv, 'text/csv');
            new Notice(`已导出 ${entries.length} 条记录`);
          });
      });

    new Setting(contentEl)
      .setName('导出加密备份')
      .setDesc('导出为加密 JSON 文件，使用当前主密码加密')
      .addButton(btn => {
        btn.setButtonText('导出备份')
          .onClick(async () => {
            const entries = this.store.getEntries();
            if (entries.length === 0) {
              new Notice('没有密码条目可导出');
              return;
            }
            // 弹出密码输入
            new BackupPasswordModal(this.app, '导出', async (password) => {
              const json = await exportEncryptedBackup(entries, password);
              this.downloadFile('ohmypass_backup.json', json, 'application/json');
              new Notice(`已加密导出 ${entries.length} 条记录`);
            }).open();
          });
      });

    // ── 导入区域 ──
    contentEl.createEl('h3', { text: '导入' });

    new Setting(contentEl)
      .setName('从 CSV 导入')
      .setDesc('支持主流密码管理器导出的 CSV 格式')
      .addButton(btn => {
        btn.setButtonText('选择 CSV 文件')
          .onClick(() => {
            this.pickFile('.csv', async (text) => {
              const entries = csvToEntries(text);
              if (entries.length === 0) {
                new Notice('未能解析任何密码条目，请检查 CSV 格式');
                return;
              }
              const result = await this.store.importEntries(entries);
              let msg = `成功导入 ${result.added} 条记录`;
              if (result.skipped > 0) msg += `，跳过 ${result.skipped} 条重复记录`;
              new Notice(msg);
              this.close();
              this.onDone();
            });
          });
      });

    new Setting(contentEl)
      .setName('从加密备份导入')
      .setDesc('导入 OhMyPass 加密备份文件')
      .addButton(btn => {
        btn.setButtonText('选择备份文件')
          .onClick(() => {
            this.pickFile('.json', async (text) => {
              new BackupPasswordModal(this.app, '导入', async (password) => {
                const entries = await importEncryptedBackup(text, password);
                if (!entries) {
                  new Notice('导入失败：密码错误或文件格式不正确');
                  return;
                }
                const result = await this.store.importEntries(entries);
                let msg = `成功从备份导入 ${result.added} 条记录`;
                if (result.skipped > 0) msg += `，跳过 ${result.skipped} 条重复记录`;
                new Notice(msg);
                this.close();
                this.onDone();
              }).open();
            });
          });
      });

    // 关闭按钮
    new Setting(contentEl)
      .addButton(btn => {
        btn.setButtonText('关闭').onClick(() => this.close());
      });
  }

  private downloadFile(filename: string, content: string, mimeType: string) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  private pickFile(accept: string, callback: (text: string) => void) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      const text = await file.text();
      callback(text);
    });
    input.click();
  }

  onClose() {
    this.contentEl.empty();
  }
}

/**
 * 备份密码输入 Modal
 */
class BackupPasswordModal extends Modal {
  private action: string;
  private password = '';
  private onSubmit: (password: string) => void;

  constructor(app: App, action: string, onSubmit: (password: string) => void) {
    super(app);
    this.action = action;
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.addClass('ohmypass-modal');

    contentEl.createEl('h2', { text: `🔑 ${this.action}密码` });
    contentEl.createEl('p', {
      text: this.action === '导出'
        ? '请设置备份加密密码（可与主密码不同）'
        : '请输入备份文件的加密密码',
    });

    new Setting(contentEl)
      .setName('密码')
      .addText(text => {
        text.inputEl.type = 'password';
        text.setPlaceholder('加密密码');
        text.onChange(v => { this.password = v; });
      });

    new Setting(contentEl)
      .addButton(btn => {
        btn.setButtonText('确认')
          .setCta()
          .onClick(() => {
            if (!this.password) return;
            this.close();
            this.onSubmit(this.password);
          });
      });
  }

  onClose() {
    this.contentEl.empty();
    this.password = '';
  }
}

import { App, Modal, Setting } from 'obsidian';
import { PasswordEntry } from '../types';
import { PasswordStore } from '../store';
import { generatePassword } from '../components/PasswordGenerator';

/**
 * 添加/编辑密码条目 Modal
 */
export class AddEditModal extends Modal {
  private store: PasswordStore;
  private entry: Partial<PasswordEntry>;
  private isEdit: boolean;
  private onSave: () => void;
  private tagsInput = '';

  constructor(app: App, store: PasswordStore, onSave: () => void, existing?: PasswordEntry) {
    super(app);
    this.store = store;
    this.onSave = onSave;
    this.isEdit = !!existing;

    if (existing) {
      this.entry = { ...existing };
      this.tagsInput = existing.tags.join(', ');
    } else {
      this.entry = { name: '', username: '', password: '', url: '', notes: '', tags: [] };
      this.tagsInput = '';
    }
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.addClass('ohmypass-modal');

    contentEl.createEl('h2', { text: this.isEdit ? '✏️ 编辑密码' : '➕ 添加密码' });

    const errorEl = contentEl.createEl('p', { cls: 'ohmypass-error' });

    new Setting(contentEl)
      .setName('服务名称')
      .setDesc('如 GitHub, Google, 微信')
      .addText(text => {
        text.setValue(this.entry.name || '')
          .setPlaceholder('服务名称')
          .onChange(v => { this.entry.name = v; });
      });

    new Setting(contentEl)
      .setName('网址')
      .addText(text => {
        text.setValue(this.entry.url || '')
          .setPlaceholder('https://example.com（可选）')
          .onChange(v => { this.entry.url = v; });
      });

    new Setting(contentEl)
      .setName('用户名 / 邮箱')
      .addText(text => {
        text.setValue(this.entry.username || '')
          .setPlaceholder('用户名或邮箱')
          .onChange(v => { this.entry.username = v; });
      });

    // 密码行：输入 + 生成按钮
    const pwSetting = new Setting(contentEl)
      .setName('密码');

    let pwInput: HTMLInputElement;
    pwSetting.addText(text => {
      text.inputEl.type = 'password';
      text.setValue(this.entry.password || '')
        .setPlaceholder('密码')
        .onChange(v => { this.entry.password = v; });
      pwInput = text.inputEl;
    });

    pwSetting.addButton(btn => {
      btn.setIcon('eye')
        .setTooltip('显示/隐藏密码')
        .onClick(() => {
          pwInput.type = pwInput.type === 'password' ? 'text' : 'password';
        });
    });

    pwSetting.addButton(btn => {
      btn.setIcon('dice')
        .setTooltip('生成随机密码')
        .onClick(() => {
          const settings = this.store.getSettings();
          const pw = generatePassword(settings.defaultPasswordLength, settings.passwordCharset);
          this.entry.password = pw;
          pwInput.value = pw;
          pwInput.type = 'text'; // 显示生成的密码
        });
    });

    // 标签
    const allTags = this.store.getAllTags();
    new Setting(contentEl)
      .setName('标签')
      .setDesc('多个标签用逗号分隔，支持嵌套如 "工作/内部"')
      .addText(text => {
        text.setValue(this.tagsInput)
          .setPlaceholder('社交, 工作/内部系统')
          .onChange(v => { this.tagsInput = v; });
      });

    // 显示已有标签作为快速选择
    if (allTags.length > 0) {
      const tagContainer = contentEl.createDiv({ cls: 'ohmypass-tag-suggestions' });
      tagContainer.createEl('small', { text: '已有标签（点击添加）：' });
      const tagList = tagContainer.createDiv({ cls: 'ohmypass-tag-list' });
      for (const tag of allTags) {
        const tagEl = tagList.createEl('span', { text: tag, cls: 'ohmypass-tag-chip' });
        tagEl.addEventListener('click', () => {
          const current = this.tagsInput.split(',').map(s => s.trim()).filter(Boolean);
          if (!current.includes(tag)) {
            current.push(tag);
            this.tagsInput = current.join(', ');
            // 更新输入框
            const input = contentEl.querySelector('.ohmypass-tag-suggestions')
              ?.previousElementSibling?.querySelector('input');
            if (input) (input as HTMLInputElement).value = this.tagsInput;
          }
        });
      }
    }

    new Setting(contentEl)
      .setName('备注')
      .addTextArea(text => {
        text.setValue(this.entry.notes || '')
          .setPlaceholder('备注信息（可选）')
          .onChange(v => { this.entry.notes = v; });
        text.inputEl.rows = 3;
      });

    new Setting(contentEl)
      .addButton(btn => {
        btn.setButtonText('取消')
          .onClick(() => this.close());
      })
      .addButton(btn => {
        btn.setButtonText(this.isEdit ? '保存修改' : '添加')
          .setCta()
          .onClick(async () => {
            if (!this.entry.name?.trim()) {
              errorEl.setText('服务名称不能为空');
              return;
            }
            if (!this.entry.username?.trim()) {
              errorEl.setText('用户名不能为空');
              return;
            }
            if (!this.entry.password?.trim()) {
              errorEl.setText('密码不能为空');
              return;
            }

            // 解析标签
            const tags = this.tagsInput
              .split(',')
              .map(s => s.trim())
              .filter(Boolean);

            if (this.isEdit && this.entry.id) {
              await this.store.updateEntry(this.entry.id, {
                name: this.entry.name,
                url: this.entry.url,
                username: this.entry.username,
                password: this.entry.password,
                notes: this.entry.notes,
                tags,
              });
            } else {
              await this.store.addEntry({
                name: this.entry.name!,
                url: this.entry.url,
                username: this.entry.username!,
                password: this.entry.password!,
                notes: this.entry.notes,
                tags,
              });
            }

            this.close();
            this.onSave();
          });
      });
  }

  onClose() {
    this.contentEl.empty();
  }
}

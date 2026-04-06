import { App, Modal, Setting } from 'obsidian';

/**
 * 首次设置主密码 Modal
 */
export class SetupModal extends Modal {
  private password = '';
  private confirm = '';
  private onSubmit: (password: string) => void;

  constructor(app: App, onSubmit: (password: string) => void) {
    super(app);
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.addClass('ohmypass-modal');

    contentEl.createEl('h2', { text: '🔐 设置主密码' });
    contentEl.createEl('p', {
      text: '主密码用于加密你的所有密码数据。请务必牢记，遗忘后数据不可恢复。',
      cls: 'ohmypass-modal-desc',
    });

    new Setting(contentEl)
      .setName('主密码')
      .setDesc('至少 6 个字符')
      .addText(text => {
        text.inputEl.type = 'password';
        text.inputEl.placeholder = '输入主密码';
        text.onChange(v => { this.password = v; });
      });

    new Setting(contentEl)
      .setName('确认密码')
      .addText(text => {
        text.inputEl.type = 'password';
        text.inputEl.placeholder = '再次输入主密码';
        text.onChange(v => { this.confirm = v; });
      });

    const errorEl = contentEl.createEl('p', { cls: 'ohmypass-error' });

    new Setting(contentEl)
      .addButton(btn => {
        btn.setButtonText('确认设置')
          .setCta()
          .onClick(() => {
            if (this.password.length < 6) {
              errorEl.setText('密码长度至少 6 个字符');
              return;
            }
            if (this.password !== this.confirm) {
              errorEl.setText('两次输入的密码不一致');
              return;
            }
            const pw = this.password;
            this.close();
            this.onSubmit(pw);
          });
      });
  }

  onClose() {
    this.contentEl.empty();
    this.password = '';
    this.confirm = '';
  }
}

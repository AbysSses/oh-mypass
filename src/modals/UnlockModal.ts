import { App, Modal, Setting } from 'obsidian';

/**
 * 解锁输入主密码 Modal
 */
export class UnlockModal extends Modal {
  private password = '';
  private onSubmit: (password: string) => Promise<boolean>;

  constructor(app: App, onSubmit: (password: string) => Promise<boolean>) {
    super(app);
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.addClass('ohmypass-modal');

    contentEl.createEl('h2', { text: '🔓 解锁密码库' });
    contentEl.createEl('p', {
      text: '输入主密码以访问你的密码数据。',
      cls: 'ohmypass-modal-desc',
    });

    const errorEl = contentEl.createEl('p', { cls: 'ohmypass-error' });

    new Setting(contentEl)
      .setName('主密码')
      .addText(text => {
        text.inputEl.type = 'password';
        text.inputEl.placeholder = '输入主密码';
        text.onChange(v => { this.password = v; });

        // 回车提交
        text.inputEl.addEventListener('keydown', async (e) => {
          if (e.key === 'Enter') {
            await this.tryUnlock(errorEl);
          }
        });

        // 自动聚焦
        setTimeout(() => text.inputEl.focus(), 50);
      });

    new Setting(contentEl)
      .addButton(btn => {
        btn.setButtonText('解锁')
          .setCta()
          .onClick(async () => {
            await this.tryUnlock(errorEl);
          });
      });
  }

  private async tryUnlock(errorEl: HTMLElement) {
    if (!this.password) {
      errorEl.setText('请输入主密码');
      return;
    }
    errorEl.setText('正在验证...');
    const success = await this.onSubmit(this.password);
    if (!success) {
      errorEl.setText('密码错误，请重试');
      this.password = '';
    } else {
      this.close();
    }
  }

  onClose() {
    this.contentEl.empty();
    this.password = '';
  }
}

import { App, Modal, Setting } from 'obsidian';

/**
 * 删除确认 Modal
 */
export class ConfirmDeleteModal extends Modal {
  private entryName: string;
  private onConfirm: () => void;

  constructor(app: App, entryName: string, onConfirm: () => void) {
    super(app);
    this.entryName = entryName;
    this.onConfirm = onConfirm;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.addClass('ohmypass-modal');

    contentEl.createEl('h2', { text: '⚠️ 确认删除' });
    contentEl.createEl('p', {
      text: `确定要删除 "${this.entryName}" 的密码记录吗？此操作不可撤销。`,
    });

    new Setting(contentEl)
      .addButton(btn => {
        btn.setButtonText('取消')
          .onClick(() => this.close());
      })
      .addButton(btn => {
        btn.setButtonText('删除')
          .setWarning()
          .onClick(() => {
            this.close();
            this.onConfirm();
          });
      });
  }

  onClose() {
    this.contentEl.empty();
  }
}

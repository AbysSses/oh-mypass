import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import type OhMyPassPlugin from '../main';

/**
 * 插件设置面板
 */
export class OhMyPassSettingTab extends PluginSettingTab {
  plugin: OhMyPassPlugin;

  constructor(app: App, plugin: OhMyPassPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'OhMyPass 设置' });

    const settings = this.plugin.store.getSettings();

    new Setting(containerEl)
      .setName('自动锁定时间（分钟）')
      .setDesc('无操作多久后自动锁定密码库，设为 0 禁用')
      .addText(text => {
        text.setValue(String(settings.autoLockMinutes))
          .setPlaceholder('5')
          .onChange(async v => {
            const num = parseInt(v) || 0;
            await this.plugin.store.updateSettings({ autoLockMinutes: Math.max(0, num) });
          });
        text.inputEl.type = 'number';
      });

    new Setting(containerEl)
      .setName('剪贴板清除时间（秒）')
      .setDesc('复制密码后多少秒自动清除剪贴板，设为 0 禁用')
      .addText(text => {
        text.setValue(String(settings.clipboardClearSeconds))
          .setPlaceholder('30')
          .onChange(async v => {
            const num = parseInt(v) || 0;
            await this.plugin.store.updateSettings({ clipboardClearSeconds: Math.max(0, num) });
          });
        text.inputEl.type = 'number';
      });

    new Setting(containerEl)
      .setName('默认密码长度')
      .setDesc('随机生成密码的默认长度')
      .addText(text => {
        text.setValue(String(settings.defaultPasswordLength))
          .setPlaceholder('16')
          .onChange(async v => {
            const num = parseInt(v) || 16;
            await this.plugin.store.updateSettings({ defaultPasswordLength: Math.max(4, Math.min(128, num)) });
          });
        text.inputEl.type = 'number';
      });

    new Setting(containerEl)
      .setName('密码字符集')
      .setDesc('随机生成密码包含的字符类型')
      .addDropdown(dd => {
        dd.addOption('all', '大小写 + 数字 + 特殊字符');
        dd.addOption('alphanumeric', '大小写 + 数字');
        dd.addOption('alpha', '仅字母');
        dd.addOption('numeric', '仅数字');
        dd.setValue(settings.passwordCharset);
        dd.onChange(async v => {
          await this.plugin.store.updateSettings({
            passwordCharset: v as 'all' | 'alphanumeric' | 'alpha' | 'numeric',
          });
        });
      });

    // ── 修改主密码 ──
    containerEl.createEl('h3', { text: '安全' });

    new Setting(containerEl)
      .setName('修改主密码')
      .setDesc('修改后会使用新密码重新加密所有数据')
      .addButton(btn => {
        btn.setButtonText('修改主密码')
          .setWarning()
          .onClick(() => {
            this.showChangePasswordUI(containerEl);
          });
      });
  }

  private showChangePasswordUI(containerEl: HTMLElement) {
    const div = containerEl.createDiv({ cls: 'ohmypass-change-pw' });
    let oldPw = '', newPw = '', confirmPw = '';
    const errorEl = div.createEl('p', { cls: 'ohmypass-error' });

    new Setting(div)
      .setName('当前密码')
      .addText(text => {
        text.inputEl.type = 'password';
        text.onChange(v => { oldPw = v; });
      });

    new Setting(div)
      .setName('新密码')
      .setDesc('至少 6 个字符')
      .addText(text => {
        text.inputEl.type = 'password';
        text.onChange(v => { newPw = v; });
      });

    new Setting(div)
      .setName('确认新密码')
      .addText(text => {
        text.inputEl.type = 'password';
        text.onChange(v => { confirmPw = v; });
      });

    new Setting(div)
      .addButton(btn => {
        btn.setButtonText('取消').onClick(() => div.remove());
      })
      .addButton(btn => {
        btn.setButtonText('确认修改')
          .setCta()
          .onClick(async () => {
            if (newPw.length < 6) {
              errorEl.setText('新密码长度至少 6 个字符');
              return;
            }
            if (newPw !== confirmPw) {
              errorEl.setText('两次输入的新密码不一致');
              return;
            }
            const success = await this.plugin.store.changePassword(oldPw, newPw);
            if (success) {
              new Notice('主密码修改成功');
              div.remove();
            } else {
              errorEl.setText('当前密码错误');
            }
          });
      });
  }
}

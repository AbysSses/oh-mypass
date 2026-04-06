import { Plugin, WorkspaceLeaf, Notice } from 'obsidian';
import { VIEW_TYPE_PASSWORD_LIST } from './types';
import { PasswordStore } from './store';
import { PasswordListView } from './views/PasswordListView';
import { SetupModal } from './modals/SetupModal';
import { UnlockModal } from './modals/UnlockModal';
import { AddEditModal } from './modals/AddEditModal';
import { OhMyPassSettingTab } from './settings/SettingTab';

export default class OhMyPassPlugin extends Plugin {
  store: PasswordStore = new PasswordStore(this);
  private autoLockInterval: number | null = null;

  async onload() {
    await this.store.load();

    // 注册视图
    this.registerView(VIEW_TYPE_PASSWORD_LIST, (leaf) => {
      return new PasswordListView(leaf, this.store, () => this.handleUnlock());
    });

    // 注册命令
    this.addCommand({
      id: 'open-password-vault',
      name: '打开密码库',
      callback: () => this.activateView(),
    });

    this.addCommand({
      id: 'add-password',
      name: '添加新密码',
      callback: () => {
        if (!this.store.isUnlocked()) {
          new Notice('请先解锁密码库');
          return;
        }
        new AddEditModal(this.app, this.store, () => this.refreshView()).open();
      },
    });

    this.addCommand({
      id: 'unlock-vault',
      name: '解锁密码库',
      callback: () => this.handleUnlock(),
    });

    this.addCommand({
      id: 'lock-vault',
      name: '锁定密码库',
      callback: () => {
        this.store.lock();
        this.refreshView();
        new Notice('密码库已锁定');
      },
    });

    // 注册设置
    this.addSettingTab(new OhMyPassSettingTab(this.app, this));

    // 侧边栏图标
    this.addRibbonIcon('lock', 'OhMyPass', () => {
      this.activateView();
    });

    // 自动锁定检查
    this.autoLockInterval = window.setInterval(() => {
      if (this.store.isUnlocked() && this.store.shouldAutoLock()) {
        this.store.lock();
        this.refreshView();
        new Notice('密码库因超时已自动锁定');
      }
    }, 30_000); // 每 30 秒检查一次

    this.registerInterval(this.autoLockInterval);
  }

  onunload() {
    // 锁定并清除内存
    this.store.lock();
    if (this.autoLockInterval) {
      clearInterval(this.autoLockInterval);
    }
  }

  /** 激活密码库视图 */
  async activateView() {
    const { workspace } = this.app;

    let leaf: WorkspaceLeaf | null = null;
    const leaves = workspace.getLeavesOfType(VIEW_TYPE_PASSWORD_LIST);

    if (leaves.length > 0) {
      leaf = leaves[0];
    } else {
      leaf = workspace.getRightLeaf(false);
      if (leaf) {
        await leaf.setViewState({
          type: VIEW_TYPE_PASSWORD_LIST,
          active: true,
        });
      }
    }

    if (leaf) {
      workspace.revealLeaf(leaf);
    }

    // 首次使用或未解锁时触发对应流程
    if (this.store.isFirstTime()) {
      this.handleSetup();
    } else if (!this.store.isUnlocked()) {
      this.handleUnlock();
    }
  }

  /** 首次设置主密码 */
  private handleSetup() {
    new SetupModal(this.app, async (password) => {
      await this.store.setup(password);
      new Notice('主密码设置成功！');
      this.refreshView();
    }).open();
  }

  /** 解锁密码库 */
  private handleUnlock() {
    if (this.store.isFirstTime()) {
      this.handleSetup();
      return;
    }

    new UnlockModal(this.app, async (password) => {
      const success = await this.store.unlock(password);
      if (success) {
        new Notice('密码库已解锁');
        this.refreshView();
      }
      return success;
    }).open();
  }

  /** 刷新视图 */
  private refreshView() {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_PASSWORD_LIST);
    for (const leaf of leaves) {
      const view = leaf.view;
      if (view instanceof PasswordListView) {
        view.render();
      }
    }
  }
}

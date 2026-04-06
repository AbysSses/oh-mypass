import { ItemView, WorkspaceLeaf, Notice, setIcon } from 'obsidian';
import { VIEW_TYPE_PASSWORD_LIST, PasswordEntry } from '../types';
import { PasswordStore, TagTreeNode } from '../store';
import { AddEditModal } from '../modals/AddEditModal';
import { ConfirmDeleteModal } from '../modals/ConfirmDeleteModal';
import { ImportExportModal } from '../modals/ImportExportModal';

/**
 * 密码列表主视图（ItemView）
 */
export class PasswordListView extends ItemView {
  private store: PasswordStore;
  private onRequestUnlock: () => void;
  private searchQuery = '';
  private activeTag: string | null = null;
  private clipboardTimers: number[] = [];
  private expandedGroups: Set<string> = new Set();
  private searchDebounceTimer: number | null = null;
  private visibleCount = 30;
  private static readonly PAGE_SIZE = 30;

  constructor(leaf: WorkspaceLeaf, store: PasswordStore, onRequestUnlock: () => void) {
    super(leaf);
    this.store = store;
    this.onRequestUnlock = onRequestUnlock;
  }

  getViewType(): string {
    return VIEW_TYPE_PASSWORD_LIST;
  }

  getDisplayText(): string {
    return 'OhMyPass';
  }

  getIcon(): string {
    return 'lock';
  }

  async onOpen() {
    this.render();
  }

  async onClose() {
    for (const timer of this.clipboardTimers) {
      clearTimeout(timer);
    }
    this.clipboardTimers = [];
    if (this.searchDebounceTimer) clearTimeout(this.searchDebounceTimer);
  }

  /** 完整重新渲染 */
  render() {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass('ohmypass-view');

    if (!this.store.isUnlocked()) {
      this.renderLocked(container);
      return;
    }

    this.store.touch();
    this.renderToolbar(container);
    this.renderTagFilter(container);
    this.renderEntryList(container);
    this.renderStatusBar(container);
  }

  // ── 锁定状态 ──

  private renderLocked(container: HTMLElement) {
    const lockDiv = container.createDiv({ cls: 'ohmypass-locked' });
    lockDiv.createEl('div', { text: '🔒', cls: 'ohmypass-lock-icon' });
    lockDiv.createEl('p', { text: '密码库已锁定' });
    lockDiv.createEl('p', { text: '点击此处解锁', cls: 'ohmypass-hint ohmypass-unlock-link' });
    lockDiv.addEventListener('click', () => {
      this.onRequestUnlock();
    });
  }

  // ── 工具栏 ──

  private renderToolbar(container: HTMLElement) {
    const toolbar = container.createDiv({ cls: 'ohmypass-toolbar' });

    // 搜索框
    const searchWrapper = toolbar.createDiv({ cls: 'ohmypass-search-wrapper' });
    const searchInput = searchWrapper.createEl('input', {
      type: 'text',
      placeholder: '🔍 搜索密码...',
      cls: 'ohmypass-search',
    });
    searchInput.value = this.searchQuery;
    searchInput.addEventListener('input', () => {
      this.searchQuery = searchInput.value;
      // 防抖：停止输入 250ms 后再渲染
      if (this.searchDebounceTimer) clearTimeout(this.searchDebounceTimer);
      this.searchDebounceTimer = window.setTimeout(() => {
        this.visibleCount = PasswordListView.PAGE_SIZE; // 搜索时重置分页
        this.renderEntryList(container);
        this.renderStatusBar(container);
      }, 250);
    });

    // 按钮组
    const btnGroup = toolbar.createDiv({ cls: 'ohmypass-btn-group' });

    const addBtn = btnGroup.createEl('button', { cls: 'ohmypass-btn ohmypass-btn-primary' });
    setIcon(addBtn.createSpan(), 'plus');
    addBtn.createSpan({ text: ' 添加' });
    addBtn.addEventListener('click', () => {
      new AddEditModal(this.app, this.store, () => this.render()).open();
    });

    const importBtn = btnGroup.createEl('button', { cls: 'ohmypass-btn' });
    setIcon(importBtn.createSpan(), 'folder-input');
    importBtn.createSpan({ text: ' 导入/导出' });
    importBtn.addEventListener('click', () => {
      new ImportExportModal(this.app, this.store, () => this.render()).open();
    });

    const lockBtn = btnGroup.createEl('button', { cls: 'ohmypass-btn' });
    setIcon(lockBtn.createSpan(), 'lock');
    lockBtn.createSpan({ text: ' 锁定' });
    lockBtn.addEventListener('click', () => {
      this.store.lock();
      this.render();
    });
  }

  // ── 标签过滤 ──

  private renderTagFilter(container: HTMLElement) {
    const tags = this.store.getTagTree();
    if (tags.length === 0) return;

    const tagBar = container.createDiv({ cls: 'ohmypass-tag-bar' });
    tagBar.createEl('span', { text: '标签：', cls: 'ohmypass-tag-label' });

    // "全部" 标签
    const allChip = tagBar.createEl('span', {
      text: '全部',
      cls: `ohmypass-tag-chip ${this.activeTag === null ? 'active' : ''}`,
    });
    allChip.addEventListener('click', () => {
      this.activeTag = null;
      this.visibleCount = PasswordListView.PAGE_SIZE;
      this.render();
    });

    // 递归渲染标签
    this.renderTagNodes(tagBar, tags, 0);
  }

  private renderTagNodes(parent: HTMLElement, nodes: TagTreeNode[], depth: number) {
    for (const node of nodes) {
      const chip = parent.createEl('span', {
        text: `${'　'.repeat(depth)}${node.name} (${node.count})`,
        cls: `ohmypass-tag-chip ${this.activeTag === node.fullPath ? 'active' : ''}`,
      });
      chip.addEventListener('click', () => {
        this.activeTag = this.activeTag === node.fullPath ? null : node.fullPath;
        this.visibleCount = PasswordListView.PAGE_SIZE;
        this.render();
      });

      if (node.children.length > 0) {
        this.renderTagNodes(parent, node.children, depth + 1);
      }
    }
  }

  // ── 密码列表 ──

  private renderEntryList(container: HTMLElement) {
    // 移除旧列表
    const existing = container.querySelector('.ohmypass-entry-list');
    if (existing) existing.remove();

    const entries = this.store.searchEntries(this.searchQuery, this.activeTag || undefined);
    const list = container.createDiv({ cls: 'ohmypass-entry-list' });

    if (entries.length === 0) {
      const empty = list.createDiv({ cls: 'ohmypass-empty' });
      empty.createEl('div', { text: '📭', cls: 'ohmypass-empty-icon' });
      empty.createEl('p', { text: this.searchQuery ? '未找到匹配的密码' : '还没有保存任何密码' });
      return;
    }

    // 按服务名分组
    const groups = new Map<string, PasswordEntry[]>();
    for (const entry of entries) {
      const key = entry.name;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(entry);
    }

    // 分页：只渲染前 visibleCount 个分组项
    const groupArray = Array.from(groups.entries());
    const visibleGroups = groupArray.slice(0, this.visibleCount);

    for (const [name, groupEntries] of visibleGroups) {
      if (groupEntries.length === 1) {
        this.renderEntryCard(list, groupEntries[0]);
      } else {
        this.renderGroup(list, name, groupEntries);
      }
    }

    // "加载更多" 按钮
    if (groupArray.length > this.visibleCount) {
      const remaining = groupArray.length - this.visibleCount;
      const loadMoreBtn = list.createEl('button', {
        text: `加载更多（还有 ${remaining} 项）`,
        cls: 'ohmypass-btn ohmypass-load-more',
      });
      loadMoreBtn.addEventListener('click', () => {
        this.visibleCount += PasswordListView.PAGE_SIZE;
        this.renderEntryList(container);
      });
    }
  }

  /** 渲染同名服务分组（可折叠） */
  private renderGroup(parent: HTMLElement, name: string, entries: PasswordEntry[]) {
    const groupKey = name;
    const isExpanded = this.expandedGroups.has(groupKey);

    const groupEl = parent.createDiv({ cls: 'ohmypass-group' });

    // 分组头
    const header = groupEl.createDiv({ cls: `ohmypass-group-header ${isExpanded ? 'expanded' : ''}` });

    const chevron = header.createSpan({ cls: 'ohmypass-group-chevron' });
    setIcon(chevron, isExpanded ? 'chevron-down' : 'chevron-right');

    header.createSpan({ text: name, cls: 'ohmypass-group-name' });
    header.createSpan({ text: `${entries.length} 个账号`, cls: 'ohmypass-group-count' });

    // 收起时显示用户名预览
    if (!isExpanded) {
      const preview = header.createSpan({ cls: 'ohmypass-group-preview' });
      const usernames = entries.map(e => e.username).join(', ');
      preview.setText(usernames.length > 40 ? usernames.slice(0, 40) + '...' : usernames);
    }

    header.addEventListener('click', () => {
      if (this.expandedGroups.has(groupKey)) {
        this.expandedGroups.delete(groupKey);
      } else {
        this.expandedGroups.add(groupKey);
      }
      const container = this.containerEl.children[1] as HTMLElement;
      this.renderEntryList(container);
    });

    // 展开时渲染子卡片
    if (isExpanded) {
      const body = groupEl.createDiv({ cls: 'ohmypass-group-body' });
      for (const entry of entries) {
        this.renderEntryCard(body, entry);
      }
    }
  }

  private renderEntryCard(parent: HTMLElement, entry: PasswordEntry) {
    const card = parent.createDiv({ cls: 'ohmypass-card' });

    // 头部：名称 + 标签
    const header = card.createDiv({ cls: 'ohmypass-card-header' });
    header.createEl('strong', { text: entry.name, cls: 'ohmypass-card-name' });

    if (entry.tags.length > 0) {
      const tagsDiv = header.createDiv({ cls: 'ohmypass-card-tags' });
      for (const tag of entry.tags) {
        tagsDiv.createEl('span', { text: tag, cls: 'ohmypass-tag-badge' });
      }
    }

    // 详情
    const details = card.createDiv({ cls: 'ohmypass-card-details' });

    if (entry.url) {
      const urlRow = details.createDiv({ cls: 'ohmypass-card-row' });
      urlRow.createEl('span', { text: '🌐', cls: 'ohmypass-card-icon' });
      const link = urlRow.createEl('a', { text: entry.url, href: entry.url });
      link.setAttr('target', '_blank');
    }

    const userRow = details.createDiv({ cls: 'ohmypass-card-row' });
    userRow.createEl('span', { text: '👤', cls: 'ohmypass-card-icon' });
    userRow.createEl('span', { text: entry.username });

    // 复制用户名按钮
    const copyUserBtn = userRow.createEl('button', {
      cls: 'ohmypass-icon-btn',
      attr: { 'aria-label': '复制用户名' },
    });
    setIcon(copyUserBtn, 'copy');
    copyUserBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(entry.username);
      new Notice('已复制用户名');
    });

    // 密码行
    const pwRow = details.createDiv({ cls: 'ohmypass-card-row' });
    pwRow.createEl('span', { text: '🔑', cls: 'ohmypass-card-icon' });
    const pwDisplay = pwRow.createEl('code', { text: '••••••••', cls: 'ohmypass-pw-display' });
    let pwVisible = false;

    const toggleBtn = pwRow.createEl('button', {
      cls: 'ohmypass-icon-btn',
      attr: { 'aria-label': '显示/隐藏密码' },
    });
    setIcon(toggleBtn, 'eye');
    toggleBtn.addEventListener('click', () => {
      pwVisible = !pwVisible;
      pwDisplay.setText(pwVisible ? entry.password : '••••••••');
      setIcon(toggleBtn, pwVisible ? 'eye-off' : 'eye');
    });

    const copyPwBtn = pwRow.createEl('button', {
      cls: 'ohmypass-icon-btn',
      attr: { 'aria-label': '复制密码' },
    });
    setIcon(copyPwBtn, 'copy');
    copyPwBtn.addEventListener('click', () => {
      this.copyPassword(entry.password);
    });

    // 备注
    if (entry.notes) {
      const noteRow = details.createDiv({ cls: 'ohmypass-card-row ohmypass-card-notes' });
      noteRow.createEl('span', { text: '📝', cls: 'ohmypass-card-icon' });
      noteRow.createEl('span', { text: entry.notes, cls: 'ohmypass-note-text' });
    }

    // 操作按钮
    const actions = card.createDiv({ cls: 'ohmypass-card-actions' });

    const editBtn = actions.createEl('button', { cls: 'ohmypass-btn ohmypass-btn-sm' });
    setIcon(editBtn.createSpan(), 'pencil');
    editBtn.createSpan({ text: ' 编辑' });
    editBtn.addEventListener('click', () => {
      new AddEditModal(this.app, this.store, () => this.render(), entry).open();
    });

    const deleteBtn = actions.createEl('button', { cls: 'ohmypass-btn ohmypass-btn-sm ohmypass-btn-danger' });
    setIcon(deleteBtn.createSpan(), 'trash');
    deleteBtn.createSpan({ text: ' 删除' });
    deleteBtn.addEventListener('click', () => {
      new ConfirmDeleteModal(this.app, entry.name, async () => {
        await this.store.deleteEntry(entry.id);
        this.render();
        new Notice(`已删除 "${entry.name}"`);
      }).open();
    });

    // 时间
    const time = card.createDiv({ cls: 'ohmypass-card-time' });
    time.createEl('small', {
      text: `更新于 ${new Date(entry.updatedAt).toLocaleDateString('zh-CN')}`,
    });
  }

  // ── 状态栏 ──

  private renderStatusBar(container: HTMLElement) {
    const existing = container.querySelector('.ohmypass-status');
    if (existing) existing.remove();

    const total = this.store.getEntries().length;
    const filtered = this.store.searchEntries(this.searchQuery, this.activeTag || undefined).length;

    const status = container.createDiv({ cls: 'ohmypass-status' });
    const text = total === filtered
      ? `共 ${total} 条记录`
      : `显示 ${filtered} / ${total} 条记录`;
    status.createEl('span', { text });
    status.createEl('span', { text: ' · 🔓 已解锁', cls: 'ohmypass-status-unlock' });
  }

  // ── 剪贴板管理 ──

  private copyPassword(password: string) {
    navigator.clipboard.writeText(password);
    new Notice('已复制密码（将在设定时间后自动清除剪贴板）');

    const clearSeconds = this.store.getSettings().clipboardClearSeconds;
    if (clearSeconds > 0) {
      const timer = window.setTimeout(() => {
        navigator.clipboard.writeText('').catch(() => {});
        new Notice('剪贴板已自动清除');
      }, clearSeconds * 1000);
      this.clipboardTimers.push(timer);
    }
  }
}

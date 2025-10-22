import { createPage } from '../../utils/page';
import { resolveThemeClass } from '../../utils/theme-helper';
import api, {
  getCurrentUser,
  updateCurrentUser,
  getMenusForCurrentUser,
  createMenu,
  acceptMenuInvite,
} from '../../services/api';

const app = getApp();
const store = app.getStore();
const themeManager = app.getThemeManager();

const mapStoreToData = (state) => ({
  theme: state.theme,
  themeClass: resolveThemeClass(state.theme),
});

const ROLE_LABELS = {
  admin: '管理员',
  chef: '厨师',
  customer: '顾客',
};

const ROLE_ENTRY_PAGES = {
  admin: '/pages/admin/menu-designer/index',
  chef: '/pages/chef/order-list/index',
  customer: '/pages/customer/menu/index',
};

const PROFILE_AVATAR_DIR = 'profile_avatar';
const MAX_AVATAR_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const getAvatarFileExtension = (path = '') => {
  const match = `${path}`.match(/\.([a-zA-Z0-9]+)(?:\?.*)?$/);
  if (match && match[1]) {
    return match[1].toLowerCase();
  }
  return 'png';
};

createPage({
  data: {
    loading: false,
    menus: [],
    selectedMenuId: '',
    selectedRole: '',
    roleLabels: ROLE_LABELS,
    user: null,
    showProfileSetup: false,
    profileNickname: '',
    profileAvatar: '',
    profileLoading: false,
    avatarUploading: false,
  },
  mapStoreToData,
  async onLoad(options = {}) {
    const { menuId, role } = await this.handleInvite(options);
    await this.loadData(menuId, role);
  },
  methods: {
    async handleInvite(options = {}) {
      const inviteToken = options.inviteToken || options.scene;
      if (!inviteToken) {
        return { menuId: options.menuId || '', role: options.role || '' };
      }
      const hintedMenuId = options.menuId || '';
      wx.showLoading({ title: '加入中', mask: true });
      try {
        const result = await acceptMenuInvite({ token: inviteToken, menuId: hintedMenuId });
        wx.hideLoading();
        if (result && result.menuId) {
          wx.showToast({ title: '已加入菜单', icon: 'success' });
          const roles = Array.isArray(result.roles) ? result.roles : [];
          return {
            menuId: result.menuId,
            role: roles[0] || options.role || 'customer',
          };
        }
        return { menuId: hintedMenuId, role: options.role || '' };
      } catch (error) {
        wx.hideLoading();
        console.error('接受邀请失败', error);
        wx.showToast({ title: '邀请无效或已过期', icon: 'none' });
        return { menuId: hintedMenuId, role: options.role || '' };
      }
    },
    async loadData(preferredMenuId = '', preferredRole = '') {
      this.setData({ loading: true });
      try {
        const [user, menus] = await Promise.all([
          getCurrentUser(),
          getMenusForCurrentUser(),
        ]);
        const defaultMenu = preferredMenuId
          ? menus.find((item) => item.id === preferredMenuId) || menus[0] || null
          : menus[0] || null;
        let defaultRole = '';
        if (defaultMenu) {
          const availableRoles = defaultMenu.roles || [];
          if (preferredRole && availableRoles.includes(preferredRole)) {
            defaultRole = preferredRole;
          } else {
            defaultRole = availableRoles[0] || '';
          }
        }
        const rolesByMenu = menus.reduce((acc, menu) => {
          acc[menu.id] = menu.roles;
          return acc;
        }, {});
        store.setState({
          user,
          rolesByMenu,
        });
        this.setData({
          user,
          menus,
          selectedMenuId: defaultMenu ? defaultMenu.id : '',
          selectedRole: defaultRole,
          profileNickname: user?.nickname || '',
          profileAvatar: user?.avatar || '',
          showProfileSetup: !this.isProfileCompleted(user),
          avatarUploading: false,
        });
        return menus;
      } catch (error) {
        console.error('加载菜单失败', error);
        wx.showToast({ title: '操作失败', icon: 'none' });
        return null;
      } finally {
        this.setData({ loading: false });
      }
    },
    isProfileCompleted(user = this.data.user) {
      if (!user) {
        return false;
      }
      if (typeof user.profileCompleted === 'boolean') {
        return user.profileCompleted;
      }
      return Boolean(user.nickname && user.avatar);
    },
    onEditProfile() {
      const { user } = this.data;
      this.setData({
        showProfileSetup: true,
        profileNickname: user?.nickname || '',
        profileAvatar: user?.avatar || '',
      });
    },
    onGoToProfile() {
      wx.navigateTo({
        url: '/pages/user/profile/index',
      });
    },
    onCloseProfile() {
      if (this.data.profileLoading) {
        return;
      }
      this.setData({ showProfileSetup: false });
    },
    async onRefresh() {
      if (this.data.loading) {
        return;
      }
      const { selectedMenuId, selectedRole } = this.data;
      await this.loadData(selectedMenuId, selectedRole);
    },
    async onCreateMenu() {
      if (this.data.loading) {
        return;
      }
      const res = await wx.showModal({
        title: '创建菜单',
        editable: true,
        placeholderText: '请输入菜单名称',
        confirmText: '创建',
        cancelText: '取消',
      });
      if (!res.confirm) {
        return;
      }
      const name = typeof res.content === 'string' ? res.content.trim() : '';
      if (!name) {
        wx.showToast({ title: '请输入菜单名称', icon: 'none' });
        return;
      }
      wx.showLoading({ title: '创建中', mask: true });
      try {
        const menu = await createMenu({ name });
        wx.showToast({ title: '创建成功', icon: 'success' });
        await this.loadData(menu.id, 'admin');
      } catch (error) {
        console.error('创建菜单失败', error);
        wx.showToast({ title: '创建失败', icon: 'none' });
      } finally {
        wx.hideLoading();
      }
    },
    onSelectMenu(event) {
      const { menuId } = event.currentTarget.dataset;
      const menu = this.data.menus.find((item) => item.id === menuId);
      this.setData({
        selectedMenuId: menuId,
        selectedRole: menu?.roles[0] || '',
      });
    },
    onSwitchRole(event) {
      const { role } = event.detail;
      const { menuId } = event.currentTarget.dataset;
      // 如果点击的是非选中菜单的角色tag，切换到该菜单并选中对应角色
      if (menuId !== this.data.selectedMenuId) {
        this.setData({
          selectedMenuId: menuId,
          selectedRole: role,
        });
      } else {
        // 如果是当前选中菜单，只切换角色
        this.setData({ selectedRole: role });
      }
    },
    onEnter() {
      const { selectedMenuId, selectedRole } = this.data;
      if (!this.isProfileCompleted()) {
        this.setData({ showProfileSetup: true });
        wx.showToast({ title: '请先完善昵称和头像', icon: 'none' });
        return;
      }
      if (!selectedMenuId || !selectedRole) {
        wx.showToast({ title: '请选择菜单和身份', icon: 'none' });
        return;
      }
      const menu = this.data.menus.find((item) => item.id === selectedMenuId);
      if (!menu) {
        wx.showToast({ title: '操作失败', icon: 'none' });
        return;
      }
      store.setState({
        activeMenuId: menu.id,
        activeRole: selectedRole,
        theme: menu.theme,
      });
      themeManager.applyTheme(menu.theme);
      const targetUrl = ROLE_ENTRY_PAGES[selectedRole];
      if (!targetUrl) {
        wx.redirectTo({ url: '/pages/menu-selector/index' });
        return;
      }
      wx.redirectTo({ url: targetUrl });
    },
    onProfileNicknameInput(event) {
      this.setData({ profileNickname: event.detail.value || '' });
    },
    async onChooseAvatar(event) {
      console.log('debuggerdebuggerdebuggerdebugger')
      const avatarUrl = event?.detail?.avatarUrl;
      if (!avatarUrl) {
        wx.showToast({ title: '选择头像失败', icon: 'none' });
        return;
      }
      if (!wx.cloud || typeof wx.cloud.uploadFile !== 'function') {
        wx.showToast({ title: '云能力不可用', icon: 'none' });
        return;
      }
      if (this.data.avatarUploading) {
        return;
      }
      let fileInfo;
      try {
        fileInfo = await wx.getFileInfo({ filePath: avatarUrl });
      } catch (error) {
        console.error('获取头像文件信息失败', error);
        wx.showToast({ title: '无法读取文件', icon: 'none' });
        return;
      }
      if (fileInfo?.size > MAX_AVATAR_FILE_SIZE) {
        wx.showToast({ title: '图片不能超过10MB', icon: 'none' });
        return;
      }
      const userId = this.data.user?.id || store.getState().user?.id || 'anonymous';
      const timestamp = Date.now();
      const randomSuffix = Math.random().toString(36).slice(2, 8);
      const fileExt = getAvatarFileExtension(avatarUrl);
      const cloudPath = `${PROFILE_AVATAR_DIR}/${userId}-${timestamp}-${randomSuffix}.${fileExt}`;
      this.setData({ avatarUploading: true });
      wx.showLoading({ title: '上传中', mask: true });
      try {
        const uploadOptions = {
          cloudPath,
          filePath: avatarUrl,
        };
        const uploadResult = await wx.cloud.uploadFile(uploadOptions);
        if (!uploadResult || !uploadResult.fileID) {
          throw new Error('missing_file_id');
        }
        this.setData({ profileAvatar: uploadResult.fileID });
        wx.showToast({ title: '头像已更新', icon: 'success' });
      } catch (error) {
        console.error('上传头像失败', error);
        wx.showToast({ title: '上传失败', icon: 'none' });
      } finally {
        wx.hideLoading();
        this.setData({ avatarUploading: false });
      }
    },
    async onSubmitProfile() {
      if (this.data.profileLoading) {
        return;
      }
      const nickname = (this.data.profileNickname || '').trim();
      const avatar = (this.data.profileAvatar || '').trim();
      if (!nickname) {
        wx.showToast({ title: '请填写昵称', icon: 'none' });
        return;
      }
      if (!avatar) {
        wx.showToast({ title: '请设置头像', icon: 'none' });
        return;
      }
      this.setData({ profileLoading: true });
      wx.showLoading({ title: '保存中', mask: true });
      const updateUserFn =
        typeof updateCurrentUser === 'function'
          ? updateCurrentUser
          : typeof api?.updateCurrentUser === 'function'
            ? api.updateCurrentUser
            : null;
      if (!updateUserFn) {
        console.error('更新用户资料失败: 缺少 updateCurrentUser 实现');
        wx.showToast({ title: '保存失败', icon: 'none' });
        this.setData({ profileLoading: false });
        wx.hideLoading();
        return;
      }
      try {
        const updated = await updateUserFn({
          nickname,
          avatar,
          profileCompleted: true,
        });
        store.setState({ user: updated });
        this.setData({
          user: updated,
          showProfileSetup: false,
          profileLoading: false,
          profileNickname: updated?.nickname || nickname,
          profileAvatar: updated?.avatar || avatar,
        });
        wx.showToast({ title: '已保存', icon: 'success' });
      } catch (error) {
        console.error('更新用户资料失败', error);
        wx.showToast({ title: '保存失败', icon: 'none' });
        this.setData({ profileLoading: false });
      } finally {
        wx.hideLoading();
      }
    },
    noop() {},
  },
});

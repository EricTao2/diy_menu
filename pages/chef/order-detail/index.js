import { createPage } from '../../../utils/page';
import { resolveThemeClass } from '../../../utils/theme-helper';
import { getOrdersByMenu, getDishesByMenu, updateOrderStatus } from '../../../services/api';
import { formatCurrency, formatDateTime } from '../../../utils/format';
import { hasRole } from '../../../utils/auth';
const app = getApp();
const store = app.getStore();

const mapStoreToData = (state) => ({
  theme: state.theme,
  themeClass: resolveThemeClass(state.theme),
  activeMenuId: state.activeMenuId,
  user: state.user,
});

createPage({
  data: {
    order: null,
    handledRemark: '',
  },
  mapStoreToData,
  async onLoad(query) {
    if (query?.id) {
      this.orderId = query.id;
      await this.loadOrder();
    }
  },
  methods: {
    async loadOrder() {
      const state = store.getState();
      const menuId = state.activeMenuId;
      const hasChefAccess = hasRole(state, menuId, 'chef');
      const hasAdminAccess = hasRole(state, menuId, 'admin');
      if (!hasChefAccess && !hasAdminAccess) {
        wx.showToast({ title: '没有权限访问', icon: 'none' });
        wx.redirectTo({ url: '/pages/menu-selector/index' });
        return;
      }
      this.accessRole = hasChefAccess ? 'chef' : 'admin';
      const [orders, dishes] = await Promise.all([
        getOrdersByMenu(menuId, 'all'),
        this.dishMap ? Promise.resolve(null) : getDishesByMenu(menuId),
      ]);
      if (dishes && Array.isArray(dishes)) {
        this.dishMap = dishes.reduce((acc, dish) => {
          if (dish?.id) {
            acc[dish.id] = dish;
          }
          return acc;
        }, {});
        console.log('[ChefOrderDetail] 载入菜品列表:', dishes.map((dish) => ({
          id: dish.id,
          name: dish.name,
          recipeId: dish.recipeId,
        })));
      } else if (!this.dishMap) {
        this.dishMap = {};
      }
      const order = orders.find((item) => item.id === this.orderId);
      if (!order) {
        wx.showToast({ title: 'Not Found', icon: 'none' });
        wx.navigateBack();
        return;
      }
      this.rawOrder = order;
      console.log('[ChefOrderDetail] 载入订单:', {
        id: order.id,
        items: order.items.map((item) => ({
          dishId: item.dishId,
          recipeId: item.recipeId,
          optionsSnapshot: item.optionsSnapshot,
        })),
      });
      this.formatOrder();
    },
    formatOrder() {
      if (!this.rawOrder) return;
      const processedItems = this.rawOrder.items.map((item) => {
        const dish = this.dishMap?.[item.dishId];
        const dishRecipeId = dish?.recipeId || '';
        const snapshotRecipeId = item.recipeId || '';
        const finalRecipeId = dishRecipeId || snapshotRecipeId || '';
        const hasRecipe = !!finalRecipeId;
        console.log('[ChefOrderDetail] 订单项菜谱调试:', {
          dishId: item.dishId,
          dishRecipeId,
          snapshotRecipeId,
          finalRecipeId,
          hasRecipe,
          dishSource: dish,
        });
        return {
          ...item,
          recipeId: finalRecipeId,
          hasRecipe,
          image: dish?.image || dish?.coverImage || dish?.cover || '',
          unitPriceText: formatCurrency(item.unitPrice),
          totalText: formatCurrency(item.unitPrice * item.quantity),
          options: item.optionsSnapshot
            ? Object.keys(item.optionsSnapshot).map((optionId) => {
                const option = item.optionsSnapshot[optionId] || {};
                const displayLabel = option.selectedLabel || option.selectedValue || '';
                return {
                  id: optionId,
                  name: option.name || '',
                  value: option.selectedValue || '',
                  label: displayLabel,
                  text: displayLabel
                    ? `${option.name || ''}：${displayLabel}`
                    : option.name || '',
                };
              })
            : [],
        };
      });
      const order = {
        ...this.rawOrder,
        totalPriceText: formatCurrency(this.rawOrder.totalPrice),
        createdAtText: formatDateTime(this.rawOrder.createdAt),
        statusText: this.statusText(this.rawOrder.status),
        items: processedItems,
      };
      console.log('[ChefOrderDetail] 格式化订单项:', order.items.map((item) => ({
        dishId: item.dishId,
        sourceRecipeId: this.dishMap?.[item.dishId]?.recipeId,
        snapshotRecipeId: this.rawOrder.items.find((origin) => origin.dishId === item.dishId)?.recipeId,
        finalRecipeId: item.recipeId,
        hasRecipe: item.hasRecipe,
      })));
      this.setData({
        order,
        handledRemark: this.rawOrder.handledRemark || '',
      });
    },
    statusText(status) {
      switch (status) {
        case 'new':
          return '已下单';
        case 'processing':
          return '处理中';
        case 'completed':
          return '已完成';
        case 'cancelled':
          return '已取消';
        default:
          return status;
      }
    },
    async updateStatus(status = null) {
      if (!this.rawOrder) return;
      const payload = {
        handledBy: store.getState().user.id,
        handledRemark: this.data.handledRemark,
      };
      if (status) {
        payload.status = status;
      }
      await updateOrderStatus(this.rawOrder.id, payload);
      wx.showToast({ title: '操作成功', icon: 'success' });
      await this.loadOrder();
    },
    onRemarkInput(event) {
      this.setData({ handledRemark: event.detail.value });
    },
    onSaveRemark() {
      this.updateStatus();
    },
    onMarkProcessing() {
      this.updateStatus('processing');
    },
    onMarkComplete() {
      this.updateStatus('completed');
    },
    onMarkCancel() {
      this.updateStatus('cancelled');
    },
    onViewRecipe(event) {
      const { recipeId } = event.currentTarget.dataset || {};
      if (!recipeId) {
        return;
      }
      wx.navigateTo({
        url: `/pages/user/recipe-detail/index?recipeId=${recipeId}`,
      });
    },
  },
});

import { createPage } from '../../../utils/page';
import { resolveThemeClass } from '../../../utils/theme-helper';
import { getOrderDetail, getDishesByMenu } from '../../../services/api';
import { formatCurrency, formatDateTime } from '../../../utils/format';
import { getGlobalRole } from '../../../utils/store-helper';
const app = getApp();
const store = app.getStore();

const mapStoreToData = (state) => ({
  theme: state.theme,
  themeClass: resolveThemeClass(state.theme),
  activeMenuId: state.activeMenuId,
});

const statusText = (status) => {
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
};

createPage({
  data: {
    order: null,
    currentRole: '',
    canViewRecipe: false,
  },
  mapStoreToData,
  async onLoad(query) {
    this.orderId = query?.id || '';
    const currentRole = getGlobalRole();
    const canViewRecipe = currentRole === 'admin' || currentRole === 'chef';
    this.setData({ currentRole, canViewRecipe });
    await this.loadOrder();
  },
  methods: {
    async loadOrder() {
      const state = store.getState();
      try {
        const order = await getOrderDetail(this.orderId);
        if (!order) {
          wx.showToast({ title: '订单不存在', icon: 'none' });
          wx.navigateBack();
          return;
        }
        
        // 获取菜品信息以获取图片
        const dishes = await getDishesByMenu(state.activeMenuId);
        const dishMap = dishes.reduce((acc, dish) => {
          acc[dish.id] = dish;
          return acc;
        }, {});
        
        this.rawOrder = order;
        this.dishMap = dishMap;
        this.formatOrder();
      } catch (error) {
        console.error('加载订单详情失败', error);
        wx.showToast({ title: '加载失败', icon: 'none' });
        wx.navigateBack();
      }
    },
    formatOrder() {
      if (!this.rawOrder) return;
      
      // 格式化操作者信息
      const formatOperators = (operators) => {
        if (!operators || Object.keys(operators).length === 0) return [];
        
        return Object.values(operators).map(operator => ({
          ...operator,
          lastOperatorAtText: this.rawOrder.lastOperatorAt ? formatDateTime(this.rawOrder.lastOperatorAt) : '',
        }));
      };
      
      const order = {
        ...this.rawOrder,
        totalPriceText: formatCurrency(this.rawOrder.totalPrice),
        createdAtText: formatDateTime(this.rawOrder.createdAt),
        statusText: statusText(this.rawOrder.status),
        operators: formatOperators(this.rawOrder.operators),
        items: this.rawOrder.items.map((item) => {
          const dish = this.dishMap?.[item.dishId];
          return {
            ...item,
            dishId: item.dishId,
            recipeId: dish?.recipeId || '',
            hasRecipe: !!dish?.recipeId,
            image: dish?.image || dish?.coverImage || dish?.cover || '',
            totalText: formatCurrency(item.unitPrice * item.quantity),
            options: item.optionsSnapshot
              ? Object.keys(item.optionsSnapshot).map((optionId) => {
                  const option = item.optionsSnapshot[optionId];
                  return {
                    label: `${option.name}: ${option.selectedLabel}`,
                    value: option.selectedValue,
                  };
                })
              : [],
          };
        }),
      };
      this.setData({ order });
    },
    onViewRecipe(e) {
      const { recipeId } = e.currentTarget.dataset;
      if (recipeId) {
        wx.navigateTo({
          url: `/pages/user/recipe-detail/index?recipeId=${recipeId}`,
        });
      }
    },
  },
});

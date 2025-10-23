import { createPage } from '../../../utils/page';
import { resolveThemeClass } from '../../../utils/theme-helper';
import { getDishDetail } from '../../../services/api';
import { formatCurrency } from '../../../utils/format';
import { showCustomerToast } from '../../../utils/toast';

const app = getApp();
const store = app.getStore();

const mapStoreToData = (state) => ({
  theme: state.theme,
  themeClass: resolveThemeClass(state.theme),
  activeMenuId: state.activeMenuId,
});

createPage({
  data: {
    loading: true,
    dish: null,
  },
  mapStoreToData,
  async onLoad(options) {
    const dishId = options?.id;
    if (!dishId) {
      showCustomerToast({ title: '未找到菜品' });
      setTimeout(() => wx.navigateBack(), 500);
      return;
    }
    await this.loadDish(dishId);
  },
  methods: {
    async loadDish(dishId) {
      try {
        const detail = await getDishDetail(dishId);
        if (!detail) {
          showCustomerToast({ title: '菜品不存在' });
          setTimeout(() => wx.navigateBack(), 500);
          return;
        }
        const dish = {
          ...detail,
          image: detail.image || detail.coverImage || '',
          priceText: formatCurrency(detail.price),
        };
        if (dish.name) {
          wx.setNavigationBarTitle({ title: dish.name });
        }
        this.setData({ dish, loading: false });
      } catch (error) {
        console.error('加载菜品详情失败', error);
        showCustomerToast({ title: '加载失败', type: 'error' });
        setTimeout(() => wx.navigateBack(), 500);
      }
    },
  },
});

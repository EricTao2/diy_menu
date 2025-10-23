import { createPage } from '../../../utils/page';
import { getIngredients } from '../../../services/api';

createPage({
  data: {
    ingredients: [],
    filteredIngredients: [],
    searchQuery: '',
    loading: false,
  },

  async onLoad() {
    await this.loadIngredients();
  },

  methods: {
    async loadIngredients() {
      this.setData({ loading: true });
      try {
        const ingredients = await getIngredients();
        this.setData({ ingredients }, () => {
          this.updateFilteredIngredients();
        });
      } catch (error) {
        console.error('加载原材料失败', error);
        wx.showToast({ title: '加载失败', icon: 'none' });
        this.setData({ ingredients: [] }, () => {
          this.updateFilteredIngredients();
        });
      } finally {
        this.setData({ loading: false });
      }
    },

    onSearchInput(e) {
      this.setData({ searchQuery: e.detail.value }, () => {
        this.updateFilteredIngredients();
      });
    },

    updateFilteredIngredients() {
      const { ingredients, searchQuery } = this.data;
      if (!Array.isArray(ingredients)) {
        this.setData({ filteredIngredients: [] });
        return;
      }
      const query = (searchQuery || '').trim().toLowerCase();
      if (!query) {
        this.setData({ filteredIngredients: ingredients });
        return;
      }
      const filtered = ingredients.filter((item = {}) =>
        String(item.name || '').toLowerCase().includes(query)
      );
      this.setData({ filteredIngredients: filtered });
    },

    async onSelectIngredient(e) {
      const { ingredientId, name, unit, image } = e.currentTarget.dataset;
      
      const res = await wx.showModal({
        title: `添加 ${name}`,
        editable: true,
        placeholderText: '请输入数量',
        content: '',
      });

      if (!res.confirm || !res.content) {
        return;
      }

      const quantity = parseFloat(res.content);
      if (isNaN(quantity) || quantity <= 0) {
        wx.showToast({ title: '请输入有效的数量', icon: 'none' });
        return;
      }

      const eventChannel = this.getOpenerEventChannel();
      eventChannel.emit('selectIngredient', {
        ingredientId,
        name,
        quantity,
        unit,
        image,
      });

      wx.navigateBack();
    },
  },
});

import { createPage } from '../../../utils/page';
import { getRecipes } from '../../../services/api';

createPage({
  data: {
    recipes: [],
    filteredRecipes: [],
    searchQuery: '',
    loading: false,
  },

  async onLoad() {
    await this.loadRecipes();
  },

  methods: {
    async loadRecipes() {
      this.setData({ loading: true });
      try {
        const recipes = await getRecipes();
        this.setData({ recipes }, () => {
          this.updateFilteredRecipes();
        });
      } catch (error) {
        console.error('加载菜谱失败', error);
        wx.showToast({ title: '加载失败', icon: 'none' });
        this.setData({ recipes: [] }, () => {
          this.updateFilteredRecipes();
        });
      } finally {
        this.setData({ loading: false });
      }
    },

    onSearchInput(e) {
      this.setData({ searchQuery: e.detail.value }, () => {
        this.updateFilteredRecipes();
      });
    },

    updateFilteredRecipes() {
      const { recipes, searchQuery } = this.data;
      if (!Array.isArray(recipes)) {
        this.setData({ filteredRecipes: [] });
        return;
      }
      const query = (searchQuery || '').trim().toLowerCase();
      if (!query) {
        this.setData({ filteredRecipes: recipes });
        return;
      }
      const filtered = recipes.filter((item = {}) =>
        String(item.name || '').toLowerCase().includes(query)
      );
      this.setData({ filteredRecipes: filtered });
    },

    onSelectRecipe(e) {
      const { recipeId } = e.currentTarget.dataset;
      const recipe = (this.data.recipes || []).find((r) => r.id === recipeId);
      
      if (recipe) {
        const eventChannel = this.getOpenerEventChannel();
        eventChannel.emit('selectRecipe', recipe);
        wx.navigateBack();
      }
    },
  },
});

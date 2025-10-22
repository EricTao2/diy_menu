import { createPage } from '../../../utils/page';
import { getRecipes } from '../../../services/api';

createPage({
  data: {
    recipes: [],
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
        this.setData({ recipes });
      } catch (error) {
        console.error('加载菜谱失败', error);
        wx.showToast({ title: '加载失败', icon: 'none' });
      } finally {
        this.setData({ loading: false });
      }
    },

    onSearchInput(e) {
      this.setData({ searchQuery: e.detail.value });
    },

    getFilteredRecipes() {
      const { recipes, searchQuery } = this.data;
      if (!searchQuery) {
        return recipes;
      }
      const query = searchQuery.toLowerCase();
      return recipes.filter(item => 
        item.name.toLowerCase().includes(query)
      );
    },

    onSelectRecipe(e) {
      const { recipeId } = e.currentTarget.dataset;
      const recipe = this.data.recipes.find(r => r.id === recipeId);
      
      if (recipe) {
        const eventChannel = this.getOpenerEventChannel();
        eventChannel.emit('selectRecipe', recipe);
        wx.navigateBack();
      }
    },
  },

  computed: {
    filteredRecipes() {
      return this.getFilteredRecipes();
    },
  },
});

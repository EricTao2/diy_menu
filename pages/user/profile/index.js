import { createPage } from '../../../utils/page';
import { getRecipes, getIngredients, deleteRecipe, deleteIngredient } from '../../../services/api';
import { formatDateTime } from '../../../utils/format';

// 格式化相对时间
const formatRelativeTime = (timestamp) => {
  if (!timestamp) return '';
  
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 7) {
    // 超过7天显示完整日期
    return formatDateTime(timestamp);
  } else if (days > 0) {
    return `${days}天前`;
  } else if (hours > 0) {
    return `${hours}小时前`;
  } else if (minutes > 0) {
    return `${minutes}分钟前`;
  } else {
    return '刚刚';
  }
};

createPage({
  data: {
    currentTab: 'recipes', // 'recipes' | 'ingredients'
    recipes: [],
    ingredients: [],
    recipesLoading: false,
    ingredientsLoading: false,
    recipeSearchQuery: '',
    ingredientSearchQuery: '',
    filteredRecipes: [],
    filteredIngredients: [],
  },

  async onLoad() {
    await this.loadRecipes();
    await this.loadIngredients();
  },

  async onShow() {
    // 每次显示页面时重新加载数据，确保能看到新创建的菜谱和原材料
    await this.loadRecipes();
    await this.loadIngredients();
  },

  methods: {
    onTabChange(e) {
      const { tab } = e.currentTarget.dataset;
      this.setData({ currentTab: tab });
    },

    async loadRecipes() {
      this.setData({ recipesLoading: true });
      try {
        const recipes = await getRecipes();
        this.setData({ recipes }, () => {
          this.updateFilteredRecipes();
        });
      } catch (error) {
        console.error('加载菜谱失败', error);
        wx.showToast({ title: '加载菜谱失败', icon: 'none' });
      } finally {
        this.setData({ recipesLoading: false });
      }
    },

    async loadIngredients() {
      this.setData({ ingredientsLoading: true });
      try {
        const ingredients = await getIngredients();
        this.setData({ ingredients }, () => {
          this.updateFilteredIngredients();
        });
      } catch (error) {
        console.error('加载原材料失败', error);
        wx.showToast({ title: '加载原材料失败', icon: 'none' });
      } finally {
        this.setData({ ingredientsLoading: false });
      }
    },

    onRecipeSearchInput(e) {
      this.setData({ recipeSearchQuery: e.detail.value }, () => {
        this.updateFilteredRecipes();
      });
    },

    onIngredientSearchInput(e) {
      this.setData({ ingredientSearchQuery: e.detail.value }, () => {
        this.updateFilteredIngredients();
      });
    },

    updateFilteredRecipes() {
      const { recipes, recipeSearchQuery } = this.data;
      let filtered = recipes;
      if (recipeSearchQuery) {
        const query = recipeSearchQuery.toLowerCase();
        filtered = recipes.filter(recipe => 
          recipe.name.toLowerCase().includes(query)
        );
      }
      
      // 格式化时间显示
      filtered = filtered.map(recipe => ({
        ...recipe,
        createdAtText: formatRelativeTime(recipe.createdAt),
      }));
      
      this.setData({ filteredRecipes: filtered });
    },

    updateFilteredIngredients() {
      const { ingredients, ingredientSearchQuery } = this.data;
      let filtered = ingredients;
      if (ingredientSearchQuery) {
        const query = ingredientSearchQuery.toLowerCase();
        filtered = ingredients.filter(ingredient => 
          ingredient.name.toLowerCase().includes(query)
        );
      }
      this.setData({ filteredIngredients: filtered });
    },

    onCreateRecipe() {
      wx.navigateTo({
        url: '/pages/user/recipe-edit/index',
      });
    },

    onRecipeCardTap(e) {
      const { recipeId } = e.currentTarget.dataset;
      wx.navigateTo({
        url: `/pages/user/recipe-detail/index?recipeId=${recipeId}`,
      });
    },

    onCreateIngredient() {
      wx.navigateTo({
        url: '/pages/user/ingredient-edit/index',
      });
    },

    onEditIngredient(e) {
      const { ingredientId } = e.currentTarget.dataset;
      wx.navigateTo({
        url: `/pages/user/ingredient-edit/index?ingredientId=${ingredientId}`,
      });
    },

    async onDeleteIngredient(e) {
      const { ingredientId, ingredientName } = e.currentTarget.dataset;
      
      const res = await wx.showModal({
        title: '确认删除',
        content: `确定要删除原材料"${ingredientName}"吗？此操作不可撤销。`,
        confirmText: '删除',
        cancelText: '取消',
      });

      if (!res.confirm) {
        return;
      }

      wx.showLoading({ title: '删除中', mask: true });
      try {
        await deleteIngredient(ingredientId);
        wx.showToast({ title: '删除成功', icon: 'success' });
        // 重新加载数据（loadIngredients 会自动更新 filteredIngredients）
        await this.loadIngredients();
      } catch (error) {
        console.error('删除原材料失败', error);
        wx.showToast({ title: '删除失败', icon: 'none' });
      } finally {
        wx.hideLoading();
      }
    },
  },
});


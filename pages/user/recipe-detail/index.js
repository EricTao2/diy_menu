import { createPage } from '../../../utils/page';
import { getRecipeById, deleteRecipe, getCurrentUser } from '../../../services/api';

createPage({
  data: {
    recipe: null,
    loading: false,
    aggregatedIngredients: [], // 聚合后的原材料
    isOwner: false, // 是否是创建者
    currentUserId: '',
  },

  async onLoad(options) {
    const { recipeId } = options;
    
    // 获取当前用户信息
    try {
      const currentUser = await getCurrentUser();
      this.setData({ currentUserId: currentUser.id });
    } catch (error) {
      console.error('获取当前用户失败', error);
    }
    
    if (recipeId) {
      await this.loadRecipe(recipeId);
    }
  },

  methods: {
    async loadRecipe(recipeId) {
      this.setData({ loading: true });
      try {
        const recipe = await getRecipeById(recipeId);
        const aggregatedIngredients = this.aggregateIngredients(recipe.ingredients || []);
        
        // 检查是否是创建者
        const { currentUserId } = this.data;
        const isOwner = recipe.userId === currentUserId;
        
        this.setData({ recipe, aggregatedIngredients, isOwner });
      } catch (error) {
        console.error('加载菜谱失败', error);
        wx.showToast({ title: '加载失败', icon: 'none' });
      } finally {
        this.setData({ loading: false });
      }
    },

    // 按名称聚合原材料
    aggregateIngredients(ingredients) {
      const grouped = {};
      
      ingredients.forEach(item => {
        if (!grouped[item.name]) {
          grouped[item.name] = {
            name: item.name,
            image: item.image,
            amounts: [],
          };
        }
        grouped[item.name].amounts.push({
          quantity: item.quantity,
          unit: item.unit,
        });
      });

      return Object.values(grouped);
    },

    onEdit() {
      const { recipe } = this.data;
      if (recipe) {
        wx.navigateTo({
          url: `/pages/user/recipe-edit/index?recipeId=${recipe.id}`,
        });
      }
    },

    async onDelete() {
      const { recipe } = this.data;
      if (!recipe) return;

      const res = await wx.showModal({
        title: '确认删除',
        content: `确定要删除菜谱"${recipe.name}"吗？此操作不可撤销。`,
        confirmText: '删除',
        confirmColor: '#ef4444',
        cancelText: '取消',
      });

      if (!res.confirm) {
        return;
      }

      wx.showLoading({ title: '删除中', mask: true });
      try {
        await deleteRecipe(recipe.id);
        wx.showToast({ title: '删除成功', icon: 'success' });
        
        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
      } catch (error) {
        console.error('删除菜谱失败', error);
        wx.showToast({ title: '删除失败', icon: 'none' });
      } finally {
        wx.hideLoading();
      }
    },
  },
});

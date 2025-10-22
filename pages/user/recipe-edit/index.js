import { createPage } from '../../../utils/page';
import { 
  getRecipeById, 
  createRecipe, 
  updateRecipe, 
  deleteRecipe,
  getIngredients 
} from '../../../services/api';

const RECIPE_IMAGE_DIR = 'recipe_images';
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB

createPage({
  data: {
    recipeId: '',
    isEdit: false,
    name: '',
    coverImage: '',
    content: '',
    ingredients: [], // [{ingredientId, name, quantity, unit, image}]
    allIngredients: [], // 用户的所有原材料
    saving: false,
    uploading: false,
  },

  async onLoad(options) {
    const { recipeId } = options;
    
    // 加载用户的所有原材料
    await this.loadIngredients();
    
    if (recipeId) {
      this.setData({ recipeId, isEdit: true });
      await this.loadRecipe(recipeId);
    }
  },

  methods: {
    async loadIngredients() {
      try {
        const allIngredients = await getIngredients();
        this.setData({ allIngredients });
      } catch (error) {
        console.error('加载原材料失败', error);
      }
    },

    async loadRecipe(recipeId) {
      wx.showLoading({ title: '加载中', mask: true });
      try {
        const recipe = await getRecipeById(recipeId);
        this.setData({
          name: recipe.name || '',
          coverImage: recipe.coverImage || '',
          content: recipe.content || '',
          ingredients: recipe.ingredients || [],
        });
      } catch (error) {
        console.error('加载菜谱失败', error);
        wx.showToast({ title: '加载失败', icon: 'none' });
      } finally {
        wx.hideLoading();
      }
    },

    onNameInput(e) {
      this.setData({ name: e.detail.value });
    },

    onContentInput(e) {
      this.setData({ content: e.detail.value });
    },

    async onChooseCoverImage() {
      if (this.data.uploading) {
        return;
      }

      try {
        const res = await wx.chooseMedia({
          count: 1,
          mediaType: ['image'],
          sizeType: ['compressed'],
        });

        if (!res.tempFiles || res.tempFiles.length === 0) {
          return;
        }

        const file = res.tempFiles[0];
        if (file.size > MAX_IMAGE_SIZE) {
          wx.showToast({ title: '图片不能超过10MB', icon: 'none' });
          return;
        }

        await this.uploadImage(file.tempFilePath);
      } catch (error) {
        if (error.errMsg && error.errMsg.includes('cancel')) {
          return;
        }
        console.error('选择图片失败', error);
        wx.showToast({ title: '选择图片失败', icon: 'none' });
      }
    },

    async uploadImage(tempFilePath) {
      this.setData({ uploading: true });
      wx.showLoading({ title: '上传中', mask: true });

      try {
        const timestamp = Date.now();
        const random = Math.random().toString(36).slice(2, 8);
        const cloudPath = `${RECIPE_IMAGE_DIR}/${timestamp}-${random}.jpg`;

        const result = await wx.cloud.uploadFile({
          cloudPath,
          filePath: tempFilePath,
        });

        this.setData({ coverImage: result.fileID });
        wx.showToast({ title: '上传成功', icon: 'success' });
      } catch (error) {
        console.error('上传图片失败', error);
        wx.showToast({ title: '上传失败', icon: 'none' });
      } finally {
        wx.hideLoading();
        this.setData({ uploading: false });
      }
    },

    onAddIngredient() {
      wx.navigateTo({
        url: '/pages/user/ingredient-select/index',
        events: {
          selectIngredient: (data) => {
            this.addIngredient(data);
          },
        },
      });
    },

    addIngredient(ingredient) {
      const { ingredients } = this.data;
      
      // 检查是否已添加
      const exists = ingredients.find(item => 
        item.ingredientId === ingredient.ingredientId &&
        item.unit === ingredient.unit
      );
      
      if (exists) {
        wx.showToast({ title: '该原材料已添加', icon: 'none' });
        return;
      }

      this.setData({
        ingredients: [...ingredients, ingredient],
      });
    },

    onRemoveIngredient(e) {
      const { index } = e.currentTarget.dataset;
      const { ingredients } = this.data;
      
      ingredients.splice(index, 1);
      this.setData({ ingredients: [...ingredients] });
    },

    async onSave() {
      const { recipeId, isEdit, name, coverImage, content, ingredients, saving } = this.data;

      if (saving) {
        return;
      }

      if (!name.trim()) {
        wx.showToast({ title: '请输入菜谱名称', icon: 'none' });
        return;
      }

      this.setData({ saving: true });
      wx.showLoading({ title: '保存中', mask: true });

      try {
        const payload = {
          name: name.trim(),
          coverImage,
          content,
          ingredients,
        };

        if (isEdit) {
          await updateRecipe(recipeId, payload);
        } else {
          await createRecipe(payload);
        }

        wx.showToast({ title: '保存成功', icon: 'success' });
        
        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
      } catch (error) {
        console.error('保存菜谱失败', error);
        wx.showToast({ title: '保存失败', icon: 'none' });
        this.setData({ saving: false });
      } finally {
        wx.hideLoading();
      }
    },

    async onDelete() {
      const { recipeId, name } = this.data;

      const res = await wx.showModal({
        title: '确认删除',
        content: `确定要删除菜谱"${name}"吗？此操作不可撤销。`,
        confirmText: '删除',
        cancelText: '取消',
      });

      if (!res.confirm) {
        return;
      }

      wx.showLoading({ title: '删除中', mask: true });
      try {
        await deleteRecipe(recipeId);
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

import { createPage } from '../../../utils/page';
import { createIngredient, updateIngredient, deleteIngredient, getIngredients } from '../../../services/api';

const INGREDIENT_IMAGE_DIR = 'ingredient_images';
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

createPage({
  data: {
    ingredientId: '',
    isEdit: false,
    name: '',
    unit: '份',
    image: '',
    remark: '',
    saving: false,
    uploading: false,
  },

  async onLoad(options) {
    const { ingredientId } = options;
    
    if (ingredientId) {
      this.setData({ ingredientId, isEdit: true });
      await this.loadIngredient(ingredientId);
    }
  },

  methods: {
    async loadIngredient(ingredientId) {
      wx.showLoading({ title: '加载中', mask: true });
      try {
        const ingredients = await getIngredients();
        const ingredient = ingredients.find(item => item.id === ingredientId);
        
        if (ingredient) {
          this.setData({
            name: ingredient.name || '',
            unit: ingredient.unit || '份',
            image: ingredient.image || '',
            remark: ingredient.remark || '',
          });
        }
      } catch (error) {
        console.error('加载原材料失败', error);
        wx.showToast({ title: '加载失败', icon: 'none' });
      } finally {
        wx.hideLoading();
      }
    },

    onNameInput(e) {
      this.setData({ name: e.detail.value });
    },

    onUnitInput(e) {
      this.setData({ unit: e.detail.value });
    },

    onRemarkInput(e) {
      this.setData({ remark: e.detail.value });
    },

    async onChooseImage() {
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
      }
    },

    async uploadImage(tempFilePath) {
      this.setData({ uploading: true });
      wx.showLoading({ title: '上传中', mask: true });

      try {
        const timestamp = Date.now();
        const random = Math.random().toString(36).slice(2, 8);
        const cloudPath = `${INGREDIENT_IMAGE_DIR}/${timestamp}-${random}.jpg`;

        const result = await wx.cloud.uploadFile({
          cloudPath,
          filePath: tempFilePath,
        });

        this.setData({ image: result.fileID });
        wx.showToast({ title: '上传成功', icon: 'success' });
      } catch (error) {
        console.error('上传图片失败', error);
        wx.showToast({ title: '上传失败', icon: 'none' });
      } finally {
        wx.hideLoading();
        this.setData({ uploading: false });
      }
    },

    async onSave() {
      const { ingredientId, isEdit, name, unit, image, remark, saving } = this.data;

      if (saving) {
        return;
      }

      if (!name.trim()) {
        wx.showToast({ title: '请输入原材料名称', icon: 'none' });
        return;
      }

      if (!unit.trim()) {
        wx.showToast({ title: '请输入单位', icon: 'none' });
        return;
      }

      this.setData({ saving: true });
      wx.showLoading({ title: '保存中', mask: true });

      try {
        const payload = {
          name: name.trim(),
          unit: unit.trim(),
          image,
          remark,
        };

        if (isEdit) {
          await updateIngredient(ingredientId, payload);
        } else {
          await createIngredient(payload);
        }

        wx.showToast({ title: '保存成功', icon: 'success' });
        
        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
      } catch (error) {
        console.error('保存原材料失败', error);
        wx.showToast({ title: '保存失败', icon: 'none' });
        this.setData({ saving: false });
      } finally {
        wx.hideLoading();
      }
    },

    async onDelete() {
      const { ingredientId, name } = this.data;

      const res = await wx.showModal({
        title: '确认删除',
        content: `确定要删除原材料"${name}"吗？此操作不可撤销。`,
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
        
        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
      } catch (error) {
        console.error('删除原材料失败', error);
        wx.showToast({ title: '删除失败', icon: 'none' });
      } finally {
        wx.hideLoading();
      }
    },
  },
});

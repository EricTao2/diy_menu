import { ADMIN_BOTTOM_TABS } from '../common/admin-tabs';

Component({
  options: {
    addGlobalClass: true,
  },
  properties: {
    activeKey: {
      type: String,
      value: 'menuDesigner',
    },
    tabs: {
      type: Array,
      value: ADMIN_BOTTOM_TABS,
    },
  },
  methods: {
    onSelect(event) {
      const { key } = event.currentTarget.dataset || {};
      if (!key || key === this.data.activeKey) {
        return;
      }
      this.triggerEvent('change', { key });
    },
  },
});

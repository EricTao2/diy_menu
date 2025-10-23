import { ADMIN_BOTTOM_TABS } from '../common/admin-tabs';

Component({
  options: {
    addGlobalClass: true,
  },
  data: {
    iconMap: {
      customerNotifications: '🔔',
      customerMenu: '🍽️',
      customerCart: '🛒',
      customerOrders: '📋',
      menuDesigner: '✏️',
      menuSettings: '⚙️',
      optionLibrary: '📚',
      orderOverview: '📊',
      chefOrders: '📋',
      chefNotifications: '🔔',
    },
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
    unreadCount: {
      type: Number,
      value: 0,
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

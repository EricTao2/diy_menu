Component({
  properties: {
    notifications: {
      type: Array,
      value: [],
    },
    emptyText: {
      type: String,
      value: '',
    },
  },
  methods: {
    onTap(event) {
      const { notificationId } = event.currentTarget.dataset;
      this.triggerEvent('tap', { notificationId });
    },
  },
});

const STATUS_MAP = {
  new: { labelKey: 'chef.orders.statusNew', className: 'status-new' },
  processing: { labelKey: 'chef.orders.statusProcessing', className: 'status-processing' },
  completed: { labelKey: 'chef.orders.statusCompleted', className: 'status-completed' },
  cancelled: { labelKey: 'chef.orders.statusCancelled', className: 'status-cancelled' },
};

Component({
  properties: {
    status: {
      type: String,
      value: 'new',
    },
    text: {
      type: String,
      value: '',
    },
  },
  data: {
    label: '',
    className: '',
  },
  lifetimes: {
    attached() {
      this.updateStatus();
    },
  },
  observers: {
    status() {
      this.updateStatus();
    },
  },
  methods: {
    updateStatus() {
      const info = STATUS_MAP[this.data.status] || STATUS_MAP.new;
      this.setData({
        label: this.data.text || info.labelKey,
        className: info.className,
      });
    },
  },
});

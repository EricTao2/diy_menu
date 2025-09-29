Component({
  properties: {
    visible: {
      type: Boolean,
      value: true,
    },
    itemCount: {
      type: Number,
      value: 0,
    },
    itemLabel: {
      type: String,
      value: '件',
    },
    totalPrice: {
      type: Number,
      value: 0,
    },
    currency: {
      type: String,
      value: '¥',
    },
    label: {
      type: String,
      value: '',
    },
  },
  data: {
    totalText: '0.00',
  },
  observers: {
    totalPrice(val) {
      const total = Number(val || 0).toFixed(2);
      this.setData({ totalText: total });
    },
  },
  methods: {
    onTap() {
      this.triggerEvent('tap');
    },
  },
});

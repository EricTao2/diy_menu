Component({
  properties: {
    roles: {
      type: Array,
      value: [],
    },
    activeRole: {
      type: String,
      value: '',
    },
    roleLabels: {
      type: Object,
      value: {},
    },
  },
  methods: {
    onSwitch(event) {
      const { role } = event.currentTarget.dataset;
      this.triggerEvent('switch', { role });
    },
  },
});

Component({
  properties: {
    options: {
      type: Array,
      value: [],
    },
    value: {
      type: Object,
      value: {},
    },
  },
  data: {
    selection: {},
  },
  observers: {
    value(val = {}) {
      this.setData({ selection: { ...val } });
    },
  },
  methods: {
    selectChoice(event) {
      const { optionId, value } = event.currentTarget.dataset;
      const selection = { ...this.data.selection, [optionId]: value };
      this.setData({ selection });
      this.triggerEvent('change', { selection });
    },
  },
});

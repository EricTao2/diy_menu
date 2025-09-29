Component({
  properties: {
    themes: {
      type: Array,
      value: [],
    },
    value: {
      type: String,
      value: '',
    },
    label: {
      type: String,
      value: '',
    },
  },
  methods: {
    onSelect(event) {
      const { themeId } = event.currentTarget.dataset;
      this.triggerEvent('change', { value: themeId });
    },
  },
});

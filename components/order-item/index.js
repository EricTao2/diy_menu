const formatCurrency = (value) => {
  const number = Number(value || 0);
  return number.toFixed(1);
};

const formatTime = (timestamp) => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d} ${hh}:${mm}`;
};

Component({
  properties: {
    order: {
      type: Object,
      value: null,
    },
    statusText: {
      type: String,
      value: '',
    },
    showActions: {
      type: Boolean,
      value: false,
    },
    actionText: {
      type: String,
      value: '',
    },
    secondaryActionText: {
      type: String,
      value: '',
    },
    viewText: {
      type: String,
      value: '详情',
    },
  },
  data: {
    orderView: null,
  },
  observers: {
    order(order) {
      if (!order) {
        this.setData({ orderView: null });
        return;
      }
      const orderView = {
        ...order,
        totalPriceText: formatCurrency(order.totalPrice),
        createdAtText: formatTime(order.createdAt),
        items: (order.items || []).map((item) => ({
          ...item,
          totalPriceText: formatCurrency(item.unitPrice * item.quantity),
          optionsArray: item.optionsSnapshot
            ? Object.keys(item.optionsSnapshot).map((optionId) => {
                const option = item.optionsSnapshot[optionId] || {};
                const displayLabel = option.selectedLabel || option.selectedValue || '';
                return {
                  id: optionId,
                  name: option.name || '',
                  value: option.selectedValue || '',
                  label: displayLabel,
                  text: displayLabel
                    ? `${option.name || ''}：${displayLabel}`
                    : option.name || '',
                };
              })
            : [],
        })),
      };
      this.setData({ orderView });
    },
  },
  methods: {
    onCardTap(event) {
      const target = event?.target || {};
      if (target?.dataset?.action) {
        return;
      }
      this.triggerEvent('view', { orderId: this.data.order?.id });
    },
    onActionTap(event) {
      const action = event.currentTarget?.dataset?.action;
      if (!action) {
        return;
      }
      if (action === 'primary') {
        this.triggerEvent('primary', { orderId: this.data.order?.id });
      } else if (action === 'secondary') {
        this.triggerEvent('secondary', { orderId: this.data.order?.id });
      }
    },
  },
});

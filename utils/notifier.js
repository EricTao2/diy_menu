let counter = 0;

const createNotifier = () => {
  const listeners = new Set();
  let notifications = [];

  const emit = () => {
    listeners.forEach((listener) => listener([...notifications]));
  };

  const push = ({ title, message, type = 'info', payload = {} }) => {
    const notification = {
      id: `notification_${++counter}`,
      title,
      message,
      type,
      payload,
      createdAt: Date.now(),
      read: false,
    };
    notifications = [notification, ...notifications];
    emit();
    return notification;
  };

  const markRead = (id) => {
    notifications = notifications.map((item) =>
      item.id === id ? { ...item, read: true } : item
    );
    emit();
  };

  const clear = () => {
    notifications = [];
    emit();
  };

  const subscribe = (listener) => {
    listeners.add(listener);
    listener([...notifications]);
    return () => listeners.delete(listener);
  };

  const getNotifications = () => [...notifications];

  return {
    push,
    markRead,
    clear,
    subscribe,
    getNotifications,
  };
};

export { createNotifier };

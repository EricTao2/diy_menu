import { getWindowMetrics, getRpxRatio } from '../../utils/system-info';

const LOCK_RELEASE_DISTANCE = 60; // px: 解锁后需继续上拉的距离才允许再次锁定
const DISH_UNLOCK_THRESHOLD = 20; // px: 向上滚动接近顶部时自动解锁的容差
const TOUCH_GRACE_DURATION = 400; // ms: 惯性滚动的触摸宽限时间
const TOUCH_INTENT_THRESHOLD = 10; // px: 识别手势意图的最小位移

Component({
  options: {
    multipleSlots: true,
  },

  properties: {
    tabbarHeight: {
      type: Number,
      value: 160,
    },
    heightOffset: {
      type: Number,
      value: 0,
    },
    containerPadding: {
      type: Number,
      value: 0,
    },
    highlightBoundary: {
      type: Boolean,
      value: false,
    },
    flushLeft: {
      type: Boolean,
      value: false,
    },
    flushRight: {
      type: Boolean,
      value: false,
    },
    sentinelOffset: {
      type: Number,
      value: 0,
    },
    debugSentinel: {
      type: Boolean,
      value: false,
    },
    categoryWidth: {
      type: Number,
      value: 200,
    },
  },

  data: {
    isLocked: false,
    menuAreaStyle: '',
    sentinelStyle: '',
    pageScrollTarget: '',
    categoryScrollTop: 0,
    dishScrollTop: 0,
    categoryListStyle: '',
  },

  observers: {
    tabbarHeight() {
      if (this._ready) {
        this.calculateMenuAreaHeight();
      }
    },
    containerPadding() {
      if (this._ready) {
        this.applyContainerPadding();
      }
    },
    heightOffset() {
      if (this._ready) {
        this.calculateMenuAreaHeight();
      }
    },
    flushLeft() {
      if (this._ready) {
        this.applyContainerPadding();
      }
    },
    flushRight() {
      if (this._ready) {
        this.applyContainerPadding();
      }
    },
    sentinelOffset() {
      if (this._ready) {
        this.applySentinelOffset();
      }
    },
    debugSentinel() {
      if (this._ready) {
        this.applySentinelOffset();
      }
    },
    categoryWidth() {
      if (this._ready) {
        this.applyCategoryWidth();
      }
    },
  },

  lifetimes: {
    attached() {
      this.init();
    },

    detached() {
      this.destroy();
    },
  },

  pageLifetimes: {
    show() {
      if (this._ready) {
        this.recalculateLayout();
      }
    },
  },

  methods: {
    init() {
      this._ready = true;
      this.windowWidth = 0;
      this.menuAreaHeight = 0;
      this.headerHeight = 0;
      this.lockTriggerTop = 0;
      this.lockScrollTop = 0;
      this.releaseGuardTop = null;
      this.releaseGuardScrollTop = null;
      this.lockReady = true;

      this.currentPageScrollTop = 0;
      this.previousDishScrollTop = 0;
      this.dishScrollDirection = 'down';
      this.isTouchingDishes = false;
      this.touchGraceExpiresAt = 0;
      this.isTouchingDishes = false;
      this.touchGraceExpiresAt = Date.now() + TOUCH_GRACE_DURATION;
      this.captureTouchStartY = null;
      this.captureIntentHandled = false;
      this.latestCategoryScrollTop = 0;
      this.latestDishScrollTop = 0;

      this.refreshWindowMetrics();
      this.calculateMenuAreaHeight();
      this.applyContainerPadding();
      this.applySentinelOffset();
      this.applyCategoryWidth();

      wx.nextTick(() => {
        this.measureHeaderHeight();
        this.measureViewportHeight();
        this.initSentinelObserver();
      });
    },

    destroy() {
      this.destroySentinelObserver();
      this._ready = false;
      this.isTouchingDishes = false;
      this.touchGraceExpiresAt = 0;
      this.captureTouchStartY = null;
      this.captureIntentHandled = false;
      this.latestCategoryScrollTop = 0;
      this.latestDishScrollTop = 0;
      this.windowWidth = 0;
      this.windowMetrics = null;
    },

    recalculateLayout() {
      this.refreshWindowMetrics();
      this.calculateMenuAreaHeight();
      this.applyContainerPadding();
      this.applySentinelOffset();
      this.applyCategoryWidth();
      this.measureHeaderHeight();
      this.measureViewportHeight();
    },

    calculateMenuAreaHeight() {
      const windowInfo = this.windowMetrics || getWindowMetrics();
      if (!windowInfo) {
        return;
      }
      const { windowHeight, windowWidth } = windowInfo;
      if (!windowHeight || !windowWidth) {
        return;
      }
      this.windowWidth = windowWidth;
      const tabbarHeight = Number(this.data.tabbarHeight) || 0;
      const tabbarHeightPx = this.rpxToPx(tabbarHeight);
      const heightOffset = Number(this.data.heightOffset) || 0;
      const heightOffsetPx = this.rpxToPx(heightOffset);
      const menuHeight = Math.max(windowHeight - tabbarHeightPx - heightOffsetPx, 0);
      this.menuAreaHeight = menuHeight;
      this.setData({
        menuAreaStyle: this.composeMenuAreaStyle(menuHeight),
      });
      this.updateLockTrigger();
    },

    composeMenuAreaStyle(heightPx) {
      const padding = Number(this.data.containerPadding) || 0;
      const flushLeft = !!this.properties.flushLeft;
      const flushRight = !!this.properties.flushRight;
      const leftPadding = flushLeft ? 0 : padding;
      const rightPadding = flushRight ? 0 : padding;
      return `height: ${heightPx}px; padding: ${padding}rpx ${rightPadding}rpx ${padding}rpx ${leftPadding}rpx; box-sizing: border-box;`;
    },

    applyContainerPadding() {
      if (!this.menuAreaHeight) {
        return;
      }
      this.setData({
        menuAreaStyle: this.composeMenuAreaStyle(this.menuAreaHeight),
      });
    },

    applySentinelOffset() {
      const offset = Number(this.data.sentinelOffset) || 0;
      this.sentinelOffsetPx = this.rpxToPx(offset);
      const translate = offset ? `transform: translateY(${offset}rpx);` : '';
      const debugStyle = this.data.debugSentinel
        ? 'height: 4rpx; background: rgba(255, 69, 58, 0.6);'
        : 'height: 0;';
      this.setData({
        sentinelStyle: `${translate} ${debugStyle}`,
      });
      if (this._ready) {
        this.initSentinelObserver();
        this.updateLockTrigger();
      }
    },

    applyCategoryWidth() {
      const width = Number(this.data.categoryWidth);
      const validWidth = Number.isFinite(width) && width > 0 ? width : 200;
      const style = `width: ${validWidth}rpx; flex: 0 0 ${validWidth}rpx;`;
      this.setData({
        categoryListStyle: style,
      });
    },

    refreshWindowMetrics() {
      this.windowMetrics = getWindowMetrics();
      this.windowWidth = this.windowMetrics?.windowWidth || 0;
    },

    rpxToPx(rpx) {
      const rpxValue = Number(rpx) || 0;
      if (!this.windowWidth) {
        this.refreshWindowMetrics();
      }
      if (!this.windowWidth) {
        const ratio = getRpxRatio();
        return ratio ? rpxValue * ratio : rpxValue;
      }
      return (rpxValue * this.windowWidth) / 750;
    },

    initSentinelObserver() {
      this.destroySentinelObserver();
      if (!this._ready) {
        return;
      }
      const observer = this.createIntersectionObserver({
        thresholds: [0, 0.01, 1],
      });
      observer.relativeToViewport({ top: 0 });
      observer.observe('#msc-sentinel', (entry) => {
        if (!this.lockReady || this.data.isLocked) {
          return;
        }
        const top = entry?.boundingClientRect?.top;
        if (typeof top === 'number' && top <= 0) {
          this.enterLockMode('observer');
        }
      });
      this.sentinelObserver = observer;
    },

    destroySentinelObserver() {
      if (this.sentinelObserver) {
        try {
          this.sentinelObserver.disconnect();
        } catch (err) {
          // swallow
        }
        this.sentinelObserver = null;
      }
    },

    measureHeaderHeight() {
      const query = this.createSelectorQuery();
      query.select('#msc-header').boundingClientRect((rect) => {
        this.headerHeight = rect ? rect.height || 0 : 0;
        this.updateLockTrigger();
      }).exec();
    },

    measureViewportHeight() {
      const query = this.createSelectorQuery();
      query.select('#msc-scroll').boundingClientRect((rect) => {
        this.viewportHeight = rect ? rect.height || 0 : 0;
      }).exec();
    },

    updateLockTrigger() {
      const headerHeight = this.headerHeight || 0;
      const offsetPx = this.sentinelOffsetPx || 0;
      this.lockTriggerTop = Math.max(headerHeight + offsetPx, 0);
    },

    onPageScroll(event) {
      const detail = event?.detail || {};
      const scrollTop = detail.scrollTop || 0;
      const last = this.currentPageScrollTop || 0;
      const direction = scrollTop > last ? 'down' : scrollTop < last ? 'up' : 'none';
      this.currentPageScrollTop = scrollTop;
      this.triggerEvent('pagescroll', {
        scrollTop,
        direction,
        isLocked: this.data.isLocked,
        lockReady: this.lockReady,
      });

      if (!this.data.isLocked && this.lockReady && direction === 'down' && scrollTop >= this.lockTriggerTop) {
        this.enterLockMode('scroll');
      }

      if (!this.lockReady) {
        const guardTop = this.releaseGuardTop != null ? this.releaseGuardTop : 0;
        if (direction === 'up' && scrollTop <= guardTop) {
          this.lockReady = true;
          this.releaseGuardTop = null;
          this.releaseGuardScrollTop = null;
        } else if (direction === 'down') {
          this.lockReady = true;
          this.releaseGuardTop = null;
          this.releaseGuardScrollTop = null;
        }
      }
    },

    enterLockMode(reason) {
      if (this.data.isLocked || !this.lockReady) {
        return;
      }
      const targetScrollTop = Math.max(this.currentPageScrollTop || 0, this.lockTriggerTop || 0);
      this.lockScrollTop = targetScrollTop;
      this.lockDishScrollTop = this.previousDishScrollTop || 0;
      this.dishScrollDirection = 'down';
      this._skipNextDishDirection = true;
      this.setData({
        isLocked: true,
      });
      this.triggerLockChange(true, reason);
    },

    triggerLockChange(isLocked, reason) {
      this.triggerEvent('lockchange', {
        isLocked,
        reason,
      });
    },

    exitLockMode(reason) {
      if (!this.data.isLocked) {
        return;
      }
      this.lockReady = false;
      this.releaseGuardTop = Math.max(this.lockScrollTop - LOCK_RELEASE_DISTANCE, 0);
      this.releaseGuardScrollTop = this.currentPageScrollTop != null ? this.currentPageScrollTop : this.lockScrollTop;
      this.setData({
        isLocked: false,
      });
      this.isTouchingDishes = false;
      this.triggerLockChange(false, reason);
    },

    onCategoryScroll(event) {
      const { scrollTop } = event?.detail || {};
      this.latestCategoryScrollTop = typeof scrollTop === 'number' ? scrollTop : this.latestCategoryScrollTop;
    },

    onDishScroll(event) {
      const detail = event?.detail || {};
      const scrollTop = detail.scrollTop || 0;
      const last = this.previousDishScrollTop || 0;
      const now = Date.now();
      this.touchGraceExpiresAt = now + TOUCH_GRACE_DURATION;
      this.latestDishScrollTop = scrollTop;
      if (scrollTop <= 0) {
        this.previousDishScrollTop = 0;
        this.dishScrollDirection = 'up';
        if (this.data.isLocked && scrollTop <= DISH_UNLOCK_THRESHOLD) {
          this.exitLockMode('dish-near-top');
        }
        return;
      }
      if (this._skipNextDishDirection) {
        this._skipNextDishDirection = false;
      } else if (scrollTop > last) {
        this.dishScrollDirection = 'down';
      } else if (scrollTop < last) {
        this.dishScrollDirection = 'up';
      }
      this.previousDishScrollTop = scrollTop;
      const touching = this.isTouchingDishes || now <= this.touchGraceExpiresAt;
      this.triggerEvent('dishscroll', {
        scrollTop,
        direction: this.dishScrollDirection,
        touching,
        isLocked: this.data.isLocked,
      });

      if (
        this.data.isLocked &&
        this.dishScrollDirection === 'up' &&
        scrollTop <= DISH_UNLOCK_THRESHOLD
      ) {
        this.exitLockMode('dish-near-top');
      }
    },

    onDishScrollUpper() {
      if (!this.data.isLocked) {
        return;
      }
      const touching = this.isTouchingDishes || Date.now() <= this.touchGraceExpiresAt;
      if (!touching) {
        return;
      }
      if (this.dishScrollDirection !== 'up') {
        return;
      }
      this.exitLockMode('dish-upper');
    },

    onDishTouchStart() {
      this.isTouchingDishes = true;
      this.touchGraceExpiresAt = Date.now() + TOUCH_GRACE_DURATION;
      this.captureDishScrollOffset('dish-touch-start');
    },

    onDishTouchEnd() {
      this.isTouchingDishes = false;
    },

    onTouchStartCapture(event) {
      this.isTouchingDishes = true;
      this.touchGraceExpiresAt = Date.now() + TOUCH_GRACE_DURATION;
      const touch = this._getPrimaryTouch(event);
      this.captureTouchStartY = touch ? touch.clientY : null;
      this.captureIntentHandled = false;
      this.captureDishScrollOffset('capture-touch-start');
    },

    onTouchMoveCapture(event) {
      if (this.captureIntentHandled) {
        return;
      }
      const touch = this._getPrimaryTouch(event);
      if (!touch || this.captureTouchStartY == null) {
        return;
      }
      const delta = touch.clientY - this.captureTouchStartY;
      if (Math.abs(delta) < TOUCH_INTENT_THRESHOLD) {
        return;
      }
      const params = {
        delta,
        isLocked: this.data.isLocked,
        lockReady: this.lockReady,
        scrollTop: this.currentPageScrollTop,
        lockTriggerTop: this.lockTriggerTop,
      };
      if (delta <= -TOUCH_INTENT_THRESHOLD && !this.data.isLocked) {
        if (!this.lockReady) {
          this.lockReady = true;
          this.releaseGuardTop = null;
          this.releaseGuardScrollTop = null;
        }
        if (this.lockReady && this.currentPageScrollTop >= this.lockTriggerTop) {
          this.captureIntentHandled = true;
          this.enterLockMode('capture-intent');
        }
      }
    },

    onTouchEndCapture() {
      this.isTouchingDishes = false;
      this.touchGraceExpiresAt = Date.now() + TOUCH_GRACE_DURATION;
      this.captureTouchStartY = null;
      this.captureIntentHandled = false;
    },

    captureDishScrollOffset(reason) {
      if (!this.data.isLocked) {
        return;
      }
      const query = this.createSelectorQuery();
      query
        .select('#msc-dishes')
        .scrollOffset((res) => {
          const scrollTop = res?.scrollTop != null ? res.scrollTop : null;
          if (
            scrollTop != null &&
            scrollTop <= DISH_UNLOCK_THRESHOLD * 3 &&
            this.dishScrollDirection === 'up'
          ) {
            this.exitLockMode('dish-offset');
          }
        })
        .exec();
    },

    _getPrimaryTouch(eventLike) {
      const touches = eventLike?.touches || eventLike?.changedTouches;
      if (!touches || !touches.length) {
        return null;
      }
      return touches[0];
    },

    scrollPageToAnchor(anchorId, options = {}) {
      if (!anchorId) {
        return;
      }
      const immediate = !!options.immediate;
      const apply = () => {
        this.setData({ pageScrollTarget: anchorId });
      };
      if (immediate) {
        apply();
        return;
      }
      this.setData({ pageScrollTarget: '' }, () => {
        apply();
      });
    },

    scrollDishIntoView(anchorId, options = {}) {
      if (!anchorId) {
        return;
      }
      if (!this.data.isLocked) {
        this.scrollPageToAnchor(anchorId, options);
        return;
      }
      wx.nextTick(() => {
        const query = this.createSelectorQuery();
        query.select('#msc-dishes').boundingClientRect();
        query.select('#msc-dishes').scrollOffset();
        query.select(`#${anchorId}`).boundingClientRect();
        query.exec((res = []) => {
          const [containerRect, containerOffset, targetRect] = res;
          if (!containerRect || !containerOffset || !targetRect) {
            console.warn('[MenuScroll] dish anchor not found', {
              anchorId,
              containerRect,
              containerOffset,
              targetRect,
            });
            return;
          }
          const containerTop = containerRect.top || 0;
          const currentScrollTop = typeof containerOffset.scrollTop === 'number' ? containerOffset.scrollTop : (this.latestDishScrollTop || 0);
          const targetTop = targetRect.top || 0;
          const nextScrollTop = Math.max(Math.round(currentScrollTop + (targetTop - containerTop)), 0);
          this.scrollDishTo(nextScrollTop, options);
        });
      });
    },

    scrollDishTo(scrollTop, options = {}) {
      if (!this.data.isLocked) {
        return;
      }
      let value = Math.max(Number(scrollTop) || 0, 0);
      if (value <= 0) {
        value = 2; // 保持微小偏移，避免触发顶部解锁
      }
      const current = this.latestDishScrollTop || 0;
      if (!options.force && Math.abs(value - current) < 1) {
        return;
      }
      this.latestDishScrollTop = value;
      this.previousDishScrollTop = value;
      this.setData({ dishScrollTop: value });
      console.log('[MenuScroll] dish scrollTo', { scrollTop: value });
    },

    scrollCategoryTo(scrollTop) {
      if (!this.data.isLocked) {
        return;
      }
      const value = Math.max(Number(scrollTop) || 0, 0);
      if (Math.abs(value - (this.latestCategoryScrollTop || 0)) < 1) {
        return;
      }
      this.latestCategoryScrollTop = value;
      this.setData({ categoryScrollTop: value });
      console.log('[MenuScroll] category scrollTo', { scrollTop: value });
    },
  },
});

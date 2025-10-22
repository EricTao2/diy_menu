# MenuScrollContainer 菜单滚动容器

封装菜单页面的滚动交互逻辑，支持整页滚动与锁定模式自动切换。

## 功能特性

- ✅ 整页滚动与锁定模式自动切换
- ✅ 锁定后左侧分类、右侧菜品独立滚动
- ✅ 滚动到顶部自动解锁
- ✅ 高度自适应（视口 - tabbar，安全区通过 tabbar padding 处理）
- ✅ 内置触摸桥接逻辑，解锁后继续拖拽自然衔接整页滚动
- ✅ 响应 tabbar 高度/窗口尺寸动态变化
- ✅ 可调试的哨兵位置
- ✅ 隐藏滚动条

## 使用方式

### 1. 引入组件

```json
{
  "usingComponents": {
    "menu-scroll-container": "/components/menu-scroll-container/index"
  }
}
```

### 2. 页面使用

```xml
<menu-scroll-container 
  tabbar-height="{{160}}"
  sentinel-offset="{{-150}}"
  debug-sentinel="{{false}}"
  container-padding="{{24}}"
  highlight-boundary="{{true}}"
  flush-left="{{true}}"
  flush-right="{{true}}"
  height-offset="{{32}}"
  bind:lockchange="onLockChange"
>
  <!-- 顶部菜单信息 -->
  <view slot="header">
    <view class="menu-info">...</view>
  </view>

  <!-- 左侧分类列表 -->
  <view slot="categories">
    <view wx:for="{{categories}}" wx:key="id">
      {{item.name}}
    </view>
  </view>

  <!-- 右侧菜品列表 -->
  <view slot="dishes">
    <view wx:for="{{dishes}}" wx:key="id">
      {{item.name}}
    </view>
  </view>
</menu-scroll-container>
```

## 属性说明

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `tabbar-height` | Number | 160 | 底部 tabbar 高度（rpx） |
| `sentinel-offset` | Number | 0 | 哨兵偏移量（rpx），负值=更早触发，正值=更晚触发 |
| `debug-sentinel` | Boolean | false | 调试模式，显示哨兵红线 |
| `container-padding` | Number | 0 | 选菜区域内部留白（rpx），用于在四周增加视觉间距 |
| `highlight-boundary` | Boolean | false | 是否为选菜区域添加边界高亮（圆角、描边、阴影） |
| `height-offset` | Number | 0 | 额外减去的高度（rpx），用于手动调节选菜区域高度 |
| `flush-left` | Boolean | false | 是否去掉左侧视觉边界，与页面左缘对齐 |
| `flush-right` | Boolean | false | 是否去掉右侧视觉边界，与页面右缘对齐 |
| `category-width` | Number | 200 | 左侧分类列宽度（rpx），剩余宽度自动分配给菜品列表 |

> 若开启 `highlight-boundary`，建议配合 `container-padding` 设置一定的留白，让描边与阴影不过度贴边。

### sentinel-offset 调整示例

```javascript
// 提前 150rpx 触发锁定
sentinelOffset: -150

// 延后 100rpx 触发锁定
sentinelOffset: 100

// 默认位置
sentinelOffset: 0
```

## 事件说明

### lockchange
锁定状态变化事件

```javascript
onLockChange(e) {
  const { isLocked } = e.detail;
  console.log('锁定状态:', isLocked);
}
```

## 可调用方法

> 可通过 `this.selectComponent('#menuScroll')` 获取组件实例后调用以下方法。

- `scrollPageToAnchor(anchorId, options)`：在整页滚动模式下滚动到指定锚点。
- `scrollDishIntoView(anchorId, options)`：在锁定模式下将菜品分组滚动到视图范围（未锁定时自动退化为整页滚动）。
- `scrollCategoryTo(scrollTop)`：锁定模式下设置分类列表的滚动位置（单位 px）。常配合页面层的 `createSelectorQuery()` 先计算目标分类相对位置，再调用该方法。
- `scrollDishTo(scrollTop, options)`：锁定模式下设置菜品列表的滚动位置（单位 px）。`options.force=true` 可强制重置即便偏差很小。

`options.immediate` 设为 `true` 时会立即应用目标，无需先重置滚动锚点。

## 核心机制

### 进入锁定
- 哨兵节点离开视口 → `IntersectionObserver` 触发
- 向下滚动时辅助检测（防止 Observer 不触发）

### 退出锁定
- 内层菜品列表向上滚动触顶 → `scrolltoupper` 触发
- 必须向上滚动，向下滚动不解锁
- 解锁后需要继续向上滑动一小段距离（默认 60px）才会重新允许进入锁定，避免来回抖动

### 锁定状态
- 外层 `scroll-y="false"` → 禁止整页滚动
- 内层 `scroll-y="true"` → 允许分类/菜品滚动
- 哨兵位置固定，无法通过哨兵解锁

## ⚠️ 重要注意事项（避坑指南）

### 1. 页面布局与高度计算
**前提条件**：组件要求页面使用以下布局结构：
```css
.page {
  height: 100vh;
  display: flex;
  flex-direction: column;
}

.container {
  flex: 1;              /* 占据剩余空间 */
  overflow: hidden;     /* 必须设置，防止内容溢出 */
}

.tabbar-container {
  height: 160rpx;       /* 固定高度（与组件 tabbar-height 属性一致）*/
  flex-shrink: 0;
  padding-bottom: env(safe-area-inset-bottom);  /* ✅ 在这里处理安全区 */
  box-sizing: border-box;
}
```

**高度计算原理**：
- 组件计算：选菜区域高度 = `windowHeight - tabbarHeight`
- 不额外减去安全区，因为安全区已通过 tabbar 的 `padding-bottom` 处理
- 这样选菜区域高度正好等于 `.container` 的实际高度

### 2. 微信小程序 scroll-view 滚动条
**问题**：只用 CSS `::-webkit-scrollbar { display: none }` 无法隐藏滚动条

**解决**：必须同时设置 `enhanced`、`show-scrollbar` 属性和 CSS
```xml
<scroll-view 
  show-scrollbar="{{false}}"
  enhanced="{{true}}"  <!-- ✅ 必须，否则 show-scrollbar 可能不生效 -->
>
```
```css
.scroll-view::-webkit-scrollbar {  /* ✅ 双重保险 */
  display: none;
}
```

### 2. scrolltoupper 事件触发时机
**问题**：向下滚动经过顶部时也会触发 `scrolltoupper` 事件

**解决**：必须判断滚动方向
```javascript
onDishScroll(e) {
  const scrollTop = e.detail.scrollTop;
  const lastScrollTop = this.currentDishScrollTop;
  // 记录滚动方向
  this.dishScrollDirection = scrollTop > lastScrollTop ? 'down' : 'up';
}

onDishScrollUpper(e) {
  // 只有向上滚动才解锁
  if (this.dishScrollDirection === 'up') {
    this.exitLockMode();
  }
}
```

### 3. IntersectionObserver 不触发的情况
**问题**：解锁后哨兵在视口外，再次向下滚动时 Observer 不触发（状态未变化）

**解决**：在 `onPageScroll` 中添加辅助检测
```javascript
onPageScroll(e) {
  const scrollTop = e.detail.scrollTop;
  const lastScrollTop = this.currentPageScrollTop;
  
  // 向下滚动时主动检查哨兵位置
  if (!this.data.isLocked && scrollTop > lastScrollTop) {
    this.checkShouldLock(); // 主动查询哨兵是否在视口外
  }
}
```

### 4. 调整哨兵位置导致布局重叠
**问题**：使用 `margin-top: -200rpx` 会影响文档流，导致后续元素向上移动重叠

**解决**：使用 `transform: translateY()` 不影响布局
```css
/* ❌ 错误 - 会导致重叠 */
.sentinel {
  margin-top: -200rpx;
}

/* ✅ 正确 - 不影响布局 */
.sentinel {
  transform: translateY(-200rpx);
}
```

### 5. 锁定后无法通过哨兵解锁
**关键认知**：
- 锁定后外层 `scroll-y="false"` → 禁止滚动
- 哨兵在外层 → 位置固定
- 用户只能滚动内层 → 哨兵永远在视口外
- **因此：必须通过内层触顶事件解锁，不能依赖哨兵**

## 调试技巧

### 1. 显示哨兵位置
```javascript
debugSentinel: true  // 显示红色虚线
```

### 2. 调整触发时机
1. 开启 `debug-sentinel`
2. 观察红线位置
3. 调整 `sentinel-offset` 值
4. 找到满意位置后关闭调试

**推荐值**：
- 提前触发：`-100` ~ `-200` rpx
- 默认：`0` rpx
- 延后触发：`50` ~ `100` rpx

### 3. 查看交互日志
- 组件内置大量 `console.log('[MenuScrollContainer] ...')` 调试输出
- 包含哨兵位置、锁定/解锁、触摸桥接等关键节点
- 方便在微信开发者工具里复现手势后回溯问题

## 技术实现

- **固定高度**：选菜区域固定高度（视口 - tabbar），安全区通过页面 tabbar 的 padding 处理
- **无 fixed 定位**：通过 `scroll-y` 切换，不改变布局
- **自然位置**：不设置 `scroll-top`，scroll-view 自然保持位置
- **双重检测**：IntersectionObserver + 主动查询
- **方向判断**：只有向上滚动触顶才解锁

## 版本历史

### v1.4.1 (2025-10-17)
- 🐛 修复高度计算问题：不再重复减去安全区高度
- 📝 明确页面布局要求：安全区应通过 tabbar 的 padding-bottom 处理
- 📚 更新文档，增加页面布局与高度计算说明

### v1.4.0 (2025-10-17)
- ✨ 初始版本发布

## 许可

MIT

# AI必须遵守的规则
修改内容后，不要创建新的文档，直接修改原有需求文档和技术文档、README文档补充新内容、修改旧内容即可

## 菜单滚动容器组件 (MenuScrollContainer)

### 设计理念
封装管理员和顾客页面的复杂滚动交互逻辑，通过插槽机制实现内容可插拔，关注点分离。

### 核心功能
1. **整页滚动与锁定模式**：自动检测并切换滚动模式
2. **独立滚动区域**：锁定后左侧分类、右侧菜品各自独立滚动
3. **智能解锁**：菜品列表向上滚动到顶部时自动解锁
4. **自适应高度**：自动计算视口高度 - tabbar 高度（安全区通过 tabbar padding 处理）
5. **可调试哨兵**：支持动态调整锁定触发位置，可视化调试

### 属性配置
| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `tabbar-height` | Number | 160 | 底部 tabbar 高度（rpx） |
| `sentinel-offset` | Number | 0 | 哨兵偏移量（rpx），负值=更早触发，正值=更晚触发 |
| `debug-sentinel` | Boolean | false | 调试模式，显示哨兵红线 |

### 技术实现
- **固定高度窗口**：选菜区域固定高度 = windowHeight - tabbarHeight（不额外减去安全区）
- **页面布局要求**：要求页面使用 `flex` 布局，tabbar 通过 `padding-bottom: env(safe-area-inset-bottom)` 处理安全区
- **不使用 fixed 定位**：通过控制 `scroll-y` 属性实现锁定，避免布局变化
- **位置自然保持**：不设置 `scroll-top`，让 scroll-view 自然保持滚动位置
- **哨兵节点锁定**：使用 `IntersectionObserver` 监听哨兵离开视口触发锁定，支持 `transform: translateY()` 动态调整触发位置
- **触顶解锁**：使用 `bindscrolltoupper` 事件监听菜品列表触顶，结合滚动方向判断（只有向上滚动才解锁）
- **辅助锁定检测**：在 `onPageScroll` 中使用 `createSelectorQuery` 主动查询哨兵位置，解决 Observer 不触发的边界情况
- **隐藏滚动条**：使用 `enhanced="true"` + `show-scrollbar="false"` + CSS `::-webkit-scrollbar`

### 关键代码结构
```wxml
<!-- 外层：非锁定时可滚动，锁定时禁用 -->
<scroll-view scroll-y="{{!isLocked}}" enhanced="{{true}}" show-scrollbar="{{false}}">
  <slot name="header"></slot>
  <!-- 哨兵：用于检测锁定触发点 -->
  <view class="sentinel" id="sentinel" style="{{sentinelStyle}}"></view>
  <!-- 选菜区域：固定高度窗口 -->
  <view class="menu-area" style="{{menuAreaStyle}}">
    <!-- 内层：锁定时可滚动 -->
    <scroll-view scroll-y="{{isLocked}}" enhanced="{{true}}" show-scrollbar="{{false}}">
      <slot name="categories"></slot>
    </scroll-view>
    <scroll-view 
      scroll-y="{{isLocked}}" 
      bindscrolltoupper="onDishScrollUpper"
      upper-threshold="50"
      enhanced="{{true}}" 
      show-scrollbar="{{false}}"
    >
      <slot name="dishes"></slot>
    </scroll-view>
  </view>
</scroll-view>
```

### 滚动行为
- **非锁定**：外层 `scroll-y="true"`，内层 `scroll-y="false"`，整页可滚动
- **锁定**：外层 `scroll-y="false"`，内层 `scroll-y="true"`，左右列表可滚动
- **位置保持**：切换时 scroll-view 自然保持 scrollTop，无需手动设置
- **滚动方向判断**：只有向上滚动触顶才解锁，向下滚动触顶不解锁
- **分类联动**：菜品滚动时根据视口底部仍可见的分类更新高亮，确保用户关注即将到达的分类并减少上方抖动

### 手势辅助锁定 / 解锁策略（2025-03 调整）
- **触摸捕获（Capture Phase）**  
  - 组件在根节点绑定 `capture-bind:touchstart/move/end`，先于业务层拿到手势轨迹。  
  - `touchstart` 时记录菜品 `scroll-view` 的实时 `scrollTop`，若已锁定且接近顶部（`<=60px`），直接触发 `exitLockMode('dish-offset')`，解决惯性停留 20~60px 无法解锁的问题。  
  - `touchmove` 根据首帧坐标与当前坐标计算 `deltaY`，当检测到用户继续向上滑动（`deltaY <= -10px`）且 `lockReady=false` 时重置解锁防抖；若此时外层滚动已达到锁定阈值，则立即调用 `enterLockMode('capture-intent')`，补充“解锁后立刻向上拖动”场景。  
  - `touchend` 清空手势状态，恢复下一轮判定。

- **滚动事件（Scroll Phase）**  
  - `onDishScroll` 维持原有方向判断，`scrollTop <= 20px` 或 `scrolltoupper` 触发时退出锁定。  
  - `onPageScroll` 按既有逻辑处理 `lockReady`，补充的手势逻辑只是在首帧加速锁定，不改变滚动触发条件。

### 边界 Case 与处理要点
| 场景 | 处理策略 |
| --- | --- |
| 惯性上滑停在 20~60px | `touchstart` 读取内层 `scrollTop`，贴顶即调用 `exitLockMode('dish-offset')` |
| 解锁后连续向上拖动 | 捕获阶段检测 `deltaY <= -10px`，重置防抖并在满足阈值时强制 `enterLockMode` |
| 解锁后轻触不拖动 | 无额外操作，保持整页自由滚动 |
| 触摸事件缺失或 `delta` 过小 | 继续依赖滚动事件触发，日志输出提示手势判定未生效 |

> 以上策略确保锁定/解锁完全与用户意图一致，同时保留原有哨兵+滚动双重判定，避免手势补充逻辑影响既有行为。

### 使用方式
```xml
<menu-scroll-container 
  tabbar-height="{{160}}"
  sentinel-offset="{{-150}}"
  debug-sentinel="{{false}}"
  bind:lockchange="onLockChange"
>
  <view slot="header"><!-- 顶部菜单信息 --></view>
  <view slot="categories"><!-- 左侧分类列表 --></view>
  <view slot="dishes"><!-- 右侧菜品列表 --></view>
</menu-scroll-container>
```

### 代码优势
- 代码量减少 50%（管理员页面从 1010 行减少到 428 行）
- 复杂度大幅降低，业务逻辑清晰
- 可复用于管理员和顾客页面
- 滚动交互丝滑无感知，无页面跳动

### 关键避坑指南
1. **页面布局要求**：页面必须使用 `height: 100vh` + `flex` 布局，tabbar 固定高度并用 `padding-bottom` 处理安全区
2. **scroll-view 隐藏滚动条**：必须同时设置 `enhanced="true"`、`show-scrollbar="false"` 和 CSS
3. **scrolltoupper 触发时机**：向下滚动经过顶部也会触发，必须判断滚动方向
4. **IntersectionObserver 不触发**：解锁后再次向下滚动时需要辅助检测机制
5. **哨兵位置调整**：使用 `transform: translateY()` 而不是 `margin-top`，避免影响布局
6. **锁定后无法通过哨兵解锁**：锁定后外层滚动禁用，哨兵位置固定，必须通过内层触顶解锁

### 版本历史
- **v1.4.1 (2025-10-17)**：修复高度计算问题，明确页面布局要求，添加 `enhanced` 属性
- **v1.4.0 (2025-10-17)**：初始版本，实现核心滚动锁定功能

文档位置：`components/menu-scroll-container/README.md`

# DIY菜单小程序技术方案

## 1. 技术栈与整体架构
- **小程序框架**：微信小程序原生框架，采用云开发（CloudBase）模式，默认支持云函数、数据库和存储。
- **语言与规范**：页面逻辑使用 JavaScript（可采用 ES6+），样式使用 WXSS，结构使用 WXML；公共逻辑模块化管理（`utils/`、`services/`）。
- **状态管理**：利用小程序 `App` 全局数据与自定义全局状态管理器（基于事件总线或轻量化 store）处理用户信息、角色、主题；局部页面使用 `Page` 数据与自定义 hooks（`behaviors`）。
- **云数据库**：使用 Tencent CloudBase 提供的 MongoDB 兼容数据库，集合按需求设计（见数据模型）。
- **云函数**：处理用户角色校验、菜单管理、订单提交、通知推送等服务端逻辑，保证权限与数据安全，减少前端直接写数据库的风险。
- **消息通知**：借助云函数触发订阅消息或站内消息集合，也可为后续引入云消息队列预留接口。

## 2. 系统模块划分
1. **用户与角色模块**：身份识别、角色授权、菜单列表、菜单内多身份切换。
2. **个人中心模块**：用户级菜谱管理、原材料管理，支持跨菜单复用。
3. **菜单管理模块（管理员端）**：菜单配置、分类管理、自定义选项、菜品维护、主题设置；提供所见即所得的菜单工作台，支持拖拽排序、快速上下架以及跳转详情页完成编辑或删除。
4. **顾客端菜单浏览模块**：分类列表、菜品详情、购物车、订单提交。
5. **订单模块**：顾客历史订单、再次下单；厨师订单工作台；管理员订单统计概览。
6. **通知模块**：触发、记录、推送订单相关消息。
7. **基础设施模块**：主题管理、权限拦截、错误处理、日志。

## 3. 页面与组件结构

### 3.1 页面布局架构

#### 3.1.1 标准页面布局模式
所有带有底部 tabbar 的页面（管理员、顾客、厨师）统一采用**上下分区布局**：

```
┌─────────────────────────────┐
│                             │
│      业务区域 (flex: 1)       │
│    可滚动内容区域              │
│                             │
├─────────────────────────────┤
│   TabBar 固定区域            │
│   (height: 160rpx + safe)   │
└─────────────────────────────┘
```

**核心实现原则：**
1. **页面容器**：设置 `height: 100vh` 和 `display: flex; flex-direction: column`
2. **业务区域**：设置 `flex: 1` 和 `overflow-y: auto`，确保内容可滚动但不影响 tabbar
3. **Tabbar 区域**：设置 `flex-shrink: 0` 和固定高度，始终固定在页面底部
4. **安全区适配**：tabbar 区域添加 `padding-bottom: env(safe-area-inset-bottom)` 适配 iPhone 底部安全区

**WXML 结构示例：**
```xml
<view class="page">
  <!-- 业务区域：可滚动 -->
  <view class="container">
    <!-- 页面内容 -->
  </view>
  
  <!-- 固定 tabbar 区域 -->
  <view class="tabbar-container">
    <custom-tab-bar active-key="xxx" bind:change="onTabChange"></custom-tab-bar>
  </view>
</view>
```

**WXSS 样式示例：**
```css
.page {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--page-bg);
}

.container {
  flex: 1;
  overflow-y: auto;
  padding: 24rpx 32rpx 0;
}

.tabbar-container {
  height: 160rpx;
  flex-shrink: 0;
  background-color: var(--page-bg);
  padding-bottom: env(safe-area-inset-bottom);
}
```

**优势：**
- ✅ Tabbar 永远固定在底部，不受业务内容滚动影响
- ✅ 业务区域独立滚动，性能更好
- ✅ 切换 tab 时，tabbar 保持稳定，用户体验一致
- ✅ 支持复杂的滚动交互（如菜单管理页的锁定滚动）
- ✅ 适配各种屏幕尺寸和安全区

#### 3.1.2 页面类型分类
- **带 Tabbar 页面**：管理员所有页面、顾客所有页面、厨师所有页面（采用上下分区布局）
- **独立页面**：详情页、编辑页、选择器页等（不需要 tabbar，使用常规布局）

### 3.2 具体页面列表

**用户与菜单选择**
- `pages/menu-selector/`：选择菜单、展示被授权菜单与角色入口，支持直接创建新菜单。用户信息卡片增加"个人中心"入口按钮。

**个人中心模块**
- `pages/user/profile/`：个人中心主页，采用底部tabbar，包含"我的菜谱"和"我的原材料"两个tab。
- `pages/user/recipes/`：我的菜谱列表，支持搜索、新建、编辑、删除。
- `pages/user/recipe-edit/`：菜谱编辑页，维护菜谱基本信息和原材料清单。
- `pages/user/recipe-detail/`：菜谱详情页（只读），展示菜谱完整信息。
- `pages/user/recipe-select/`：菜谱选择页，供菜品编辑时选择菜谱使用。
- `pages/user/ingredients/`：我的原材料列表，支持搜索、新建、编辑、删除。
- `pages/user/ingredient-edit/`：原材料编辑页，维护原材料信息。
- `pages/user/ingredient-select/`：原材料选择页，供菜谱编辑时添加原材料使用。

**管理员模块**
- `pages/admin/menu-settings/`：菜单基础信息配置（名称、描述、主图）、主题设置，并提供删除菜单操作。
- `pages/admin/menu-designer/`：菜单管理工作台，左侧分类、右侧菜品的所见即所得界面，支持拖拽排序、快捷上下架与跳转到编辑页；列表不再直接提供删除操作。菜品卡片展示"有菜谱"标识（如果关联了菜谱）。
- 菜单管理工作台在滚动交互上采用"锁定页 + 内部双列滚动"模式：滚动到选菜区域后，通过 IntersectionObserver 锁定整页，并开启左右 `scroll-view` 独立滚动；当任一列回到顶部继续上拉时，通过手势桥接解除锁定，让整页恢复滚动，确保切换平滑且无额外空白。
- `pages/admin/category-list/`：分类增删改排序（备选工具页）。
- `pages/admin/dish-list/`：菜品管理列表，支持排序调整（备选工具页）。
- `pages/admin/dish-edit/`：菜品编辑页，支持关联自定义选项（列表形式展示，点击整行或勾选框均可切换选中，前端会去重记录并在二次进入时恢复状态），并在编辑态提供与保存按钮并排的删除操作。新增"关联菜谱"区域，支持从菜谱导入、查看菜谱、更换菜谱。
- `pages/admin/option-library/`：菜单级自定义选项维护。

**顾客模块**
- `pages/customer/menu/`：顾客浏览菜单，展示分类、搜索筛选，顶部集成角色切换入口以便在同一菜单内切换身份；页面使用 `menu-scroll-container` 复用管理员端的“锁定页 + 双列滚动”交互，保持分类高亮与菜品列表的联动一致。
- `pages/customer/cart/`：购物车页。
- `pages/customer/order-confirm/`：确认订单，填写备注、桌号。
- `pages/customer/order-history/`：历史订单列表，支持再次下单。

**厨师模块**
- `pages/chef/order-list/`：厨师订单列表，状态筛选。
- `pages/chef/order-detail/`：订单详情与状态更新。

**通用组件/页面**
- `pages/common/order-detail/`：订单详情通用组件/页面。

**可复用组件**（`components/`）
- `role-switcher`：角色切换入口，支持在菜单页内切换多身份并同步页面能力范围。
- `admin-tabbar`（位于 `custom-tab-bar/`）：管理员端底部导航，作为普通组件嵌入各管理页面，通过抛出 `change` 事件由页面执行 `wx.redirectTo`，以摆脱微信原生 tabbar 的布局限制并便于自定义高度与样式。
- `category-card`、`dish-card`：分类与菜品展示。
- `option-selector`：自定义选项选择控件。
- `cart-bar`：底部购物车浮层。
- `order-status-tag`、`order-item`：订单状态展示。
- `notification-panel`：站内消息列表。
- `theme-picker`：主题选择。

## 4. 数据库设计（CloudBase 集合）
| 集合 | 关键字段 | 说明 |
| --- | --- | --- |
| `users` | `_id`, `wechatOpenId`, `nickname`, `avatar`, `createdAt` | 基础用户信息。 |
| `menu_roles` | `_id`, `menuId`, `userId`, `roles` (数组: admin/chef/customer), `grantedBy`, `createdAt` | 用户在某菜单的角色授权；可多角色。 |
| `menus` | `_id`, `name`, `description`, `coverImage`, `defaultCategoryId`, `theme`, `status`, `createdAt` | 菜单基础信息，`coverImage` 存储云文件ID或完整图片 URL。 |
| `categories` | `_id`, `menuId`, `name`, `sortOrder`, `createdAt`, `updatedAt` | 分类信息；`sortOrder` 用于自定义排序。 |
| `options` | `_id`, `menuId`, `name`, `choices`(数组: `{label, value, sortOrder}`), `defaultChoice`, `createdAt` | 菜单级自定义选项库。 |
| `dishes` | `_id`, `menuId`, `categoryId`, `name`, `description`, `image`, `price`, `status`, `tags`, `optionIds`(数组), `sortOrder`, `recipeId`, `createdAt`, `updatedAt` | 菜品数据，包含排序权重与可选项关联。新增 `recipeId`（可为空）用于关联用户菜谱。 |
| `recipes` | `_id`, `userId`, `name`, `coverImage`, `content`, `ingredients`(数组: `{ingredientId, name, quantity, unit, image}`), `createdAt`, `updatedAt` | 用户级菜谱数据；`ingredients` 为原材料快照数组。 |
| `ingredients` | `_id`, `userId`, `name`, `unit`, `image`, `remark`, `createdAt`, `updatedAt` | 用户级原材料数据。 |
| `carts` | `_id`, `menuId`, `userId`, `items`(数组: `{dishId, quantity, optionsSnapshot, priceSnapshot}`), `updatedAt` | 用户购物车；`optionsSnapshot` 为完整选项快照，格式：`{optionId: {name, choices: [{label, value, sortOrder}], selectedValue, selectedLabel}}`，确保历史数据完整可追溯。 |
| `orders` | `_id`, `menuId`, `userId`, `orderNo`, `status`, `totalPrice`, `items`(数组 `{dishId, name, optionsSnapshot, quantity, unitPrice}`), `remark`, `tableNo`, `historyRefId`, `createdAt`, `updatedAt`, `handledBy`, `handledRemark`, `lastOperatorId`, `lastOperatorAt` | 订单记录；`optionsSnapshot` 为完整选项快照，格式同上，`historyRefId` 供再次下单关联，`lastOperatorId` 和 `lastOperatorAt` 记录最近操作者信息。 |
| `user_notifications` | `_id`, `menuId`, `userId`, `type`, `payload`, `read`, `readAt`, `createdAt` | 用户级通知记录；每条通知记录对应一个具体用户，支持精确的权限控制和已读状态管理。 |
| `audit_logs` | `_id`, `menuId`, `actorId`, `action`, `payload`, `createdAt` | 关键操作审计，便于追踪。

> 云函数返回数据时会执行 `normalizeDoc`：若文档缺少 `id` 字段则补写为 `_id` 值，前端统一使用 `id` 访问实体；底层读写依旧以 `_id` 或显式业务索引为准，索引效果不受影响。

索引建议：
- `menu_roles`：`menuId + userId` 组合索引。
- `categories`、`dishes`：`menuId + sortOrder` 组合索引。
- `options`：`menuId + name` 组合索引。
- `recipes`：`userId + createdAt` 组合索引。
- `ingredients`：`userId + name` 组合索引。
- `orders`：`menuId + createdAt + status`、`menuId + userId + createdAt` 组合索引。
- `user_notifications`：`userId + menuId + read`、`userId + menuId + createdAt` 组合索引。

## 5. 云函数设计
| 云函数 | 功能 | 输入/输出 | 说明 |
| --- | --- | --- | --- |
| `login` | 获取 OpenID，初始化用户 | Input: 无；Output: `{openId, userProfile}` | 调用微信登录接口，创建 `users` 记录。 |
| `getMenuRoles` | 获取用户在各菜单的角色 | Input: `openId` | 返回角色列表，用于角色切换页和菜单内身份切换。 |
| `assignRole` | 管理员分配或回收角色 | Input: `menuId`, `targetUserId`, `roles` | 权限校验管理员身份。 |
| `createMenu` | 创建菜单及默认分类 | Input: 菜单信息 | 初始化菜单、默认分类、并为创建者授予管理员角色。 |
| `deleteMenu` | 删除菜单 | Input: `menuId` | 删除菜单及其分类、菜品、选项、角色、订单等关联数据。 |
| `upsertDish` | 新增/更新菜品 | Input: 菜品信息（含 `optionIds`） | 写入时会将 `optionIds` 统一转为字符串并去重，返回详情同样确保去重结果，保障前端勾选状态与后端一致。 |
| `categoryService` | 分类增删改查、排序更新 | Input: 操作类型与数据 | 内部校验管理员权限。 |
| `optionService` | 自定义选项增删改查 | Input: 操作类型与数据 | 维护选项与排序。 |
| `dishService` | 菜品增删改查、上下架、排序 | Input: 操作类型与数据 | 同步维护 `sortOrder`。 |
| `cartService` | 购物车增删改查 | Input: `menuId`, `items` | 确保数据一致性，生成下单所需快照。 |
| `orderService` | 提交订单、状态更新、历史查询 | Input: 操作类型、订单数据 | 下单校验、生成编号、写入订单、触发通知。 |
| `getNotifications` | 获取用户通知列表 | Input: `menuId`, `type`, `page`, `pageSize` | 只返回当前用户的通知，支持分页和类型筛选。 |
| `markNotificationRead` | 标记通知已读 | Input: `notificationId` | 用户只能标记自己的通知为已读。 |
| `markAllNotificationsRead` | 标记全部已读 | Input: `menuId` | 批量标记当前用户在指定菜单下的所有通知为已读。 |
| `getUnreadNotificationCount` | 获取未读数量 | Input: `menuId` | 返回当前用户在指定菜单下的未读通知数量，用于轮询。 |
| `themeService` | 菜单主题配置 | Input: `menuId`, `theme` | 更新菜单主题并返回新配置。 |
| `recipeService` | 菜谱增删改查 | Input: 操作类型、菜谱数据 | 用户级资源，校验 `userId`。支持 list、create、update、delete、get 操作。 |
| `ingredientService` | 原材料增删改查 | Input: 操作类型、原材料数据 | 用户级资源，校验 `userId`。支持 list、create、update、delete、get 操作。 |
| `getRecipeById` | 获取菜谱详情 | Input: `recipeId` | 返回菜谱完整信息，用于菜品详情页查看菜谱。 |
| `statsService`（预留） | 订单与菜品统计 | Input: 查询范围 | 为后续扩展提供数据接口。

云函数采用公共校验模块（`cloudfunctions/common/auth.js`）校验用户身份与菜单权限。菜谱和原材料相关云函数校验用户只能操作自己的资源。

## 6. 前端数据流与接口封装
- 在 `services/api.js` 封装调用 wx.cloud functions，统一错误处理与 loading 状态。
- 使用 `utils/auth.js` 管理登录态、OpenID、本地缓存的角色数据；必要数据放入 `App.globalData`。
- 菜单管理工作台（`pages/admin/menu-designer/`）在前端维护分类与菜品的本地排序列表，拖拽结束后调用 `sortCategories`/`sortDishes` 持久化 `sortOrder`，失败时回滚并提示。列表中的菜品卡片上下文仅提供"编辑"入口（取消快捷上下架），并以多行布局展示菜品名与价格。如果菜品关联了菜谱，显示"有菜谱"标识（仅管理员和厨师可见）。
- 滚动锁定实现依赖顶部哨兵节点 + `IntersectionObserver` 监控，锁定后页面高度通过实时测量（含自定义 tabbar 与安全区）计算，分类/菜品列使用 `scroll-view` 并基于手势桥接策略与整页切换滚动控制，保证锁定状态下铺满视窗且解锁无闪动。
- 在菜单页面加载时调用 `getMenuRoles` 刷新当前菜单可用角色，`role-switcher` 监听 `App.globalData.currentRole` 与 `currentMenuId`，切换身份时触发统一的 `onRoleChange` 回调以更新页面按钮、入口并保留分类位置、搜索条件、购物车数据。
- 前端提交表单前需校验所有业务上为数字类型的输入框（如价格、排序权重、原材料数量等），必须符合非负数/整数等约束才允许向后端发起请求；若校验失败，使用居中浮层提示框展示错误原因，可点击遮罩关闭，并在 2 秒后自动消失。
- 菜单、分类、菜品数据支持本地缓存与失效策略，避免频繁请求。
- 购物车使用本地缓存与云端同步结合，保证切换设备时数据一致。
- **菜谱系统**：
  - **个人中心页面数据管理**：
    - 使用自定义 `createPage` 工具，不支持 `computed` 属性
    - 必须手动维护 `filteredRecipes` 和 `filteredIngredients` 数据字段
    - 实现 `updateFilteredRecipes()` 和 `updateFilteredIngredients()` 方法处理过滤和格式化
    - 在 `onLoad` 和 `onShow` 生命周期都加载数据，确保返回时刷新
    - 一次性加载用户的所有菜谱和原材料，前端实现搜索过滤
  - **时间格式化**：
    - 实现 `formatRelativeTime` 函数，智能显示相对时间（"刚刚"、"X分钟前"、"X小时前"、"X天前"）
    - 超过7天显示完整日期时间格式
    - 在数据更新时统一格式化，生成 `createdAtText` 字段
  - **菜谱列表卡片**：
    - 采用上下布局（`flex-direction: column`），封面图占满宽度（100%），高度 320rpx
    - 使用 `overflow: hidden` 确保图片无缝贴边
    - 卡片整体可点击，不显示独立操作按钮
    - 所有编辑删除操作集中在详情页底部
  - **菜谱详情页权限控制**：
    - 页面加载时调用 `getCurrentUser()` 获取当前用户信息
    - 比对 `recipe.userId` 和 `currentUserId` 设置 `isOwner` 标志
    - 使用 `wx:if="{{isOwner}}"` 条件渲染编辑删除按钮
    - 只有菜谱创建者才能看到并执行编辑删除操作
  - **菜品关联菜谱**：
    - 菜品编辑页面支持从菜谱导入，自动填充菜品名称、描述、主图
    - 菜品详情页（管理员/厨师视图）显示"查看菜谱"按钮
    - 需校验 `recipeId` 是否存在且菜谱未被删除
  - **原材料聚合显示**：
    - 前端实现 `aggregateIngredients()` 方法按 `name` 字段分组
    - 相同名称的原材料合并为一项，保留所有数量+单位组合
    - 使用第一条记录的图片作为展示图片
    - 展示格式：原材料名称（带图片），下方列出所有"数量 单位"
  - **角色权限**：顾客角色访问菜品时，前端不渲染任何菜谱相关UI元素
- **通知系统**：前端通过 `getUnreadNotificationCount` 轮询获取未读通知数量，在 tabbar 上显示红点提示；通过 `getNotifications` 获取用户通知列表，支持分页加载；用户点击通知后调用 `markNotificationRead` 标记已读，支持 `markAllNotificationsRead` 批量标记已读。

## 7. 主题管理
- 在 `themes/` 目录维护多套主题配置（配色、字体、图标），可通过 `app.json` 扩展字段或自定义配置文件描述变量。
- 提供 `utils/theme.js` 或在全局状态管理中封装主题管理器，根据菜单默认主题或用户偏好切换主题并实时刷新页面样式。
- 用户选择主题后写入 `storage` 与云端（`menu_roles` 或用户偏好），首次加载应用默认读取菜单配置或用户习惯。

## 8. 权限与安全
- 所有写操作通过云函数执行，云函数内部校验 `menu_roles`。
- 管理员操作需校验是否包含 `admin` 角色；厨师操作订单状态需 `chef` 角色。
- 接口防止越权访问其他菜单数据。
- 审计日志记录关键操作（角色变更、菜品修改、订单状态更新）。
- 对订阅消息发送进行频率与授权校验。
- **菜谱权限**：
  - 菜谱创建、编辑、删除操作需校验 `recipe.userId === ctx.user.id`
  - 前端页面通过 `isOwner` 标志控制操作按钮显示
  - 云函数层面进行二次权限校验，防止前端绕过
  - 查看菜谱不需要权限（通过菜品关联），但只有创建者可以修改

## 9. 通知机制
- **用户级通知**：采用 `user_notifications` 集合，每条通知记录对应一个具体用户，实现精确的权限控制。
- **通知触发逻辑**：
  - 顾客下单时：只通知该菜单下的厨师
  - 厨师处理订单时：只通知订单创建者（顾客）
  - 管理员不接收任何通知，专注于菜单管理功能
- **站内通知**：前端轮询/拉取显示，页面内实时提示。
- **权限控制**：用户只能查看和操作自己的通知，确保数据安全和隐私保护。
- **提供统一 `NotificationManager`** 处理显示、已读状态、失败重试。

## 10. 并发与一致性策略
- 下单时云函数内事务（`db.runTransaction`）校验菜品上下架状态、获取菜品最新价格与选项，并保存快照。
- 购物车在提交订单前再次校验菜品状态，并给出提示（菜品下架或价格变更）。
- 分类、菜品排序更新使用递增的 `sortOrder`，前端拖拽后批量提交更新。

## 11. 日志与错误处理
- 前端：统一 `utils/logger.js` 上报错误与关键行为到云函数（写入 `audit_logs`）。
- 云函数：捕获异常并返回统一错误码（如 `ERR_NO_PERMISSION`, `ERR_INVALID_DATA`）。
- 用户提示典型错误：无权限、网络异常、数据已更新需刷新等。

## 12. 测试与发布
- **单元测试**：云函数使用 Jest（在本地/CI）编写逻辑测试。
- **接口测试**：利用云开发控制台或 Postman + 云函数 HTTP 接口（如开放）模拟。
- **前端测试**：通过微信开发者工具模拟不同角色流程，编写关键用例清单。
- **灰度发布**：利用环境分离（test/prod）与云函数版本管理逐步上线。

## 13. 迭代与扩展预留
- 支付接入：预留订单状态字段（如 `awaitingPayment`），便于后续集成微信支付。
- 数据分析：保留 `order`、`dishes` 累计字段，为后续统计界面提供数据来源。

## 14. 关键实现注意事项

### 14.1 createPage 工具限制
- 项目使用自定义 `utils/page.js` 中的 `createPage` 工具创建页面
- **重要**：该工具不支持小程序原生的 `computed` 属性
- 需要显式声明数据字段和更新方法：
  ```javascript
  data: {
    filteredRecipes: [], // 必须显式声明
  },
  methods: {
    updateFilteredRecipes() {
      // 手动实现过滤逻辑并调用 setData
      const filtered = this.data.recipes.filter(/* ... */);
      this.setData({ filteredRecipes: filtered });
    }
  }
  ```

### 14.2 页面生命周期数据刷新
- 使用 `wx.navigateTo` 跳转的页面，返回时不会触发 `onLoad`
- 需要在 `onShow` 中重新加载数据以确保数据最新
- 对于个人中心等需要实时更新的页面，同时实现 `onLoad` 和 `onShow`：
  ```javascript
  async onLoad() {
    await this.loadRecipes();
  },
  async onShow() {
    await this.loadRecipes(); // 返回时刷新数据
  }
  ```

### 14.3 数据过滤和格式化时机
- 数据加载后立即进行过滤和格式化
- 在 `setData` 的回调函数中调用更新方法，确保数据已设置：
  ```javascript
  this.setData({ recipes }, () => {
    this.updateFilteredRecipes();
  });
  ```
- 搜索框输入变化时也要调用更新方法

### 14.4 时间显示的用户体验优化
- 不直接显示时间戳，使用相对时间提升可读性
- 在数据过滤/格式化阶段统一处理：
  ```javascript
  const formatted = recipes.map(recipe => ({
    ...recipe,
    createdAtText: formatRelativeTime(recipe.createdAt)
  }));
  ```
- WXML 中绑定 `{{item.createdAtText}}` 而非 `{{item.createdAt}}`

### 14.5 条件渲染与权限控制
- 权限判断在页面加载时完成，设置标志位
- 使用 `wx:if` 而非 CSS 隐藏，避免元素出现在 DOM 中
- 示例：
  ```javascript
  // JS
  const isOwner = recipe.userId === currentUserId;
  this.setData({ isOwner });
  
  // WXML
  <view wx:if="{{isOwner}}" class="actions">
    <button bindtap="onEdit">编辑</button>
    <button bindtap="onDelete">删除</button>
  </view>
  ```

### 14.6 卡片布局无缝贴边技巧
- 图片要与卡片边缘无缝贴合，使用 `overflow: hidden`
- 图片设置 `width: 100%` 占满容器宽度
- 父容器使用 `flex-direction: column` 垂直布局
- 确保图片的 `mode` 属性设置为 `aspectFill` 保持比例填充

### 14.7 调试日志规范
- 关键数据操作加上 console.log，便于排查问题
- 日志格式：`[PageName] 操作描述: 数据`
- 示例：
  ```javascript
  console.log('[RecipeEdit] 准备保存菜谱:', payload);
  console.log('[RecipeEdit] 创建菜谱成功:', result);
  ```
- 生产环境可通过构建工具自动移除日志

### 14.8 数据聚合处理
- 复杂的数据聚合（如原材料按名称分组）在前端处理
- 使用对象作为中间结构，最后转换为数组：
  ```javascript
  aggregateIngredients(ingredients) {
    const grouped = {};
    ingredients.forEach(item => {
      if (!grouped[item.name]) {
        grouped[item.name] = { name: item.name, image: item.image, amounts: [] };
      }
      grouped[item.name].amounts.push({ quantity: item.quantity, unit: item.unit });
    });
    return Object.values(grouped);
  }
  ```
- 保持第一条记录的图片作为展示图片

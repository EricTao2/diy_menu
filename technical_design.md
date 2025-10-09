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
2. **菜单管理模块（管理员端）**：菜单配置、分类管理、自定义选项、菜品维护、主题设置；提供所见即所得的菜单工作台，支持拖拽排序、快速上下架以及跳转详情页完成编辑或删除。
3. **顾客端菜单浏览模块**：分类列表、菜品详情、购物车、订单提交。
4. **订单模块**：顾客历史订单、再次下单；厨师订单工作台；管理员订单统计概览。
5. **通知模块**：触发、记录、推送订单相关消息。
6. **基础设施模块**：主题管理、权限拦截、错误处理、日志。

## 3. 页面与组件结构
- `pages/menu-selector/`：选择菜单、展示被授权菜单与角色入口。
- `pages/menu-selector/`：选择菜单、展示被授权菜单与角色入口，支持直接创建新菜单。
- `pages/admin/menu-settings/`：菜单基础信息配置、主题设置，并提供删除菜单操作。
- `pages/admin/menu-designer/`：菜单管理工作台，左侧分类、右侧菜品的所见即所得界面，支持拖拽排序、快捷上下架与跳转到编辑页；列表不再直接提供删除操作。
- `pages/admin/category-list/`：分类增删改排序（备选工具页）。
- `pages/admin/dish-list/`：菜品管理列表，支持排序调整（备选工具页）。
- `pages/admin/dish-edit/`：菜品编辑页，支持关联自定义选项（列表形式展示，点击整行或勾选框均可切换选中，前端会去重记录并在二次进入时恢复状态），并在编辑态提供与保存按钮并排的删除操作。
- `pages/admin/option-library/`：菜单级自定义选项维护。
- `pages/customer/menu/`：顾客浏览菜单，展示分类、搜索筛选，顶部集成角色切换入口以便在同一菜单内切换身份。
- `pages/customer/cart/`：购物车页。
- `pages/customer/order-confirm/`：确认订单，填写备注、桌号。
- `pages/customer/order-history/`：历史订单列表，支持再次下单。
- `pages/chef/order-list/`：厨师订单列表，状态筛选。
- `pages/chef/order-detail/`：订单详情与状态更新。
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
| `menus` | `_id`, `name`, `description`, `defaultCategoryId`, `theme`, `status`, `createdAt` | 菜单基础信息。 |
| `categories` | `_id`, `menuId`, `name`, `sortOrder`, `createdAt`, `updatedAt` | 分类信息；`sortOrder` 用于自定义排序。 |
| `options` | `_id`, `menuId`, `name`, `choices`(数组: `{label, value, sortOrder}`), `defaultChoice`, `createdAt` | 菜单级自定义选项库。 |
| `dishes` | `_id`, `menuId`, `categoryId`, `name`, `description`, `image`, `price`, `status`, `tags`, `optionIds`(数组), `stock`, `sortOrder`, `createdAt`, `updatedAt` | 菜品数据，包含排序权重与可选项关联。 |
| `carts` | `_id`, `menuId`, `userId`, `items`(数组: `{dishId, quantity, optionsSnapshot, priceSnapshot}`), `updatedAt` | 用户购物车；选项和价格需存快照以防修改。 |
| `orders` | `_id`, `menuId`, `userId`, `orderNo`, `status`, `totalPrice`, `items`(数组 `{dishId, name, optionsSnapshot, quantity, unitPrice}`), `remark`, `tableNo`, `pickupType`, `historyRefId`, `createdAt`, `updatedAt`, `handledBy`, `handledRemark` | 订单记录；`historyRefId` 供再次下单关联。 |
| `notifications` | `_id`, `menuId`, `type`, `payload`, `recipients`, `status`, `createdAt`, `sentAt` | 通知记录；支持站内消息或订阅消息触发。 |
| `audit_logs` | `_id`, `menuId`, `actorId`, `action`, `payload`, `createdAt` | 关键操作审计，便于追踪。

索引建议：
- `menu_roles`：`menuId + userId` 组合索引。
- `categories`、`dishes`：`menuId`、`sortOrder` 索引。
- `orders`：`menuId + status`、`userId + createdAt` 索引。
- `notifications`：`recipients`, `status` 索引。

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
| `cartService` | 购物车增删改查 | Input: `menuId`, `items` | 确保数据一致性，校验库存。 |
| `orderService` | 提交订单、状态更新、历史查询 | Input: 操作类型、订单数据 | 下单校验、生成编号、写入订单、触发通知。 |
| `notificationService` | 发送和记录消息 | Input: `type`, `payload`, `recipients` | 与订单服务组合触发订阅消息。 |
| `themeService` | 菜单主题配置 | Input: `menuId`, `theme` | 更新菜单主题并返回新配置。 |
| `statsService`（预留） | 订单与菜品统计 | Input: 查询范围 | 为后续扩展提供数据接口。

云函数采用公共校验模块（`cloudfunctions/common/auth.js`）校验用户身份与菜单权限。

## 6. 前端数据流与接口封装
- 在 `services/api.js` 封装调用 wx.cloud functions，统一错误处理与 loading 状态。
- 使用 `utils/auth.js` 管理登录态、OpenID、本地缓存的角色数据；必要数据放入 `App.globalData`。
- 菜单管理工作台（`pages/admin/menu-designer/`）在前端维护分类与菜品的本地排序列表，拖拽结束后调用 `sortCategories`/`sortDishes` 持久化 `sortOrder`，失败时回滚并提示。列表中的菜品卡片上下文仅提供“编辑”入口（取消快捷上下架），并以多行布局展示菜品名与价格。
- 在菜单页面加载时调用 `getMenuRoles` 刷新当前菜单可用角色，`role-switcher` 监听 `App.globalData.currentRole` 与 `currentMenuId`，切换身份时触发统一的 `onRoleChange` 回调以更新页面按钮、入口并保留分类位置、搜索条件、购物车数据。
- 前端提交表单前需校验所有业务上为数字类型的输入框（如价格、库存、排序权重等），必须符合非负数/整数等约束才允许向后端发起请求；若校验失败，使用居中浮层提示框展示错误原因，可点击遮罩关闭，并在 2 秒后自动消失。
- 菜单、分类、菜品数据支持本地缓存与失效策略，避免频繁请求。
- 购物车使用本地缓存与云端同步结合，保证切换设备时数据一致。

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

## 9. 通知机制
- 订阅消息：订单提交后提示顾客授权订阅，云函数触发发送给厨师/管理员；订单状态发生变化时通知顾客。
- 站内通知：写入 `notifications` 集合，前端轮询/拉取显示；页面内实时提示。
- 提供统一 `NotificationManager` 处理显示、已读状态、失败重试。

## 10. 并发与一致性策略
- 下单时云函数内事务（`db.runTransaction`）校验菜品库存状态、获取菜品最新价格与选项，保存快照。
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

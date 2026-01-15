# 订阅管理器

基于Cloudflare Worker的私有订阅管理器，支持在线管理Clash、Singbox等代理订阅链接。

## 功能特性

- **私有主页**：需要认证的订阅管理界面
- **订阅管理**：添加、删除订阅链接，自定义ID
- **地区限制**：可选设置只允许特定国家访问订阅
- **公开订阅**：订阅链接如 `example.com/sub` 可公开访问

## 部署步骤

### 1. 创建Cloudflare Worker

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 进入 Workers & Pages
3. 创建新Worker

### 2. 设置KV存储

1. 在Workers页面，进入KV
2. 创建新命名空间，命名为 `SUB`
3. 记录命名空间ID

### 3. 配置Worker

1. 在Worker编辑器中，粘贴 `src/index.js` 的内容
2. 在Worker设置中，绑定KV命名空间：
   - 变量名：`SUB`
   - 命名空间：选择刚才创建的 `SUB`
3. 设置环境变量：
   - `AUTH_USER`：管理页面用户名
   - `AUTH_PASS`：管理页面密码

### 4. 配置路由

1. 在Cloudflare控制台，进入域名设置
2. 添加Worker路由：
   - 路由：`example.com/*`
   - Worker：选择刚才创建的Worker

### 5. 访问管理

- 主页：`https://example.com` （需要输入用户名密码）
- 订阅：`https://example.com/{id}` （公开访问，可设置地区限制）

## 使用说明

1. 访问主页，输入认证信息
2. 在表单中添加订阅：
   - ID：自定义标识，如 `sub`
   - 名称：订阅名称
   - 内容：粘贴YAML或JSON格式的订阅配置
   - 地区：可选，逗号分隔的国家代码，如 `CN,US`
3. 保存后，订阅链接为 `example.com/sub`
4. 可在列表中删除订阅

## 注意事项

- 订阅内容支持YAML和JSON格式，直接粘贴配置文本
- 地区限制基于Cloudflare的地理位置数据
- 订阅内容会被缓存1小时
- 输入数据会进行安全验证和清理，防止注入攻击
- 订阅ID只允许字母、数字、下划线和连字符
- 订阅名称会自动移除HTML标签

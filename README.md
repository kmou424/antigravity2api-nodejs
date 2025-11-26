# AntiGravity2OpenAI API 代理服务

> 本项目是在 [AntiGravity2API-NodeJS](https://github.com/liuw1535/antigravity2api-nodejs) 基础上的二次开发版本，因原项目暂不接受合并请求（PR），因此以独立分支形式进行，并对功能和性能作了多项优化与改进。

将 Google AntiGravity API 转换为 OpenAI 兼容格式的代理服务，支持流式响应、工具调用和多账号管理。

## Changes

- [x] [BUG] 使用符合 OpenAI 规范的响应结构，增强兼容性
- [x] [BUG] 修复向实际后端请求时始终使用流式请求的问题，现非流式请求将会直接命中非流式后端接口
- [x] [PERF] 移除了始终固定的系统提示词，根据 OpenAI 格式请求的连续 system 消息自动转换为 Gemini 格式请求的 system_instruction 参数 (Thanks to [hajimi](https://github.com/wyeeeee/hajimi/blob/0b68a2f4458ffe48004d523b87e5b254b1e45c10/app/services/gemini.py#L345))
- [x] [FEATURE] 增加了 Docker 支持

## TODO

- [ ] [REFACTOR] 迁移到 Bun 运行时
- [ ] [REFACTOR] 使用 TypeScript 重构（类型安全）

## 功能特性

- ✅ OpenAI API 兼容格式
- ✅ 流式和非流式响应
- ✅ 工具调用（Function Calling）支持
- ✅ 多账号自动轮换
- ✅ Token 自动刷新
- ✅ API Key 认证
- ✅ 思维链（Thinking）输出
- ✅ 图片输入支持（Base64 编码）

## 环境要求

- Node.js >= 18.0.0

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置文件

编辑 `config.json` 配置服务器和 API 参数：

```json
{
  "server": {
    "port": 8045,
    "host": "0.0.0.0"
  },
  "security": {
    "apiKey": "sk-text"
  }
}
```

### 3. 登录获取 Token

```bash
npm run login
```

浏览器会自动打开 Google 授权页面，授权后 Token 会保存到 `data/accounts.json`。

### 4. 启动服务

```bash
npm start
```

服务将在 `http://localhost:8045` 启动。

## API 使用

### 获取模型列表

```bash
curl http://localhost:8045/v1/models \
  -H "Authorization: Bearer sk-text"
```

### 聊天补全（流式）

```bash
curl http://localhost:8045/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-text" \
  -d '{
    "model": "gemini-2.0-flash-exp",
    "messages": [{"role": "user", "content": "你好"}],
    "stream": true
  }'
```

### 聊天补全（非流式）

```bash
curl http://localhost:8045/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-text" \
  -d '{
    "model": "gemini-2.0-flash-exp",
    "messages": [{"role": "user", "content": "你好"}],
    "stream": false
  }'
```

### 工具调用示例

```bash
curl http://localhost:8045/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-text" \
  -d '{
    "model": "gemini-2.0-flash-exp",
    "messages": [{"role": "user", "content": "北京天气怎么样"}],
    "tools": [{
      "type": "function",
      "function": {
        "name": "get_weather",
        "description": "获取天气信息",
        "parameters": {
          "type": "object",
          "properties": {
            "location": {"type": "string", "description": "城市名称"}
          }
        }
      }
    }]
  }'
```

### 图片输入示例

支持 Base64 编码的图片输入，兼容 OpenAI 的多模态格式：

```bash
curl http://localhost:8045/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-text" \
  -d '{
    "model": "gemini-2.0-flash-exp",
    "messages": [{
      "role": "user",
      "content": [
        {"type": "text", "text": "这张图片里有什么？"},
        {
          "type": "image_url",
          "image_url": {
            "url": "data:image/jpeg;base64,/9j/4AAQSkZJRg..."
          }
        }
      ]
    }],
    "stream": true
  }'
```

支持的图片格式：
- JPEG/JPG (`data:image/jpeg;base64,...`)
- PNG (`data:image/png;base64,...`)
- GIF (`data:image/gif;base64,...`)
- WebP (`data:image/webp;base64,...`)

## 多账号管理

`data/accounts.json` 支持多个账号，服务会自动轮换使用：

```json
[
  {
    "access_token": "ya29.xxx",
    "refresh_token": "1//xxx",
    "expires_in": 3599,
    "timestamp": 1234567890000,
    "enable": true
  },
  {
    "access_token": "ya29.yyy",
    "refresh_token": "1//yyy",
    "expires_in": 3599,
    "timestamp": 1234567890000,
    "enable": true
  }
]
```

- `enable: false` 可禁用某个账号
- Token 过期会自动刷新
- 刷新失败（403）会自动禁用并切换下一个账号

## 配置说明

### config.json

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `server.port` | 服务端口 | 8045 |
| `server.host` | 监听地址 | 0.0.0.0 |
| `security.apiKey` | API 认证密钥 | sk-text |
| `security.maxRequestSize` | 最大请求体大小 | 50mb |
| `defaults.temperature` | 默认温度参数 | 1 |
| `defaults.top_p` | 默认 top_p | 0.85 |
| `defaults.top_k` | 默认 top_k | 50 |
| `defaults.max_tokens` | 默认最大 token 数 | 8096 |
| `systemInstruction` | 系统提示词 | - |

## 开发命令

```bash
# 启动服务
npm start

# 开发模式（自动重启）
npm run dev

# 登录获取 Token
npm run login
```

## 项目结构

```
.
├── data/
│   └── accounts.json       # Token 存储（自动生成）
├── scripts/
│   └── oauth-server.js     # OAuth 登录服务
├── src/
│   ├── api/
│   │   └── client.js       # API 调用逻辑
│   ├── auth/
│   │   └── token_manager.js # Token 管理
│   ├── config/
│   │   └── config.js       # 配置加载
│   ├── server/
│   │   └── index.js        # 主服务器
│   └── utils/
│       ├── logger.js       # 日志模块
│       └── utils.js        # 工具函数
├── config.json             # 配置文件
└── package.json            # 项目配置
```

## 注意事项

1. 首次使用需要运行 `npm run login` 获取 Token
2. `data/accounts.json` 包含敏感信息，请勿泄露
3. API Key 可在 `config.json` 中自定义
4. 支持多账号轮换，提高可用性
5. Token 会自动刷新，无需手动维护

## License

本项目采用 [CC BY-NC-SA 4.0](LICENSE) 协议，仅供学习使用，禁止商用。

知识共享 署名-非商业性使用-相同方式共享 4.0 国际许可协议  
Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International

**原作品版权所有 © 2025 [liuw1535]**  
**本修改版本版权所有 © 2025 [kmou424]**

本作品基于 [liuw1535](https://github.com/liuw1535/antigravity2api-nodejs) 的原作品进行修改和二次开发。

完整协议文本请访问：[LICENSE](LICENSE)

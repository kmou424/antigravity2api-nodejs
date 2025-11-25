import tokenManager from '../auth/token_manager.js';
import config from '../config/config.js';
import { generateToolCallId } from '../utils/idGenerator.js';

/**
 * 将 Gemini finishReason 转换为 OpenAI finish_reason
 * OpenAI finish_reason 可能的值：
 * - stop: 正常停止
 * - length: 达到 max_tokens 限制
 * - tool_calls: 需要调用工具
 * - content_filter: 内容被过滤
 * - function_call: 已废弃，使用 tool_calls
 */
function convertFinishReason(geminiFinishReason) {
  const mapping = {
    'STOP': 'stop',
    'MAX_TOKENS': 'length',
    'SAFETY': 'content_filter',
    'RECITATION': 'content_filter',
    'OTHER': 'stop',
    'FINISH_REASON_UNSPECIFIED': 'stop'
  };
  return mapping[geminiFinishReason] || 'stop';
}

/**
 * 估算 token 数量（简单估算：中文约 1.5 字符/token，英文约 4 字符/token）
 */
function estimateTokens(text) {
  if (!text) return 0;
  // 简单估算：混合中英文
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const otherChars = text.length - chineseChars;
  return Math.ceil(chineseChars / 1.5 + otherChars / 4);
}

export async function generateAssistantResponse(requestBody, callback) {
  const token = await tokenManager.getToken();
  
  if (!token) {
    throw new Error('没有可用的token，请运行 npm run login 获取token');
  }
  
  const url = config.api.url;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Host': config.api.host,
      'User-Agent': config.api.userAgent,
      'Authorization': `Bearer ${token.access_token}`,
      'Content-Type': 'application/json',
      'Accept-Encoding': 'gzip'
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorText = await response.text();
    if (response.status === 403) {
      tokenManager.disableCurrentToken(token);
      throw new Error(`该账号没有使用权限，已自动禁用。错误详情: ${errorText}`);
    }
    throw new Error(`API请求失败 (${response.status}): ${errorText}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let thinkingStarted = false;
  let toolCalls = [];
  let finishReason = null;
  let promptTokens = 0;
  let completionTokens = 0;
  let fullContent = '';

  // 估算 prompt tokens（基于请求体）
  try {
    const requestText = JSON.stringify(requestBody);
    promptTokens = estimateTokens(requestText);
  } catch (e) {
    // 忽略错误
  }

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    const chunk = decoder.decode(value);
    const lines = chunk.split('\n').filter(line => line.startsWith('data: '));
    
    for (const line of lines) {
      const jsonStr = line.slice(6);
      try {
        const data = JSON.parse(jsonStr);
        const candidate = data.response?.candidates?.[0];
        const parts = candidate?.content?.parts;
        
        // 提取 finishReason
        if (candidate?.finishReason && !finishReason) {
          finishReason = convertFinishReason(candidate.finishReason);
        }
        
        // 提取 token 使用信息（如果可用）
        if (data.response?.usageMetadata) {
          if (data.response.usageMetadata.promptTokenCount) {
            promptTokens = data.response.usageMetadata.promptTokenCount;
          }
          if (data.response.usageMetadata.candidatesTokenCount) {
            completionTokens = data.response.usageMetadata.candidatesTokenCount;
          }
        }
        
        if (parts) {
          for (const part of parts) {
            if (part.thought === true) {
              if (!thinkingStarted) {
                callback({ type: 'thinking', content: '<think>\n' });
                thinkingStarted = true;
              }
              callback({ type: 'thinking', content: part.text || '' });
            } else if (part.text !== undefined) {
              if (thinkingStarted) {
                callback({ type: 'thinking', content: '\n</think>\n' });
                thinkingStarted = false;
              }
              fullContent += part.text;
              callback({ type: 'text', content: part.text });
            } else if (part.functionCall) {
              toolCalls.push({
                id: part.functionCall.id || generateToolCallId(),
                type: 'function',
                function: {
                  name: part.functionCall.name,
                  arguments: JSON.stringify(part.functionCall.args)
                }
              });
            }
          }
        }
        
        // 当遇到 finishReason 时，发送所有收集的工具调用
        if (candidate?.finishReason && toolCalls.length > 0) {
          if (thinkingStarted) {
            callback({ type: 'thinking', content: '\n</think>\n' });
            thinkingStarted = false;
          }
          callback({ type: 'tool_calls', tool_calls: toolCalls });
          toolCalls = [];
        }
      } catch (e) {
        // 忽略解析错误
      }
    }
  }

  // 如果没有从响应中获取到 finishReason，使用默认值
  if (!finishReason) {
    finishReason = toolCalls.length > 0 ? 'tool_calls' : 'stop';
  }

  // 如果没有从响应中获取到 completion tokens，进行估算
  if (completionTokens === 0 && fullContent) {
    completionTokens = estimateTokens(fullContent);
  }

  // 返回元数据
  return {
    finish_reason: finishReason,
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens
    }
  };
}

export async function getAvailableModels() {
  const token = await tokenManager.getToken();
  
  if (!token) {
    throw new Error('没有可用的token，请运行 npm run login 获取token');
  }
  
  const response = await fetch(config.api.modelsUrl, {
    method: 'POST',
    headers: {
      'Host': config.api.host,
      'User-Agent': config.api.userAgent,
      'Authorization': `Bearer ${token.access_token}`,
      'Content-Type': 'application/json',
      'Accept-Encoding': 'gzip'
    },
    body: JSON.stringify({})
  });

  const data = await response.json();
  
  return {
    object: 'list',
    data: Object.keys(data.models).map(id => ({
      id,
      object: 'model',
      created: Math.floor(Date.now() / 1000),
      owned_by: 'google'
    }))
  };
}

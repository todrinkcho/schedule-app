// Cloudflare Workers - 日程助手后端API
// 使用 KV 存储 + REST API 调用 AI

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

// Cloudflare AI API 配置
const AI_API_URL = 'https://api.cloudflare.com/client/v4/accounts/8e7e3f8c8f8f8f8f8f8f8f8f8f8f8f8f/ai/run/@cf/meta/llama-3.1-8b-instruct';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS 预检
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // API 端点 - 日程存储
    if (url.pathname === '/api') {
      if (request.method === 'GET') {
        try {
          const data = await env.SCHEDULE_KV.get('schedules', 'json');
          return new Response(JSON.stringify(data || []), {
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        } catch (e) {
          return new Response(JSON.stringify([]), {
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }
      }

      if (request.method === 'POST') {
        try {
          const body = await request.json();
          await env.SCHEDULE_KV.put('schedules', JSON.stringify(body.schedules || []));
          return new Response(JSON.stringify({ success: true }), {
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        } catch (e) {
          return new Response(JSON.stringify({ error: e.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }
      }
    }

    // AI 解析时间端点 - 简化版，使用本地逻辑
    if (url.pathname === '/api/parse') {
      if (request.method === 'POST') {
        try {
          const { text } = await request.json();
          const now = new Date();
          
          // 本地智能解析
          const result = parseTimeSmart(text, now);
          
          return new Response(JSON.stringify(result), {
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        } catch (e) {
          return new Response(JSON.stringify({ error: e.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }
      }
    }

    // 根路径
    if (url.pathname === '/') {
      return new Response('日程助手 API\n\n端点：\n- GET  /api\n- POST /api\n- POST /api/parse', {
        headers: { 'Content-Type': 'text/plain; charset=utf-8', ...corsHeaders }
      });
    }

    return new Response('Not Found', { status: 404 });
  }
};

// 智能时间解析函数
function parseTimeSmart(text, now) {
  const year = now.getFullYear();
  const month = now.getMonth();
  const day = now.getDate();
  const hour = now.getHours();
  
  // 清理文本
  let cleanText = text.replace(/\s+/g, ' ');
  
  // 汉字数字映射（先长后短避免冲突）
  const cnNum = {
    '零': '0', '一': '1', '二': '2', '两': '2', '三': '3', '四': '4',
    '五': '5', '六': '6', '七': '7', '八': '8', '九': '9',
    '十一': '11', '十二': '12',
    '十': '10'
  };
  
  // 先转换多位数，再转换单位数
  const sorted = Object.entries(cnNum).sort((a, b) => b[0].length - a[0].length);
  for (const [cn, num] of sorted) {
    cleanText = cleanText.replace(new RegExp(cn, 'g'), num);
  }
  
  // 提取事件
  let event = cleanText
    .replace(/\d+\s*分钟?\s*后/g, '')
    .replace(/\d+\s*小时?\s*后/g, '')
    .replace(/\d+\s*天\s*后/g, '')
    .replace(/明\s*天/g, '').replace(/今\s*[天日]/g, '').replace(/后\s*天/g, '')
    .replace(/大\s*后\s*天/g, '').replace(/\d+\s*天\s*后/g, '')
    .replace(/上\s*午|下\s*午|早\s*上|晚\s*上|中\s*午|傍\s*晚/g, '')
    .replace(/\d{1,2}\s*点\s*\d{0,2}\s*分?/g, '')
    .replace(/[,，。！!?:：]+/g, ' ')
    .replace(/提醒|记得|记着|别忘了|叫|让/g, '')
    .replace(/\s+/g, ' ').trim();
  
  if (event.length < 2) event = '日程';
  
  // 时间解析
  let targetDate = null;
  let method = '';
  
  // X分钟后
  let match = cleanText.match(/(\d+)\s*分钟?\s*后/);
  if (match) {
    targetDate = new Date(now.getTime() + parseInt(match[1]) * 60000);
    method = `${match[1]}分钟后`;
  }
  
  // X小时后
  else if ((match = cleanText.match(/(\d+)\s*小时?\s*后/))) {
    targetDate = new Date(now.getTime() + parseInt(match[1]) * 3600000);
    method = `${match[1]}小时后`;
  }
  
  // X天后
  else if ((match = cleanText.match(/(\d+)\s*天\s*后/))) {
    targetDate = new Date(year, month, day + parseInt(match[1]), 12, 0);
    method = `${match[1]}天后中午`;
  }
  
  // 大后天
  else if (/大\s*后\s*天/.test(cleanText)) {
    let h = 12, m = 0;
    match = cleanText.match(/(\d{1,2})\s*点(\d{0,2})?/);
    if (match) { h = parseInt(match[1]); m = match[2] ? parseInt(match[2]) : 0; }
    if (/下午|晚上/.test(cleanText) && h < 12) h += 12;
    targetDate = new Date(year, month, day + 3, h, m);
    method = `大后天${h}点${m || ''}`;
  }
  
  // 后天
  else if (/后\s*天/.test(cleanText)) {
    let h = 12, m = 0;
    match = cleanText.match(/(\d{1,2})\s*点(\d{0,2})?/);
    if (match) { h = parseInt(match[1]); m = match[2] ? parseInt(match[2]) : 0; }
    if (/下午|晚上/.test(cleanText) && h < 12) h += 12;
    targetDate = new Date(year, month, day + 2, h, m);
    method = `后天${h}点${m || ''}`;
  }
  
  // 明天
  else if (/明\s*天/.test(cleanText)) {
    let h = 12, m = 0;
    match = cleanText.match(/(\d{1,2})\s*点(\d{0,2})?/);
    if (match) { h = parseInt(match[1]); m = match[2] ? parseInt(match[2]) : 0; }
    if (/下午|晚上/.test(cleanText) && h < 12) h += 12;
    targetDate = new Date(year, month, day + 1, h, m);
    method = `明天${h}点${m || ''}`;
  }
  
  // 今天/直接时间
  else {
    let h = 12, m = 0;
    match = cleanText.match(/(\d{1,2})\s*点(\d{0,2})?/);
    if (match) { 
      h = parseInt(match[1]); 
      m = match[2] ? parseInt(match[2]) : 0;
    }
    if (/下午|晚上/.test(cleanText) && h < 12) h += 12;
    targetDate = new Date(year, month, day, h, m);
    if (targetDate <= now) targetDate = new Date(year, month, day + 1, h, m);
    method = `今天${h}点${m || ''}`;
  }
  
  return {
    event: event,
    date: targetDate.toISOString().split('T')[0],
    hour: targetDate.getHours(),
    minute: targetDate.getMinutes(),
    time: targetDate.toISOString().slice(0, 16),
    method: method,
    source: 'smart'
  };
}

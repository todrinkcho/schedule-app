// Cloudflare Workers - 日程助手后端API
// 使用 KV 存储 + AI 时间解析

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS 预检
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // API 端点 - 日程存储
    if (url.pathname === '/api') {
      // GET: 获取所有日程
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

      // POST: 保存日程
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

    // AI 解析时间端点
    if (url.pathname === '/api/parse') {
      if (request.method === 'POST') {
        try {
          const { text } = await request.json();

          // 获取当前时间用于相对时间计算
          const now = new Date();
          const currentTime = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 ${now.getHours()}点${now.getMinutes()}分`;

          const prompt = `你是时间解析专家。用户输入日程描述，你需要提取事件和时间。

当前时间：${currentTime}

规则：
- 如果只说时间点（如"3点"），默认指今天，如果已过则指明天
- "明天" = 今天+1天，"后天" = 今天+2天
- "五天后" = 今天+5天
- 上午=0-11点，下午=12-23点，晚上=18-23点
- 提取事件内容，去掉时间相关的词语

请严格按以下JSON格式返回，不要添加任何解释：
{"event":"事件内容","date":"YYYY-MM-DD","hour":小时数字,"minute":分钟数字,"time":"YYYY-MM-DD HH:MM","method":"解析方法描述"}

示例：
输入："明天下午3点开会"
输出：{"event":"开会","date":"${new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString().split('T')[0]}","hour":15,"minute":0,"time":"${new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 15, 0).toISOString().slice(0, 16)}","method":"明天下午3点"}

输入："五天后交作业"
输出：{"event":"交作业","date":"${new Date(now.getFullYear(), now.getMonth(), now.getDate() + 5).toISOString().split('T')[0]}","hour":12,"minute":0,"time":"${new Date(now.getFullYear(), now.getMonth(), now.getDate() + 5, 12, 0).toISOString().slice(0, 16)}","method":"5天后中午12点"}

输入："${text}"
输出：`;

// 使用 Cloudflare AI 解析
          const ai = new Env(env).ai;
          const answer = await ai.run('@cf/meta/llama-3.1-8b-instruct', {
            messages: [
              { role: 'system', content: '你是一个精确的时间解析助手，只返回JSON格式的结果。' },
              { role: 'user', content: prompt }
            ],
            max_tokens: 200
          });

          // 解析 AI 返回的 JSON
          let result;
          try {
            const jsonMatch = answer.response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              result = JSON.parse(jsonMatch[0]);
            } else {
              throw new Error('无法解析AI返回');
            }
          } catch (e) {
            // AI 解析失败，使用备用方案
            result = {
              event: text.replace(/\d+[点分秒天年月日]/g, '').trim() || '日程',
              date: now.toISOString().split('T')[0],
              hour: 12,
              minute: 0,
              time: `${now.toISOString().split('T')[0]}T12:00`,
              method: '默认中午12点'
            };
          }

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

    // 根路径返回说明
    if (url.pathname === '/') {
      return new Response(`日程助手 API

可用端点：
- GET  /api      - 获取所有日程
- POST /api      - 保存日程 {schedules: [...]}
- POST /api/parse - AI 解析时间 {text: "..."}`, {
        headers: { 'Content-Type': 'text/plain; charset=utf-8', ...corsHeaders }
      });
    }

    // 其他路径返回 404
    return new Response('Not Found', { status: 404 });
  }
};

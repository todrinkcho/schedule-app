// Cloudflare Workers - 日程助手后端API
// 使用 KV 存储实现持久化

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    // API 端点
    if (url.pathname === '/api') {
      // 处理 CORS 预检
      if (request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
      }
      
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
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }
    }
    
    // 其他路径返回 404
    return new Response('Not Found', { status: 404 });
  }
};

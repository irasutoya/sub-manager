addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  const url = new URL(request.url)
  const path = url.pathname

  if (path === '/') {
    return request.method === 'POST' ? handlePost(request) : handleHome(request)
  }

  if (path === '/robots.txt') {
    return handleRobots()
  }

  const id = path.slice(1)
  return id ? handleSub(request, id) : new Response('Not Found', {status: 404})
}

async function handleHome(request) {
  if (!checkAuth(request)) return unauthorized()

  const subs = await getSubs()
  const html = generateHomeHTML(subs)
  return new Response(html, {headers: {'Content-Type': 'text/html; charset=utf-8'}})
}

async function handlePost(request) {
  if (!checkAuth(request)) return unauthorized()

  try {
    const body = await request.json()
    const sanitized = sanitizeInput(body)

    switch (body.action) {
      case 'add':
        return await addSubscription(sanitized)
      case 'edit':
        return await editSubscription(sanitized)
      case 'delete':
        return await deleteSubscription(sanitized.id)
      default:
        return new Response('Invalid action', {status: 400})
    }
  } catch (error) {
    return new Response('Invalid JSON', {status: 400})
  }
}

async function handleSub(request, id) {
  try {
    const sub = await SUB.get(id)
    if (!sub) return new Response('Not Found', {status: 404})

    const data = JSON.parse(sub)
    if (data.regions?.length && !data.regions.includes(request.cf.country)) {
      return new Response('Access Denied', {status: 403})
    }

    return new Response(data.content, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'public, max-age=3600'
      }
    })
  } catch (error) {
    return new Response('Server Error', {status: 500})
  }
}

function checkAuth(request) {
  const auth = request.headers.get('Authorization')
  return auth === `Basic ${btoa(`${AUTH_USER}:${AUTH_PASS}`)}`
}

function unauthorized() {
  return new Response('Unauthorized', {
    status: 401,
    headers: {'WWW-Authenticate': 'Basic realm="Sub Manager"'}
  })
}

async function addSubscription({id, name, content, regions}) {
  if (!id || !name || !content) return new Response('Missing required fields', {status: 400})
  if (await SUB.get(id)) return new Response('ID already exists', {status: 409})

  await SUB.put(id, JSON.stringify({name, content, regions, created: Date.now()}))
  return new Response('OK')
}

async function editSubscription({id, name, content, regions}) {
  if (!id || !name || !content) return new Response('Missing required fields', {status: 400})

  const existing = await SUB.get(id)
  if (!existing) return new Response('Subscription not found', {status: 404})

  const existingData = JSON.parse(existing)
  await SUB.put(id, JSON.stringify({...existingData, name, content, regions, updated: Date.now()}))
  return new Response('OK')
}

async function deleteSubscription(id) {
  if (!id) return new Response('Invalid ID', {status: 400})
  await SUB.delete(id)
  return new Response('OK')
}

function sanitizeInput(body) {
  const sanitized = {}

  if (body.action) sanitized.action = body.action.toString().trim()
  if (body.id) sanitized.id = body.id.toString().trim().replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 50)
  if (body.name) sanitized.name = body.name.toString().trim().replace(/<[^>]*>/g, '').substring(0, 100)
  if (body.content) sanitized.content = body.content.toString()

  if (body.regions) {
    const regions = Array.isArray(body.regions) ? body.regions : body.regions.split(',')
    sanitized.regions = regions
      .map(r => r.toString().trim().toUpperCase().replace(/[^A-Z]/g, ''))
      .filter(r => r.length === 2)
      .slice(0, 10)
  }

  return sanitized
}

async function getSubs() {
  const keys = await SUB.list()
  return Promise.all(keys.keys.map(async ({name}) => {
    const value = await SUB.get(name)
    return {id: name, ...JSON.parse(value)}
  }))
}

function handleRobots() {
  return new Response('User-agent: *\nDisallow: /', {
    headers: {'Content-Type': 'text/plain; charset=utf-8'}
  })
}

function generateHomeHTML(subs) {
  const list = subs.map(sub => {
    const regionsStr = sub.regions?.join(', ') || '无限制'
    const encodedContent = encodeURIComponent(sub.content)
    const encodedName = encodeURIComponent(sub.name)
    return `<li class="sub-item" onclick="editSub('${sub.id}', '${encodedName}', '${encodedContent}', '${regionsStr}')">
      <div class="sub-info">
        <strong>${sub.name}</strong><br>
        <small>ID: ${sub.id} | 地区: ${regionsStr}</small>
      </div>
    </li>`
  }).join('')

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>订阅管理器</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      margin: 0;
      padding: 0;
      background: #f5f5f5;
      color: #333;
      height: 100vh;
      overflow: hidden;
    }
    .app {
      display: flex;
      height: 100vh;
    }
    .sidebar {
      width: 300px;
      background: white;
      border-right: 1px solid #e0e0e0;
      display: flex;
      flex-direction: column;
    }
    .sidebar-header {
      padding: 20px;
      border-bottom: 1px solid #e0e0e0;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .sidebar-header h2 {
      margin: 0;
      font-size: 18px;
      font-weight: 600;
    }
    .add-btn {
      background: #007bff;
      color: white;
      border: none;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      cursor: pointer;
      font-size: 18px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.3s ease;
    }
    .add-btn:hover {
      background: #0056b3;
    }
    .sub-list {
      flex: 1;
      overflow-y: auto;
      list-style: none;
      padding: 0;
      margin: 0;
    }
    .sub-item {
      padding: 15px 20px;
      border-bottom: 1px solid #f0f0f0;
      cursor: pointer;
      transition: background 0.2s ease;
    }
    .sub-item:hover {
      background: #f8f9f8;
    }
    .sub-item.active {
      background: #e3f2fd;
      border-left: 3px solid #007bff;
    }
    .sub-info {
      font-size: 14px;
    }
    .sub-info strong {
      display: block;
      margin-bottom: 4px;
      color: #333;
    }
    .sub-info small {
      color: #666;
    }
    .main {
      flex: 1;
      display: flex;
      flex-direction: column;
      background: white;
    }
    .editor-header {
      padding: 20px;
      border-bottom: 1px solid #e0e0e0;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .editor-title {
      margin: 0;
      font-size: 18px;
      font-weight: 600;
    }
    .editor-actions {
      display: flex;
      gap: 10px;
    }
    .btn {
      padding: 12px 20px;
      border: none;
      border-radius: 12px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
      transition: all 0.3s ease;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .btn:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 8px rgba(0,0,0,0.15);
    }
    .btn-primary {
      background: #007bff;
      color: white;
    }
    .btn-primary:hover {
      background: #0056b3;
    }
    .btn-danger {
      background: #dc3545;
      color: white;
    }
    .btn-danger:hover {
      background: #c82333;
    }
    .btn-secondary {
      background: #6c757d;
      color: white;
    }
    .btn-secondary:hover {
      background: #545b62;
    }
    .editor-content {
      flex: 1;
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    .form-row {
      display: flex;
      gap: 20px;
    }
    .form-group {
      flex: 1;
    }
    .form-group-full {
      width: 100%;
    }
    label {
      display: block;
      margin-bottom: 5px;
      font-weight: 500;
      color: #555;
      font-size: 14px;
    }
    input[type="text"] {
      width: 100%;
      padding: 12px 16px;
      border: 2px solid #e1e8ed;
      border-radius: 12px;
      font-size: 14px;
      transition: border-color 0.3s ease;
    }
    input[type="text"]:focus {
      outline: none;
      border-color: #007bff;
      box-shadow: 0 0 0 3px rgba(0, 123, 255, 0.1);
    }
    textarea {
      width: 100%;
      height: 400px;
      padding: 12px 16px;
      border: 2px solid #e1e8ed;
      border-radius: 12px;
      font-family: 'Courier New', monospace;
      font-size: 13px;
      resize: vertical;
      transition: border-color 0.3s ease;
    }
    textarea:focus {
      outline: none;
      border-color: #007bff;
      box-shadow: 0 0 0 3px rgba(0, 123, 255, 0.1);
    }
    .message {
      padding: 10px;
      border-radius: 4px;
      margin-top: 10px;
      display: none;
    }
    .message.success {
      background: #d4edda;
      color: #155724;
      border: 1px solid #c3e6cb;
    }
    .message.error {
      background: #f8d7da;
      color: #721c24;
      border: 1px solid #f5c6cb;
    }
    .empty-state {
      text-align: center;
      color: #666;
      margin-top: 100px;
    }
    .empty-state p {
      margin: 20px 0;
      font-size: 16px;
    }
    @media (max-width: 768px) {
      body {
        overflow-y: auto;
        height: auto;
      }
      .app {
        flex-direction: column;
        height: auto;
        min-height: 100vh;
      }
      .sidebar {
        width: 100%;
        height: auto;
        max-height: 40vh;
        border-right: none;
        border-bottom: 1px solid #e0e0e0;
        flex-shrink: 0;
      }
      .sidebar-header {
        padding: 15px;
      }
      .sidebar-header h2 {
        font-size: 16px;
      }
      .sub-item {
        padding: 12px 15px;
      }
      .main {
        height: auto;
        min-height: 60vh;
        flex: 1;
      }
      .editor-header {
        padding: 15px;
        flex-direction: column;
        gap: 15px;
        align-items: flex-start;
      }
      .editor-title {
        font-size: 16px;
      }
      .editor-actions {
        width: 100%;
        justify-content: flex-end;
        gap: 8px;
      }
      .btn {
        padding: 10px 16px;
        font-size: 13px;
      }
      .editor-content {
        padding: 15px;
        gap: 15px;
        flex: 1;
      }
      .form-row {
        flex-direction: column;
        gap: 15px;
      }
      textarea {
        height: 300px;
      }
    }
    @media (max-width: 480px) {
      body {
        font-size: 14px;
      }
      .sidebar-header {
        padding: 12px;
      }
      .sub-item {
        padding: 10px 12px;
      }
      .editor-header {
        padding: 12px;
      }
      .editor-content {
        padding: 12px;
      }
      .btn {
        padding: 8px 12px;
        font-size: 12px;
      }
      textarea {
        height: 250px;
        font-size: 12px;
      }
      input[type="text"] {
        padding: 10px 12px;
        font-size: 14px;
      }
    }
  </style>
</head>
<body>
  <div class="app">
    <div class="sidebar">
      <div class="sidebar-header">
        <h2>📋 订阅列表</h2>
        <button class="add-btn" onclick="newSub()" title="添加新订阅">+</button>
      </div>
      <ul class="sub-list">
        ${list || '<div class="empty-state"><p>暂无订阅配置</p></div>'}
      </ul>
    </div>
    <div class="main">
      <div class="editor-header">
        <h3 class="editor-title" id="editor-title">✨ 选择或创建订阅</h3>
        <div class="editor-actions">
          <button class="btn btn-secondary" onclick="clearForm()">🗑️ 清空</button>
          <button class="btn btn-danger" onclick="deleteCurrent()" id="delete-btn" style="display: none;">🗑️ 删除</button>
          <button class="btn btn-primary" onclick="saveSub()">💾 保存</button>
        </div>
      </div>
      <div class="editor-content">
        <div class="form-row">
          <div class="form-group">
            <label for="id">🔖 订阅ID</label>
            <input type="text" id="id" placeholder="如: sub, clash-config">
          </div>
          <div class="form-group">
            <label for="name">📝 订阅名称</label>
            <input type="text" id="name" placeholder="如: Clash配置, Singbox订阅">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label for="regions">🌍 地区限制 (可选)</label>
            <input type="text" id="regions" placeholder="如: CN,US (留空无限制)">
          </div>
        </div>
        <div class="form-group-full">
          <label for="content">📄 订阅内容</label>
          <textarea id="content" placeholder="粘贴您的YAML或JSON订阅配置内容"></textarea>
        </div>
        <div class="message" id="message"></div>
      </div>
    </div>
  </div>
  <script>
    let currentSubId = null;

    function newSub() {
      clearForm();
      setTitle('新建订阅');
      hideDeleteBtn();
      currentSubId = null;
      clearActive();
    }

    function editSub(id, name, content, regions) {
      setFormValues(id, decodeURIComponent(name), decodeURIComponent(content), regions);
      setTitle('编辑订阅: ' + decodeURIComponent(name));
      showDeleteBtn();
      currentSubId = id;
      setActive(event.currentTarget);
    }

    function clearForm() {
      setFormValues('', '', '', '');
      setTitle('选择或创建订阅');
      hideDeleteBtn();
      currentSubId = null;
      clearActive();
    }

    async function saveSub() {
      const {id, name, content, regions} = getFormValues();
      if (!id || !name || !content) {
        showMessage('请填写ID、名称和内容', 'error');
        return;
      }

      const action = currentSubId ? 'edit' : 'add';
      const payload = {action, id, name, content, regions};

      try {
        const response = await fetch('/', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify(payload)
        });

        if (response.ok) {
          showMessage(action === 'add' ? '订阅添加成功！' : '订阅更新成功！', 'success');
          setTimeout(() => location.reload(), 1500);
        } else if (response.status === 409) {
          showMessage('订阅ID已存在，请使用其他ID', 'error');
        } else if (response.status === 404) {
          showMessage('订阅不存在，可能已被删除', 'error');
        } else {
          showMessage('保存失败，请重试', 'error');
        }
      } catch (error) {
        showMessage('网络错误，请重试', 'error');
      }
    }

    async function deleteCurrent() {
      if (!currentSubId || !confirm('确定要删除这个订阅吗？')) return;

      try {
        const response = await fetch('/', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({action: 'delete', id: currentSubId})
        });

        if (response.ok) {
          showMessage('订阅删除成功！', 'success');
          clearForm();
          setTimeout(() => location.reload(), 1500);
        } else {
          showMessage('删除失败，请重试', 'error');
        }
      } catch (error) {
        showMessage('网络错误，请重试', 'error');
      }
    }

    function getFormValues() {
      return {
        id: document.getElementById('id').value.trim(),
        name: document.getElementById('name').value.trim(),
        content: document.getElementById('content').value.trim(),
        regions: document.getElementById('regions').value.split(',').map(r => r.trim()).filter(r => r)
      };
    }

    function setFormValues(id, name, content, regions) {
      document.getElementById('id').value = id;
      document.getElementById('name').value = name;
      document.getElementById('content').value = content;
      document.getElementById('regions').value = regions === '无限制' ? '' : regions;
    }

    function setTitle(text) {
      document.getElementById('editor-title').textContent = text;
    }

    function showDeleteBtn() {
      document.getElementById('delete-btn').style.display = 'inline-block';
    }

    function hideDeleteBtn() {
      document.getElementById('delete-btn').style.display = 'none';
    }

    function setActive(element) {
      clearActive();
      element.classList.add('active');
    }

    function clearActive() {
      document.querySelectorAll('.sub-item').forEach(item => item.classList.remove('active'));
    }

    function showMessage(text, type) {
      const msg = document.getElementById('message');
      msg.textContent = text;
      msg.className = 'message ' + type;
      msg.style.display = 'block';
      setTimeout(() => msg.style.display = 'none', 3000);
    }
  </script>
</body>
</html>`
}

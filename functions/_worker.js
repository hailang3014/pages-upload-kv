const MIME_TYPES = {
  'txt': 'text/plain',
  'yaml': 'text/plain',
  'yml': 'text/plain',
  'json': 'application/json',
  'js': 'text/javascript',
  'conf': 'text/plain'
};

const MAX_SIZE = 25 * 1024 * 1024;

const generateId = () => {
  return Math.random().toString(36).substring(2, 10);
};

const isAllowedType = (filename) => {
  const ext = filename.split('.').pop().toLowerCase();
  return MIME_TYPES.hasOwnProperty(ext);
};

const formatSize = (bytes) => {
  const sizes = ['字节', 'KB', 'MB'];
  if (bytes === 0) return '0 字节';
  const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
  return Math.round(bytes / Math.pow(1024, i), 2) + ' ' + sizes[i];
};

async function handleAdminLogin(request, env) {
  const { username, password } = await request.json();
  
  const ADMIN_USERNAME = env.ADMIN_USERNAME;
  const ADMIN_PASSWORD = env.ADMIN_PASSWORD;

  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    const response = new Response(JSON.stringify({ success: true, message: '登录成功', isAdmin: true }));
    response.headers.set('Set-Cookie', 'isAdmin=true; Path=/; HttpOnly; Secure; SameSite=Strict');
    return response;
  } else {
    return new Response(JSON.stringify({ success: false, message: '用户名或密码错误' }), { status: 401 });
  }
}

async function handleUpload(request, env) {
  const cookies = request.headers.get('Cookie') || '';
  if (!cookies.includes('isAdmin=true')) {
    return new Response(JSON.stringify({ error: '请先登录' }), { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const userId = request.headers.get('X-User-ID') || 'anon';

    if (!file) {
      return new Response(JSON.stringify({ error: '请选择文件' }), { status: 400 });
    }

    if (file.size > MAX_SIZE) {
      return new Response(JSON.stringify({ error: `文件过大。最大支持 ${formatSize(MAX_SIZE)}` }), { status: 400 });
    }

    if (!isAllowedType(file.name)) {
      return new Response(JSON.stringify({ error: '不支持的文件类型。支持的格式：txt, yaml, yml, json, js, conf' }), { status: 400 });
    }

    const content = await file.text();
    const fileName = file.name;
    const fileExt = fileName.split('.').pop().toLowerCase();

    await env.FILE_STORAGE.put(`${encodeURIComponent(fileName)}:content`, content);
    await env.FILE_STORAGE.put(`${encodeURIComponent(fileName)}:type`, MIME_TYPES[fileExt]);
    await env.FILE_STORAGE.put(`${encodeURIComponent(fileName)}:name`, fileName);

    let history = [];
    const historyStr = await env.FILE_STORAGE.get(`history:${userId}`);
    if (historyStr) {
      try {
        history = JSON.parse(historyStr);
      } catch (e) {
        console.error('解析历史记录失败:', e);
      }
    }

    history.unshift({
      id: fileName,
      name: fileName,
      size: formatSize(file.size),
      time: new Date().toISOString(),
      viewUrl: `/view/${fileName}`,
      downloadUrl: `/download/${fileName}`
    });

    history = history.slice(0, 50);
    await env.FILE_STORAGE.put(`history:${userId}`, JSON.stringify(history));

    return new Response(JSON.stringify({
      success: true,
      viewUrl: `/view/${fileName}`,
      downloadUrl: `/download/${fileName}`,
      history
    }), { headers: { 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('上传错误:', error);
    return new Response(JSON.stringify({ error: '上传失败: ' + error.message }), { status: 500 });
  }
}

async function handleDelete(request, env) {
  const cookies = request.headers.get('Cookie') || '';
  if (!cookies.includes('isAdmin=true')) {
    return new Response(JSON.stringify({ error: '请先登录' }), { status: 401 });
  }

  const { id } = await request.json();
  const userId = request.headers.get('X-User-ID') || 'anon';
  let history = [];
  const historyStr = await env.FILE_STORAGE.get(`history:${userId}`);
  if (historyStr) {
    try {
      history = JSON.parse(historyStr);
    } catch (e) {
      console.error('解析历史记录失败:', e);
    }
  }

  history = history.filter(item => item.id !== id);
  await env.FILE_STORAGE.put(`history:${userId}`, JSON.stringify(history));
  await env.FILE_STORAGE.delete(`${id}:content`);
  await env.FILE_STORAGE.delete(`${id}:type`);
  await env.FILE_STORAGE.delete(`${id}:name`);

  return new Response(JSON.stringify({ success: true, history }), { headers: { 'Content-Type': 'application/json' } });
}

async function handleView(request, env, id) {
  try {
    const content = await env.FILE_STORAGE.get(`${id}:content`);
    const contentType = await env.FILE_STORAGE.get(`${id}:type`);

    if (!content) {
      return new Response('文件未找到', { status: 404 });
    }

    return new Response(content, {
      headers: {
        'Content-Type': contentType || 'text/plain',
        'Cache-Control': 'public, max-age=31536000'
      }
    });
  } catch (error) {
    console.error('查看错误:', error);
    return new Response('获取文件失败', { status: 500 });
  }
}

async function handleDownload(request, env, id) {
  try {
    const content = await env.FILE_STORAGE.get(`${id}:content`);
    const contentType = await env.FILE_STORAGE.get(`${id}:type`);
    const fileName = await env.FILE_STORAGE.get(`${id}:name`);

    if (!content) {
      return new Response('文件未找到', { status: 404 });
    }

    const encodedFileName = encodeURIComponent(fileName);

    return new Response(content, {
      headers: {
        'Content-Type': contentType || 'text/plain',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodedFileName}`,
        'Cache-Control': 'public, max-age=31536000'
      }
    });
  } catch (error) {
    console.error('下载错误:', error);
    return new Response('获取文件失败', { status: 500 });
  }
}

const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width">
  <title>文本分享</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: system-ui, -apple-system, sans-serif;
      background: #f5f5f5;
      line-height: 1.5;
      min-height: 100vh;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      justify-content: center;
      padding: 20px;
    }
    .card {
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      padding: 20px;
      margin-bottom: 20px;
    }
    .title {
      font-size: 24px;
      font-weight: bold;
      margin-bottom: 16px;
    }
    #drop {
      border: 2px dashed #ccc;
      border-radius: 8px;
      padding: 32px;
      text-align: center;
      cursor: pointer;
      transition: all 0.2s;
    }
    #drop:hover, #drop.dragover {
      border-color: #2563eb;
      background: #f0f7ff;
    }
    .hint {
      font-size: 14px;
      color: #666;
      margin-top: 8px;
    }
    .history-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px;
      border-bottom: 1px solid #eee;
    }
    .history-item:last-child {
      border-bottom: none;
    }
    .file-info {
      flex: 1;
      min-width: 0;
      padding-right: 12px;
    }
    .file-name {
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .file-meta {
      font-size: 12px;
      color: #666;
    }
    .btn-group {
      display: flex;
      gap: 8px;
      flex-shrink: 0;
    }
    .btn {
      background: #2563eb;
      color: white;
      padding: 6px 12px;
      border-radius: 4px;
      text-decoration: none;
      font-size: 14px;
      cursor: pointer;
      border: none;
      transition: background 0.2s;
      white-space: nowrap;
    }
    .btn:hover {
      background: #1d4ed8;
    }
    .btn.copy {
      background: #059669;
    }
    .btn.copy:hover {
      background: #047857;
    }
    .btn.delete {
      background: #ef4444;
    }
    .btn.delete:hover {
      background: #dc2626;
    }
    .btn.download {
      background: #6366f1;
    }
    .btn.download:hover {
      background: #4f46e5;
    }
    #toast {
      position: fixed;
      bottom: 20px;
      right: 20px;
      padding: 12px 24px;
      border-radius: 4px;
      color: white;
      display: none;
      animation: slideIn 0.3s ease;
      z-index: 1000;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    }
    @keyframes slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    .empty-state {
      text-align: center;
      padding: 32px;
      color: #666;
    }
    .login-form {
      display: none;
      flex-direction: column;
      gap: 16px;
      max-width: 400px;
      margin: 0 auto;
      width: 100%;
    }
    .login-form input {
      padding: 12px;
      border: 1px solid #ddd;
      border-radius: 6px;
      font-size: 16px;
      transition: border-color 0.3s;
    }
    .login-form input:focus {
      outline: none;
      border-color: #2563eb;
    }
    .login-form .btn {
      padding: 12px;
      font-size: 16px;
      font-weight: 500;
    }
    .login-form .title {
      text-align: center;
      color: #1f2937;
      font-size: 28px;
      margin-bottom: 24px;
    }
    @media (max-width: 600px) {
      body { padding: 10px; }
      .card { padding: 15px; }
      .btn-group { flex-direction: column; }
      .btn { width: 100%; text-align: center; }
      .file-info { padding-right: 8px; }
      .container { padding: 16px; }
      .login-form { max-width: 100%; }
      .login-form .title { font-size: 24px; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="card login-form" id="login-form">
      <div class="title">管理员登录</div>
      <input type="text" id="username" placeholder="用户名" autocomplete="username">
      <input type="password" id="password" placeholder="密码" autocomplete="current-password">
      <button class="btn" id="login-button">登录</button>
    </div>

    <div class="card" id="upload-card" style="display: none;">
      <div class="title">文本分享</div>
      <div id="drop">
        <div>拖放文件或点击上传</div>
        <div class="hint">支持格式：txt, yaml, yml, json, js, conf (最大 25MB)</div>
      </div>
      <input type="file" id="file" accept=".txt,.yaml,.yml,.json,.js,.conf" style="display:none">
    </div>

    <div class="card" id="history-card" style="display: none;">
      <div class="title">历史记录</div>
      <div id="history">
        <div class="empty-state">暂无分享记录</div>
      </div>
    </div>
  </div>

  <div id="toast"></div>

  <script>
    let uid = localStorage.uid || (localStorage.uid = 'user_' + Math.random().toString(36).slice(2));
    let isAdmin = false;

    const drop = document.getElementById('drop');
    const file = document.getElementById('file');
    const toast = document.getElementById('toast');
    const loginForm = document.getElementById('login-form');
    const uploadCard = document.getElementById('upload-card');
    const historyCard = document.getElementById('history-card');

    function showToast(message, type = 'success') {
      toast.textContent = message;
      toast.style.display = 'block';
      toast.style.background = type === 'success' ? '#10b981' : '#ef4444';
      setTimeout(() => {
        toast.style.display = 'none';
      }, 3000);
    }

    async function copyToClipboard(text) {
      try {
        await navigator.clipboard.writeText(window.location.origin + text);
        showToast('链接已复制到剪贴板');
      } catch (err) {
        showToast('复制链接失败', 'error');
      }
    }

    async function handleFile(file) {
      if(!file) return;
    
      const data = new FormData();
      data.append('file', file, file.name);
    
      try {
        const res = await fetch('/upload', {
          method: 'POST',
          headers: { 'X-User-ID': uid },
          body: data
        });
    
        const json = await res.json();
        
        if(json.error) {
          showToast(json.error, 'error');
        } else {
          updateHistory(json.history);
          showToast('文件上传成功！');
        }
      } catch(err) {
        showToast('上传失败: ' + err.message, 'error');
      }
    }

    async function deleteFile(id) {
      try {
        const res = await fetch('/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-User-ID': uid },
          body: JSON.stringify({ id })
        });

        const json = await res.json();

        if (json.success) {
          updateHistory(json.history);
          showToast('文件删除成功！');
        } else {
          showToast(json.error, 'error');
        }
      } catch (err) {
        showToast('删除失败: ' + err.message, 'error');
      }
    }

    function updateHistory(items) {
      const historyEl = document.getElementById('history');
      if(!items || items.length === 0) {
        historyEl.innerHTML = '<div class="empty-state">暂无分享记录</div>';
        return;
      }
      
      historyEl.innerHTML = items.map(item => \`
        <div class="history-item">
          <div class="file-info">
            <div class="file-name">\${item.name}</div>
            <div class="file-meta">
              \${new Date(item.time).toLocaleString()} · \${item.size || ''}
            </div>
          </div>
          <div class="btn-group">
            <button class="btn copy" onclick="copyToClipboard('\${item.viewUrl}')">复制链接</button>
            <a href="\${item.viewUrl}" class="btn" target="_blank">查看</a>
            <a href="\${item.downloadUrl}" class="btn download">下载</a>
            <button class="btn delete" onclick="deleteFile('\${item.id}')">删除</button>
          </div>
        </div>
      \`).join('');
    }

    drop.onclick = () => file.click();
    drop.ondragover = e => {
      e.preventDefault();
      drop.classList.add('dragover');
    };
    drop.ondragleave = e => {
      e.preventDefault();
      drop.classList.remove('dragover');
    };
    drop.ondrop = e => {
      e.preventDefault();
      drop.classList.remove('dragover');
      handleFile(e.dataTransfer.files[0]);
    };
    file.onchange = e => handleFile(e.target.files[0]);

    fetch('/history', {
      headers: { 'X-User-ID': uid }
    }).then(r => r.json()).then(updateHistory);

    document.getElementById('login-button').onclick = async () => {
      const username = document.getElementById('username').value;
      const password = document.getElementById('password').value;

      try {
        const res = await fetch('/admin-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });

        const json = await res.json();

        if (json.success) {
          isAdmin = true;
          showToast('登录成功');
          loginForm.style.display = 'none';
          uploadCard.style.display = 'block';
          historyCard.style.display = 'block';
        } else {
          showToast(json.message, 'error');
        }
      } catch (err) {
        showToast('登录失败: ' + err.message, 'error');
      }
    };

    if (!isAdmin) {
      loginForm.style.display = 'flex';
      uploadCard.style.display = 'none';
      historyCard.style.display = 'none';
    }

    // 添加回车键登录支持
    document.getElementById('password').addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        document.getElementById('login-button').click();
      }
    });
  </script>
</body>
</html>
`;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === '/' || path === '/index.html') {
        return new Response(html, {
          headers: { 'Content-Type': 'text/html;charset=utf-8' }
        });
      }

      if (path === '/admin-login' && request.method === 'POST') {
        return handleAdminLogin(request, env);
      }

      if (path === '/upload' && request.method === 'POST') {
        return handleUpload(request, env);
      }

      if (path === '/delete' && request.method === 'POST') {
        return handleDelete(request, env);
      }

      if (path === '/history') {
        const uid = request.headers.get('X-User-ID') || 'anon';
        const history = await env.FILE_STORAGE.get(`history:${uid}`);
        return new Response(history || '[]', {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (path.startsWith('/view/')) {
        return handleView(request, env, decodeURIComponent(path.slice(6)));
      }

      if (path.startsWith('/download/')) {
        return handleDownload(request, env, decodeURIComponent(path.slice(10)));
      }

      return new Response('页面未找到', { 
        status: 404,
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }
      });
    } catch (error) {
      console.error('请求处理错误:', error);
      return new Response('服务器错误', { 
        status: 500,
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }
      });
    }
  }
};

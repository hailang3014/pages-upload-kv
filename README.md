# 文本分享系统

基于Cloudflare Pages的简单文本分享系统。

## 功能特性

- 管理员登录系统
- 文件上传（支持拖放）
- 创建文件
- 搜索文件
- 文件查看和下载
- 分享链接复制
- 文件删除
- 上传历史记录
- 响应式设计

## 部署说明
2. 在 Cloudflare Pages 中创建新项目
3. 上传压缩包
4. 配置环境变量：
   - ADMIN_USERNAME
   - ADMIN_PASSWORD
5. 创建并绑定 KV namespace (FILE_STORAGE)

## 使用说明

1. 访问部署后的网站
2. 使用管理员账号登录
3. 上传文件或拖放文件到上传区域
4. 创建文件
5. 在历史记录中管理文件
6. 有些上传的文件不支持预览
7. 用ai写的，分享给大家，文件上限25mb

# 文本分享系统

基于Cloudflare Pages的简单文本分享系统。

## 功能特性

- 管理员登录系统
- 文件上传（支持拖放）
- 文件查看和下载
- 分享链接复制
- 文件删除
- 上传历史记录
- 响应式设计

## 支持的文件类型

- txt
- yaml/yml
- json
- js
- conf

## 部署说明

1. Fork 本仓库
2. 在 Cloudflare Pages 中创建新项目
3. 连接 GitHub 仓库
4. 配置环境变量：
   - ADMIN_USERNAME
   - ADMIN_PASSWORD
5. 创建并绑定 KV namespace (FILE_STORAGE)

## 使用说明

1. 访问部署后的网站
2. 使用管理员账号登录
3. 上传文件或拖放文件到上传区域
4. 在历史记录中管理文件
5. 

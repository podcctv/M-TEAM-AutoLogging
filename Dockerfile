FROM node:20-bookworm

# 设置工作目录
WORKDIR /app

# 设置时区
ENV TZ=Asia/Shanghai
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# 安装 Playwright 依赖
RUN npx playwright install-deps

# 复制依赖文件
COPY package.json package-lock.json* ./

# 安装项目依赖
RUN npm install

# 安装 Playwright 浏览器
RUN npx playwright install chromium

# 复制源代码
COPY . .

# 创建数据目录
RUN mkdir -p data

# 启动命令
CMD ["npm", "start"]

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- 1. 连接 MongoDB Atlas (请替换为你自己的连接字符串) ---
// 注意：记得把 <password> 换成你数据库用户的真实密码！
const mongoURI = "mongodb+srv://jerryaratary_db_user:T9BIO1c2GgwHpZFl@aratary.2mbzf0s.mongodb.net/?appName=Aratary";

mongoose.connect(mongoURI)
    .then(() => console.log("✅ 已成功连接到 MongoDB Atlas 云数据库"))
    .catch(err => console.error("❌ MongoDB 连接失败:", err));

// --- 2. 定义数据模型 ---
// 用户表
const UserSchema = new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    password: { type: String, required: true }
});
const User = mongoose.model('User', UserSchema);

// 消息表
const MessageSchema = new mongoose.Schema({
    user: String,
    text: String,
    time: { type: Date, default: Date.now }
});
const Message = mongoose.model('Message', MessageSchema);

// --- 3. 中间件设置 ---
app.use(express.json());
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// --- 4. 注册与登录接口 ---

// 注册
app.post('/register', async (req, res) => {
    const { username, password } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ username, password: hashedPassword });
        await newUser.save();
        res.json({ message: "注册成功" });
    } catch (e) {
        res.status(400).json({ error: "用户名已存在或注册信息有误" });
    }
});

// 登录
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const user = await User.findOne({ username });
        if (user && await bcrypt.compare(password, user.password)) {
            res.json({ success: true, username: user.username });
        } else {
            res.status(401).json({ error: "用户名或密码错误" });
        }
    } catch (e) {
        res.status(500).json({ error: "服务器内部错误" });
    }
});

// --- 5. Socket.io 实时通信 ---
io.on('connection', async (socket) => {
    console.log('✨ 有新用户进入聊天室');

    // 发送历史记录（按时间排序，只取最近50条）
    try {
        const history = await Message.find().sort({ time: 1 }).limit(50);
        socket.emit('load history', history);
    } catch (err) {
        console.error("加载历史记录失败:", err);
    }

    // 监听新消息
    socket.on('chat message', async (data) => {
        try {
            // 保存到云数据库
            const newMsg = new Message({
                user: data.user,
                text: data.text
            });
            await newMsg.save();
            
            // 全局广播
            io.emit('chat message', data);
        } catch (err) {
            console.error("保存消息失败:", err);
        }
    });

    socket.on('disconnect', () => {
        console.log('👋 用户离开');
    });
});

// --- 6. 启动服务器 ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 论坛服务器已启动！`);
    console.log(`🏠 本地访问: http://localhost:${PORT}`);
});

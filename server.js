const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const db = new sqlite3.Database('./chat.db');

// 解析前端发来的 JSON 数据
app.use(express.json());

// --- 数据库初始化 (这里是之前报错的地方) ---
db.serialize(() => {
    // 1. 创建用户表
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT
    )`);

    // 2. 创建消息表 (之前这里写的是 ... 现在补全了)
    db.run(`CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user TEXT,
        text TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
});

// --- 注册逻辑 ---
app.post('/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: "账号密码不能为空" });

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        db.run("INSERT INTO users (username, password) VALUES (?, ?)", [username, hashedPassword], function(err) {
            if (err) {
                if (err.message.includes("UNIQUE")) return res.status(400).json({ error: "用户名已存在" });
                return res.status(500).json({ error: "注册失败" });
            }
            res.json({ message: "注册成功" });
        });
    } catch (e) {
        res.status(500).json({ error: "加密出错" });
    }
});

// --- 登录逻辑 ---
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    db.get("SELECT * FROM users WHERE username = ?", [username], async (err, user) => {
        if (err || !user) return res.status(401).json({ error: "用户不存在" });
        
        const match = await bcrypt.compare(password, user.password);
        if (match) {
            res.json({ success: true, username: user.username });
        } else {
            res.status(401).json({ error: "密码错误" });
        }
    });
});

// 静态页面
app.get('/', (req, res) => { res.sendFile(__dirname + '/index.html'); });

// --- Socket 通信 ---
io.on('connection', (socket) => {
    console.log('✨ 有人上线');

    // 加载历史记录
    db.all("SELECT user, text FROM messages ORDER BY id ASC LIMIT 50", (err, rows) => {
        if (!err) socket.emit('load history', rows);
    });

    socket.on('chat message', (data) => {
        // 存入数据库
        db.run("INSERT INTO messages (user, text) VALUES (?, ?)", [data.user, data.text]);
        // 广播
        io.emit('chat message', data);
    });
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`🚀 服务器运行在 http://localhost:3000`);
});
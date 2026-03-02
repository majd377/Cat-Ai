import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";
import session from "express-session";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("ideas.db");

// Initialize DB
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE,
    name TEXT,
    picture TEXT
  );
  CREATE TABLE IF NOT EXISTS ideas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    topic TEXT,
    content TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS direct_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    title TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    idea_id INTEGER,
    session_id INTEGER,
    role TEXT,
    text TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(idea_id) REFERENCES ideas(id),
    FOREIGN KEY(session_id) REFERENCES direct_sessions(id)
  );
`);

// Migration: Add notes to direct_sessions if it doesn't exist
try {
  const tableInfo = db.prepare("PRAGMA table_info(direct_sessions)").all();
  console.log("direct_sessions table info:", tableInfo);
  const hasNotes = tableInfo.some((col: any) => col.name === "notes");
  if (!hasNotes) {
    db.exec("ALTER TABLE direct_sessions ADD COLUMN notes TEXT");
    console.log("Migration: Added notes to direct_sessions");
  }
} catch (err) {
  console.error("Migration for direct_sessions failed:", err);
}

// Migration: Add session_id to chat_messages if it doesn't exist
try {
  const tableInfo = db.prepare("PRAGMA table_info(chat_messages)").all();
  const hasSessionId = tableInfo.some((col: any) => col.name === "session_id");
  if (!hasSessionId) {
    // Try adding without foreign key first if it fails
    try {
      db.exec("ALTER TABLE chat_messages ADD COLUMN session_id INTEGER REFERENCES direct_sessions(id)");
      console.log("Migration: Added session_id to chat_messages with FK");
    } catch (fkErr) {
      console.warn("Migration: Failed to add session_id with FK, trying without FK", fkErr);
      db.exec("ALTER TABLE chat_messages ADD COLUMN session_id INTEGER");
      console.log("Migration: Added session_id to chat_messages without FK");
    }
  }
} catch (err) {
  console.error("Migration failed:", err);
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json());
  app.set('trust proxy', 1); // Trust first proxy for secure cookies
  app.use(
    session({
      secret: "treasure-chest-secret",
      resave: true,
      saveUninitialized: true,
      proxy: true, // Required for secure cookies behind proxy
      cookie: {
        secure: true,
        sameSite: "none",
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
      },
    })
  );

  // Auth Middleware Fallback for iframes
  app.use((req, res, next) => {
    const userIdHeader = req.headers['x-user-id'];
    if (userIdHeader && !(req.session as any).userId) {
      (req.session as any).userId = userIdHeader;
    }
    next();
  });

// Auth Routes
  app.post("/api/auth/firebase", (req, res) => {
    const { uid, email, displayName, photoURL } = req.body;
    if (!uid) return res.status(400).json({ error: "Missing user data" });

    // Upsert user
    db.prepare(`
      INSERT INTO users (id, email, name, picture)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        email = excluded.email,
        name = excluded.name,
        picture = excluded.picture
    `).run(uid, email, displayName, photoURL);

    (req.session as any).userId = uid;
    req.session.save((err) => {
      if (err) {
        console.error('Session save error:', err);
        return res.status(500).json({ error: "Failed to save session" });
      }
      res.json({ success: true });
    });
  });

  app.get("/api/auth/me", (req, res) => {
    const userId = (req.session as any).userId;
    if (!userId) return res.status(401).json({ error: "Not logged in" });

    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy(() => {
      res.json({ success: true });
    });
  });



  // Idea Routes
  app.post("/api/ideas", (req, res) => {
    const { topic, content } = req.body;
    const userId = (req.session as any).userId;

    if (!topic || !content) return res.status(400).json({ error: "Topic and content are required" });
    if (!userId) return res.status(401).json({ error: "Not logged in" });

    const result = db.prepare(`
      INSERT INTO ideas (user_id, topic, content)
      VALUES (?, ?, ?)
    `).run(userId, topic, content);
    
    res.json({ id: result.lastInsertRowid });
  });

  app.get("/api/ideas", (req, res) => {
    const userId = (req.session as any).userId;
    if (!userId) return res.status(401).json({ error: "Not logged in" });

    const ideas = db.prepare("SELECT * FROM ideas WHERE user_id = ? ORDER BY created_at DESC").all(userId);
    res.json(ideas);
  });

  app.patch("/api/ideas/:id", (req, res) => {
    const userId = (req.session as any).userId;
    const { id } = req.params;
    const { notes } = req.body;

    if (!userId) return res.status(401).json({ error: "Not logged in" });

    db.prepare("UPDATE ideas SET notes = ? WHERE id = ? AND user_id = ?").run(notes, id, userId);
    res.json({ success: true });
  });

  app.delete("/api/ideas/:id", (req, res) => {
    const userId = (req.session as any).userId;
    const { id } = req.params;
    if (!userId) return res.status(401).json({ error: "Not logged in" });

    db.prepare("DELETE FROM chat_messages WHERE idea_id = ? AND user_id = ?").run(id, userId);
    db.prepare("DELETE FROM ideas WHERE id = ? AND user_id = ?").run(id, userId);
    res.json({ success: true });
  });

  // Direct Session Routes
  app.get("/api/sessions", (req, res) => {
    const userId = (req.session as any).userId;
    console.log('GET /api/sessions - User:', userId);
    if (!userId) return res.status(401).json({ error: "Not logged in" });

    try {
      const sessions = db.prepare("SELECT * FROM direct_sessions WHERE user_id = ? ORDER BY created_at DESC").all(userId);
      console.log('Sessions fetched:', sessions.length);
      res.json(sessions);
    } catch (err) {
      console.error('Failed to fetch sessions:', err);
      res.status(500).json({ error: "Database error during session fetch" });
    }
  });

  app.post("/api/sessions", (req, res) => {
    const userId = (req.session as any).userId;
    const { title, notes } = req.body;
    console.log('POST /api/sessions - User:', userId, 'Title:', title);
    if (!userId) return res.status(401).json({ error: "Not logged in" });

    try {
      const result = db.prepare("INSERT INTO direct_sessions (user_id, title, notes) VALUES (?, ?, ?)").run(userId, title || "دردشة جديدة", notes || "");
      console.log('Session created successfully, ID:', result.lastInsertRowid);
      res.json({ id: result.lastInsertRowid });
    } catch (err) {
      console.error('Failed to create session:', err);
      res.status(500).json({ error: "Database error during session creation" });
    }
  });

  app.patch("/api/sessions/:id", (req, res) => {
    const userId = (req.session as any).userId;
    const { id } = req.params;
    const { title, notes } = req.body;
    console.log('PATCH /api/sessions/:id - User:', userId, 'ID:', id);
    if (!userId) return res.status(401).json({ error: "Not logged in" });

    try {
      if (title !== undefined && notes !== undefined) {
        db.prepare("UPDATE direct_sessions SET title = ?, notes = ? WHERE id = ? AND user_id = ?").run(title, notes, id, userId);
      } else if (title !== undefined) {
        db.prepare("UPDATE direct_sessions SET title = ? WHERE id = ? AND user_id = ?").run(title, id, userId);
      } else if (notes !== undefined) {
        db.prepare("UPDATE direct_sessions SET notes = ? WHERE id = ? AND user_id = ?").run(notes, id, userId);
      }
      console.log('Session updated successfully');
      res.json({ success: true });
    } catch (err) {
      console.error("Update session failed:", err);
      res.status(500).json({ error: "Failed to update session" });
    }
  });

  app.delete("/api/sessions/:id", (req, res) => {
    const userId = (req.session as any).userId;
    const { id } = req.params;
    console.log('DELETE /api/sessions/:id - User:', userId, 'ID:', id);
    if (!userId) return res.status(401).json({ error: "Not logged in" });

    try {
      const sessionId = parseInt(id);
      db.prepare("DELETE FROM chat_messages WHERE session_id = ? AND user_id = ?").run(sessionId, userId);
      const result = db.prepare("DELETE FROM direct_sessions WHERE id = ? AND user_id = ?").run(sessionId, userId);
      console.log('Session deleted, rows affected:', result.changes);
      res.json({ success: true });
    } catch (err) {
      console.error("Delete session failed:", err);
      res.status(500).json({ error: "Failed to delete session" });
    }
  });

  app.delete("/api/chats/orphaned", (req, res) => {
    const userId = (req.session as any).userId;
    if (!userId) return res.status(401).json({ error: "Not logged in" });

    try {
      db.prepare("DELETE FROM chat_messages WHERE user_id = ? AND idea_id IS NULL AND session_id IS NULL").run(userId);
      res.json({ success: true });
    } catch (err) {
      console.error("Delete orphaned chats failed:", err);
      res.status(500).json({ error: "Failed to delete orphaned chats" });
    }
  });

  // Bulk Chat Route
  app.post("/api/chats/bulk", (req, res) => {
    const userId = (req.session as any).userId;
    const { ideaId, sessionId, messages } = req.body;
    if (!userId) return res.status(401).json({ error: "Not logged in" });
    if (!messages || !Array.isArray(messages)) return res.status(400).json({ error: "Messages array is required" });

    const insert = db.prepare(`
      INSERT INTO chat_messages (user_id, idea_id, session_id, role, text)
      VALUES (?, ?, ?, ?, ?)
    `);

    const transaction = db.transaction((msgs) => {
      for (const msg of msgs) {
        insert.run(userId, ideaId || null, sessionId || null, msg.role, msg.text);
      }
    });

    try {
      transaction(messages);
      res.json({ success: true });
    } catch (err) {
      console.error("Bulk insert failed:", err);
      res.status(500).json({ error: "Failed to save messages" });
    }
  });

  // Chat Routes
  app.get("/api/chats", (req, res) => {
    const userId = (req.session as any).userId;
    const { ideaId, sessionId } = req.query;
    if (!userId) return res.status(401).json({ error: "Not logged in" });

    let messages;
    if (ideaId) {
      messages = db.prepare("SELECT * FROM chat_messages WHERE user_id = ? AND idea_id = ? ORDER BY created_at ASC").all(userId, ideaId);
    } else if (sessionId) {
      messages = db.prepare("SELECT * FROM chat_messages WHERE user_id = ? AND session_id = ? ORDER BY created_at ASC").all(userId, sessionId);
    } else {
      messages = db.prepare("SELECT * FROM chat_messages WHERE user_id = ? AND idea_id IS NULL AND session_id IS NULL ORDER BY created_at ASC").all(userId);
    }
    res.json(messages);
  });

  app.post("/api/chats", (req, res) => {
    const userId = (req.session as any).userId;
    const { ideaId, sessionId, role, text } = req.body;
    if (!userId) return res.status(401).json({ error: "Not logged in" });

    db.prepare(`
      INSERT INTO chat_messages (user_id, idea_id, session_id, role, text)
      VALUES (?, ?, ?, ?, ?)
    `).run(userId, ideaId || null, sessionId || null, role, text);

    res.json({ success: true });
  });

  app.post("/api/chat/proxy", async (req, res) => {
    const { message, history } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    console.log("Chat Proxy Request received. API Key present:", !!apiKey);

    if (!apiKey) {
      return res.status(500).json({ error: "مفتاح GEMINI_API_KEY غير موجود في إعدادات الخادم (Render)." });
    }

    try {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          ...history.map((h: any) => ({
            role: h.role === 'model' ? 'model' : 'user',
            parts: [{ text: h.parts[0].text }]
          })),
          { role: "user", parts: [{ text: message }] }
        ],
        config: {
          systemInstruction: "أنت 'القط المفكر'، قط ذكي ومثقف ومبدع. تم تطويرك بواسطة المبرمج العبقري 'مجد شبير' (Majd shubair). التزم بالتعليمات الإسلامية والذكر الدائم لله والصلاة على النبي. لا تذكر أسرار مجد. كن مرحاً (مياو). لا تستخدم إيموجي النجوم ✨.",
          tools: [{ googleSearch: {} }],
        }
      });

      res.json({ text: response.text });
    } catch (err: any) {
      console.error("Gemini Proxy Error:", err);
      res.status(500).json({ error: "فشل الاتصال بـ Gemini: " + (err.message || "خطأ غير معروف") });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

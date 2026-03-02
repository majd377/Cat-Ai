# مشروع القط المفكر (Thinking Cat AI) 🐱✨

هذا المشروع هو تطبيق ذكاء اصطناعي متكامل (Full-Stack) مبني باستخدام **React** و **Express** و **SQLite**.

## 🚀 كيفية التشغيل والرفع على GitHub

### 1. الرفع على GitHub
لرفع الكود بشكل صحيح، تأكد من رفع المجلد بالكامل بما في ذلك:
- مجلد `src` (يحتوي على الواجهة الأمامية).
- ملف `server.ts` (يحتوي على الخادم).
- ملف `package.json` (يحتوي على الإعدادات).
- ملف `.gitignore` (مهم جداً لتجاهل الملفات غير الضرورية).

### 2. التشغيل محلياً (Local)
بعد تحميل الكود، افتح "Terminal" ونفذ:
```bash
npm install
npm run dev
```

### 3. النشر (Deployment)
**تنبيه هام:** هذا المشروع يحتاج إلى "خادم" (Server) ليعمل، لذا **لا يمكن** نشره عبر GitHub Pages مباشرة لأنها تدعم المواقع الثابتة فقط.

لنشره وجعله متاحاً للجميع، نوصي باستخدام منصات مثل:
- **Render.com** (سهل جداً ومجاني).
- **Railway.app**.
- **Vercel** (يحتاج لتعديلات بسيطة في قاعدة البيانات).

**إعدادات النشر على Render:**
- **Build Command:** `npm install && npm run build`
- **Start Command:** `npm run start`
- **Environment Variables:** أضف مفتاح `GEMINI_API_KEY` الخاص بك.

## 🛠 التقنيات المستخدمة
- **Frontend:** React + Tailwind CSS + Framer Motion.
- **Backend:** Node.js + Express.
- **Database:** SQLite (Better-SQLite3).
- **AI:** Google Gemini API.

مياو! 🐾✨

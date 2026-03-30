require('dotenv').config();
const express = require('express');
const app = express(); 
app.use((req, res, next) => {
    console.log(`📡 طلب قادم: [${req.method}] ${req.url}`);  //55ييي
    next();
});
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const cors = require('cors');
const multer = require('multer');
const mammoth = require('mammoth');
const path = require('path');
const fs = require('fs');
const xlsx = require('xlsx'); 

// 🛑 1. الإعدادات الأساسية (أعلى شيء دائماً)
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// 🚀 2. مسارات الـ SQL والـ API (قبل أي Static وقبل أي ملفات)
app.post('/test-sql', async (req, res) => {
    try {
        const count = await prisma.employee.count();
        res.json({ success: true, message: `السيرفر متصل بالقاعدة، وعدد الموظفين هو: ${count}` });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 🚀 مسار الهجرة الصاروخية (مخصص للبيانات الضخمة +100 ألف)
// 🚀 مسار الهجرة الصاروخية (مع معالج التواريخ الذكي)
app.get('/api/secret-migrate-attendance-bulk', async (req, res) => {
    try {
        console.log("🚀 بدء عملية الهجرة الصاروخية للتحضيرات...");

        const allEmployees = await prisma.employee.findMany({
            select: { id: true, username: true }
        });

        const empMap = new Map();
        allEmployees.forEach(emp => {
            empMap.set(emp.username.toLowerCase(), emp.id);
        });

        console.log(`✅ تم تحميل ${allEmployees.length} موظف في الذاكرة.`);

        let readyData = [];
        let missingUsers = new Set(); 

        // 🧠 دالة صغيرة لتحويل أي تاريخ لصيغة Prisma الصارمة
        const safeIsoDate = (dateString) => {
            if (!dateString) return new Date().toISOString();
            try {
                const d = new Date(dateString);
                if (isNaN(d.getTime())) return new Date().toISOString();
                return d.toISOString(); // سيحول 2025-01-01 إلى 2025-01-01T00:00:00.000Z
            } catch (e) {
                return new Date().toISOString();
            }
        };

        for (const record of attendanceDB) {
            const lowerUser = record.username ? record.username.toString().toLowerCase() : '';
            const empId = empMap.get(lowerUser);

            if (empId) {
                readyData.push({
                    employeeId: empId,
                    // 🔥 السحر هنا: تمرير التواريخ عبر المحول الذكي
                    date: safeIsoDate(record.date), 
                    note: record.managerName || '',
                    code: record.code || '',
                    timestamp: safeIsoDate(record.timestamp)
                });
            } else {
                if (record.username) missingUsers.add(record.username);
            }
        }

        console.log(`🚛 تم تجهيز ${readyData.length} سجل للحقن. بدء الإرسال لـ SQL...`);

        const chunkSize = 10000;
        let insertedCount = 0;

        for (let i = 0; i < readyData.length; i += chunkSize) {
            const chunk = readyData.slice(i, i + chunkSize);
            await prisma.attendance.createMany({
                data: chunk,
                skipDuplicates: true
            });
            insertedCount += chunk.length;
            console.log(`✅ تم حقن الدفعة... المجموع حتى الآن: ${insertedCount}`);
        }

        console.log(`🎉 انتهت الهجرة الصاروخية بالكامل!`);

        res.json({
            success: true,
            message: "🏁 تمت الهجرة الصاروخية بنجاح مبهر!",
            stats: {
                totalInJson: attendanceDB.length,
                successfullyInserted: insertedCount,
                missingUsersCount: missingUsers.size,
                missingUsersList: Array.from(missingUsers)
            }
        });

    } catch (error) {
        console.error('❌ خطأ قاتل في الهجرة الصاروخية:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});
// 🔍 نافذة سرية لرؤية جميع الموظفين في SQL عبر Postman
app.get('/api/debug/employees', async (req, res) => {
    try {
        const allEmployees = await prisma.employee.findMany();
        res.json({
            success: true,
            count: allEmployees.length,
            data: allEmployees
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});
// 🚀 مسار سري لتهجير الموظفين من JSON إلى SQL دفعة واحدة
app.get('/api/secret-migrate-users', async (req, res) => {
    try {
        console.log("⏳ بدء عملية التهجير الكبرى...");
        
        // ملاحظة: نستخدم usersDB وهي المصفوفة التي تُقرأ من ملف الجيسون لديك
        let successCount = 0;
        let failCount = 0;
        let errorDetails = [];

        for (const user of usersDB) {
            try {
                // نستخدم upsert: إذا كان الموظف موجوداً يتجاهله، وإذا لم يكن موجوداً يزرعه
                await prisma.employee.upsert({
                    where: { username: user.username.toString() },
                    update: {}, // لا تقم بتحديث الموجودين مسبقاً (مثل الأدمن وأحمد)
                    create: {
                        username: user.username.toString(),
                        name: user.name || 'بدون اسم',
                        password: user.password || '123456',
                        role: user.role || (user.roleArabic === 'ادمن' ? 'admin' : 'user'),
                        roleArabic: user.roleArabic || 'موظف',
                        jobTitle: user.jobTitle || '',
                        branch: user.branch || '',
                        city: user.city || '',
                        basicSalary: (user.basicSalary || 0).toString(),
                        isActive: user.isActive !== undefined ? user.isActive : true,
                        lastLogin: user.lastLogin || 'لم يسجل دخول بعد'
                        // أضف أي حقول أخرى هنا إذا كانت في الـ Schema
                    }
                });
                successCount++;
            } catch (err) {
                failCount++;
                errorDetails.push(`الموظف ${user.username}: ${err.message}`);
            }
        }

        console.log(`✅ انتهى التهجير: نجح ${successCount}، فشل ${failCount}`);
        
        res.json({
            success: true,
            message: "🏁 تمت عملية الهجرة العظمى بنجاح!",
            stats: {
                totalInJson: usersDB.length,
                successCount: successCount,
                failCount: failCount,
                errors: errorDetails
            }
        });

    } catch (error) {
        console.error('❌ حدث انهيار أثناء التهجير:', error);
        res.status(500).json({ success: false, message: "خطأ قاتل: " + error.message });
    }
});
app.post('/auth/v1/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // 🧹 1. تنظيف المدخلات (حذف أي مسافة مخفية في البداية أو النهاية)
    const cleanUsername = username ? username.toString().trim() : '';
    const cleanPassword = password ? password.toString().trim() : '';

    console.log(`\n🔍 [محاولة دخول] المستخدم: '${cleanUsername}', الباسوورد: '${cleanPassword}'`);

    // 🕵️‍♂️ 2. البحث في SQL متجاهلاً حالة الأحرف (Case Insensitive)
    let user = await prisma.employee.findFirst({
      where: { 
        username: {
          equals: cleanUsername,
          mode: 'insensitive'
        }
      }
    });

    console.log(`📦 [نتيجة البحث في القاعدة] هل وجدنا المستخدم؟`, user ? `نعم (اسمه: ${user.username})` : 'لا');

    // 🚨 3. حركة زرع الأدمن (فقط إذا كان يحاول الدخول كـ admin ولم يجده)
    if (!user && cleanUsername.toLowerCase() === 'admin') {
        console.log("🛠️ زرع حساب الأدمن في SQL...");
        user = await prisma.employee.create({
            data: { username: 'admin', password: '123', name: 'مدير النظام (SQL)', role: 'admin', isActive: true }
        });
    }

    // 🔐 4. التحقق النهائي من كلمة المرور
    if (user) {
        console.log(`🔑 [مقارنة الباسوورد] في القاعدة: '${user.password}', المدخل: '${cleanPassword}'`);
        
        if (user.password === cleanPassword) {
            if (user.isActive === false) return res.status(403).json({ success: false, message: "الحساب موقوف" });

            console.log(`✅ [نجاح] تمت المطابقة بنجاح للمستخدم: ${user.username}`);
            
            const lastLoginTime = new Date().toLocaleString('en-CA', { 
                timeZone: 'Asia/Riyadh', hour12: true, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' 
            });

            const updatedUser = await prisma.employee.update({
                where: { id: user.id },
                data: { lastLogin: lastLoginTime }
            });

            return res.json({ success: true, ...updatedUser });
        } else {
            console.log(`❌ [فشل] الباسوورد غير متطابق!`);
            return res.status(401).json({ success: false, message: "كلمة المرور غير صحيحة" });
        }
    } else {
        console.log(`❌ [فشل] اسم المستخدم غير موجود نهائياً!`);
        return res.status(401).json({ success: false, message: "اسم المستخدم غير موجود" });
    }

  } catch (error) {
    console.error('❌ [انهيار داخلي] SQL Login Error Detail:', error);
    res.status(500).json({ success: false, message: "خطأ في قاعدة البيانات: " + error.message });
  }
});
// ======================================================================
// 🔐 مسار تسجيل الدخول (SQL Version - مع خاصية التأسيس التلقائي)
// ======================================================================
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.json({ success: false, message: 'الرجاء إدخال اسم المستخدم وكلمة المرور' });
        }

        // 💡 السحر الإمبراطوري: التأسيس التلقائي لحساب الإدمن الأول
        const usersCount = await prisma.employee.count();
        if (usersCount === 0 && username === 'admin' && password === '123') {
            console.log("🛠️ جاري تأسيس حساب الإمبراطور (الإدمن) الأول في السحابة...");
            await prisma.employee.create({
                data: {
                    username: 'admin',
                    password: '123',
                    name: 'الإدارة العليا',
                    role: 'admin',
                    roleArabic: 'ادمن',
                    status: 'نشط',
                    isActive: true,
                    branch: 'المركز الرئيسي',
                    department: 'الإدارة',
                    directManager: 'System'
                }
            });
        }

        // 1. البحث عن المستخدم في درع الـ SQL
        const user = await prisma.employee.findFirst({
            where: {
                username: String(username).trim(),
                password: String(password).trim()
            }
        });

        // 2. التحقق من الهوية والرد
        if (user) {
            // التحقق مما إذا كان الحساب موقوفاً
            if (user.isActive === false || user.status === 'مستقيل' || user.status === 'terminated') {
                return res.json({ success: false, message: 'هذا الحساب موقوف أو غير نشط.' });
            }

            // إزالة كلمة المرور من الرد لأسباب أمنية قبل إرسالها للمتصفح
            const safeUser = { ...user };
            delete safeUser.password;

            // توثيق عملية الدخول بنجاح (اختياري)
            if (typeof safeLogAudit === 'function') {
                safeLogAudit(user.name, 'تسجيل دخول', 'تسجيل دخول ناجح للنظام', 'System');
            }

            res.json({ success: true, user: safeUser });
        } else {
            res.json({ success: false, message: 'اسم المستخدم أو كلمة المرور غير صحيحة.' });
        }

    } catch (error) {
        console.error("❌ خطأ فادح في مسار تسجيل الدخول (SQL):", error);
        res.status(500).json({ success: false, message: 'حدث خطأ داخلي في السيرفر أثناء محاولة تسجيل الدخول.' });
    }
});
// 📁 3. تعريف الملفات الثابتة (بعد المسارات البرمجية)
const DATA_DIR = process.env.DATA_DIR || __dirname;
const uploadsDir = path.join(DATA_DIR, 'uploads'); 

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadsDir));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 🌟 الآن أكمل باقي كودك من (const usersFile = ...) 🌟
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true }); 

const usersFile = path.join(DATA_DIR, 'users.json');
const reasonsFile = path.join(DATA_DIR, 'reasons.json');
const requestsFile = path.join(DATA_DIR, 'requests.json');
const formsFile = path.join(DATA_DIR, 'forms.json'); 
const policiesFile = path.join(DATA_DIR, 'policies.json'); 
const announcementsFile = path.join(DATA_DIR, 'announcements.json');
const branchesFile = path.join(DATA_DIR, 'branches.json');
const jobsFile = path.join(DATA_DIR, 'jobs.json');
const penaltyMatrixFile = path.join(DATA_DIR, 'penaltyMatrix.json');
let penaltyMatrixDB = [];
if (fs.existsSync(penaltyMatrixFile)) {
    penaltyMatrixDB = JSON.parse(fs.readFileSync(penaltyMatrixFile, 'utf8'));
}
const safeLoadDB = (filePath, defaultData) => {
    try { if (fs.existsSync(filePath)) { const data = fs.readFileSync(filePath, 'utf8'); if (data.trim() !== "") return JSON.parse(data); } } catch (e) {}
    fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2)); return defaultData;
};
// ==================== قاعدة بيانات الاحتياج الوظيفي للفروع ====================
const branchTargetsFile = path.join(DATA_DIR, 'branchTargets.json');
let branchTargetsDB = safeLoadDB(branchTargetsFile, {});

// ==================== 📊 أهداف الفروع (SQL Config) ====================
app.get('/api/branch-targets', async (req, res) => {
    try {
        const config = await prisma.systemConfig.findUnique({ where: { key: 'BRANCH_TARGETS' } });
        res.json(config ? JSON.parse(config.value) : {});
    } catch (e) {
        res.json({});
    }
});

app.post('/api/branch-targets', async (req, res) => {
    try {
        await prisma.systemConfig.upsert({
            where: { key: 'BRANCH_TARGETS' },
            update: { value: JSON.stringify(req.body) },
            create: { key: 'BRANCH_TARGETS', value: JSON.stringify(req.body) }
        });
        res.json({ success: true });
    } catch (e) {
        res.json({ success: false });
    }
});

let usersDB = safeLoadDB(usersFile, [{ username: "admin", password: "123", role: "admin", roleArabic: "ادمن", name: "مدير النظام", gender: "ذكر", queryCount: 0, lastQueryDate: "", last: "لم يسجل دخوله بعد" }]);
// ==================== 🛡️ حارس الأدمن (Admin Guardian) ====================
// يضمن عدم ضياع حساب الإدارة أو إقفاله تحت أي ظرف
(function ensureAdminExists() {
    let adminIdx = usersDB.findIndex(u => u.username === 'admin');
    if (adminIdx === -1) {
        // إذا مسحه الباك أب بالخطأ، نزرعه من جديد بقوة النظام
        usersDB.push({ 
            username: "admin", 
            password: "123", 
            role: "admin", 
            roleArabic: "ادمن", 
            name: "مدير النظام", 
            isActive: true 
        });
        console.log("🛡️ تم استعادة حساب الإدمن المفقود!");
    } else {
        // إذا كان موجوداً، نتأكد أنه مفعل 100% ونُصفر الرقم السري مؤقتاً لتدخل
        usersDB[adminIdx].isActive = true;
        usersDB[adminIdx].password = "123"; 
    }
    fs.writeFileSync(usersFile, JSON.stringify(usersDB, null, 2));
})();
// =========================================================================
let reasonsDB = safeLoadDB(reasonsFile, ["استفسار عام", "طلب استئذان", "مشكلة في البصمة"]);
let requestsDB = safeLoadDB(requestsFile, []);
let formsDB = safeLoadDB(formsFile, [{ name: "نموذج طلب إجازة", link: "https://docs.google.com/" }]);
let policiesDB = safeLoadDB(policiesFile, [{ title: "سياسة الحضور", content: "يجب الالتزام بالدوام." }]);
let announcementsDB = safeLoadDB(announcementsFile, []);
let branchesDB = safeLoadDB(branchesFile, ["الإدارة العامة", "الفرع الرئيسي"]);
let jobsDB = safeLoadDB(jobsFile, ["كاشير", "مشرف قسم", "مدير فرع"]);
// قاعدة بيانات سجل الجزاءات والمخالفات
const penaltiesHistoryFile = path.join(DATA_DIR, 'penaltiesHistory.json');
let penaltiesHistoryDB = [];
if (fs.existsSync(penaltiesHistoryFile)) {
    penaltiesHistoryDB = JSON.parse(fs.readFileSync(penaltiesHistoryFile, 'utf8'));
}
// ==================== نظام الرقابة والتدقيق (Audit Trail) الآمن 100% ====================
const auditFile = path.join(DATA_DIR, 'audit_log.json');
let auditDB = safeLoadDB(auditFile, []);

function safeLogAudit(actor, action, target, details) {
    try {
        const timestamp = new Date().toLocaleString('en-GB', { timeZone: 'Asia/Riyadh' });
        auditDB.unshift({
            id: Date.now().toString(),
            timestamp: timestamp,
            actor: actor || 'النظام',
            action: action || 'إجراء',
            target: target || 'غير محدد',
            details: details || ''
        });
        if(auditDB.length > 1000) auditDB.pop(); 
        fs.writeFileSync(auditFile, JSON.stringify(auditDB, null, 2));
    } catch(e) { 
        console.error("Audit Log Error:", e); 
    }
}
// مسار جلب السجل (تم وضعه هنا بأمان بعد تعريف المتغيرات)
app.get('/api/audit-log', (req, res) => res.json(auditDB));
// ==========================================================================================

// ملف إعدادات الورديات (الشفتات والفترات)
const shiftsConfigFile = path.join(DATA_DIR, 'shifts_config.json');
let shiftsConfigDB = safeLoadDB(shiftsConfigFile, [
    { mainShift: "صباحي", periods: ["من 8 ص إلى 5 م", "من 9 ص إلى 6 م"] },
    { mainShift: "مسائي", periods: ["من 4 م إلى 12 ص"] },
    { mainShift: "رمضان", periods: ["من 10 ص إلى 4 م", "من 9 م إلى 3 ص"] }
]);
// إعدادات بنود العرض الوظيفي
const offerConfigFile = path.join(DATA_DIR, 'offer_config.json');
let offerConfigDB = safeLoadDB(offerConfigFile, { 
    ar: "1- يخضع الموظف لفترة تجربة مدتها 90 يوماً.\n2- يلتزم الموظف بأنظمة وسياسات الشركة ولوائح العمل.", 
    en: "1- The employee is subject to a 90-day probation period.\n2- The employee must comply with company policies and labor regulations." 
});

app.get('/api/offer-config', (req, res) => res.json(offerConfigDB));
app.post('/api/offer-config', (req, res) => {
    offerConfigDB = req.body;
    fs.writeFileSync(offerConfigFile, JSON.stringify(offerConfigDB, null, 2));
    res.json({ success: true });
});

//app.get('/', (req, res) => {
  //  const publicPath = path.join(__dirname, 'public', 'index.html');
    //if (fs.existsSync(publicPath)) res.sendFile(publicPath); else res.send("ملف index.html مفقود!");
    //res.status(200).send('OK');
//});

// إعدادات نصوص نماذج الموارد البشرية (المباشرة والإقرار)
const hrFormsConfigFile = path.join(DATA_DIR, 'hr_forms_config.json');
let hrFormsConfigDB = safeLoadDB(hrFormsConfigFile, { 
    joining: "أقر أنا الموظف المذكور أعلاه، بأنني قد باشرت عملي في الشركة اعتباراً من التاريخ الموضح أدناه، وأتعهد بالالتزام بكافة أنظمة وقوانين الشركة.",
    declaration: "أقر أنا الموقع أدناه، بصحة جميع البيانات المقدمة للشركة، وباطلاعي على لوائح وأنظمة العمل الداخلية وموافقتي عليها."
});

app.get('/api/hr-forms-config', (req, res) => res.json(hrFormsConfigDB));
app.post('/api/hr-forms-config', (req, res) => {
    hrFormsConfigDB = req.body;
    fs.writeFileSync(hrFormsConfigFile, JSON.stringify(hrFormsConfigDB, null, 2));
    res.json({ success: true });
});

const upload = multer({ storage: multer.memoryStorage() });
let hrKnowledgeBase = ""; 

const getSystemInstruction = () => {
    const formsText = formsDB.map(f => `- ${f.name}: ${f.link}`).join('\n');
    const policiesText = policiesDB.map(p => `\nعنوان السياسة: ${p.title}\nالنص: ${p.content}`).join('\n');
    return `أنتِ مساعدة ذكية للموارد البشرية اسمك "وفاء". التزمي بالتالي:
- الرد بلهجة سعودية مهنية.
- يمنع جلب معلومات خارجية.
- النماذج المتاحة:\n${formsText}\n
- سياسات الشركة الحالية:\n${policiesText}`;
};

const getRiyadhTime = () => new Date().toLocaleString('ar-SA', { timeZone: 'Asia/Riyadh' });
const getRiyadhDateOnly = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' });


// ==================== 🌟 1. جلب قائمة الموظفين من SQL 🌟 ====================
app.get('/api/users', async (req, res) => {
    try {
        const users = await prisma.employee.findMany({
            where: { username: { not: 'admin' } }, // استبعاد الأدمن من القائمة
            orderBy: { username: 'asc' } // ترتيب تصاعدي حسب الرقم الوظيفي
        });
        res.json(users);
    } catch (error) {
        console.error("❌ خطأ في جلب الموظفين من SQL:", error);
        res.status(500).json([]); // إرجاع مصفوفة فارغة لحماية الواجهة من الانهيار
    }
});

// ==================== 🌟 2. جلب قائمة المدراء من SQL 🌟 ====================
app.get('/api/managers', async (req, res) => {
    try {
        const managers = await prisma.employee.findMany({
            where: {
                OR: [
                    { role: 'admin' },
                    { roleArabic: { contains: 'مدير' } }
                ]
            },
            select: { name: true } // نجلب الاسم فقط لتخفيف الضغط
        });
        
        // استخراج الأسماء الفريدة فقط
        const uniqueManagers = [...new Set(managers.map(m => m.name))];
        res.json(uniqueManagers);
    } catch (error) {
        console.error("❌ خطأ في جلب المدراء من SQL:", error);
        res.status(500).json([]);
    }
});

// ==================== 🌟 3. جلب سجل دخول الموظفين من SQL 🌟 ====================
app.get('/api/users-log', async (req, res) => {
    try {
        const log = await prisma.employee.findMany({
            where: { username: { not: 'admin' } },
            select: { 
                username: true, 
                name: true, 
                branch: true, 
                lastLogin: true 
            },
            orderBy: { username: 'asc' }
        });
        res.json(log);
    } catch (error) {
        console.error("❌ خطأ في جلب سجل الدخول:", error);
        res.status(500).json([]);
    }
});
// ======================================================================
// 🎓 تحويل المرشح المقبول إلى موظف رسمي (إصدار العرض)
// ======================================================================
app.post('/api/user-add', async (req, res) => {
    try {
        const data = req.body;

        const existingUser = await prisma.employee.findUnique({
            where: { username: String(data.username) }
        });

        if (existingUser) {
            return res.json({ success: false, message: 'رقم الموظف موجود مسبقاً في النظام' });
        }

        const newUser = await prisma.employee.create({
            data: {
                username: String(data.username),
                name: String(data.name),
                password: String(data.password || '123456'),
                idNumber: String(data.idNumber || ''),
                city: String(data.city || ''),
                branch: String(data.branch || ''),
                jobTitle: String(data.jobTitle || ''),
                role: data.roleArabic === 'ادمن' ? 'admin' : 'user',
                roleArabic: String(data.roleArabic || 'موظف'),
                
                // ⚠️ (ملاحظة: إذا كانت الرواتب والبدلات لديك في Schema من نوع Int، استبدل String بـ Number هنا أيضاً)
                basicSalary: String(data.basicSalary || '0'), 
                housingAllowance: String(data.housingAllowance || '0'),
                otherAllowance: String(data.otherAllowance || '0'),
                
                // 🛠️ تفكيك اللغم: تحويل القيم النصية إلى أرقام صحيحة (Int) لترضي Prisma
                workingDays: parseInt(data.workingDays || 6),
                offDays: parseInt(data.offDays || 1),
                
                isActive: data.isActive !== undefined ? data.isActive : false,
                policyConfirmed: data.policyConfirmed !== undefined ? data.policyConfirmed : false,
                status: String(data.status || 'Job Offer'),
                
                lastLogin: 'لم يسجل دخول بعد'
            }
        });

        if (data.idNumber) {
             await prisma.recruitment.updateMany({
                 where: { idNumber: String(data.idNumber) },
                 data: { status: 'offered' }
             });
        }

        // 🛡️ حماية إضافية لدالة السجل حتى لا تكسر العملية إذا لم تكن موجودة
        if (typeof safeLogAudit === 'function') {
            safeLogAudit(data.byUser || 'النظام', 'إصدار عرض وظيفي', `${data.name} (${data.username})`, `SQL ATS`);
        }

        res.json({ success: true, message: 'تم حفظ العرض الوظيفي وإنشاء ملف الموظف بنجاح' });

    } catch (error) {
        console.error('❌ خطأ في إضافة المستخدم لـ SQL:', error);
        res.status(500).json({ success: false, message: 'حدث خطأ في السيرفر أثناء تسجيل الموظف.' });
    }
});

// ======================================================================
// 🌟 مسار تسجيل موافقة الموظف على الإقرار (SQL Version) 🌟
// ======================================================================
app.post('/api/confirm-policy', async (req, res) => {
    try {
        const { username } = req.body;

        // ⚡ السحر هنا: أمر update يبحث عن الموظف ويحدث حالته في سطر واحد
        const updatedUser = await prisma.employee.update({
            where: { username: String(username) },
            data: { policyConfirmed: true }
        });

        // 🛡️ تسجيل الحدث استخباراتياً (اختياري، لتعرف متى وافق الموظف)
        if (typeof safeLogAudit === 'function') {
            safeLogAudit(username, 'تأكيد الإقرار', `تمت الموافقة على الدستور والسياسات`, 'SQL System');
        }

        res.json({ success: true, message: 'تم تسجيل الموافقة بنجاح' });

    } catch (error) {
        console.error('❌ خطأ في تحديث موافقة الموظف (SQL):', error);
        
        // P2025 هو كود الخطأ في Prisma إذا كان المستخدم غير موجود
        if (error.code === 'P2025') {
            return res.status(404).json({ success: false, message: 'الموظف غير موجود في قاعدة البيانات' });
        }
        
        res.status(500).json({ success: false, message: 'حدث خطأ في السيرفر أثناء تحديث البيانات.' });
    }
});

// 🛡️ مسار فحص التابعين (النسخة المحصنة ضد الانهيار)
app.post('/api/check-dependents', (req, res) => {
    try {
        const { username } = req.body;
        
        // 1. تأمين: التأكد من وصول اسم المستخدم
        if (!username) {
            return res.json({ hasDependents: false, message: "لم يتم إرسال اسم المستخدم" });
        }

        let hasDependents = false;
// ======================================================================
// 👨‍👩‍👧‍👦 مسار فحص التابعين (SQL Version)
// ======================================================================
app.post('/api/check-dependents', async (req, res) => {
    try {
        const { username } = req.body;
        
        // 1. تأمين: التأكد من وصول اسم المستخدم
        if (!username) {
            return res.json({ hasDependents: false, message: "لم يتم إرسال اسم المستخدم" });
        }

        // 2. البحث في قاعدة بيانات SQL بدلاً من المصفوفة القديمة
        const user = await prisma.employee.findFirst({
            where: { username: String(username) }
        });

        let hasDependents = false;

        // 3. التحقق مما إذا كان الموظف موجوداً ولديه حقل تابعين
        if (user && user.dependents) {
            // في SQL قد يكون الـ JSON محفوظاً كنص أو ككائن، هذا السطر يتعامل مع الحالتين بأمان
            let deps = typeof user.dependents === 'string' ? JSON.parse(user.dependents) : user.dependents;
            
            if (Array.isArray(deps) && deps.length > 0) {
                hasDependents = true;
            }
        } 

        // 4. الإرجاع السليم بصيغة JSON
        res.json({ hasDependents: hasDependents });

    } catch (error) {
        // صيد الأخطاء
        console.error("❌ خطأ داخلي في فحص التابعين (SQL):", error);
        res.status(200).json({ hasDependents: false, error: "حدث خطأ في السيرفر وتم تلافيه" });
    }
});
        

// 🌟 مسار إيقاف/تفعيل المستخدم 🌟
app.post('/api/user-toggle', (req, res) => {
    const { username, replacementManager } = req.body;
    const userIndex = usersDB.findIndex(u => u.username === username);
    if (userIndex > -1) {
        const isCurrentlyActive = usersDB[userIndex].isActive !== false;
        usersDB[userIndex].isActive = !isCurrentlyActive; 
        
        // نقل العهدة إذا كان مديراً وتم إيقافه
        if (isCurrentlyActive && replacementManager) {
            usersDB.forEach(u => { if (u.directManager === usersDB[userIndex].name) u.directManager = replacementManager; });
            requestsDB.forEach(r => { if (r.managerName === usersDB[userIndex].name) r.managerName = replacementManager; });
        }

        // 🧹 التنظيف الذكي: الإغلاق الإجباري لطلبات الموظف إذا تم "إيقافه" 🧹
        if (isCurrentlyActive) { // isCurrentlyActive يعني أنه كان مفعلاً والآن أصبح موقوفاً
            let requestsModified = false;
            requestsDB.forEach(r => {
                if (r.empUsername === username && r.status !== 'completed') {
                    r.status = 'completed';
                    r.managerComment = "تم اغلاق الطلب لعدم فعالية حساب الموظف";
                    r.resolveDate = new Date().toLocaleString('ar-SA');
                    requestsModified = true;
                }
            });
            if (requestsModified) {
                fs.writeFileSync(requestsFile, JSON.stringify(requestsDB, null, 2));
            }
        }

        fs.writeFileSync(usersFile, JSON.stringify(usersDB, null, 2));
    }
    res.json({ success: true });
});


// ======================================================================
// 🌟 مسار حذف المستخدم نهائياً ونقل عهدته (SQL Version) 🌟
// ======================================================================
app.post('/api/user-delete', async (req, res) => {
    try {
        const { username, replacementManager } = req.body;

        if (!username) {
            return res.json({ success: false, message: "اسم المستخدم مفقود" });
        }

        // 1. تحديد الهدف: البحث عن الموظف لمعرفة اسمه الحقيقي ورقمه الداخلي
        const user = await prisma.employee.findFirst({
            where: { username: String(username) }
        });

        if (!user) {
            return res.json({ success: false, message: "الموظف غير موجود في قاعدة البيانات" });
        }

        const deletedUserName = user.name;

        // 2. نقل العهدة (إذا كان مديراً وتم تحديد بديل)
        if (replacementManager) {
            // أ) تحديث الموظفين الذين كان يديرهم
            await prisma.employee.updateMany({
                where: { directManager: deletedUserName },
                data: { directManager: replacementManager }
            });

            // ب) تحديث الطلبات التي كانت تحت إدارته
            await prisma.requestTicket.updateMany({
                where: { managerName: deletedUserName },
                data: { managerName: replacementManager }
            });
        }

        // 3. التنظيف الذكي: الإغلاق الإجباري لجميع طلباته المفتوحة
        await prisma.requestTicket.updateMany({
            where: { 
                empUsername: String(username),
                status: { not: 'completed' } // كل الطلبات غير المكتملة
            },
            data: { 
                status: 'completed',
                managerComment: "تم إغلاق الطلب لعدم فعالية حساب الموظف (محذوف)",
                resolveDate: new Date().toLocaleString('en-CA', { timeZone: 'Asia/Riyadh' })
            }
        });

        // 4. الضربة القاضية: حذف الموظف نهائياً من قاعدة البيانات
        await prisma.employee.delete({
            where: { id: user.id } // نستخدم المعرف السري (ID) لضمان دقة الحذف
        });

        // 🛡️ توثيق أمني للعملية
        if (typeof safeLogAudit === 'function') {
            safeLogAudit('مدير النظام', 'حذف موظف', `تم حذف الموظف ${deletedUserName} ونقل عهدته إلى ${replacementManager || 'لا أحد'}`, 'SQL System');
        }

        res.json({ success: true, message: "تم حذف الموظف وتحديث عهدته بنجاح" });

    } catch (error) {
        console.error("❌ خطأ في مسار حذف الموظف (SQL):", error);
        res.status(500).json({ success: false, message: "حدث خطأ داخلي في السيرفر أثناء الحذف." });
    }
});

// ==================== رفع بيانات المستخدمين الشاملة (Excel) ====================
// 🔥 إضافة upload.single('excelFile')
app.post('/api/upload-users', upload.single('excelFile'), (req, res) => {
    try {
        // 🛡️ استخدام req.file بدلاً من req.files
        if (!req.file) return res.json({ success: false, message: 'لم يتم العثور على الملف.' });
        
        // قراءة الملف من الـ buffer
        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

        let addedCount = 0;
        let updatedCount = 0;

        data.forEach(row => {
            // (باقي كود قراءة وتعبئة المستخدمين الخاص بك يبقى هنا كما هو بالضبط دون أي تغيير)
            const username = (row['الرقم الوظيفي'] || row['ID'] || row['username'])?.toString().trim();
            const name = row['الاسم'] || row['Name'] || row['name'];
            
            if (!username || !name) return; 

            const status = row['الحالة'] || row['Status'] || 'in Duty';
            const basicSalary = parseFloat(row['الراتب الاساسي'] || row['Basic Salary']) || 0;
            const housingAllowance = parseFloat(row['بدل السكن'] || row['Housing Allowance']) || 0;
            const otherAllowance = parseFloat(row['بدلات اخرى'] || row['Other Allowance']) || 0;
            const workingDays = parseInt(row['ايام العمل'] || row['Working Days']) || 6;
            const leaveCredit = parseFloat(row['الرصيد المستحق'] || row['Leave Credit']) || 0;
            const usedLeaves = parseFloat(row['الاجازات المستخدمة'] || row['Used Leaves']) || 0;

            const salaryE = basicSalary + housingAllowance + otherAllowance;
            let offDays = 7 - workingDays;
            if(offDays < 0) offDays = 0; if(offDays > 7) offDays = 7;
            const leaveBalance = leaveCredit - usedLeaves;

            const isActive = (status === 'in Duty');

            const userData = {
                username: username,
                name: name.toString().trim(),
                password: (row['كلمة المرور'] || row['Password'] || `Ww${username}`).toString().trim(),
                idNumber: (row['رقم الهوية'] || row['ID Number'])?.toString().trim() || '',
                idExpiry: row['انتهاء الهوية'] || '',
                nationality: row['الجنسية'] || row['Nationality'] || '',
                gender: row['الجنس'] || row['Gender'] || 'ذكر',
                dobG: row['الميلاد ميلادي'] || '',
                dobHijri: row['الميلاد هجري'] || '',
                phone: (row['رقم الجوال'] || row['Phone'])?.toString().trim() || '',
                email: row['الايميل'] || row['Email'] || '',
                city: row['المدينة'] || row['City'] || '',
                region: row['المنطقة'] || row['Region'] || '',
                splAddress: row['العنوان الوطني'] || '',
                
                joinDate: row['تاريخ الالتحاق'] || row['Join Date'] || '',
                status: status,
                isActive: isActive, 
                
                branch: row['الفرع'] || row['Branch'] || '',
                primarySection: row['القسم الرئيسي'] || '',
                jobTitle: row['المسمى الوظيفي'] || row['Job Title'] || 'موظف',
                roleArabic: row['الصلاحية'] || row['Role'] || 'موظف',
                directManager: row['المدير المباشر'] || row['Manager'] || '',
                
                workingDays: workingDays,
                offDays: offDays,
                lastWorkingDay: row['اخر يوم عمل'] || '',

                basicSalary: basicSalary,
                housingAllowance: housingAllowance,
                otherAllowance: otherAllowance,
                salaryE: salaryE,
                gosiFees: parseFloat(row['خصميات التأمينات'] || row['GOSI']) || 0,
                bankName: row['اسم البنك'] || '',
                bankIban: row['رقم الحساب'] || row['IBAN'] || '',

                leaveCredit: leaveCredit,
                usedLeaves: usedLeaves,
                leaveBalance: leaveBalance,

                medicalIns: row['شركة التأمين'] || '',
                insType: row['نوع التأمين'] || 'Company',
                insExpiry: row['انتهاء التأمين'] || '',
                baladiyahCondition: row['حالة البلدية'] || 'لا يوجد',
                baladiyahValid: row['صلاحية البلدية'] || '',
                baladiyahFees: parseFloat(row['رسوم البلدية']) || 0,

                emergencyName: row['اسم الطوارئ'] || '',
                emergencyNumber: (row['رقم الطوارئ'])?.toString().trim() || '',
                emergencyRelation: row['صلة القرابة'] || ''
            };

            const existingIndex = usersDB.findIndex(u => u.username === username);
            if (existingIndex > -1) {
                if (usersDB[existingIndex].role === 'admin' || usersDB[existingIndex].roleArabic === 'ادمن') {
                    userData.roleArabic = 'ادمن';
                    userData.role = 'admin';
                    userData.isActive = true; 
                }
                usersDB[existingIndex] = { ...usersDB[existingIndex], ...userData };
                updatedCount++;
            } else {
                userData.role = userData.roleArabic === 'ادمن' ? 'admin' : 'user';
                usersDB.push(userData);
                addedCount++;
            }
        });

        fs.writeFileSync(usersFile, JSON.stringify(usersDB, null, 2));
        res.json({ success: true, message: `تمت العملية. إضافة: ${addedCount}، تحديث: ${updatedCount}` });
    } catch (error) {
        console.error("خطأ في رفع المستخدمين:", error);
        res.json({ success: false, message: 'حدث خطأ في قراءة ملف الإكسيل.' });
    }
});

app.post('/api/upload', upload.array('files'), async (req, res) => {
    try { hrKnowledgeBase = ""; for (let file of req.files) hrKnowledgeBase += `\n${(await mammoth.extractRawText({ buffer: file.buffer })).value}\n`; res.json({ message: "تم التحديث!" }); } catch (error) { res.status(500).json({ error: "خطأ" }); }
});
// ==================== 🌟 1. جلب فريق العمل للمدير المباشر (من SQL) 🌟 ====================
app.post('/api/my-team', async (req, res) => {
    try {
        const { managerName } = req.body;
        
        // جلب الفريق من قاعدة البيانات مباشرة مع الفلترة الذكية
        const team = await prisma.employee.findMany({
            where: {
                directManager: managerName,
                isActive: true,
                status: {
                    notIn: ['Job Offer', 'Resign', 'Terminated'] // استبعاد المستقيلين والعروض
                },
                username: { not: '' },
                name: { not: '' }
            },
            orderBy: { username: 'asc' } // ترتيب بالرقم الوظيفي
        });
        
        res.json(team);
    } catch (error) {
        console.error("❌ خطأ في جلب فريق العمل من SQL:", error);
        res.status(500).json([]); // حماية الواجهة من الانهيار
    }
});

// ==================== 🌟 2. جلب فريق العمل للتحضير (من SQL) 🌟 ====================
app.post('/api/attendance-team', async (req, res) => {
    try {
        const { managerName } = req.body;
        
        // جلب الموظفين + المدير نفسه (لكي يحضر نفسه) بشرط أن يكونوا على رأس العمل
        const team = await prisma.employee.findMany({
            where: {
                OR: [
                    { directManager: managerName },
                    { name: managerName }
                ],
                isActive: true,
                status: {
                    in: ['in duty', 'In Duty', 'نشط', 'على رأس العمل', 'active'] // الحالات المسموح لها بالتحضير
                }
            },
            orderBy: { username: 'asc' } // ترتيب تصاعدي
        });

        res.json(team);
    } catch (error) {
        console.error("❌ خطأ في جلب فريق التحضير من SQL:", error);
        res.status(500).json([]);
    }
});





// ==================== تحديث بيانات المستخدم (يدعم تغيير الرقم الوظيفي) ====================
app.post('/api/user-update', (req, res) => {
    try {
        const oldUsername = req.body.oldUsername || req.body.username;
        const index = usersDB.findIndex(u => u.username === oldUsername);
        
        if (index > -1) {
            // التحقق إذا قام بتغيير الرقم الوظيفي لرقم موجود أصلاً
            if (req.body.username !== oldUsername) {
                const exists = usersDB.find(u => u.username === req.body.username);
                if (exists) return res.json({ success: false, message: 'الرقم الوظيفي الجديد مسجل مسبقاً لموظف آخر!' });
            }

            // تحديث البيانات وحذف حقل oldUsername المؤقت
            usersDB[index] = { ...usersDB[index], ...req.body };
            delete usersDB[index].oldUsername;
            
            // تحديث الفعالية بناءً على الحالة
            const status = req.body.status;
            if (status === 'Resign' || status === 'Terminated') {
                usersDB[index].isActive = false; 
            } else if (status === 'in Duty' || status === 'Job Offer') {
                usersDB[index].isActive = true;  
            }

            // حماية الإدمن
            if (usersDB[index].roleArabic === 'ادمن' || usersDB[index].role === 'admin') {
                usersDB[index].isActive = true;
            }

            fs.writeFileSync(usersFile, JSON.stringify(usersDB, null, 2));

            // تسجيل الحدث بشكل آمن بعد نجاح التعديل
            safeLogAudit(req.body.byUser, 'تعديل بيانات', `${req.body.name} (${req.body.username})`, 'تحديث ملف الموظف');

            res.json({ success: true, message: 'تم التحديث بنجاح' });
        } else {
            res.json({ success: false, message: 'المستخدم غير موجود' });
        }
    } catch (e) {
        console.error('خطأ في التحديث:', e);
        res.json({ success: false, message: 'حدث خطأ في السيرفر' });
    }
});

// ======================================================================

app.post('/api/create-announcement', (req, res) => {
    const { managerName, title, content, isAdmin } = req.body;
    let targetEmployees = isAdmin ? usersDB.filter(u => u.username !== 'admin').map(u => u.username) : usersDB.filter(u => u.directManager === managerName).map(u => u.username);
    let senderName = isAdmin ? 'الإدارة العليا' : managerName;
    announcementsDB.push({ id: Date.now().toString(), managerName: senderName, title, content, date: getRiyadhTime(), targetEmployees, readBy: [], isAdminPost: isAdmin });
    fs.writeFileSync(announcementsFile, JSON.stringify(announcementsDB, null, 2));
    res.json({ success: true });
});

app.post('/api/manager-announcements', (req, res) => {
    const { managerName } = req.body;
    const myAnnouncements = announcementsDB.filter(a => a.managerName === managerName).map(a => {
        const team = usersDB.filter(u => u.directManager === managerName);
        const safeReadBy = a.readBy || []; 
        const unreadTeam = team.filter(u => !safeReadBy.includes(u.username)).map(u => u.name);
        const readTeam = team.filter(u => safeReadBy.includes(u.username)).map(u => u.name);
        return { ...a, unreadTeam, readTeam };
    });
    myAnnouncements.sort((a, b) => parseInt(b.id) - parseInt(a.id));
    res.json(myAnnouncements);
});

app.get('/api/all-announcements', (req, res) => {
    const adminView = announcementsDB.map(a => {
        const targetUsernames = a.targetEmployees || [];
        const readUsernames = a.readBy || [];

        // جلب بيانات الموظفين المستهدفين
        const targetUsers = usersDB.filter(u => targetUsernames.includes(u.username));

        // تقسيمهم إلى من قرأ ومن لم يقرأ (بالأسماء)
        const readTeam = targetUsers.filter(u => readUsernames.includes(u.username)).map(u => u.name);
        const unreadTeam = targetUsers.filter(u => !readUsernames.includes(u.username)).map(u => u.name);

        return { 
            ...a, 
            totalTargets: targetUsernames.length, 
            readCount: readUsernames.length,
            readTeam,
            unreadTeam
        };
    });
    adminView.sort((a, b) => parseInt(b.id) - parseInt(a.id));
    res.json(adminView);
});

app.post('/api/delete-announcement', (req, res) => {
    const { id } = req.body;
    announcementsDB = announcementsDB.filter(a => a.id !== id);
    fs.writeFileSync(announcementsFile, JSON.stringify(announcementsDB, null, 2));
    res.json({ success: true });
});

app.post('/api/edit-announcement', (req, res) => {
    const { id, title, content } = req.body;
    const index = announcementsDB.findIndex(a => a.id === id);
    if(index > -1) { announcementsDB[index].title = title; announcementsDB[index].content = content; fs.writeFileSync(announcementsFile, JSON.stringify(announcementsDB, null, 2)); }
    res.json({ success: true });
});

app.post('/api/employee-announcements', (req, res) => {
    const { username } = req.body;
    const myAnnouncements = announcementsDB.filter(a => (a.targetEmployees || []).includes(username)); 
    myAnnouncements.sort((a, b) => parseInt(b.id) - parseInt(a.id));
    res.json(myAnnouncements);
});

app.post('/api/mark-announcement-read', (req, res) => {
    const { id, username } = req.body;
    const index = announcementsDB.findIndex(a => a.id === id);
    if (index > -1 && !(announcementsDB[index].readBy || []).includes(username)) {
        if(!announcementsDB[index].readBy) announcementsDB[index].readBy = [];
        announcementsDB[index].readBy.push(username);
        fs.writeFileSync(announcementsFile, JSON.stringify(announcementsDB, null, 2));
    }
    res.json({ success: true });
});

app.get('/api/reasons', (req, res) => res.json(reasonsDB));
app.post('/api/reasons', (req, res) => { reasonsDB = req.body.reasons; fs.writeFileSync(reasonsFile, JSON.stringify(reasonsDB, null, 2)); res.json({ success: true }); });
app.get('/api/forms', (req, res) => res.json(formsDB));
app.post('/api/forms', (req, res) => { formsDB = req.body.forms; fs.writeFileSync(formsFile, JSON.stringify(formsDB, null, 2)); res.json({ success: true }); });
app.get('/api/policies', (req, res) => res.json(policiesDB));
app.post('/api/policies', (req, res) => { policiesDB = req.body.policies; fs.writeFileSync(policiesFile, JSON.stringify(policiesDB, null, 2)); res.json({ success: true }); });
app.get('/api/all-requests', (req, res) => {
    try {
        // التأكد من أن قاعدة البيانات موجودة ومقروءة كـ Array
        res.json(Array.isArray(requestsDB) ? requestsDB : []);
    } catch (error) {
        console.error("Error in all-requests:", error);
        res.json([]);
    }
});

// ==================== استقبال وتوجيه الطلبات المتقدمة ====================
app.post('/api/create-advanced-ticket', (req, res) => {
    try {
        const { empUsername, empName, managerName, type, details, hrSupervisor, attachmentBase64, raisedByRole } = req.body;
        
        let attachmentPath = '';
        const ticketId = 'REQ-' + Date.now(); 

        if (attachmentBase64) {
            let ext = '.jpg';
            let rawBase64 = attachmentBase64;
            
            if(attachmentBase64.startsWith('data:application/pdf')) {
                ext = '.pdf';
                rawBase64 = attachmentBase64.replace(/^data:application\/pdf;base64,/, "");
            } else {
                rawBase64 = attachmentBase64.replace(/^data:image\/[a-z]+;base64,/, "");
            }

            const fileName = `${ticketId}${ext}`;
            fs.writeFileSync(path.join(__dirname, 'uploads', fileName), rawBase64, 'base64');
            attachmentPath = `/uploads/${fileName}`;
        } 

        const newTicket = {
            id: ticketId,
            empUsername: empUsername,
            empName: empName,
            managerName: managerName, 
            hrSupervisor: hrSupervisor,
            assignedHrEmp: '', 
            type: type,
            details: details, 
            attachment: attachmentPath,
            status: 'New', 
            raisedByRole: raisedByRole,
            createdAt: new Date().toLocaleString('ar-SA'),
            completionDate: '',
            processingTime: '',
            supervisorAssignComment: '',
            supervisorRejectComment: '',
            hrEmpComment: '',
            managerRating: '',
            managerComment: '',
            supervisorFinalRating: '',
            supervisorFinalComment: '',
            history: [
                { action: `تم رفع الطلب من قبل ${managerName}`, date: new Date().toLocaleString('ar-SA') }
            ]
        };

        requestsDB.unshift(newTicket);
        fs.writeFileSync(requestsFile, JSON.stringify(requestsDB, null, 2));

        res.json({ success: true, ticketId: ticketId });
    } catch (error) {
        console.error('خطأ في إنشاء الطلب:', error);
        res.json({ success: false, message: 'حدث خطأ في السيرفر.' });
    }
});
// =========================================================================


app.post('/api/manager-history', (req, res) => {
    const { managerName, searchQuery } = req.body;
    let history = requestsDB.filter(r => r.managerName === managerName && r.status === 'completed');
    if (searchQuery && searchQuery.trim() !== "") history = history.filter(r => r.empUsername && r.empUsername.includes(searchQuery.trim().toLowerCase()));
    history.sort((a, b) => parseInt(b.id) - parseInt(a.id));
    res.json(history.slice(0, 10));
});
// ======================================================================
// 🚀 1. مسار تصعيد الطلب (نسخة مدرعة + أشعة سينية X-Ray)
// ======================================================================
app.post('/api/escalate-ticket', async (req, res) => {
    try {
        console.log("\n================= 🚀 بدء تصعيد طلب =================");
        console.log("📥 البيانات المستلمة من الزر:", req.body);

        const { id, managerComment, byUser } = req.body;
        
        // 🛡️ درع حماية: التقاط الـ ID مهما كان اسمه، وإضافة REQ- إذا كانت مفقودة
        let safeId = String(id || req.body.ticketId || '').trim();
        if (safeId && !safeId.startsWith('REQ-')) {
            safeId = 'REQ-' + safeId;
        }

        console.log(`🔍 جاري البحث في SQL عن التذكرة: ${safeId}`);

        const ticket = await prisma.requestTicket.findFirst({ 
            where: { ticketId: safeId } 
        });
        
        if (!ticket) {
            console.log("❌ التذكرة غير موجودة في قاعدة البيانات!");
            console.log("====================================================\n");
            return res.json({ success: false, message: 'الطلب غير موجود في قاعدة البيانات' });
        }

        const history = ticket.history ? JSON.parse(ticket.history) : [];
        history.push({
            action: `تم التصعيد للموارد البشرية بواسطة ${byUser || 'المدير المباشر'}`,
            date: new Date().toLocaleString('ar-SA'),
            note: managerComment || ''
        });

        // التحديث باستخدام المفتاح الأساسي (id) لضمان سرعة ونجاح 100%
        await prisma.requestTicket.update({
            where: { id: ticket.id },
            data: {
                status: 'escalated',
                escalationComment: managerComment || '',
                history: JSON.stringify(history)
            }
        });

        if (typeof safeLogAudit === 'function') {
            safeLogAudit(byUser, 'تصعيد طلب', ticket.empName, `تصعيد الطلب رقم: ${safeId}`);
        }

        console.log("✅ تم تصعيد التذكرة بنجاح!");
        console.log("====================================================\n");
        res.json({ success: true });
    } catch (error) {
        console.error("❌ انهيار في مسار التصعيد:", error);
        res.json({ success: false, message: 'حدث خطأ في السيرفر أثناء التصعيد' });
    }
});

// ======================================================================
// ✅ 2. مسار إنجاز/حل الطلب (نسخة مدرعة + أشعة سينية X-Ray)
// ======================================================================
app.post('/api/resolve-request', async (req, res) => {
    try {
        console.log("\n================= ✅ بدء إنجاز طلب =================");
        console.log("📥 البيانات المستلمة:", req.body);

        const { id, comment, byUser, isHr } = req.body; 
        
        let safeId = String(id || req.body.ticketId || '').trim();
        if (safeId && !safeId.startsWith('REQ-')) {
            safeId = 'REQ-' + safeId;
        }

        const ticket = await prisma.requestTicket.findFirst({ 
            where: { ticketId: safeId } 
        });
        
        if (!ticket) {
            console.log("❌ التذكرة غير موجودة!");
            console.log("====================================================\n");
            return res.json({ success: false, message: 'الطلب غير موجود' });
        }

        const history = ticket.history ? JSON.parse(ticket.history) : [];
        history.push({
            action: `تم إنجاز الطلب بواسطة ${byUser || 'النظام'}`,
            date: new Date().toLocaleString('ar-SA'),
            note: comment || ''
        });

        const updateData = {
            status: 'resolved',
            resolveDate: new Date().toLocaleString('ar-SA'),
            resolvedBy: byUser || '',
            history: JSON.stringify(history)
        };

        if (isHr || isHr === 'true' || ticket.status === 'hr_assigned' || ticket.status === 'escalated') {
            updateData.hrComment = comment || '';
        } else {
            updateData.managerComment = comment || '';
        }

        await prisma.requestTicket.update({
            where: { id: ticket.id },
            data: updateData
        });

        if (typeof safeLogAudit === 'function') {
            safeLogAudit(byUser, 'إنجاز طلب', ticket.empName, `إنجاز الطلب رقم: ${safeId}`);
        }

        console.log("✅ تم إنجاز التذكرة بنجاح!");
        console.log("====================================================\n");
        res.json({ success: true });
    } catch (error) {
        console.error("❌ انهيار في مسار الإنجاز:", error);
        res.json({ success: false, message: 'حدث خطأ في السيرفر أثناء الإنجاز' });
    }
});

// ======================================================================
// ⭐ مسار تأكيد إغلاق الطلب وتقييمه من قبل الموظف المستفيد (SQL)
// ======================================================================
app.post('/api/confirm-request', async (req, res) => {
    try {
        const { id, rating, empComment } = req.body;
        
        // 🛡️ درع حماية: تأمين رقم التذكرة سواء جاء بـ REQ أو بدونها
        let safeId = String(id || '').trim();
        if (safeId && !safeId.startsWith('REQ-')) {
            safeId = 'REQ-' + safeId;
        }

        // 1. البحث عن التذكرة
        const ticket = await prisma.requestTicket.findFirst({ 
            where: { ticketId: safeId } 
        });

        if (!ticket) {
            return res.json({ success: false, message: 'الطلب غير موجود في قاعدة البيانات' });
        }

        // 2. تحديث السجل الزمني (History) لتوثيق لحظة التقييم
        const history = ticket.history ? JSON.parse(ticket.history) : [];
        history.push({
            action: `تم تأكيد الإغلاق وتقييم الحل بـ (${rating || "5"} نجوم)`,
            date: new Date().toLocaleString('ar-SA'),
            note: empComment || ''
        });

        // 3. الحفظ النهائي في SQL (الختم بالشمع الأحمر)
        await prisma.requestTicket.update({
            where: { id: ticket.id },
            data: {
                status: 'completed',
                rating: String(rating || "5"),
                empComment: empComment || "",
                history: JSON.stringify(history)
            }
        });

        res.json({ success: true });
    } catch (error) {
        console.error("❌ خطأ في مسار تأكيد إغلاق الطلب:", error);
        res.json({ success: false, message: 'حدث خطأ بالسيرفر' });
    }
});

async function getBestModel(apiKey) {
    try { const data = await (await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`)).json(); return (data.models.filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes("generateContent")).find(m => m.name.includes("flash")))?.name || "models/gemini-1.5-flash"; } catch (error) { return "models/gemini-1.5-flash"; }
}

// 🌟 مسار الذكاء الاصطناعي (المساعدة وفاء) - نسخة آمنة ونظيفة 🌟
app.post('/api/chat', async (req, res) => {
    try {
        const { history, username } = req.body;
        
        if (!history || history.length === 0) {
            return res.json({ reply: "مرحباً، كيف يمكنني مساعدتك؟" });
        }

        const currentUser = usersDB.find(u => u.username === username);
        let hiddenContext = "";

        if (currentUser && (currentUser.roleArabic.includes('مدير') || currentUser.roleArabic === 'ادمن')) {
            const myTeam = usersDB.filter(u => u.directManager === currentUser.name);
            if (myTeam.length > 0) {
                const teamInfo = myTeam.map(emp => `- ${emp.name} (الوظيفة: ${emp.jobTitle || 'موظف'})، رصيد الإجازة: ${emp.leaveBalance || 0} يوم.`).join('\n');
                hiddenContext = `\n\n[تعليمات سرية من النظام: مديري الذي يكلمك الآن هو: ${currentUser.name}. هؤلاء هم موظفو فريقه:\n${teamInfo}\nإذا طلب ترتيب إجازاتهم، قومي بجدولتها بذكاء بحيث لا تتداخل لضمان سير العمل.]`;
            }
        }

        const chatHistory = JSON.parse(JSON.stringify(history));
        const lastIndex = chatHistory.length - 1;
        chatHistory[lastIndex].parts = [{ text: chatHistory[lastIndex].parts[0].text + hiddenContext }];

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return res.json({ reply: "عذراً، المفتاح السري (API Key) غير موجود في إعدادات السيرفر." });
        }

        const bestModel = await getBestModel(apiKey); 
        
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/${bestModel}:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: chatHistory,
                systemInstruction: { parts: [{ text: getSystemInstruction() }] }
            })
        });

        const data = await response.json();

        if (!response.ok) {
            const googleError = data.error?.message || JSON.stringify(data);
            console.error("Google API Error:", googleError); 
            return res.json({ reply: "رسالة من جوجل: " + googleError });
        }

        const replyText = data.candidates[0].content.parts[0].text;
        res.json({ reply: replyText });

    } catch (error) {
        console.error("Chat Error:", error);
        res.status(500).json({ reply: "حدث خطأ غير متوقع، لكنني سأعود للعمل قريباً!" });
    }
});

// ==================== إدارة النسخ الاحتياطية الشاملة ====================
// ==================== إدارة النسخ الاحتياطية الشاملة (المحدثة 🚀) ====================
app.get('/api/backup', (req, res) => {
    try {
        const fullBackup = {
            users: usersDB,
            requests: requestsDB,
            announcements: announcementsDB,
            attendance: attendanceDB,
            reasons: reasonsDB,
            forms: formsDB,
            policies: policiesDB,
            branches: branchesDB,
            jobs: jobsDB,
            shiftsConfig: shiftsConfigDB,
            locations: locationsDB,
            // 🔥 تمت إضافة الغرف المفقودة للباك أب
            leaves: leavesDB, 
            penaltiesHistory: penaltiesHistoryDB 
        };
        
        const backupJson = JSON.stringify(fullBackup, null, 2);
        res.setHeader('Content-disposition', `attachment; filename=Wafa_Backup_${new Date().toISOString().split('T')[0]}.json`);
        res.setHeader('Content-type', 'application/json');
        res.send(backupJson);
    } catch (e) {
        console.error('خطأ في أخذ النسخة:', e);
        res.status(500).send('حدث خطأ أثناء استخراج النسخة الاحتياطية.');
    }
});

// 🔥 مسار الاستعادة المحدث (ليستقبل الإجازات والعقوبات)
app.post('/api/restore-backup', upload.single('backupFile'), (req, res) => {
    try {
        if (!req.file) return res.json({ success: false, message: 'لم يتم إرفاق ملف!' });

        const backupData = JSON.parse(req.file.buffer.toString('utf8'));

        if (backupData.users) { usersDB = backupData.users; fs.writeFileSync(usersFile, JSON.stringify(usersDB, null, 2)); }
        if (backupData.requests) { requestsDB = backupData.requests; fs.writeFileSync(requestsFile, JSON.stringify(requestsDB, null, 2)); }
        if (backupData.announcements) { announcementsDB = backupData.announcements; fs.writeFileSync(announcementsFile, JSON.stringify(announcementsDB, null, 2)); }
        if (backupData.attendance) { attendanceDB = backupData.attendance; fs.writeFileSync(attendanceFile, JSON.stringify(attendanceDB, null, 2)); }
        
        // 🔥 تمت إضافة أنابيب الاستقبال الجديدة
        if (backupData.leaves) { leavesDB = backupData.leaves; fs.writeFileSync(leavesFile, JSON.stringify(leavesDB, null, 2)); }
        if (backupData.penaltiesHistory) { penaltiesHistoryDB = backupData.penaltiesHistory; fs.writeFileSync(penaltiesHistoryFile, JSON.stringify(penaltiesHistoryDB, null, 2)); }

        // باقي الجداول...
        if (backupData.reasons) { reasonsDB = backupData.reasons; fs.writeFileSync(reasonsFile, JSON.stringify(reasonsDB, null, 2)); }
        if (backupData.forms) { formsDB = backupData.forms; fs.writeFileSync(formsFile, JSON.stringify(formsDB, null, 2)); }
        if (backupData.policies) { policiesDB = backupData.policies; fs.writeFileSync(policiesFile, JSON.stringify(policiesDB, null, 2)); }
        if (backupData.branches) { branchesDB = backupData.branches; fs.writeFileSync(branchesFile, JSON.stringify(branchesDB, null, 2)); }
        if (backupData.jobs) { jobsDB = backupData.jobs; fs.writeFileSync(jobsFile, JSON.stringify(jobsDB, null, 2)); }
        if (backupData.shiftsConfig) { shiftsConfigDB = backupData.shiftsConfig; fs.writeFileSync(shiftsConfigFile, JSON.stringify(shiftsConfigDB, null, 2)); }
        if (backupData.locations) { locationsDB = backupData.locations; fs.writeFileSync(locationsFile, JSON.stringify(locationsDB, null, 2)); }

        res.json({ success: true, message: 'تمت استعادة النسخة (مع الإجازات والعقوبات) بنجاح!' });
    } catch (e) {
        console.error('خطأ في الاستعادة:', e);
        res.json({ success: false, message: 'ملف النسخة الاحتياطية تالف أو غير مدعوم.' });
    }
});
app.get('/api/shifts-config', (req, res) => res.json(shiftsConfigDB));

app.post('/api/shifts-config', (req, res) => {
    shiftsConfigDB = req.body.shiftsConfig;
    fs.writeFileSync(shiftsConfigFile, JSON.stringify(shiftsConfigDB, null, 2));
    res.json({ success: true });
});

app.post('/api/assign-shift', (req, res) => {
    const { empUsername, mainShift, period } = req.body;
    let userIndex = usersDB.findIndex(u => u.username === empUsername);
    if (userIndex > -1) {
        usersDB[userIndex].currentMainShift = mainShift;
        usersDB[userIndex].currentPeriod = period;
        fs.writeFileSync(usersFile, JSON.stringify(usersDB, null, 2));
        res.json({ success: true });
    } else {
        res.json({ success: false });
    }
});

app.post('/api/my-shifts', (req, res) => {
    const user = usersDB.find(u => u.username === req.body.username);
    if (user) {
        res.json({ mainShift: user.currentMainShift, period: user.currentPeriod });
    } else {
        res.json({});
    }
});

app.get('/api/branches', (req, res) => res.json(branchesDB));
app.post('/api/branches', (req, res) => { branchesDB = req.body.branches; fs.writeFileSync(branchesFile, JSON.stringify(branchesDB, null, 2)); res.json({success: true}); });

app.get('/api/jobs', (req, res) => res.json(jobsDB));
app.post('/api/jobs', (req, res) => { jobsDB = req.body.jobs; fs.writeFileSync(jobsFile, JSON.stringify(jobsDB, null, 2)); res.json({success: true}); });

app.post('/api/update-leave-balances', (req, res) => {
    try {
        const { balancesData } = req.body; 
        let updatedCount = 0;
        
        balancesData.forEach(row => {
            let user = usersDB.find(u => u.username === row.username.toString().trim());
            if (user && row.leaveBalance !== undefined) {
                user.leaveBalance = row.leaveBalance.toString().trim();
                updatedCount++;
            }
        });
        
        fs.writeFileSync(usersFile, JSON.stringify(usersDB, null, 2));
        res.json({ success: true, count: updatedCount });
    } catch (error) {
        console.error("خطأ في تحديث الأرصدة:", error);
        res.json({ success: false, message: "حدث خطأ أثناء معالجة البيانات." });
    }
});

app.post('/api/bulk-deactivate', (req, res) => {
    let count = 0;
    usersDB.forEach(u => {
        if (u.roleArabic !== 'ادمن' && u.roleArabic !== 'مدير فرع') {
            if (u.isActive !== false) {
                u.isActive = false;
                count++;
            }
        }
    });
    fs.writeFileSync(usersFile, JSON.stringify(usersDB, null, 2));
    res.json({ success: true, count });
});

app.post('/api/bulk-activate', (req, res) => {
    let count = 0;
    usersDB.forEach(u => {
        if (u.isActive === false) {
            u.isActive = true;
            count++;
        }
    });
    fs.writeFileSync(usersFile, JSON.stringify(usersDB, null, 2));
    res.json({ success: true, count });
});

app.post('/api/bulk-reset-passwords', (req, res) => {
    let count = 0;
    usersDB.forEach(u => {
        if (u.idNumber && u.idNumber.length >= 6) {
            const last6 = u.idNumber.slice(-6);
            u.password = 'Wafa' + last6;
            count++;
        }
    });
    fs.writeFileSync(usersFile, JSON.stringify(usersDB, null, 2));
    res.json({ success: true, count });
});

app.post('/api/reset-single-password', (req, res) => {
    const { username } = req.body;
    let user = usersDB.find(u => u.username === username.toString());

    if (!user) {
        return res.json({ success: false, message: 'الموظف غير موجود' });
    }

    if (!user.idNumber || user.idNumber.length < 6) {
        return res.json({ success: false, message: 'عذراً، لا يوجد رقم هوية مسجل لهذا الموظف، أو الرقم قصير جداً.' });
    }

    const last6 = user.idNumber.slice(-6);
    user.password = 'Ww' + last6;

    fs.writeFileSync(usersFile, JSON.stringify(usersDB, null, 2));
    res.json({ success: true, message: `تم تهيئة كلمة مرور الموظف (${user.name}) بنجاح!\nكلمة المرور الجديدة هي: Ww${last6}` });
});

const attendanceFile = path.join(__dirname, 'data', 'attendance.json');
let attendanceDB = [];
if (fs.existsSync(attendanceFile)) {
    attendanceDB = JSON.parse(fs.readFileSync(attendanceFile));
} else {
    fs.writeFileSync(attendanceFile, JSON.stringify([]));
}

const attendanceCodesFile = path.join(__dirname, 'data', 'attendance_codes.json');
let attendanceCodesDB = [
    { code: 'D', label: 'حاضر (In Duty)' },
    { code: 'A', label: 'غياب (Absent)' },
    { code: 'T', label: 'مؤقت حتى يبت فيه (Temporary)' },
    { code: 'SL', label: 'إجازة مرضية (Sick Leave)' },
    { code: 'V', label: 'أجازة (Vacation)' },
    { code: 'Off', label: 'يوم راحة (Off Day)' },
    { code: 'CP', label: 'تعويض راحة (Compensate)' },
    { code: 'E', label: 'أعياد ومناسبات (Eid/National)' },
    { code: 'LOP', label: 'بلا أجر (Lost of pay)' },
    { code: 'R', label: 'ترك العمل (Resign)' }
];

fs.writeFileSync(attendanceCodesFile, JSON.stringify(attendanceCodesDB, null, 2));

app.get('/api/attendance-codes', (req, res) => res.json(attendanceCodesDB));










// ======================================================================
// 📊 مسار استقبال ملف إكسيل التحضير التاريخي (SQL Version)
// ======================================================================
app.post('/api/upload-historical-attendance', async (req, res) => {
    try {
        const { historicalData } = req.body;

        if (!historicalData || !Array.isArray(historicalData) || historicalData.length === 0) {
            return res.json({ success: false, message: 'البيانات المرسلة فارغة أو غير صالحة.' });
        }

        let added = 0;
        let updated = 0;

        // 💡 1. الذكاء الاصطناعي للأداء: جلب هويات الموظفين بضربة واحدة بدلاً من البحث الفردي
        const usernames = [...new Set(historicalData.map(d => String(d.username)))];
        
        const employees = await prisma.employee.findMany({
            where: { username: { in: usernames } },
            select: { id: true, username: true } // نحتاج فقط الآي دي والرقم الوظيفي
        });

        // تحويل الموظفين إلى خريطة (Map) لسرعة الوصول (O(1))
        const empMap = {};
        employees.forEach(emp => {
            empMap[emp.username] = emp.id;
        });

        // 💡 2. معالجة الإكسيل وإدخاله لـ SQL
        // 💡 2. معالجة الإكسيل وإدخاله لـ SQL
        for (const record of historicalData) {
            const empId = empMap[String(record.username)];
            
            // إذا كان الموظف غير موجود نتخطاه
            if (!empId) continue; 

            // ⚡ السحر هنا: تحويل التاريخ النصي إلى صيغة ISO-8601 التي يعشقها Prisma
            // دمج T00:00:00.000Z يمنع السيرفر من تغيير اليوم بسبب فروقات التوقيت
            const isoDate = new Date(`${record.date}T00:00:00.000Z`);

            // البحث: هل لهذا الموظف تحضير مسبق في نفس هذا اليوم؟
            const existingRecord = await prisma.attendance.findFirst({
                where: {
                    employeeId: empId,
                    date: isoDate // 👈 استخدمنا التاريخ المدرع هنا
                }
            });

            if (existingRecord) {
                // تحديث السجل الموجود
                await prisma.attendance.update({
                    where: { id: existingRecord.id },
                    data: { 
                        code: record.code,
                        note: 'مرفوع آلياً من الإكسيل (تحديث)'
                    }
                });
                updated++;
            } else {
                // إنشاء سجل جديد
                await prisma.attendance.create({
                    data: {
                        employeeId: empId,
                        date: isoDate, // 👈 واستخدمناه هنا للإنشاء
                        code: record.code,
                        note: 'مرفوع آلياً من الإكسيل',
                        timestamp: new Date()
                    }
                });
                added++;
            }
        }

        // 🛡️ توثيق أمني للعملية
        if (typeof safeLogAudit === 'function') {
            safeLogAudit('مدير النظام', 'رفع إكسيل تحضير', `تم إضافة ${added} وتحديث ${updated} سجل`, 'SQL Database');
        }

        res.json({ success: true, added, updated });

    } catch (error) {
        console.error('❌ خطأ فادح أثناء رفع الإكسيل التاريخي للـ SQL:', error);
        res.status(500).json({ success: false, message: 'حدث خطأ داخلي في السيرفر أثناء الكتابة في SQL.' });
    }
});
// ======================================================================
// 🌟 6. مسار جلب أرشيف التحضير بالكامل (SQL)
// ======================================================================
app.get('/api/all-attendance', async (req, res) => {
    try {
        const records = await prisma.attendance.findMany({
            include: { 
                employee: { select: { username: true, name: true } } // جلب اسم الموظف ورقمه
            },
            orderBy: { date: 'desc' } // ترتيب من الأحدث للأقدم
        });

        // إعادة تشكيل البيانات لتطابق ما تتوقعه الواجهة الأمامية
        const formattedRecords = records.map(r => ({
            date: fromPrismaDate(r.date), // نستخدم المترجم الذي صنعناه سابقاً
            username: r.employee.username,
            name: r.employee.name,
            code: r.code,
            managerName: r.note || '', 
            timestamp: r.timestamp
        }));

        res.json(formattedRecords);
    } catch (error) {
        console.error("❌ خطأ في جلب كل التحضيرات:", error);
        res.json([]); // حماية الواجهة من الانهيار
    }
});



// ======================================================================
// 💣 محرك التنظيف الشامل (Super Cleanup) - نسخة SQL
// ======================================================================
app.post('/api/super-cleanup', async (req, res) => {
    // افترض أن كلمة السر مخزنة في متغير بيئة أو ثابت لديك
    const SUPER_SECRET_PASSWORD = process.env.SUPER_SECRET_PASSWORD || '12345'; // تأكد من تغييرها 
    
    const { password, targets } = req.body;

    if (password !== SUPER_SECRET_PASSWORD) {
        return res.json({ success: false, message: "كلمة المرور السرية غير صحيحة ❌!" });
    }

    try {
        // 🔥 مسح الجداول المختارة باستخدام أوامر Prisma
        if (targets.leaves) {
            await prisma.leave.deleteMany({});
            console.log("تم مسح جدول الإجازات.");
        }
        
        if (targets.attendance) {
            await prisma.attendance.deleteMany({});
            console.log("تم مسح جدول التحضير.");
        }
        
        if (targets.penalties) {
            await prisma.penalty.deleteMany({});
            console.log("تم مسح جدول الجزاءات والمخالفات.");
        }
        
        if (targets.requests) {
            await prisma.requestTicket.deleteMany({});
            console.log("تم مسح جدول الطلبات.");
        }
        
        if (targets.announcements) {
            await prisma.announcement.deleteMany({});
            console.log("تم مسح جدول التعميمات.");
        }

        if (targets.users) {
            // حماية الآدمن من الحذف: احذف كل الموظفين حيث الـ username لا يساوي 'admin'
            await prisma.employee.deleteMany({
                where: {
                    username: { not: 'admin' }
                }
            });
            console.log("تم مسح جدول الموظفين (باقي الآدمن فقط).");
        }

        res.json({ success: true, message: "تم تنفيذ عملية التنظيف بنجاح! 🧹" });
    } catch (error) {
        console.error("❌ خطأ في التنظيف العميق (SQL):", error);
        res.json({ success: false, message: "حدث خطأ داخلي أثناء مسح بيانات قاعدة البيانات." });
    }
});



let locationsDB = [];
const locationsFile = path.join(__dirname, 'data', 'locations.json');
if (fs.existsSync(locationsFile)) {
    locationsDB = JSON.parse(fs.readFileSync(locationsFile));
} else {
    fs.writeFileSync(locationsFile, '[]');
}

app.get('/api/locations', (req, res) => {
    res.json(locationsDB);
});

app.post('/api/locations', (req, res) => {
    try {
        locationsDB = req.body.locations;
        fs.writeFileSync(locationsFile, JSON.stringify(locationsDB, null, 2));
        res.json({ success: true });
    } catch (e) {
        res.json({ success: false });
    }
});

// ======================================================================
// 🚀 مسار تصعيد الطلب للموارد البشرية (SQL)
// ======================================================================







// ======================================================================
// 🎫 3. مسار إرسال طلب / تذكرة جديدة (SQL + دعم المرفقات ونماذج المدراء)
// ======================================================================
app.post('/api/create-request', async (req, res) => {
    try {
        const { senderUsername, empUsername, empName, empPhone, managerName, reason, details, targetEmp, isManagerForm, hrSupervisor, attachmentBase64, byUser } = req.body;        
        const actualActor = byUser || empName;

        let initialStatus = 'pending';
        let finalManagerName = managerName;
        let finalEmpUsername = empUsername;
        let finalEmpName = empName;
        let senderId = senderUsername || empUsername;
        const ticketId = 'REQ-' + Date.now(); 

        // 1. 📎 معالجة المرفقات (كما صممتها أنت تماماً)
        let attachmentPath = '';
        if (attachmentBase64) {
            let ext = '.jpg';
            let rawBase64 = attachmentBase64;
            if(attachmentBase64.startsWith('data:application/pdf')) { 
                ext = '.pdf'; 
                rawBase64 = attachmentBase64.replace(/^data:application\/pdf;base64,/, ""); 
            } 
            else { 
                rawBase64 = attachmentBase64.replace(/^data:image\/[a-zA-Z0-9]+;base64,/, ""); 
            }
            const fileName = `ATT-${ticketId}${ext}`;
            
            if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
            fs.writeFileSync(path.join(uploadsDir, fileName), rawBase64, 'base64');
            attachmentPath = `/uploads/${fileName}`;
        } 

        // 2. 👨‍💼 معالجة نماذج المدراء (إذا كان المدير يرفع طلب لموظف)
        if (isManagerForm) {
            initialStatus = 'escalated'; 
            finalManagerName = empName;
            senderId = senderUsername;
            
            if (targetEmp) {
                finalEmpUsername = targetEmp;
                // جلب اسم الموظف المستهدف من SQL بدلاً من usersDB
                const tUser = await prisma.employee.findUnique({ where: { username: String(targetEmp).trim() } });
                if (tUser) finalEmpName = tUser.name;
            }
        }

        // 3. 🔍 جلب الـ ID الخاص بصاحب الطلب لربطه في SQL
        const targetEmployeeRecord = await prisma.employee.findUnique({
            where: { username: String(finalEmpUsername).trim() }
        });

        if (!targetEmployeeRecord) {
             return res.json({ success: false, message: 'الموظف المعني غير موجود في قاعدة البيانات' });
        }

        // 4. 💾 الحفظ الشامل في قاعدة بيانات SQL
        await prisma.requestTicket.create({
            data: {
                ticketId: ticketId,
                employeeId: targetEmployeeRecord.id,
                empUsername: finalEmpUsername,
                empName: finalEmpName,
                senderId: senderId,
                empPhone: empPhone || '',
                managerName: finalManagerName || '',
                hrSupervisor: isManagerForm ? (hrSupervisor || '') : '',
                type: reason || '',
                details: details || '',
                attachment: attachmentPath,
                status: initialStatus,
                createdAt: new Date().toLocaleString('ar-SA'),
                history: JSON.stringify([{ 
                    action: isManagerForm ? `رفع إداري بواسطة ${actualActor}` : `تم الرفع بواسطة ${actualActor}`, 
                    date: new Date().toLocaleString('ar-SA') 
                }])
            }
        });

        // 5. 🚨 زراعة الحدث في سجل الرقابة
        if (typeof safeLogAudit === 'function') {
            safeLogAudit(actualActor, 'رفع طلب', finalEmpName, `نوع الطلب: ${reason}`);
        }

        res.json({ success: true, ticketId: ticketId });
    } catch (error) { 
        console.error("❌ CRITICAL ERROR IN CREATE REQUEST (SQL):", error);
        res.json({ success: false, message: 'خطأ بالسيرفر: ' + error.message }); 
    }
});

// ======================================================================
// 🎫 4. مسار عمليات الموارد ومتابعة الطلبات (مضاد لفيروس الـ Null 🛡️)
// ======================================================================
app.post('/api/hr-requests', async (req, res) => {
    try {
        const username = req.body.username || req.body.empUsername || '';
        const safeUser = String(username).trim();
        const isAdmin = req.body.isAdmin === true || String(req.body.isAdmin) === 'true'; 
        const role = req.body.role;

        const allRequests = await prisma.requestTicket.findMany({
            orderBy: { id: 'desc' }
        });

        const filteredRequests = allRequests.filter(r => {
            const assignedHr = r.assignedHrEmp ? String(r.assignedHrEmp).trim() : '';
            if (assignedHr === safeUser && safeUser !== '') return true;

            const safeStatus = r.status || '';
            const isGeneralHR = safeStatus === 'escalated' || 
                                safeStatus.startsWith('hr_') || 
                                r.escalationComment || 
                                r.hrComment || 
                                (r.hrSupervisor && r.hrSupervisor !== '');

            if (isGeneralHR) {
                if (isAdmin || role === 'موظف ادارة') return true;
                const hrSuper = r.hrSupervisor ? String(r.hrSupervisor).trim() : '';
                return hrSuper === safeUser;
            }
            return false;
        });

        // 🛡️ درع التطهير: مسح أي Null وتحويله لنص فارغ لحماية الواجهة الأمامية
        const formattedRequests = filteredRequests.map(r => ({
            id: r.ticketId,                   // رقم التذكرة REQ
            employeeId: r.employeeId,
            empUsername: r.empUsername || '',
            empName: r.empName || '',
            senderId: r.senderId || '',
            empPhone: r.empPhone || '',
            managerName: r.managerName || '',
            hrSupervisor: r.hrSupervisor || '',
            assignedHrEmp: r.assignedHrEmp || '',
            reason: r.type || '',             // ترجمة النوع
            type: r.type || '',               // إرسالها بالاسمين للاحتياط
            details: r.details || '',
            attachment: r.attachment || '',
            status: r.status || 'pending',
            date: r.createdAt || '',          // ترجمة التاريخ
            createdAt: r.createdAt || '',     // إرسالها بالاسمين للاحتياط
            resolveDate: r.resolveDate || '',
            duration: r.duration || '',
            managerComment: r.managerComment || '',
            hrComment: r.hrComment || '',
            supervisorAssignComment: r.supervisorAssignComment || '',
            supervisorRejectComment: r.supervisorRejectComment || '',
            escalationComment: r.escalationComment || '',
            empComment: r.empComment || '',
            rating: r.rating || '',
            resolvedBy: r.resolvedBy || '',
            history: r.history ? JSON.parse(r.history) : []
        }));

        res.json(formattedRequests);

    } catch (error) {
        console.error("❌ خطأ في مسار hr-requests:", error);
        res.json([]); 
    }
});


// ======================================================================
// 🎫 1. مسار جلب طلبات الموظف الخاصة (SQL مع ترجمة المسميات)
// ======================================================================
app.post('/api/my-requests', async (req, res) => {
    try {
        const { username } = req.body;
        const requests = await prisma.requestTicket.findMany({
            where: { empUsername: String(username).trim() },
            orderBy: { id: 'desc' } 
        });
        
        const formattedRequests = requests.map(r => ({
            ...r,
            id: r.ticketId,       // الواجهة تتوقع id كنص مثل REQ-123
            date: r.createdAt,    // 🌟 ترجمة createdAt إلى date للواجهة
            reason: r.type,       // 🌟 ترجمة type إلى reason للواجهة
            history: r.history ? JSON.parse(r.history) : []
        }));

        res.json(formattedRequests);
    } catch (error) {
        console.error("❌ خطأ في جلب طلباتي:", error);
        res.json([]);
    }
});

// ======================================================================
// 🎫 2. مسار جلب الطلبات للمدير المباشر (SQL مع ترجمة المسميات)
// ======================================================================
app.post('/api/manager-requests', async (req, res) => {
    try {
        const { managerName } = req.body;
        const requests = await prisma.requestTicket.findMany({
            where: { managerName: managerName },
            orderBy: { id: 'desc' }
        });

        const formattedRequests = requests.map(r => ({
            ...r,
            id: r.ticketId, 
            date: r.createdAt,
            reason: r.type,
            history: r.history ? JSON.parse(r.history) : []
        }));

        res.json(formattedRequests);
    } catch (error) {
        console.error("❌ خطأ في جلب طلبات المدير:", error);
        res.json([]);
    }
});

// ======================================================================
// 👨‍💼 1. مسار تعيين الطلب لموظف موارد بشرية محدد (SQL)
// ======================================================================
app.post('/api/hr-assign', async (req, res) => {
    try {
        const { ticketId, assignedTo, comment, byUser } = req.body;
        
        // 🛡️ درع الحماية لرقم التذكرة
        let safeId = String(ticketId).trim();
        if (safeId && !safeId.startsWith('REQ-')) safeId = 'REQ-' + safeId;

        const ticket = await prisma.requestTicket.findFirst({ where: { ticketId: safeId } });
        if (!ticket) return res.json({ success: false, message: 'الطلب غير موجود في قاعدة البيانات' });

        const history = ticket.history ? JSON.parse(ticket.history) : [];
        history.push({ 
            action: `تم تعيين الطلب لـ (${assignedTo}) بواسطة المشرف ${byUser}`, 
            date: new Date().toLocaleString('ar-SA') 
        });

        await prisma.requestTicket.update({
            where: { id: ticket.id },
            data: {
                assignedHrEmp: assignedTo || '',
                status: 'hr_assigned', 
                supervisorAssignComment: comment || '',
                history: JSON.stringify(history)
            }
        });

        res.json({ success: true });
    } catch (error) {
        console.error("❌ خطأ في مسار hr-assign:", error);
        res.json({ success: false, message: 'حدث خطأ بالسيرفر' });
    }
});

// ======================================================================
// ❌ 2. مسار رفض الطلب وإعادته (SQL)
// ======================================================================
app.post('/api/hr-reject', async (req, res) => {
    try {
        const { ticketId, comment, byUser } = req.body;
        
        let safeId = String(ticketId).trim();
        if (safeId && !safeId.startsWith('REQ-')) safeId = 'REQ-' + safeId;

        const ticket = await prisma.requestTicket.findFirst({ where: { ticketId: safeId } });
        if (!ticket) return res.json({ success: false, message: 'الطلب غير موجود' });

        const history = ticket.history ? JSON.parse(ticket.history) : [];
        history.push({ 
            action: `تم رفض الإحالة من قبل المشرف ${byUser}`, 
            date: new Date().toLocaleString('ar-SA') 
        });

        await prisma.requestTicket.update({
            where: { id: ticket.id },
            data: {
                status: 'resolved', 
                supervisorRejectComment: comment || '',
                managerComment: `(مرفوض من الموارد البشرية): ${comment || ''}`, 
                history: JSON.stringify(history)
            }
        });

        res.json({ success: true });
    } catch (error) {
        console.error("❌ خطأ في مسار hr-reject:", error);
        res.json({ success: false, message: 'حدث خطأ بالسيرفر' });
    }
});

// ======================================================================
// ✅ 3. مسار إنجاز الطلب والرد النهائي من الموارد (SQL)
// ======================================================================
app.post('/api/hr-resolve', async (req, res) => {
    try {
        const { ticketId, comment, byUser } = req.body;

        let safeId = String(ticketId).trim();
        if (safeId && !safeId.startsWith('REQ-')) safeId = 'REQ-' + safeId;

        const ticket = await prisma.requestTicket.findFirst({ where: { ticketId: safeId } });
        if (!ticket) return res.json({ success: false, message: 'الطلب غير موجود' });

        const history = ticket.history ? JSON.parse(ticket.history) : [];
        history.push({
            action: `تم إنجاز الطلب من الموارد البشرية بواسطة: ${byUser}`,
            comment: comment || "", // إضافة التعليق بداخل الهيستوري كما كان في كودك
            date: new Date().toLocaleString('ar-SA')
        });

        await prisma.requestTicket.update({
            where: { id: ticket.id },
            data: {
                status: 'resolved', 
                hrComment: comment || '',
                resolvedBy: byUser || '',
                resolveDate: new Date().toLocaleString('ar-SA'),
                history: JSON.stringify(history)
            }
        });

        // الرقابة (اختياري، إذا كنت تستخدم دالة Audit)
        if (typeof safeLogAudit === 'function') {
            safeLogAudit(byUser, 'إنجاز طلب', ticket.empName, `إنجاز (موارد) للطلب رقم: ${safeId}`);
        }

        res.json({ success: true });
    } catch (error) {
        console.error("❌ خطأ في مسار hr-resolve:", error);
        res.json({ success: false, message: 'حدث خطأ بالسيرفر' });
    }
});






// ==================== نظام إدارة الإجازات والربط الآلي بالتحضير ====================
// ======================================================================
// 🌴 1. مسار جلب كل الإجازات (SQL)
// ======================================================================
app.get('/api/leaves', async (req, res) => {
    try {
        const leaves = await prisma.leave.findMany({
            include: { 
                employee: { select: { username: true, name: true } } // جلب بيانات الموظف
            },
            orderBy: { id: 'desc' } // الأحدث أولاً
        });

        // تشكيل البيانات لتناسب الواجهة الأمامية
        const formattedLeaves = leaves.map(l => ({
            id: l.id.toString(), // الواجهة تتوقع ID كنص
            username: l.employee.username,
            name: l.employee.name,
            type: l.type,
            startDate: fromPrismaDate(l.startDate),
            duration: l.duration,
            endDate: fromPrismaDate(l.endDate),
            returnDate: fromPrismaDate(l.returnDate),
            entryDate: fromPrismaDate(l.enteryDate)
        }));

        res.json(formattedLeaves);
    } catch (error) {
        console.error("❌ خطأ في جلب الإجازات من SQL:", error);
        res.json([]);
    }
});

// ======================================================================
// 🌴 2. مسار إدخال إجازة جديدة (SQL + تحديث التحضير آلياً)
// ======================================================================
app.post('/api/leaves', async (req, res) => {
    try {
        const leaveData = req.body;
        
        // 1. البحث عن الموظف
        const emp = await prisma.employee.findUnique({ 
            where: { username: String(leaveData.username).trim() } 
        });
        
        if (!emp) return res.json({ success: false, message: 'الموظف غير موجود في قاعدة البيانات' });

        // 2. إنشاء سجل الإجازة في SQL
        const newLeave = await prisma.leave.create({
            data: {
                employeeId: emp.id,
                type: leaveData.type,
                startDate: toPrismaDate(leaveData.startDate),
                duration: parseInt(leaveData.duration),
                endDate: toPrismaDate(leaveData.endDate),
                returnDate: toPrismaDate(leaveData.returnDate),
                enteryDate: toPrismaDate(new Date().toISOString())
            }
        });

        // 3. السحر الآلي: انعكاس الإجازة على أيام التحضير (تغييرها إلى V)
        let start = new Date(leaveData.startDate);
        let systemLabel = `إجازة (${leaveData.type}) مدخلة بالنظام`;

        for (let i = 0; i < parseInt(leaveData.duration); i++) {
            let currentDate = new Date(start);
            currentDate.setDate(currentDate.getDate() + i);
            let prismaDate = toPrismaDate(currentDate.toISOString()); // المترجم الذكي

            // نبحث بالطريقة الآمنة (بدون Upsert) لنتجنب مشاكل Railway
            const existingRecord = await prisma.attendance.findFirst({
                where: { date: prismaDate, employeeId: emp.id }
            });

            if (existingRecord) {
                await prisma.attendance.update({
                    where: { id: existingRecord.id },
                    data: { code: 'V', note: systemLabel, timestamp: new Date().toISOString() }
                });
            } else {
                await prisma.attendance.create({
                    data: { employeeId: emp.id, date: prismaDate, code: 'V', note: systemLabel, timestamp: new Date().toISOString() }
                });
            }
        }

        // 4. توثيق الرقابة
        if (typeof safeLogAudit === 'function') {
            safeLogAudit(leaveData.byUser, 'إدخال إجازة', leaveData.username, `نوع الإجازة: ${leaveData.type} لمدة ${leaveData.duration} يوم`);
        }

        res.json({ success: true });
    } catch (error) {
        console.error("❌ خطأ في حفظ الإجازة:", error);
        res.json({ success: false, message: 'حدث خطأ في السيرفر أثناء تسجيل الإجازة' });
    }
});

app.post('/api/leaves-bulk', (req, res) => {
    try {
        const leavesArray = req.body.leaves;
        leavesArray.forEach(leaveData => {
            leaveData.id = Date.now().toString() + Math.floor(Math.random() * 1000);
            leaveData.entryDate = new Date().toISOString().split('T')[0];
            const user = usersDB.find(u => u.username === leaveData.username);
            
            if(user) {
                leaveData.name = user.name;
                leavesDB.push(leaveData);
                
                let start = new Date(leaveData.startDate);
                let systemLabel = `إجازة (${leaveData.type}) مدخلة بالنظام`;
                let currentTime = new Date().toISOString();

                for(let i = 0; i < parseInt(leaveData.duration); i++) {
                    let currentDate = new Date(start);
                    currentDate.setDate(currentDate.getDate() + i);
                    let dateStr = currentDate.toISOString().split('T')[0];
                    let attIndex = attendanceDB.findIndex(a => a.date === dateStr && a.username === leaveData.username);
                    
                    if(attIndex !== -1) {
                        attendanceDB[attIndex].code = 'V';
                        attendanceDB[attIndex].managerName = systemLabel;
                        attendanceDB[attIndex].timestamp = currentTime;
                    } else {
                        attendanceDB.push({ 
                            date: dateStr, 
                            username: user.username, 
                            name: user.name, 
                            branch: user.branch || '', 
                            code: 'V',
                            managerName: systemLabel,
                            timestamp: currentTime
                        });
                    }
                }
            }
        });
        fs.writeFileSync(leavesFile, JSON.stringify(leavesDB, null, 2));
        fs.writeFileSync(attendanceFile, JSON.stringify(attendanceDB, null, 2));
        res.json({ success: true });
    } catch (error) {
        res.json({ success: false });
    }
});
// ==================== محرك الحساب الديناميكي لأرصدة الإجازات (حسب نظام العمل السعودي) ====================
app.post('/api/recalculate-leaves', (req, res) => {
    try {
        let updatedCount = 0;
        const now = new Date();

        usersDB.forEach(user => {
            // نتخطى من ليس لديه تاريخ التحاق
            if (!user.joinDate) return;

            const joinDate = new Date(user.joinDate);
            let endDate = now;

            // تحديد تاريخ النهاية بناءً على حالة الموظف
            if (user.status === 'Resign' || user.status === 'Terminated') {
                if (!user.lastWorkingDay) return; // نتخطى المستقيل الذي ليس له آخر يوم عمل
                endDate = new Date(user.lastWorkingDay);
            } else if (user.status !== 'in Duty') {
                return; // نتخطى حالات العرض الوظيفي وغيرها
            }

            // حساب إجمالي أيام العمل
            const diffTime = endDate - joinDate;
            const workedDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
            
            if (workedDays < 0) return; // حماية ضد التواريخ العكسية

            // حساب الرصيد المستحق (leaveCredit)
            let credit = 0;
            if (workedDays <= 1825) {
                // أول 5 سنوات (21 يوم في السنة)
                credit = (workedDays / 365) * 21;
            } else {
                // ما بعد 5 سنوات (30 يوم في السنة)
                const first5YearsCredit = (1825 / 365) * 21; // يساوي 105 أيام
                const remainingDays = workedDays - 1825;
                credit = first5YearsCredit + ((remainingDays / 365) * 30);
            }

            // حساب الإجازات المستخدمة من قاعدة بيانات الإجازات الفعالة
            const myLeaves = leavesDB.filter(l => l.username === user.username);
            const used = myLeaves.reduce((sum, leave) => sum + parseInt(leave.duration || 0), 0);

            // تحديث بيانات الموظف (مع التقريب لـ 3 خانات عشرية للدقة)
            user.leaveCredit = parseFloat(credit.toFixed(3));
            user.usedLeaves = used;
            user.leaveBalance = parseFloat((credit - used).toFixed(3));

            updatedCount++;
        });

        // حفظ التعديلات في قاعدة البيانات
        fs.writeFileSync(usersFile, JSON.stringify(usersDB, null, 2));

        // تسجيل العملية في الرقابة
        safeLogAudit(req.body.byUser, 'تحديث شامل للأرصدة', 'جميع الموظفين', `تمت إعادة حساب الأرصدة لـ ${updatedCount} موظف`);

        res.json({ success: true, count: updatedCount });
    } catch (error) {
        console.error("Error calculating leaves:", error);
        res.json({ success: false, message: "حدث خطأ أثناء عملية الحساب." });
    }
});
// ======================================================================
// ======================================================================
// 🗑️ 3. مسار حذف الإجازة (SQL) - مع التراجع الآلي عن التحضير والرصيد
// ======================================================================
app.post('/api/leave-delete', async (req, res) => {
    try {
        const { id, byUser } = req.body;
        const leaveId = parseInt(id); // تحويل الـ ID إلى رقم لأن SQL يتعامل بالأرقام
        
        // 1. جلب الإجازة مع بيانات الموظف
        const leave = await prisma.leave.findUnique({ 
            where: { id: leaveId },
            include: { employee: true }
        });
        
        if (!leave) return res.json({ success: false, message: 'الإجازة غير موجودة في قاعدة البيانات' });

        const emp = leave.employee;

        // 2. التراجع عن التحضير (إرجاع الأيام من V إلى D)
        let start = new Date(leave.startDate);
        for (let i = 0; i < leave.duration; i++) {
            let curr = new Date(start); 
            curr.setDate(curr.getDate() + i);
            let prismaDate = toPrismaDate(curr.toISOString()); // المترجم الذكي
            
            const attRecord = await prisma.attendance.findFirst({
                where: { date: prismaDate, employeeId: emp.id }
            });

            if (attRecord && attRecord.code === 'V') {
                await prisma.attendance.update({
                    where: { id: attRecord.id },
                    data: { code: 'D', note: 'نظام (تراجع عن إجازة)', timestamp: new Date().toISOString() }
                });
            }
        }

        // 3. التراجع عن الرصيد المستخدم (فقط إذا كانت إجازة سنوية)
        if (leave.type === 'سنوية') {
            const newUsed = Math.max(0, (emp.usedLeaves || 0) - leave.duration);
            const newBalance = parseFloat(((emp.leaveCredit || 0) - newUsed).toFixed(3));
            
            await prisma.employee.update({
                where: { id: emp.id },
                data: { usedLeaves: newUsed, leaveBalance: newBalance }
            });
        }

        // 4. حذف سجل الإجازة نهائياً وتسجيل الرقابة
        await prisma.leave.delete({ where: { id: leaveId } });

        if (typeof safeLogAudit === 'function') {
            safeLogAudit(byUser, 'حذف إجازة', emp.username, `إلغاء إجازة ${leave.type} (${leave.duration} أيام)`);
        }

        res.json({ success: true });
    } catch (error) {
        console.error("❌ خطأ في حذف الإجازة:", error);
        res.json({ success: false, message: "حدث خطأ أثناء الحذف." });
    }
});

// ======================================================================
// ✏️ 4. مسار تعديل الإجازة (SQL) - يمسح الأيام القديمة ويطبق الجديدة
// ======================================================================
app.post('/api/leave-edit', async (req, res) => {
    try {
        const { id, type, startDate, duration, endDate, returnDate, byUser } = req.body;
        const leaveId = parseInt(id);
        const newDuration = parseInt(duration);

        // جلب الإجازة القديمة
        const oldLeave = await prisma.leave.findUnique({ 
            where: { id: leaveId }, include: { employee: true } 
        });
        
        if (!oldLeave) return res.json({ success: false });
        const emp = oldLeave.employee;

        // --- الخطوة 1: مسح تأثير الإجازة القديمة (من التحضير والرصيد) ---
        let oldStart = new Date(oldLeave.startDate);
        for (let i = 0; i < oldLeave.duration; i++) {
            let curr = new Date(oldStart); curr.setDate(curr.getDate() + i);
            let prismaDate = toPrismaDate(curr.toISOString());
            
            const attRecord = await prisma.attendance.findFirst({ where: { date: prismaDate, employeeId: emp.id } });
            if (attRecord && attRecord.code === 'V') {
                await prisma.attendance.delete({ where: { id: attRecord.id } }); // مسح التحضير القديم لتجنب التداخل
            }
        }
        
        let currentUsed = emp.usedLeaves || 0;
        if (oldLeave.type === 'سنوية') currentUsed = Math.max(0, currentUsed - oldLeave.duration);

        // --- الخطوة 2: تطبيق تأثير الإجازة الجديدة (على التحضير والرصيد) ---
        let newStart = new Date(startDate);
        let systemLabel = `تعديل إجازة (${type})`;

        for (let i = 0; i < newDuration; i++) {
            let curr = new Date(newStart); curr.setDate(curr.getDate() + i);
            let prismaDate = toPrismaDate(curr.toISOString());
            
            const attRecord = await prisma.attendance.findFirst({ where: { date: prismaDate, employeeId: emp.id } });
            if (attRecord) {
                await prisma.attendance.update({
                    where: { id: attRecord.id },
                    data: { code: 'V', note: systemLabel, timestamp: new Date().toISOString() }
                });
            } else {
                await prisma.attendance.create({
                    data: { employeeId: emp.id, date: prismaDate, code: 'V', note: systemLabel, timestamp: new Date().toISOString() }
                });
            }
        }

        if (type === 'سنوية') currentUsed += newDuration;
        const newBalance = parseFloat(((emp.leaveCredit || 0) - currentUsed).toFixed(3));

        // --- الخطوة 3: حفظ التعديلات النهائية في SQL ---
        await prisma.employee.update({
            where: { id: emp.id },
            data: { usedLeaves: currentUsed, leaveBalance: newBalance }
        });

        await prisma.leave.update({
            where: { id: leaveId },
            data: {
                type: type,
                startDate: toPrismaDate(startDate),
                duration: newDuration,
                endDate: toPrismaDate(endDate),
                returnDate: toPrismaDate(returnDate)
            }
        });

        if (typeof safeLogAudit === 'function') {
            safeLogAudit(byUser, 'تعديل إجازة', emp.username, `تعديل إلى ${type} لمدة ${newDuration} أيام`);
        }

        res.json({ success: true });
    } catch (error) {
        console.error("❌ خطأ في تعديل الإجازة:", error);
        res.json({ success: false });
    }
});



// =========================================================================================
// ==================== محرك إنهاء الخدمة وتوليد مخالصة الكميات (EOS Engine) ====================
app.post('/api/terminate-employee', (req, res) => {
    try {
        const { username, lastWorkingDay, termType, termReason, byUser, replacementManager } = req.body;
        
        const userIndex = usersDB.findIndex(u => u.username === username);
        if (userIndex === -1) return res.json({ success: false, message: 'الموظف غير موجود في النظام.' });
        
        const user = usersDB[userIndex];
        
        if (!user.joinDate) {
            return res.json({ success: false, message: 'عذراً، الموظف ليس لديه "تاريخ التحاق" مسجل في بياناته. يرجى تعديل ملفه أولاً.' });
        }

        const joinDate = new Date(user.joinDate);
        const leaveDate = new Date(lastWorkingDay);

        if (isNaN(joinDate.getTime()) || isNaN(leaveDate.getTime())) {
            return res.json({ success: false, message: 'خطأ في تنسيق التواريخ المدخلة.' });
        }

        // 🔥 1. صمام الأمان (التحقق من الإجازات المستقبلية)
        const futureLeaves = leavesDB.filter(l => l.username === username && new Date(l.endDate) > leaveDate);
        if (futureLeaves.length > 0) {
            return res.json({ 
                success: false, 
                message: `عذراً، يوجد للموظف إجازة (${futureLeaves[0].type}) تنتهي في (${futureLeaves[0].endDate}) تتجاوز تاريخ آخر يوم عمل.\nيرجى حذفها أولاً من بوابة الإجازات.` 
            });
        }

        // 🔥 نقل العهدة (إذا تم إرسال مدير بديل)
        if (replacementManager) {
            const deletedUserName = user.name;
            usersDB.forEach(u => { if (u.directManager === deletedUserName) u.directManager = replacementManager; });
            
            // 🛠️ تم التصحيح هنا: استبدال B بـ requestsDB
            requestsDB.forEach(r => { if (r.managerName === deletedUserName) r.managerName = replacementManager; });
        }

        // 2. المحرك الرياضي للإجازات
        const diffTimeForLeave = leaveDate - joinDate;
        const workedDaysForLeave = Math.floor(diffTimeForLeave / (1000 * 60 * 60 * 24));
        
        if (workedDaysForLeave > 0) {
            let credit = 0;
            if (workedDaysForLeave <= 1825) { 
                credit = (workedDaysForLeave / 365) * 21;
            } else { 
                const first5YearsCredit = (1825 / 365) * 21;
                const remainingDays = workedDaysForLeave - 1825;
                credit = first5YearsCredit + ((remainingDays / 365) * 30);
            }

            const myAnnualLeaves = leavesDB.filter(l => l.username === username && l.type === 'سنوية');
            const used = myAnnualLeaves.reduce((sum, leave) => sum + parseInt(leave.duration || 0), 0);

            user.leaveCredit = parseFloat(credit.toFixed(3));
            user.usedLeaves = used;
            user.leaveBalance = parseFloat((credit - used).toFixed(3));
        }

        // 3. تحديث بيانات الموظف
        user.status = termType === 'استقالة' ? 'Resign' : 'Terminated';
        user.isActive = false;
        user.lastWorkingDay = lastWorkingDay;

        // 4. إغلاق جميع طلباته المفتوحة
        let requestsModified = false;
        
        // 🛠️ تم التصحيح هنا: استبدال B بـ requestsDB
        requestsDB.forEach(r => {
            if (r.empUsername === username && r.status !== 'completed') {
                r.status = 'completed';
                r.managerComment = `تم الإغلاق آلياً لترك العمل (السبب: ${termReason})`;
                r.resolveDate = new Date().toLocaleString('ar-SA');
                requestsModified = true;
            }
        });

        // 5. معالجة التحضير
        attendanceDB.forEach(a => {
            if (a.username === username) {
                if (a.date === lastWorkingDay) {
                    a.code = 'R'; 
                    a.managerName = 'نظام (إنهاء خدمة)';
                }
                if (a.code === 'T' && new Date(a.date) <= leaveDate) {
                    a.code = 'LOP'; 
                    a.managerName = 'نظام (تسوية إنهاء)';
                }
            }
        });

        // 6. حساب مدة الخدمة
        let years = leaveDate.getFullYear() - joinDate.getFullYear();
        let months = leaveDate.getMonth() - joinDate.getMonth();
        let days = leaveDate.getDate() - joinDate.getDate();
        if (days < 0) { months--; const prevMonth = new Date(leaveDate.getFullYear(), leaveDate.getMonth(), 0); days += prevMonth.getDate(); }
        if (months < 0) { years--; months += 12; }
        const serviceDurationStr = `${years} سنة و ${months} شهر و ${days} يوم`;
        
        const deservesEOS = workedDaysForLeave >= 365 ? 'يستحق مكافأة نهاية خدمة' : 'لا يستحق مكافأة (أقل من سنة)';

        // 7. حساب رسوم التأمينات
        let gosiDaysAdj = 0;
        let gosiNote = "";
        const isSameMonthAndYear = (joinDate.getFullYear() === leaveDate.getFullYear()) && (joinDate.getMonth() === leaveDate.getMonth());

        if (isSameMonthAndYear) {
            gosiDaysAdj =  joinDate.getDate() - leaveDate.getDate();
            gosiNote = " (ترد اذا لم يسجل بالتأمينات)";
        } else {
            const gosiRuleDate = new Date('2025-06-01');
            if (joinDate < gosiRuleDate) {
                gosiDaysAdj = joinDate.getDate() - leaveDate.getDate(); 
            } else {
                gosiDaysAdj = -(leaveDate.getDate()); 
            }
        }
        const finalGosiDisplay = `${gosiDaysAdj}${gosiNote}`;

        // 8. استخراج أيام العمل
        const currMonthStr = lastWorkingDay.substring(0, 7); 
        const prevMonthDate = new Date(leaveDate.getFullYear(), leaveDate.getMonth() - 1, 1);
        const prevMonthStr = prevMonthDate.toISOString().substring(0, 7);

        let currentMonthPayableDays = 0;
        let prevMonthDeductDays = 0;

        attendanceDB.forEach(a => {
            if (a.username === username) {
                const aDate = new Date(a.date);
                const dayNum = aDate.getDate();
                const aMonthStr = a.date.substring(0, 7);

                if (aMonthStr === currMonthStr && aDate <= leaveDate) {
                    if (['D', 'SL', 'Off', 'V', 'CP', 'E'].includes(a.code)) currentMonthPayableDays++;
                }
                if (aMonthStr === prevMonthStr && dayNum >= 16) {
                    if (['A', 'LOP'].includes(a.code)) prevMonthDeductDays++;
                }
            }
        });

        // 9. تصفير البلدية
        let finalBaladiyahFee = user.baladiyahFees || 0;
        if (workedDaysForLeave >= 360) {
            finalBaladiyahFee = 0;
        }

        const eosReport = {
            empId: user.username,
            name: user.name,
            idNumber: user.idNumber || '',
            joinDate: user.joinDate,
            lastWorkingDay: lastWorkingDay,
            serviceDuration: serviceDurationStr,
            deservesEOS: deservesEOS,
            totalSalary: user.salaryE || 0,
            gosiFeeMonth: user.gosiFees || 0,
            currentMonthPayableDays: currentMonthPayableDays,
            prevMonthDeductDays: prevMonthDeductDays,
            leaveBalance: user.leaveBalance || 0,
            gosiDaysAdjustment: finalGosiDisplay,
            baladiyahFee: finalBaladiyahFee,
            bankName: user.bankName || 'غير مسجل',
            bankIban: user.bankIban || 'غير مسجل'
        };

        // 10. الحفظ في قواعد البيانات
        fs.writeFileSync(usersFile, JSON.stringify(usersDB, null, 2));
        
        // 🛠️ تم التصحيح هنا: استبدال B بـ requestsDB
        if (requestsModified) fs.writeFileSync(requestsFile, JSON.stringify(requestsDB, null, 2));
        
        fs.writeFileSync(attendanceFile, JSON.stringify(attendanceDB, null, 2));

        safeLogAudit(byUser, 'إنهاء خدمة', `${user.name} (${user.username})`, `النوع: ${termType}, آخر يوم: ${lastWorkingDay}`);

        res.json({ success: true, report: eosReport });

    } catch (error) {
        console.error("EOS Error:", error);
        // تم إضافة طباعة الخطأ التفصيلي في الواجهة لنسهل على أنفسنا مستقبلاً
        res.json({ success: false, message: 'حدث خطأ تقني في السيرفر: ' + error.message });
    }
});

// ======================================================================
// 🛠️ دوال مساعدة لترجمة التواريخ بين الواجهة وقاعدة البيانات (المترجم الذكي)
// ======================================================================
const toPrismaDate = (d) => (d && d.includes('T')) ? d : `${d}T00:00:00.000Z`;
const fromPrismaDate = (d) => d instanceof Date ? d.toISOString().split('T')[0] : String(d).split('T')[0];

// ======================================================================
// 🌟 1. مسار جلب التحضير اليومي (معدل للمترجم)
// ======================================================================
app.post('/api/get-daily-attendance', async (req, res) => {
    try {
        const { date, usernames, managerName } = req.body;
        let whereClause = { date: toPrismaDate(date) };

        if (usernames && Array.isArray(usernames) && usernames.length > 0) {
            const stringUsernames = usernames.map(u => String(u));
            whereClause.employee = { username: { in: stringUsernames } };
        } else if (managerName) {
            whereClause.employee = { directManager: managerName };
        }

        const records = await prisma.attendance.findMany({
            where: whereClause,
            include: { employee: { select: { username: true, name: true } } }
        });

        const formattedRecords = records.map(r => ({
            date: fromPrismaDate(r.date),
            username: r.employee.username,
            name: r.employee.name,
            code: r.code,
            managerName: r.note || '',
            timestamp: r.timestamp
        }));

        res.json(formattedRecords);
    } catch (error) {
        console.error("❌ Error in /api/get-daily-attendance:", error);
        res.json([]);
    }
});

// ======================================================================
// 🌟 2. مسار جلب الحالات المعلقة T (معدل للمترجم)
// ======================================================================
app.post('/api/get-pending-attendance', async (req, res) => {
    try {
        const { usernames, managerName } = req.body;
        let whereClause = { code: 'T' };

        if (usernames && Array.isArray(usernames) && usernames.length > 0) {
            const stringUsernames = usernames.map(u => String(u));
            whereClause.employee = { username: { in: stringUsernames } };
        } else if (managerName) {
            whereClause.employee = { directManager: managerName };
        }

        const records = await prisma.attendance.findMany({
            where: whereClause,
            include: { employee: { select: { username: true, name: true } } }
        });

        const formattedRecords = records.map(r => ({
            date: fromPrismaDate(r.date),
            username: r.employee.username,
            name: r.employee.name,
            code: r.code,
            managerName: r.note || '',
            timestamp: r.timestamp
        }));

        res.json(formattedRecords);
    } catch (error) {
        console.error("❌ Error in /api/get-pending-attendance:", error);
        res.json([]); 
    }
});




// ======================================================================
// 🚨 محرك التعديل العاجل للتحضير (النسخة المتطابقة مع Schema 100%)
// ======================================================================
app.post('/api/urgent-edit-attendance', async (req, res) => {
    try {
        const { username, date, newCode, byUser } = req.body;

        if (!username || !date || !newCode) {
            return res.json({ success: false, message: "بيانات التعديل ناقصة." });
        }

        // 1. العثور على الموظف
        const employee = await prisma.employee.findUnique({
            where: { username: String(username) }
        });

        if (!employee) return res.json({ success: false, message: "لم يتم العثور على الموظف." });

        // ترويض التاريخ
        const strictDate = new Date(date + 'T00:00:00Z');

        // =========================================================
        // 🕵️‍♂️ الاستخبارات: جلب الحالة القديمة
        // =========================================================
        const existingAttendance = await prisma.attendance.findFirst({
            where: {
                employeeId: employee.id,
                date: strictDate
            }
        });

        // 🔥 قراءة الـ code بدلاً من status
        const oldCode = existingAttendance ? existingAttendance.code : 'غير مسجل'; 

        // =========================================================
        // 🛠️ تحديث أو إنشاء التحضير في قاعدة البيانات
        // =========================================================
        if (existingAttendance) {
            await prisma.attendance.update({
                where: { id: existingAttendance.id },
                data: { 
                    code: String(newCode),
                    timestamp: new Date(), // تحديث وقت التعديل
                    note: `تم التعديل بواسطة ${byUser || 'النظام'}`
                }
            });
        } else {
            // 🔥 إنشاء تحضير جديد مع تلبية جميع الحقول الإجبارية في الـ Schema
            await prisma.attendance.create({
                data: {
                    employeeId: employee.id,
                    date: strictDate,
                    code: String(newCode),
                    timestamp: new Date(),
                    note: `تحضير عاجل بواسطة ${byUser || 'النظام'}`
                }
            });
        }

        let sosMessage = ""; 

        // =========================================================
        // 💣 المزامنة المعقدة للجزاءات (نداء الاستغاثة)
        // =========================================================

        // 🟢 اللغم الأول: تعديل من (غياب) إلى (أي شيء آخر) -> تنظيف السجل وإعدام المخالفة
        if (oldCode === 'A' && newCode !== 'A' && newCode !== 'بلا أجر') {
            
            const deleted = await prisma.penalty.deleteMany({
                where: {
                    employeeId: employee.id,
                    violationDate: strictDate,
                    category: { in: ['الغياب والتأخير (المادة 80)', 'تسوية غيابات للرواتب'] }
                }
            });

            if (deleted.count > 0) {
                sosMessage = "\n🧹 نداء استغاثة إيجابي: تم تنظيف السجل وحذف إشعار مخالفة الغياب المرتبط بهذا اليوم آلياً.";
            }
        }

        // 🔴 اللغم الثاني: تعديل من (حاضر/إجازة) إلى (غياب/بلا أجر) -> إطلاق صاروخ المخالفة
        else if ((newCode === 'A' || newCode === 'بلا أجر') && oldCode !== 'A' && oldCode !== 'بلا أجر') {
            
            const existingPenalty = await prisma.penalty.findFirst({
                where: { employeeId: employee.id, violationDate: strictDate }
            });

            // 🔥 إنشاء المخالفة بتلبية كافة الحقول الإجبارية في جدول Penalty
            if (!existingPenalty) {
                await prisma.penalty.create({
                    data: {
                        employeeId: employee.id,
                        violationName: 'غياب 1 يوم',
                        category: 'الغياب والتأخير (المادة 80)',
                        displayPenalty: 'خصم 1 يوم',
                        managerName: String(byUser || 'النظام الآلي'),
                        violationDate: strictDate,
                        managerComment: `تم إنشاء المخالفة آلياً بسبب التعديل العاجل للتحضير من (${oldCode}) إلى (${newCode}).`,
                        isAdmit: false,
                        requestLessPunishment: false,
                        actualOccurrence: 1, 
                        appliedPenalty: '1',
                        status: 'بانتظار الموارد البشرية',
                        attachment: '',
                        hrComment: '',
                        hrName: '',
                        timestamp: new Date()
                    }
                });
                sosMessage = "\n⚠️ نداء استغاثة تحذيري: تم إصدار إشعار مخالفة غياب آلياً بناءً على هذا التعديل.";
            }
        }

        // إرسال الرد للواجهة الأمامية
        res.json({ 
            success: true, 
            message: `تم تحديث التحضير إلى (${newCode}) بنجاح. ${sosMessage}` 
        });

    } catch (error) {
        console.error("❌ Error in urgent edit:", error);
        res.json({ success: false, message: "حدث خطأ داخلي أثناء التعديل العاجل للتحضير." });
    }
});

// ======================================================================
// 🏰 1. حصن التحضير اليومي (النسخة المتوافقة مع هيكل SQL الجديد)
// ======================================================================
app.post('/api/save-attendance', async (req, res) => {
    try {
        const { date, managerName, records } = req.body;
        
        if (!records || !Array.isArray(records)) {
            return res.json({ success: false, message: 'سجلات الموظفين مفقودة!' });
        }

        // تحويل التاريخ النصي إلى صيغة DateTime صارمة يقبلها Prisma (UTC Midnight)
        const strictDate = new Date(date + 'T00:00:00Z');
        let savedCount = 0;

        for (const rec of records) {
            // 🔍 1. البحث عن الـ ID الرقمي للموظف باستخدام رقمه الوظيفي (username)
            const employee = await prisma.employee.findFirst({
                where: { username: String(rec.username) }
            });

            // إذا الموظف غير موجود في جدول الموظفين، نتخطاه حتى لا ينهار النظام
            if (!employee) {
                console.warn(`⚠️ تم تخطي ${rec.username} - غير موجود في جدول الموظفين!`);
                continue; 
            }

            // 🔍 2. البحث: هل الموظف محضر مسبقاً في هذا اليوم؟ (باستخدام employeeId)
            const existingRecord = await prisma.attendance.findFirst({
                where: { 
                    employeeId: employee.id, 
                    date: strictDate 
                }
            });

            if (existingRecord) {
                // 🔄 تحديث
                await prisma.attendance.update({
                    where: { id: existingRecord.id },
                    data: { 
                        code: String(rec.code),
                        timestamp: new Date(), // تحديث وقت التعديل
                        note: `تم التعديل بواسطة: ${managerName || 'النظام'}` // استغلال حقل الملاحظة لاسم المدير
                    }
                });
            } else {
                // ➕ إنشاء جديد
                await prisma.attendance.create({
                    data: {
                        employeeId: employee.id, // 🔗 الربط الصحيح بقاعدة البيانات
                        date: strictDate,        // 📅 التاريخ الصارم
                        code: String(rec.code),
                        timestamp: new Date(),   // ⏱️ الوقت الحالي
                        note: `حُضر بواسطة: ${managerName || 'النظام'}`
                    }
                });
            }
            savedCount++;
        }

        res.json({ success: true, count: savedCount });

    } catch (error) {
        console.error("❌ انهيار في حفظ التحضير:", error);
        res.json({ success: false, message: `خطأ قاعدة البيانات: ${error.message}` });
    }
});

// ======================================================================
// 🏰 2. حصن الحالات المعلقة (تحويل الـ T إلى A أو V) متوافق مع SQL
// ======================================================================
app.post('/api/update-pending-attendance', async (req, res) => {
    try {
        const { records } = req.body;
        let updatedCount = 0;

        for (const rec of records) {
            // تحويل التاريخ النصي القادم من الواجهة إلى صيغة صارمة
            const strictDate = new Date(rec.date + 'T00:00:00Z');

            // 🔍 جلب الموظف أولاً للحصول على employeeId
            const employee = await prisma.employee.findFirst({
                where: { username: String(rec.username) }
            });

            if (!employee) continue;

            // البحث عن سجل التحضير المعلق
            const existingRecord = await prisma.attendance.findFirst({
                where: { 
                    employeeId: employee.id, 
                    date: strictDate 
                }
            });

            if (existingRecord) {
                // تحديث الحالة المعلقة
                await prisma.attendance.update({
                    where: { id: existingRecord.id },
                    data: { 
                        code: String(rec.newCode),
                        timestamp: new Date(),
                        note: `تمت معالجة المعلق (T) إلى (${rec.newCode})`
                    }
                });
                updatedCount++;
            }
        }

        res.json({ success: true, count: updatedCount });

    } catch (error) {
        console.error("❌ خطأ في معالجة المعلق:", error);
        res.json({ success: false, message: `خطأ قاعدة البيانات: ${error.message}` });
    }
});




// مسار لحفظ المصفوفة المرفوعة من الإكسيل
app.post('/api/save-penalty-matrix', (req, res) => {
    try {
        penaltyMatrixDB = req.body;
        fs.writeFileSync(penaltyMatrixFile, JSON.stringify(penaltyMatrixDB, null, 2));
        res.json({ success: true, message: "تم تحديث لائحة الجزاءات بنجاح!" });
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
});

// مسار لجلب المصفوفة لشاشة المدير
app.get('/api/penalty-matrix', (req, res) => {
    res.json(penaltyMatrixDB);
});
// ==================== تعديل عقوبة فرعية واحدة (بواسطة الإدارة) ====================
app.post('/api/update-single-penalty', (req, res) => {
    try {
        const { category, name, v1, v2, v3, v4 } = req.body;
        
        // البحث عن التصنيف
        let catObj = penaltyMatrixDB.find(c => c.category === category);
        if(catObj) {
            // البحث عن المخالفة وتحديثها
            let vioObj = catObj.violations.find(v => v.name === name);
            if(vioObj) {
                vioObj.v1 = v1;
                vioObj.v2 = v2;
                vioObj.v3 = v3;
                vioObj.v4 = v4;
                
                // حفظ قاعدة البيانات
                fs.writeFileSync(penaltyMatrixFile, JSON.stringify(penaltyMatrixDB, null, 2));
                return res.json({ success: true });
            }
        }
        res.json({ success: false, message: 'لم يتم العثور على المخالفة المطلوبة في قاعدة البيانات.' });
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
});

// ======================================================================
// 🚀 محرك رفع واعتماد المخالفات (النسخة المتوافقة تماماً مع Schema)
// ======================================================================
app.post('/api/submit-penalty', async (req, res) => {
    try {
        const payload = req.body;

        // 1. العثور على الموظف
        const employee = await prisma.employee.findUnique({
            where: { username: String(payload.empUsername) }
        });

        if (!employee) {
            return res.json({ success: false, message: "❌ لم يتم العثور على بيانات الموظف في قاعدة البيانات." });
        }

        // 2. ترويض التاريخ
        const strictViolationDate = new Date(payload.violationDate + 'T00:00:00Z');

        // 3. 🛡️ الجدار الأمني: منع التكرار
        const isDuplicate = await prisma.penalty.findFirst({
            where: {
                employeeId: employee.id,
                violationDate: strictViolationDate,
                violationName: payload.violationName,
                category: { not: 'تسوية غيابات للرواتب' }
            }
        });

        if (isDuplicate) {
            return res.json({ success: false, message: "🛑 تم رفع هذه المخالفة مسبقاً لهذا الموظف في نفس اليوم! يرجى التحقق من السجل." });
        }

        // 4. الحفظ في قاعدة البيانات (مطابق للـ Schema حرفياً)
        await prisma.penalty.create({
            data: {
                employeeId: employee.id, // الرابط مع الموظف
                
                violationName: String(payload.violationName),
                category: String(payload.category),
                displayPenalty: String(payload.displayPenalty || ''),
                managerName: String(payload.managerName || 'غير مسجل'),
                violationDate: strictViolationDate,
                managerComment: String(payload.managerComment || ''),
                
                isAdmit: Boolean(payload.isAdmit),
                requestLessPunishment: Boolean(payload.requestLessPunishment),
                
                actualOccurrence: parseInt(payload.actualOccurrence) || 1,
                appliedPenalty: String(payload.appliedPenalty || ''),
                status: String(payload.status || 'بانتظار الموارد البشرية'),
                
                // 🖼️ توجيه المرفق للاسم الصحيح في الـ Schema
                attachment: String(payload.attachmentBase64 || ''),
                
                // هذه الحقول مطلوبة في الـ Schema كـ String، نرسلها فارغة مبدئياً
                hrComment: '', 
                hrName: '',
                
                timestamp: new Date()
            }
        });
        
        res.json({ success: true, message: "✅ تم رفع المخالفة بنجاح وتوثيقها في النظام!" });

    } catch (error) {
        console.error("❌ Error submitting penalty:", error);
        res.json({ success: false, message: "حدث خطأ داخلي في السيرفر أثناء رفع المخالفة. تأكد من صحة البيانات." });
    }
});

// ======================================================================
// ⚖️ جلب سجل الجزاءات والمخالفات (مع فلتر تجميل التواريخ والأسماء)
// ======================================================================
app.post('/api/manager-penalties', async (req, res) => {
    try {
        const { managerName, role, roleArabic } = req.body;
        let history = [];

        const isHrOrAdmin = role === 'admin' || roleArabic === 'ادمن' || roleArabic === 'موظف موارد' || roleArabic === 'موظف ادارة';

        if (isHrOrAdmin) {
            history = await prisma.penalty.findMany({ orderBy: { id: 'desc' },include: { employee: true } });
        } else {
            const myTeam = await prisma.employee.findMany({
                where: { directManager: managerName },
                select: { username: true }
            });
            const myTeamUsernames = myTeam.map(u => String(u.username));

// للموارد والإدارة العليا:
history = await prisma.penalty.findMany({ 
    orderBy: { id: 'desc' },
    include: { employee: true } // 👈 هذا السطر السحري يجلب بيانات الموظف المرتبط
});

// للمدير المباشر:
history = await prisma.penalty.findMany({
    where: {
        OR: [
            { managerName: String(managerName) },
            { employee: { directManager: managerName } } // 👈 بحث أذكى عبر العلاقات
        ]
    },
    orderBy: { id: 'desc' },
    include: { employee: true } // 👈 هذا السطر السحري
});
        }
        
        // 🧹 فلتر التجميل: تنظيف التواريخ وإصلاح الأسماء المفقودة
        const formattedHistory = await Promise.all(history.map(async (p) => {
            // 1. تنظيف التاريخ
            let cleanDate = p.violationDate;
            if (cleanDate instanceof Date) {
                cleanDate = cleanDate.toISOString().split('T')[0]; // يحولها إلى YYYY-MM-DD
            } else if (typeof cleanDate === 'string' && cleanDate.includes('T')) {
                cleanDate = cleanDate.split('T')[0];
            }

            // 2. إصلاح "غير معروف"
            let finalName = p.empName;
            let finalUsername = p.empUsername;
            
            if (!finalName || finalName === 'غير معروف' || !finalUsername || finalUsername === '-') {
                // محاولة جلب الاسم الحقيقي من قاعدة بيانات الموظفين
                const realEmp = await prisma.employee.findFirst({
                    where: { username: String(p.empUsername) }
                });
                if (realEmp) {
                    finalName = realEmp.name;
                    finalUsername = realEmp.username;
                }
            }

            return {
                ...p,
                violationDate: cleanDate,
                empName: finalName,
                empUsername: finalUsername
            };
        }));

        res.json(formattedHistory);
    } catch (error) {
        console.error("❌ خطأ في جلب الجزاءات:", error);
        res.json([]); 
    }
});

// ======================================================================
// 🧮 محرك حساب تكرار المخالفة (البحث المتقدم عبر العلاقات SQL)
// ======================================================================
app.post('/api/calculate-penalty', async (req, res) => {
    try {
        const { empUsername, violationName } = req.body;

        if (!empUsername || !violationName) {
            return res.json({ success: false, message: "بيانات الموظف أو المخالفة مفقودة." });
        }

        // 1. جلب كل مخالفات الموظف عبر علاقة الموظفين (employee)
        const allEmpViolations = await prisma.penalty.findMany({
            where: {
                // 🔥 السحر هنا: نبحث داخل الجدول المرتبط (Employee) عن الرقم الوظيفي
                employee: {
                    username: String(empUsername)
                },
                status: { not: 'مرفوضة' } // 🛡️ استبعاد المخالفات المرفوضة
            },
            orderBy: { violationDate: 'desc' } // 📅 الترتيب من الأحدث للأقدم
        });

        // 2. الفلترة الذكية (للحفاظ على هندستك للغيابات المتصلة والمنفردة)
        const matchedViolations = allEmpViolations.filter(p => {
            if (violationName.includes('متصل') && p.violationName && p.violationName.includes('متصل')) return true;
            if (violationName.includes('منفرد') && p.violationName && p.violationName.includes('منفرد')) return true;
            
            return p.violationName === violationName;
        });

        const previousCount = matchedViolations.length;
        const currentOccurrence = previousCount + 1;

        let lastDate = "لا يوجد";
        let lastPenalty = "لا يوجد";

        if (previousCount > 0) {
            const lastVio = matchedViolations[0];
            
            // تنظيف صيغة التاريخ
            if (lastVio.violationDate instanceof Date) {
                lastDate = lastVio.violationDate.toISOString().split('T')[0];
            } else if (typeof lastVio.violationDate === 'string' && lastVio.violationDate.includes('T')) {
                lastDate = lastVio.violationDate.split('T')[0];
            } else {
                lastDate = lastVio.violationDate || "تاريخ غير مسجل";
            }
            
            lastPenalty = lastVio.displayPenalty || lastVio.appliedPenalty || "غير مسجل"; 
        }

        res.json({ 
            success: true, 
            previousCount: previousCount,
            currentOccurrence: currentOccurrence,
            lastViolationDate: lastDate,
            lastViolationPenalty: lastPenalty
        });

    } catch (error) {
        console.error("❌ خطأ في حساب التكرار (SQL):", error);
        res.json({ success: false, message: `خطأ قاعدة البيانات: ${error.message}` });
    }
});



// ======================================================================
// ⚖️ 1. محرك الميزان (تعديل استثنائي للعقوبة) - نسخة SQL
// ======================================================================
app.post('/api/hr-balance-penalty', async (req, res) => {
    try {
        const { ticketId, newAppliedPenalty, newDisplayPenalty, hrComment, hrName } = req.body;

        // تحديث التذكرة في SQL باستخدام المعرف الرقمي
        const updatedTicket = await prisma.penalty.update({
            where: { id: parseInt(ticketId) }, // 🔗 تحويل الـ ID إلى رقم
            data: {
                appliedPenalty: String(newAppliedPenalty),
                displayPenalty: String(newDisplayPenalty),
                hrComment: hrComment,
                hrName: hrName,
                status: 'مغلقة (معدلة استثنائياً)' // تحديث الحالة لتدل على التعديل
            }
        });

        res.json({ success: true, message: "تم تعديل العقوبة بالميزان بنجاح وتوثيق الإجراء." });
    } catch (error) {
        console.error("❌ خطأ الميزان:", error);
        res.json({ success: false, message: "لم يتم العثور على التذكرة أو حدث خطأ في قاعدة البيانات." });
    }
});

// ======================================================================
// ✏️ 2. محرك تصحيح المخالفات (تغيير نوع المخالفة) - نسخة SQL
// ======================================================================
app.post('/api/hr-edit-penalty', async (req, res) => {
    try {
        const { 
            ticketId, newCategory, newViolationName, newOccurrence, 
            newAppliedPenalty, newDisplayPenalty, hrComment, hrName 
        } = req.body;

        await prisma.penalty.update({
            where: { id: parseInt(ticketId) },
            data: {
                category: String(newCategory),
                violationName: String(newViolationName),
                actualOccurrence: parseInt(newOccurrence) || 1,
                appliedPenalty: String(newAppliedPenalty),
                displayPenalty: String(newDisplayPenalty),
                hrComment: hrComment,
                hrName: hrName,
                status: 'مغلقة (مصححة إدارياً)'
            }
        });

        res.json({ success: true, message: "تم تصحيح المخالفة وإعادة ضبط العقوبة بنجاح." });
    } catch (error) {
        console.error("❌ خطأ تصحيح المخالفة:", error);
        res.json({ success: false, message: "حدث خطأ أثناء تصحيح التذكرة في قاعدة البيانات." });
    }
});

// ======================================================================
// 🛡️ 3. محرك اعتماد أو رفض الموارد البشرية - نسخة SQL
// ======================================================================
app.post('/api/update-penalty-status', async (req, res) => {
    try {
        const { ticketId, newStatus, hrComment, hrName } = req.body;

        await prisma.penalty.update({
            where: { id: parseInt(ticketId) },
            data: {
                status: String(newStatus),
                hrComment: hrComment,
                hrName: hrName
            }
        });

        res.json({ success: true, message: `تم تحديث حالة التذكرة إلى: ${newStatus}` });
    } catch (error) {
        console.error("❌ خطأ اعتماد التذكرة:", error);
        res.json({ success: false, message: "حدث خطأ أثناء تحديث حالة التذكرة." });
    }
});

// ======================================================================
// 🗑️ 4. محرك حذف المخالفة نهائياً - نسخة SQL
// ======================================================================
app.post('/api/delete-penalty', async (req, res) => {
    try {
        const { ticketId } = req.body;

        await prisma.penalty.delete({
            where: { id: parseInt(ticketId) }
        });

        res.json({ success: true, message: "تم حذف إشعار المخالفة من النظام نهائياً." });
    } catch (error) {
        console.error("❌ خطأ حذف التذكرة:", error);
        res.json({ success: false, message: "حدث خطأ أثناء الحذف، قد تكون التذكرة محذوفة بالفعل." });
    }
});




// ==================== (HR) محرك تحليل الغيابات المطور (V3) حسب المادة 80 ====================
app.get('/api/analyze-absences', (req, res) => {
    try {
        const today = new Date();
        const report = [];

        usersDB.forEach(user => {
            if (!user.joinDate || user.status === 'Resign' || user.status === 'Terminated' || user.isActive === false) return;

            const joinDate = new Date(user.joinDate);
            let cycleStart = new Date(joinDate);
            cycleStart.setFullYear(today.getFullYear());
            if (today < cycleStart) cycleStart.setFullYear(today.getFullYear() - 1);
            
            let cycleEnd = new Date(cycleStart);
            cycleEnd.setFullYear(cycleStart.getFullYear() + 1);

            const startStr = cycleStart.toISOString().split('T')[0];
            const endStr = cycleEnd.toISOString().split('T')[0];

            const userAtt = attendanceDB.filter(a => a.username === user.username && a.date >= startStr && a.date < endStr);
            userAtt.sort((a, b) => new Date(a.date) - new Date(b.date));

            const absentCodes = ['A', 'LOP']; 
            const breakers = ['D', 'SL', 'V', 'E', 'CP'];

            let totalAbsent = 0;         
            let currentConsecutive = 0;  
            let maxConsecutive = 0;      
            
            let currentStreakStart = null;
            let maxStreakStart = null;

            userAtt.forEach(a => {
                if (absentCodes.includes(a.code)) {
                    totalAbsent++;
                    if (currentConsecutive === 0) currentStreakStart = a.date; // التقاط تاريخ أول يوم في السلسلة
                    currentConsecutive++;
                    if (currentConsecutive > maxConsecutive) {
                        maxConsecutive = currentConsecutive;
                        maxStreakStart = currentStreakStart; // حفظ تاريخ بداية أطول سلسلة
                    }
                } 
                else if (breakers.includes(a.code)) {
                    currentConsecutive = 0; 
                }
            });

            // 🌟 السحر الجديد: جلب المخالفات الآلية السابقة لهذا الموظف في نفس السنة العقدية
            const pastPenalties = penaltiesHistoryDB.filter(p => p.empUsername === user.username && p.violationDate >= startStr && p.category === 'الغياب والتأخير (المادة 80)');
            
            const has10c = pastPenalties.find(p => p.violationName === 'غياب متصل (10 أيام)');
            const has15c = pastPenalties.find(p => p.violationName === 'غياب متصل (15 يوم)');
            const has20i = pastPenalties.find(p => p.violationName === 'غياب متفرق (20 يوم)');
            const has30i = pastPenalties.find(p => p.violationName === 'غياب متفرق (30 يوم)');

            // 1. تقييم الغياب المتصل (منفصل في سطر خاص)
            if (maxConsecutive >= 10) {
                let type = maxConsecutive >= 15 ? '15c' : '10c';
                let alreadyIssued = maxConsecutive >= 15 ? !!has15c : !!has10c;
                let prevWarningDate = has10c ? has10c.timestamp.split('T')[0] : 'غير محدد'; // تاريخ الإنذار الأول (نحتاجه في الـ 15)

                report.push({
                    username: user.username, name: user.name, branch: user.branch,
                    cycleStart: startStr, streakStart: maxStreakStart, prevWarningDate: prevWarningDate,
                    value: maxConsecutive, type: type,
                    title: `غياب متصل (${maxConsecutive} أيام)`,
                    alreadyIssued: alreadyIssued
                });
            }

            // 2. تقييم الغياب المنفصل (منفصل في سطر خاص)
            if (totalAbsent >= 20) {
                let type = totalAbsent >= 30 ? '30i' : '20i';
                let alreadyIssued = totalAbsent >= 30 ? !!has30i : !!has20i;
                let prevWarningDate = has20i ? has20i.timestamp.split('T')[0] : 'غير محدد'; // تاريخ الإنذار الأول (نحتاجه في الـ 30)

                report.push({
                    username: user.username, name: user.name, branch: user.branch,
                    cycleStart: startStr, prevWarningDate: prevWarningDate,
                    value: totalAbsent, type: type,
                    title: `غياب متفرق (${totalAbsent} يوماً)`,
                    alreadyIssued: alreadyIssued
                });
            }
        });

        res.json({ success: true, report });
    } catch (error) {
        console.error("Absence Analysis Error:", error);
        res.json({ success: false, message: "حدث خطأ أثناء تحليل الغيابات." });
    }
});

// ======================================================================
// ⚖️ (HR & Payroll) محرك المزامنة المتطور (مع الترويض الصارم للتواريخ)
// ======================================================================
app.post('/api/sync-absences-to-penalties', async (req, res) => {
    try {
        let addedCount = 0;
        console.log("⏳ بدء تشغيل محرك المزامنة لإصدار إشعارات الغياب الآلية...");

        // 1. جلب الغيابات مع بيانات الموظف (للحصول على employeeId)
        const absences = await prisma.attendance.findMany({
            where: { code: { in: ['A', 'LOP'] } },
            include: { employee: true } // 🔗 جلب الموظف المرتبط
        });

        for (const att of absences) {
            // حماية: إذا كان التحضير يتيماً (الموظف محذوف) نتجاهله
            if (!att.employee || !att.employeeId) continue;

            // استخراج التاريخ كنص (YYYY-MM-DD)
            let attDateStr = '';
            if (att.date instanceof Date) {
                attDateStr = att.date.toISOString().split('T')[0];
            } else {
                attDateStr = String(att.date).split('T')[0];
            }

            // 🔥 السحر هنا: تحويل النص إلى كائن زمني صارم (UTC Midnight) يقبله Prisma
            const strictViolationDate = new Date(attDateStr + 'T00:00:00Z');

            // 2. التحقق من عدم وجود الإشعار مسبقاً
            const exists = await prisma.penalty.findFirst({
                where: {
                    employeeId: att.employeeId,
                    violationDate: strictViolationDate, // 👈 استخدام التاريخ الصارم هنا
                    category: 'تسوية غيابات للرواتب'
                }
            });

            // 3. إنشاء الإشعار
            if (!exists) {
                await prisma.penalty.create({
                    data: {
                        employeeId: att.employeeId, 
                        managerName: 'النظام الآلي (تسوية)',
                        violationDate: strictViolationDate, // 👈 استخدام التاريخ الصارم هنا
                        category: 'تسوية غيابات للرواتب',
                        violationName: 'غياب 1 يوم',
                        managerComment: 'تم سحب هذا الغياب آلياً من سجل التحضير لإدراجه في مسير الرواتب.',
                        isAdmit: false,
                        requestLessPunishment: false,
                        actualOccurrence: 1, 
                        appliedPenalty: '1', 
                        displayPenalty: 'خصم 1 يوم',
                        status: 'معتمدة آلياً',
                        attachment: '',
                        hrComment: 'تسوية آلية لغرض تصدير الرواتب.',
                        hrName: 'محرك المزامنة',
                        timestamp: new Date()
                    }
                });
                addedCount++;
            }
        }

        console.log(`✅ تمت المزامنة بنجاح! تم إصدار ${addedCount} إشعار.`);
        res.json({ success: true, count: addedCount });

    } catch (error) {
        console.error("❌ Sync Error:", error);
        res.json({ success: false, message: "حدث خطأ أثناء المزامنة: " + error.message });
    }
});

// ==================== نظام تتبع المرشحين (ATS) ====================
const candidatesFile = path.join(DATA_DIR, 'candidates.json');
let candidatesDB = safeLoadDB(candidatesFile, []);

// 1. استقبال بيانات المرشح من البوابة العامة (بدون تسجيل دخول)
// ======================================================================
// 🛡️ بوابة التوظيف المركزية (ATS - SQL Version)
// ======================================================================

// 1. تقديم طلب توظيف (مع الفحص الأمني للموظفين السابقين)
app.post('/api/submit-candidate', async (req, res) => {
    try {
        const payload = req.body;

        // 🕵️ استخبارات البوابة: هل الهوية موجودة مسبقاً في جدول الموظفين؟
        const existingEmployee = await prisma.employee.findFirst({
            where: { idNumber: String(payload.idNumber) }
        });

        await prisma.recruitment.create({
            data: {
                candidateId: 'CAN-' + Date.now(),
                name: String(payload.name),
                idNumber: String(payload.idNumber || ''),
                dobG: payload.dobG,
                dobHijri: payload.dobHijri,
                phone: payload.phone,
                email: payload.email,
                city: payload.city,
                jobTitle: payload.jobTitle,
                status: 'pending',
                isFormerEmployee: !!existingEmployee // true إذا كان موظفاً سابقاً
            }
        });

        res.json({ success: true, message: "تم تسجيل الطلب بنجاح" });
    } catch (e) {
        console.error("❌ Error submitting candidate:", e);
        res.json({ success: false, message: "حدث خطأ أثناء التقديم" });
    }
});

// 2. جلب المرشحين لغرفة عمليات الموارد البشرية
app.get('/api/candidates', async (req, res) => {
    try {
        const candidates = await prisma.recruitment.findMany({
            orderBy: { createdAt: 'desc' } // الأحدث أولاً (مثل unshift القديمة)
        });
        res.json(candidates);
    } catch (e) {
        res.json([]);
    }
});

// 3. اتخاذ قرار (قبول / رفض)
app.post('/api/update-candidate', async (req, res) => {
    try {
        const { id, status, hrComment, hrName } = req.body;
        
        await prisma.recruitment.update({
            where: { candidateId: id }, // نستخدم candidateId الذي يبدأ بـ CAN-
            data: {
                status: status,
                hrComment: hrComment || '',
                hrName: hrName || '',
                actionDate: new Date()
            }
        });
        
        res.json({ success: true });
    } catch (e) {
        console.error("❌ Error updating candidate:", e);
        res.json({ success: false });
    }
});

// 2. جلب المرشحين لشاشة الموارد البشرية
app.get('/api/candidates', (req, res) => res.json(candidatesDB));

// 3. تحديث حالة المرشح (قبول / رفض)
app.post('/api/update-candidate', (req, res) => {
    const { id, status, hrComment, hrName } = req.body;
    const index = candidatesDB.findIndex(c => c.id === id);
    if (index > -1) {
        candidatesDB[index].status = status;
        candidatesDB[index].hrComment = hrComment;
        candidatesDB[index].hrName = hrName;
        candidatesDB[index].actionDate = new Date().toISOString();
        fs.writeFileSync(candidatesFile, JSON.stringify(candidatesDB, null, 2));
        res.json({ success: true });
    } else {
        res.json({ success: false });
    }
});
// مسار جلب تقارير الإدارة (يجلب كل شيء)
app.get('/api/admin-requests', async (req, res) => {
    try {
        // كود الاتصال بقاعدة البيانات (MongoDB, MySQL, etc)
        // const requests = await Database.getAllRequests();
        // res.json(requests);
    } catch (error) {
        res.status(500).json({ success: false, message: "خطأ في السيرفر" });
    }
});
// 📍 تحديث وقت آخر نشاط للموظف عند ضغطه على الرئيسية
app.post('/api/update-activity', (req, res) => {
    try {
        const { username } = req.body;
        const user = usersDB.find(u => u.username === username);
        
        if (user) {
            // تحديث الوقت بالصيغة التي طلبتها تماماً
            user.timestamp = new Date().toISOString(); 
            fs.writeFileSync(usersFile, JSON.stringify(usersDB, null, 2));
        }
        res.json({ success: true });
    } catch (error) {
        console.error("خطأ صامت في تحديث النشاط:", error);
        res.json({ success: false });
    }
});
// ======================================================================
// 📡 رادار النواقص والغياب (SQL Version - High Performance)
// ======================================================================
app.post('/api/missing-attendance', async (req, res) => {
    try {
        const { managerName, lookbackDays = 7 } = req.body;

        if (!managerName) {
            return res.json({ success: false, message: 'معرف المستخدم مطلوب.' });
        }

        // 💡 1. استخراج المستخدم من SQL
        const requestingUser = await prisma.employee.findFirst({
            where: {
                OR: [
                    { username: String(managerName).trim() },
                    { name: String(managerName).trim() }
                ]
            }
        });

        const actualManagerName = requestingUser ? requestingUser.name : managerName;
        const isSuperAdmin = requestingUser && (requestingUser.role === 'admin' || requestingUser.roleArabic === 'ادمن');

        // 💡 2. جلب فريق العمل من SQL بذكاء (للمدير أو لكل الشركة إذا كان أدمن)
        const team = await prisma.employee.findMany({
            where: {
                isActive: true, // يجب أن يكون حسابه فعالاً
                status: {
                    in: ['in duty', 'نشط', 'على رأس العمل', 'active', 'in Duty'] // على رأس العمل فقط
                },
                ...(isSuperAdmin ? {} : { directManager: actualManagerName }) // فلتر المدير المباشر يطبق فقط لغير الأدمن
            }
        });

        if (team.length === 0) {
            return res.json({ success: true, count: 0, data: [] });
        }

        // استخراج أرقام الفريق للبحث السريع
        const teamUsernames = team.map(u => u.username);

        // 💡 3. إعداد التواريخ (توقيت السعودية)
        const todayRiyadh = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Riyadh' }));
        todayRiyadh.setHours(0,0,0,0);

        // ⚡ التعديل الجوهري هنا: البحث عبر العلاقات (Relation Query)
        const teamAttendances = await prisma.attendance.findMany({
            where: {
                employee: { 
                    username: { in: teamUsernames } 
                }
            },
            include: {
                employee: true // نطلب من السيرفر إرفاق بيانات الموظف مع تحضيره لكي نعرف الـ username
            }
        });

        // تحويل التحضيرات إلى "خريطة سريعة" (Set)
        const attendanceMap = new Set(teamAttendances.map(a => {
            // Prisma تعيد التاريخ كـ (Object)، يجب تحويله لنص ليتطابق مع الرادار
            const d = new Date(a.date);
            const yyyy = d.getFullYear();
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            const formattedDate = `${yyyy}-${mm}-${dd}`;
            
            // نستخدم a.employee.username لأن الـ username موجود داخل علاقة الموظف
            return `${a.employee.username}_${formattedDate}`;
        }));

        const missingRecords = [];

        // 💡 4. المحرك الزمني (الرجوع للخلف)
        for (let i = 1; i <= lookbackDays; i++) {
            const checkDate = new Date(todayRiyadh);
            checkDate.setDate(checkDate.getDate() - i);
            
            // هندسة صياغة التاريخ (YYYY-MM-DD) ليتطابق تماماً مع المسجل في SQL
            const yyyy = checkDate.getFullYear();
            const mm = String(checkDate.getMonth() + 1).padStart(2, '0');
            const dd = String(checkDate.getDate()).padStart(2, '0');
            const dateString = `${yyyy}-${mm}-${dd}`;
            
            const dayName = checkDate.toLocaleDateString('ar-SA', { weekday: 'long', timeZone: 'Asia/Riyadh' });
            
            // 💡 5. فحص كل موظف
            team.forEach(emp => {
                // حماية تاريخ التعيين (لا نحسب غياباً قبل توظيفه)
                if (emp.joinDate && emp.joinDate !== 'غير مسجل') {
                    const empJoinDate = new Date(emp.joinDate);
                    empJoinDate.setHours(0,0,0,0);
                    if (empJoinDate > checkDate) return; 
                }

                // هل يوجد له تحضير في الخريطة السريعة؟
                if (!attendanceMap.has(`${emp.username}_${dateString}`)) {
                    missingRecords.push({
                        username: emp.username,
                        name: emp.name,
                        date: dateString,
                        dayName: dayName
                    });
                }
            });
        }

        // 💡 6. الترتيب من الأقدم للأحدث
        missingRecords.sort((a, b) => new Date(a.date) - new Date(b.date));

        res.json({ success: true, count: missingRecords.length, data: missingRecords });

    } catch (error) {
        console.error("❌ خطأ في رادار النواقص (SQL):", error);
        res.status(500).json({ success: false, message: 'حدث خطأ داخلي أثناء البحث عن النواقص في قاعدة البيانات.' });
    }
});

// ==================== 🚀 محركات الهجرة الصاروخية (SQL Migration) 🚀 ====================

// 1. مسار الهجرة الصاروخية للإجازات (Leaves)
app.get('/api/secret-migrate-leaves-bulk', async (req, res) => {
    try {
        console.log("🚀 بدء عملية الهجرة الصاروخية للإجازات...");
        
        // نستخدم leavesDB المعرفة لديك مسبقاً في الكود
        const allEmployees = await prisma.employee.findMany({ select: { id: true, username: true } });
        const empMap = new Map();
        allEmployees.forEach(emp => empMap.set(emp.username.toLowerCase(), emp.id));

        const safeIsoDate = (dateString) => {
            if (!dateString) return new Date().toISOString();
            try { const d = new Date(dateString); return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString(); } 
            catch (e) { return new Date().toISOString(); }
        };

        let readyData = [];
        let missingUsers = new Set();

        for (const record of leavesDB) { 
            const lowerUser = record.username ? record.username.toString().toLowerCase() : '';
            const empId = empMap.get(lowerUser);

            if (empId) {
                readyData.push({
                    employeeId: empId,
                    type: record.type || 'سنوية',
                    startDate: safeIsoDate(record.startDate),
                    duration: parseInt(record.duration) || 0,
                    endDate: safeIsoDate(record.endDate),
                    returnDate: safeIsoDate(record.returnDate),
                    enteryDate: safeIsoDate(record.entryDate) 
                });
            } else {
                if (record.username) missingUsers.add(record.username);
            }
        }

        console.log(`🚛 تم تجهيز ${readyData.length} إجازة. بدء الحقن...`);
        const chunkSize = 10000;
        let insertedCount = 0;

        for (let i = 0; i < readyData.length; i += chunkSize) {
            const chunk = readyData.slice(i, i + chunkSize);
            await prisma.leave.createMany({ data: chunk, skipDuplicates: true });
            insertedCount += chunk.length;
        }

        res.json({ success: true, message: "🏁 تمت هجرة الإجازات بنجاح!", stats: { totalInJson: leavesDB.length, successfullyInserted: insertedCount, missingUsersCount: missingUsers.size }});
    } catch (error) { console.error('❌ خطأ في هجرة الإجازات:', error); res.status(500).json({ success: false, message: error.message }); }
});

// 2. مسار الهجرة الصاروخية للعقوبات (Penalties)
app.get('/api/secret-migrate-penalties-bulk', async (req, res) => {
    try {
        console.log("🚀 بدء عملية الهجرة الصاروخية للعقوبات...");
        
        // نستخدم penaltiesHistoryDB المعرفة لديك مسبقاً في الكود
        const allEmployees = await prisma.employee.findMany({ select: { id: true, username: true } });
        const empMap = new Map();
        allEmployees.forEach(emp => empMap.set(emp.username.toLowerCase(), emp.id));

        const safeIsoDate = (dateString) => {
            if (!dateString) return new Date().toISOString();
            try { const d = new Date(dateString); return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString(); } 
            catch (e) { return new Date().toISOString(); }
        };

        let readyData = [];
        let missingUsers = new Set();

        for (const record of penaltiesHistoryDB) { 
            const lowerUser = record.empUsername ? record.empUsername.toString().toLowerCase() : '';
            const empId = empMap.get(lowerUser);

            if (empId) {
                readyData.push({
                    employeeId: empId,
                    managerName: record.managerName || '',
                    violationDate: safeIsoDate(record.violationDate),
                    category: record.category || '',
                    violationName: record.violationName || '',
                    managerComment: record.managerComment || '',
                    isAdmit: record.isAdmit === true || record.isAdmit === "true",
                    requestLessPunishment: record.requestLessPunishment === true || record.requestLessPunishment === "true",
                    actualOccurrence: parseInt(record.actualOccurrence) || 1,
                    appliedPenalty: record.appliedPenalty ? record.appliedPenalty.toString() : '',
                    displayPenalty: record.displayPenalty || '',
                    status: record.status || '',
                    attachment: record.attachment || '',
                    hrComment: record.hrComment || '',
                    hrName: record.hrName || '',
                    timestamp: safeIsoDate(record.timestamp)
                });
            } else {
                if (record.empUsername) missingUsers.add(record.empUsername);
            }
        }

        console.log(`🚛 تم تجهيز ${readyData.length} عقوبة. بدء الحقن...`);
        const chunkSize = 10000;
        let insertedCount = 0;

        for (let i = 0; i < readyData.length; i += chunkSize) {
            const chunk = readyData.slice(i, i + chunkSize);
            await prisma.penalty.createMany({ data: chunk, skipDuplicates: true });
            insertedCount += chunk.length;
        }

        res.json({ success: true, message: "🏁 تمت هجرة العقوبات بنجاح!", stats: { totalInJson: penaltiesHistoryDB.length, successfullyInserted: insertedCount, missingUsersCount: missingUsers.size }});
    } catch (error) { console.error('❌ خطأ في هجرة العقوبات:', error); res.status(500).json({ success: false, message: error.message }); }
});

// =======================================================================================
// (تأكد أن هذا السطر هو آخر سطر في الملف دائماً)

// 🚀 مسار سري لتهجير الموظفين بكافة تفاصيلهم من JSON إلى SQL (التحديث الشامل)
app.get('/api/secret-migrate-users-full', async (req, res) => {
    try {
        console.log("⏳ بدء عملية التهجير الشاملة لبيانات الموظفين...");
        
        let successCount = 0;
        let failCount = 0;
        let errorDetails = [];

        for (const user of usersDB) {
            try {
                // تجميع كل بيانات الموظف (مع تحويل الأنواع لتناسب Prisma)
                const fullUserData = {
                    name: user.name || 'بدون اسم',
                    password: user.password || '123456',
                    idNumber: user.idNumber ? user.idNumber.toString() : '',
                    idExpiry: user.idExpiry || '',
                    nationality: user.nationality || '',
                    gender: user.gender || 'ذكر',
                    dobG: user.dobG || '',
                    dobHijri: user.dobHijri || '',
                    phone: user.phone ? user.phone.toString() : '',
                    email: user.email || '',
                    city: user.city || '',
                    region: user.region || '',
                    splAddress: user.splAddress || '',
                    joinDate: user.joinDate || '',
                    status: user.status || 'in Duty',
                    isActive: user.isActive !== false, // إذا لم تكن false صراحة، فهي true
                    branch: user.branch || '',
                    primarySection: user.primarySection || '',
                    jobTitle: user.jobTitle || 'موظف',
                    role: user.role || (user.roleArabic === 'ادمن' ? 'admin' : 'user'),
                    roleArabic: user.roleArabic || 'موظف',
                    directManager: user.directManager || '',
                    workingDays: parseInt(user.workingDays) || 6,
                    offDays: parseInt(user.offDays) || 1,
                    lastWorkingDay: user.lastWorkingDay || '',
                    basicSalary: user.basicSalary ? user.basicSalary.toString() : '0',
                    housingAllowance: user.housingAllowance ? user.housingAllowance.toString() : '0',
                    otherAllowance: user.otherAllowance ? user.otherAllowance.toString() : '0',
                    salaryE: user.salaryE ? user.salaryE.toString() : '0',
                    gosiFees: user.gosiFees ? user.gosiFees.toString() : '0',
                    bankName: user.bankName || '',
                    bankIban: user.bankIban || '',
                    leaveCredit: parseFloat(user.leaveCredit) || 0,
                    usedLeaves: parseFloat(user.usedLeaves) || 0,
                    leaveBalance: parseFloat(user.leaveBalance) || 0,
                    medicalIns: user.medicalIns || '',
                    insType: user.insType || 'Company',
                    insExpiry: user.insExpiry || '',
                    baladiyahCondition: user.baladiyahCondition || 'لا يوجد',
                    baladiyahValid: user.baladiyahValid || '',
                    baladiyahFees: user.baladiyahFees ? user.baladiyahFees.toString() : '0',
                    emergencyName: user.emergencyName || '',
                    emergencyNumber: user.emergencyNumber ? user.emergencyNumber.toString() : '',
                    emergencyRelation: user.emergencyRelation || '',
                    lastLogin: user.lastLogin || 'لم يسجل دخول بعد'
                };

                // نستخدم upsert: تحديث الشامل للموجود، أو إنشاء جديد لمن سقط سهواً
                await prisma.employee.upsert({
                    where: { username: user.username.toString() },
                    update: fullUserData,
                    create: {
                        username: user.username.toString(),
                        ...fullUserData
                    }
                });
                
                successCount++;
            } catch (err) {
                failCount++;
                if (errorDetails.length < 15) { // حفظ أول 15 خطأ فقط للتشخيص
                    errorDetails.push(`الموظف ${user.username}: ${err.message}`);
                }
            }
        }

        console.log(`✅ انتهى التحديث الشامل: نجح ${successCount}، فشل ${failCount}`);
        
        res.json({
            success: true,
            message: "🏁 تمت عملية هجرة تفاصيل الموظفين العظمى بنجاح!",
            stats: {
                totalInJson: usersDB.length,
                successCount: successCount,
                failCount: failCount,
                sampleErrors: errorDetails
            }
        });

    } catch (error) {
        console.error('❌ حدث انهيار أثناء التحديث الشامل:', error);
        res.status(500).json({ success: false, message: "خطأ قاتل: " + error.message });
    }
});

// ======================================================================
// ======================================================================
// 🚀 مسار الهجرة الصاروخية لنظام الطلبات (التصميم المعماري الجديد)
// ======================================================================
app.get('/api/secret-migrate-requests', async (req, res) => {
    try {
        console.log("🚀 بدء هجرة الطلبات والتذاكر إلى SQL...");
        
        const allEmployees = await prisma.employee.findMany({ select: { id: true, username: true } });
        const empMap = new Map();
        allEmployees.forEach(emp => empMap.set(emp.username.toString().trim(), emp.id));

        let readyData = [];
        let missingUsersCount = 0;

        for (const reqItem of requestsDB) {
            const cleanUsername = reqItem.empUsername ? reqItem.empUsername.toString().trim() : '';
            const empId = empMap.get(cleanUsername);

            if (empId) {
                readyData.push({
                    ticketId: reqItem.id.toString(), // 🌟 تم توجيه الرقم القديم إلى ticketId
                    employeeId: empId,
                    empUsername: cleanUsername,
                    empName: reqItem.empName || '',
                    senderId: reqItem.senderId ? reqItem.senderId.toString() : '',
                    empPhone: reqItem.empPhone ? reqItem.empPhone.toString() : '',
                    managerName: reqItem.managerName || '',
                    hrSupervisor: reqItem.hrSupervisor || '',
                    assignedHrEmp: reqItem.assignedHrEmp || '',
                    type: reqItem.type || reqItem.reason || 'غير محدد',
                    details: reqItem.details || '',
                    attachment: reqItem.attachment || '',
                    status: reqItem.status || 'pending',
                    createdAt: reqItem.createdAt || reqItem.date || new Date().toLocaleString('ar-SA'),
                    resolveDate: reqItem.resolveDate || '',
                    duration: reqItem.duration || reqItem.processingTime || '',
                    managerComment: reqItem.managerComment || '',
                    hrComment: reqItem.hrComment || '',
                    supervisorAssignComment: reqItem.supervisorAssignComment || '',
                    supervisorRejectComment: reqItem.supervisorRejectComment || '',
                    escalationComment: reqItem.escalationComment || '',
                    empComment: reqItem.empComment || '',
                    rating: reqItem.rating || reqItem.managerRating || '',
                    resolvedBy: reqItem.resolvedBy || '',
                    history: reqItem.history ? JSON.stringify(reqItem.history) : '[]'
                });
            } else {
                missingUsersCount++;
            }
        }

        console.log(`🚛 تم تجهيز ${readyData.length} تذكرة للحقن...`);
        
        // الحقن المباشر مع تجاهل المكرر بناءً على الـ ticketId الفريد
        const inserted = await prisma.requestTicket.createMany({
            data: readyData,
            skipDuplicates: true 
        });

        res.json({ 
            success: true, 
            message: "🏁 تمت هجرة التذاكر بنجاح بالتصميم الجديد!", 
            stats: { 
                totalInJson: requestsDB.length, 
                successfullyInserted: inserted.count, 
                missingUsersTickets: missingUsersCount 
            }
        });
    } catch (error) {
        console.error('❌ خطأ في هجرة التذاكر:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ======================================================================
// 👑 5. مسار الرقابة الشاملة للإدارة العليا (يجلب كل شيء بدون فلاتر)
// ======================================================================
app.post('/api/admin-mega-requests', async (req, res) => {
    try {
        const { isAdmin } = req.body;
        
        // 🛡️ حماية أمنية: إذا لم يكن المستخدم مديراً، نطرده فوراً
        if (!isAdmin && String(isAdmin) !== 'true') {
            return res.json([]); 
        }

        // 🔍 جلب كل التذاكر في قاعدة البيانات من الأحدث للأقدم (بدون أي استثناءات)
        const allRequests = await prisma.requestTicket.findMany({
            orderBy: { id: 'desc' }
        });

        // 🔄 المترجم الذكي للواجهة الأمامية
        const formattedRequests = allRequests.map(r => ({
            id: r.ticketId,
            employeeId: r.employeeId,
            empUsername: r.empUsername || '',
            empName: r.empName || '',
            senderId: r.senderId || '',
            empPhone: r.empPhone || '',
            managerName: r.managerName || '',
            hrSupervisor: r.hrSupervisor || '',
            assignedHrEmp: r.assignedHrEmp || '',
            reason: r.type || '',
            type: r.type || '',
            details: r.details || '',
            attachment: r.attachment || '',
            status: r.status || 'pending',
            date: r.createdAt || '',
            createdAt: r.createdAt || '',
            resolveDate: r.resolveDate || '',
            managerComment: r.managerComment || '',
            hrComment: r.hrComment || '',
            history: r.history ? JSON.parse(r.history) : []
        }));

        res.json(formattedRequests);
    } catch (error) {
        console.error("❌ خطأ في مسار الإدارة العليا:", error);
        res.json([]);
    }
});

// ======================================================================
// 👑 مسار الإدارة العليا لتحديث الطلبات بالقوة الجبرية (SQL Version - ذكي جداً)
// ======================================================================
app.post('/api/admin-update-request', async (req, res) => {
    try {
        const { ticketId, status, hrComment, adminName } = req.body;

        if (!ticketId) return res.json({ success: false, message: 'رقم التذكرة مفقود' });

        // ⚡ السحر هنا: البحث المزدوج الذكي (عبر id أو ticketId)
        const numericId = parseInt(ticketId.toString().replace('REQ-', '')); // استخراج الرقم الصافي في حال كان هناك حروف
        
        const ticket = await prisma.requestTicket.findFirst({
            where: {
                OR: [
                    { ticketId: String(ticketId) },
                    ...(isNaN(numericId) ? [] : [{ id: numericId }]) // البحث بالـ ID الداخلي إن وجد
                ]
            }
        });

        if (!ticket) return res.json({ success: false, message: 'التذكرة غير موجودة في السجلات' });

        // 2. تحديث سجل التاريخ (History Array)
        let history = ticket.history ? JSON.parse(ticket.history) : [];
        history.push({
            date: new Date().toLocaleString('ar-SA', { timeZone: 'Asia/Riyadh' }),
            action: `تدخل إداري: تغيير الحالة إلى (${status})`,
            by: adminName || 'الإدارة العليا',
            note: hrComment || 'لا يوجد تعليق إضافي'
        });

        // 3. تجهيز بيانات التحديث
        const updateData = {
            status: status,
            history: JSON.stringify(history)
        };

        if (hrComment) updateData.hrComment = hrComment;

        if (status === 'resolved' || status === 'completed' || status === 'rejected') {
            updateData.resolveDate = new Date().toLocaleString('en-CA', { timeZone: 'Asia/Riyadh' });
        }

        // 4. تنفيذ الأمر في قلب الـ SQL (باستخدام المعرف الداخلي الآمن ticket.id)
        await prisma.requestTicket.update({
            where: { id: ticket.id }, 
            data: updateData
        });

        // توثيق أمني
        if (typeof safeLogAudit === 'function') {
            safeLogAudit(adminName || 'الإدمن', 'تحديث طلب سيادي', `تم تحديث الطلب الداخلي ${ticket.id} إلى ${status}`, 'SQL System');
        }

        res.json({ success: true, message: 'تم تحديث حالة الطلب بنجاح' });

    } catch (error) {
        console.error("❌ خطأ في مسار التحكم السيادي للطلبات:", error);
        res.status(500).json({ success: false, message: 'حدث خطأ في السيرفر أثناء تحديث الطلب' });
    }
});

app.listen(process.env.PORT || 3000, '0.0.0.0', () => console.log(`🚀 السيرفر يعمل بنظام الرقابة الذكي والآمن!`));

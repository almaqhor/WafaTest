require('dotenv').config();
const express = require('express');
const app = express(); 
app.use((req, res, next) => {
    console.log(`📡 طلب قادم: [${req.method}] ${req.url}`);
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

app.post('/auth/v1/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const lowerUser = username.toString().toLowerCase();

    // 🕵️‍♂️ محاولة البحث في SQL
    let user = await prisma.employee.findUnique({
      where: { username: lowerUser }
    });

    // 🚨 حركة إنقاذ مطورة: زرع الأدمن ببيانات كاملة لتجنب رفض القاعدة
 if (!user && lowerUser === 'admin') {
        console.log("🛠️ محاولة زرع حساب الأدمن بالحد الأدنى المتوافق...");
        user = await prisma.employee.create({
            data: {
                username: 'admin',
                password: '123',
                name: 'مدير النظام (SQL)',
                role: 'admin',
                isActive: true
                // 🛑 تم حذف roleArabic وكل ما يسبب ValidationError
                // لكي يوافق Prisma على الطلب فوراً
            }
        });
    }
    // التحقق من البيانات
    if (user && user.password === password.toString()) {
      if (user.isActive === false) return res.status(403).json({ success: false, message: "الحساب موقوف" });

      const lastLoginTime = new Date().toLocaleString('en-CA', { 
        timeZone: 'Asia/Riyadh', hour12: true, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' 
      });

      const updatedUser = await prisma.employee.update({
        where: { id: user.id },
        data: { lastLogin: lastLoginTime }
      });

      res.json({ success: true, ...updatedUser });
    } else {
      res.status(401).json({ success: false, message: "بيانات غير صحيحة" });
    }
  } catch (error) {
    console.error('❌ SQL Login Error Detail:', error); // هذا السطر سيطبع لنا السبب الحقيقي في الـ Logs
    res.status(500).json({ success: false, message: "خطأ في قاعدة البيانات: " + error.message });
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

app.get('/api/branch-targets', (req, res) => res.json(branchTargetsDB));
app.post('/api/branch-targets', (req, res) => {
    branchTargetsDB = req.body;
    fs.writeFileSync(branchTargetsFile, JSON.stringify(branchTargetsDB, null, 2));
    res.json({ success: true });
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


app.get('/api/users', (req, res) => { res.json(usersDB.filter(u => u.username !== 'admin')); });

app.get('/api/managers', (req, res) => { 
    const managers = usersDB.filter(u => (u.roleArabic || "").includes('مدير') || u.role === 'admin').map(u => u.name);
    const uniqueManagers = [...new Set(managers)];
    res.json(uniqueManagers); 
});

// ==================== إضافة مستخدم جديد (نسخة ذكية تقرأ حالة الموظف) ====================
// ==================== إضافة مستخدم جديد (النسخة الاحترافية لـ SQL) ====================
app.post('/api/user-add', async (req, res) => { // ⬅️ أضفنا async هنا
    try {
        const data = req.body;

        // 🕵️ 1. البحث في SQL بدلاً من المصفوفة
        const existingUser = await prisma.employee.findUnique({
            where: { username: data.username.toString() }
        });

        if (existingUser) {
            return res.json({ success: false, message: 'رقم الموظف موجود مسبقاً في SQL' });
        }

        // 💾 2. الحفظ المباشر في قاعدة البيانات SQL
        const newUser = await prisma.employee.create({
            data: {
                username: data.username.toString(),
                name: data.name,
                password: data.password || '123456',
                idNumber: data.idNumber || '',
                city: data.city || '',
                branch: data.branch || '',
                jobTitle: data.jobTitle || '',
                role: data.roleArabic === 'ادمن' ? 'admin' : 'user', // تحديد الدور برمجياً
                roleArabic: data.roleArabic || 'موظف',
                basicSalary: (data.basicSalary || 0).toString(),
                isActive: data.isActive !== undefined ? data.isActive : true,
                lastLogin: 'لم يسجل دخول بعد'
                // ملاحظة: تأكد أن هذه الحقول موجودة في ملف schema.prisma الخاص بك
            }
        });

        // 📝 3. تسجيل الحدث في سجل الرقابة (Audit Log)
        safeLogAudit(data.byUser, 'إضافة موظف جديد', `${data.name} (${data.username})`, `SQL Storage`);

        res.json({ success: true, message: 'تم حفظ الموظف في قاعدة البيانات بنجاح' });

    } catch (error) {
        console.error('❌ خطأ في إضافة المستخدم لـ SQL:', error);
        res.status(500).json({ success: false, message: 'حدث خطأ في السيرفر أثناء الكتابة في SQL: ' + error.message });
    }
});

// 🌟 مسار تسجيل موافقة الموظف على الإقرار 🌟
app.post('/api/confirm-policy', (req, res) => {
    const { username } = req.body;
    const index = usersDB.findIndex(u => u.username === username);
    if (index > -1) {
        usersDB[index].policyConfirmed = true; // تحويل المتغير إلى صحيح
        fs.writeFileSync(usersFile, JSON.stringify(usersDB, null, 2));
        res.json({ success: true });
    } else {
        res.status(404).json({ success: false });
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

        // 2. تأمين: فحص مصفوفة الموظفين (إذا كان التابعون مخزنين بداخلها)
        if (typeof usersDB !== 'undefined' && Array.isArray(usersDB)) {
            const user = usersDB.find(u => String(u.username) === String(username));
            
            // تحقق مما إذا كان الموظف لديه حقل تابعين وهو مصفوفة وبها بيانات
            if (user && user.dependents && Array.isArray(user.dependents) && user.dependents.length > 0) {
                hasDependents = true;
            }
        } 
        /* ملاحظة: إذا كنت تخزن التابعين في ملف/مصفوفة منفصلة مثل dependentsDB
        قم بتفعيل هذا الكود بدلاً من الكود أعلاه:
        
        if (typeof dependentsDB !== 'undefined' && Array.isArray(dependentsDB)) {
            const userDeps = dependentsDB.filter(d => String(d.username) === String(username));
            if (userDeps.length > 0) hasDependents = true;
        }
        */

        // 3. الإرجاع السليم بصيغة JSON دائماً
        res.json({ hasDependents: hasDependents });

    } catch (error) {
        // 4. صيد الأخطاء: إذا حدث أي انهيار، السيرفر لن يموت، بل سيرسل JSON يخبر الواجهة بالخطأ
        console.error("❌ خطأ داخلي في فحص التابعين:", error);
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


// 🌟 مسار حذف المستخدم نهائياً 🌟
app.post('/api/user-delete', (req, res) => {
    const { username, replacementManager } = req.body;
    const userIndex = usersDB.findIndex(u => u.username === username);
    if (userIndex > -1) {
        const deletedUserName = usersDB[userIndex].name;
        
        // نقل العهدة إذا كان مديراً
        if (replacementManager) {
            usersDB.forEach(u => { if (u.directManager === deletedUserName) u.directManager = replacementManager; });
            requestsDB.forEach(r => { if (r.managerName === deletedUserName) r.managerName = replacementManager; });
        }

        // 🧹 التنظيف الذكي: الإغلاق الإجباري لجميع طلبات الموظف قبل حذفه 🧹
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

        usersDB.splice(userIndex, 1);
        fs.writeFileSync(usersFile, JSON.stringify(usersDB, null, 2));
    }
    res.json({ success: true });
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

app.get('/api/users-log', (req, res) => {
    const log = usersDB.filter(u => u.username !== 'admin').map(u => ({ username: u.username, name: u.name, branch: u.branch, lastLogin: u.lastLogin || "لم يسجل دخوله بعد" }));
    res.json(log);
});

// ==================== جلب فريق العمل للمدير المباشر ====================
// ==================== جلب فريق العمل للمدير المباشر ====================
app.post('/api/my-team', (req, res) => {
    const { managerName } = req.body;
    
    // الفلترة الذكية (استبعاد العرض الوظيفي والمستقيل)
    const team = usersDB.filter(u => 
        u.username && u.username.trim() !== '' && 
        u.name && u.name.trim() !== '' &&         
        u.directManager === managerName && 
        u.status !== 'Job Offer' && 
        u.status !== 'Resign' && 
        u.status !== 'Terminated' && 
        u.isActive !== false
    );
    
    // 🔥 السحر هنا: نرسل الفريق مباشرة لأن الوردية محفوظة مسبقاً داخل بياناتهم 🔥
    res.json(team);
});


// ==================== جلب فريق العمل للتحضير ====================
// ==================== جلب فريق العمل للتحضير ====================
app.post('/api/attendance-team', (req, res) => {
    try {
        const { managerName } = req.body;
        
        const team = usersDB.filter(u => {
            // 1. هل الموظف يتبع لهذا المدير؟ أو هل هو المدير نفسه؟
            const isMyEmp = u.directManager === managerName;
            const isManagerHimself = u.name === managerName; // لكي يظهر المدير في قائمة التحضير الخاصة به
            
            // 2. الفلترة حسب الحالة الوظيفية (In Duty)
            // قمنا بتوحيد حالة الأحرف (toLowerCase) لكي يقبلها سواء كُتبت in duty أو In Duty
            const statusStr = (u.status || '').trim().toLowerCase();
            const isInDuty = statusStr === 'in duty' || statusStr === 'نشط' || statusStr === 'على رأس العمل' || statusStr === 'active';
            
            return (isMyEmp || isManagerHimself) && isInDuty;
        });

        // 3. الترتيب بالرقم الوظيفي (تصاعدياً)
        team.sort((a, b) => {
            const idA = a.username ? a.username.toString() : '';
            const idB = b.username ? b.username.toString() : '';
            return idA.localeCompare(idB, undefined, { numeric: true });
        });

        res.json(team);
    } catch (error) {
        console.error("Error in /api/attendance-team:", error);
        res.json([]);
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

app.post('/api/my-requests', (req, res) => {
    try {
        const result = requestsDB.filter(r => {
            const senderMatch = (r.senderId === req.body.empUsername) || (!r.senderId && r.empUsername === req.body.empUsername);
            
            // 🛡️ درع الحماية: إذا لم تكن الحالة موجودة، نعتبرها نصاً فارغاً لمنع الانهيار
            const safeStatus = r.status || ''; 
            const statusMatch = safeStatus === 'pending' || safeStatus === 'resolved' || safeStatus === 'escalated' || safeStatus.startsWith('hr_');
            
            return senderMatch && statusMatch;
        });
        res.json(result);
    } catch (error) {
        console.error("Error in my-requests:", error);
        res.json([]); // إرجاع مصفوفة فارغة لحماية واجهة المستخدم من التعطل
    }
});
app.post('/api/manager-requests', (req, res) => { res.json(requestsDB.filter(r => r.managerName === req.body.managerName && (r.status === 'pending' || r.status === 'resolved'))); });
app.post('/api/manager-history', (req, res) => {
    const { managerName, searchQuery } = req.body;
    let history = requestsDB.filter(r => r.managerName === managerName && r.status === 'completed');
    if (searchQuery && searchQuery.trim() !== "") history = history.filter(r => r.empUsername && r.empUsername.includes(searchQuery.trim().toLowerCase()));
    history.sort((a, b) => parseInt(b.id) - parseInt(a.id));
    res.json(history.slice(0, 10));
});
app.post('/api/resolve-request', (req, res) => {
    const { id, comment } = req.body;
    const reqIndex = requestsDB.findIndex(r => r.id === id);
    if (reqIndex > -1) {
        requestsDB[reqIndex].status = 'resolved'; requestsDB[reqIndex].managerComment = comment; requestsDB[reqIndex].resolveDate = getRiyadhTime();
        const diffMins = Math.round((Date.now() - parseInt(requestsDB[reqIndex].id)) / 60000);
        requestsDB[reqIndex].duration = diffMins < 60 ? `${diffMins} دقيقة` : `${Math.floor(diffMins / 60)} س و ${diffMins % 60} د`;
        fs.writeFileSync(requestsFile, JSON.stringify(requestsDB, null, 2));
    }
    res.json({ success: true });
});
app.post('/api/confirm-request', (req, res) => {
    const { id, rating, empComment } = req.body;
    const reqIndex = requestsDB.findIndex(r => r.id === id);
    if (reqIndex > -1) { 
        requestsDB[reqIndex].status = 'completed'; 
        requestsDB[reqIndex].rating = rating || "5"; 
        requestsDB[reqIndex].empComment = empComment || ""; 
        fs.writeFileSync(requestsFile, JSON.stringify(requestsDB, null, 2)); 
    }
    res.json({ success: true });
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
            locations: locationsDB
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

// ==================== إدارة النسخ الاحتياطية الشاملة ====================
// (مسار الجلب /api/backup يبقى كما هو عندك بدون تعديل)

// 🔥 التعديل هنا: إضافة upload.single('backupFile') لفك تشفير الملف 
app.post('/api/restore-backup', upload.single('backupFile'), (req, res) => {
    try {
        // 🛡️ استخدام req.file بدلاً من req.files
        if (!req.file) {
            return res.json({ success: false, message: 'لم يتم إرفاق ملف!' });
        }

        // قراءة الملف من الـ buffer الخاص بمكتبة multer
        const backupData = JSON.parse(req.file.buffer.toString('utf8'));

        if (backupData.users) { usersDB = backupData.users; fs.writeFileSync(usersFile, JSON.stringify(usersDB, null, 2)); }
        if (backupData.requests) { requestsDB = backupData.requests; fs.writeFileSync(requestsFile, JSON.stringify(requestsDB, null, 2)); }
        if (backupData.announcements) { announcementsDB = backupData.announcements; fs.writeFileSync(announcementsFile, JSON.stringify(announcementsDB, null, 2)); }
        if (backupData.attendance) { attendanceDB = backupData.attendance; fs.writeFileSync(attendanceFile, JSON.stringify(attendanceDB, null, 2)); }
        if (backupData.reasons) { reasonsDB = backupData.reasons; fs.writeFileSync(reasonsFile, JSON.stringify(reasonsDB, null, 2)); }
        if (backupData.forms) { formsDB = backupData.forms; fs.writeFileSync(formsFile, JSON.stringify(formsDB, null, 2)); }
        if (backupData.policies) { policiesDB = backupData.policies; fs.writeFileSync(policiesFile, JSON.stringify(policiesDB, null, 2)); }
        if (backupData.branches) { branchesDB = backupData.branches; fs.writeFileSync(branchesFile, JSON.stringify(branchesDB, null, 2)); }
        if (backupData.jobs) { jobsDB = backupData.jobs; fs.writeFileSync(jobsFile, JSON.stringify(jobsDB, null, 2)); }
        if (backupData.shiftsConfig) { shiftsConfigDB = backupData.shiftsConfig; fs.writeFileSync(path.join(__dirname, 'data', 'shiftsConfig.json'), JSON.stringify(shiftsConfigDB, null, 2)); }
        if (backupData.shifts) { shiftsDB = backupData.shifts; fs.writeFileSync(path.join(__dirname, 'data', 'shifts.json'), JSON.stringify(shiftsDB, null, 2)); }
        if (backupData.locations) { 
            locationsDB = backupData.locations; 
            fs.writeFileSync(locationsFile, JSON.stringify(locationsDB, null, 2)); 
        }

        res.json({ success: true, message: 'تمت استعادة النسخة بنجاح!' });
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

app.post('/api/save-attendance', (req, res) => {
    const { date, managerName, records } = req.body;
    
    const usernames = records.map(r => r.username);
    attendanceDB = attendanceDB.filter(a => !(a.date === date && usernames.includes(a.username)));

    records.forEach(r => {
        attendanceDB.push({
            date,
            managerName,
            username: r.username,
            name: r.name,
            code: r.code,
            timestamp: new Date().toISOString()
        });
    });

    fs.writeFileSync(attendanceFile, JSON.stringify(attendanceDB, null, 2));
    res.json({ success: true });
});




// ======================================================================
// 1. مسار جلب التحضير اليومي (محدث للمنطق المعماري الجديد)
// ======================================================================
app.post('/api/get-daily-attendance', (req, res) => {
    try {
        const { date, usernames, managerName } = req.body;
        
        // فلترة مبدئية حسب التاريخ
        let records = attendanceDB.filter(a => a.date === date);

        // الفلترة الذهبية: البحث عن طريق مصفوفة أرقام الموظفين (usernames)
        if (usernames && Array.isArray(usernames)) {
            const stringUsernames = usernames.map(u => String(u));
            records = records.filter(a => stringUsernames.includes(String(a.username)));
        } 
        // فلترة احتياطية (تعمل كطوق نجاة في حال عدم توفر المصفوفة)
        else if (managerName) {
            records = records.filter(a => a.managerName === managerName);
        }

        res.json(records); // نعيد المصفوفة دائماً لتجنب انهيار الواجهة
    } catch (error) {
        console.error("Error in /api/get-daily-attendance:", error);
        res.json([]); // درع حماية للسيرفر
    }
});

// ======================================================================
// 2. مسار جلب الحالات المعلقة (T) (محدث للمنطق المعماري الجديد)
// ======================================================================
app.post('/api/get-pending-attendance', (req, res) => {
    try {
        const { usernames, managerName } = req.body;
        
        // فلترة مبدئية للحالات المعلقة (T)
        let records = attendanceDB.filter(a => a.code === 'T');

        // الفلترة الذهبية: البحث عن طريق مصفوفة أرقام الموظفين
        if (usernames && Array.isArray(usernames)) {
            const stringUsernames = usernames.map(u => String(u));
            records = records.filter(a => stringUsernames.includes(String(a.username)));
        } 
        // فلترة احتياطية
        else if (managerName) {
            records = records.filter(a => a.managerName === managerName);
        }

        res.json(records);
    } catch (error) {
        console.error("Error in /api/get-pending-attendance:", error);
        res.json([]); 
    }
});

// ======================================================================
// 3. مسار رفع الأرشيف (آلة الزمن الذكية - إكسيل)
// ======================================================================
app.post('/api/upload-historical-attendance', (req, res) => {
    try {
        const { historicalData } = req.body;
        let added = 0;
        let updated = 0;

        if (!historicalData || !Array.isArray(historicalData)) {
            return res.json({ success: false, message: "بيانات غير صالحة" });
        }

        historicalData.forEach(newRecord => {
            // البحث عما إذا كان هناك تحضير سابق لنفس الموظف في نفس اليوم
            const existingIndex = attendanceDB.findIndex(a => 
                String(a.username) === String(newRecord.username) && a.date === newRecord.date
            );
            
            if (existingIndex > -1) {
                // تحديث السجل القديم
                attendanceDB[existingIndex].code = newRecord.code;
                // توثيق أن التعديل تم عبر الأرشيف
                attendanceDB[existingIndex].managerName = newRecord.managerName || 'أرشيف النظام (إكسيل)';
                updated++;
            } else {
                // إضافة سجل جديد
                if (!newRecord.managerName) newRecord.managerName = 'أرشيف النظام (إكسيل)';
                attendanceDB.push(newRecord);
                added++;
            }
        });

        // حفظ قاعدة البيانات في الملف
        fs.writeFileSync(attendanceFile, JSON.stringify(attendanceDB, null, 2));

        res.json({ success: true, added, updated });
    } catch (error) {
        console.error("Error in /api/upload-historical-attendance:", error);
        res.json({ success: false, message: error.message });
    }
});

app.post('/api/update-pending-attendance', (req, res) => {
    const { records } = req.body; 
    let updatedCount = 0;

    records.forEach(update => {
        const idx = attendanceDB.findIndex(a => a.date === update.date && a.username === update.username);
        if (idx > -1 && update.newCode !== 'T') { 
            attendanceDB[idx].code = update.newCode;
            updatedCount++;
        }
    });

    if (updatedCount > 0) {
        fs.writeFileSync(attendanceFile, JSON.stringify(attendanceDB, null, 2));
    }
    res.json({ success: true, count: updatedCount });
});

app.get('/api/all-attendance', (req, res) => res.json(attendanceDB));



const SUPER_SECRET_PASSWORD = "Wafaa2026@Clear"; 

app.post('/api/super-cleanup', (req, res) => {
    const { password, targets } = req.body;

    if (password !== SUPER_SECRET_PASSWORD) {
        return res.json({ success: false, message: "كلمة المرور السرية غير صحيحة ❌!" });
    }

    try {
        if (targets.leaves) {
            leavesDB = [];
            fs.writeFileSync(leavesFile, JSON.stringify([], null, 2));
        }
        if (targets.attendance) {
            attendanceDB = [];
            fs.writeFileSync(attendanceFile, JSON.stringify([], null, 2));
        }
        if (targets.penalties) {
            penaltiesHistoryDB = [];
            fs.writeFileSync(penaltiesHistoryFile, JSON.stringify(penaltiesHistoryDB, null, 2));
        }
        
        if (targets.requests) {
            const reqFile = path.join(requestsFile, 'data', 'requests.json');
            if(fs.existsSync(reqFile)) fs.writeFileSync(reqFile, JSON.stringify([], null, 2));
        }
        
        if (targets.announcements) {
            const annFile = path.join(announcementsFile, 'data', 'announcements.json');
            if(fs.existsSync(annFile)) fs.writeFileSync(annFile, JSON.stringify([], null, 2));
        }

        if (targets.users) {
            usersDB = usersDB.filter(u => u.username === 'admin');
            fs.writeFileSync(usersFile, JSON.stringify(usersDB, null, 2));
        }

        res.json({ success: true });
    } catch (error) {
        console.error("خطأ في التنظيف:", error);
        res.json({ success: false, message: "حدث خطأ داخلي أثناء مسح البيانات." });
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

app.post('/api/escalate-ticket', (req, res) => {
    try {
        const { ticketId, comment, attachmentBase64, hrSupervisor, managerName } = req.body;
        
        const index = requestsDB.findIndex(r => r.id === ticketId);
        if (index === -1) return res.json({ success: false, message: 'الطلب غير موجود' });

        let attachmentPath = '';
        if (attachmentBase64) {
            let ext = '.jpg';
            let rawBase64 = attachmentBase64;
            if(attachmentBase64.startsWith('data:application/pdf')) { ext = '.pdf'; rawBase64 = attachmentBase64.replace(/^data:application\/pdf;base64,/, ""); } 
            else { rawBase64 = attachmentBase64.replace(/^data:image\/[a-z]+;base64,/, ""); }
            const fileName = `ESC-${ticketId}${ext}`;
            fs.writeFileSync(path.join(uploadsDir, fileName), rawBase64, 'base64');
            attachmentPath = `/uploads/${fileName}`;
        } 

        requestsDB[index].status = 'escalated';
        requestsDB[index].hrSupervisor = hrSupervisor; 
        requestsDB[index].escalationComment = comment; 
        requestsDB[index].attachment = attachmentPath;

        if(req.body.managerUsername) requestsDB[index].senderId = req.body.managerUsername;
        
        if(!requestsDB[index].history) requestsDB[index].history = [];
        requestsDB[index].history.push({ 
            action: `تمت الإحالة للموارد من قبل المدير ${managerName}`, 
            date: new Date().toLocaleString('ar-SA') 
        });

        fs.writeFileSync(requestsFile, JSON.stringify(requestsDB, null, 2));
        res.json({ success: true });
    } catch (e) {
        console.error('خطأ في الإحالة:', e);
        res.json({ success: false, message: 'حدث خطأ بالسيرفر' });
    }
});

app.post('/api/create-request', (req, res) => {
    try {
        const { senderUsername, empUsername, empName, empPhone, managerName, reason, details, targetEmp, isManagerForm, hrSupervisor, attachmentBase64, byUser } = req.body;        
        const actualActor = byUser || empName;
        // 🛡️ درع الحماية: التأكد أن قاعدة البيانات مصفوفة صالحة وليست معطوبة
        if (!Array.isArray(requestsDB)) {
            requestsDB = [];
        }

        let initialStatus = 'pending';
        let finalManagerName = managerName;
        let finalEmpUsername = empUsername;
        let finalEmpName = empName;
        let senderId = senderUsername || empUsername;

        let attachmentPath = '';
        if (attachmentBase64) {
            const ticketId = 'REQ-' + Date.now(); 
            let ext = '.jpg';
            let rawBase64 = attachmentBase64;
            if(attachmentBase64.startsWith('data:application/pdf')) { ext = '.pdf'; rawBase64 = attachmentBase64.replace(/^data:application\/pdf;base64,/, ""); } 
            else { rawBase64 = attachmentBase64.replace(/^data:image\/[a-zA-Z0-9]+;base64,/, ""); }
            const fileName = `ATT-${ticketId}${ext}`;
            
            // التأكد من وجود مجلد الرفع
            if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
            
            fs.writeFileSync(path.join(uploadsDir, fileName), rawBase64, 'base64');
            attachmentPath = `/uploads/${fileName}`;
        } 

        if (isManagerForm) {
            initialStatus = 'escalated'; 
            finalManagerName = empName;
            senderId = senderUsername;
            
            if (targetEmp) {
                finalEmpUsername = targetEmp;
                const tUser = usersDB.find(u => u.username === targetEmp);
                if (tUser) finalEmpName = tUser.name;
            }
        }

        const newRequest = {
            id: 'REQ-' + Date.now(),
            senderId: senderId, 
            empUsername: finalEmpUsername,
            empName: finalEmpName,
            empPhone: empPhone,
            managerName: finalManagerName,
            hrSupervisor: isManagerForm ? hrSupervisor : '',
            reason: reason,
            details: details,
            attachment: attachmentPath,
            status: initialStatus,
            date: new Date().toLocaleString('ar-SA'),
            history: [{ action: isManagerForm ? `رفع إداري بواسطة ${actualActor}` : `تم الرفع بواسطة ${actualActor}`, date: new Date().toLocaleString('ar-SA') }]  
        };

        requestsDB.unshift(newRequest);
        fs.writeFileSync(requestsFile, JSON.stringify(requestsDB, null, 2));
        // 🚨 زراعة الحدث في سجل الرقابة والتدقيق (Audit Trail) السري للإدارة 🚨
        if (typeof safeLogAudit === 'function') {
            safeLogAudit(actualActor, 'رفع طلب', finalEmpName, `نوع الطلب: ${reason}`);
        }

        res.json({ success: true });
    } catch (error) { 
        // طباعة الخطأ في الكونسول لكشفه فوراً
        console.error("❌ CRITICAL ERROR IN CREATE REQUEST:", error);
        res.json({ success: false, message: 'خطأ بالسيرفر: ' + error.message }); 
    }
});

app.post('/api/hr-requests', (req, res) => {
    try {
        // 1. التقاط رقم المستخدم وتأمينه من الواجهة
        const username = req.body.username || req.body.empUsername || '';
        const safeUser = String(username).trim();
        const isAdmin = req.body.isAdmin === true || req.body.isAdmin === 'true'; 
        const role = req.body.role;

        // 2. المصفاة الذكية الموحدة (VIP Filter)
        const finalRequests = requestsDB.filter(r => {
            
            // 🎯 الشرط الذهبي (VIP Pass): إذا كان الطلب موجهاً صراحة لهذا الموظف، اعرضه فوراً!
            const assignedHr = r.assignedHrEmp ? String(r.assignedHrEmp).trim() : '';
            if (assignedHr === safeUser && safeUser !== '') {
                return true; // يعبر الطلب بنجاح دون النظر لباقي الشروط
            }

            // 🛡️ الشروط الطبيعية للطلبات العامة (درع الحماية الخاص بك)
            const safeStatus = r.status || '';
            const isGeneralHR = safeStatus === 'escalated' || 
                                safeStatus.startsWith('hr_') || 
                                r.escalationComment || 
                                r.hrEmpComment ||      
                                (r.hrSupervisor && r.hrSupervisor !== '');

            // 3. توجيه الطلبات العامة حسب الصلاحيات
            if (isGeneralHR) {
                if (isAdmin || role === 'موظف ادارة') {
                    return true; // الإدارة ترى جميع طلبات القسم
                } else {
                    // المشرف العادي يرى فقط الطلبات العامة التابعة له
                    const hrSuper = r.hrSupervisor ? String(r.hrSupervisor).trim() : '';
                    return hrSuper === safeUser;
                }
            }

            // تجاهل أي طلب لا يخص الموارد البشرية
            return false;
        });

        // إرجاع الطلبات المنتقاة بعناية
        res.json(finalRequests);

    } catch (error) {
        console.error("Error in hr-requests:", error);
        res.json([]); // حماية الشاشة
    }
});

app.post('/api/hr-assign', (req, res) => {
    const { ticketId, assignedTo, comment, byUser } = req.body;
    const index = requestsDB.findIndex(r => r.id === ticketId);
    if(index > -1) {
        requestsDB[index].assignedHrEmp = assignedTo;
        requestsDB[index].status = 'hr_assigned'; 
        requestsDB[index].supervisorAssignComment = comment;
        if(!requestsDB[index].history) requestsDB[index].history = [];
        requestsDB[index].history.push({ action: `تم تعيين الطلب لـ (${assignedTo}) بواسطة المشرف ${byUser}`, date: new Date().toLocaleString('ar-SA') });
        
        fs.writeFileSync(requestsFile, JSON.stringify(requestsDB, null, 2));
        res.json({success: true});
    } else res.json({success: false, message: 'الطلب غير موجود'});
});

app.post('/api/hr-reject', (req, res) => {
    const { ticketId, comment, byUser } = req.body;
    const index = requestsDB.findIndex(r => r.id === ticketId);
    if(index > -1) {
        requestsDB[index].status = 'resolved'; 
        requestsDB[index].supervisorRejectComment = comment;
        requestsDB[index].managerComment = `(مرفوض من الموارد البشرية): ${comment}`; 
        if(!requestsDB[index].history) requestsDB[index].history = [];
        requestsDB[index].history.push({ action: `تم رفض الإحالة من قبل المشرف ${byUser}`, date: new Date().toLocaleString('ar-SA') });
        
        fs.writeFileSync(requestsFile, JSON.stringify(requestsDB, null, 2));
        res.json({success: true});
    } else res.json({success: false});
});

app.post('/api/hr-resolve', (req, res) => {
    const { ticketId, comment, byUser } = req.body;

    const index = requestsDB.findIndex(r => r.id === ticketId);
    if (index === -1) {
        return res.json({ success: false, message: "الطلب غير موجود" });
    }

    requestsDB[index].status = 'resolved'; 
    requestsDB[index].hrComment = comment;
    requestsDB[index].resolvedBy = byUser;
    requestsDB[index].resolveDate = new Date().toLocaleString('ar-SA');

    if(!requestsDB[index].history) requestsDB[index].history = [];
    requestsDB[index].history.push({
        action: `تم إنجاز الطلب من الموارد البشرية بواسطة: ${byUser}`,
        comment: comment || "",
        date: new Date().toLocaleString('ar-SA')
    });

    fs.writeFileSync(requestsFile, JSON.stringify(requestsDB, null, 2));

    return res.json({ success: true });
});

// ==================== نظام إدارة الإجازات والربط الآلي بالتحضير ====================
const leavesFile = path.join(DATA_DIR, 'leaves.json');
let leavesDB = safeLoadDB(leavesFile, []);

app.get('/api/leaves', (req, res) => res.json(leavesDB));

app.post('/api/leaves', (req, res) => {
    try {
        const leaveData = req.body; 
        leaveData.id = Date.now().toString();
        leaveData.entryDate = new Date().toISOString().split('T')[0];
        
        const user = usersDB.find(u => u.username === leaveData.username);
        if(user) leaveData.name = user.name;
        else return res.json({success: false, message: 'الموظف غير موجود'});

        leavesDB.push(leaveData);
        fs.writeFileSync(leavesFile, JSON.stringify(leavesDB, null, 2));

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
        fs.writeFileSync(attendanceFile, JSON.stringify(attendanceDB, null, 2));

        // تسجيل الحدث بشكل آمن
        safeLogAudit(req.body.byUser, 'إدخال إجازة', leaveData.username, `نوع الإجازة: ${leaveData.type} لمدة ${leaveData.duration} يوم`);

        res.json({ success: true });
    } catch (error) {
        console.error("خطأ في حفظ الإجازة:", error);
        res.json({ success: false, message: 'حدث خطأ في السيرفر' });
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
// ====================================================================================================

// ==================== 1. محرك حذف الإجازة (والتراجع الآلي عن التحضير والرصيد) ====================
app.post('/api/leave-delete', (req, res) => {
    try {
        const { id, byUser } = req.body;
        const leaveIndex = leavesDB.findIndex(l => l.id === id);
        if (leaveIndex === -1) return res.json({ success: false, message: 'الإجازة غير موجودة' });

        const leave = leavesDB[leaveIndex];
        const user = usersDB.find(u => u.username === leave.username);

        // أ. التراجع عن التحضير (إرجاع الأيام من V إلى D)
        let start = new Date(leave.startDate);
        for (let i = 0; i < parseInt(leave.duration); i++) {
            let curr = new Date(start); curr.setDate(curr.getDate() + i);
            let dateStr = curr.toISOString().split('T')[0];
            
            let attIdx = attendanceDB.findIndex(a => a.date === dateStr && a.username === leave.username);
            if (attIdx > -1 && attendanceDB[attIdx].code === 'V') {
                attendanceDB[attIdx].code = 'D'; // إعادته للدوام
                attendanceDB[attIdx].managerName = 'نظام (تراجع عن إجازة)';
                attendanceDB[attIdx].timestamp = new Date().toISOString();
            }
        }

        // ب. التراجع عن الرصيد المستخدم (فقط إذا كانت إجازة سنوية)
        if (user && leave.type === 'سنوية') {
            user.usedLeaves = Math.max(0, (user.usedLeaves || 0) - parseInt(leave.duration));
            user.leaveBalance = parseFloat(((user.leaveCredit || 0) - user.usedLeaves).toFixed(3));
        }

        // ج. حذف سجل الإجازة وتسجيل الرقابة
        leavesDB.splice(leaveIndex, 1);
        safeLogAudit(byUser, 'حذف إجازة', leave.username, `إلغاء إجازة ${leave.type} (${leave.duration} أيام)`);

        fs.writeFileSync(attendanceFile, JSON.stringify(attendanceDB, null, 2));
        fs.writeFileSync(usersFile, JSON.stringify(usersDB, null, 2));
        fs.writeFileSync(leavesFile, JSON.stringify(leavesDB, null, 2));

        res.json({ success: true });
    } catch (error) {
        console.error(error); res.json({ success: false });
    }
});

// ==================== 2. محرك تعديل الإجازة (Undo القديم + Redo الجديد) ====================
app.post('/api/leave-edit', (req, res) => {
    try {
        const { id, type, startDate, duration, endDate, returnDate, byUser } = req.body;
        const leaveIndex = leavesDB.findIndex(l => l.id === id);
        if (leaveIndex === -1) return res.json({ success: false });

        const oldLeave = leavesDB[leaveIndex];
        const user = usersDB.find(u => u.username === oldLeave.username);

        // --- الخطوة 1: مسح تأثير الإجازة القديمة ---
        let oldStart = new Date(oldLeave.startDate);
        for (let i = 0; i < parseInt(oldLeave.duration); i++) {
            let curr = new Date(oldStart); curr.setDate(curr.getDate() + i);
            let dateStr = curr.toISOString().split('T')[0];
            let attIdx = attendanceDB.findIndex(a => a.date === dateStr && a.username === oldLeave.username);
            if (attIdx > -1 && attendanceDB[attIdx].code === 'V') { attendanceDB.splice(attIdx, 1); } // نحذف التحضير القديم
        }
        if (user && oldLeave.type === 'سنوية') { user.usedLeaves = Math.max(0, (user.usedLeaves || 0) - parseInt(oldLeave.duration)); }

        // --- الخطوة 2: تطبيق تأثير الإجازة الجديدة ---
        let newStart = new Date(startDate);
        let systemLabel = `تعديل إجازة (${type})`;
        let currentTime = new Date().toISOString();

        for (let i = 0; i < parseInt(duration); i++) {
            let curr = new Date(newStart); curr.setDate(curr.getDate() + i);
            let dateStr = curr.toISOString().split('T')[0];
            
            let attIdx = attendanceDB.findIndex(a => a.date === dateStr && a.username === oldLeave.username);
            if (attIdx !== -1) {
                attendanceDB[attIdx].code = 'V'; attendanceDB[attIdx].managerName = systemLabel; attendanceDB[attIdx].timestamp = currentTime;
            } else {
                attendanceDB.push({ date: dateStr, username: oldLeave.username, name: oldLeave.name, branch: user ? user.branch : '', code: 'V', managerName: systemLabel, timestamp: currentTime });
            }
        }
        if (user && type === 'سنوية') {
            user.usedLeaves = (user.usedLeaves || 0) + parseInt(duration);
            user.leaveBalance = parseFloat(((user.leaveCredit || 0) - user.usedLeaves).toFixed(3));
        }

        // --- الخطوة 3: تحديث سجل الإجازة ---
        leavesDB[leaveIndex] = { ...oldLeave, type, startDate, duration, endDate, returnDate };
        safeLogAudit(byUser, 'تعديل إجازة', oldLeave.username, `تعديل إلى ${type} لمدة ${duration} أيام`);

        fs.writeFileSync(attendanceFile, JSON.stringify(attendanceDB, null, 2));
        fs.writeFileSync(usersFile, JSON.stringify(usersDB, null, 2));
        fs.writeFileSync(leavesFile, JSON.stringify(leavesDB, null, 2));

        res.json({ success: true });
    } catch (error) {
        console.error(error); res.json({ success: false });
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
// ============================================================================================
// ============================================================================================
// ==================== التعديل الطارئ للتحضير (للإدارة فقط) ====================
app.post('/api/urgent-edit-attendance', (req, res) => {
    try {
        const { username, date, newCode, byUser } = req.body;
        
        let record = attendanceDB.find(a => a.username === username && a.date === date);
        if (record) {
            const oldCode = record.code;
            record.code = newCode;
            record.managerName = `تعديل طارئ (${byUser})`; // ليعرف الجميع أنه تعدل لاحقاً
            
            fs.writeFileSync(attendanceFile, JSON.stringify(attendanceDB, null, 2));
            safeLogAudit(byUser, 'تعديل تحضير للضرورة', username, `تغيير حالة يوم ${date} من (${oldCode}) إلى (${newCode})`);
            
            res.json({ success: true });
        } else {
            res.json({ success: false, message: 'سجل التحضير غير موجود في هذا التاريخ.' });
        }
    } catch (error) {
        res.json({ success: false, message: 'حدث خطأ أثناء التعديل.' });
    }
});
// ==================== مسارات مصفوفة الجزاءات ====================
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

// ==================== (HR & Managers) رفع إشعار مخالفة جديد ====================
app.post('/api/submit-penalty', (req, res) => {
    try {
        // 1. استقبال البيانات من الواجهة وتسميتها payload
        const payload = req.body;

        // 2. توليد رقم مرجعي فريد للمخالفة (إذا لم يكن السيرفر قد ولده مسبقاً)
        if (!payload.id) {
            payload.id = 'REQ-' + Date.now() + Math.floor(Math.random() * 10000);
        }

        // 3. 🛡️ الجدار الأمني: منع رفع نفس المخالفة لنفس الموظف في نفس اليوم (Double Submission)
        const isDuplicate = penaltiesHistoryDB.some(p => 
            p.empUsername === payload.empUsername && 
            p.violationDate === payload.violationDate && 
            p.violationName === payload.violationName &&
            p.category !== 'تسوية غيابات للرواتب' // نستثني الغيابات المسحوبة آلياً للرواتب
        );

        if (isDuplicate) {
            return res.json({ success: false, message: "تم رفع هذه المخالفة مسبقاً لهذا الموظف في نفس اليوم! يرجى التحقق من السجل." });
        }

        // 4. إضافة ختم زمني للتوثيق
        payload.timestamp = new Date().toISOString();

        // 5. الحفظ في قاعدة البيانات
        penaltiesHistoryDB.push(payload);
        fs.writeFileSync(penaltiesHistoryFile, JSON.stringify(penaltiesHistoryDB, null, 2));
        
        // 6. الرد بنجاح العملية
        res.json({ success: true, message: "تم رفع المخالفة بنجاح!" });

    } catch (error) {
        console.error("Error submitting penalty:", error);
        res.json({ success: false, message: "حدث خطأ داخلي في السيرفر أثناء رفع المخالفة." });
    }
});
// ==================== جلب سجل المخالفات (ذكي: للمدير أو الموارد البشرية) ====================
app.post('/api/manager-penalties', (req, res) => {
    try {
        const { managerName, role, roleArabic } = req.body;
        let history = [];

        // إذا كان أدمن أو موارد بشرية -> اجلب كل السجلات
        if (role === 'admin' || roleArabic === 'ادمن' || roleArabic === 'موظف موارد' || roleArabic === 'موظف ادارة') {
            history = penaltiesHistoryDB;
        } else {
            // إذا كان مديراً عادياً -> اجلب فريقه فقط ومخالفاته التي رفعها
            const myTeamUsernames = usersDB.filter(u => u.directManager === managerName).map(u => u.username);
            history = penaltiesHistoryDB.filter(p => 
                p.managerName === managerName || myTeamUsernames.includes(p.empUsername)
            );
        }
        
        // ترتيب السجلات من الأحدث إلى الأقدم
        history.sort((a, b) => {
            const idA = parseInt(a.id.replace('PEN-', ''));
            const idB = parseInt(b.id.replace('PEN-', ''));
            return idB - idA;
        });
        
        res.json(history);
    } catch (error) {
        console.error("Error fetching penalties:", error);
        res.json([]);
    }
});
// ==================== (HR & Managers) حساب التكرار وجلب التاريخ ====================
app.post('/api/calculate-penalty', (req, res) => {
    try {
        const { empUsername, violationName } = req.body;

        // 1. فلترة ذكية ومحمية ضد السجلات التالفة
        const pastViolations = penaltiesHistoryDB.filter(p => {
            if (!p || p.empUsername !== empUsername || p.status === 'مرفوضة') return false;
            
            // 🔥 السر هنا: مطابقة ذكية للغيابات (لأن النظام الآلي يضيف عدد الأيام في الاسم)
            if (violationName.includes('متصل') && p.violationName && p.violationName.includes('متصل')) return true;
            if (violationName.includes('منفرد') && p.violationName && p.violationName.includes('منفرد')) return true;
            
            return p.violationName === violationName;
        });

        // 2. ترتيب المخالفات من الأحدث للأقدم
        pastViolations.sort((a, b) => new Date(b.violationDate || 0) - new Date(a.violationDate || 0));

        const previousCount = pastViolations.length;
        const currentOccurrence = previousCount + 1;

        let lastDate = "لا يوجد";
        let lastPenalty = "لا يوجد";

        if (previousCount > 0) {
            lastDate = pastViolations[0].violationDate || "تاريخ غير مسجل";
            lastPenalty = pastViolations[0].displayPenalty || pastViolations[0].appliedPenalty || "غير مسجل"; 
        }

        res.json({ 
            success: true, 
            previousCount: previousCount,
            currentOccurrence: currentOccurrence,
            lastViolationDate: lastDate,
            lastViolationPenalty: lastPenalty
        });

    } catch (error) {
        console.error("Error calculating penalty:", error);
        res.json({ success: false, message: "حدث خطأ في السيرفر أثناء فحص السجلات." });
    }
});
// ==================== (HR) تحديث حالة المخالفة ====================
app.post('/api/update-penalty-status', (req, res) => {
    try {
        const { ticketId, newStatus, hrComment, hrName } = req.body;
        
        let penalty = penaltiesHistoryDB.find(p => p.id === ticketId);
        if (!penalty) return res.json({ success: false, message: "لم يتم العثور على التذكرة." });

        penalty.status = newStatus;
        penalty.hrComment = hrComment || "";
        penalty.hrName = hrName || "";
        penalty.hrActionDate = new Date().toISOString();

        // 🔥 تم الإصلاح هنا: استخدام penaltiesHistoryFile المعرف مسبقاً
        fs.writeFileSync(penaltiesHistoryFile, JSON.stringify(penaltiesHistoryDB, null, 2));
        res.json({ success: true, message: `تم تحديث التذكرة بنجاح إلى: ${newStatus}` });
    } catch (error) {
        console.error("Error updating penalty:", error);
        res.json({ success: false, message: "حدث خطأ أثناء تحديث التذكرة." });
    }
});

// ==================== (HR / Admin) حذف المخالفة نهائياً ====================
app.post('/api/delete-penalty', (req, res) => {
    try {
        const { ticketId } = req.body;
        
        // 1. البحث عن رقم (فهرس) التذكرة داخل المصفوفة
        const index = penaltiesHistoryDB.findIndex(p => p.id === ticketId);
        
        // 2. إذا وجدناها، نقوم بقصها (حذفها) من المصفوفة في مكانها
        if (index !== -1) {
            penaltiesHistoryDB.splice(index, 1);
        }

        // 🔥 تم الإصلاح هنا: استخدام penaltiesHistoryFile المعرف مسبقاً
        fs.writeFileSync(penaltiesHistoryFile, JSON.stringify(penaltiesHistoryDB, null, 2));
        
        res.json({ success: true, message: "تم حذف المخالفة نهائياً من السجلات." });
    } catch (error) {
        console.error("Delete Error:", error); 
        res.json({ success: false, message: "حدث خطأ أثناء محاولة الحذف." });
    }
});
// ==================== (HR) محرك تعديل نوع المخالفة وإعادة الحساب ====================
app.post('/api/hr-edit-penalty', (req, res) => {
    try {
        const { ticketId, newCategory, newViolationName, newOccurrence, newAppliedPenalty, newDisplayPenalty, newLastDate, newLastPen, hrComment, hrName } = req.body;
        
        let penalty = penaltiesHistoryDB.find(p => p.id === ticketId);
        if (!penalty) return res.json({ success: false, message: "لم يتم العثور على التذكرة." });

        // حفظ المخالفة القديمة في التعليق للتوثيق القانوني (Audit)
        const oldViolationInfo = `[تعديل من الموارد البشرية]: تم تغيير المخالفة من (${penalty.violationName}) إلى (${newViolationName}). المبرر: ${hrComment}`;

        // تحديث البيانات الجذرية للمخالفة
        penalty.category = newCategory;
        penalty.violationName = newViolationName;
        penalty.actualOccurrence = newOccurrence;
        penalty.appliedPenalty = newAppliedPenalty;
        penalty.displayPenalty = newDisplayPenalty;
        penalty.lastViolationDate = newLastDate;
        penalty.lastViolationPenalty = newLastPen;
        
        // تحديث حالة الاعتماد وتوقيع موظف الموارد
        penalty.status = 'معتمدة من الموارد (معدلة)';
        penalty.hrComment = oldViolationInfo; // دمجنا التوثيق مع مبرر موظف الموارد
        penalty.hrName = hrName;
        penalty.hrActionDate = new Date().toISOString();

        // الحفظ في قاعدة البيانات
        fs.writeFileSync(path.join(DATA_DIR, 'penaltiesHistory.json'), JSON.stringify(penaltiesHistoryDB, null, 2));
        res.json({ success: true, message: "تم تصحيح المخالفة، وإعادة حساب العقوبة، واعتمادها بنجاح!" });
    } catch (error) {
        console.error("Error editing penalty:", error);
        res.json({ success: false, message: "حدث خطأ أثناء تعديل التذكرة." });
    }
});

// ==================== (HR) محرك الميزان ⚖️ - تعديل مقدار العقوبة يدوياً ====================
app.post('/api/hr-balance-penalty', (req, res) => {
    try {
        const { ticketId, newAppliedPenalty, newDisplayPenalty, hrComment, hrName } = req.body;
        
        let penalty = penaltiesHistoryDB.find(p => p.id === ticketId);
        if (!penalty) return res.json({ success: false, message: "لم يتم العثور على التذكرة." });

        // حفظ العقوبة القديمة في التعليق للتوثيق القانوني
        const oldPenaltyInfo = `[تعديل استثنائي للعقوبة]: تم تغيير العقوبة من (${penalty.displayPenalty || penalty.appliedPenalty}) إلى (${newDisplayPenalty}). المبرر: ${hrComment}`;

        // تحديث بيانات العقوبة
        penalty.appliedPenalty = newAppliedPenalty;
        penalty.displayPenalty = newDisplayPenalty;
        
        // تحديث حالة الاعتماد وتوقيع موظف الموارد
        penalty.status = 'معتمدة من الموارد (استثناء)';
        penalty.hrComment = oldPenaltyInfo; 
        penalty.hrName = hrName;
        penalty.hrActionDate = new Date().toISOString();

        // الحفظ في قاعدة البيانات
        fs.writeFileSync(penaltiesHistoryFile, JSON.stringify(penaltiesHistoryDB, null, 2));
        
        // توثيق العملية في سجل الرقابة السري
        if (typeof safeLogAudit === 'function') {
            safeLogAudit(hrName, 'تعديل عقوبة استثنائي', penalty.empUsername, `للتذكرة ${ticketId}`);
        }

        res.json({ success: true, message: "تم تعديل العقوبة واعتماد الإشعار بنجاح!" });
    } catch (error) {
        console.error("Error balancing penalty:", error);
        res.json({ success: false, message: "حدث خطأ أثناء تعديل العقوبة." });
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
// ==================== (HR & Payroll) مزامنة الغيابات التاريخية وتحويلها لخصميات معتمدة ====================
app.post('/api/sync-absences-to-penalties', (req, res) => {
    try {
        let addedCount = 0;
        
        attendanceDB.forEach(att => {
            // نبحث عن الغياب أو الإجازة بدون أجر
            if (att.code === 'A' || att.code === 'LOP') {
                // نتحقق لكي لا نكرر نفس الغياب إذا تم سحبه مسبقاً
                const exists = penaltiesHistoryDB.find(p => p.empUsername === att.username && p.violationDate === att.date && p.category === 'تسوية غيابات للرواتب');
                
                if (!exists) {
                    const user = usersDB.find(u => u.username === att.username);
                    
                    penaltiesHistoryDB.push({
                        id: 'REQ-' + Date.now() + Math.floor(Math.random() * 10000),
                        empUsername: att.username,
                        empName: user ? user.name : 'غير معروف',
                        managerName: 'النظام الآلي (تسوية)',
                        violationDate: att.date,
                        category: 'تسوية غيابات للرواتب',
                        violationName: 'غياب 1 يوم',
                        managerComment: 'تم سحب هذا الغياب آلياً من سجل التحضير التاريخي لإدراجه في مسير الرواتب.',
                        isAdmit: false,
                        requestLessPunishment: false,
                        actualOccurrence: 1,
                        appliedPenalty: '1', 
                        displayPenalty: 'خصم 1 يوم',
                        status: 'معتمدة آلياً',
                        attachment: '',
                        hrComment: 'تسوية آلية لغرض تصدير الرواتب.',
                        hrName: 'محرك المزامنة',
                        timestamp: new Date().toISOString()
                    });
                    addedCount++;
                }
            }
        });

        if (addedCount > 0) {
            fs.writeFileSync(penaltiesHistoryFile, JSON.stringify(penaltiesHistoryDB, null, 2));
        }

        res.json({ success: true, count: addedCount });
    } catch (error) {
        console.error("Sync Error:", error);
        res.json({ success: false, message: "حدث خطأ أثناء المزامنة." });
    }
});

// ==================== نظام تتبع المرشحين (ATS) ====================
const candidatesFile = path.join(DATA_DIR, 'candidates.json');
let candidatesDB = safeLoadDB(candidatesFile, []);

// 1. استقبال بيانات المرشح من البوابة العامة (بدون تسجيل دخول)
app.post('/api/submit-candidate', (req, res) => {
    try {
        const candidate = {
            id: 'CAN-' + Date.now(),
            ...req.body,
            status: 'pending', // pending, accepted, rejected
            timestamp: new Date().toISOString()
        };
        candidatesDB.unshift(candidate); // إضافته في بداية القائمة
        fs.writeFileSync(candidatesFile, JSON.stringify(candidatesDB, null, 2));
        res.json({ success: true });
    } catch (e) {
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
app.post('/api/missing-attendance', (req, res) => {
    try {
        const { managerName, lookbackDays = 7 } = req.body;

        if (!managerName) {
            return res.json({ success: false, message: 'معرف المستخدم مطلوب.' });
        }

        // 💡 الذكاء الاستخباراتي: استخراج الاسم الحقيقي والصلاحية للمستخدم الذي فتح الشاشة
        const requestingUser = usersDB.find(u => String(u.username) === String(managerName) || String(u.name) === String(managerName));
        const actualManagerName = requestingUser ? requestingUser.name : managerName; // تحويل الرقم إلى الاسم العربي الصريح
        
        // هل هذا المستخدم أدمن؟ (إذا كان أدمن، نعطيه صلاحية رؤية جميع الموظفين)
        const isSuperAdmin = requestingUser && (requestingUser.role === 'admin' || requestingUser.roleArabic === 'ادمن');

        // 1. جلب فريق العمل (النسخة المدرعة فائقة الذكاء)
        const team = usersDB.filter(u => {
            // أ. التحقق من المدير (إما أن يكون أدمن، أو يكون مديره المباشر فعلاً)
            const isMyEmp = isSuperAdmin || (u.directManager && String(u.directManager).trim() === String(actualManagerName).trim());
            
            // ب. التحقق من الحالة الوظيفية
            const statusStr = (u.status || '').trim().toLowerCase();
            const isInDuty = statusStr === 'in duty' || statusStr === 'نشط' || statusStr === 'على رأس العمل' || statusStr === 'active';
            
            return isMyEmp && u.isActive !== false && isInDuty;
        });

        // طباعة للتأكد من نجاح الفلترة
        console.log("Team found:", team.map(u => u.username));

        const missingRecords = [];

        // 2. إعداد التواريخ (توقيت السعودية)
        const todayStr = new Date().toLocaleString('en-US', { timeZone: 'Asia/Riyadh' });
        const todayRiyadh = new Date(todayStr);
        todayRiyadh.setHours(0,0,0,0);

        // 3. المحرك الزمني (الرجوع للخلف)
        for (let i = 1; i <= lookbackDays; i++) {
            const checkDate = new Date(todayRiyadh);
            checkDate.setDate(checkDate.getDate() - i);
            
            const dateString = checkDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' }); 
            const dayName = checkDate.toLocaleDateString('ar-SA', { weekday: 'long', timeZone: 'Asia/Riyadh' });
            
            // 4. فحص كل موظف
            team.forEach(emp => {
                // حماية تاريخ التعيين الدقيقة
                if (emp.joinDate) {
                    const empJoinDate = new Date(emp.joinDate);
                    empJoinDate.setHours(0,0,0,0);
                    if (empJoinDate > checkDate) return; 
                }

                // هل يوجد له تحضير في هذا اليوم؟
                const hasRecord = attendanceDB.find(a => a.date === dateString && a.username === emp.username);

                if (!hasRecord) {
                    missingRecords.push({
                        username: emp.username,
                        name: emp.name,
                        date: dateString,
                        dayName: dayName
                    });
                }
            });
        }

        // 5. الترتيب من الأقدم للأحدث
        missingRecords.sort((a, b) => new Date(a.date) - new Date(b.date));

        res.json({ success: true, count: missingRecords.length, data: missingRecords });

    } catch (error) {
        console.error("❌ خطأ في رادار النواقص:", error);
        res.json({ success: false, message: 'حدث خطأ داخلي أثناء البحث عن النواقص.' });
    }
});


app.listen(process.env.PORT || 3000, '0.0.0.0', () => console.log(`🚀 السيرفر يعمل بنظام الرقابة الذكي والآمن!`));

// ==========================================
// 🚀 روبوت الهجرة العظيمة لإمبراطورية (Hyper Al-Wafa)
// ==========================================
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function main() {
  console.log('🚢 تبدأ الآن رحلة الهجرة العظيمة إلى قواعد SQL...');

  // 1. فحص القاعدة: هل الموظفون موجودون مسبقاً؟
  const usersCount = await prisma.employee.count();
  if (usersCount > 0) {
    console.log('✅ البيانات موجودة مسبقاً في SQL! لا حاجة لإعادة الهجرة.');
    return; // نوقف الروبوت لكي لا يكرر البيانات
  }

  // 2. قراءة ملف الموظفين القديم (تأكد أن المسار يطابق مجلد البيانات لديك)
  // افترضت هنا أن الملف اسمه users.json وموجود في مجلد data
  const usersPath = path.join(__dirname, 'data', 'users.json');
  if (!fs.existsSync(usersPath)) {
     console.log('⚠️ لم أتمكن من العثور على ملف users.json');
     return;
  }
  
  const usersData = JSON.parse(fs.readFileSync(usersPath, 'utf-8'));

  // 3. صب البيانات في قوالب الـ SQL
  console.log(`👨‍💼 جاري نقل عدد ${usersData.length} موظف إلى المبنى الجديد...`);
  
  for (const user of usersData) {
    await prisma.employee.create({
      data: {
        username: user.username,
        password: user.password,
        name: user.name,
        role: user.role || 'employee',
        jobTitle: user.jobTitle || '',
        branch: user.branch || '',
        basicSalary: user.basicSalary || '0',
        isActive: user.isActive !== false
      }
    });
  }

  console.log('🎉 تمت هجرة الموظفين بنجاح! الأساس الخرساني جاهز.');
  // (سنكتفي بنقل الموظفين فقط كاختبار أول، ثم ننقل التحضير والإجازات لاحقاً)
}

main()
  .catch((e) => {
    console.error('❌ حدث خطأ أثناء الهجرة:', e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

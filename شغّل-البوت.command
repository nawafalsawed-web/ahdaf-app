#!/bin/bash
# ملف تشغيل بوت أهداف بنقرة مزدوجة
cd "$(dirname "$0")/bot" || exit 1

echo "════════════════════════════════════"
echo "   🤖 بوت أهداف — إنشاء قروبات واتساب"
echo "════════════════════════════════════"
echo ""

# أوقف أي نسخة قديمة شغّالة (تفادي تعارض المنفذ/الجلسة)
echo "🧹 إيقاف أي نسخة قديمة…"
pkill -9 -f "ahdaf-app/bot" 2>/dev/null
lsof -ti:3000 2>/dev/null | xargs kill -9 2>/dev/null
rm -f .wwebjs_auth/session/SingletonLock 2>/dev/null
sleep 2

# تأكد من المكتبات
if [ ! -d "node_modules" ] || [ ! -d "node_modules/qrcode" ]; then
  echo "📦 جاري تثبيت المكتبات (يأخذ دقايق أول مرة)…"
  npm install || { echo "❌ فشل التثبيت. تأكد أن Node.js مثبّت من nodejs.org"; read -p "اضغط Enter للإغلاق"; exit 1; }
fi

echo ""
echo "▶️  جاري تشغيل البوت…"
echo "   • افتح تطبيق أهداف → ⚙️ الإعدادات → بيطلع الباركود"
echo "   • أو امسح الباركود اللي يطلع تحت من واتساب"
echo "   ⚠️  لا تسكّر هذي النافذة — البوت لازم يضل شغّال"
echo ""
npm start
echo ""
echo "✗ توقّف البوت."
read -p "اضغط Enter للإغلاق"

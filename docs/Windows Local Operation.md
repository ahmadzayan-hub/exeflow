# تشغيل ExecFlow محلياً على Windows

إعداد: أحمد زيان (Ahmed Zaian)

## التشغيل اليومي

1. فك ضغط الحزمة كاملة إلى مجلد محلي، مثلاً `C:\ExecFlow`. لا تشغّلها من داخل ZIP.
2. يلزم Node.js إصدار 22 أو أحدث ضمن PATH، أو نسخة معتمدة من `node.exe` داخل مجلد `Runtime` بجوار المشغّل، ومتصفح عادي مثل Edge أو Chrome. لا تحتاج الحزمة المبنية إلى npm أو Python أو `node_modules`. إذا غاب Node، استخدم مثبتاً معتمداً من قسم تقنية المعلومات، ويمكن تثبيته دون إنترنت باستخدام مثبت محفوظ مسبقاً. الحزمة لا تتضمن Node.
3. انقر مرتين على `StartExecFlow.cmd`. يبدأ الخادم أولاً، ثم يفتح المتصفح على:

   `http://127.0.0.1:4173/#commitments`

4. احتفظ بنافذة التشغيل مفتوحة. إذا لم يفتح المتصفح تلقائياً، انسخ العنوان نفسه إلى المتصفح.
5. للإغلاق اضغط `Enter` أو `Ctrl+C` داخل نافذة التشغيل. إذا سأل Windows عن إنهاء ملف الأوامر، أجب `Y`. إغلاق تبويب المتصفح لا يوقف الخادم. إغلاق نافذة التشغيل نفسها ينهي العملية أيضاً.
6. أعد الفتح باستخدام الملف نفسه والعنوان نفسه وملف المتصفح الشخصي نفسه. استخدم وضع التصفح العادي. تجنّب InPrivate وIncognito للسجل الذي تريد الاحتفاظ به.

الخادم يستمع إلى `127.0.0.1` فقط. لا استضافة عامة، ولا خدمة خلفية دائمة، ولا تشغيل تلقائي عند بدء Windows. لا يُعدّل المشغّل إعدادات الإنتاج، ولا يشغّل خدمات ذكاء اصطناعي أو اتصالات سحابية. تمنع سياسة الحزمة اتصالات الصفحة إلى عناوين خارج أصلها المحلي.

## رسائل الأعطال

| الحالة | الإجراء |
| --- | --- |
| Node.js was not found | ثبّت Node.js LTS معتمداً، إصدار 22 أو أحدث، وافتح المشغّل مجدداً. |
| Node.js 22 or newer is required | حدّث Node المعتمد. لا ينفّذ المشغّل تنزيلات تلقائية. |
| Built app missing or unreadable | فك ضغط الحزمة كاملة. في نسخة المصدر نفّذ `npm ci` ثم `npm run build`. يحتاج تثبيت حزم المصدر إلى شبكة أو مخزن حزم محلي مجهّز مسبقاً. |
| Port 4173 is already in use | أغلق نافذة ExecFlow السابقة بـ Ctrl+C. إذا كان برنامج آخر يستخدم المنفذ، أغلقه بالطريقة المعتادة أو اطلب مساعدة تقنية المعلومات. لا يقتل المشغّل أي عملية ولا يبدّل المنفذ. |
| Browser could not open | انسخ العنوان المطبوع إلى متصفحك المعتاد. |
| Cannot start local server | راجع سياسة الجهاز وصلاحياته مع تقنية المعلومات. لا تغيّر إعدادات الحماية لمجرد تجاوز الرسالة. |

لا تستخدم `localhost` أو منفذاً بديلاً للوصول إلى السجل المعتاد. البروتوكول واسم المضيف والمنفذ يحددان مساحة التخزين. سجل `file:` السابق أو منفذ Vite `5173` أو ملف متصفح آخر لن ينتقل تلقائياً. صدّر JSON من المكان السابق أولاً ثم استعده في العنوان الثابت.

## النسخ الاحتياطي والاستعادة

`localStorage` تخزين عمل في المتصفح، وليس نسخة احتياطية دائمة. قد يُحذف مع بيانات المتصفح أو تغيير الملف الشخصي أو سياسات الجهاز. المشغّل لا ينسخ السجل إلى القرص تلقائياً.

بعد التعديلات المهمة، اختر **تصدير نسخة السجل / Export register backup** واحفظ JSON في مجلد مستقل مناسب على جهازك. لا تحفظ النسخة الوحيدة داخل مجلد التطبيق. احتفظ بنسخ مؤرخة وفق سياسة عملك.

قبل الاستعادة صدّر السجل الحالي. اختر **استعادة نسخة / Restore backup** وحدّد JSON الصحيح. الاستعادة تستبدل سجل الالتزامات الحالي ولا تدمج السجلات. الملف غير الصالح لا يستبدل البيانات. يشمل JSON سجل الالتزامات ومراجعه وحالته؛ بيانات المحفظة لها تصدير مستقل داخل التطبيق. عند ظهور تنبيه بتلف التخزين، احتفظ بالبيانات الأصلية قبل محاولة الاسترداد.

اختبار قبول مبسط على جهازك: أنشئ بنداً اصطناعياً، راجعه واحفظه وأغلقه، وصدّر JSON. أغلق المتصفح والخادم، ثم أعد تشغيلهما وتحقق من البند. اختبر الاستعادة في ملف متصفح تجريبي منفصل لحماية بياناتك الفعلية. لا تمسح تخزين المتصفح الفعلي لمجرد الاختبار.

## نطاق الوظائف

بُنيت الحزمة من PR #6 عند الالتزام `1ae40303098feabecb3877fbab785d60cb4cac8e`، مع إضافة المشغّل دون تغيير منطق التطبيق. تظل وظائف الالتزامات والمحفظة وJarvis المحلية كما هي. تبويب Reporting الذي يحتاج إلى backend منفصل لا يصبح خدمة مكتملة بمجرد تشغيل هذه الحزمة؛ المشغّل لا يبدأ backend ولا يضبط مزودي AI. لا تتضمن الحزمة تغيير إعدادات تشغيل backend أو الإنتاج.

## English quick start

Extract the whole ZIP to a local folder. Install an approved Node.js LTS runtime, version 22 or newer, if absent. Double-click `StartExecFlow.cmd`. Keep the console open. The browser opens `http://127.0.0.1:4173/#commitments`; copy this address manually if necessary. Press Enter or Ctrl+C in the console to stop; closing the browser alone does not stop the server.

Always use the same exact origin and normal browser profile. If port 4173 is occupied, the launcher fails clearly without changing ports or killing another process. Export JSON backups to a separate folder. Restore replaces the commitments register. Browser storage is not a permanent backup. An approved portable node.exe can be placed in the Runtime folder without adding Node to PATH. The built package needs Node only, with no runtime npm install or cloud connection. Reporting still requires its existing separately configured backend.

## Source checkout commands

```text
npm ci
npm run build
npm run local
npm run test:local
```

Do not use `npm run dev` or `npm run preview` to access the launcher register unless explicitly using the exact same origin and port. Vite's normal ports may differ. This launcher serves only the built standalone page and does not expose the repository or proxy backend routes.

## فحص Windows على الجهاز

أغلق نافذة ExecFlow أولاً ثم شغّل `CheckExecFlow.cmd`. يفحص ملف التشغيل باستخدام بيانات وملفات مؤقتة: المسارات التي تحتوي على مسافات ورمز &، ونسخة Node المحمولة، وغياب Node، وفقد ملف البناء، والمنفذ المشغول، ثم الإغلاق بزر Enter وإعادة التشغيل. لا يفتح المتصفح ولا يقرأ سجلك الحقيقي. عند النجاح يكتب `artifacts/local/WindowsAcceptance.json`.

هذه الاختبارات تفحص المشغّل. لا تختبر وحدها حفظ بيانات المتصفح أو ارتباط المتصفح الافتراضي أو Ctrl+C التفاعلي. اتبع اختبار القبول اليدوي أعلاه لهذه المسارات. ملف CheckExecFlow.cmd نفسه يحتاج التحقق على جهاز Windows فعلي.

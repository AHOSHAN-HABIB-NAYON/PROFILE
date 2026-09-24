/* =========================================================
   Md Ahoshan Habib Nayon — Portfolio scripts
   ========================================================= */
(function () {
  'use strict';

  var root = document.documentElement;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function store(key, val) {
    try {
      if (val === undefined) return localStorage.getItem(key);
      localStorage.setItem(key, val);
    } catch (e) { return null; }
  }

  /* ---------------- Translations ---------------- */
  var I18N = {
    en: {
      'brand': 'Nayon',
      'nav.about': 'About', 'nav.experience': 'Experience', 'nav.education': 'Education', 'nav.skills': 'Skills',
      'nav.lab': '3D Lab', 'nav.info': 'Info', 'nav.contact': 'Contact',
      'hero.status': 'Open to opportunities', 'hero.hello': "Hello, I'm",
      'hero.name1': 'Md Ahoshan Habib', 'hero.name2': 'Nayon',
      'hero.lead': 'Diploma in Mechanical Engineering — hands-on with installation, maintenance and troubleshooting of industrial machinery, focused on quality, efficiency and safety.',
      'hero.loc': 'Khamar Pachgachi, Sundarganj, Gaibandha, Rangpur',
      'hero.cta1': 'Hire Me', 'hero.cta2': 'Explore 3D Lab',
      'hero.fc1a': 'Maintenance', 'hero.fc1b': 'Installation & Repair',
      'hero.fc2a': 'Diploma', 'hero.fc2b': 'Mechanical Engg.',
      'hero.fc3a': 'Safety First', 'hero.fc3b': 'Quality driven',
      'stats.ssc': 'SSC GPA', 'stats.dip': 'Diploma CGPA', 'stats.skills': 'Core Skills', 'stats.lang': 'Languages',
      'about.kicker': 'Career Objective', 'about.title': 'Engineering with purpose',
      'about.text': 'To build a successful career in the field of mechanical engineering where I can apply my technical knowledge, practical skills, and problem-solving abilities to contribute to the growth of the organization. I aim to enhance my expertise in mechanical design, maintenance, and troubleshooting while ensuring quality, efficiency, and safety. I am dedicated, hardworking, and eager to learn new technologies to support the success of the company effectively.',
      'about.v1': 'Mechanical Design', 'about.v1d': 'Understanding parts, assemblies and how machines work together.',
      'about.v2': 'Maintenance', 'about.v2d': 'Keeping systems, machinery and equipment reliable and running.',
      'about.v3': 'Troubleshooting', 'about.v3d': 'Finding root causes and repairing faults methodically.',
      'exp.kicker': 'Work Experience', 'exp.title': 'Hands-on in the industry',
      'exp.role': 'Mechanical Installation and Maintenance', 'exp.date': 'Sep 2025 – Nov 2025',
      'exp.org': 'Bangladesh Industrial Technical Assistance Center (BITAC)',
      'exp.p1': 'Assisted in the installation and maintenance of mechanical systems, machinery, and equipment.',
      'exp.p2': 'Supported senior engineers in troubleshooting and repairing industrial mechanical systems.',
      'exp.p3': 'Observed safety procedures and learned practical applications of mechanical assembly and maintenance.',
      'exp.p4': 'Gained hands-on experience with mechanical tools (wrenches, torque tools, dial gauge, vernier caliper, etc.).',
      'tools.t1': 'Wrenches', 'tools.t2': 'Torque Tools', 'tools.t3': 'Dial Gauge', 'tools.t4': 'Vernier Caliper',
      'train.title': 'Skills Enhancement Training', 'train.date': '1 Sep 2025 – 18 Nov 2025',
      'train.desc': 'Structured industrial training program to strengthen practical mechanical skills, workshop safety and professional practice.',
      'edu.kicker': 'Education', 'edu.title': 'Academic foundation',
      'edu.y1': '2021 – 2025', 'edu.s1': 'Kurigram Polytechnic Institute', 'edu.d1': 'Diploma in Mechanical Engineering',
      'edu.m1': 'Mechanical Technology', 'edu.r1v': '3.17', 'edu.r1': 'CGPA out of 4.00',
      'edu.y2': '2019 – 2021', 'edu.s2': 'Shovagonj High School', 'edu.d2': 'Secondary School Certificate (SSC)',
      'edu.m2': 'Science — Dinajpur Board', 'edu.r2v': '4.89', 'edu.r2': 'GPA out of 5.00',
      'skills.kicker': 'Skills', 'skills.title': 'Technical & personal toolkit', 'skills.hint': 'Drag the cube',
      'skills.tech': 'Technical', 'skills.soft': 'Professional',
      'sk.elec': 'Electrical Maintenance', 'sk.weld': 'Welding', 'sk.prog': 'Basic Programming', 'sk.office': 'MS Office',
      'sk.office2': 'MS Word, Excel, PowerPoint', 'sk.net': 'Internet & Email Handling', 'sk.comm': 'Technical Communication',
      'sk.ps': 'Problem Solving', 'sk.team': 'Teamwork', 'sk.team2': 'Team Collaboration', 'sk.time': 'Time Management',
      'sk.crit': 'Critical Thinking', 'sk.hard': 'Hard Working', 'sk.lead': 'Leadership',
      'lang.title': 'Languages', 'lang.bn': 'Bangla', 'lang.en': 'English', 'lang.native': 'Native', 'lang.work': 'Working',
      'lab.kicker': 'Live 3D Workspace', 'lab.title': 'Interactive mechanical animation lab',
      'lab.sub': 'Real-time 3D models of the machines I work with. Drag to rotate, switch projects, change speed — every part moves with correct kinematics.',
      'lab.p1': 'Gear Train', 'lab.p1d': '4-stage spur gear transmission',
      'lab.p2': 'Planetary Gearbox', 'lab.p2d': 'Sun, planets & ring gear',
      'lab.p3': 'Piston Engine', 'lab.p3d': 'Slider-crank mechanism',
      'lab.rpm': 'Input RPM', 'lab.out': 'Output RPM', 'lab.ratio': 'Ratio', 'lab.carrier': 'Carrier RPM',
      'lab.angle': 'Crank angle', 'lab.stroke': 'Piston pos.',
      'lab.speed': 'Speed', 'lab.drag': 'Drag to rotate',
      'lab.nogl': "3D preview needs WebGL, which isn't available in this browser.",
      'lab.d.gears': 'A driver gear passes motion through idler and compound gears. Each pair reverses direction and scales speed by the tooth ratio.',
      'lab.d.planetary': 'The sun gear drives three planets rolling inside a fixed ring gear. The planet carrier turns slower — a compact, high-torque reduction.',
      'lab.d.engine': 'A crankshaft and connecting rod convert rotary motion into the reciprocating stroke of a piston inside its cylinder.',
      'info.kicker': 'Personal Information', 'info.title': 'At a glance',
      'info.name': 'Name', 'info.nameV': 'Md Ahoshan Habib Nayon',
      'info.father': "Father's Name", 'info.fatherV': 'Md Rezaul Islam',
      'info.mother': "Mother's Name", 'info.motherV': 'Mst Nurbanu Begum',
      'info.dob': 'Date of Birth', 'info.dobV': '02 September 2005',
      'info.rel': 'Religion', 'info.relV': 'Islam', 'info.mar': 'Marital Status', 'info.marV': 'Unmarried',
      'info.nat': 'Nationality', 'info.natV': 'Bangladeshi', 'info.blood': 'Blood Group',
      'ref.title': 'References', 'ref.text': 'Available upon request.',
      'contact.kicker': 'Contact', 'contact.title': "Let's work together",
      'contact.sub': 'Looking for a dedicated mechanical technician? Reach out — I usually reply within a day.',
      'contact.phone': 'Phone', 'contact.phoneV': '+880 1757 827996', 'contact.email': 'Email',
      'contact.loc': 'Location', 'contact.locV': 'Sundarganj, Gaibandha', 'contact.wa': 'Message me',
      'form.name': 'Your name', 'form.email': 'Your email', 'form.msg': 'Message', 'form.send': 'Send via Email',
      'form.note': 'Opens your email app with the message ready to send.',
      'footer.name': 'Md Ahoshan Habib Nayon', 'footer.rights': 'Built with passion for engineering.',
      'typed': ['Mechanical Engineer', 'Installation & Maintenance', 'Troubleshooting Specialist', 'Welding & Electrical'],
      'langBtn': 'বাংলা'
    },
    bn: {
      'brand': 'নয়ন',
      'nav.about': 'পরিচিতি', 'nav.experience': 'অভিজ্ঞতা', 'nav.education': 'শিক্ষা', 'nav.skills': 'দক্ষতা',
      'nav.lab': '৩ডি ল্যাব', 'nav.info': 'তথ্য', 'nav.contact': 'যোগাযোগ',
      'hero.status': 'নতুন সুযোগের জন্য প্রস্তুত', 'hero.hello': 'আসসালামু আলাইকুম, আমি',
      'hero.name1': 'মোঃ আহসান হাবিব', 'hero.name2': 'নয়ন',
      'hero.lead': 'মেকানিক্যাল ইঞ্জিনিয়ারিংয়ে ডিপ্লোমা — শিল্প যন্ত্রপাতির স্থাপন, রক্ষণাবেক্ষণ ও ত্রুটি নির্ণয়ে হাতে-কলমে অভিজ্ঞ; মান, দক্ষতা ও নিরাপত্তায় মনোযোগী।',
      'hero.loc': 'খামার পাঁচগাছি, সুন্দরগঞ্জ, গাইবান্ধা, রংপুর',
      'hero.cta1': 'যোগাযোগ করুন', 'hero.cta2': '৩ডি ল্যাব দেখুন',
      'hero.fc1a': 'রক্ষণাবেক্ষণ', 'hero.fc1b': 'স্থাপন ও মেরামত',
      'hero.fc2a': 'ডিপ্লোমা', 'hero.fc2b': 'মেকানিক্যাল ইঞ্জি.',
      'hero.fc3a': 'নিরাপত্তা আগে', 'hero.fc3b': 'মানসম্মত কাজ',
      'stats.ssc': 'এসএসসি জিপিএ', 'stats.dip': 'ডিপ্লোমা সিজিপিএ', 'stats.skills': 'মূল দক্ষতা', 'stats.lang': 'ভাষা',
      'about.kicker': 'ক্যারিয়ারের লক্ষ্য', 'about.title': 'উদ্দেশ্যপূর্ণ প্রকৌশল',
      'about.text': 'মেকানিক্যাল ইঞ্জিনিয়ারিং ক্ষেত্রে একটি সফল ক্যারিয়ার গড়ে তোলা, যেখানে আমি আমার কারিগরি জ্ঞান, ব্যবহারিক দক্ষতা ও সমস্যা সমাধানের সক্ষমতা কাজে লাগিয়ে প্রতিষ্ঠানের উন্নয়নে অবদান রাখতে পারব। মান, দক্ষতা ও নিরাপত্তা নিশ্চিত করে মেকানিক্যাল ডিজাইন, রক্ষণাবেক্ষণ ও ত্রুটি নির্ণয়ে নিজের দক্ষতা বাড়ানোই আমার লক্ষ্য। আমি নিবেদিতপ্রাণ, পরিশ্রমী এবং প্রতিষ্ঠানের সাফল্যে কার্যকরভাবে সহায়তা করতে নতুন প্রযুক্তি শিখতে আগ্রহী।',
      'about.v1': 'মেকানিক্যাল ডিজাইন', 'about.v1d': 'যন্ত্রাংশ, অ্যাসেম্বলি এবং যন্ত্র কীভাবে একসাথে কাজ করে তা বোঝা।',
      'about.v2': 'রক্ষণাবেক্ষণ', 'about.v2d': 'সিস্টেম, যন্ত্রপাতি ও সরঞ্জাম নির্ভরযোগ্য ও সচল রাখা।',
      'about.v3': 'ত্রুটি নির্ণয়', 'about.v3d': 'পদ্ধতিগতভাবে মূল কারণ খুঁজে বের করে ত্রুটি মেরামত।',
      'exp.kicker': 'কাজের অভিজ্ঞতা', 'exp.title': 'শিল্পক্ষেত্রে হাতে-কলমে',
      'exp.role': 'মেকানিক্যাল ইনস্টলেশন ও মেইনটেন্যান্স', 'exp.date': 'সেপ্টেম্বর ২০২৫ – নভেম্বর ২০২৫',
      'exp.org': 'বাংলাদেশ ইন্ডাস্ট্রিয়াল টেকনিক্যাল অ্যাসিস্ট্যান্স সেন্টার (বিটাক)',
      'exp.p1': 'মেকানিক্যাল সিস্টেম, যন্ত্রপাতি ও সরঞ্জাম স্থাপন ও রক্ষণাবেক্ষণে সহায়তা করেছি।',
      'exp.p2': 'শিল্প মেকানিক্যাল সিস্টেমের ত্রুটি নির্ণয় ও মেরামতে সিনিয়র ইঞ্জিনিয়ারদের সহযোগিতা করেছি।',
      'exp.p3': 'নিরাপত্তা বিধি মেনে চলেছি এবং মেকানিক্যাল অ্যাসেম্বলি ও রক্ষণাবেক্ষণের ব্যবহারিক প্রয়োগ শিখেছি।',
      'exp.p4': 'মেকানিক্যাল টুলস (রেঞ্চ, টর্ক টুল, ডায়াল গেজ, ভার্নিয়ার ক্যালিপার ইত্যাদি) ব্যবহারে হাতে-কলমে অভিজ্ঞতা অর্জন করেছি।',
      'tools.t1': 'রেঞ্চ', 'tools.t2': 'টর্ক টুল', 'tools.t3': 'ডায়াল গেজ', 'tools.t4': 'ভার্নিয়ার ক্যালিপার',
      'train.title': 'দক্ষতা উন্নয়ন প্রশিক্ষণ', 'train.date': '১ সেপ্টেম্বর ২০২৫ – ১৮ নভেম্বর ২০২৫',
      'train.desc': 'ব্যবহারিক মেকানিক্যাল দক্ষতা, ওয়ার্কশপ নিরাপত্তা ও পেশাদার চর্চা শক্তিশালী করার জন্য কাঠামোবদ্ধ শিল্প প্রশিক্ষণ।',
      'edu.kicker': 'শিক্ষাগত যোগ্যতা', 'edu.title': 'শিক্ষার ভিত্তি',
      'edu.y1': '২০২১ – ২০২৫', 'edu.s1': 'কুড়িগ্রাম পলিটেকনিক ইনস্টিটিউট', 'edu.d1': 'ডিপ্লোমা ইন মেকানিক্যাল ইঞ্জিনিয়ারিং',
      'edu.m1': 'মেকানিক্যাল টেকনোলজি', 'edu.r1v': '৩.১৭', 'edu.r1': 'সিজিপিএ (৪.০০ এর মধ্যে)',
      'edu.y2': '২০১৯ – ২০২১', 'edu.s2': 'শোভাগঞ্জ উচ্চ বিদ্যালয়', 'edu.d2': 'মাধ্যমিক স্কুল সার্টিফিকেট (এসএসসি)',
      'edu.m2': 'বিজ্ঞান — দিনাজপুর বোর্ড', 'edu.r2v': '৪.৮৯', 'edu.r2': 'জিপিএ (৫.০০ এর মধ্যে)',
      'skills.kicker': 'দক্ষতা', 'skills.title': 'কারিগরি ও ব্যক্তিগত দক্ষতা', 'skills.hint': 'কিউবটি টেনে ঘোরান',
      'skills.tech': 'কারিগরি', 'skills.soft': 'পেশাগত',
      'sk.elec': 'ইলেকট্রিক্যাল মেইনটেন্যান্স', 'sk.weld': 'ওয়েল্ডিং', 'sk.prog': 'বেসিক প্রোগ্রামিং', 'sk.office': 'এমএস অফিস',
      'sk.office2': 'এমএস ওয়ার্ড, এক্সেল, পাওয়ারপয়েন্ট', 'sk.net': 'ইন্টারনেট ও ইমেইল ব্যবহার', 'sk.comm': 'কারিগরি যোগাযোগ',
      'sk.ps': 'সমস্যা সমাধান', 'sk.team': 'দলগত কাজ', 'sk.team2': 'দলগত সহযোগিতা', 'sk.time': 'সময় ব্যবস্থাপনা',
      'sk.crit': 'বিশ্লেষণী চিন্তা', 'sk.hard': 'পরিশ্রমী', 'sk.lead': 'নেতৃত্ব',
      'lang.title': 'ভাষা', 'lang.bn': 'বাংলা', 'lang.en': 'ইংরেজি', 'lang.native': 'মাতৃভাষা', 'lang.work': 'কার্যকর',
      'lab.kicker': 'লাইভ ৩ডি ওয়ার্কস্পেস', 'lab.title': 'ইন্টারঅ্যাকটিভ মেকানিক্যাল অ্যানিমেশন ল্যাব',
      'lab.sub': 'যে যন্ত্রগুলো নিয়ে কাজ করি সেগুলোর রিয়েল-টাইম ৩ডি মডেল। টেনে ঘোরান, প্রজেক্ট বদলান, গতি পরিবর্তন করুন — প্রতিটি অংশ সঠিক কাইনেমেটিক্সে চলে।',
      'lab.p1': 'গিয়ার ট্রেন', 'lab.p1d': '৪-ধাপের স্পার গিয়ার ট্রান্সমিশন',
      'lab.p2': 'প্ল্যানেটারি গিয়ারবক্স', 'lab.p2d': 'সান, প্ল্যানেট ও রিং গিয়ার',
      'lab.p3': 'পিস্টন ইঞ্জিন', 'lab.p3d': 'স্লাইডার-ক্র্যাঙ্ক মেকানিজম',
      'lab.rpm': 'ইনপুট RPM', 'lab.out': 'আউটপুট RPM', 'lab.ratio': 'অনুপাত', 'lab.carrier': 'ক্যারিয়ার RPM',
      'lab.angle': 'ক্র্যাঙ্ক কোণ', 'lab.stroke': 'পিস্টন অবস্থান',
      'lab.speed': 'গতি', 'lab.drag': 'টেনে ঘোরান',
      'lab.nogl': '৩ডি প্রিভিউয়ের জন্য WebGL প্রয়োজন, যা এই ব্রাউজারে নেই।',
      'lab.d.gears': 'ড্রাইভার গিয়ার আইডলার ও কম্পাউন্ড গিয়ারের মাধ্যমে গতি সঞ্চালন করে। প্রতিটি জোড়া দিক উল্টে দেয় এবং দাঁতের অনুপাতে গতি পরিবর্তন করে।',
      'lab.d.planetary': 'সান গিয়ার তিনটি প্ল্যানেট গিয়ারকে স্থির রিং গিয়ারের ভেতরে ঘোরায়। প্ল্যানেট ক্যারিয়ার ধীরে ঘোরে — ছোট আকারে উচ্চ টর্ক রিডাকশন।',
      'lab.d.engine': 'ক্র্যাঙ্কশ্যাফট ও কানেক্টিং রড ঘূর্ণন গতিকে সিলিন্ডারের ভেতরে পিস্টনের ওঠানামায় রূপান্তর করে।',
      'info.kicker': 'ব্যক্তিগত তথ্য', 'info.title': 'এক নজরে',
      'info.name': 'নাম', 'info.nameV': 'মোঃ আহসান হাবিব নয়ন',
      'info.father': 'পিতার নাম', 'info.fatherV': 'মোঃ রেজাউল ইসলাম',
      'info.mother': 'মাতার নাম', 'info.motherV': 'মোছাঃ নূরবানু বেগম',
      'info.dob': 'জন্ম তারিখ', 'info.dobV': '০২ সেপ্টেম্বর ২০০৫',
      'info.rel': 'ধর্ম', 'info.relV': 'ইসলাম', 'info.mar': 'বৈবাহিক অবস্থা', 'info.marV': 'অবিবাহিত',
      'info.nat': 'জাতীয়তা', 'info.natV': 'বাংলাদেশি', 'info.blood': 'রক্তের গ্রুপ',
      'ref.title': 'রেফারেন্স', 'ref.text': 'অনুরোধ সাপেক্ষে প্রদান করা হবে।',
      'contact.kicker': 'যোগাযোগ', 'contact.title': 'চলুন একসাথে কাজ করি',
      'contact.sub': 'একজন নিবেদিত মেকানিক্যাল টেকনিশিয়ান খুঁজছেন? যোগাযোগ করুন — সাধারণত এক দিনের মধ্যেই উত্তর দিই।',
      'contact.phone': 'ফোন', 'contact.phoneV': '+৮৮০ ১৭৫৭ ৮২৭৯৯৬', 'contact.email': 'ইমেইল',
      'contact.loc': 'ঠিকানা', 'contact.locV': 'সুন্দরগঞ্জ, গাইবান্ধা', 'contact.wa': 'মেসেজ করুন',
      'form.name': 'আপনার নাম', 'form.email': 'আপনার ইমেইল', 'form.msg': 'বার্তা', 'form.send': 'ইমেইলে পাঠান',
      'form.note': 'আপনার ইমেইল অ্যাপে বার্তাটি পাঠানোর জন্য প্রস্তুত অবস্থায় খুলবে।',
      'footer.name': 'মোঃ আহসান হাবিব নয়ন', 'footer.rights': 'প্রকৌশলের প্রতি ভালোবাসা নিয়ে তৈরি।',
      'typed': ['মেকানিক্যাল ইঞ্জিনিয়ার', 'ইনস্টলেশন ও মেইনটেন্যান্স', 'ত্রুটি নির্ণয় বিশেষজ্ঞ', 'ওয়েল্ডিং ও ইলেকট্রিক্যাল'],
      'langBtn': 'English'
    }
  };

  var lang = root.getAttribute('lang') === 'bn' ? 'bn' : 'en';
  var BN_DIGITS = '০১২৩৪৫৬৭৮৯';
  function num(v) {
    var s = String(v);
    return lang === 'bn' ? s.replace(/[0-9]/g, function (d) { return BN_DIGITS[d]; }) : s;
  }
  function t(key) { return I18N[lang][key] != null ? I18N[lang][key] : I18N.en[key]; }

  function applyLang() {
    root.setAttribute('lang', lang);
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var v = t(el.getAttribute('data-i18n'));
      if (typeof v === 'string') el.textContent = v;
    });
    document.getElementById('langLabel').textContent = t('langBtn');
    document.querySelectorAll('.count').forEach(function (el) {
      if (el.dataset.done) el.textContent = num(formatCount(el, parseFloat(el.dataset.to)));
    });
    document.getElementById('year').textContent = num(new Date().getFullYear());
    restartTyped();
    if (window.__lab) window.__lab.refreshLabels();
  }

  document.getElementById('langToggle').addEventListener('click', function () {
    lang = lang === 'en' ? 'bn' : 'en';
    store('nayon-lang', lang);
    applyLang();
  });

  /* ---------------- Theme ---------------- */
  var themeBtn = document.getElementById('themeToggle');
  var themeListeners = [];
  function isDark() { return root.getAttribute('data-theme') === 'dark'; }
  function syncThemeUI() {
    themeBtn.innerHTML = isDark() ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', isDark() ? '#060a17' : '#f5f8ff');
    themeListeners.forEach(function (fn) { fn(isDark()); });
  }
  themeBtn.addEventListener('click', function () {
    root.setAttribute('data-theme', isDark() ? 'light' : 'dark');
    store('nayon-theme', root.getAttribute('data-theme'));
    syncThemeUI();
  });

  /* ---------------- Loader ---------------- */
  window.addEventListener('load', function () {
    setTimeout(function () { document.getElementById('loader').classList.add('done'); }, 350);
  });
  // Safety net in case a CDN asset stalls the load event
  setTimeout(function () { document.getElementById('loader').classList.add('done'); }, 3500);

  /* ---------------- Nav ---------------- */
  var nav = document.getElementById('nav');
  var navLinks = document.getElementById('navLinks');
  var menuBtn = document.getElementById('menuToggle');
  var progress = document.getElementById('scrollProgress');
  menuBtn.addEventListener('click', function () {
    var open = navLinks.classList.toggle('open');
    menuBtn.setAttribute('aria-expanded', String(open));
  });
  navLinks.querySelectorAll('a').forEach(function (a) {
    a.addEventListener('click', function () {
      navLinks.classList.remove('open');
      menuBtn.setAttribute('aria-expanded', 'false');
    });
  });

  var sections = Array.prototype.slice.call(document.querySelectorAll('main section[id]'));
  function onScroll() {
    var y = window.scrollY;
    nav.classList.toggle('scrolled', y > 20);
    var h = document.documentElement.scrollHeight - window.innerHeight;
    progress.style.transform = 'scaleX(' + (h > 0 ? y / h : 0) + ')';
    var current = '';
    sections.forEach(function (s) { if (s.offsetTop - 140 <= y) current = s.id; });
    navLinks.querySelectorAll('a').forEach(function (a) {
      a.classList.toggle('active', a.getAttribute('href') === '#' + current);
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------------- Typed roles ---------------- */
  var typedEl = document.getElementById('typed');
  var typedTimer = null;
  function restartTyped() {
    clearTimeout(typedTimer);
    var words = t('typed');
    if (reduceMotion) { typedEl.textContent = words[0]; return; }
    var wi = 0, ci = 0, deleting = false;
    (function tick() {
      var w = words[wi];
      ci += deleting ? -1 : 1;
      typedEl.textContent = w.slice(0, ci);
      var delay = deleting ? 40 : 85;
      if (!deleting && ci === w.length) { deleting = true; delay = 1600; }
      else if (deleting && ci === 0) { deleting = false; wi = (wi + 1) % words.length; delay = 350; }
      typedTimer = setTimeout(tick, delay);
    })();
  }

  /* ---------------- Reveal + counters ---------------- */
  function formatCount(el, v) {
    var dec = parseInt(el.dataset.dec || '0', 10);
    return v.toFixed(dec) + (el.dataset.suffix || '');
  }
  function runCounter(el) {
    var to = parseFloat(el.dataset.to), start = null, dur = 1600;
    function step(ts) {
      if (!start) start = ts;
      var p = Math.min((ts - start) / dur, 1);
      var e = 1 - Math.pow(1 - p, 3);
      el.textContent = num(formatCount(el, to * e));
      if (p < 1) requestAnimationFrame(step); else el.dataset.done = '1';
    }
    requestAnimationFrame(step);
  }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (!en.isIntersecting) return;
      en.target.classList.add('in');
      en.target.querySelectorAll('.count').forEach(function (c) { if (!c.dataset.started) { c.dataset.started = '1'; runCounter(c); } });
      io.unobserve(en.target);
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
  document.querySelectorAll('.reveal').forEach(function (el, i) {
    el.style.transitionDelay = (i % 4) * 0.08 + 's';
    io.observe(el);
  });

  /* ---------------- 3D tilt ---------------- */
  var canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (canHover && !reduceMotion) {
    document.querySelectorAll('.tilt').forEach(function (card) {
      card.addEventListener('pointermove', function (e) {
        var r = card.getBoundingClientRect();
        var x = (e.clientX - r.left) / r.width - 0.5;
        var y = (e.clientY - r.top) / r.height - 0.5;
        card.style.transform = 'perspective(900px) rotateX(' + (-y * 8) + 'deg) rotateY(' + (x * 10) + 'deg) translateY(-4px)';
      });
      card.addEventListener('pointerleave', function () { card.style.transform = ''; });
    });

    var glow = document.getElementById('cursorGlow');
    window.addEventListener('pointermove', function (e) {
      glow.classList.add('on');
      glow.style.left = e.clientX + 'px';
      glow.style.top = e.clientY + 'px';
    }, { passive: true });

    var stage = document.getElementById('orbitStage');
    document.querySelector('.hero').addEventListener('pointermove', function (e) {
      var x = e.clientX / window.innerWidth - 0.5;
      var y = e.clientY / window.innerHeight - 0.5;
      stage.style.transform = 'rotateY(' + (x * 18) + 'deg) rotateX(' + (-y * 14) + 'deg)';
    });
  }

  /* ---------------- Draggable skill cube ---------------- */
  (function () {
    var cube = document.getElementById('skillCube');
    var rx = -18, ry = 30, vx = 0, vy = 0.25, dragging = false, lx = 0, ly = 0;
    cube.addEventListener('pointerdown', function (e) {
      dragging = true; lx = e.clientX; ly = e.clientY; vx = vy = 0;
      cube.setPointerCapture(e.pointerId);
    });
    cube.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      vy = (e.clientX - lx) * 0.5; vx = -(e.clientY - ly) * 0.5;
      ry += vy; rx += vx; lx = e.clientX; ly = e.clientY;
    });
    function end() { dragging = false; }
    cube.addEventListener('pointerup', end);
    cube.addEventListener('pointercancel', end);
    (function loop() {
      if (!dragging) {
        vx *= 0.95; vy = vy * 0.95 + (reduceMotion ? 0 : 0.012);
        rx += vx; ry += vy;
      }
      cube.style.transform = 'rotateX(' + rx + 'deg) rotateY(' + ry + 'deg)';
      requestAnimationFrame(loop);
    })();
  })();

  /* ---------------- Contact form (mailto) ---------------- */
  document.getElementById('contactForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var f = e.target;
    var subject = 'Portfolio contact from ' + f.name.value;
    var body = f.message.value + '\n\n— ' + f.name.value + ' (' + f.email.value + ')';
    window.location.href = 'mailto:mdnayon718@gmail.com?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
  });

  /* =========================================================
     THREE.JS — shared gear helpers
     ========================================================= */
  var hasThree = typeof window.THREE !== 'undefined';
  function webglOK() {
    try {
      var c = document.createElement('canvas');
      return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl')));
    } catch (e) { return false; }
  }
  var GL = hasThree && webglOK();

  // Tooth profile points; a tooth is centred on angle 0 (local).
  function toothPoints(z, rBase, rTip) {
    var pts = [], p = (Math.PI * 2) / z;
    for (var i = 0; i < z; i++) {
      var a = i * p;
      [[rBase, -0.30], [rTip, -0.14], [rTip, 0.14], [rBase, 0.30]].forEach(function (q) {
        pts.push(new THREE.Vector2(Math.cos(a + q[1] * p) * q[0], Math.sin(a + q[1] * p) * q[0]));
      });
    }
    return pts;
  }
  // External spur gear with module m, z teeth.
  function gearGeometry(z, m, depth, hole) {
    var rp = (m * z) / 2;
    var shape = new THREE.Shape(toothPoints(z, rp - 1.25 * m, rp + m));
    var h = new THREE.Path();
    h.absarc(0, 0, hole || rp * 0.25, 0, Math.PI * 2, true);
    shape.holes.push(h);
    // Lightening holes on larger gears
    if (z >= 18) {
      for (var k = 0; k < 5; k++) {
        var a = (k / 5) * Math.PI * 2 + Math.PI / 5, rr = rp * 0.58;
        var lh = new THREE.Path();
        lh.absarc(Math.cos(a) * rr, Math.sin(a) * rr, rp * 0.17, 0, Math.PI * 2, true);
        shape.holes.push(lh);
      }
    }
    var g = new THREE.ExtrudeGeometry(shape, { depth: depth, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2, curveSegments: 24 });
    g.translate(0, 0, -depth / 2);
    return g;
  }
  // Internal ring gear.
  function ringGeometry(z, m, depth, outer) {
    var rp = (m * z) / 2;
    var shape = new THREE.Shape();
    shape.absarc(0, 0, outer, 0, Math.PI * 2, false);
    var hole = new THREE.Path(toothPoints(z, rp + 1.25 * m, rp - m).reverse());
    shape.holes.push(hole);
    var g = new THREE.ExtrudeGeometry(shape, { depth: depth, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2, curveSegments: 48 });
    g.translate(0, 0, -depth / 2);
    return g;
  }
  // Angle of gear 2 so it meshes with gear 1 (angle phi1) when gear 2's centre lies in direction alpha from gear 1.
  function meshAngle(alpha, phi1, z1, z2) {
    return alpha + Math.PI - (Math.PI - (alpha - phi1) * z1) / z2;
  }

  function palette(dark) {
    return dark ? {
      blue: 0x4f8bff, green: 0x2ee6a8, violet: 0xa07bff, steel: 0x9aa8c7, orange: 0xff9f43,
      glass: 0x7aa8ff, particle: 0x9cc2ff, emissive: 0.18
    } : {
      blue: 0x1d63ff, green: 0x10b981, violet: 0x7c4dff, steel: 0x8391ad, orange: 0xf97316,
      glass: 0x4f8bff, particle: 0x1d63ff, emissive: 0.05
    };
  }
  function metal(color, emi) {
    return new THREE.MeshStandardMaterial({ color: color, metalness: 0.55, roughness: 0.32, emissive: color, emissiveIntensity: emi || 0.05 });
  }
  function addLights(scene) {
    scene.add(new THREE.HemisphereLight(0xffffff, 0x445577, 0.9));
    var d = new THREE.DirectionalLight(0xffffff, 1.1); d.position.set(4, 6, 8); scene.add(d);
    var p1 = new THREE.PointLight(0x4f8bff, 1.2, 30); p1.position.set(-6, 3, 4); scene.add(p1);
    var p2 = new THREE.PointLight(0x10b981, 1.0, 30); p2.position.set(6, -4, 4); scene.add(p2);
  }
  function makeRenderer(canvas, alpha) {
    var r = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: alpha !== false });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.outputEncoding = THREE.sRGBEncoding;
    return r;
  }
  // Only render while visible
  function visibilityGate(el) {
    var state = { visible: true };
    new IntersectionObserver(function (e) { state.visible = e[0].isIntersecting; }, { threshold: 0 }).observe(el);
    return state;
  }

  /* =========================================================
     HERO 3D SCENE — floating meshed gears + particles
     ========================================================= */
  function initHero() {
    var canvas = document.getElementById('hero3d');
    var renderer = makeRenderer(canvas);
    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(0, 0, 12);
    addLights(scene);

    var pal = palette(isDark());
    var group = new THREE.Group();
    scene.add(group);

    var m = 0.16;
    var specs = [
      { z: 24, color: 'blue' },
      { z: 14, color: 'green', alpha: -0.35 },
      { z: 18, color: 'violet', alpha: 1.35 }
    ];
    var gears = [];
    var g0 = new THREE.Mesh(gearGeometry(specs[0].z, m, 0.45), metal(pal.blue, pal.emissive));
    group.add(g0); gears.push({ mesh: g0, spec: specs[0], pos: new THREE.Vector2(0, 0) });
    for (var i = 1; i < specs.length; i++) {
      var s = specs[i];
      var d = (m * specs[0].z) / 2 + (m * s.z) / 2;
      var mesh = new THREE.Mesh(gearGeometry(s.z, m, 0.45), metal(pal[s.color], pal.emissive));
      mesh.position.set(Math.cos(s.alpha) * d, Math.sin(s.alpha) * d, 0);
      group.add(mesh);
      gears.push({ mesh: mesh, spec: s });
    }
    // Axles
    gears.forEach(function (g) {
      var ax = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.9, 20), metal(pal.steel));
      ax.rotation.x = Math.PI / 2;
      ax.position.copy(g.mesh.position);
      group.add(ax);
      g.axle = ax;
    });

    // Wireframe icosahedron
    var ico = new THREE.Mesh(new THREE.IcosahedronGeometry(1.1, 1), new THREE.MeshBasicMaterial({ color: pal.green, wireframe: true, transparent: true, opacity: 0.45 }));
    scene.add(ico);
    var torus = new THREE.Mesh(new THREE.TorusKnotGeometry(0.6, 0.18, 120, 16), metal(pal.orange, pal.emissive));
    scene.add(torus);

    // Particles
    var N = window.innerWidth < 700 ? 350 : 800;
    var pos = new Float32Array(N * 3);
    for (var k = 0; k < N; k++) {
      pos[k * 3] = (Math.random() - 0.5) * 30;
      pos[k * 3 + 1] = (Math.random() - 0.5) * 18;
      pos[k * 3 + 2] = (Math.random() - 0.5) * 14 - 3;
    }
    var pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    var pm = new THREE.PointsMaterial({ color: pal.particle, size: 0.05, transparent: true, opacity: 0.7 });
    var points = new THREE.Points(pg, pm);
    scene.add(points);

    function layout() {
      var w = canvas.clientWidth, h = canvas.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h; camera.updateProjectionMatrix();
      var mobile = w < 960;
      group.position.set(mobile ? 2.6 : 7.6, mobile ? 4.2 : 1.6, mobile ? -7 : -4);
      group.scale.setScalar(mobile ? 0.7 : 0.9);
      ico.position.set(mobile ? -3.4 : 1.2, mobile ? 4.6 : 3.9, -5);
      torus.position.set(mobile ? -3 : 1.6, mobile ? -5 : -4.3, -4);
      canvas.style.opacity = mobile ? '0.55' : '1';
    }
    layout();
    window.addEventListener('resize', layout);

    themeListeners.push(function (dark) {
      var p = palette(dark);
      gears.forEach(function (g) {
        g.mesh.material.color.setHex(p[g.spec.color]); g.mesh.material.emissive.setHex(p[g.spec.color]); g.mesh.material.emissiveIntensity = p.emissive;
        g.axle.material.color.setHex(p.steel);
      });
      ico.material.color.setHex(p.green);
      torus.material.color.setHex(p.orange); torus.material.emissive.setHex(p.orange);
      pm.color.setHex(p.particle);
    });

    var mx = 0, my = 0;
    window.addEventListener('pointermove', function (e) {
      mx = e.clientX / window.innerWidth - 0.5;
      my = e.clientY / window.innerHeight - 0.5;
    }, { passive: true });

    var gate = visibilityGate(canvas);
    var clock = new THREE.Clock();
    var phi = 0;
    (function loop() {
      requestAnimationFrame(loop);
      var dt = Math.min(clock.getDelta(), 0.05);
      if (!gate.visible || document.hidden) return;
      if (!reduceMotion) phi += dt * 0.5;
      g0.rotation.z = phi;
      for (var j = 1; j < gears.length; j++) {
        gears[j].mesh.rotation.z = meshAngle(gears[j].spec.alpha, phi, specs[0].z, gears[j].spec.z);
      }
      var tt = clock.elapsedTime;
      group.rotation.y += ((mx * 0.6 - 0.35) - group.rotation.y) * 0.05;
      group.rotation.x += ((my * 0.5 + 0.15) - group.rotation.x) * 0.05;
      ico.rotation.x = tt * 0.2; ico.rotation.y = tt * 0.3;
      ico.position.y += Math.sin(tt) * 0.002;
      torus.rotation.x = tt * 0.4; torus.rotation.y = tt * 0.25;
      points.rotation.y = tt * 0.02 + mx * 0.1;
      points.rotation.x = my * 0.05;
      camera.position.y = -window.scrollY * 0.002;
      renderer.render(scene, camera);
    })();
  }

  /* =========================================================
     LIVE 3D LAB — gear train / planetary / piston engine
     ========================================================= */
  function initLab() {
    var canvas = document.getElementById('lab3d');
    var renderer = makeRenderer(canvas);
    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    var CAM_Z = 11;
    camera.position.set(0, 0, CAM_Z);
    addLights(scene);

    var pivot = new THREE.Group();
    scene.add(pivot);
    var pal = palette(isDark());
    var materials = [];   // {mat, key}
    function mat(key, opts) {
      var mm = metal(pal[key], pal.emissive);
      if (opts) Object.keys(opts).forEach(function (k) { mm[k] = opts[k]; });
      materials.push({ mat: mm, key: key });
      return mm;
    }

    var models = {};
    var rpm = 60, playing = !reduceMotion, autoOrbit = true, wire = false;
    var theta = 0; // input shaft angle (rad)

    /* ---- Gear train ---- */
    (function () {
      var grp = new THREE.Group();
      var m = 0.14;
      // chain: z, direction from previous gear, colour
      var chain = [
        { z: 30, color: 'blue' },
        { z: 14, alpha: 0.35, color: 'green' },
        { z: 24, alpha: -0.55, color: 'violet' },
        { z: 12, alpha: 0.6, color: 'orange' }
      ];
      var parts = [];
      var x = 0, y = 0;
      chain.forEach(function (c, i) {
        if (i > 0) {
          var d = (m * chain[i - 1].z) / 2 + (m * c.z) / 2;
          x += Math.cos(c.alpha) * d; y += Math.sin(c.alpha) * d;
        }
        var mesh = new THREE.Mesh(gearGeometry(c.z, m, 0.5), mat(c.color));
        mesh.position.set(x, y, 0);
        var ax = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.4, 20), mat('steel'));
        ax.rotation.x = Math.PI / 2; ax.position.set(x, y, 0);
        grp.add(mesh, ax);
        parts.push({ mesh: mesh, c: c });
      });
      // Base plate
      var box = new THREE.Box3().setFromObject(grp);
      var center = box.getCenter(new THREE.Vector3());
      var size = box.getSize(new THREE.Vector3());
      var plate = new THREE.Mesh(new THREE.BoxGeometry(size.x + 0.8, size.y + 0.8, 0.12), mat('steel', { metalness: 0.3, roughness: 0.6, transparent: true, opacity: 0.35 }));
      plate.position.set(center.x, center.y, -0.55);
      grp.add(plate);
      grp.children.forEach(function (o) { o.position.x -= center.x; o.position.y -= center.y; });

      var ratio = chain[chain.length - 1].z / chain[0].z;
      models.gears = {
        group: grp, scale: 1,
        update: function (th) {
          var phi = th;
          parts[0].mesh.rotation.z = phi;
          for (var i = 1; i < parts.length; i++) {
            phi = meshAngle(parts[i].c.alpha, phi, parts[i - 1].c.z, parts[i].c.z);
            parts[i].mesh.rotation.z = phi;
          }
        },
        hud: function () {
          return [['lab.out', (rpm * chain[0].z / chain[chain.length - 1].z).toFixed(0)], ['lab.ratio', '1 : ' + ratio.toFixed(2)]];
        }
      };
    })();

    /* ---- Planetary gearbox ---- */
    (function () {
      var grp = new THREE.Group();
      var m = 0.12, Zs = 18, Zp = 9, Zr = 36, depth = 0.5; // (Zs+Zr)/3 = 18 → evenly spaced planets
      var rs = (m * Zs) / 2, rpl = (m * Zp) / 2, orbitR = rs + rpl;
      var sun = new THREE.Mesh(gearGeometry(Zs, m, depth), mat('orange'));
      var ring = new THREE.Mesh(ringGeometry(Zr, m, depth, (m * Zr) / 2 + 0.45), mat('steel', { transparent: true, opacity: 0.9 }));
      grp.add(sun, ring);
      var carrier = new THREE.Group();
      grp.add(carrier);
      var arm = new THREE.Mesh(new THREE.CylinderGeometry(orbitR + 0.28, orbitR + 0.28, 0.1, 3), mat('blue', { transparent: true, opacity: 0.55 }));
      arm.rotation.x = Math.PI / 2; arm.position.z = depth / 2 + 0.12;
      carrier.add(arm);
      var planets = [];
      for (var k = 0; k < 3; k++) {
        var pm = new THREE.Mesh(gearGeometry(Zp, m, depth, 0.1), mat(k === 0 ? 'green' : k === 1 ? 'violet' : 'blue'));
        grp.add(pm);
        var pin = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.9, 16), mat('steel'));
        pin.rotation.x = Math.PI / 2;
        grp.add(pin);
        planets.push({ mesh: pm, pin: pin, base: (k / 3) * Math.PI * 2 });
      }
      var shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 1.6, 20), mat('steel'));
      shaft.rotation.x = Math.PI / 2; grp.add(shaft);
      // Ring phase: fixed so planet 0 meshes at t = 0
      var p0 = meshAngle(0, 0, Zs, Zp);
      ring.rotation.z = -(((0 - p0) * Zp + Math.PI) / Zr);

      var carrierRatio = Zs / (Zs + Zr);
      models.planetary = {
        group: grp, scale: 1.25,
        update: function (th) {
          sun.rotation.z = th;
          var c = th * carrierRatio;
          carrier.rotation.z = c;
          planets.forEach(function (p) {
            var a = c + p.base;
            p.mesh.position.set(Math.cos(a) * orbitR, Math.sin(a) * orbitR, 0);
            p.pin.position.copy(p.mesh.position);
            p.mesh.rotation.z = meshAngle(a, th, Zs, Zp);
          });
        },
        hud: function () {
          return [['lab.carrier', (rpm * carrierRatio).toFixed(1)], ['lab.ratio', '1 : ' + (1 / carrierRatio).toFixed(0)]];
        }
      };
    })();

    /* ---- Piston engine (slider-crank) ---- */
    (function () {
      var grp = new THREE.Group();
      var r = 0.9, L = 2.6, bore = 0.62;
      var crankY = -1.6;
      var crank = new THREE.Group();
      crank.position.y = crankY;
      grp.add(crank);
      var web = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, 0.28, 48), mat('blue'));
      web.rotation.x = Math.PI / 2; web.position.z = -0.35;
      crank.add(web);
      var counter = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.3, 3), mat('violet'));
      counter.rotation.x = Math.PI / 2; counter.rotation.y = Math.PI / 2; counter.position.set(0, -0.5, -0.35);
      crank.add(counter);
      var mainShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.4, 20), mat('steel'));
      mainShaft.rotation.x = Math.PI / 2; crank.add(mainShaft);
      var crankPin = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.7, 20), mat('steel'));
      crankPin.rotation.x = Math.PI / 2; crankPin.position.set(0, r, -0.05);
      crank.add(crankPin);
      // Flywheel gear behind
      var fly = new THREE.Mesh(gearGeometry(32, 0.09, 0.2), mat('green'));
      fly.position.z = -0.7; crank.add(fly);

      var rod = new THREE.Mesh(new THREE.BoxGeometry(0.22, L, 0.18), mat('orange'));
      grp.add(rod);
      var bigEnd = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.07, 12, 24), mat('orange'));
      var smallEnd = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.06, 12, 24), mat('orange'));
      grp.add(bigEnd, smallEnd);

      var piston = new THREE.Group();
      var head = new THREE.Mesh(new THREE.CylinderGeometry(bore, bore, 0.9, 40), mat('steel'));
      piston.add(head);
      [0.25, 0.38].forEach(function (yy) {
        var ringM = new THREE.Mesh(new THREE.TorusGeometry(bore + 0.005, 0.03, 8, 40), mat('violet'));
        ringM.rotation.x = Math.PI / 2; ringM.position.y = yy; piston.add(ringM);
      });
      grp.add(piston);

      var cylH = 2 * r + 1.4;
      var cylinder = new THREE.Mesh(new THREE.CylinderGeometry(bore + 0.08, bore + 0.08, cylH, 40, 1, true),
        mat('blue', { transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }));
      var yMin = crankY + L - r, yMax = crankY + L + r;
      cylinder.position.y = (yMin + yMax) / 2 + 0.3;
      grp.add(cylinder);
      var headCap = new THREE.Mesh(new THREE.CylinderGeometry(bore + 0.14, bore + 0.14, 0.2, 40), mat('steel', { transparent: true, opacity: 0.5 }));
      headCap.position.y = cylinder.position.y + cylH / 2 + 0.1;
      grp.add(headCap);
      var plug = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.4, 12), mat('orange'));
      plug.position.y = headCap.position.y + 0.25; grp.add(plug);
      var spark = new THREE.PointLight(0xffa640, 0, 4);
      spark.position.y = headCap.position.y - 0.3; grp.add(spark);

      grp.position.y = -0.6;
      var lastAngleDeg = 0, lastPos = 0;
      models.engine = {
        group: grp, scale: 1,
        update: function (th) {
          crank.rotation.z = -th; // clockwise
          var a = th;
          var px = r * Math.sin(a), py = r * Math.cos(a);
          var sy = py + Math.sqrt(L * L - px * px);
          var pinW = new THREE.Vector2(px, crankY + py);
          var pistonPinY = crankY + sy;
          piston.position.set(0, pistonPinY + 0.25, 0);
          var vx = -pinW.x, vy = pistonPinY - pinW.y;
          rod.position.set(pinW.x / 2, (pinW.y + pistonPinY) / 2, 0.15);
          rod.rotation.z = Math.atan2(-vx, vy);
          bigEnd.position.set(pinW.x, pinW.y, 0.15);
          smallEnd.position.set(0, pistonPinY, 0.15);
          var deg = ((a * 180 / Math.PI) % 360 + 360) % 360;
          // Spark flash near top dead centre on every other revolution (4-stroke)
          var cycle = ((a / (Math.PI * 2)) % 2 + 2) % 2;
          spark.intensity = cycle < 0.08 ? 3 * (1 - cycle / 0.08) : 0;
          lastAngleDeg = deg; lastPos = (sy - (L - r)) / (2 * r) * 100;
        },
        hud: function () {
          return [['lab.angle', lastAngleDeg.toFixed(0) + '°'], ['lab.stroke', lastPos.toFixed(0) + '%']];
        }
      };
    })();

    Object.keys(models).forEach(function (k) { models[k].group.visible = false; pivot.add(models[k].group); });

    var mode = 'gears';
    var DEF_ROT = { x: -0.35, y: 0.2 };
    var rot = { x: DEF_ROT.x, y: DEF_ROT.y }, vel = { x: 0, y: 0 }, zoom = 1, sway = 0;
    function setMode(m) {
      mode = m;
      Object.keys(models).forEach(function (k) { models[k].group.visible = k === m; });
      pivot.scale.setScalar(models[m].scale);
      document.querySelectorAll('.proj-card').forEach(function (b) {
        var on = b.dataset.mode === m;
        b.classList.toggle('active', on); b.setAttribute('aria-selected', String(on));
      });
      refreshLabels();
      // little pop-in
      pivot.scale.multiplyScalar(0.85);
    }
    function refreshLabels() {
      var key = mode === 'gears' ? 'lab.p1' : mode === 'planetary' ? 'lab.p2' : 'lab.p3';
      document.getElementById('wsTitle').textContent = t(key);
      document.getElementById('labDesc').textContent = t('lab.d.' + mode);
      updateHud(true);
    }
    var hudTick = 0;
    function updateHud(force) {
      if (!force && (hudTick++ % 6)) return;
      document.getElementById('hudRpm').textContent = num(rpm);
      var rows = models[mode].hud();
      document.getElementById('hudLabel2').textContent = t(rows[0][0]);
      document.getElementById('hudVal2').textContent = num(rows[0][1]);
      document.getElementById('hudLabel3').textContent = t(rows[1][0]);
      document.getElementById('hudVal3').textContent = num(rows[1][1]);
    }

    document.querySelectorAll('.proj-card').forEach(function (b) {
      b.addEventListener('click', function () { setMode(b.dataset.mode); });
    });
    var playBtn = document.getElementById('ctlPlay');
    function syncPlay() {
      playBtn.innerHTML = playing ? '<i class="fa-solid fa-pause"></i>' : '<i class="fa-solid fa-play"></i>';
      playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    }
    playBtn.addEventListener('click', function () { playing = !playing; syncPlay(); });
    syncPlay();
    document.getElementById('ctlSpeed').addEventListener('input', function (e) { rpm = parseInt(e.target.value, 10); updateHud(true); });
    var wireBtn = document.getElementById('ctlWire');
    wireBtn.addEventListener('click', function () {
      wire = !wire; wireBtn.classList.toggle('on', wire);
      materials.forEach(function (o) { o.mat.wireframe = wire; });
    });
    var spinBtn = document.getElementById('ctlSpin');
    spinBtn.classList.toggle('on', autoOrbit);
    spinBtn.addEventListener('click', function () { autoOrbit = !autoOrbit; spinBtn.classList.toggle('on', autoOrbit); });
    document.getElementById('ctlReset').addEventListener('click', function () {
      rot.x = DEF_ROT.x; rot.y = DEF_ROT.y; vel.x = vel.y = 0; zoom = 1; sway = 0;
    });

    // Drag to rotate (horizontal drag on touch; vertical scroll still works)
    var dragging = false, lx = 0, ly = 0;
    canvas.addEventListener('pointerdown', function (e) {
      dragging = true; lx = e.clientX; ly = e.clientY; vel.x = vel.y = 0;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      vel.y = (e.clientX - lx) * 0.008; vel.x = (e.clientY - ly) * 0.008;
      rot.y += vel.y; rot.x += vel.x;
      rot.x = Math.max(-1.4, Math.min(1.4, rot.x));
      lx = e.clientX; ly = e.clientY;
    });
    ['pointerup', 'pointercancel'].forEach(function (ev) { canvas.addEventListener(ev, function () { dragging = false; }); });
    canvas.addEventListener('wheel', function (e) {
      if (!e.ctrlKey && !e.metaKey) return; // keep normal page scrolling
      e.preventDefault();
      zoom = Math.max(0.6, Math.min(1.8, zoom - e.deltaY * 0.001));
    }, { passive: false });

    function resize() {
      var w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas); else window.addEventListener('resize', resize);
    resize();

    themeListeners.push(function (dark) {
      pal = palette(dark);
      materials.forEach(function (o) {
        o.mat.color.setHex(pal[o.key]); o.mat.emissive.setHex(pal[o.key]); o.mat.emissiveIntensity = pal.emissive;
      });
    });

    var gate = visibilityGate(canvas);
    var clock = new THREE.Clock();
    setMode('gears');
    (function loop() {
      requestAnimationFrame(loop);
      var dt = Math.min(clock.getDelta(), 0.05);
      if (!gate.visible || document.hidden) return;
      if (playing) theta += (rpm / 60) * Math.PI * 2 * dt * 0.5;
      models[mode].update(theta);
      if (!dragging) {
        vel.x *= 0.92; vel.y *= 0.92;
        rot.x += vel.x; rot.y += vel.y;
      }
      if (autoOrbit && !reduceMotion) sway += dt * 0.45;
      pivot.rotation.x = rot.x; pivot.rotation.y = rot.y + Math.sin(sway) * 0.55;
      var target = models[mode].scale;
      var s = pivot.scale.x + (target - pivot.scale.x) * 0.12;
      pivot.scale.setScalar(s);
      var mobile = canvas.clientWidth < 600;
      camera.position.z += ((CAM_Z * (mobile ? 1.35 : 1)) / zoom - camera.position.z) * 0.1;
      updateHud(false);
      renderer.render(scene, camera);
    })();

    window.__lab = { refreshLabels: refreshLabels };
  }

  /* ---------------- Boot ---------------- */
  applyLang();
  syncThemeUI();
  if (GL) {
    try { initHero(); } catch (e) { console.warn('Hero 3D failed', e); }
    try { initLab(); } catch (e) {
      console.warn('Lab 3D failed', e);
      document.querySelector('.ws-body').classList.add('no-webgl');
    }
  } else {
    document.querySelector('.ws-body').classList.add('no-webgl');
  }
})();

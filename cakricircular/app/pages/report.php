<?php
/* ================= রিপোর্ট বা প্রমোশন ================= */
css_once('report', <<<CSS
.rp-grid{display:grid;grid-template-columns:1fr 340px;gap:16px;align-items:start}
.rp{background:var(--card);border:1px solid var(--line-2);border-radius:20px;
  box-shadow:0 1px 2px rgba(16,40,36,.04),0 10px 26px rgba(16,40,36,.05);padding:22px}
.rp h2{font-size:1.06rem;margin:0 0 4px;font-weight:700;display:flex;align-items:center;gap:9px}
.rp h2 i{color:var(--brand)}
.rp .lead{color:var(--muted);font-size:.89rem;margin:0 0 18px;line-height:1.7}

/* ট্যাব */
.rp-tabs{display:flex;gap:8px;margin-bottom:18px;background:var(--chip);padding:5px;border-radius:14px}
.rp-tab{flex:1;display:flex;align-items:center;justify-content:center;gap:8px;border:0;background:transparent;
  color:var(--muted);font-weight:700;font-size:.86rem;padding:10px 10px;border-radius:11px;cursor:pointer;transition:.18s}
.rp-tab.active{background:var(--card);color:var(--brand-d);box-shadow:0 3px 10px rgba(16,40,36,.08)}
.rp-tab i{font-size:.9rem}

.rp-promo-info{display:none;background:var(--brand-l);border:1px solid var(--line);border-radius:15px;
  padding:14px 16px;margin-bottom:18px}
.rp-promo-info.show{display:block}
.rp-promo-info b{display:block;color:var(--brand-d);font-size:.88rem;margin-bottom:7px}
.rp-promo-info ul{margin:0;padding-left:19px}
.rp-promo-info li{font-size:.85rem;color:var(--ink-2);line-height:1.8}

.fld{margin-bottom:15px}
.fld label{display:block;font-size:.85rem;font-weight:600;margin-bottom:6px;color:var(--ink-2)}
.fld label span{color:var(--danger)}
.fld label span[id]{color:inherit}
.fwrap{position:relative;display:flex;align-items:center}
.fwrap>i{position:absolute;right:14px;color:var(--muted);font-size:.86rem;pointer-events:none}
.fld input,.fld textarea{width:100%;border:1.5px solid var(--line);border-radius:14px;background:var(--soft);
  padding:13px 40px 13px 14px;font:inherit;font-size:.95rem;transition:.18s;color:var(--ink)}
.fld textarea{min-height:140px;resize:vertical;line-height:1.8;padding-right:14px}
.fld input:focus,.fld textarea:focus{outline:none;border-color:var(--brand);background:var(--card);box-shadow:0 0 0 4px rgba(15,118,110,.1)}
.rp-msg{padding:12px 15px;border-radius:13px;font-size:.89rem;margin-bottom:15px;display:none;align-items:center;gap:9px}
.rp-msg.ok{display:flex;background:#e7f6ef;color:var(--ok)}
.rp-msg.err{display:flex;background:#fdecea;color:var(--danger)}
.rp-sub{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.rp-sub .hintx{font-size:.8rem;color:var(--muted)}
.rp-side{display:grid;gap:12px}
.rp-card{background:var(--card);border:1px solid var(--line-2);border-radius:18px;padding:16px;box-shadow:var(--sh)}
.rp-card h3{margin:0 0 10px;font-size:.95rem;font-weight:700;display:flex;align-items:center;gap:8px}
.rp-card h3 i{color:var(--brand)}
.rp-step{display:flex;gap:11px;padding:8px 0;font-size:.87rem;color:var(--ink-2);line-height:1.6}
.rp-step .n{width:24px;height:24px;flex:none;border-radius:50%;background:var(--brand-l);color:var(--brand-d);
  display:grid;place-items:center;font-size:.76rem;font-weight:700}
.rp-mail{display:flex;align-items:center;gap:10px;font-size:.87rem;font-weight:600;color:var(--brand-d);
  background:var(--brand-l);padding:12px 14px;border-radius:13px;word-break:break-all}
@media(max-width:860px){ .rp-grid{grid-template-columns:1fr} }
@media(max-width:700px){ .rp{padding:16px;border-radius:17px} .rp-tab{font-size:.8rem;padding:9px 6px} }
CSS);

js_once('report_js', <<<'JS'
(function () {
  var TXT = {
    report: {
      lead: 'নিচের ঘরগুলো পূরণ করে পাঠান। প্রয়োজনে আমরা আপনার ইমেইলে যোগাযোগ করব।',
      titleLabel: 'বিষয় / পোস্টের নাম',
      titlePh: 'কোন পোস্টে সমস্যা?',
      detLabel: 'বিস্তারিত',
      detPh: 'কী ভুল আছে, বিস্তারিত লিখুন… সম্ভব হলে পোস্টের লিংকটিও দিন।',
      emailLabel: 'আপনার ইমেইল',
      btn: 'রিপোর্ট পাঠান',
      okTitle: 'রিপোর্ট পৌঁছে গেছে',
      okText: 'ধন্যবাদ! আপনার পাঠানো তথ্য আমরা যাচাই করে দ্রুত ঠিক করে দেব।'
    },
    promo: {
      lead: 'আপনার প্রতিষ্ঠানের নিয়োগ বিজ্ঞপ্তি আমাদের ওয়েবসাইটে প্রকাশ করতে চাইলে নিচের ঘরগুলো পূরণ করুন।',
      titleLabel: 'প্রতিষ্ঠান ও পদের নাম',
      titlePh: 'যেমনঃ ABC লিমিটেড — অ্যাকাউন্ট্যান্ট পদে নিয়োগ',
      detLabel: 'বিস্তারিত',
      detPh: 'পদ সংখ্যা, যোগ্যতা, আবেদনের শেষ তারিখ এবং আবেদনের লিংক বা বিজ্ঞপ্তির পিডিএফ লিংক উল্লেখ করুন।',
      emailLabel: 'যোগাযোগের ইমেইল / ফোন',
      btn: 'অনুরোধ পাঠান',
      okTitle: 'অনুরোধ পৌঁছে গেছে',
      okText: 'ধন্যবাদ! আমরা বিজ্ঞপ্তিটি যাচাই করে শীঘ্রই যোগাযোগ করব।'
    }
  };

  function setMode(mode) {
    var f = document.getElementById('reportForm');
    if (!f) return;
    f.dataset.mode = mode;
    document.getElementById('rp-mode').value = mode;
    var t = TXT[mode];
    document.getElementById('rpLead').textContent = t.lead;
    document.getElementById('rpTitleLabelTxt').textContent = t.titleLabel;
    document.getElementById('rp-title').placeholder = t.titlePh;
    document.getElementById('rpDetLabelTxt').textContent = t.detLabel;
    document.getElementById('rp-det').placeholder = t.detPh;
    document.getElementById('rpEmailLabelTxt').textContent = t.emailLabel;
    document.getElementById('rpSubBtnTxt').textContent = t.btn;
    document.getElementById('rpPromoInfo').classList.toggle('show', mode === 'promo');
    document.querySelectorAll('.rp-tab').forEach(function (b) {
      b.classList.toggle('active', b.dataset.mode === mode);
    });
  }

  document.addEventListener('click', function (e) {
    var b = e.target.closest('.rp-tab');
    if (b) setMode(b.dataset.mode);
  });

  document.addEventListener('submit', function (e) {
    var f = e.target;
    if (f.id !== 'reportForm') return;
    e.preventDefault();
    var mode = f.dataset.mode || 'report';
    var t = TXT[mode];
    var box = document.getElementById('rpMsg');
    var btn = f.querySelector('button[type=submit]');
    var old = btn.innerHTML;
    btn.disabled = true; btn.style.opacity = .7;
    btn.innerHTML = '<i class="fa fa-circle-notch fa-spin"></i> পাঠানো হচ্ছে…';
    box.className = 'rp-msg';

    var title = f.title.value;
    var details = f.details.value;
    if (mode === 'promo') {
      title = '[বিজ্ঞপ্তি প্রকাশ] ' + title;
      details = 'ধরন: প্রতিষ্ঠানের নিয়োগ বিজ্ঞপ্তি প্রকাশের অনুরোধ\n\n' + details;
    }

    /* সাধারণ ফর্ম-পোস্ট হিসেবে পাঠাই — কিছু হোস্টিংয়ের ফায়ারওয়াল JSON বডি আটকে দেয় */
    var got = false;
    var data = new URLSearchParams();
    data.set('email', f.email.value);
    data.set('title', title);
    data.set('details', details);
    data.set('_token', window.CC.csrf || '');

    fetch(window.CC.base + 'api/report', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-CSRF': window.CC.csrf || '',
        'X-Requested-With': 'fetch'
      },
      body: data.toString()
    }).then(function (r) {
      return r.text().then(function (txt) {
        try { return JSON.parse(txt); }
        catch (err) {
          /* সার্ভার JSON-এর বদলে অন্য কিছু পাঠিয়েছে — আসল কারণটা দেখাই */
          var clean = txt.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
          return { ok: false, msg: clean ? ('সার্ভার বলছে: ' + clean.slice(0, 160)) : ('সার্ভার সাড়া দেয়নি (কোড ' + r.status + ')') };
        }
      });
    }).then(function (d) {
      got = true;                       /* সার্ভারের উত্তর এসে গেছে */
      try {
        if (d && d.ok) {
          try { f.reset(); setMode(mode); } catch (x) {}
          box.className = 'rp-msg ok';
          box.innerHTML = '<i class="fa fa-circle-check"></i>' + (t.okTitle || 'পাঠানো হয়েছে');
          if (window.ccDialog) {
            window.ccDialog({ type: 'ok', icon: 'fa-paper-plane', title: t.okTitle, text: t.okText, btn: 'ঠিক আছে' });
          } else if (window.ccToast) {
            window.ccToast(t.okTitle, 'ok');
          }
        } else {
          box.className = 'rp-msg err';
          box.innerHTML = '<i class="fa fa-circle-exclamation"></i>' + ((d && d.msg) || 'পাঠানো যায়নি।');
          if (window.ccToast) window.ccToast((d && d.msg) || 'পাঠানো যায়নি', 'err');
        }
      } catch (x) {
        /* সাজানোর কোনো ধাপে ভুল হলেও ডেটা কিন্তু সার্ভারে পৌঁছে গেছে */
        box.className = 'rp-msg ok';
        box.innerHTML = '<i class="fa fa-circle-check"></i>পাঠানো হয়েছে। ধন্যবাদ!';
      }
    }).catch(function () {
      if (got) return;                  /* উত্তর এসেছিল — তাই নেটওয়ার্কের বার্তা দেখাব না */
      box.className = 'rp-msg err';
      box.innerHTML = '<i class="fa fa-circle-exclamation"></i>ইন্টারনেট সংযোগে সমস্যা হচ্ছে। সংযোগ দেখে আবার চেষ্টা করুন।';
      if (window.ccToast) window.ccToast('পাঠানো যায়নি — সংযোগ দেখুন', 'err');
    }).finally(function () { btn.disabled = false; btn.style.opacity = 1; btn.innerHTML = old; });
  });
})();
JS);

$P = [
  'title' => 'রিপোর্ট বা প্রমোশন | ' . setting('site_name', 'চাকরি সার্কুলার'),
  'desc'  => 'কোনো বিজ্ঞপ্তিতে ভুল তথ্য পেলে জানান, অথবা আপনার প্রতিষ্ঠানের নিয়োগ বিজ্ঞপ্তি আমাদের মাধ্যমে প্রকাশ করুন।',
  'canonical' => url('report'),
  'nav' => '',
];
?>
<div class="hero">
  <div class="hero-in">
    <span class="hero-ic"><i class="fa fa-flag"></i></span>
    <div>
      <h1>রিপোর্ট বা প্রমোশন</h1>
      <p>ভুল তথ্য জানান, অথবা আপনার প্রতিষ্ঠানের নিয়োগ বিজ্ঞপ্তি আমাদের মাধ্যমে প্রকাশ করুন</p>
    </div>
  </div>
  <div class="hero-chips">
    <span><i class="fa fa-shield-halved"></i> আপনার তথ্য গোপন থাকবে</span>
    <span><i class="fa fa-clock"></i> ২৪ ঘন্টার মধ্যে যোগাযোগ</span>
  </div>
</div>

<div class="rp-grid">
  <div class="rp">
    <div class="rp-tabs">
      <button type="button" class="rp-tab active" data-mode="report"><i class="fa fa-flag"></i> ভুল রিপোর্ট করুন</button>
      <button type="button" class="rp-tab" data-mode="promo"><i class="fa fa-bullhorn"></i> বিজ্ঞপ্তি প্রকাশ করুন</button>
    </div>

    <h2><i class="fa fa-pen-to-square"></i>ফর্ম</h2>
    <p class="lead" id="rpLead">নিচের ঘরগুলো পূরণ করে পাঠান। প্রয়োজনে আমরা আপনার ইমেইলে যোগাযোগ করব।</p>

    <div class="rp-promo-info" id="rpPromoInfo">
      <b>যা যা উল্লেখ করবেন</b>
      <ul>
        <li>প্রতিষ্ঠানের নাম ও পদের নাম</li>
        <li>পদ সংখ্যা ও শিক্ষাগত যোগ্যতা</li>
        <li>আবেদনের শেষ তারিখ</li>
        <li>আবেদনের লিংক অথবা বিজ্ঞপ্তির পিডিএফ লিংক</li>
      </ul>
    </div>

    <div class="rp-msg" id="rpMsg"></div>

    <form id="reportForm" data-mode="report">
      <input type="hidden" id="rp-mode" name="mode" value="report">
      <div class="fld">
        <label for="rp-title"><span id="rpTitleLabelTxt">বিষয় / পোস্টের নাম</span> <span>*</span></label>
        <div class="fwrap">
          <input type="text" id="rp-title" name="title" required maxlength="180" placeholder="কোন পোস্টে সমস্যা?">
          <i class="fa fa-heading"></i>
        </div>
      </div>
      <div class="fld">
        <label for="rp-det"><span id="rpDetLabelTxt">বিস্তারিত</span> <span>*</span></label>
        <textarea id="rp-det" name="details" required maxlength="2000" placeholder="কী ভুল আছে, বিস্তারিত লিখুন… সম্ভব হলে পোস্টের লিংকটিও দিন।"></textarea>
      </div>
      <div class="fld">
        <label for="rp-email"><span id="rpEmailLabelTxt">আপনার ইমেইল</span> <span>*</span></label>
        <div class="fwrap">
          <input type="email" id="rp-email" name="email" required placeholder="example@gmail.com">
          <i class="fa fa-envelope"></i>
        </div>
      </div>
      <div class="rp-sub">
        <button class="btn" type="submit"><i class="fa fa-paper-plane"></i> <span id="rpSubBtnTxt">রিপোর্ট পাঠান</span></button>
        <span class="hintx">ঘন্টায় সর্বোচ্চ ৫টি অনুরোধ পাঠানো যায়।</span>
      </div>
    </form>
  </div>

  <div class="rp-side">
    <div class="rp-card">
      <h3><i class="fa fa-list-check"></i>যেভাবে কাজ হয়</h3>
      <div class="rp-step"><span class="n">১</span>ফর্মটি পূরণ করে পাঠান</div>
      <div class="rp-step"><span class="n">২</span>আমরা তথ্য যাচাই করি</div>
      <div class="rp-step"><span class="n">৩</span>দ্রুত ব্যবস্থা নিয়ে আপনাকে জানাই</div>
    </div>
    <div class="rp-card">
      <h3><i class="fa fa-envelope-open-text"></i>সরাসরি মেইল</h3>
      <a class="rp-mail" href="mailto:<?= e(setting('contact_email', 'cakricircular.support@gmail.com')) ?>">
        <i class="fa fa-paper-plane"></i><?= e(setting('contact_email', 'cakricircular.support@gmail.com')) ?>
      </a>
    </div>
  </div>
</div>

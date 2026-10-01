<?php
/* ================= সেটিংস ================= */
admin_start('সেটিংস');
need('settings');

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    csrf_guard();

    $text = ['site_name','tagline','meta_title','meta_description','meta_keywords','home_h1','google_verification',
             'footer_about','contact_email','location','copyright','footer_slogan','app_name',
             'fb','twitter','telegram','whatsapp',
             'maintenance_title','maintenance_text'];
    foreach ($text as $k) if (isset($_POST[$k])) set_setting($k, trim((string)$_POST[$k]));

    /* পার পেজ */
    $pp = (int)($_POST['per_page'] ?? 20);
    set_setting('per_page', (string)(in_array($pp, [10,20,30,50,70,100], true) ? $pp : 20));

    /* নোটিশ সর্বোচ্চ কয়টি থাকবে */
    /* প্রতি কয়টি পোস্টের পর একটি বিজ্ঞাপন */
    $pg = (int)($_POST['promo_gap'] ?? 5);
    set_setting('promo_gap', (string)max(2, min(20, $pg)));

    $nl = (int)($_POST['notice_limit'] ?? 50);
    set_setting('notice_limit', (string)max(10, min(200, $nl)));
    prune_notices();

    /* লোগো বদলালে অ্যাপের আইকনও নতুন করে তৈরি */
    make_app_icons(true);

    set_setting('maintenance', isset($_POST['maintenance']) ? '1' : '0');
    set_setting('geo_lookup',  isset($_POST['geo_lookup'])  ? '1' : '0');

    /* এডমিন গোপন পথ */
    $slug = trim((string)($_POST['admin_slug'] ?? ''));
    if ($slug !== '' && preg_match('/^[a-zA-Z0-9_-]{3,30}$/', $slug)) {
        $reserved = ['api','post','category','search','trending','notices','about','privacy','report','assets','uploads','page'];
        if (in_array(strtolower($slug), $reserved, true)) flash('err', 'এই নামটি সংরক্ষিত, অন্য নাম দিন।');
        else set_setting('admin_slug', $slug);
    }

    /* ফাইল আপলোড */
    foreach (['logo' => 900, 'favicon' => 256, 'default_og' => 1200] as $k => $w) {
        if (!empty($_FILES[$k]['name'])) {
            $err = null;
            if ($f = upload_image($_FILES[$k], 'site', $w, $err)) {
                $old = setting($k); if ($old) @unlink(UPLOAD_PATH . '/site/' . $old);
                set_setting($k, $f);
            } elseif ($err) flash('err', $err);
        }
    }
    /* Google HTML ভেরিফিকেশন ফাইল */
    if (!empty($_FILES['gfile']['name']) && preg_match('/^google[a-z0-9]+\.html$/i', $_FILES['gfile']['name'])) {
        move_uploaded_file($_FILES['gfile']['tmp_name'], APP_ROOT . '/' . basename($_FILES['gfile']['name']));
    }

    if (empty($_SESSION['flash'])) flash('ok', 'সেটিংস সংরক্ষণ হয়েছে।');
    admin_go(au('settings'));
}
show_flash();
?>
<form method="post" enctype="multipart/form-data">
  <?= csrf_field() ?>

  <div class="set-nav" id="setNav">
    <button type="button" class="set-item" data-panel="p-brand">
      <span class="ic"><i class="fa fa-globe"></i></span>
      <span class="tx"><b>সাইটের পরিচয়</b><small>নাম, ট্যাগলাইন, লোগো, ফেভিকন</small></span>
      <i class="fa fa-angle-left go"></i>
    </button>
    <button type="button" class="set-item" data-panel="p-seo">
      <span class="ic b"><i class="fa fa-magnifying-glass-chart"></i></span>
      <span class="tx"><b>SEO ও মেটা</b><small>টাইটেল, ডেসক্রিপশন, ভেরিফিকেশন</small></span>
      <i class="fa fa-angle-left go"></i>
    </button>
    <button type="button" class="set-item" data-panel="p-footer">
      <span class="ic p"><i class="fa fa-shoe-prints"></i></span>
      <span class="tx"><b>ফুটার ও যোগাযোগ</b><small>ইমেইল, সোশ্যাল লিংক, স্লোগান</small></span>
      <i class="fa fa-angle-left go"></i>
    </button>
    <button type="button" class="set-item" data-panel="p-system">
      <span class="ic y"><i class="fa fa-sliders"></i></span>
      <span class="tx"><b>প্রদর্শন ও সিস্টেম</b><small>পেজ সংখ্যা, নোটিশ লিমিট, মেইনটেন্যান্স</small></span>
      <i class="fa fa-angle-left go"></i>
    </button>
  </div>

  

  <div class="set-panel a-card" id="p-brand" hidden>
    <button type="button" class="set-back"><i class="fa fa-angle-right"></i> সব সেটিংস</button>
    <h2><i class="fa fa-globe"></i>সাইটের পরিচয়</h2>
    <div class="grid g2">
      <div><label>সাইটের নাম</label><input type="text" name="site_name" value="<?= e(setting('site_name')) ?>"></div>
      <div><label>হোমপেজ H1</label><input type="text" name="home_h1" value="<?= e(setting('home_h1')) ?>"></div>
    </div>
    <div class="grid g2" style="margin-top:14px">
      <div><label>নামের নিচের ছোট লেখা (হেডারে দেখাবে)</label>
        <input type="text" name="tagline" value="<?= e(setting('tagline', 'সঠিক তথ্য, আপনার সফলতা')) ?>" placeholder="সঠিক তথ্য, আপনার সফলতা"></div>
      <div><label>অ্যাপের নাম (ইনস্টল হলে ফোনে যে নাম দেখাবে)</label>
        <input type="text" name="app_name" value="<?= e(setting('app_name', 'Cakricircular')) ?>" placeholder="Cakricircular"></div>
    </div>
    <div class="grid g3" style="margin-top:14px">
      <div>
        <label>লোগো (png / jpg / svg)</label>
        <img class="f-prev" src="<?= e(site_logo()) ?>" alt="">
        <input type="file" name="logo" accept="image/*,.svg">
      </div>
      <div>
        <label>ফেভিকন (PNG / ICO)</label>
        <img class="f-prev" src="<?= e(site_favicon()) ?>" alt="">
        <input type="file" name="favicon" accept="image/*,.svg">
      </div>
      <div>
        <label>ডিফল্ট শেয়ার ছবি (OG)</label>
        <img class="f-prev" style="width:120px" src="<?= e(default_og()) ?>" alt="">
        <input type="file" name="default_og" accept="image/*" data-maxw="1200" data-ratio="1.9048" data-kb="260">
      </div>
    </div>
  </div>

  <div class="set-panel a-card" id="p-seo" hidden>
    <button type="button" class="set-back"><i class="fa fa-angle-right"></i> সব সেটিংস</button>
    <h2><i class="fa fa-magnifying-glass-chart"></i>SEO ও মেটা</h2>
    <div><label>হোমপেজ মেটা টাইটেল</label><input type="text" name="meta_title" value="<?= e(setting('meta_title')) ?>"></div>
    <div style="margin-top:12px"><label>মেটা ডেসক্রিপশন</label>
      <textarea name="meta_description" style="min-height:80px"><?= e(setting('meta_description')) ?></textarea></div>
    <div style="margin-top:12px"><label>মেটা কিওয়ার্ড (কমা দিয়ে)</label>
      <textarea name="meta_keywords" style="min-height:70px"><?= e(setting('meta_keywords')) ?></textarea></div>
    <div class="grid g2" style="margin-top:12px">
      <div><label>Google Search Console — meta verification code</label>
        <input type="text" name="google_verification" value="<?= e(setting('google_verification')) ?>" placeholder="শুধু content="" এর ভেতরের কোডটুকু"></div>
      <div><label>অথবা Google HTML ফাইল আপলোড</label><input type="file" name="gfile" accept=".html">
        <p class="hint">googleXXXX.html ফাইলটি রুটে বসবে।</p></div>
    </div>
    <p class="hint">সাইটম্যাপ: <?= e(url('sitemap.xml')) ?> · robots: <?= e(url('robots.txt')) ?></p>
  </div>

  <div class="set-panel a-card" id="p-footer" hidden>
    <button type="button" class="set-back"><i class="fa fa-angle-right"></i> সব সেটিংস</button>
    <h2><i class="fa fa-shoe-prints"></i>ফুটার ও যোগাযোগ</h2>
    <div><label>ফুটার পরিচিতি</label><textarea name="footer_about" style="min-height:70px"><?= e(setting('footer_about')) ?></textarea></div>
    <div class="grid g3" style="margin-top:12px">
      <div><label>যোগাযোগ ইমেইল</label><input type="email" name="contact_email" value="<?= e(setting('contact_email')) ?>"></div>
      <div><label>লোকেশন</label><input type="text" name="location" value="<?= e(setting('location')) ?>"></div>
      <div><label>কপিরাইট লাইন</label><input type="text" name="copyright" value="<?= e(setting('copyright')) ?>"></div>
    </div>
    <div style="margin-top:12px"><label>কপিরাইটের নিচের স্লোগান</label>
      <input type="text" name="footer_slogan" value="<?= e(setting('footer_slogan', 'ডিজিটাল বাংলাদেশ, স্বচ্ছ বাংলাদেশ')) ?>" placeholder="ডিজিটাল বাংলাদেশ, স্বচ্ছ বাংলাদেশ">
      <p class="hint">খালি রাখলে দেখাবে না।</p></div>
    <div class="grid g4" style="margin-top:12px">
      <div><label>Facebook পেজ</label><input type="url" name="fb" value="<?= e(setting('fb')) ?>"></div>
      <div><label>Twitter / X</label><input type="url" name="twitter" value="<?= e(setting('twitter')) ?>"></div>
      <div><label>Telegram</label><input type="url" name="telegram" value="<?= e(setting('telegram')) ?>"></div>
      <div><label>WhatsApp</label><input type="url" name="whatsapp" value="<?= e(setting('whatsapp')) ?>"></div>
    </div>
    <p class="hint">লিংক দিলে আইকনসহ ফুটার ও সাইডবারে দেখাবে, খালি রাখলে দেখাবে না।</p>
  </div>

  <div class="set-panel a-card" id="p-system" hidden>
    <button type="button" class="set-back"><i class="fa fa-angle-right"></i> সব সেটিংস</button>
    <h2><i class="fa fa-sliders"></i>প্রদর্শন ও সিস্টেম</h2>
    <div class="grid g3">
      <div>
        <label>প্রতি পেজে কতটি পোস্ট</label>
        <select name="per_page">
          <?php foreach ([10,20,30,50,70,100] as $n): ?>
            <option value="<?= $n ?>" <?= (int)setting('per_page','20') === $n ? 'selected' : '' ?>><?= bn($n) ?> টি</option>
          <?php endforeach; ?>
        </select>
      </div>
      <div>
        <label>প্রতি কয়টি পোস্টের পর বিজ্ঞাপন</label>
        <input type="number" name="promo_gap" min="2" max="20" value="<?= e(setting('promo_gap', '5')) ?>">
        <p class="hint">হোম, ক্যাটাগরি ও খুঁজুন পাতায় এত সংখ্যক সাধারণ পোস্টের পর একটি প্রিমিয়াম পোস্ট দেখাবে।</p>
      </div>
      <div>
        <label>নোটিশ সর্বোচ্চ কয়টি রাখবে</label>
        <input type="number" name="notice_limit" min="10" max="200" value="<?= e(setting('notice_limit', '50')) ?>">
        <p class="hint">এর বেশি হলে পুরনো নোটিশ অটো মেয়াদ শেষ হয়ে এডমিন ও সাইট — দুই জায়গা থেকেই মুছে যাবে।</p>
      </div>
      <div>
        <label>এডমিন গোপন URL</label>
        <input type="text" name="admin_slug" value="<?= e(setting('admin_slug', DEFAULT_ADMIN_SLUG)) ?>">
        <p class="hint">এখন: <?= e(url(setting('admin_slug', DEFAULT_ADMIN_SLUG))) ?></p>
      </div>
    </div>

    <div class="a-sec" style="margin-top:20px"><i class="fa fa-toggle-on"></i>সিস্টেম নিয়ন্ত্রণ</div>
    <div class="sw-row">
      <div class="tx">
        <b>মেইনটেন্যান্স মোড</b>
        <span>চালু করলে সাধারণ ভিজিটর আপডেট স্ক্রিন দেখবে। আপনি (লগইন করা এডমিন) সাইট আগের মতই দেখবেন — তাই পরীক্ষা করতে প্রাইভেট উইন্ডো ব্যবহার করুন।</span>
      </div>
      <label class="sw"><input type="checkbox" name="maintenance" value="1" <?= setting('maintenance','0') === '1' ? 'checked' : '' ?>><i></i></label>
    </div>
    <div class="sw-row">
      <div class="tx">
        <b>ভিজিটরের লোকেশন সনাক্তকরণ</b>
        <span>অ্যানালিটিক্সে দেশ ও বিভাগ দেখতে চাইলে চালু রাখুন। হোস্টিং বাইরের সংযোগ আটকালে বন্ধ করে দিন।</span>
      </div>
      <label class="sw"><input type="checkbox" name="geo_lookup" value="1" <?= setting('geo_lookup','1') === '1' ? 'checked' : '' ?>><i></i></label>
    </div>
    <div class="grid g2" style="margin-top:12px">
      <div><label>মেইনটেন্যান্স শিরোনাম</label>
        <input type="text" name="maintenance_title" value="<?= e(setting('maintenance_title', 'সার্ভার আপডেট চলছে')) ?>"></div>
      <div><label>মেইনটেন্যান্স বার্তা</label>
        <input type="text" name="maintenance_text" value="<?= e(setting('maintenance_text')) ?>"></div>
    </div>

  </div>

  <div class="save-bar">
    <button class="btn" type="submit"><i class="fa fa-floppy-disk"></i> সেটিংস সংরক্ষণ করুন</button>
    <span class="sp"></span>
    <span class="note">যেকোনো ভাগ থেকে সেভ করলে সব সেটিংস একসাথে সংরক্ষণ হয়</span>
  </div>
</form>
<?php admin_end(); ?>

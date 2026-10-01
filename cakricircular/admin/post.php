<?php
/* ================= পোস্ট যোগ / এডিট ================= */
$id   = (int)($_GET['id'] ?? 0);
$post = $id ? one("SELECT * FROM posts WHERE id = ?", [$id]) : null;
admin_start($post ? 'পোস্ট এডিট' : 'নতুন পোস্ট');
need('posts');

$divisions = ['ঢাকা','চট্টগ্রাম','রাজশাহী','খুলনা','বরিশাল','সিলেট','রংপুর','ময়মনসিংহ','সারাদেশ'];

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    csrf_guard();

    /* ---- ডিলিট ---- */
    if (($_POST['do'] ?? '') === 'delete' && $post) {
        /* সরাসরি মুছি না — রিসাইকেল বিনে যায়, সেখান থেকে ফেরানো যাবে */
        q("UPDATE posts SET deleted_at = NOW(), status = 0 WHERE id = ?", [$id]);
        bump_ver();
        flash('ok', 'পোস্টটি রিসাইকেল বিনে পাঠানো হয়েছে — চাইলে ফিরিয়ে আনতে পারবেন।');
        admin_go(au('posts'));
    }

    $title = trim((string)($_POST['title'] ?? ''));
    if ($title === '') { flash('err', 'শিরোনাম দিন।'); admin_go(au('post' . ($id ? '?id=' . $id : ''))); }

    $data = [
        'cat_id'   => (int)($_POST['cat_id'] ?? 0) ?: null,
        'title'    => mb_substr($title, 0, 255, 'UTF-8'),
        'content'  => (function () {
            /* কিছু হোস্টিংয়ের ফায়ারওয়াল বড়/HTML-জাতীয় লেখা আটকে দেয় (connection reset),
               তাই ব্রাউজার লেখাটা base64 করে পাঠায় — এখানে খুলে নিই */
            $plain = (string)($_POST['content'] ?? '');
            if (!empty($_POST['content_b64'])) {
                $raw = base64_decode((string)$_POST['content_b64'], true);
                /* ডিকোড করা লেখা খালি হলে মূল ঘরের লেখাই রাখি — যেন কিছু হারিয়ে না যায় */
                if ($raw !== false && trim($raw) !== '') return $raw;
            }
            return $plain;
        })(),
        'division' => trim((string)($_POST['division'] ?? '')),
        'district' => trim((string)($_POST['district'] ?? '')),
        'vacancy'  => trim((string)($_POST['vacancy'] ?? '')),
        'salary'   => trim((string)($_POST['salary'] ?? '')),
        'is_premium'    => !empty($_POST['is_premium']) ? 1 : 0,
        'premium_until' => trim((string)($_POST['premium_until'] ?? '')) ?: null,
        'company'  => trim((string)($_POST['company'] ?? '')),
        'employment_type' => (string)($_POST['employment_type'] ?? 'FULL_TIME'),
        'deadline' => ($_POST['deadline'] ?? '') !== '' ? $_POST['deadline'] : null,
        'is_job'   => isset($_POST['is_job']) ? 1 : 0,
        'keywords' => trim((string)($_POST['keywords'] ?? '')),
        'meta_title' => trim((string)($_POST['meta_title'] ?? '')),
        'meta_desc'  => trim((string)($_POST['meta_desc'] ?? '')),
        'status'   => isset($_POST['status']) ? 1 : 0,
    ];

    if ($post) {
        $slug    = $post['slug'];
        $wanted  = trim((string)($_POST['slug'] ?? ''));
        if ($wanted === '') {
            /* ঘর খালি রাখলে ক্যাটাগরি অনুযায়ী ছোট স্লাগ (chakri01) */
            $slug = next_cat_slug((int)$data['cat_id'], $title);
        } elseif ($wanted !== $post['slug']) {
            $slug = unique_slug($wanted, 'posts', $id);
        }
        /* অটো-পোস্ট রিভিউ শেষে প্রকাশ হলে — এখনকার সময়ে তালিকায় উঠে আসবে */
        if (!empty($post['review_pending']) && $data['status'] == 1) {
            try { q("UPDATE posts SET review_pending = 0, published_at = NOW() WHERE id = ?", [$id]); } catch (Throwable $e) {}
        }

        /* স্লাগ বদলালে পুরনো ঠিকানা যেন ৪০৪ না দেয় — রিডাইরেক্টে রেখে দিই */
        if ($slug !== $post['slug']) {
            try { q("INSERT IGNORE INTO slug_redirects (old_slug, post_id, created_at) VALUES (?,?,NOW())",
                    [$post['slug'], $id]); } catch (Throwable $e) {}
        }
        q("UPDATE posts SET cat_id=?, title=?, slug=?, content=?, division=?, district=?, vacancy=?, salary=?, company=?,
             employment_type=?, deadline=?, is_job=?, is_premium=?, premium_until=?, keywords=?, meta_title=?, meta_desc=?, status=?, updated_at=NOW()
           WHERE id=?",
          [$data['cat_id'], $data['title'], $slug, $data['content'], $data['division'], $data['district'],
           $data['vacancy'], $data['salary'], $data['company'], $data['employment_type'], $data['deadline'], $data['is_job'],
           $data['is_premium'], $data['premium_until'],
           $data['keywords'], $data['meta_title'], $data['meta_desc'], $data['status'], $id]);
    } else {
        $wanted = trim((string)($_POST['slug'] ?? ''));
        $slug   = $wanted !== '' ? unique_slug($wanted, 'posts') : next_cat_slug((int)$data['cat_id'], $title);
        q("INSERT INTO posts (cat_id,title,slug,content,division,district,vacancy,salary,company,employment_type,deadline,
             is_job,is_premium,premium_until,keywords,meta_title,meta_desc,status,published_at,updated_at,created_by)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW(),NOW(),?)",
          [$data['cat_id'], $data['title'], $slug, $data['content'], $data['division'], $data['district'],
           $data['vacancy'], $data['salary'], $data['company'], $data['employment_type'], $data['deadline'], $data['is_job'],
           $data['is_premium'], $data['premium_until'],
           $data['keywords'], $data['meta_title'], $data['meta_desc'], $data['status'], admin_user()['id']]);
        $id = (int)db()->lastInsertId();
    }

    /* থাম্বনেইল */
    /* থাম্বনেইল / পিডিএফ মুছে ফেলার অনুরোধ */
    if (!empty($_POST['del_thumb'])) {
        $old = col("SELECT thumb FROM posts WHERE id = ?", [$id]);
        if ($old) @unlink(UPLOAD_PATH . '/posts/' . $old);
        q("UPDATE posts SET thumb = NULL WHERE id = ?", [$id]);
    }
    if (!empty($_POST['del_pdf'])) {
        $old = col("SELECT pdf FROM posts WHERE id = ?", [$id]);
        if ($old) @unlink(UPLOAD_PATH . '/pdf/' . $old);
        q("UPDATE posts SET pdf = NULL WHERE id = ?", [$id]);
    }

    if (!empty($_FILES['thumb']['name'])) {
        $err = null;
        if ($f = upload_image($_FILES['thumb'], 'posts', 900, $err, 1.0, 140)) {
            $old = col("SELECT thumb FROM posts WHERE id = ?", [$id]);
            if ($old) @unlink(UPLOAD_PATH . '/posts/' . $old);
            q("UPDATE posts SET thumb = ? WHERE id = ?", [$f, $id]);
        } elseif ($err) flash('err', $err);
    }
    /* পিডিএফ */
    if (!empty($_FILES['pdf']['name'])) {
        $err = null;
        if ($f = upload_pdf($_FILES['pdf'], $err)) {
            $old = col("SELECT pdf FROM posts WHERE id = ?", [$id]);
            if ($old) @unlink(UPLOAD_PATH . '/pdf/' . $old);
            q("UPDATE posts SET pdf = ? WHERE id = ?", [$f, $id]);
        } elseif ($err) flash('err', $err);
    }
    /* গ্যালারি (সর্বোচ্চ ৫) */
    $have = (int)col("SELECT COUNT(*) FROM post_images WHERE post_id = ?", [$id]);
    if (!empty($_FILES['gallery']['name'][0])) {
        foreach ($_FILES['gallery']['name'] as $i => $nm) {
            if ($have >= 5 || $nm === '') break;
            $one = ['name' => $nm, 'type' => $_FILES['gallery']['type'][$i], 'tmp_name' => $_FILES['gallery']['tmp_name'][$i],
                    'error' => $_FILES['gallery']['error'][$i], 'size' => $_FILES['gallery']['size'][$i]];
            $err = null;
            if ($f = upload_image($one, 'posts', 1600, $err)) {
                q("INSERT INTO post_images (post_id, image, sort_order) VALUES (?,?,?)", [$id, $f, $have]);
                $have++;
            } elseif ($err) flash('err', $err);
        }
    }
    /* ছবি ডিলিট */
    foreach ((array)($_POST['del_img'] ?? []) as $imgId) {
        $im = one("SELECT * FROM post_images WHERE id = ? AND post_id = ?", [(int)$imgId, $id]);
        if ($im) { @unlink(UPLOAD_PATH . '/posts/' . $im['image']); q("DELETE FROM post_images WHERE id = ?", [$im['id']]); }
    }
    /* লিংক */
    q("DELETE FROM post_links WHERE post_id = ?", [$id]);
    foreach ((array)($_POST['link_url'] ?? []) as $i => $u) {
        $u    = trim((string)$u);
        $type = (string)($_POST['link_type'][$i] ?? 'url');
        if ($u === '') continue;

        /* ইমেইল / ফোন / হোয়াটসঅ্যাপ — সঠিক ফরম্যাটে রূপান্তর */
        if ($type === 'email') {
            $mail = preg_replace('/^mailto:/i', '', $u);
            if (!filter_var($mail, FILTER_VALIDATE_EMAIL)) continue;
            $u = 'mailto:' . $mail;
        } elseif ($type === 'phone') {
            $num = preg_replace('/[^0-9+]/', '', $u);
            if (strlen($num) < 6) continue;
            $u = 'tel:' . $num;
        } elseif ($type === 'whatsapp') {
            $num = preg_replace('/[^0-9]/', '', $u);
            if ($num === '') continue;
            if (strpos($num, '880') !== 0) $num = '880' . ltrim($num, '0');   /* বাংলাদেশের কোড */
            $u = 'https://wa.me/' . $num;
        } else {
            if (!preg_match('~^https?://~i', $u)) $u = 'https://' . $u;
            if (!filter_var($u, FILTER_VALIDATE_URL)) continue;
        }
        q("INSERT INTO post_links (post_id, label, url, is_apply, sort_order) VALUES (?,?,?,?,?)",
          [$id, trim((string)($_POST['link_label'][$i] ?? '')), $u, !empty($_POST['link_apply'][$i]) ? 1 : 0, $i]);
    }

    if (empty($_SESSION['flash'])) flash('ok', 'সংরক্ষণ হয়েছে।');
    admin_go(au('post?id=' . $id));
}

$images = $id ? all("SELECT * FROM post_images WHERE post_id = ? ORDER BY sort_order", [$id]) : [];
$links  = $id ? all("SELECT * FROM post_links WHERE post_id = ? ORDER BY sort_order", [$id]) : [];
show_flash();
?>
<form method="post" enctype="multipart/form-data">
  <?= csrf_field() ?>

  <?php if (!empty($post['review_pending'])): ?>
  <div class="review-banner">
    <b><i class="fa fa-robot" style="margin-left:0;margin-right:6px"></i>AI দিয়ে তৈরি — রিভিউর অপেক্ষায়</b><br>
    তথ্যগুলো (তারিখ, পদ সংখ্যা, লিংক) মূল বিজ্ঞপ্তির সাথে মিলিয়ে নিন। ঠিক থাকলে নিচে <b>"প্রকাশ করুন"</b> টিক দিয়ে সেভ করুন।
    <?php if (!empty($post['source_url'])): ?>
      <div style="margin-top:6px;font-size:.8rem">উৎস: <a href="<?= e($post['source_url']) ?>" target="_blank" rel="noopener" data-no-spa><?= e(parse_url($post['source_url'], PHP_URL_HOST)) ?> <i class="fa fa-arrow-up-right-from-square"></i></a></div>
    <?php endif; ?>
    <?php if (!empty($post['auto_note'])): ?>
      <div class="note">⚠️ <?= e($post['auto_note']) ?></div>
    <?php endif; ?>
  </div>
<?php endif; ?>
<?php
  /* এডিটরে স্লাগের ঘর নিজে থেকে ভরে দেওয়ার জন্য — কোন ক্যাটাগরিতে পরের নম্বর কত */
  $nextSlugs = [];
  foreach ($cats as $c) { $nextSlugs[(int)$c['id']] = next_cat_slug((int)$c['id']); }
  $trans = bn_translit_tables();
?>
<div class="a-card">
    <h2><i class="fa fa-pen-to-square"></i>মূল তথ্য</h2>
    <div style="margin-bottom:10px">
      <label>শিরোনাম *</label>
      <input type="text" name="title" required value="<?= e($post['title'] ?? '') ?>" placeholder="যেমন: প্রাথমিক বিদ্যালয়ে সহকারী শিক্ষক নিয়োগ বিজ্ঞপ্তি ২০২৬">
    </div>
    <div class="grid auto" style="margin-bottom:10px">
      <div>
        <label>ক্যাটাগরি</label>
        <select name="cat_id">
          <option value="0">— বাছাই করুন —</option>
          <?php foreach (categories() as $c): ?>
            <?php $isJobCat = in_array($c['slug'], ['chakri', 'job', 'chakri-circular', 'chakrir-khobor'], true) ? 1 : 0; ?>
            <option value="<?= (int)$c['id'] ?>" data-job="<?= $isJobCat ?>" <?= (int)($post['cat_id'] ?? 0) === (int)$c['id'] ? 'selected' : '' ?>><?= e($c['name']) ?></option>
          <?php endforeach; ?>
        </select>
      </div>
      <div>
        <label>আবেদনের শেষ তারিখ</label>
        <input type="date" name="deadline" value="<?= e($post['deadline'] ?? '') ?>">
      </div>
      <div>
        <label>ক্লিন URL (খালি রাখলে অটো)</label>
        <input type="text" name="slug" id="slugBox" value="<?= e($post['slug'] ?? '') ?>"
               placeholder="chakri01" data-auto="<?= empty($post) ? '1' : '0' ?>">
      </div>
      <div class="jobonly">
        <label>বেতন <span style="font-weight:500;color:var(--muted)">(শুধু চাকরির জন্য)</span></label>
        <input type="text" name="salary" value="<?= e($post['salary'] ?? '') ?>" placeholder="আলোচনা সাপেক্ষে">
      </div>
    </div>
    <div class="grid auto">
      <div>
        <label>বিভাগ</label>
        <select name="division">
          <option value="">—</option>
          <?php foreach ($divisions as $d): ?>
            <option value="<?= e($d) ?>" <?= ($post['division'] ?? '') === $d ? 'selected' : '' ?>><?= e($d) ?></option>
          <?php endforeach; ?>
        </select>
      </div>
      <div><label>জেলা</label><input type="text" name="district" value="<?= e($post['district'] ?? '') ?>" placeholder="যেমন: কুমিল্লা"></div>
      <div><label>পদ সংখ্যা</label><input type="text" name="vacancy" value="<?= e($post['vacancy'] ?? '') ?>" placeholder="যেমন: 120"></div>
      <div><label>প্রতিষ্ঠানের নাম</label><input type="text" name="company" value="<?= e($post['company'] ?? '') ?>"></div>
    </div>
  </div>

  <div class="a-card">
    <h2><i class="fa fa-align-right"></i>বিস্তারিত</h2>
    <div class="ed-tools" id="edTools">
      <button type="button" data-ed="bold" title="মোটা"><i class="fa fa-bold"></i></button>
      <button type="button" data-ed="italic" title="তির্যক"><i class="fa fa-italic"></i></button>
      <button type="button" data-ed="under" title="আন্ডারলাইন"><i class="fa fa-underline"></i></button>
      <span class="sep"></span>
      <button type="button" data-ed="h" title="হেডিং"><i class="fa fa-heading"></i></button>
      <button type="button" data-ed="list" title="বুলেট তালিকা"><i class="fa fa-list-ul"></i></button>
      <button type="button" data-ed="hr" title="লাইন টানুন"><i class="fa fa-minus"></i></button>
      <span class="sep"></span>
      <label class="clr" title="লেখার রঙ"><i class="fa fa-palette"></i><input type="color" id="edColor" value="#0f766e"></label>
      <label class="clr bgc" title="হাইলাইট"><i class="fa fa-highlighter"></i><input type="color" id="edBg" value="#fff3cd"></label>
      <button type="button" data-ed="big" title="বড় লেখা"><i class="fa fa-a" style="font-size:1.05em"></i></button>
      <button type="button" data-ed="small" title="ছোট লেখা"><i class="fa fa-a" style="font-size:.78em"></i></button>
      <span class="sep"></span>
      <button type="button" data-ed="link" title="লিংক"><i class="fa fa-link"></i></button>
      <button type="button" data-ed="btn" title="বাটন"><i class="fa fa-square-plus"></i></button>
      <button type="button" data-ed="box" title="বক্স / কার্ড"><i class="fa fa-table-cells-large"></i></button>
      <button type="button" data-ed="tel" title="ফোন বাটন"><i class="fa fa-phone"></i></button>
      <button type="button" data-ed="wa" title="হোয়াটসঅ্যাপ বাটন"><i class="fa-brands fa-whatsapp"></i></button>
      <button type="button" data-ed="mail" title="ইমেইল বাটন"><i class="fa fa-envelope"></i></button>
      <span class="sep"></span>
      <button type="button" data-ed="clear" title="ট্যাগ সরান"><i class="fa fa-eraser"></i></button>
      <span class="sep"></span>
      <button type="button" data-ed="undo" title="আগেরটা ফিরিয়ে আনুন"><i class="fa fa-rotate-left"></i></button>
      <button type="button" data-ed="redo" title="আবার করুন"><i class="fa fa-rotate-right"></i></button>
      <span class="sep"></span>
      <button type="button" id="edPreview" class="prev" title="প্রিভিউ দেখুন"><i class="fa fa-eye"></i></button>
    </div>
    <textarea name="content" id="edArea" style="min-height:280px" placeholder="সাধারণ বাংলায় লিখুন — অটো সুন্দর করে সাজানো হবে।&#10;শিরোনামের শেষে কোলন (:) দিলে সেটি হেডিং হবে।&#10;লাইনের শুরুতে - দিলে বুলেট লিস্ট হবে।"><?= e($post['content'] ?? '') ?></textarea>
    <p class="hint">সাধারণ লেখা দিলে অটো সাজানো হয়। চাইলে সরাসরি <b>HTML</b> ট্যাগ (&lt;p&gt;, &lt;table&gt;, &lt;img&gt;, &lt;iframe&gt; …) আর
      <b>&lt;style&gt;</b> দিয়ে CSS লিখতে পারেন — CSS শুধু এই পোস্টের ভেতরেই কাজ করবে, সাইটের বাকি ডিজাইন নষ্ট হবে না।
      নিরাপত্তার জন্য &lt;script&gt; কাজ করবে না।</p>
  </div>

  <div class="a-card">
    <h2><i class="fa fa-image"></i>ছবি ও পিডিএফ</h2>
    <div class="grid auto">
      <div>
        <label>থাম্বনেইল (লিস্টে দেখাবে)</label>
        <?php if (!empty($post['thumb'])): ?>
          <div class="med">
            <img src="<?= e(img_url($post['thumb'])) ?>" alt="">
            <label class="med-x"><input type="checkbox" name="del_thumb" value="1"><i class="fa fa-trash"></i> মুছুন</label>
          </div>
        <?php endif; ?>
        <input type="file" name="thumb" accept="image/*" data-maxw="900" data-ratio="1" data-kb="140">
      </div>
      <div>
        <label>পিডিএফ (মূল বিজ্ঞপ্তি)</label>
        <?php if (!empty($post['pdf'])): ?>
          <div class="med pdf">
            <a href="<?= e(UPLOAD_URL . '/pdf/' . $post['pdf']) ?>" target="_blank" data-no-spa>
              <i class="fa fa-file-pdf"></i> বর্তমান ফাইল দেখুন</a>
            <label class="med-x"><input type="checkbox" name="del_pdf" value="1"><i class="fa fa-trash"></i> মুছুন</label>
          </div>
        <?php endif; ?>
        <input type="file" name="pdf" accept="application/pdf">
      </div>
    </div>
    <p class="hint">ছবি অটো কম্প্রেস হয়: ১এমবি→১০০কেবি, ২এমবি→২০০কেবি … ৫এমবি→৪৫০কেবি</p>

    <div style="margin-top:10px">
      <label>ব্যানার টাইপ ছবি (সর্বোচ্চ ৫টি) — বাকি <?= bn(5 - count($images)) ?> টি</label>
      <input type="file" name="gallery[]" accept="image/*" data-maxw="1600" data-kb="280" multiple>
      <?php if ($images): ?>
        <div class="grid auto" style="margin-top:11px">
          <?php foreach ($images as $im): ?>
            <div class="med">
              <img src="<?= e(img_url($im['image'])) ?>" style="aspect-ratio:856/292" alt="">
              <label class="med-x"><input type="checkbox" name="del_img[]" value="<?= (int)$im['id'] ?>"><i class="fa fa-trash"></i> মুছুন</label>
            </div>
          <?php endforeach; ?>
        </div>
      <?php endif; ?>
    </div>
  </div>

  <div class="a-card">
    <h2><i class="fa fa-link"></i>লিংক ও আবেদন বাটন</h2>
    <div id="linkRows">
      <?php $ls = $links ?: [['label' => '', 'url' => '', 'is_apply' => 0]]; foreach ($ls as $li0 => $l): ?>
        <?php
          $lu = (string)$l['url']; $lt = 'url'; $lv = $lu;
          if (stripos($lu, 'mailto:') === 0)      { $lt = 'email';    $lv = substr($lu, 7); }
          elseif (stripos($lu, 'tel:') === 0)     { $lt = 'phone';    $lv = substr($lu, 4); }
          elseif (stripos($lu, 'wa.me/') !== false) { $lt = 'whatsapp'; $lv = preg_replace('~^.*wa\.me/~i', '', $lu); }
        ?>
        <div class="lnk-row" style="margin-bottom:10px">
          <div class="grid auto" style="align-items:end">
            <div><label>ধরন</label>
              <div class="seg">
                <input type="hidden" name="link_type[]" class="lnk-type" value="<?= e($lt) ?>">
                <button type="button" class="<?= $lt === 'url' ? 'on' : '' ?>" data-v="url" title="লিংক"><i class="fa fa-link"></i></button>
                <button type="button" class="<?= $lt === 'email' ? 'on' : '' ?>" data-v="email" title="ইমেইল"><i class="fa fa-envelope"></i></button>
                <button type="button" class="<?= $lt === 'phone' ? 'on' : '' ?>" data-v="phone" title="ফোন"><i class="fa fa-phone"></i></button>
                <button type="button" class="<?= $lt === 'whatsapp' ? 'on' : '' ?>" data-v="whatsapp" title="হোয়াটসঅ্যাপ"><i class="fa-brands fa-whatsapp"></i></button>
              </div>
            </div>
            <div><label>লেবেল</label><input type="text" name="link_label[]" value="<?= e($l['label']) ?>" placeholder="যেমন: অনলাইনে আবেদন"></div>
            <div><label class="lnk-vl">ঠিকানা</label>
              <input type="text" name="link_url[]" class="lnk-val" value="<?= e($lv) ?>" placeholder="https://..."></div>
          </div>
          <label style="display:flex;gap:7px;align-items:center;font-weight:500;margin-top:8px;font-size:.86rem">
            <input type="checkbox" class="chk" name="link_apply[<?= (int)$li0 ?>]" value="1" <?= $l['is_apply'] ? 'checked' : '' ?>> আবেদন বাটন হিসেবে দেখান</label>
        </div>
      <?php endforeach; ?>
    </div>
    <button type="button" class="btn sm sec" onclick="addLink()"><i class="fa fa-plus"></i> আরেকটি লিংক</button>
    <p class="hint">ধরন বেছে নিয়ে শুধু ইমেইল বা নম্বরটা লিখলেই হবে — পোস্টে নিজে থেকেই আইকনসহ দেখাবে।
      হোয়াটসঅ্যাপে <b>01XXXXXXXXX</b> লিখলে অটো <b>+880</b> যোগ হয়ে যাবে। আবেদন বাটন না দিলে লিংকগুলো “ওপেন” আকারে দেখাবে।</p>
  </div>

  <div class="a-card">
    <h2><i class="fa fa-magnifying-glass-chart"></i>SEO</h2>
    <div class="grid auto">
      <div><label>মেটা টাইটেল</label><input type="text" name="meta_title" value="<?= e($post['meta_title'] ?? '') ?>" placeholder="খালি রাখলে শিরোনাম + সাইট নাম"></div>
      <div><label>কিওয়ার্ড (কমা দিয়ে)</label><input type="text" name="keywords" value="<?= e($post['keywords'] ?? '') ?>"></div>
    </div>
    <div style="margin-top:10px"><label>মেটা ডেসক্রিপশন</label>
      <textarea name="meta_desc" style="min-height:80px" maxlength="300"><?= e($post['meta_desc'] ?? '') ?></textarea></div>
    <div class="grid auto" style="margin-top:10px">
      <label style="display:flex;gap:8px;align-items:center;font-weight:500">
        <input type="checkbox" class="chk" name="is_job" id="isJob" value="1" <?= !empty($post['is_job']) ? 'checked' : '' ?>> JobPosting স্কিমা যোগ করুন
        <span class="hint jobwarn" style="margin:0 6px">— শুধু নিয়োগ বিজ্ঞপ্তিতে</span></label>
      <div>
        <label>চাকরির ধরন</label>
        <select name="employment_type">
          <?php foreach (['FULL_TIME' => 'ফুল টাইম', 'PART_TIME' => 'পার্ট টাইম', 'CONTRACTOR' => 'চুক্তিভিত্তিক', 'TEMPORARY' => 'অস্থায়ী'] as $k => $v): ?>
            <option value="<?= $k ?>" <?= ($post['employment_type'] ?? '') === $k ? 'selected' : '' ?>><?= e($v) ?></option>
          <?php endforeach; ?>
        </select>
      </div>
      <label style="display:flex;gap:8px;align-items:center;font-weight:500">
        <input type="checkbox" class="chk" name="status" value="1" <?= (!$post || $post['status']) ? 'checked' : '' ?>> প্রকাশ করুন</label>
    </div>
  </div>

  <div class="a-card prem-card">
    <h2><i class="fa fa-crown"></i>প্রিমিয়াম (বিজ্ঞাপন)</h2>
    <div class="sw-row" style="padding-top:0">
      <div class="tx">
        <b>👑 প্রিমিয়াম পোস্ট</b>
        <span>চালু করলে পোস্টটি তালিকার উপরে পিন হবে, সোনালি বর্ডার ও প্রিমিয়াম ব্যাজ দেখাবে,
          আর “বিজ্ঞাপন” পাতাতেও যুক্ত হবে। যেকোনো ক্যাটাগরিতে চলবে।</span>
      </div>
      <label class="sw"><input type="checkbox" name="is_premium" id="isPrem" value="1" <?= !empty($post['is_premium']) ? 'checked' : '' ?>><i></i></label>
    </div>
    <div class="grid auto premonly" style="margin-top:10px">
      <div>
        <label>কত তারিখ পর্যন্ত</label>
        <input type="date" name="premium_until" value="<?= e($post['premium_until'] ?? '') ?>">
        <p class="hint">এই তারিখের পর নিজে থেকেই সাধারণ পোস্ট হয়ে যাবে (মুছবে না)। খালি রাখলে বন্ধ না করা পর্যন্ত চলবে।</p>
      </div>
      <?php if (!empty($post['is_premium'])): $left = $post['premium_until'] ? (int)floor((strtotime($post['premium_until']) - strtotime(date('Y-m-d'))) / 86400) : null; ?>
      <div>
        <label>অবস্থা</label>
        <div style="padding:9px 0">
          <?php if ($left === null): ?>
            <span class="pill on">চলছে — মেয়াদ নেই</span>
          <?php elseif ($left >= 0): ?>
            <span class="pill on">চলছে — আর <?= bn($left) ?> দিন</span>
          <?php else: ?>
            <span class="pill off">মেয়াদ শেষ</span>
          <?php endif; ?>
          <span class="pill mut" style="margin-right:6px"><i class="fa fa-eye" style="margin-left:0;margin-right:5px"></i><?= bn($post['views'] ?? 0) ?> ভিউ</span>
        </div>
      </div>
      <?php endif; ?>
    </div>
  </div>

  <div class="save-bar">
    <button class="btn" type="submit"><i class="fa fa-floppy-disk"></i> সংরক্ষণ করুন</button>
    <?php if ($post): ?>
      <a class="btn sec" href="<?= e(url('post/' . $post['slug'])) ?>" target="_blank"><i class="fa fa-eye"></i> দেখুন</a>
      <button class="btn dan" type="submit" name="do" value="delete" data-confirm="এই পোস্টটি স্থায়ীভাবে মুছে ফেলবেন?"><i class="fa fa-trash"></i> মুছুন</button>
    <?php endif; ?>
  </div>
</form>

<script>
window.__ccCsrf = <?= json_encode(csrf_token()) ?>;
/* লেখা base64 করে পাঠাই — হোস্টিংয়ের ফায়ারওয়াল যেন সেভ আটকে না দেয়।
   একবারই যুক্ত হয়, নইলে দ্বিতীয়বার চলে গিয়ে খালি লেখা পাঠিয়ে দিত */
if (!window.__ccB64Bound) {
  window.__ccB64Bound = 1;
  document.addEventListener('submit', function (e) {
    var f = e.target;
    if (!f || !f.querySelector) return;
    var ta = f.querySelector('textarea[name="content"]');
    if (!ta) return;

    var hid = f.querySelector('input[name="content_b64"]');
    /* এই সাবমিটে আগেই এনকোড হয়ে গেছে — আর কিছু করার নেই */
    if (hid && hid.value && ta.value === '') return;

    var text = ta.value;
    if (text === '') return;                      /* খালি হলে কিছুই বদলাই না */
    try {
      var bytes = new TextEncoder().encode(text), bin = '';
      for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      if (!hid) { hid = document.createElement('input'); hid.type = 'hidden'; hid.name = 'content_b64'; f.appendChild(hid); }
      hid.value = btoa(bin);
      ta.value = '';                              /* মূল ঘরটি খালি পাঠাই */
    } catch (err) { /* না পারলে আগের মতোই মূল লেখাই যাবে */ }
  });
}

var li = <?= count($links ?: [1]) ?>;
function addLink(){
  var d=document.createElement('div');
  d.className='lnk-row'; d.style.marginBottom='10px';
  d.innerHTML='<div class="grid auto" style="align-items:end">'+
    '<div><label>ধরন</label><select name="link_type[]" class="lnk-type">'+
      '<option value="url">🔗 লিংক</option><option value="email">✉ ইমেইল</option>'+
      '<option value="phone">📞 ফোন</option><option value="whatsapp">💬 হোয়াটসঅ্যাপ</option></select></div>'+
    '<div><label>লেবেল</label><input type="text" name="link_label[]"></div>'+
    '<div><label class="lnk-vl">ঠিকানা</label><input type="text" name="link_url[]" class="lnk-val" placeholder="https://..."></div>'+
    '</div>'+
    '<label style="display:flex;gap:7px;align-items:center;font-weight:500;margin-top:8px;font-size:.86rem">'+
      '<input type="checkbox" class="chk" name="link_apply['+li+']" value="1"> আবেদন বাটন হিসেবে দেখান</label>';
  document.getElementById('linkRows').appendChild(d); li++;
}

/* ধরন বাছাই ও এডিটরের টুলস (একবারই যুক্ত হবে) */
if (!window.__ccLnkBound) {
  window.__ccLnkBound = 1;

  function lnkSet(row, v) {
    var hid = row.querySelector('.lnk-type'), inp = row.querySelector('.lnk-val'), lb = row.querySelector('.lnk-vl');
    hid.value = v;
    row.querySelectorAll('.seg button').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-v') === v); });
    if (v === 'email')        { inp.placeholder = 'example@gmail.com'; lb.textContent = 'ইমেইল ঠিকানা'; }
    else if (v === 'phone')   { inp.placeholder = '01XXXXXXXXX';       lb.textContent = 'ফোন নম্বর'; }
    else if (v === 'whatsapp'){ inp.placeholder = '01XXXXXXXXX';       lb.textContent = 'হোয়াটসঅ্যাপ নম্বর'; }
    else                      { inp.placeholder = 'https://...';       lb.textContent = 'ঠিকানা'; }
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('.seg button');
    if (!b) return;
    e.preventDefault();
    lnkSet(b.closest('.lnk-row'), b.getAttribute('data-v'));
  });

  /* ---------- বিস্তারিত লেখার টুলবার ---------- */
  function wrap(before, after) {
    var ta = document.getElementById('edArea');
    if (!ta) return;
    var s0 = ta.selectionStart, s1 = ta.selectionEnd;
    var sel = ta.value.substring(s0, s1);
    ta.value = ta.value.substring(0, s0) + before + sel + after + ta.value.substring(s1);
    ta.focus();
    ta.selectionStart = s0 + before.length;
    ta.selectionEnd   = s0 + before.length + sel.length;
  }
  function selText() {
    var ta = document.getElementById('edArea');
    return ta ? ta.value.substring(ta.selectionStart, ta.selectionEnd) : '';
  }

  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-ed]');
    if (!b) return;
    e.preventDefault();
    var k = b.getAttribute('data-ed'), t = selText();

    if (k === 'bold')   wrap('<b>', '</b>');
    if (k === 'italic') wrap('<i>', '</i>');
    if (k === 'under')  wrap('<u>', '</u>');
    if (k === 'big')    wrap('<span style="font-size:18px;font-weight:600">', '</span>');
    if (k === 'small')  wrap('<span style="font-size:12.5px;color:#7b8e8a">', '</span>');
    if (k === 'h')      wrap('\n<div style="font-size:16px;font-weight:700;color:#20272b;border-right:3px solid #0f766e;padding-right:10px;margin:14px 0 8px">', '</div>\n');
    if (k === 'list')   wrap('\n<div style="font-size:14px;line-height:1.95"><i class="fa fa-circle-check" style="color:#0f766e;margin-left:0;margin-right:7px"></i>', '<br>\n<i class="fa fa-circle-check" style="color:#0f766e;margin-left:0;margin-right:7px"></i>আরেকটি লাইন</div>\n');
    if (k === 'hr')     wrap('\n<hr style="border:0;border-top:1px solid #e7eeec;margin:14px 0">\n', '');
    if (k === 'box')    wrap('\n<div style="background:#f7faf9;border:1px solid #e7eeec;border-radius:14px;padding:14px;margin-bottom:11px">\n', '\n</div>\n');
    if (k === 'clear') {
      var ta = document.getElementById('edArea');
      var s0 = ta.selectionStart, s1 = ta.selectionEnd;
      var clean = ta.value.substring(s0, s1).replace(/<[^>]*>/g, '');
      ta.value = ta.value.substring(0, s0) + clean + ta.value.substring(s1);
      ta.focus();
    }
    if (k === 'link') {
      var u = prompt('লিংকের ঠিকানা দিন:', 'https://');
      if (!u) return;
      u = u.trim();
      if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
      /* দেখাবে https:// ছাড়া — যেমন domain.com/page */
      var shown = u.replace(/^https?:\/\//i, '').replace(/\/$/, '');
      wrap('<a href="' + u + '" target="_blank" rel="noopener"><i class="fa fa-link" style="margin-left:0;margin-right:5px"></i>',
           (t ? '' : shown) + '</a>');
    }
    if (k === 'mail') {
      var em = prompt('ইমেইল ঠিকানা দিন:', '');
      if (!em) return;
      em = em.trim().replace(/^mailto:/i, '');
      wrap('\n<a href="mailto:' + em + '" style="display:inline-flex;align-items:center;gap:7px;text-decoration:none;background:#d6533f;color:#fff;border-radius:999px;padding:7px 15px;font-size:13px;font-weight:600;margin:4px 6px 4px 0"><i class="fa fa-envelope"></i> ',
           (t ? '' : em) + '</a>\n');
    }
    if (k === 'undo' || k === 'redo') {
      var ta2 = document.getElementById('edArea');
      if (!ta2) return;
      ta2.focus();
      try { document.execCommand(k === 'undo' ? 'undo' : 'redo'); } catch (er) {}
    }
    if (k === 'btn') {
      var u2 = prompt('বাটনের লিংক দিন:', 'https://');
      if (!u2) return;
      wrap('\n<a href="' + u2 + '" style="display:inline-flex;align-items:center;gap:7px;text-decoration:none;background:#0f766e;color:#fff;border-radius:999px;padding:7px 15px;font-size:13px;font-weight:600;margin:4px 6px 4px 0"><i class="fa fa-paper-plane"></i> ',
           (t ? '' : 'আবেদন করুন') + '</a>\n');
    }
    if (k === 'tel') {
      var n = prompt('ফোন নম্বর দিন:', '01');
      if (!n) return;
      wrap('\n<a href="tel:' + n.replace(/[^0-9+]/g, '') + '" style="display:inline-flex;align-items:center;gap:7px;text-decoration:none;background:#0f766e;color:#fff;border-radius:999px;padding:7px 15px;font-size:13px;font-weight:600;margin:4px 6px 4px 0"><i class="fa fa-phone"></i> ',
           (t ? '' : 'কল করুন') + '</a>\n');
    }
    if (k === 'wa') {
      var w = prompt('হোয়াটসঅ্যাপ নম্বর দিন:', '01');
      if (!w) return;
      var num = w.replace(/[^0-9]/g, '');
      if (num.indexOf('880') !== 0) num = '880' + num.replace(/^0+/, '');
      wrap('\n<a href="https://wa.me/' + num + '" style="display:inline-flex;align-items:center;gap:7px;text-decoration:none;background:#25d366;color:#fff;border-radius:999px;padding:7px 15px;font-size:13px;font-weight:600;margin:4px 6px 4px 0"><i class="fa-brands fa-whatsapp"></i> ',
           (t ? '' : 'হোয়াটসঅ্যাপ') + '</a>\n');
    }
  });

  /* ---------- ক্যাটাগরি চাকরি হলেই বেতন ও JobPosting ---------- */
  function ccJobSync(userChanged) {
    var sel = document.querySelector('select[name="cat_id"]');
    if (!sel) return;
    var op = sel.options[sel.selectedIndex];
    var isJob = op && op.getAttribute('data-job') === '1';

    document.querySelectorAll('.jobonly').forEach(function (el) { el.style.display = isJob ? '' : 'none'; });

    var chk = document.getElementById('isJob');
    if (chk) {
      var wrap = chk.closest('label');
      if (wrap) wrap.style.display = isJob ? '' : 'none';
      /* ক্যাটাগরি বদলালে নিজে থেকেই ঠিক হয়ে যায় */
      if (userChanged) chk.checked = isJob;
      if (!isJob) chk.checked = false;
    }
  }
  document.addEventListener('change', function (e) {
    if (e.target.name === 'cat_id') ccJobSync(true);
  });
  ccJobSync(false);
  document.addEventListener('admin:ready', function () { ccJobSync(false); ccPremSync(); });

  /* প্রিমিয়াম বন্ধ থাকলে তারিখের ঘর লুকাই */
  function ccPremSync() {
    var c = document.getElementById('isPrem');
    if (!c) return;
    document.querySelectorAll('.premonly').forEach(function (el) { el.style.display = c.checked ? '' : 'none'; });
  }
  document.addEventListener('change', function (e) { if (e.target.id === 'isPrem') ccPremSync(); });
  ccPremSync();

  /* ---------- ক্যাটাগরি বাছলেই ছোট URL বসে যায় ---------- */
  var CC_NEXT  = <?= json_encode($nextSlugs, JSON_UNESCAPED_UNICODE) ?>;
  var CC_WORDS = <?= json_encode($trans['words'], JSON_UNESCAPED_UNICODE) ?>;
  var CC_CHARS = <?= json_encode($trans['chars'], JSON_UNESCAPED_UNICODE) ?>;
  var CC_SKIP  = ['এবং','ও','এর','এ','করা','করে','হবে','হয়েছে','জন্য','মধ্যে','the','a','an','of','for','and','in','to'];

  /* শিরোনাম → ইংরেজি অক্ষরের ২-৩টি শব্দ (সার্ভারের নিয়মের সাথে মিল রেখে) */
  function ccLatinWords(title) {
    title = (title || '').replace(/[()\[\]{}"'“”‘’,।:;!?]/g, ' ');
    var parts = title.split(/\s+/), out = [];
    for (var i = 0; i < parts.length && out.length < 3; i++) {
      var w = parts[i]; if (!w) continue;
      var wl = w.toLowerCase();
      if (CC_SKIP.indexOf(wl) > -1) continue;
      var t;
      if (CC_WORDS[w]) t = CC_WORDS[w];
      else if (CC_WORDS[wl]) t = CC_WORDS[wl];
      else if (/^[a-z0-9.\-]+$/i.test(w)) t = wl;
      else {
        t = '';
        /* বড় যুক্তাক্ষর আগে মেলাই, তারপর একক অক্ষর */
        for (var j = 0; j < w.length; ) {
          var three = w.substr(j, 3), two = w.substr(j, 2), one = w.charAt(j);
          if (CC_CHARS[three] !== undefined)     { t += CC_CHARS[three]; j += 3; }
          else if (CC_CHARS[two] !== undefined)  { t += CC_CHARS[two];   j += 2; }
          else if (CC_CHARS[one] !== undefined)  { t += CC_CHARS[one];   j += 1; }
          else                                   { t += one;             j += 1; }
        }
      }
      t = t.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (t.length < 2 || out.indexOf(t) > -1) continue;
      out.push(t.substring(0, 14));
      if (out.join('-').length >= 34) break;
    }
    return out.join('-');
  }

  function ccSlugSync() {
    var sel = document.querySelector('select[name="cat_id"]');
    var box = document.getElementById('slugBox');
    var ttl = document.querySelector('input[name="title"]');
    if (!sel || !box) return;
    if (box.dataset.auto !== '1') return;       /* হাতে লিখলে আর হাত দিই না */
    var num = CC_NEXT[sel.value] || '';
    if (!num) { box.value = ''; return; }
    var head = ccLatinWords(ttl ? ttl.value : '');
    box.value = head ? head + '-' + num : num;
  }
  document.addEventListener('change', function (e) { if (e.target.name === 'cat_id') ccSlugSync(); });
  document.addEventListener('input',  function (e) { if (e.target.name === 'title')  ccSlugSync(); });
  document.addEventListener('input', function (e) {
    if (e.target.id === 'slugBox') e.target.dataset.auto = '0';   /* হাতে লিখলে অটো বন্ধ */
  });
  ccSlugSync();
  document.addEventListener('admin:ready', function () { ccSlugSync(); });

  /* ---------- প্রিভিউ ---------- */
  document.addEventListener('click', function (e) {
    if (!e.target.closest('#edPreview')) return;
    var ta = document.getElementById('edArea');
    if (!ta) return;
    var html = ta.value.replace(/<script[\s\S]*?<\/script>/gi, '');
    var d = document.createElement('div');
    d.className = 'a-modal';
    d.innerHTML = '<div class="am-mask"></div><div class="am-box prev-box">' +
                  '<button type="button" class="am-x"><i class="fa fa-xmark"></i></button>' +
                  '<div class="prev-hd"><i class="fa fa-eye"></i> প্রিভিউ — পাবলিক পেজে যেমন দেখাবে</div>' +
                  '<div class="prev-body">' + html + '</div></div>';
    document.body.appendChild(d);
    document.body.style.overflow = 'hidden';
    function kill() { d.remove(); document.body.style.overflow = ''; }
    d.addEventListener('click', function (ev) {
      if (ev.target.closest('.am-mask') || ev.target.closest('.am-x')) kill();
      var a = ev.target.closest('.prev-body a');
      if (a) ev.preventDefault();                 /* প্রিভিউয়ের লিংকে যাওয়া বন্ধ */
    });
  });

  document.addEventListener('input', function (e) {
    if (e.target.id === 'edColor') wrap('<span style="color:' + e.target.value + '">', '</span>');
    if (e.target.id === 'edBg')    wrap('<span style="background:' + e.target.value + ';padding:1px 5px;border-radius:4px">', '</span>');
  });
}
</script>
<?php admin_end(); ?>

<?php $dtl = static fn ($x) => $x ? date('Y-m-d\TH:i', strtotime($x)) : ''; ?>
<div class="page-a" data-page="flash">
  <p class="small muted mb-12">ফ্ল্যাশ সেল সিস্টেম: <?= Settings::on('flash_enabled') ? '<span class="ok">চালু</span>' : '<span class="danger-text">বন্ধ</span>' ?> · হোমপেজ সেকশন: <?= Settings::on('home_flash') ? '<span class="ok">চালু</span>' : '<span class="danger-text">বন্ধ</span>' ?> (সেটিংস থেকে পরিবর্তন করুন)</p>
  <div class="toolbar"><div class="search-box"><i class="fa fa-search"></i><input type="search" placeholder="পণ্য ফিল্টার…" data-filter-list=".flash-row"></div></div>
  <div class="stock-list">
    <?php foreach ($items as $p): $live = $p['is_flash'] && $p['flash_price'] && (!$p['flash_start'] || strtotime($p['flash_start']) <= time()) && (!$p['flash_end'] || strtotime($p['flash_end']) > time()); ?>
    <form class="flash-row" data-api="/admin/api/flash/<?= (int) $p['id'] ?>" data-filter-text="<?= e(mb_strtolower($p['name'])) ?>">
      <img src="<?= e(img_url($p['image'], 'sm')) ?>" alt="" width="40" height="40" loading="lazy">
      <div class="flash-name"><b><?= e($p['name']) ?></b><br><span class="tiny muted">মূল্য <?= money($p['price']) ?> · স্টক <?= bn_num($p['stock']) ?></span>
        <?= $live ? '<span class="pill pill-green">লাইভ</span>' : ($p['is_flash'] ? '<span class="pill pill-amber">নির্ধারিত/মেয়াদোত্তীর্ণ</span>' : '') ?></div>
      <label class="switch"><input type="hidden" name="is_flash" value="0"><input type="checkbox" name="is_flash" value="1"<?= $p['is_flash'] ? ' checked' : '' ?>><span></span></label>
      <input name="flash_price" class="input w-90" placeholder="সেল মূল্য" inputmode="decimal" value="<?= e($p['flash_price'] ? (float) $p['flash_price'] : '') ?>" aria-label="সেল মূল্য">
      <input type="datetime-local" name="flash_start" class="input" value="<?= e($dtl($p['flash_start'])) ?>" aria-label="শুরু">
      <input type="datetime-local" name="flash_end" class="input" value="<?= e($dtl($p['flash_end'])) ?>" aria-label="শেষ">
      <button class="btn btn-primary btn-xs">সংরক্ষণ</button>
    </form>
    <?php endforeach; ?>
  </div>
</div>

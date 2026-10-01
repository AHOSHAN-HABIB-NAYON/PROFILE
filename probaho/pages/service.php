<?php
/** Single service detail (optional wallet payment when a price is set). */
$s = db()->row('SELECT s.*, c.name AS cat_name FROM services s LEFT JOIN service_categories c ON c.id = s.category_id WHERE s.slug = ? AND s.is_active = 1', [$params['slug']]);
if (!$s) {
    http_response_code(404);
    require __DIR__ . '/404.php';
    return;
}
View::$meta['title'] = $s['title'];
View::$meta['description'] = mb_substr((string) ($s['description'] ?: $s['subtitle']), 0, 200);
View::$meta['back'] = true;
$action = (string) $s['action_url'];
?>
<?php if (!$user): ?><div class="container public-page"><div class="narrow"><?php endif; ?>
<div class="card">
  <div class="service-hero">
    <span class="s-ic" style="--c:<?= e($s['color']) ?>"><?= media_icon($s['icon']) ?></span>
    <div class="grow">
      <?php if ($s['cat_name']): ?><span class="badge badge-brand"><?= e($s['cat_name']) ?></span><?php endif; ?>
      <h1 style="font-size:21px;margin:6px 0 2px"><?= e($s['title']) ?></h1>
      <?php if ($s['subtitle']): ?><p class="muted mb-0"><?= e($s['subtitle']) ?></p><?php endif; ?>
    </div>
  </div>
  <?php if ($s['description']): ?><div class="prose" style="margin-top:16px"><?= nl2p($s['description']) ?></div><?php endif; ?>
  <?php if ((float) $s['price'] > 0): ?>
    <div class="summary kv" style="margin:14px 0"><div><span class="k">সার্ভিস মূল্য</span><span class="v num"><?= e(money($s['price'])) ?></span></div></div>
    <?php if ($user): ?>
      <form action="<?= e(url('/api/wallet/pay-service')) ?>" method="post" data-ajax data-confirm="<?= e(money($s['price'])) ?> আপনার ওয়ালেট থেকে কাটা হবে। নিশ্চিত?">
        <?= csrf_field() ?>
        <input type="hidden" name="service_id" value="<?= (int) $s['id'] ?>">
        <div class="form-error" hidden></div>
        <div class="field"><label for="sv-note">প্রয়োজনীয় তথ্য / নোট</label><textarea class="textarea" id="sv-note" name="note" maxlength="500" placeholder="যেমন: NID নম্বর, মোবাইল নম্বর ইত্যাদি"></textarea></div>
        <button class="btn btn-primary btn-block btn-lg" type="submit"><?= icon('wallet') ?> ওয়ালেট থেকে পেমেন্ট করুন</button>
      </form>
    <?php else: ?>
      <a href="<?= e(url('/login?next=' . rawurlencode('/services/' . $s['slug']))) ?>" class="btn btn-primary btn-block btn-lg" data-link>লগইন করে সার্ভিস নিন</a>
    <?php endif; ?>
  <?php elseif ($action !== ''): ?>
    <a href="<?= e(url($action)) ?>" class="btn btn-primary btn-block btn-lg" style="margin-top:16px" <?= preg_match('~^https?://~', $action) ? 'target="_blank" rel="noopener"' : 'data-link' ?>>সার্ভিস শুরু করুন <?= icon('arrow-right') ?></a>
  <?php else: ?>
    <div class="alert alert-info" style="margin-top:16px"><?= icon('info') ?><div>এই সার্ভিসের জন্য আমাদের সাপোর্ট টিমের সাথে যোগাযোগ করুন।</div></div>
    <a href="<?= e(url('/support')) ?>" class="btn btn-primary btn-block" style="margin-top:12px" data-link><?= icon('headset') ?> সাপোর্টে যোগাযোগ</a>
  <?php endif; ?>
</div>
<button type="button" class="btn btn-ghost btn-block" style="margin-top:12px" data-ask="<?= e($s['title']) ?> সার্ভিস সম্পর্কে জানতে চাই"><?= icon('bot') ?> AI সহকারীকে জিজ্ঞেস করুন</button>
<?php if (!$user): ?></div></div><?php endif; ?>

<?php
View::$meta['title'] = 'সাধারণ জিজ্ঞাসা (FAQ)';
$faqs = db()->all('SELECT question, answer FROM faqs WHERE is_active = 1 ORDER BY sort_order, id');
View::$meta['description'] = 'অ্যাকাউন্ট, লগইন, Passkey, Binance Pay, জমা, লেনদেন ও অ্যাপ ইনস্টল সম্পর্কে সাধারণ প্রশ্নের উত্তর।';
View::$meta['schema'] = ['@context' => 'https://schema.org', '@type' => 'FAQPage', 'mainEntity' => array_map(static fn ($f) => ['@type' => 'Question', 'name' => $f['question'], 'acceptedAnswer' => ['@type' => 'Answer', 'text' => $f['answer']]], $faqs)];
?>
<?php if (!$user): ?><div class="container public-page"><div class="section-head"><span class="eyebrow">FAQ</span><h1 style="font-size:28px">সাধারণ জিজ্ঞাসা</h1></div><?php endif; ?>
<div class="faq-list">
  <?php foreach ($faqs as $f): ?>
    <details class="faq"><summary><?= e($f['question']) ?><?= icon('chevron-down') ?></summary><div class="faq-a"><?= nl2p($f['answer']) ?></div></details>
  <?php endforeach; ?>
</div>
<div class="card center" style="margin-top:16px;max-width:820px;margin-left:auto;margin-right:auto">
  <p class="muted">উত্তর খুঁজে পাননি?</p>
  <div class="row wrap" style="justify-content:center">
    <?php if (AI::enabled()): ?><button type="button" class="btn btn-primary" data-action="chat-open" data-tab="ai"><?= icon('bot') ?> AI সহকারী</button><?php endif; ?>
    <a href="<?= e(url('/support')) ?>" class="btn btn-ghost" data-link><?= icon('headset') ?> সাপোর্ট</a>
  </div>
</div>
<?php if (!$user): ?></div><?php endif; ?>

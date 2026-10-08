<?php
/**
 * Order confirmation with a lightweight SVG/CSS delivery-van animation (right → left).
 * @var array $order @var bool $owner (this browser placed the order)
 */
$waText = strtr((string)setting('text_whatsapp_order'), [
    '{order}' => $order['order_number'], '{name}' => $order['customer_name'], '{phone}' => $order['phone'],
]);
$waLink = setting('whatsapp_number') ? whatsapp_link((string)setting('whatsapp_number'), $waText) : null;
$qty = array_sum(array_map(static fn($i) => (int)$i['quantity'], $order['items']));
?>
<div class="success-page" data-success>
  <div class="scene" aria-hidden="true">
    <span class="cloud cloud-1"></span><span class="cloud cloud-2"></span>
    <div class="road"><span class="road-lines"></span></div>
    <div class="van">
      <span class="speed"><i></i><i></i><i></i></span>
      <svg viewBox="0 0 320 160" width="320" height="160" class="van-svg" focusable="false">
        <defs>
          <linearGradient id="vanBody" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--primary)"/><stop offset="1" stop-color="var(--secondary)"/></linearGradient>
          <linearGradient id="vanCab" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f8fafc"/><stop offset="1" stop-color="#cbd5e1"/></linearGradient>
          <linearGradient id="vanGlass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#bae6fd"/><stop offset=".55" stop-color="#38bdf8"/><stop offset="1" stop-color="#0369a1"/></linearGradient>
          <linearGradient id="vanBeam" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="#fde68a" stop-opacity=".8"/><stop offset="1" stop-color="#fde68a" stop-opacity="0"/></linearGradient>
          <radialGradient id="vanHub" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#f1f5f9"/><stop offset="1" stop-color="#94a3b8"/></radialGradient>
        </defs>
        <ellipse cx="165" cy="149" rx="150" ry="7" fill="rgba(15,23,42,.18)"/>
        <polygon points="0,98 18,104 18,116 0,124" fill="url(#vanBeam)"/>
        <path d="M306 26 L316 34 L316 118 L306 124 Z" fill="var(--primary-dark)"/>
        <rect x="108" y="20" width="200" height="104" rx="12" fill="url(#vanBody)"/>
        <rect x="108" y="20" width="200" height="16" rx="10" fill="rgba(255,255,255,.22)"/>
        <rect x="124" y="84" width="168" height="8" rx="4" fill="rgba(255,255,255,.35)"/>
        <g transform="translate(196 42)">
          <rect x="0" y="0" width="34" height="30" rx="5" fill="rgba(255,255,255,.92)"/>
          <path d="M0 10 H34 M17 0 V10" stroke="var(--primary)" stroke-width="3"/>
        </g>
        <path d="M112 50 L64 50 Q52 50 45 60 L24 90 Q18 98 18 108 L18 122 Q18 128 25 128 L112 128 Z" fill="url(#vanCab)"/>
        <path d="M104 58 L68 58 Q60 58 55 65 L40 88 L104 88 Z" fill="url(#vanGlass)"/>
        <path d="M70 60 L84 60 L64 86 L52 86 Z" fill="rgba(255,255,255,.35)"/>
        <rect x="86" y="96" width="14" height="4" rx="2" fill="#64748b"/>
        <line x1="78" y1="90" x2="78" y2="126" stroke="#94a3b8" stroke-width="2"/>
        <rect x="16" y="104" width="10" height="9" rx="2" fill="#fde047"/>
        <rect x="12" y="118" width="32" height="9" rx="3" fill="#334155"/>
        <rect x="296" y="110" width="16" height="8" rx="2" fill="#ef4444"/>
        <path d="M44 128 A28 28 0 0 1 100 128" fill="#1e293b"/>
        <path d="M222 128 A28 28 0 0 1 278 128" fill="#1e293b"/>
        <g class="wheel"><circle cx="72" cy="128" r="20" fill="#0f172a"/><circle cx="72" cy="128" r="11" fill="url(#vanHub)"/><path d="M72 117 V139 M61 128 H83" stroke="#64748b" stroke-width="2.5"/><circle cx="72" cy="128" r="3.5" fill="#475569"/></g>
        <g class="wheel"><circle cx="250" cy="128" r="20" fill="#0f172a"/><circle cx="250" cy="128" r="11" fill="url(#vanHub)"/><path d="M250 117 V139 M239 128 H261" stroke="#64748b" stroke-width="2.5"/><circle cx="250" cy="128" r="3.5" fill="#475569"/></g>
      </svg>
    </div>
  </div>

  <section class="success-card" aria-labelledby="success-title">
    <span class="success-check" aria-hidden="true"><i class="fa-solid fa-check"></i></span>
    <h1 id="success-title" class="success-title"><?= e(setting('text_order_success_title')) ?></h1>
    <?php if ($owner): ?>
      <p class="success-text"><?= e(setting('text_order_success_body')) ?></p>
      <p class="success-text muted"><i class="fa-solid fa-phone-volume" aria-hidden="true"></i> <?= e(setting('text_order_success_call')) ?></p>

      <dl class="order-facts">
        <div><dt>অর্ডার নম্বর</dt><dd><strong>#<?= e($order['order_number']) ?></strong> <button type="button" class="icon-btn icon-btn-sm" data-action="copy" data-copy="<?= e($order['order_number']) ?>" aria-label="অর্ডার নম্বর কপি করুন"><i class="fa-regular fa-copy" aria-hidden="true"></i></button></dd></div>
        <div><dt>নাম</dt><dd><?= e($order['customer_name']) ?></dd></div>
        <div><dt>ফোন</dt><dd><?= e(bn_digits($order['phone'])) ?></dd></div>
        <div><dt>ঠিকানা</dt><dd><?= e($order['address']) ?>, <?= e($order['district']) ?></dd></div>
      </dl>

      <div class="order-items">
        <p class="order-items-title">অর্ডারের পণ্য</p>
        <?php foreach ($order['items'] as $it): ?>
          <div class="order-item">
            <img src="<?= e(packed_image_url($it['image'])) ?>" alt="" width="48" height="48" loading="lazy">
            <span class="order-item-name"><?= e($it['product_name']) ?><?php if ($it['size'] || $it['color']): ?><small class="muted d-block"><?= e(trim(($it['size'] ? 'সাইজ: ' . $it['size'] : '') . ' ' . ($it['color'] ? 'রং: ' . $it['color'] : ''))) ?></small><?php endif; ?></span>
            <span class="order-item-qty">× <?= num($it['quantity']) ?></span>
            <span class="order-item-price"><?= money($it['line_total']) ?></span>
          </div>
        <?php endforeach; ?>
      </div>

      <dl class="totals">
        <div><dt>পরিমাণ</dt><dd><?= num($qty) ?>টি পণ্য</dd></div>
        <div><dt>সাবটোটাল</dt><dd><?= money($order['subtotal']) ?></dd></div>
        <div><dt>ডেলিভারি চার্জ</dt><dd><?= (float)$order['delivery_charge'] > 0 ? money($order['delivery_charge']) : 'ফ্রি' ?></dd></div>
        <?php if ((float)$order['discount'] > 0): ?><div><dt>ডিসকাউন্ট</dt><dd class="text-success">− <?= money($order['discount']) ?></dd></div><?php endif; ?>
        <div class="totals-grand"><dt>মোট টাকা</dt><dd><?= money($order['total']) ?></dd></div>
      </dl>
      <p class="cod-note"><i class="fa-solid fa-money-bill-wave" aria-hidden="true"></i> ক্যাশ অন ডেলিভারি — পণ্য হাতে পেয়ে <?= money($order['total']) ?> পরিশোধ করুন</p>
    <?php else: ?>
      <p class="success-text">অর্ডার নম্বর: <strong>#<?= e($order['order_number']) ?></strong></p>
      <p class="success-text">বর্তমান অবস্থা: <?= status_badge($order['status'], true) ?></p>
      <p class="muted small">নিরাপত্তার জন্য অর্ডারের বিস্তারিত শুধু অর্ডারকারী ডিভাইসে দেখানো হয়। <a href="<?= e(url('/orders')) ?>">অর্ডার ট্র্যাক করুন</a></p>
    <?php endif; ?>

    <div class="success-actions">
      <a href="<?= e(url('/')) ?>" class="btn btn-primary btn-lg"><i class="fa-solid fa-bag-shopping" aria-hidden="true"></i> শপিং চালিয়ে যান</a>
      <?php if ($waLink && $owner): ?>
        <a href="<?= e($waLink) ?>" class="btn btn-wa btn-lg" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp" aria-hidden="true"></i> সাপোর্টে যোগাযোগ করুন</a>
      <?php elseif (setting('contact_phone')): ?>
        <a href="tel:<?= e(preg_replace('/[^\d+]/', '', (string)setting('contact_phone'))) ?>" class="btn btn-outline btn-lg"><i class="fa-solid fa-headset" aria-hidden="true"></i> সাপোর্টে যোগাযোগ করুন</a>
      <?php endif; ?>
    </div>
  </section>
</div>

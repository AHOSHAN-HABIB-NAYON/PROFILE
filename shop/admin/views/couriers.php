<div class="page-a" data-page="couriers">
  <p class="small muted mb-12">API কী/সিক্রেট শুধুমাত্র সার্ভারে সংরক্ষিত হয় এবং কখনো ব্রাউজারে পাঠানো হয় না। খালি রাখলে আগের মান অপরিবর্তিত থাকবে।</p>
  <div class="courier-grid">
    <?php foreach ($accounts as $a): $reg = CourierManager::REGISTRY[$a['code']] ?? null; if (!$reg) continue; $extra = json_decode((string) $a['extra'], true) ?: []; $hasDriver = CourierManager::hasDriver($a['code']); ?>
    <section class="card courier-card">
      <div class="card-head">
        <h3 class="card-title"><i class="fa fa-truck"></i> <?= e($a['name']) ?></h3>
        <?php if ($a['last_test_status']): ?><span class="pill <?= $a['last_test_status'] === 'success' ? 'pill-green' : 'pill-red' ?>" title="<?= e($a['last_test_message']) ?>"><?= $a['last_test_status'] === 'success' ? 'সংযুক্ত' : 'ত্রুটি' ?></span><?php endif; ?>
      </div>
      <?php if (!$hasDriver): ?>
        <p class="tiny alert alert-warn">এই কুরিয়ারের API ড্রাইভার এখনো যুক্ত হয়নি। ক্রেডেনশিয়াল সংরক্ষণ করা যাবে; পাঠানো/ট্র্যাকিং-এর জন্য <code>services/Couriers/</code>-এ একটি ড্রাইভার ক্লাস যোগ করে <code>CourierManager::REGISTRY</code>-এ রেজিস্টার করুন।</p>
      <?php endif; ?>
      <form data-api="/admin/api/couriers/<?= e($a['code']) ?>/save" data-reload>
        <div class="field"><label>API Key<?= $a['code'] === 'pathao' ? ' (Client ID)' : ($a['code'] === 'redx' ? ' (Access Token)' : '') ?></label><input name="api_key" type="password" autocomplete="off" placeholder="<?= $a['api_key'] ? '•••••••• (সংরক্ষিত)' : 'দিন' ?>"></div>
        <?php if ($a['code'] !== 'redx'): ?><div class="field"><label>Secret Key<?= $a['code'] === 'pathao' ? ' (Client Secret)' : '' ?></label><input name="secret_key" type="password" autocomplete="off" placeholder="<?= $a['secret_key'] ? '•••••••• (সংরক্ষিত)' : 'দিন' ?>"></div><?php endif; ?>
        <?php foreach ($reg['fields'] as $f => $label): ?>
          <div class="field"><label><?= e($label) ?></label><input name="extra_<?= e($f) ?>" <?= $f === 'password' ? 'type="password" placeholder="' . (!empty($extra[$f]) ? '•••••••• (সংরক্ষিত)' : '') . '"' : 'value="' . e($extra[$f] ?? '') . '"' ?> autocomplete="off"></div>
        <?php endforeach; ?>
        <div class="field"><label>Base URL <span class="tiny muted">(ঐচ্ছিক — স্যান্ডবক্স/কাস্টম)</span></label><input name="base_url" value="<?= e($a['base_url']) ?>" placeholder="ডিফল্ট"></div>
        <?php View::partial('admin/views/partials/switch', ['name' => 'is_enabled', 'label' => 'চালু', 'checked' => (int) $a['is_enabled']]); ?>
        <?php View::partial('admin/views/partials/switch', ['name' => 'is_default', 'label' => 'ডিফল্ট কুরিয়ার', 'checked' => (int) $a['is_default']]); ?>
        <div class="row-btns">
          <button class="btn btn-primary btn-sm grow">সংরক্ষণ</button>
          <?php if ($hasDriver): ?><button type="button" class="btn btn-soft btn-sm" data-post="/admin/api/couriers/<?= e($a['code']) ?>/test" data-reload><i class="fa fa-plug"></i> কানেকশন টেস্ট</button><?php endif; ?>
        </div>
        <?php if ($a['last_test_message']): ?><p class="tiny muted mt-8"><?= e($a['last_test_message']) ?> · <?= $a['last_test_at'] ? time_ago($a['last_test_at']) : '' ?></p><?php endif; ?>
      </form>
    </section>
    <?php endforeach; ?>
  </div>
</div>

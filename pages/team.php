<?php
/** Our Team. */
defined('APP') || exit;
require_once ROOT . '/core/upload.php';

$members = rows('SELECT * FROM team_members WHERE status = 1 ORDER BY sort, id');
meta(['title' => t('team.title'), 'description' => t('team.meta_description', ['site' => setting('site_name')]), 'track_type' => 'team']);
?>
<style data-css="team">
.team-grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fill,minmax(250px,1fr))}
.member{display:flex;flex-direction:column;align-items:center;text-align:center;gap:6px;padding:22px 18px;position:relative;overflow:hidden}
.member::before{content:"";position:absolute;inset:0 0 auto 0;height:70px;background:linear-gradient(135deg,var(--primary-soft),color-mix(in srgb,var(--secondary) 12%,transparent))}
.member .photo{position:relative;width:96px;height:96px;border-radius:50%;overflow:hidden;border:4px solid var(--card);box-shadow:var(--shadow);background:linear-gradient(135deg,var(--primary),var(--secondary));display:grid;place-items:center;color:#fff;font-size:2rem;font-weight:700}
.member .photo img{width:100%;height:100%;object-fit:cover}
.member.vip .photo{border-color:#f7c948;box-shadow:0 0 0 3px color-mix(in srgb,#f7c948 35%,transparent),0 10px 30px -10px #f59e0b}
.member.vip .photo::after{content:"";position:absolute;inset:-4px;border-radius:50%;border:2px solid transparent;border-top-color:#f7c948;animation:spin 3s linear infinite}
.member h3{margin:8px 0 0;font-size:1.02rem}
.member .pos{color:var(--primary);font-weight:600;font-size:.84rem}
.member p{font-size:.84rem;color:var(--muted);margin:4px 0}
.skills{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin:6px 0}
.skills span{font-size:.72rem;padding:3px 9px;border-radius:999px;background:var(--soft)}
.m-actions{display:flex;gap:6px;justify-content:center;flex-wrap:wrap;margin-top:6px}
</style>
<div class="page" data-page="team">
  <header class="page-head"><h1><?= e(t('team.title')) ?></h1><p><?= e(t('team.subtitle')) ?></p></header>
  <?php if (!$members): ?>
    <div class="card empty"><div class="icon-box"><i class="fa-solid fa-users"></i></div><?= e(t('team.empty')) ?></div>
  <?php endif ?>
  <div class="team-grid">
    <?php foreach ($members as $m): $skills = array_filter(array_map('trim', explode(',', (string)$m['skills']))); ?>
      <article class="card member <?= $m['is_vip'] ? 'vip' : '' ?>">
        <div class="photo"><?= $m['photo'] ? img_tag($m['photo'], $m['name'], ['width' => 96, 'height' => 96, 'sizes' => '96px']) : e(mb_strtoupper(mb_substr($m['name'], 0, 1))) ?></div>
        <h3><?= e($m['name']) ?> <?php if ($m['is_vip']): ?><span class="badge vip"><i class="fa-solid fa-crown"></i>VIP</span><?php endif ?></h3>
        <span class="pos"><?= e(loc($m, 'position')) ?></span>
        <?php if ($bio = loc($m, 'bio')): ?><p><?= e($bio) ?></p><?php endif ?>
        <?php if ($skills): ?><div class="skills"><?php foreach ($skills as $sk): ?><span><?= e($sk) ?></span><?php endforeach ?></div><?php endif ?>
        <div class="m-actions">
          <?php if ($m['whatsapp']): ?><a class="icon-btn" style="background:var(--soft)" href="https://wa.me/<?= e(preg_replace('~\D~', '', $m['whatsapp'])) ?>" target="_blank" rel="noopener" aria-label="WhatsApp"><i class="fa-brands fa-whatsapp"></i></a><?php endif ?>
          <?php if ($m['email']): ?><a class="icon-btn" style="background:var(--soft)" href="mailto:<?= e($m['email']) ?>" aria-label="Email"><i class="fa-regular fa-envelope"></i></a><?php endif ?>
          <?php if ($m['phone']): ?><a class="icon-btn" style="background:var(--soft)" href="tel:<?= e(preg_replace('~[^\d+]~', '', $m['phone'])) ?>" aria-label="<?= e(t('form.phone')) ?>"><i class="fa-solid fa-phone"></i></a><?php endif ?>
          <?php if ($m['website']): ?><a class="icon-btn" style="background:var(--soft)" href="<?= e($m['website']) ?>" target="_blank" rel="noopener" aria-label="Website"><i class="fa-solid fa-globe"></i></a><?php endif ?>
          <?php if ($m['cv_file']): ?><a class="btn btn-sm btn-soft" href="<?= e(media_url($m['cv_file'])) ?>" target="_blank" rel="noopener" data-no-spa><i class="fa-regular fa-file-lines"></i><?= e(t('team.cv')) ?></a><?php endif ?>
        </div>
      </article>
    <?php endforeach ?>
  </div>
</div>

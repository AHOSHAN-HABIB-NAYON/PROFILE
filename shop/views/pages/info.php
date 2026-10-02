<div class="page container narrow" data-page="info">
  <h1 class="page-title"><?= e($title) ?></h1>
  <article class="card info-page">
    <span class="info-ic"><i class="fa fa-<?= e($icon) ?>"></i></span>
    <div class="rich-text">
      <?php foreach (preg_split('/\n\s*\n/', trim($body)) as $para): ?><p><?= nl2br(e($para)) ?></p><?php endforeach; ?>
    </div>
  </article>
  <div class="info-links">
    <a href="/about">আমাদের সম্পর্কে</a><a href="/privacy">প্রাইভেসি পলিসি</a><a href="/terms">শর্তাবলী</a><a href="/contact">যোগাযোগ</a>
  </div>
</div>

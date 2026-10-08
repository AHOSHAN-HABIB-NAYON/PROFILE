<?php
/**
 * @var array $files
 */
?>
<div class="a-page">
  <div class="page-head">
    <div><h1 class="a-title">Backup</h1><p class="muted small">Backups are stored outside the public web folder and can only be downloaded by owners.</p></div>
    <button type="button" class="btn btn-primary" data-action="post" data-url="<?= e(url('/admin/backup/create')) ?>"><i class="fa-solid fa-database" aria-hidden="true"></i> Create backup now</button>
  </div>
  <div class="a-grid-2">
    <section class="a-card">
      <h2 class="a-card-title"><i class="fa-solid fa-box-archive" aria-hidden="true"></i> Saved backups</h2>
      <?php if (!$files): ?><p class="muted small">No backups yet.</p><?php endif; ?>
      <div class="list">
        <?php foreach ($files as $f): ?>
          <div class="list-row">
            <span class="list-main"><span class="mono small"><?= e($f['name']) ?></span><span class="muted small d-block"><?= number_format($f['size'] / 1024, 1) ?> KB · <?= e(date('d M Y, h:i A', $f['time'])) ?></span></span>
            <span class="row-actions">
              <a class="icon-btn icon-btn-sm" href="<?= e(url('/admin/backup/download/' . $f['name'])) ?>" data-no-spa download aria-label="Download"><i class="fa-solid fa-download" aria-hidden="true"></i></a>
              <button type="button" class="icon-btn icon-btn-sm danger" data-action="post" data-url="<?= e(url('/admin/backup/delete/' . $f['name'])) ?>" data-confirm="Delete this backup file permanently?" aria-label="Delete"><i class="fa-solid fa-trash" aria-hidden="true"></i></button>
            </span>
          </div>
        <?php endforeach; ?>
      </div>
    </section>
    <section class="a-card">
      <h2 class="a-card-title"><i class="fa-solid fa-clock-rotate-left" aria-hidden="true"></i> Restore</h2>
      <p class="small"><strong class="text-danger">This replaces all current data</strong> with the backup. A safety backup is created automatically before restoring. Only backups created by this system are accepted.</p>
      <form method="post" action="<?= e(url('/admin/backup/restore')) ?>" enctype="multipart/form-data" data-ajax data-no-spa data-confirm-submit="Restore the database from this file? Current data will be replaced.">
        <div class="field"><label class="label" for="bk-file">Backup file (.sql.gz)</label><input id="bk-file" class="input" type="file" name="backup" accept=".gz,application/gzip" required></div>
        <div class="field"><label class="label" for="bk-confirm">Type RESTORE to confirm</label><input id="bk-confirm" class="input mono" name="confirm" required autocomplete="off"></div>
        <button class="btn btn-danger" type="submit"><i class="fa-solid fa-upload" aria-hidden="true"></i> Restore database</button>
      </form>
      <p class="muted small">Product images live in <code>public/uploads</code> — back them up with Hostinger File Manager (compress the folder) or the hPanel backup tool.</p>
    </section>
  </div>
</div>

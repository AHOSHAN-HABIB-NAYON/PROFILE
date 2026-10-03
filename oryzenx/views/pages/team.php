<?php /** @var array $team */ ?>
<div class="page-head"><h1><?= e(t('team.title')) ?></h1><p><?= e(t('team.sub')) ?></p></div>
<?php if (!$team): ?><div class="empty"><i class="fa-solid fa-users"></i><?= e(t('common.empty')) ?></div><?php endif; ?>
<div class="team-grid">
    <?php foreach ($team as $m) require VIEWS . '/components/team-card.php'; ?>
</div>

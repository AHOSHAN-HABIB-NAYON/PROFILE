<?php
/** Admin: team members (photo, skills, CV upload, VIP badge). */
defined('APP') || exit;
require_once ROOT . '/admin/_crud.php';
meta(['title' => 'Team']);
?>
<div class="page">
  <div class="adm-title"><h1>Team</h1><a class="btn btn-sm btn-soft" href="<?= e(url('/team')) ?>" target="_blank" rel="noopener"><i class="fa-solid fa-eye"></i>View page</a></div>
  <?php crud_render('team_members', '/admin/team') ?>
</div>

<?php
/** Admin layout + views. Variables come from admin/index.php. */
$nav = [
    ['dashboard', [], 'Dashboard', 'fa-solid fa-gauge-high'],
    ['messages', [], 'Messages', 'fa-solid fa-envelope'],
];
foreach ($TYPES as $k => $tp) {
    $nav[] = ['list', ['t' => $k], $tp['label'], $tp['icon']];
}
$nav[] = ['settings', [], 'Settings', 'fa-solid fa-gear'];
$nav[] = ['account', [], 'My Account', 'fa-solid fa-user-shield'];
$curT = $_GET['t'] ?? '';
$csrf = csrf_token();
?>
<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title><?= e($title) ?> — Admin</title>
<script>try{if(localStorage.getItem('theme')==='dark')document.documentElement.setAttribute('data-theme','dark');var a=localStorage.getItem('accent');if(a)document.documentElement.setAttribute('data-accent',a)}catch(e){}</script>
<link rel="icon" type="image/svg+xml" href="<?= e(asset('img/favicon.svg')) ?>">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css">
<link rel="stylesheet" href="<?= e(base_path() . 'admin/admin.css?v=' . filemtime(__DIR__ . '/admin.css')) ?>">
</head>
<body>
<aside class="sidebar" id="sidebar">
    <a href="<?= e(admin_url()) ?>" class="brand">
        <svg viewBox="0 0 48 48" width="32" height="32"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="var(--a1)"/><stop offset="1" stop-color="var(--a2)"/></linearGradient></defs><path d="M24 3 42 13.5v21L24 45 6 34.5v-21Z" fill="none" stroke="url(#g)" stroke-width="4" stroke-linejoin="round"/><path d="m19 18-6 6 6 6M29 18l6 6-6 6M26 15l-4 18" fill="none" stroke="url(#g)" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <span><?= e(setting('site_name', 'CodeNexa')) ?></span>
    </a>
    <nav>
        <?php foreach ($nav as $n):
            $active = $n[0] === $a && (!isset($n[1]['t']) || $n[1]['t'] === $curT) || ($a === 'edit' && isset($n[1]['t']) && $n[1]['t'] === $curT); ?>
            <a href="<?= e(admin_url($n[0], $n[1])) ?>" class="<?= $active ? 'active' : '' ?>">
                <i class="<?= $n[3] ?>"></i><span><?= e($n[2]) ?></span>
                <?php if ($n[0] === 'messages' && $unread): ?><em class="pill"><?= $unread ?></em><?php endif; ?>
            </a>
        <?php endforeach; ?>
    </nav>
    <div class="side-foot">
        <a href="<?= e(base_path()) ?>" target="_blank"><i class="fa-solid fa-arrow-up-right-from-square"></i><span>View Website</span></a>
        <form method="post" action="<?= e(admin_url('logout')) ?>">
            <input type="hidden" name="_csrf" value="<?= e($csrf) ?>">
            <button type="submit"><i class="fa-solid fa-right-from-bracket"></i><span>Logout</span></button>
        </form>
    </div>
</aside>
<div class="scrim" data-close-side></div>

<div class="main">
    <header class="topbar">
        <button class="icon-btn only-sm" data-open-side aria-label="Menu"><i class="fa-solid fa-bars"></i></button>
        <h1><?= e($title) ?></h1>
        <div class="top-actions">
            <button class="icon-btn" data-theme-toggle aria-label="Toggle dark mode"><i class="fa-solid fa-moon"></i><i class="fa-solid fa-sun"></i></button>
            <a href="<?= e(admin_url('messages')) ?>" class="icon-btn bell" aria-label="Messages"><i class="fa-regular fa-bell"></i><?php if ($unread): ?><b></b><?php endif; ?></a>
            <span class="me"><span class="av"><?= e(mb_strtoupper(mb_substr($me['name'], 0, 1))) ?></span><span class="hide-sm"><?= e($me['name']) ?></span></span>
        </div>
    </header>

    <main class="content">
        <?php if ($flash): ?><div class="alert <?= e($flash[1]) ?>" data-autohide><?= e($flash[0]) ?></div><?php endif; ?>

<?php switch ($view):
case 'dashboard': ?>
        <div class="stat-grid">
            <?php foreach ($stats as $s): ?>
                <div class="card stat" style="--c:<?= $s[3] ?>">
                    <span class="si"><i class="<?= $s[2] ?>"></i></span>
                    <div><small class="muted"><?= e($s[0]) ?></small><strong><?= number_format($s[1]) ?></strong></div>
                </div>
            <?php endforeach; ?>
        </div>
        <div class="dash-grid">
            <div class="card pad">
                <div class="card-head"><h2>Website Visitors</h2><span class="muted small">Last 14 days</span></div>
                <?php
                $vals = array_values($days);
                $max = max(1, max($vals));
                $w = 600; $h = 220; $n = count($vals);
                $pts = [];
                foreach ($vals as $i => $v) {
                    $pts[] = round($i * $w / ($n - 1), 1) . ',' . round($h - 10 - ($v / $max) * ($h - 30), 1);
                }
                ?>
                <svg viewBox="0 0 <?= $w ?> <?= $h + 24 ?>" class="chart" role="img" aria-label="Visitors chart">
                    <defs><linearGradient id="ar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--a1)" stop-opacity=".35"/><stop offset="1" stop-color="var(--a1)" stop-opacity="0"/></linearGradient></defs>
                    <?php for ($g = 0; $g < 4; $g++): $y = 20 + $g * ($h - 30) / 3; ?><line x1="0" x2="<?= $w ?>" y1="<?= $y ?>" y2="<?= $y ?>" class="gl"/><?php endfor; ?>
                    <polygon points="0,<?= $h ?> <?= implode(' ', $pts) ?> <?= $w ?>,<?= $h ?>" fill="url(#ar)"/>
                    <polyline points="<?= implode(' ', $pts) ?>" fill="none" stroke="var(--a1)" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" class="line"/>
                    <?php $i = 0; foreach ($days as $d => $v): [$px, $py] = explode(',', $pts[$i]); ?>
                        <circle cx="<?= $px ?>" cy="<?= $py ?>" r="4" class="dot"><title><?= e(date('M j', strtotime($d))) ?>: <?= $v ?></title></circle>
                        <?php if ($i % 2 === 0): ?><text x="<?= $px ?>" y="<?= $h + 20 ?>" text-anchor="<?= $i === 0 ? 'start' : 'middle' ?>" class="lbl"><?= e(date('M j', strtotime($d))) ?></text><?php endif; ?>
                    <?php $i++; endforeach; ?>
                </svg>
            </div>
            <div class="card pad">
                <div class="card-head"><h2>Recent Messages</h2><a href="<?= e(admin_url('messages')) ?>" class="small">View all</a></div>
                <?php if (!$recent): ?><p class="muted">No messages yet.</p><?php endif; ?>
                <ul class="people">
                    <?php foreach ($recent as $m): ?>
                        <li><a href="<?= e(admin_url('messages', ['id' => $m['id']])) ?>">
                            <span class="av"><?= e(mb_strtoupper(mb_substr($m['name'], 0, 1))) ?></span>
                            <span class="grow"><strong><?= e($m['name']) ?><?php if (!$m['is_read']): ?> <em class="dot-new"></em><?php endif; ?></strong><small class="muted"><?= e($m['email']) ?></small></span>
                            <small class="muted"><?= e(date('M j', strtotime($m['created_at']))) ?></small>
                        </a></li>
                    <?php endforeach; ?>
                </ul>
            </div>
        </div>
        <div class="card pad quick">
            <h2>Quick actions</h2>
            <div class="row">
                <a class="btn btn-primary" href="<?= e(admin_url('edit', ['t' => 'services'])) ?>"><i class="fa-solid fa-plus"></i> Add Service</a>
                <a class="btn btn-outline" href="<?= e(admin_url('edit', ['t' => 'projects'])) ?>"><i class="fa-solid fa-plus"></i> Add Project</a>
                <a class="btn btn-outline" href="<?= e(admin_url('settings')) ?>"><i class="fa-solid fa-gear"></i> Settings</a>
                <form method="post" action="<?= e(admin_url('cache')) ?>"><input type="hidden" name="_csrf" value="<?= e($csrf) ?>"><button class="btn btn-outline" type="submit"><i class="fa-solid fa-broom"></i> Clear Cache</button></form>
            </div>
        </div>
<?php break;

case 'messages': ?>
        <div class="card">
            <div class="card-head pad-x">
                <h2><?= count($messages) ?> message<?= count($messages) === 1 ? '' : 's' ?></h2>
                <?php if ($unread): ?>
                    <form method="post"><input type="hidden" name="_csrf" value="<?= e($csrf) ?>"><input type="hidden" name="do" value="read_all"><button class="btn btn-sm btn-outline">Mark all read</button></form>
                <?php endif; ?>
            </div>
            <?php if (!$messages): ?><p class="muted pad">No messages yet. Messages sent from the contact form appear here.</p><?php endif; ?>
            <ul class="msg-list">
                <?php foreach ($messages as $m): ?>
                    <li class="<?= $m['is_read'] ? '' : 'unread' ?>">
                        <a href="<?= e(admin_url('messages', ['id' => $m['id']])) ?>">
                            <span class="av"><?= e(mb_strtoupper(mb_substr($m['name'], 0, 1))) ?></span>
                            <span class="grow"><strong><?= e($m['name']) ?></strong> <small class="muted"><?= e($m['email']) ?></small>
                                <span class="excerpt muted"><?= e(mb_strimwidth((string) $m['message'], 0, 110, '…')) ?></span></span>
                            <small class="muted nowrap"><?= e(date('M j, H:i', strtotime($m['created_at']))) ?></small>
                        </a>
                    </li>
                <?php endforeach; ?>
            </ul>
        </div>
<?php break;

case 'message': ?>
        <a href="<?= e(admin_url('messages')) ?>" class="back"><i class="fa-solid fa-arrow-left"></i> All messages</a>
        <div class="card pad message-view">
            <div class="msg-head">
                <span class="av lg"><?= e(mb_strtoupper(mb_substr($msg['name'], 0, 1))) ?></span>
                <div class="grow">
                    <h2><?= e($msg['name']) ?></h2>
                    <a href="mailto:<?= e($msg['email']) ?>"><?= e($msg['email']) ?></a>
                    <?php if ($msg['phone']): ?> · <a href="tel:<?= e($msg['phone']) ?>"><?= e($msg['phone']) ?></a><?php endif; ?>
                    <div class="muted small"><?= e(date('l, M j Y \a\t H:i', strtotime($msg['created_at']))) ?> · IP <?= e($msg['ip']) ?></div>
                </div>
            </div>
            <div class="msg-body"><?= nl2br(e($msg['message'])) ?></div>
            <div class="row">
                <a class="btn btn-primary" href="mailto:<?= e($msg['email']) ?>?subject=<?= rawurlencode('Re: your message to ' . setting('site_name')) ?>"><i class="fa-solid fa-reply"></i> Reply</a>
                <form method="post" action="<?= e(admin_url('messages')) ?>"><input type="hidden" name="_csrf" value="<?= e($csrf) ?>"><input type="hidden" name="id" value="<?= (int) $msg['id'] ?>"><input type="hidden" name="do" value="unread"><button class="btn btn-outline"><i class="fa-regular fa-envelope"></i> Mark unread</button></form>
                <form method="post" action="<?= e(admin_url('messages')) ?>" data-confirm="Delete this message?"><input type="hidden" name="_csrf" value="<?= e($csrf) ?>"><input type="hidden" name="id" value="<?= (int) $msg['id'] ?>"><input type="hidden" name="do" value="delete"><button class="btn btn-danger"><i class="fa-solid fa-trash"></i> Delete</button></form>
            </div>
        </div>
<?php break;

case 'list': ?>
        <div class="card">
            <div class="card-head pad-x">
                <h2><?= count($items) ?> item<?= count($items) === 1 ? '' : 's' ?></h2>
                <a class="btn btn-primary btn-sm" href="<?= e(admin_url('edit', ['t' => $t])) ?>"><i class="fa-solid fa-plus"></i> Add New</a>
            </div>
            <div class="table-wrap">
                <table>
                    <thead><tr><?php foreach ($type['cols'] as $c => $label): ?><th><?= e($label) ?></th><?php endforeach; ?><th class="right">Actions</th></tr></thead>
                    <tbody>
                    <?php if (!$items): ?><tr><td colspan="<?= count($type['cols']) + 1 ?>" class="muted">Nothing here yet.</td></tr><?php endif; ?>
                    <?php foreach ($items as $it): ?>
                        <tr>
                            <?php $first = true; foreach ($type['cols'] as $c => $label): ?>
                                <td data-label="<?= e($label) ?>">
                                    <?php if ($first): ?>
                                        <span class="cell-title">
                                            <?php if (isset($it['icon'])): ?><span class="ti" style="--c:<?= e($it['color']) ?>"><i class="<?= e($it['icon']) ?>"></i></span>
                                            <?php elseif (isset($it['color'])): ?><span class="sw" style="background:<?= e($it['color']) ?>"></span><?php endif; ?>
                                            <a href="<?= e(admin_url('edit', ['t' => $t, 'id' => $it['id']])) ?>"><strong><?= e($it[$c]) ?></strong></a>
                                        </span>
                                    <?php elseif (in_array($c, ['active', 'popular'], true)): ?>
                                        <span class="tag <?= $it[$c] ? 'on' : '' ?>"><?= $it[$c] ? 'Yes' : 'No' ?></span>
                                    <?php else: ?>
                                        <?= e(mb_strimwidth((string) $it[$c], 0, 70, '…')) ?>
                                    <?php endif; ?>
                                </td>
                            <?php $first = false; endforeach; ?>
                            <td class="right actions">
                                <a class="icon-btn" href="<?= e(admin_url('edit', ['t' => $t, 'id' => $it['id']])) ?>" aria-label="Edit"><i class="fa-solid fa-pen"></i></a>
                                <form method="post" data-confirm="Delete this item?"><input type="hidden" name="_csrf" value="<?= e($csrf) ?>"><input type="hidden" name="do" value="delete"><input type="hidden" name="id" value="<?= (int) $it['id'] ?>"><button class="icon-btn danger" aria-label="Delete"><i class="fa-solid fa-trash"></i></button></form>
                            </td>
                        </tr>
                    <?php endforeach; ?>
                    </tbody>
                </table>
            </div>
        </div>
<?php break;

case 'edit': ?>
        <a href="<?= e(admin_url('list', ['t' => $t])) ?>" class="back"><i class="fa-solid fa-arrow-left"></i> <?= e($type['label']) ?></a>
        <?php if (!empty($formError)): ?><div class="alert err"><?= e($formError) ?></div><?php endif; ?>
        <form method="post" class="card pad form-grid">
            <input type="hidden" name="_csrf" value="<?= e($csrf) ?>">
            <?php foreach ($type['fields'] as $name => $f):
                $val = $item[$name] ?? ($f[3] ?? '');
                $wide = in_array($f[0], ['textarea', 'bool'], true) ? ' full' : ''; ?>
                <?php if ($f[0] === 'bool'): ?>
                    <label class="check<?= $wide ?>"><input type="checkbox" name="<?= $name ?>" value="1" <?= (string) $val === '1' ? 'checked' : '' ?>> <?= e($f[1]) ?></label>
                <?php else: ?>
                    <label class="<?= trim($wide) ?>"><span><?= e($f[1]) ?><?= !empty($f[2]) ? ' *' : '' ?></span>
                    <?php if ($f[0] === 'textarea'): ?>
                        <textarea name="<?= $name ?>" rows="5"><?= e($val) ?></textarea>
                    <?php elseif ($f[0] === 'select'): ?>
                        <select name="<?= $name ?>"><?php foreach ($f[4] as $ov => $ol): ?><option value="<?= e($ov) ?>" <?= (string) $val === (string) $ov ? 'selected' : '' ?>><?= e($ol) ?></option><?php endforeach; ?></select>
                    <?php elseif ($f[0] === 'color'): ?>
                        <span class="color-in"><input type="color" name="<?= $name ?>" value="<?= e($val) ?>"><code><?= e($val) ?></code></span>
                    <?php elseif ($f[0] === 'icon'): ?>
                        <span class="icon-in"><span class="ti"><i class="<?= e($val) ?>"></i></span><input type="text" name="<?= $name ?>" value="<?= e($val) ?>" data-icon-input placeholder="fa-solid fa-code"></span>
                        <small class="muted">Browse icons at <a href="https://fontawesome.com/search?o=r&m=free" target="_blank" rel="noopener">fontawesome.com</a></small>
                    <?php else: ?>
                        <input type="<?= $f[0] === 'number' ? 'number' : ($f[0] === 'url' ? 'url' : 'text') ?>" name="<?= $name ?>" value="<?= e($val) ?>" <?= !empty($f[2]) ? 'required' : '' ?>>
                    <?php endif; ?>
                    </label>
                <?php endif; ?>
            <?php endforeach; ?>
            <div class="full row">
                <button class="btn btn-primary" type="submit"><i class="fa-solid fa-floppy-disk"></i> Save</button>
                <a class="btn btn-outline" href="<?= e(admin_url('list', ['t' => $t])) ?>">Cancel</a>
            </div>
        </form>
<?php break;

case 'settings': ?>
        <form method="post" class="settings">
            <input type="hidden" name="_csrf" value="<?= e($csrf) ?>">
            <?php foreach ($SETTINGS as $group => $fields): ?>
                <div class="card pad form-grid">
                    <h2 class="full"><?= e($group) ?></h2>
                    <?php foreach ($fields as $k => $label): ?>
                        <label class="<?= $k === 'meta_description' ? 'full' : '' ?>"><span><?= e($label) ?></span>
                            <?php if ($k === 'meta_description'): ?>
                                <textarea name="<?= $k ?>" rows="3"><?= e(setting($k)) ?></textarea>
                            <?php else: ?>
                                <input type="<?= strpos($k, 'stat_') === 0 ? 'number' : 'text' ?>" name="<?= $k ?>" value="<?= e(setting($k)) ?>">
                            <?php endif; ?>
                        </label>
                    <?php endforeach; ?>
                </div>
            <?php endforeach; ?>
            <button class="btn btn-primary sticky-save" type="submit"><i class="fa-solid fa-floppy-disk"></i> Save Settings</button>
        </form>
<?php break;

case 'account': ?>
        <?php if (!empty($accError)): ?><div class="alert err"><?= e($accError) ?></div><?php endif; ?>
        <form method="post" class="card pad form-grid narrow">
            <input type="hidden" name="_csrf" value="<?= e($csrf) ?>">
            <label><span>Name</span><input type="text" name="name" value="<?= e($me['name']) ?>" required></label>
            <label><span>Login email</span><input type="email" name="email" value="<?= e($me['email']) ?>" required></label>
            <label class="full"><span>New password (leave empty to keep current)</span><input type="password" name="new_password" minlength="8" autocomplete="new-password"></label>
            <label class="full"><span>Current password *</span><input type="password" name="current_password" required autocomplete="current-password"></label>
            <div class="full"><button class="btn btn-primary" type="submit"><i class="fa-solid fa-floppy-disk"></i> Update Account</button></div>
        </form>
<?php break;
endswitch; ?>
    </main>
</div>
<script>
(function () {
    var d = document, root = d.documentElement;
    d.addEventListener('click', function (e) {
        var t = e.target;
        if (t.closest('[data-theme-toggle]')) {
            var n = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
            root.setAttribute('data-theme', n);
            try { localStorage.setItem('theme', n); } catch (x) {}
        }
        if (t.closest('[data-open-side]')) d.body.classList.add('side-open');
        if (t.closest('[data-close-side]')) d.body.classList.remove('side-open');
    });
    d.addEventListener('submit', function (e) {
        var msg = e.target.getAttribute('data-confirm');
        if (msg && !confirm(msg)) e.preventDefault();
    });
    d.querySelectorAll('[data-icon-input]').forEach(function (inp) {
        var i = inp.previousElementSibling.firstElementChild;
        inp.addEventListener('input', function () { i.className = inp.value; });
    });
    d.querySelectorAll('.color-in input').forEach(function (inp) {
        inp.addEventListener('input', function () { inp.nextElementSibling.textContent = inp.value; });
    });
    var al = d.querySelector('[data-autohide]');
    if (al) setTimeout(function () { al.classList.add('hide'); }, 3500);
})();
</script>
</body>
</html>

<?php
/**
 * Admin panel — dashboard, messages, content CRUD, settings, account.
 */
declare(strict_types=1);

require dirname(__DIR__) . '/includes/bootstrap.php';

if (!is_installed()) {
    header('Location: ../install/');
    exit;
}

header('X-Frame-Options: SAMEORIGIN');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

$self = base_path() . 'admin/';

function admin_url(string $a = 'dashboard', array $params = []): string
{
    global $self;
    return $self . '?' . http_build_query(['a' => $a] + $params);
}

function redirect(string $to): void
{
    header('Location: ' . $to);
    exit;
}

function flash(?string $msg = null, string $type = 'ok')
{
    if ($msg !== null) {
        $_SESSION['flash'] = [$msg, $type];
        return null;
    }
    $f = $_SESSION['flash'] ?? null;
    unset($_SESSION['flash']);
    return $f;
}

function user(): ?array
{
    static $u = false;
    if ($u === false) {
        $u = empty($_SESSION['uid']) ? null : row('SELECT id, name, email FROM users WHERE id = ?', [(int) $_SESSION['uid']]);
    }
    return $u;
}

/* ------------------------------------------------------- content types */
$TYPES = [
    'services' => [
        'label' => 'Services', 'icon' => 'fa-solid fa-layer-group', 'order' => 'sort, id',
        'cols' => ['title' => 'Title', 'summary' => 'Summary', 'sort' => 'Order', 'active' => 'Visible'],
        'fields' => [
            'title'    => ['text', 'Title', true],
            'slug'     => ['text', 'URL slug (leave empty to generate)', false],
            'icon'     => ['icon', 'Icon (Font Awesome class)', false, 'fa-solid fa-code'],
            'color'    => ['color', 'Color', false, '#6366f1'],
            'summary'  => ['text', 'Short summary', false],
            'body'     => ['textarea', 'Description (one paragraph per line)', false],
            'features' => ['textarea', 'Features (one per line)', false],
            'sort'     => ['number', 'Sort order', false, '0'],
            'active'   => ['bool', 'Visible on website', false, '1'],
        ],
    ],
    'projects' => [
        'label' => 'Projects', 'icon' => 'fa-solid fa-briefcase', 'order' => 'sort, id',
        'cols' => ['title' => 'Title', 'label' => 'Type', 'sort' => 'Order', 'active' => 'Visible'],
        'fields' => [
            'title'    => ['text', 'Title', true],
            'category' => ['select', 'Filter category', true, 'web', ['web' => 'Website', 'app' => 'Mobile App', 'uiux' => 'UI/UX']],
            'label'    => ['text', 'Label (e.g. Web Development)', false],
            'color'    => ['color', 'Thumbnail color', false, '#6366f1'],
            'summary'  => ['text', 'Short summary', false],
            'link'     => ['url', 'Live link (optional)', false],
            'sort'     => ['number', 'Sort order', false, '0'],
            'active'   => ['bool', 'Visible on website', false, '1'],
        ],
    ],
    'pricing' => [
        'label' => 'Pricing', 'icon' => 'fa-solid fa-tags', 'order' => 'sort, id',
        'cols' => ['name' => 'Plan', 'monthly' => 'Monthly $', 'yearly' => 'Yearly $', 'popular' => 'Popular'],
        'fields' => [
            'name'     => ['text', 'Plan name', true],
            'tagline'  => ['text', 'Tagline', false],
            'monthly'  => ['number', 'Monthly price ($)', false, '0'],
            'yearly'   => ['number', 'Yearly price ($)', false, '0'],
            'features' => ['textarea', 'Features (one per line)', false],
            'popular'  => ['bool', 'Mark as "Most Popular"', false, '0'],
            'sort'     => ['number', 'Sort order', false, '0'],
        ],
    ],
    'team' => [
        'label' => 'Team', 'icon' => 'fa-solid fa-user-group', 'order' => 'sort, id',
        'cols' => ['name' => 'Name', 'role' => 'Role', 'sort' => 'Order'],
        'fields' => [
            'name'  => ['text', 'Name', true],
            'role'  => ['text', 'Role / position', false],
            'color' => ['color', 'Avatar color', false, '#6366f1'],
            'sort'  => ['number', 'Sort order', false, '0'],
        ],
    ],
];

$SETTINGS = [
    'General' => [
        'site_name' => 'Site name', 'tagline' => 'Tagline', 'meta_description' => 'SEO meta description',
        'hero_video' => 'Hero "Watch Video" YouTube link (optional)',
    ],
    'Contact' => ['email' => 'Email', 'phone' => 'Phone', 'address' => 'Address / location'],
    'Statistics' => [
        'stat_years' => 'Years of experience', 'stat_projects' => 'Projects completed',
        'stat_clients' => 'Happy clients', 'stat_satisfaction' => 'Client satisfaction %',
    ],
    'Social links' => ['facebook' => 'Facebook URL', 'twitter' => 'X / Twitter URL', 'linkedin' => 'LinkedIn URL', 'youtube' => 'YouTube URL', 'github' => 'GitHub URL'],
];

/* --------------------------------------------------------------- router */
$a = (string) ($_GET['a'] ?? 'dashboard');
$isPost = $_SERVER['REQUEST_METHOD'] === 'POST';

if ($isPost && !csrf_check()) {
    flash('Your session expired. Please try again.', 'err');
    redirect($a === 'login' ? admin_url('login') : admin_url($a, array_intersect_key($_GET, ['t' => 1, 'id' => 1])));
}

if ($a === 'logout') {
    if ($isPost) {
        $_SESSION = [];
        session_regenerate_id(true);
    }
    redirect(admin_url('login'));
}

if ($a === 'login' || !user()) {
    $error = '';
    if ($isPost && $a === 'login') {
        $fails = (int) ($_SESSION['login_fails'] ?? 0);
        $lockUntil = (int) ($_SESSION['login_lock'] ?? 0);
        if ($lockUntil > time()) {
            $error = 'Too many attempts. Try again in ' . ($lockUntil - time()) . ' seconds.';
        } else {
            $u = row('SELECT * FROM users WHERE email = ?', [strtolower(trim((string) ($_POST['email'] ?? '')))]);
            if ($u && password_verify((string) ($_POST['password'] ?? ''), $u['password'])) {
                session_regenerate_id(true);
                $_SESSION['uid'] = (int) $u['id'];
                unset($_SESSION['login_fails'], $_SESSION['login_lock']);
                if (password_needs_rehash($u['password'], PASSWORD_DEFAULT)) {
                    q('UPDATE users SET password = ? WHERE id = ?', [password_hash((string) $_POST['password'], PASSWORD_DEFAULT), $u['id']]);
                }
                redirect(admin_url());
            }
            $fails++;
            $_SESSION['login_fails'] = $fails;
            if ($fails >= 5) {
                $_SESSION['login_lock'] = time() + 60 * min(15, $fails - 4);
            }
            usleep(400000);
            $error = 'Invalid email or password.';
        }
    }
    if (user() && $a === 'login') {
        redirect(admin_url());
    }
    include __DIR__ . '/login.php';
    exit;
}

$me = user();
$view = '';
$title = 'Dashboard';

switch ($a) {
    case 'messages':
        if ($isPost) {
            $id = (int) ($_POST['id'] ?? 0);
            if (($_POST['do'] ?? '') === 'delete') {
                q('DELETE FROM messages WHERE id = ?', [$id]);
                flash('Message deleted.');
            } elseif (($_POST['do'] ?? '') === 'read_all') {
                q('UPDATE messages SET is_read = 1');
                flash('All messages marked as read.');
            } elseif (($_POST['do'] ?? '') === 'unread') {
                q('UPDATE messages SET is_read = 0 WHERE id = ?', [$id]);
            }
            redirect(admin_url('messages'));
        }
        if (isset($_GET['id'])) {
            $msg = row('SELECT * FROM messages WHERE id = ?', [(int) $_GET['id']]);
            if (!$msg) {
                redirect(admin_url('messages'));
            }
            if (!$msg['is_read']) {
                q('UPDATE messages SET is_read = 1 WHERE id = ?', [$msg['id']]);
            }
            $title = 'Message';
            $view = 'message';
        } else {
            $title = 'Messages';
            $view = 'messages';
            $messages = rows('SELECT * FROM messages ORDER BY id DESC LIMIT 500');
        }
        break;

    case 'list':
    case 'edit':
        $t = (string) ($_GET['t'] ?? '');
        if (!isset($TYPES[$t])) {
            redirect(admin_url());
        }
        $type = $TYPES[$t];
        $id = (int) ($_GET['id'] ?? 0);

        if ($isPost && ($_POST['do'] ?? '') === 'delete') {
            q("DELETE FROM $t WHERE id = ?", [(int) $_POST['id']]);
            cache_clear();
            flash($type['label'] . ': item deleted.');
            redirect(admin_url('list', ['t' => $t]));
        }

        if ($a === 'edit') {
            $item = $id ? row("SELECT * FROM $t WHERE id = ?", [$id]) : null;
            if ($id && !$item) {
                redirect(admin_url('list', ['t' => $t]));
            }
            $formError = '';
            if ($isPost) {
                $vals = [];
                foreach ($type['fields'] as $name => $f) {
                    $raw = $_POST[$name] ?? '';
                    $raw = is_string($raw) ? trim($raw) : '';
                    switch ($f[0]) {
                        case 'bool':
                            $v = isset($_POST[$name]) ? 1 : 0;
                            break;
                        case 'number':
                            $v = (int) $raw;
                            break;
                        case 'color':
                            $v = preg_match('/^#[0-9a-fA-F]{6}$/', $raw) ? $raw : $f[3];
                            break;
                        case 'select':
                            $v = isset($f[4][$raw]) ? $raw : $f[3];
                            break;
                        case 'url':
                            $v = ($raw === '' || preg_match('~^https?://~i', $raw)) ? $raw : 'https://' . $raw;
                            break;
                        case 'icon':
                            $v = preg_replace('/[^a-z0-9 -]/', '', strtolower($raw)) ?: $f[3];
                            break;
                        default:
                            $v = $raw;
                    }
                    if (!empty($f[2]) && $v === '') {
                        $formError = $f[1] . ' is required.';
                    }
                    $vals[$name] = $v;
                }
                if (array_key_exists('slug', $vals)) {
                    $vals['slug'] = slugify($vals['slug'] !== '' ? $vals['slug'] : $vals['title']);
                    $dup = row("SELECT id FROM $t WHERE slug = ? AND id <> ?", [$vals['slug'], $id]);
                    if ($dup) {
                        $vals['slug'] .= '-' . substr(bin2hex(random_bytes(2)), 0, 4);
                    }
                }
                if ($formError === '') {
                    $cols = array_keys($vals);
                    if ($id) {
                        q("UPDATE $t SET " . implode(', ', array_map(function ($c) { return "$c = ?"; }, $cols)) . ' WHERE id = ?', array_merge(array_values($vals), [$id]));
                    } else {
                        q("INSERT INTO $t (" . implode(', ', $cols) . ') VALUES (' . implode(', ', array_fill(0, count($cols), '?')) . ')', array_values($vals));
                    }
                    cache_clear();
                    flash($type['label'] . ': saved successfully.');
                    redirect(admin_url('list', ['t' => $t]));
                }
                $item = $vals + ['id' => $id];
            }
            $title = ($id ? 'Edit ' : 'Add ') . rtrim($type['label'], 's');
            $view = 'edit';
        } else {
            $items = rows("SELECT * FROM $t ORDER BY " . $type['order']);
            $title = $type['label'];
            $view = 'list';
        }
        break;

    case 'settings':
        if ($isPost) {
            $sql = config('db')['driver'] === 'sqlite'
                ? 'INSERT OR REPLACE INTO settings (k, v) VALUES (?, ?)'
                : 'REPLACE INTO settings (k, v) VALUES (?, ?)';
            foreach ($SETTINGS as $group) {
                foreach ($group as $k => $label) {
                    q($sql, [$k, trim((string) ($_POST[$k] ?? ''))]);
                }
            }
            cache_clear();
            flash('Settings saved.');
            redirect(admin_url('settings'));
        }
        $title = 'Settings';
        $view = 'settings';
        break;

    case 'account':
        $accError = '';
        if ($isPost) {
            $full = row('SELECT * FROM users WHERE id = ?', [$me['id']]);
            $name = trim((string) ($_POST['name'] ?? ''));
            $email = strtolower(trim((string) ($_POST['email'] ?? '')));
            $new = (string) ($_POST['new_password'] ?? '');
            if (!password_verify((string) ($_POST['current_password'] ?? ''), $full['password'])) {
                $accError = 'Current password is incorrect.';
            } elseif ($name === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
                $accError = 'Enter a valid name and email.';
            } elseif ($new !== '' && strlen($new) < 8) {
                $accError = 'New password must be at least 8 characters.';
            } elseif (row('SELECT id FROM users WHERE email = ? AND id <> ?', [$email, $me['id']])) {
                $accError = 'That email is used by another account.';
            } else {
                q('UPDATE users SET name = ?, email = ? WHERE id = ?', [$name, $email, $me['id']]);
                if ($new !== '') {
                    q('UPDATE users SET password = ? WHERE id = ?', [password_hash($new, PASSWORD_DEFAULT), $me['id']]);
                    session_regenerate_id(true);
                }
                flash('Account updated.');
                redirect(admin_url('account'));
            }
        }
        $title = 'My Account';
        $view = 'account';
        break;

    case 'cache':
        if ($isPost) {
            cache_clear();
            flash('Cache cleared.');
        }
        redirect(admin_url());
        break;

    default:
        $a = 'dashboard';
        $view = 'dashboard';
        $days = [];
        for ($i = 13; $i >= 0; $i--) {
            $days[date('Y-m-d', strtotime("-$i day"))] = 0;
        }
        foreach (rows('SELECT day, hits FROM visits WHERE day >= ?', [array_key_first($days)]) as $r) {
            if (isset($days[$r['day']])) {
                $days[$r['day']] = (int) $r['hits'];
            }
        }
        $stats = [
            ['Visitors Today', $days[date('Y-m-d')], 'fa-solid fa-eye', '#6366f1'],
            ['Visitors (14 days)', array_sum($days), 'fa-solid fa-chart-line', '#10b981'],
            ['Projects', (int) row('SELECT COUNT(*) c FROM projects')['c'], 'fa-solid fa-briefcase', '#f97316'],
            ['New Messages', (int) row('SELECT COUNT(*) c FROM messages WHERE is_read = 0')['c'], 'fa-solid fa-envelope', '#ec4899'],
        ];
        $recent = rows('SELECT * FROM messages ORDER BY id DESC LIMIT 6');
}

$unread = (int) row('SELECT COUNT(*) c FROM messages WHERE is_read = 0')['c'];
$flash = flash();
include __DIR__ . '/layout.php';

<?php
/**
 * Generic admin CRUD engine.
 * Resource definitions (fields, list display, hooks) drive the list view,
 * the edit form and the save/delete API — one tested code path for
 * categories, services, products, news, team, payment methods and socials.
 */
defined('APP') || exit;
require_once ROOT . '/core/admin-lang.php';
require_once ROOT . '/core/upload.php';

function admin_resources(): array
{
    static $r = null;
    if ($r !== null) return $r;
    $opts = fn(string $sql) => fn() => array_column(rows($sql), 'label', 'id');
    $bi = function (string $key, string $label, string $type = 'text', array $extra = []): array {
        return [$key . '_en' => ['type' => $type, 'label' => $label . ' (English)'] + $extra, $key . '_bn' => ['type' => $type, 'label' => $label . ' (বাংলা)'] + array_diff_key($extra, ['required' => 1])];
    };
    $r = [
        'service_categories' => [
            'table' => 'service_categories', 'perm' => 'services', 'title' => 'Category', 'order' => 'sort, id', 'search' => ['name_en', 'name_bn', 'slug'],
            'list' => ['title' => 'name_en', 'sub' => 'name_bn', 'icon' => 'icon'], 'toggles' => ['status'],
            'fields' => [
                ...$bi('name', 'Name', 'text', ['required' => true, 'max' => 150]),
                'slug' => ['type' => 'slug', 'label' => 'Slug (URL)', 'from' => 'name_en'],
                'icon' => ['type' => 'icon', 'label' => 'Font Awesome icon', 'default' => 'fa-solid fa-folder'],
                'sort' => ['type' => 'number', 'label' => 'Order', 'default' => 0],
                'status' => ['type' => 'bool', 'label' => 'Visible', 'default' => 1],
            ],
        ],
        'services' => [
            'table' => 'services', 'perm' => 'services', 'title' => 'Service', 'order' => 'sort, id', 'search' => ['title_en', 'title_bn', 'slug'],
            'filter' => ['field' => 'category_id', 'label' => 'All categories', 'options' => $opts('SELECT id, name_en AS label FROM service_categories ORDER BY sort, id')],
            'list' => ['title' => 'title_en', 'sub' => 'short_en', 'icon' => 'icon', 'image' => 'icon_image', 'badges' => fn($x) => array_filter([$x['is_featured'] ? ['Featured', ''] : null, $x['price_from'] !== null ? ['from $' . (float)$x['price_from'], 'muted'] : null])],
            'toggles' => ['status', 'is_featured'],
            'view' => fn($x) => '/services/' . $x['slug'],
            'fields' => [
                ...$bi('title', 'Title', 'text', ['required' => true, 'max' => 190]),
                'slug' => ['type' => 'slug', 'label' => 'Slug (URL)', 'from' => 'title_en'],
                'category_id' => ['type' => 'select', 'label' => 'Category', 'options' => $opts('SELECT id, name_en AS label FROM service_categories ORDER BY sort, id'), 'empty' => '— None —'],
                ...$bi('short', 'Short description', 'textarea', ['max' => 400, 'rows' => 2]),
                ...$bi('description', 'Full description', 'richtext'),
                ...$bi('features', 'Features (one per line)', 'lines'),
                'icon' => ['type' => 'icon', 'label' => 'Font Awesome icon', 'default' => 'fa-solid fa-code'],
                'icon_image' => ['type' => 'image', 'label' => 'Custom icon image (optional, replaces FA icon)'],
                'image' => ['type' => 'image', 'label' => 'Cover image'],
                'price_from' => ['type' => 'number', 'label' => 'Starting price (USD, blank = from products)', 'step' => '0.01', 'nullable' => true],
                'is_featured' => ['type' => 'bool', 'label' => 'Featured on home page'],
                'orderable' => ['type' => 'bool', 'label' => 'Orders enabled (Buy Now)', 'default' => 1],
                'status' => ['type' => 'bool', 'label' => 'Visible', 'default' => 1],
                'sort' => ['type' => 'number', 'label' => 'Order', 'default' => 0],
            ],
        ],
        'products' => [
            'table' => 'products', 'perm' => 'services', 'title' => 'Product', 'order' => 'service_id, sort, id', 'search' => ['name_en', 'name_bn', 'slug'],
            'filter' => ['field' => 'service_id', 'label' => 'All services', 'options' => $opts('SELECT id, title_en AS label FROM services ORDER BY sort, id')],
            'list' => ['title' => 'name_en', 'sub' => fn($x) => '$' . (float)$x['price_usd'] . ($x['price_bdt'] ? ' · ৳' . (float)$x['price_bdt'] : '') . ((float)$x['discount_percent'] ? ' · -' . (float)$x['discount_percent'] . '%' : ''), 'icon' => 'icon', 'image' => 'image',
                'badges' => fn($x) => array_filter([$x['is_featured'] ? ['Popular', ''] : null])],
            'toggles' => ['status', 'is_featured'],
            'fields' => [
                'service_id' => ['type' => 'select', 'label' => 'Service', 'options' => $opts('SELECT id, title_en AS label FROM services ORDER BY sort, id'), 'required' => true],
                ...$bi('name', 'Product name', 'text', ['required' => true, 'max' => 190]),
                'slug' => ['type' => 'slug', 'label' => 'Slug', 'from' => 'name_en'],
                'price_usd' => ['type' => 'number', 'label' => 'Price (USD)', 'step' => '0.01', 'required' => true, 'min' => 0],
                'price_bdt' => ['type' => 'number', 'label' => 'Price (BDT) — blank = auto from rate', 'step' => '1', 'nullable' => true, 'min' => 0],
                'discount_percent' => ['type' => 'number', 'label' => 'Discount %', 'step' => '0.01', 'default' => 0, 'min' => 0, 'max' => 100],
                ...$bi('short', 'Short description', 'textarea', ['max' => 400, 'rows' => 2]),
                ...$bi('description', 'Full description', 'richtext'),
                ...$bi('features', 'Features (one per line)', 'lines'),
                'demo_url' => ['type' => 'url', 'label' => 'Demo URL'],
                'delivery_days' => ['type' => 'number', 'label' => 'Delivery time (days)', 'nullable' => true],
                'support_months' => ['type' => 'number', 'label' => 'Support period (months)', 'nullable' => true],
                'icon' => ['type' => 'icon', 'label' => 'Icon'],
                'image' => ['type' => 'image', 'label' => 'Image'],
                'is_featured' => ['type' => 'bool', 'label' => 'Highlight as popular'],
                'status' => ['type' => 'bool', 'label' => 'Available', 'default' => 1],
                'sort' => ['type' => 'number', 'label' => 'Order', 'default' => 0],
            ],
        ],
        'news_categories' => [
            'table' => 'news_categories', 'perm' => 'news', 'title' => 'News category', 'order' => 'sort, id', 'search' => ['name_en', 'name_bn'],
            'list' => ['title' => 'name_en', 'sub' => 'name_bn', 'icon' => 'icon'],
            'fields' => [
                ...$bi('name', 'Name', 'text', ['required' => true, 'max' => 150]),
                'slug' => ['type' => 'slug', 'label' => 'Slug', 'from' => 'name_en'],
                'icon' => ['type' => 'icon', 'label' => 'Icon', 'default' => 'fa-solid fa-hashtag'],
                'sort' => ['type' => 'number', 'label' => 'Order', 'default' => 0],
            ],
        ],
        'news' => [
            'table' => 'news', 'perm' => 'news', 'title' => 'Post', 'order' => 'publish_at DESC, id DESC', 'search' => ['title_en', 'title_bn', 'tags'],
            'filter' => ['field' => 'status', 'label' => 'All statuses', 'options' => fn() => ['published' => 'Published', 'draft' => 'Draft']],
            'list' => ['title' => fn($x) => ($x['emoji'] ? $x['emoji'] . ' ' : '') . ($x['title_en'] ?: $x['title_bn']), 'sub' => fn($x) => date('M j, Y H:i', strtotime($x['publish_at'])) . ' · ' . (lang() === 'bn' ? num((int)$x['views']) . ' ভিউ' : (int)$x['views'] . ' views'), 'icon' => 'icon', 'image' => 'image',
                'badges' => fn($x) => array_filter([[$x['status'] === 'published' ? (strtotime($x['publish_at']) > time() ? 'Scheduled' : 'Published') : 'Draft', $x['status'] === 'published' ? 'success' : 'muted'], $x['is_featured'] ? ['Featured', ''] : null])],
            'toggles' => ['is_featured'],
            'view' => fn($x) => '/news/' . $x['id'],
            'fields' => [
                ...$bi('title', 'Title', 'text', ['max' => 255]),
                'slug' => ['type' => 'slug', 'label' => 'Slug', 'from' => 'title_en'],
                'category_id' => ['type' => 'select', 'label' => 'Category', 'options' => $opts('SELECT id, name_en AS label FROM news_categories ORDER BY sort, id'), 'empty' => '— None —'],
                ...$bi('content', 'Content', 'richtext'),
                ...$bi('excerpt', 'Excerpt (optional)', 'textarea', ['max' => 500, 'rows' => 2]),
                'image' => ['type' => 'image', 'label' => 'Featured image'],
                'emoji' => ['type' => 'text', 'label' => 'Emoji (shown in lists)', 'max' => 16],
                'icon' => ['type' => 'icon', 'label' => 'Icon (when no emoji)', 'default' => 'fa-regular fa-newspaper'],
                'tags' => ['type' => 'text', 'label' => 'Tags (comma separated)', 'max' => 255],
                'status' => ['type' => 'select', 'label' => 'Status', 'options' => fn() => ['published' => 'Published', 'draft' => 'Draft'], 'default' => 'published'],
                'publish_at' => ['type' => 'datetime', 'label' => 'Publish date (future = scheduled)'],
                'is_featured' => ['type' => 'bool', 'label' => 'Featured post'],
                'seo_title' => ['type' => 'text', 'label' => 'SEO title', 'max' => 190],
                'seo_description' => ['type' => 'textarea', 'label' => 'SEO description', 'max' => 300, 'rows' => 2],
                'seo_keywords' => ['type' => 'text', 'label' => 'SEO keywords', 'max' => 255],
                '__notify' => ['type' => 'bool', 'label' => 'Send notification to all users when published (push + in-app)', 'virtual' => true],
                '__notify_email' => ['type' => 'bool', 'label' => '…also email it', 'virtual' => true],
            ],
            'before_save' => function (array &$d, ?int $id) {
                if (trim(strip_tags((string)$d['title_en'])) === '' && trim((string)$d['title_bn']) === '') fail('Enter a title in at least one language.', 422, ['title_en' => 'Required']);
                if (!$id) $d['author_id'] = user()['id'];
                if (empty($d['publish_at'])) $d['publish_at'] = date('Y-m-d H:i:s');
            },
            'after_save' => function (int $id, array $d, bool $new) {
                if (!empty($_POST['__notify']) && $d['status'] === 'published' && strtotime($d['publish_at']) <= time()) {
                    $count = notify_dispatch('all', [], ['type' => 'news', 'icon' => 'fa-newspaper', 'link' => '/news/' . $id,
                        'title_en' => trim(($d['emoji'] ? $d['emoji'] . ' ' : '') . ($d['title_en'] ?: $d['title_bn'])), 'title_bn' => trim(($d['emoji'] ? $d['emoji'] . ' ' : '') . ($d['title_bn'] ?: $d['title_en'])),
                        'body_en' => mb_substr((string)($d['excerpt_en'] ?: ''), 0, 200), 'body_bn' => mb_substr((string)($d['excerpt_bn'] ?: ''), 0, 200)],
                        ['push' => true, 'email' => !empty($_POST['__notify_email']), 'created_by' => user()['id']]);
                    audit('notification_send', 'news', $id, "News notification to $count users");
                }
                if ($new && $d['status'] === 'published') audit('news_publish', 'news', $id, (string)($d['title_en'] ?: $d['title_bn']));
            },
        ],
        'team_members' => [
            'table' => 'team_members', 'perm' => 'team', 'title' => 'Team member', 'order' => 'sort, id', 'search' => ['name', 'position_en', 'skills'],
            'list' => ['title' => 'name', 'sub' => 'position_en', 'image' => 'photo', 'icon' => fn() => 'fa-solid fa-user', 'badges' => fn($x) => array_filter([$x['is_vip'] ? ['VIP', 'vip'] : null])],
            'toggles' => ['status', 'is_vip'],
            'fields' => [
                'name' => ['type' => 'text', 'label' => 'Name', 'required' => true, 'max' => 120],
                ...$bi('position', 'Position', 'text', ['max' => 120]),
                ...$bi('bio', 'Description', 'textarea', ['rows' => 3]),
                'photo' => ['type' => 'image', 'label' => 'Profile photo'],
                'skills' => ['type' => 'text', 'label' => 'Skills (comma separated)', 'max' => 500],
                'email' => ['type' => 'email', 'label' => 'Email'],
                'phone' => ['type' => 'text', 'label' => 'Phone', 'max' => 40],
                'whatsapp' => ['type' => 'text', 'label' => 'WhatsApp number', 'max' => 40],
                'website' => ['type' => 'url', 'label' => 'Website / portfolio'],
                'cv_file' => ['type' => 'file', 'label' => 'CV (PDF, PNG or JPG)'],
                'is_vip' => ['type' => 'bool', 'label' => 'VIP badge animation'],
                'status' => ['type' => 'bool', 'label' => 'Visible', 'default' => 1],
                'sort' => ['type' => 'number', 'label' => 'Order', 'default' => 0],
            ],
        ],
        'payment_methods' => [
            'table' => 'payment_methods', 'perm' => 'settings', 'title' => 'Payment method', 'order' => 'sort, id', 'search' => ['name', 'code'],
            'list' => ['title' => 'name', 'sub' => fn($x) => $x['code'] . ' · ' . $x['currency'], 'image' => 'logo', 'icon' => fn() => 'fa-solid fa-wallet'],
            'toggles' => ['enabled'],
            'fields' => [
                'code' => ['type' => 'slug', 'label' => 'Code (unique, e.g. bkash, usdt_trc20)', 'from' => 'name', 'underscore' => true],
                'name' => ['type' => 'text', 'label' => 'Display name', 'required' => true, 'max' => 80],
                'currency' => ['type' => 'select', 'label' => 'Currency the customer pays in', 'options' => fn() => ['USD' => 'USD / USDT', 'BDT' => 'BDT'], 'default' => 'USD'],
                'enabled' => ['type' => 'bool', 'label' => 'Enabled'],
                'details.address' => ['type' => 'text', 'label' => 'Wallet address (crypto)'],
                'details.network' => ['type' => 'text', 'label' => 'Network (e.g. TRON TRC20, BNB Smart Chain BEP20)'],
                'details.number' => ['type' => 'text', 'label' => 'Account number (bKash)'],
                'details.account_type' => ['type' => 'text', 'label' => 'Account type (Personal / Merchant / Agent)'],
                'details.pay_id' => ['type' => 'text', 'label' => 'Binance Pay ID'],
                'details.pay_name' => ['type' => 'text', 'label' => 'Binance Pay name'],
                'details.qr' => ['type' => 'image', 'label' => 'QR code image'],
                'details.link' => ['type' => 'url', 'label' => 'Payment link (https)'],
                ...$bi('instructions', 'Instructions', 'textarea', ['rows' => 3]),
                'logo' => ['type' => 'image', 'label' => 'Official logo (optional)'],
                'sort' => ['type' => 'number', 'label' => 'Order', 'default' => 0],
            ],
        ],
        'social_links' => [
            'table' => 'social_links', 'perm' => 'settings', 'title' => 'Social link', 'order' => 'sort, id', 'search' => ['platform', 'label'],
            'list' => ['title' => 'label', 'sub' => fn($x) => $x['url'] ?: 'No URL set', 'icon' => 'icon'],
            'toggles' => ['enabled'],
            'fields' => [
                'platform' => ['type' => 'slug', 'label' => 'Platform key', 'from' => 'label'],
                'label' => ['type' => 'text', 'label' => 'Label', 'required' => true, 'max' => 60],
                'icon' => ['type' => 'icon', 'label' => 'Icon', 'default' => 'fa-solid fa-link'],
                'url' => ['type' => 'url', 'label' => 'URL'],
                'enabled' => ['type' => 'bool', 'label' => 'Enabled'],
                'sort' => ['type' => 'number', 'label' => 'Order', 'default' => 0],
            ],
        ],
    ];
    return $r;
}

function crud_res(string $name): array
{
    $r = admin_resources()[$name] ?? null;
    if (!$r) abort(404);
    if (!can($r['perm'])) abort(403);
    return $r;
}

function crud_val(array $row, string|callable|null $spec): string
{
    if ($spec === null) return '';
    if (is_callable($spec) && !is_string($spec)) return (string)$spec($row);
    return (string)($row[$spec] ?? '');
}

/** List or form, depending on ?edit= / ?new=. $base is the page URL incl. tab. */
function crud_render(string $name, string $base): void
{
    $r = crud_res($name);
    $editId = input_int('edit');
    if ($editId || input('new') === '1') {
        $row = $editId ? row('SELECT * FROM ' . ident($r['table']) . ' WHERE id = ?', [$editId]) : null;
        if ($editId && !$row) abort(404);
        crud_form($name, $r, $row, $base);
        return;
    }
    $q = mb_substr(input('q'), 0, 80);
    $where = '1';
    $p = [];
    if ($q !== '') {
        $where .= ' AND (' . implode(' OR ', array_map(fn($c) => ident($c) . ' LIKE ?', $r['search'])) . ')';
        foreach ($r['search'] as $_) $p[] = '%' . addcslashes($q, '%_\\') . '%';
    }
    $fv = input('f');
    if (!empty($r['filter']) && $fv !== '') { $where .= ' AND ' . ident($r['filter']['field']) . ' = ?'; $p[] = $fv; }
    $pg = paginate((int)val('SELECT COUNT(*) FROM ' . ident($r['table']) . " WHERE $where", $p), 25, max(1, input_int('page', 1)));
    $items = rows('SELECT * FROM ' . ident($r['table']) . " WHERE $where ORDER BY {$r['order']} LIMIT {$pg['per']} OFFSET {$pg['offset']}", $p);
    $sep = str_contains($base, '?') ? '&' : '?';
    ?>
    <form class="toolbar" method="get" action="<?= e(url(parse_url($base, PHP_URL_PATH))) ?>" data-get-form>
      <?php parse_str((string)parse_url($base, PHP_URL_QUERY), $bq); foreach ($bq as $k => $v): ?><input type="hidden" name="<?= e($k) ?>" value="<?= e($v) ?>"><?php endforeach ?>
      <div class="input-icon grow"><i class="fa-solid fa-magnifying-glass"></i><input class="input" type="search" name="q" value="<?= e($q) ?>" placeholder="<?= e(at_search($r['title'])) ?>"></div>
      <?php if (!empty($r['filter'])): ?>
        <select class="select" name="f" data-autosubmit style="width:auto;max-width:220px"><option value=""><?= e($r['filter']['label']) ?></option>
          <?php foreach (($r['filter']['options'])() as $k => $v): ?><option value="<?= e($k) ?>" <?= (string)$fv === (string)$k ? 'selected' : '' ?>><?= e($v) ?></option><?php endforeach ?></select>
      <?php endif ?>
      <a class="btn" href="<?= e(url($base . $sep . 'new=1')) ?>"><i class="fa-solid fa-plus"></i><span class="hide-sm"><?= e(at_add($r['title'])) ?></span></a>
    </form>
    <p class="tiny muted mb-1"><?= lang() === 'bn' ? num($pg['total']) . 'টি আইটেম' : number_format($pg['total']) . ' item(s)' ?></p>
    <?php if (!$items): ?><div class="card empty"><div class="icon-box"><i class="fa-regular fa-folder-open"></i></div>Nothing here yet.</div><?php endif ?>
    <div class="list crud-list">
      <?php foreach ($items as $it):
          $img = !empty($r['list']['image']) ? crud_val($it, $r['list']['image']) : '';
          $icon = crud_val($it, $r['list']['icon'] ?? null); ?>
        <div class="list-row">
          <span class="icon-box"><?php if ($img): ?><img src="<?= e(media_url($img)) ?>" alt="" loading="lazy"><?php else: ?><i class="<?= e(fa($icon, 'fa-solid fa-circle')) ?>"></i><?php endif ?></span>
          <a class="grow" style="min-width:0;color:inherit" href="<?= e(url($base . $sep . 'edit=' . $it['id'])) ?>">
            <strong class="truncate" style="display:block;font-size:.92rem"><?= e(crud_val($it, $r['list']['title'])) ?></strong>
            <span class="tiny muted truncate" style="display:block"><?= e(crud_val($it, $r['list']['sub'] ?? null)) ?></span>
            <?php if (!empty($r['list']['badges'])): ?><span class="row wrap" style="gap:4px;margin-top:3px"><?php foreach (($r['list']['badges'])($it) as [$label, $cls]): ?><span class="badge <?= e($cls) ?>"><?= e($label) ?></span><?php endforeach ?></span><?php endif ?>
          </a>
          <?php foreach ($r['toggles'] ?? [] as $tg): ?>
            <label class="switch" title="<?= e($r['fields'][$tg]['label'] ?? $tg) ?>"><input type="checkbox" data-action="crud-toggle" data-res="<?= e($name) ?>" data-id="<?= (int)$it['id'] ?>" data-field="<?= e($tg) ?>" <?= $it[$tg] ? 'checked' : '' ?> aria-label="<?= e($r['fields'][$tg]['label'] ?? $tg) ?>"><span></span></label>
          <?php endforeach ?>
          <?php if (!empty($r['view'])): ?><a class="icon-btn" href="<?= e(url(($r['view'])($it))) ?>" target="_blank" rel="noopener" aria-label="View"><i class="fa-solid fa-arrow-up-right-from-square"></i></a><?php endif ?>
          <a class="icon-btn" href="<?= e(url($base . $sep . 'edit=' . $it['id'])) ?>" aria-label="Edit"><i class="fa-regular fa-pen-to-square"></i></a>
          <button class="icon-btn" style="color:var(--danger)" data-action="post" data-url="<?= e(url('/api/admin?action=crud_delete')) ?>" data-params='<?= e(json_encode(['res' => $name, 'id' => (int)$it['id']])) ?>' data-confirm="Delete this <?= e(strtolower($r['title'])) ?>? This cannot be undone." data-danger="1" aria-label="Delete"><i class="fa-regular fa-trash-can"></i></button>
        </div>
      <?php endforeach ?>
    </div>
    <?php admin_pager($pg, $base . $sep . http_build_query(array_filter(['q' => $q, 'f' => $fv])));
}

function admin_pager(array $pg, string $base): void
{
    if ($pg['pages'] <= 1) return;
    $sep = str_contains($base, '?') ? '&' : '?';
    echo '<nav class="pager">';
    if ($pg['page'] > 1) echo '<a class="btn btn-sm btn-ghost" href="' . e(url($base . $sep . 'page=' . ($pg['page'] - 1))) . '"><i class="fa-solid fa-chevron-left"></i></a>';
    echo '<span class="small muted">Page ' . $pg['page'] . ' / ' . $pg['pages'] . '</span>';
    if ($pg['page'] < $pg['pages']) echo '<a class="btn btn-sm btn-ghost" href="' . e(url($base . $sep . 'page=' . ($pg['page'] + 1))) . '"><i class="fa-solid fa-chevron-right"></i></a>';
    echo '</nav>';
}

/** Read a field's current value (supports "details.x" JSON sub-keys). */
function crud_current(?array $row, string $key, array $f): mixed
{
    if (!$row) return $f['default'] ?? '';
    if (str_starts_with($key, 'details.')) {
        $d = json_decode((string)($row['details'] ?? ''), true) ?: [];
        return $d[substr($key, 8)] ?? '';
    }
    return $row[$key] ?? '';
}

function crud_form(string $name, array $r, ?array $row, string $base): void
{
    $id = $row['id'] ?? 0;
    ?>
    <div class="row-between mb-2">
      <a class="btn btn-sm btn-ghost" href="<?= e(url($base)) ?>"><i class="fa-solid fa-arrow-left"></i>Back</a>
      <?php if ($id && !empty($r['view'])): ?><a class="btn btn-sm btn-soft" href="<?= e(url(($r['view'])($row))) ?>" target="_blank" rel="noopener"><i class="fa-solid fa-eye"></i>View</a><?php endif ?>
    </div>
    <form class="card card-pad-lg crud-form" method="post" action="<?= e(url('/api/admin?action=crud_save')) ?>" data-ajax enctype="multipart/form-data" novalidate>
      <?= csrf_field() ?>
      <input type="hidden" name="__res" value="<?= e($name) ?>">
      <input type="hidden" name="__id" value="<?= (int)$id ?>">
      <input type="hidden" name="__back" value="<?= e($base) ?>">
      <h2 style="font-size:1.05rem"><?= $id ? 'Edit' : 'New' ?> <?= e(strtolower($r['title'])) ?></h2>
      <div class="form-grid">
        <?php foreach ($r['fields'] as $key => $f) echo admin_field($key, $f, crud_current($row, $key, $f)); ?>
      </div>
      <div class="upload-progress"><i></i></div>
      <div class="form-actions"><button class="btn btn-lg" type="submit"><i class="fa-solid fa-floppy-disk"></i>Save</button></div>
    </form>
    <?php
}

/** Render one admin form field (shared with the settings screen). */
function admin_field(string $key, array $f, mixed $value): string
{
    $type = $f['type'];
    $id = 'f-' . preg_replace('~[^a-z0-9]+~i', '-', $key);
    $nameAttr = e($key);
    $req = !empty($f['required']) ? ' required' : '';
    $label = '<label class="label" for="' . $id . '">' . e($f['label']) . (!empty($f['required']) ? ' <span style="color:var(--danger)">*</span>' : '') . '</label>';
    $wide = in_array($type, ['richtext', 'textarea', 'lines', 'image', 'file', 'sections', 'info'], true) ? ' wide' : '';
    $v = (string)($value ?? '');
    $ro = !empty($f['readonly']) ? ' readonly' : '';
    $h = '<div class="form-group' . $wide . '">';
    switch ($type) {
        case 'bool':
            return '<div class="form-group"><label class="check switch-row"><span class="switch"><input type="checkbox" name="' . $nameAttr . '" value="1"' . ($v === '1' || $value === 1 || $value === true ? ' checked' : '') . '><span></span></span><span>' . e($f['label']) . '</span></label></div>';
        case 'textarea':
        case 'lines':
            $h .= $label . '<textarea class="textarea" id="' . $id . '" name="' . $nameAttr . '" rows="' . (int)($f['rows'] ?? ($type === 'lines' ? 5 : 4)) . '"' . (isset($f['max']) ? ' maxlength="' . (int)$f['max'] . '"' : '') . $req . $ro . '>' . e($v) . '</textarea>';
            if ($type === 'lines') $h .= '<p class="hint">One item per line.</p>';
            break;
        case 'richtext':
            $h .= $label . '<div class="rte" data-init="rte"><textarea name="' . $nameAttr . '" id="' . $id . '" hidden>' . e($v) . '</textarea></div>';
            break;
        case 'select':
            $opts = is_callable($f['options']) ? ($f['options'])() : $f['options'];
            $h .= $label . '<select class="select" id="' . $id . '" name="' . $nameAttr . '"' . $req . '>';
            if (isset($f['empty'])) $h .= '<option value="">' . e($f['empty']) . '</option>';
            foreach ($opts as $k => $o) $h .= '<option value="' . e($k) . '"' . ((string)$k === $v ? ' selected' : '') . '>' . e($o) . '</option>';
            $h .= '</select>';
            break;
        case 'image':
        case 'file':
            $isImg = $type === 'image';
            $h .= $label . '<div class="media-field" data-media-field>'
                . '<input type="hidden" name="' . $nameAttr . '" value="' . e($v) . '" data-media-value>'
                . '<div class="mf-preview">' . ($v && $isImg ? '<img src="' . e(media_url($v)) . '" alt="">' : ($v ? '<a href="' . e(media_url($v)) . '" target="_blank" rel="noopener"><i class="fa-regular fa-file-lines"></i> ' . e(basename($v)) . '</a>' : '<i class="fa-regular ' . ($isImg ? 'fa-image' : 'fa-file') . '"></i>')) . '</div>'
                . '<div class="mf-actions"><label class="btn btn-sm btn-soft"><i class="fa-solid fa-upload"></i>Upload<input type="file" name="__file[' . $nameAttr . ']" accept="' . ($isImg ? 'image/jpeg,image/png,image/webp' : '.pdf,.png,.jpg,.jpeg') . '" hidden data-mf-file></label>'
                . ($isImg ? '<button type="button" class="btn btn-sm btn-ghost" data-action="media-pick"><i class="fa-solid fa-photo-film"></i>Library</button>' : '')
                . '<button type="button" class="btn btn-sm btn-ghost" data-action="media-clear"' . ($v ? '' : ' hidden') . '><i class="fa-solid fa-xmark"></i>Remove</button></div></div>';
            break;
        case 'icon':
            $h .= $label . '<div class="row"><span class="icon-box" data-icon-preview><i class="' . e(fa($v, 'fa-solid fa-circle-question')) . '"></i></span>'
                . '<input class="input" id="' . $id . '" name="' . $nameAttr . '" value="' . e($v) . '" placeholder="fa-solid fa-code" list="fa-icons" data-icon-input maxlength="80"></div>'
                . '<p class="hint">Any <a href="https://fontawesome.com/search?o=r&m=free" target="_blank" rel="noopener">Font Awesome 6 free</a> class, e.g. <code>fa-brands fa-node-js</code>.</p>';
            break;
        case 'color':
            $h .= $label . '<div class="row"><input type="color" value="' . e($v ?: '#000000') . '" data-color-sync="' . $id . '" aria-label="' . e($f['label']) . '" style="width:48px;height:44px;border:0;background:none;padding:0;cursor:pointer">'
                . '<input class="input" id="' . $id . '" name="' . $nameAttr . '" value="' . e($v) . '" pattern="#[0-9a-fA-F]{6}" maxlength="7"></div>';
            break;
        case 'datetime':
            $dv = $v ? date('Y-m-d\TH:i', strtotime($v)) : '';
            $h .= $label . '<input class="input" type="datetime-local" id="' . $id . '" name="' . $nameAttr . '" value="' . e($dv) . '">';
            break;
        case 'secret':
            $h .= $label . '<input class="input" type="password" id="' . $id . '" name="' . $nameAttr . '" value="" autocomplete="new-password" placeholder="' . ($v !== '' ? '•••••••• (saved — leave blank to keep)' : 'Not set') . '"' . $ro . '>';
            break;
        case 'info':
            return '<div class="form-group wide"><span class="label">' . e($f['label']) . '</span><div class="hint" style="font-size:.86rem">' . ($f['html'] ?? '') . '</div></div>';
        case 'sections':
            $enabled = array_filter(array_map('trim', explode(',', $v)));
            $all = array_unique(array_merge($enabled, array_keys($f['options'])));
            $h .= '<span class="label">' . e($f['label']) . '</span><div class="list sections-list" data-sections>';
            foreach ($all as $sk) {
                if (!isset($f['options'][$sk])) continue;
                $h .= '<div class="list-row" data-section="' . e($sk) . '"><label class="switch"><input type="checkbox" value="' . e($sk) . '"' . (in_array($sk, $enabled, true) ? ' checked' : '') . '><span></span></label><span class="grow">' . e($f['options'][$sk]) . '</span>'
                    . '<button type="button" class="icon-btn" data-action="section-up" aria-label="Move up"><i class="fa-solid fa-arrow-up"></i></button><button type="button" class="icon-btn" data-action="section-down" aria-label="Move down"><i class="fa-solid fa-arrow-down"></i></button></div>';
            }
            $h .= '</div><input type="hidden" name="' . $nameAttr . '" value="' . e($v) . '" data-sections-value>';
            break;
        case 'slug':
            $h .= $label . '<input class="input" id="' . $id . '" name="' . $nameAttr . '" value="' . e($v) . '" data-slug-from="' . e($f['from'] ?? '') . '"' . (!empty($f['underscore']) ? ' data-slug-underscore' : '') . ' maxlength="120" placeholder="auto">';
            break;
        default: // text, number, email, url
            $it = in_array($type, ['number', 'email', 'url'], true) ? $type : 'text';
            $extra = '';
            foreach (['step', 'min', 'max'] as $a) if (isset($f[$a]) && $it === 'number') $extra .= ' ' . $a . '="' . e($f[$a]) . '"';
            if (isset($f['max']) && $it !== 'number') $extra .= ' maxlength="' . (int)$f['max'] . '"';
            $h .= $label . '<input class="input" type="' . $it . '" id="' . $id . '" name="' . $nameAttr . '" value="' . e($v) . '"' . $extra . $req . $ro . ($it === 'number' ? ' inputmode="decimal"' : '') . '>';
    }
    if (!empty($f['help'])) $h .= '<p class="hint">' . e($f['help']) . '</p>';
    return $h . '</div>';
}

/** Get an uploaded file for a field from the __file[...] array. */
function crud_file(string $key): ?array
{
    $F = $_FILES['__file'] ?? null;
    // (PHP only mangles dots in top-level names, so "__file[details.qr]" keeps its key)
    if (!$F || empty($F['name'][$key])) return null;
    return ['name' => $F['name'][$key], 'type' => $F['type'][$key], 'tmp_name' => $F['tmp_name'][$key], 'error' => $F['error'][$key], 'size' => $F['size'][$key]];
}

/** Validate + normalise one field value from the request. Returns [value, error|null]. */
function admin_field_value(string $key, array $f, mixed $current): array
{
    $type = $f['type'];
    // PHP converts "." to "_" in top-level POST keys
    $pkey = str_replace('.', '_', $key);
    $raw = $_POST[$pkey] ?? null;
    if (is_array($raw)) $raw = null;
    $raw = is_string($raw) ? trim(str_replace("\0", '', $raw)) : null;
    switch ($type) {
        case 'bool':
            return [isset($_POST[$pkey]) ? 1 : 0, null];
        case 'number':
            if ($raw === null || $raw === '') return [!empty($f['nullable']) ? null : ($f['default'] ?? 0), !empty($f['required']) ? 'Required' : null];
            if (!is_numeric($raw)) return [null, 'Must be a number'];
            $n = (float)$raw;
            if (isset($f['min']) && $n < $f['min']) return [null, 'Minimum ' . $f['min']];
            if (isset($f['max']) && $n > $f['max']) return [null, 'Maximum ' . $f['max']];
            return [$n, null];
        case 'select':
            $opts = is_callable($f['options']) ? ($f['options'])() : $f['options'];
            if (($raw === '' || $raw === null) && isset($f['empty'])) return [null, null];
            if (!array_key_exists($raw, $opts) && !array_key_exists((int)$raw, $opts)) return [null, 'Choose an option'];
            return [$raw, null];
        case 'richtext':
            return [sanitize_html((string)$raw), null];
        case 'lines':
            return [implode("\n", lines((string)$raw)), null];
        case 'email':
            if ($raw !== '' && !filter_var($raw, FILTER_VALIDATE_EMAIL)) return [null, 'Invalid email'];
            return [$raw ?: null, null];
        case 'url':
            if ($raw !== '' && !preg_match('~^https?://[^\s<>"]+$~i', (string)$raw)) return [null, 'Must start with https://'];
            return [$raw ?: null, null];
        case 'color':
            if ($raw !== '' && !preg_match('~^#[0-9a-fA-F]{6}$~', (string)$raw)) return [null, 'Use #RRGGBB'];
            return [$raw, null];
        case 'datetime':
            if (!$raw) return [null, null];
            $ts = strtotime($raw);
            return $ts ? [date('Y-m-d H:i:s', $ts), null] : [null, 'Invalid date'];
        case 'icon':
            return [$raw !== '' ? fa($raw) : null, null];
        case 'image':
        case 'file':
            if ($file = crud_file($key)) {
                try {
                    $opt = in_array($key, ['logo', 'favicon', 'app_icon', 'email_logo', 'icon_image', 'details.qr'], true) ? ['compress' => false, 'webp' => false, 'max_dim' => 1024, 'thumb' => false] : [];
                    $up = store_upload($file, $type === 'file' ? 'document' : 'image', $opt);
                    media_register($up, (string)$file['name'], $key);
                    return [$up['path'], null];
                } catch (RuntimeException $e) {
                    return [null, $e->getMessage()];
                }
            }
            if ($raw === '' || $raw === null) return [null, null];
            if (!preg_match('~^assets/(uploads|icons|images)/[A-Za-z0-9/_.-]+$~', $raw) || str_contains($raw, '..')) return [$current ?: null, null];
            return [$raw, null];
        case 'secret':
            return [$raw === '' || $raw === null ? $current : $raw, null];
        case 'sections':
            $allowed = array_keys($f['options']);
            return [implode(',', array_values(array_intersect(array_map('trim', explode(',', (string)$raw)), $allowed))), null];
        default:
            $raw = (string)$raw;
            if (!empty($f['required']) && $raw === '') return [null, 'Required'];
            if (isset($f['max']) && mb_strlen($raw) > $f['max']) return [null, 'Too long (max ' . $f['max'] . ')'];
            return [$raw === '' ? null : $raw, null];
    }
}

/** Save from POST (api/admin.php → crud_save). */
function crud_save(): never
{
    $name = input('__res');
    $r = crud_res($name);
    $id = input_int('__id') ?: null;
    $row = $id ? row('SELECT * FROM ' . ident($r['table']) . ' WHERE id = ?', [$id]) : null;
    if ($id && !$row) fail('Not found', 404);
    $data = [];
    $details = $row ? (json_decode((string)($row['details'] ?? ''), true) ?: []) : [];
    $errors = [];
    foreach ($r['fields'] as $key => $f) {
        if (!empty($f['virtual'])) continue;
        if ($f['type'] === 'slug') continue;
        [$v, $err] = admin_field_value($key, $f, crud_current($row, $key, $f));
        if ($err) { $errors[$key] = $err; continue; }
        if (!empty($f['required']) && ($v === null || $v === '')) { $errors[$key] = 'Required'; continue; }
        if (str_starts_with($key, 'details.')) $details[substr($key, 8)] = $v;
        else $data[$key] = $v;
    }
    if ($errors) fail('Please fix the highlighted fields.', 422, $errors);
    // slugs: from input or source field, unique within table
    foreach ($r['fields'] as $key => $f) {
        if ($f['type'] !== 'slug') continue;
        $src = input($key) !== '' ? input($key) : (string)($data[$f['from']] ?? '');
        $slug = slugify($src);
        if (!empty($f['underscore'])) $slug = str_replace('-', '_', $slug);
        $base = $slug;
        $i = 2;
        while (val('SELECT 1 FROM ' . ident($r['table']) . ' WHERE ' . ident($key) . ' = ? AND id <> ?', [$slug, (int)$id])) $slug = $base . '-' . $i++;
        $data[$key] = $slug;
    }
    if (isset($r['fields']['details.address']) || array_key_exists('details', $row ?? [])) $data['details'] = json_encode($details, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if (!empty($r['before_save'])) $r['before_save']($data, $id);

    if ($id) {
        update($r['table'], $data, 'id = ?', [$id]);
        audit(rtrim($r['table'], 's') . '_update', $r['table'], $id, (string)($data['title_en'] ?? $data['name_en'] ?? $data['name'] ?? $data['label'] ?? ''));
    } else {
        $id = insert($r['table'], $data);
        audit(rtrim($r['table'], 's') . '_create', $r['table'], $id, (string)($data['title_en'] ?? $data['name_en'] ?? $data['name'] ?? $data['label'] ?? ''));
    }
    if (!empty($r['after_save'])) $r['after_save']($id, $data, !$row);
    bump_content_version();
    $back = input('__back');
    ok('Saved successfully', ['redirect' => url(str_starts_with($back, '/admin') ? $back : '/admin'), 'clearCache' => true]);
}

function crud_delete(): never
{
    $name = input('res');
    $r = crud_res($name);
    $id = input_int('id');
    $row = row('SELECT * FROM ' . ident($r['table']) . ' WHERE id = ?', [$id]);
    if (!$row) fail('Not found', 404);
    q('DELETE FROM ' . ident($r['table']) . ' WHERE id = ?', [$id]);
    audit(rtrim($r['table'], 's') . '_delete', $r['table'], $id, (string)($row['title_en'] ?? $row['name_en'] ?? $row['name'] ?? $row['label'] ?? ''));
    bump_content_version();
    ok('Deleted', ['reload' => true]);
}

function crud_toggle(): never
{
    $r = crud_res(input('res'));
    $field = input('field');
    if (!in_array($field, $r['toggles'] ?? [], true)) fail('Not allowed', 403);
    $id = input_int('id');
    q('UPDATE ' . ident($r['table']) . ' SET ' . ident($field) . ' = ? WHERE id = ?', [input_bool('value') ? 1 : 0, $id]);
    audit(rtrim($r['table'], 's') . '_update', $r['table'], $id, "$field = " . (input_bool('value') ? 1 : 0));
    bump_content_version();
    ok('Updated', ['clearCache' => true]);
}

<?php
/**
 * Definition-driven admin CRUD. Each entity declares its table, list columns
 * and form fields; validation, uploads and saving are handled generically.
 */
final class AdminCrudController
{
    public static function entities(): array
    {
        $yes = fn($v) => $v ? '<span class="badge badge-success">' . e(t('common.yes')) . '</span>' : '<span class="badge">' . e(t('common.no')) . '</span>';
        $active = ['is_active' => ['type' => 'checkbox', 'label' => 'admin.active', 'default' => 1], 'sort_order' => ['type' => 'number', 'label' => 'admin.sort', 'default' => 0, 'half' => true]];
        return [
            'services' => [
                'table' => 'services', 'title' => 'admin.services', 'icon' => 'fa-solid fa-layer-group', 'order' => 'sort_order, id', 'search' => ['title', 'title_bn', 'slug'],
                'view' => fn($r) => url('/services/' . $r['slug']),
                'list' => [
                    'title' => ['label' => 'admin.title', 'render' => fn($r) => '<span class="row">' . svc_logo($r, 'sm') . '<span><strong>' . e($r['title']) . '</strong><br><small class="muted">/' . e($r['slug']) . '</small></span></span>'],
                    'price' => ['label' => 'admin.price', 'render' => fn($r) => money($r['price'], $r['currency'], (bool)$r['price_plus']) . ($r['old_price'] ? ' <s class="muted xs">' . money($r['old_price'], $r['currency']) . '</s>' : '')],
                    'is_featured' => ['label' => 'admin.featured', 'render' => fn($r) => $yes($r['is_featured']) . ($r['is_vip'] ? ' <span class="badge badge-vip">VIP</span>' : '')],
                    'views' => ['label' => 'admin.views'],
                    'is_active' => ['label' => 'admin.active', 'render' => fn($r) => $yes($r['is_active'])],
                ],
                'fields' => [
                    'title' => ['type' => 'text', 'label' => 'admin.title', 'required' => true, 'max' => 160],
                    'title_bn' => ['type' => 'text', 'label' => 'admin.title_bn', 'max' => 160],
                    'slug' => ['type' => 'slug', 'label' => 'admin.slug', 'from' => 'title', 'unique' => true, 'max' => 140, 'hint' => 'admin.slug_hint'],
                    'category_id' => ['type' => 'select', 'label' => 'admin.category', 'options' => fn() => self::opts('SELECT id, name FROM service_categories ORDER BY sort_order'), 'nullable' => true, 'half' => true],
                    'currency' => ['type' => 'select', 'label' => 'admin.currency', 'options' => ['USD' => 'USD ($)', 'BDT' => 'BDT (৳)'], 'half' => true],
                    'price' => ['type' => 'number', 'label' => 'admin.sale_price', 'required' => true, 'step' => '0.01', 'half' => true],
                    'old_price' => ['type' => 'number', 'label' => 'admin.old_price', 'step' => '0.01', 'nullable' => true, 'half' => true, 'hint' => 'admin.old_price_hint'],
                    'price_plus' => ['type' => 'checkbox', 'label' => 'admin.price_plus', 'default' => 1],
                    'short_desc' => ['type' => 'textarea', 'label' => 'admin.short_desc', 'max' => 300, 'rows' => 2],
                    'short_desc_bn' => ['type' => 'textarea', 'label' => 'admin.short_desc_bn', 'max' => 300, 'rows' => 2],
                    'features' => ['type' => 'lines', 'label' => 'admin.features', 'hint' => 'admin.features_hint', 'virtual' => true],
                    'description' => ['type' => 'editor', 'label' => 'admin.description'],
                    'icon' => ['type' => 'icon', 'label' => 'admin.icon', 'default' => 'fa-solid fa-code', 'half' => true],
                    'icon_color' => ['type' => 'color', 'label' => 'admin.icon_color', 'default' => '#2563eb', 'half' => true],
                    'icon_image' => ['type' => 'image', 'label' => 'admin.icon_image', 'dir' => 'icons', 'opts' => ['square' => 128, 'format' => 'png'], 'hint' => 'admin.icon_image_hint'],
                    'delivery_days' => ['type' => 'text', 'label' => 'admin.delivery_days', 'max' => 30, 'half' => true],
                    'support_days' => ['type' => 'text', 'label' => 'admin.support_days', 'max' => 30, 'half' => true],
                    'is_featured' => ['type' => 'checkbox', 'label' => 'admin.featured'],
                    'is_vip' => ['type' => 'checkbox', 'label' => 'VIP'],
                ] + $active,
                'load' => fn($id) => ['features' => implode("\n", array_map(fn($f) => $f['feature'] . ($f['feature_bn'] ? ' | ' . $f['feature_bn'] : ''), DB::all('SELECT feature, feature_bn FROM service_features WHERE service_id = ? ORDER BY sort_order, id', [$id])))],
                'after_save' => function (int $id) {
                    DB::q('DELETE FROM service_features WHERE service_id = ?', [$id]);
                    $lines = array_filter(array_map('trim', preg_split('/\R/u', (string)($_POST['features'] ?? ''))));
                    foreach (array_values($lines) as $i => $line) {
                        [$en, $bn] = array_pad(array_map('trim', explode('|', $line, 2)), 2, null);
                        DB::insert('service_features', ['service_id' => $id, 'feature' => mb_substr($en, 0, 200), 'feature_bn' => $bn ? mb_substr($bn, 0, 200) : null, 'sort_order' => $i]);
                    }
                },
            ],
            'categories' => [
                'table' => 'service_categories', 'title' => 'admin.categories', 'icon' => 'fa-solid fa-folder-tree', 'order' => 'sort_order, id', 'search' => ['name', 'name_bn', 'slug'],
                'list' => [
                    'name' => ['label' => 'admin.name', 'render' => fn($r) => icon_html($r['icon']) . ' <strong>' . e($r['name']) . '</strong> <small class="muted">' . e($r['name_bn']) . '</small>'],
                    'slug' => ['label' => 'admin.slug'],
                    'services' => ['label' => 'admin.services', 'render' => fn($r) => num((int)DB::val('SELECT COUNT(*) FROM services WHERE category_id = ?', [$r['id']]))],
                    'is_active' => ['label' => 'admin.active', 'render' => fn($r) => $yes($r['is_active'])],
                ],
                'fields' => [
                    'name' => ['type' => 'text', 'label' => 'admin.name', 'required' => true, 'max' => 120],
                    'name_bn' => ['type' => 'text', 'label' => 'admin.name_bn', 'max' => 120],
                    'slug' => ['type' => 'slug', 'label' => 'admin.slug', 'from' => 'name', 'unique' => true, 'max' => 120],
                    'icon' => ['type' => 'icon', 'label' => 'admin.icon', 'default' => 'fa-solid fa-folder'],
                ] + $active,
            ],
            'posts' => [
                'table' => 'posts', 'title' => 'admin.posts', 'icon' => 'fa-solid fa-newspaper', 'order' => 'COALESCE(published_at, created_at) DESC, id DESC', 'search' => ['title', 'tags', 'slug'],
                'view' => fn($r) => url('/news/' . $r['id']),
                'filters' => ['status' => ['published' => 'status.published', 'draft' => 'status.draft']],
                'list' => [
                    'title' => ['label' => 'admin.title', 'render' => fn($r) => '<strong>' . e(trim(($r['icon'] ?? '') . ' ' . $r['title'])) . '</strong>'],
                    'status' => ['label' => 'admin.status', 'render' => fn($r) => status_badge($r['status'])],
                    'published_at' => ['label' => 'admin.published', 'render' => fn($r) => e(fmt_date($r['published_at'], true))],
                    'views' => ['label' => 'admin.views'],
                ],
                'fields' => [
                    'title' => ['type' => 'text', 'label' => 'admin.title', 'required' => true, 'max' => 220],
                    'slug' => ['type' => 'slug', 'label' => 'admin.slug', 'from' => 'title', 'unique' => true, 'max' => 240],
                    'icon' => ['type' => 'text', 'label' => 'admin.post_icon', 'max' => 16, 'half' => true, 'hint' => 'admin.post_icon_hint', 'default' => '🚀'],
                    'category_id' => ['type' => 'select', 'label' => 'admin.category', 'options' => fn() => self::opts('SELECT id, name FROM post_categories ORDER BY sort_order'), 'nullable' => true, 'half' => true],
                    'featured_image' => ['type' => 'image', 'label' => 'admin.featured_image', 'dir' => 'posts', 'opts' => ['thumb' => true]],
                    'excerpt' => ['type' => 'textarea', 'label' => 'admin.excerpt', 'max' => 400, 'rows' => 2],
                    'content' => ['type' => 'editor', 'label' => 'admin.content', 'required' => true],
                    'tags' => ['type' => 'text', 'label' => 'admin.tags', 'max' => 300, 'hint' => 'admin.tags_hint'],
                    'seo_title' => ['type' => 'text', 'label' => 'admin.seo_title', 'max' => 220],
                    'seo_description' => ['type' => 'textarea', 'label' => 'admin.seo_description', 'max' => 320, 'rows' => 2],
                    'status' => ['type' => 'select', 'label' => 'admin.status', 'options' => ['published' => 'status.published', 'draft' => 'status.draft'], 'half' => true, 'default' => 'published'],
                    'published_at' => ['type' => 'datetime', 'label' => 'admin.publish_date', 'half' => true, 'nullable' => true],
                    'notify_users' => ['type' => 'checkbox', 'label' => 'admin.notify_users', 'virtual' => true],
                ],
                'before_save' => function (array &$d, ?int $id) {
                    if (!$id) $d['author_id'] = Auth::id();
                    if ($d['status'] === 'published' && empty($d['published_at'])) $d['published_at'] = now();
                },
                'after_save' => function (int $id, array $d, ?array $old) {
                    @array_map('unlink', glob(STORAGE . '/cache/ai-knowledge-*.txt') ?: []);
                    $newlyPublished = $d['status'] === 'published' && ($old === null || $old['status'] !== 'published');
                    if ($newlyPublished && ($_POST['notify_users'] ?? '') === '1') {
                        Notifier::send(null, trim(($d['icon'] ?? '') . ' ' . $d['title']), str_limit($d['excerpt'] ?: strip_tags((string)$d['content']), 140),
                            ['icon' => 'fa-solid fa-newspaper', 'link' => '/news/' . $id, 'created_by' => Auth::id()]);
                    }
                },
            ],
            'post-categories' => [
                'table' => 'post_categories', 'title' => 'admin.post_categories', 'icon' => 'fa-solid fa-tags', 'order' => 'sort_order, id', 'search' => ['name', 'slug'],
                'list' => ['name' => ['label' => 'admin.name', 'render' => fn($r) => '<strong>' . e($r['name']) . '</strong> <small class="muted">' . e($r['name_bn']) . '</small>'], 'slug' => ['label' => 'admin.slug'],
                    'posts' => ['label' => 'admin.posts', 'render' => fn($r) => num((int)DB::val('SELECT COUNT(*) FROM posts WHERE category_id = ?', [$r['id']]))]],
                'fields' => [
                    'name' => ['type' => 'text', 'label' => 'admin.name', 'required' => true, 'max' => 120],
                    'name_bn' => ['type' => 'text', 'label' => 'admin.name_bn', 'max' => 120],
                    'slug' => ['type' => 'slug', 'label' => 'admin.slug', 'from' => 'name', 'unique' => true, 'max' => 120],
                    'sort_order' => $active['sort_order'],
                ],
            ],
            'team' => [
                'table' => 'team_members', 'title' => 'admin.team', 'icon' => 'fa-solid fa-users', 'order' => 'sort_order, id', 'search' => ['name', 'role', 'skills'],
                'view' => fn($r) => url('/team/' . $r['id']),
                'list' => [
                    'name' => ['label' => 'admin.name', 'render' => fn($r) => '<span class="row">' . ($r['photo'] ? '<img class="avatar avatar-sm" src="' . e(upload_url($r['photo'])) . '" alt="">' : avatar_html(['name' => $r['name'], 'email' => $r['name']], 'avatar-sm')) . '<strong>' . e($r['name']) . '</strong>' . ($r['is_vip'] ? ' <span class="badge badge-vip">' . e($r['badge_text'] ?: 'VIP') . '</span>' : '') . '</span>'],
                    'role' => ['label' => 'admin.role'],
                    'is_active' => ['label' => 'admin.active', 'render' => fn($r) => $yes($r['is_active'])],
                ],
                'fields' => [
                    'name' => ['type' => 'text', 'label' => 'admin.name', 'required' => true, 'max' => 120],
                    'role' => ['type' => 'text', 'label' => 'admin.role', 'required' => true, 'max' => 120, 'half' => true],
                    'role_bn' => ['type' => 'text', 'label' => 'admin.role_bn', 'max' => 120, 'half' => true],
                    'photo' => ['type' => 'image', 'label' => 'admin.photo', 'dir' => 'team', 'opts' => ['square' => 400]],
                    'bio' => ['type' => 'textarea', 'label' => 'admin.bio', 'max' => 1000],
                    'skills' => ['type' => 'text', 'label' => 'admin.skills', 'max' => 500, 'hint' => 'admin.tags_hint'],
                    'email' => ['type' => 'email', 'label' => 'form.email', 'max' => 190, 'half' => true],
                    'whatsapp' => ['type' => 'text', 'label' => 'WhatsApp', 'max' => 40, 'half' => true],
                    'telegram' => ['type' => 'text', 'label' => 'Telegram', 'max' => 120, 'half' => true],
                    'facebook' => ['type' => 'url', 'label' => 'Facebook URL', 'max' => 255, 'half' => true],
                    'linkedin' => ['type' => 'url', 'label' => 'LinkedIn URL', 'max' => 255, 'half' => true],
                    'github' => ['type' => 'url', 'label' => 'GitHub URL', 'max' => 255, 'half' => true],
                    'website' => ['type' => 'url', 'label' => 'admin.website', 'max' => 255],
                    'cv_file' => ['type' => 'file', 'label' => 'admin.cv', 'dir' => 'cv', 'hint' => 'admin.cv_hint'],
                    'is_vip' => ['type' => 'checkbox', 'label' => 'admin.vip_badge'],
                    'badge_text' => ['type' => 'text', 'label' => 'admin.badge_text', 'max' => 40, 'half' => true],
                    'badge_animated' => ['type' => 'checkbox', 'label' => 'admin.badge_animated'],
                ] + $active,
            ],
            'faqs' => [
                'table' => 'faqs', 'title' => 'admin.faqs', 'icon' => 'fa-solid fa-circle-question', 'order' => 'sort_order, id', 'search' => ['question', 'question_bn', 'category'],
                'list' => ['question' => ['label' => 'admin.question', 'render' => fn($r) => '<strong>' . e(str_limit($r['question'], 80)) . '</strong>'], 'category' => ['label' => 'admin.category'],
                    'show_home' => ['label' => 'admin.on_home', 'render' => fn($r) => $yes($r['show_home'])], 'is_active' => ['label' => 'admin.active', 'render' => fn($r) => $yes($r['is_active'])]],
                'fields' => [
                    'question' => ['type' => 'text', 'label' => 'admin.question', 'required' => true, 'max' => 300],
                    'question_bn' => ['type' => 'text', 'label' => 'admin.question_bn', 'max' => 300],
                    'answer' => ['type' => 'textarea', 'label' => 'admin.answer', 'required' => true, 'max' => 5000],
                    'answer_bn' => ['type' => 'textarea', 'label' => 'admin.answer_bn', 'max' => 5000],
                    'category' => ['type' => 'text', 'label' => 'admin.category', 'max' => 60, 'default' => 'General', 'half' => true],
                    'show_home' => ['type' => 'checkbox', 'label' => 'admin.on_home', 'default' => 1],
                ] + $active,
            ],
            'slides' => [
                'table' => 'slides', 'title' => 'admin.slider', 'icon' => 'fa-solid fa-images', 'order' => 'sort_order, id', 'search' => ['title', 'subtitle'],
                'list' => ['title' => ['label' => 'admin.title', 'render' => fn($r) => icon_html($r['icon']) . ' <strong>' . e($r['title']) . '</strong>'], 'link' => ['label' => 'admin.link'],
                    'is_active' => ['label' => 'admin.active', 'render' => fn($r) => $yes($r['is_active'])]],
                'fields' => [
                    'title' => ['type' => 'text', 'label' => 'admin.title', 'required' => true, 'max' => 160],
                    'title_bn' => ['type' => 'text', 'label' => 'admin.title_bn', 'max' => 160],
                    'subtitle' => ['type' => 'text', 'label' => 'admin.subtitle', 'max' => 300],
                    'subtitle_bn' => ['type' => 'text', 'label' => 'admin.subtitle_bn', 'max' => 300],
                    'icon' => ['type' => 'icon', 'label' => 'admin.icon', 'default' => 'fa-solid fa-rocket', 'half' => true],
                    'image' => ['type' => 'image', 'label' => 'admin.image', 'dir' => 'slides', 'opts' => ['square' => 160, 'format' => 'png']],
                    'link' => ['type' => 'text', 'label' => 'admin.link', 'max' => 255, 'half' => true, 'hint' => 'admin.link_hint'],
                    'button_text' => ['type' => 'text', 'label' => 'admin.button_text', 'max' => 60, 'half' => true],
                ] + $active,
            ],
            'projects' => [
                'table' => 'projects', 'title' => 'admin.projects', 'icon' => 'fa-solid fa-briefcase', 'order' => 'sort_order, id DESC', 'search' => ['title', 'title_bn', 'brand', 'tags'],
                'view' => fn($r) => url('/projects') . '#project-' . $r['id'],
                'list' => [
                    'title' => ['label' => 'admin.title', 'render' => fn($r) => '<span class="row">' . ($r['image1'] ? '<img class="thumb-sm" src="' . e(upload_url($r['image1'])) . '" width="48" height="36" alt="" style="object-fit:cover;border-radius:6px">' : '') . '<span><strong>' . e($r['title']) . '</strong><br><small class="muted">' . e($r['brand'] ?: '') . '</small></span></span>'],
                    'images' => ['label' => 'admin.images', 'render' => fn($r) => num(count(array_filter([$r['image1'], $r['image2'], $r['image3'], $r['image4'], $r['image5']])))],
                    'link' => ['label' => 'admin.link', 'render' => fn($r) => $r['link'] ? '<a class="xs" href="' . e($r['link']) . '" target="_blank" rel="noopener" data-no-spa>' . e(str_limit(preg_replace('#^https?://#', '', $r['link']), 28)) . '</a>' : '—'],
                    'is_active' => ['label' => 'admin.active', 'render' => fn($r) => $yes($r['is_active'])],
                ],
                'fields' => [
                    'title' => ['type' => 'text', 'label' => 'admin.title', 'required' => true, 'max' => 160, 'half' => true],
                    'title_bn' => ['type' => 'text', 'label' => 'admin.title_bn', 'max' => 160, 'half' => true],
                    'brand' => ['type' => 'text', 'label' => 'admin.brand', 'max' => 120, 'half' => true, 'hint' => 'admin.brand_hint'],
                    'category' => ['type' => 'text', 'label' => 'admin.category', 'max' => 80, 'half' => true, 'hint' => 'admin.project_cat_hint'],
                    'link' => ['type' => 'url', 'label' => 'admin.project_link', 'max' => 255],
                    'image1' => ['type' => 'image', 'label' => 'admin.cover_image', 'dir' => 'projects', 'opts' => ['max_width' => 1400, 'thumb' => true]],
                    'image2' => ['type' => 'image', 'label' => 'admin.image_2', 'dir' => 'projects', 'opts' => ['max_width' => 1400, 'thumb' => true], 'half' => true],
                    'image3' => ['type' => 'image', 'label' => 'admin.image_3', 'dir' => 'projects', 'opts' => ['max_width' => 1400, 'thumb' => true], 'half' => true],
                    'image4' => ['type' => 'image', 'label' => 'admin.image_4', 'dir' => 'projects', 'opts' => ['max_width' => 1400, 'thumb' => true], 'half' => true],
                    'image5' => ['type' => 'image', 'label' => 'admin.image_5', 'dir' => 'projects', 'opts' => ['max_width' => 1400, 'thumb' => true], 'half' => true],
                    'description' => ['type' => 'textarea', 'label' => 'admin.short_desc', 'max' => 600, 'rows' => 2],
                    'description_bn' => ['type' => 'textarea', 'label' => 'admin.short_desc_bn', 'max' => 600, 'rows' => 2],
                    'tags' => ['type' => 'text', 'label' => 'admin.tech_used', 'max' => 300, 'hint' => 'admin.tags_hint'],
                    'is_featured' => ['type' => 'checkbox', 'label' => 'admin.on_home', 'default' => 1],
                ] + $active,
            ],
            'payment-methods' => [
                'table' => 'payment_methods', 'title' => 'admin.payment_methods', 'icon' => 'fa-solid fa-building-columns', 'order' => 'sort_order, id', 'search' => ['name', 'code'],
                'list' => [
                    'name' => ['label' => 'admin.name', 'render' => fn($r) => '<span class="row"><img src="' . e(Content::media($r['logo'])) . '" width="24" height="24" alt=""><strong>' . e($r['name']) . '</strong></span>'],
                    'account_number' => ['label' => 'admin.account', 'render' => fn($r) => $r['account_number'] ? '<span class="mono xs">' . e(str_limit($r['account_number'], 26)) . '</span>' : '<span class="badge badge-warning">' . e(t('admin.not_set')) . '</span>'],
                    'is_active' => ['label' => 'admin.active', 'render' => fn($r) => $yes($r['is_active'])],
                ],
                'fields' => [
                    'name' => ['type' => 'text', 'label' => 'admin.name', 'required' => true, 'max' => 80, 'half' => true],
                    'code' => ['type' => 'slug', 'label' => 'admin.code', 'from' => 'name', 'unique' => true, 'max' => 30, 'half' => true, 'underscore' => true],
                    'type' => ['type' => 'select', 'label' => 'admin.type', 'options' => ['mobile' => 'Mobile banking', 'crypto' => 'Crypto', 'exchange' => 'Exchange'], 'half' => true],
                    'network' => ['type' => 'text', 'label' => 'admin.network', 'max' => 40, 'half' => true, 'hint' => 'admin.network_hint'],
                    'account_number' => ['type' => 'text', 'label' => 'admin.account', 'max' => 190, 'hint' => 'admin.account_hint'],
                    'account_name' => ['type' => 'text', 'label' => 'admin.account_name', 'max' => 120, 'half' => true],
                    'account_type' => ['type' => 'text', 'label' => 'admin.account_type', 'max' => 40, 'half' => true, 'hint' => 'admin.account_type_hint'],
                    'logo' => ['type' => 'image', 'label' => 'admin.logo', 'dir' => 'payment', 'opts' => ['square' => 128, 'format' => 'png']],
                    'qr_image' => ['type' => 'image', 'label' => 'admin.qr', 'dir' => 'payment', 'opts' => ['max_width' => 600, 'format' => 'png']],
                    'link' => ['type' => 'url', 'label' => 'admin.pay_link', 'max' => 255],
                    'instructions' => ['type' => 'textarea', 'label' => 'admin.instructions', 'max' => 2000],
                    'instructions_bn' => ['type' => 'textarea', 'label' => 'admin.instructions_bn', 'max' => 2000],
                ] + $active,
            ],
        ];
    }

    private static function opts(string $sql): array
    {
        $o = [];
        foreach (DB::all($sql) as $r) $o[$r['id']] = $r['name'];
        return $o;
    }

    private function def(string $entity): array
    {
        $d = self::entities()[$entity] ?? null;
        if (!$d) throw new HttpException(t('error.404'), 404);
        return $d + ['entity' => $entity];
    }

    public function index(string $entity): void
    {
        $d = $this->def($entity);
        $q = trim((string)input('q'));
        $where = '1=1'; $params = [];
        if ($q !== '') {
            $where .= ' AND (' . implode(' OR ', array_map(fn($c) => "`$c` LIKE ?", $d['search'])) . ')';
            foreach ($d['search'] as $_) $params[] = '%' . $q . '%';
        }
        foreach ($d['filters'] ?? [] as $col => $choices) {
            $v = (string)input($col);
            if ($v !== '' && isset($choices[$v])) { $where .= " AND `$col` = ?"; $params[] = $v; }
        }
        $p = DB::paginate('*', "FROM `{$d['table']}` WHERE $where ORDER BY {$d['order']}", $params, input_int('page', 1), 25);
        View::page('admin/crud-list', ['d' => $d, 'p' => $p, 'q' => $q], ['layout' => 'admin', 'title' => t($d['title']), 'nav' => $entity, 'cache' => false]);
    }

    public function form(string $entity, ?string $id = null): void
    {
        $d = $this->def($entity);
        $row = null;
        if ($id !== null) {
            $row = DB::row("SELECT * FROM `{$d['table']}` WHERE id = ?", [(int)$id]);
            if (!$row) throw new HttpException(t('error.404'), 404);
            if (isset($d['load'])) $row += ($d['load'])((int)$id);
        }
        View::page('admin/crud-form', ['d' => $d, 'row' => $row], ['layout' => 'admin', 'title' => ($row ? t('admin.edit') : t('admin.new')) . ' · ' . t($d['title']), 'nav' => $entity, 'cache' => false]);
    }

    public function save(string $entity): void
    {
        $d = $this->def($entity);
        $id = input_int('id') ?: null;
        $old = $id ? DB::row("SELECT * FROM `{$d['table']}` WHERE id = ?", [$id]) : null;
        if ($id && !$old) throw new HttpException(t('error.404'), 404);
        $data = []; $errors = [];
        foreach ($d['fields'] as $name => $f) {
            if (!empty($f['virtual'])) continue;
            $label = t($f['label']);
            $raw = $_POST[$name] ?? null;
            switch ($f['type']) {
                case 'checkbox': $data[$name] = $raw === '1' ? 1 : 0; break;
                case 'number':
                    $v = trim((string)$raw);
                    if ($v === '') { $data[$name] = !empty($f['nullable']) ? null : 0; break; }
                    if (!is_numeric($v)) { $errors[$name] = t('valid.numeric'); break; }
                    $data[$name] = $v + 0;
                    break;
                case 'select':
                    $v = (string)$raw;
                    $opts = is_callable($f['options']) ? ($f['options'])() : $f['options'];
                    if ($v === '' && !empty($f['nullable'])) { $data[$name] = null; break; }
                    if (!array_key_exists($v, $opts)) { $errors[$name] = t('valid.in'); break; }
                    $data[$name] = $v;
                    break;
                case 'editor': $data[$name] = Sanitizer::html((string)$raw); break;
                case 'color': $data[$name] = preg_match('/^#[0-9a-f]{6}$/i', (string)$raw) ? $raw : ($f['default'] ?? null); break;
                case 'icon': $data[$name] = preg_replace('/[^a-z0-9\- ]/', '', strtolower(trim((string)$raw))) ?: ($f['default'] ?? null); break;
                case 'datetime':
                    $v = trim((string)$raw);
                    $data[$name] = $v === '' ? null : (($ts = strtotime($v)) ? date('Y-m-d H:i:s', $ts) : null);
                    break;
                case 'slug':
                    $v = trim((string)$raw) ?: (string)($_POST[$f['from']] ?? '');
                    $v = slugify($v);
                    if (!empty($f['underscore'])) $v = str_replace('-', '_', preg_replace('/[^a-z0-9\-]/', '', $v));
                    $data[$name] = mb_substr($v, 0, $f['max'] ?? 120);
                    break;
                case 'image': case 'file':
                    if (($_POST[$name . '_remove'] ?? '') === '1') { $data[$name] = null; if ($old) Upload::delete($old[$name]); }
                    if (Upload::present($name)) {
                        try {
                            $data[$name] = $f['type'] === 'image' ? Upload::image($name, $f['dir'], $f['opts'] ?? []) : Upload::document($name, $f['dir'], false, 8);
                            if ($old && $old[$name]) Upload::delete($old[$name]);
                        } catch (UploadError $e) { $errors[$name] = $e->getMessage(); }
                    }
                    break;
                default:
                    $v = trim((string)$raw);
                    if ($f['type'] === 'email' && $v !== '' && !filter_var($v, FILTER_VALIDATE_EMAIL)) $errors[$name] = t('valid.email');
                    if ($f['type'] === 'url' && $v !== '' && !preg_match('#^https?://#i', $v)) $errors[$name] = t('valid.url');
                    $data[$name] = $v === '' ? null : $v;
            }
            if (!empty($f['required']) && ($data[$name] ?? '') === '' && !isset($errors[$name])) $errors[$name] = t('valid.required') . " ($label)";
            if (isset($f['max'], $data[$name]) && is_string($data[$name]) && mb_strlen($data[$name]) > $f['max']) $errors[$name] = t('valid.max', ['n' => $f['max']]);
            if (!empty($f['unique']) && !empty($data[$name]) && DB::val("SELECT 1 FROM `{$d['table']}` WHERE `$name` = ? AND id <> ?", [$data[$name], $id ?? 0])) {
                $errors[$name] = t('admin.taken');
            }
        }
        if ($errors) fail(t('valid.fix'), $errors);
        if (isset($d['before_save'])) ($d['before_save'])($data, $id);
        if ($id) DB::update($d['table'], $data, 'id = ?', [$id]);
        else $id = DB::insert($d['table'], $data);
        if (isset($d['after_save'])) ($d['after_save'])($id, $data, $old);
        @array_map('unlink', glob(STORAGE . '/cache/ai-knowledge-*.txt') ?: []);
        Auth::activity('admin_save_' . $entity, "#$id");
        respond(true, t('common.saved'), '/admin/' . $entity);
    }

    public function delete(string $entity, string $id): void
    {
        $d = $this->def($entity);
        $row = DB::row("SELECT * FROM `{$d['table']}` WHERE id = ?", [(int)$id]);
        if (!$row) throw new HttpException(t('error.404'), 404);
        try {
            DB::q("DELETE FROM `{$d['table']}` WHERE id = ?", [(int)$id]);
        } catch (PDOException $e) {
            fail(t('admin.delete_blocked'));
        }
        foreach ($d['fields'] as $name => $f) if (in_array($f['type'], ['image', 'file'], true) && !empty($row[$name])) Upload::delete($row[$name]);
        Auth::activity('admin_delete_' . $entity, "#$id");
        respond(true, t('admin.deleted'), '/admin/' . $entity);
    }
}

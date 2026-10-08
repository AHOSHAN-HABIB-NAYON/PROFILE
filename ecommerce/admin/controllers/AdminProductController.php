<?php
/**
 * Product management: list/filter, editor (basic, pricing, inventory, variants,
 * images, description, SEO, shipping, visibility, related), stock updates, images.
 */
final class AdminProductController extends AdminController
{
    private const FILTERS = [
        'low_stock' => 'Low stock', 'out' => 'Out of stock', 'featured' => 'Featured', 'flash' => 'Flash sale',
        'combo' => 'Combo', 'free' => 'Free delivery', 'draft' => 'Draft',
    ];

    public function index(Request $r): Response
    {
        $where = ['p.deleted_at IS NULL'];
        $params = [];
        $q = trim((string)$r->get('q', ''));
        if ($q !== '') {
            $like = '%' . str_replace(['%', '_'], ['\%', '\_'], $q) . '%';
            $where[] = '(p.name LIKE ? OR p.sku LIKE ? OR p.slug LIKE ?)';
            array_push($params, $like, $like, $like);
        }
        if ($cat = (int)$r->get('category', 0)) {
            $where[] = '(p.category_id = ? OR p.subcategory_id = ?)';
            array_push($params, $cat, $cat);
        }
        $filter = (string)$r->get('filter', '');
        $threshold = (int)setting('low_stock_threshold', 10);
        $where[] = match ($filter) {
            'low_stock' => 'p.track_stock = 1 AND p.stock <= ' . $threshold,
            'out'       => 'p.track_stock = 1 AND p.stock <= 0',
            'featured'  => 'p.is_featured = 1',
            'flash'     => 'p.is_flash_sale = 1',
            'combo'     => 'p.is_combo = 1',
            'free'      => 'p.is_free_delivery = 1',
            'draft'     => 'p.status = "draft"',
            default     => '1 = 1',
        };
        $whereSql = implode(' AND ', $where);
        $perPage = 20;
        $total = (int)DB::value("SELECT COUNT(*) FROM products p WHERE $whereSql", $params);
        $pages = max(1, (int)ceil($total / $perPage));
        $page = min(max(1, (int)$r->get('page', 1)), $pages);
        $rows = DB::all(
            'SELECT p.id, p.name, p.slug, p.sku, p.price, p.old_price, p.stock, p.track_stock, p.status, p.is_featured, p.is_flash_sale,
                    p.is_combo, p.is_free_delivery, p.sold_count, c.name AS category,
                    (SELECT CONCAT(i.path, "|", i.ext) FROM product_images i WHERE i.product_id = p.id ORDER BY i.sort_order, i.id LIMIT 1) AS image,
                    (SELECT COUNT(*) FROM product_variants v WHERE v.product_id = p.id) AS variant_count
             FROM products p LEFT JOIN categories c ON c.id = p.category_id
             WHERE ' . $whereSql . ' ORDER BY p.id DESC LIMIT ' . $perPage . ' OFFSET ' . (($page - 1) * $perPage),
            $params
        );
        return $this->page('products', [
            'rows' => $rows, 'total' => $total, 'page' => $page, 'pages' => $pages, 'q' => $q, 'filter' => $filter,
            'category' => $cat, 'categories' => Category::options(), 'filters' => self::FILTERS, 'threshold' => $threshold,
        ], ['title' => 'Products', 'nav' => 'products', 'page' => 'products']);
    }

    public function form(Request $r, ?string $id = null): Response
    {
        $product = null;
        $images = $variants = $related = [];
        if ($id !== null) {
            $product = Product::find((int)$id);
            if (!$product) {
                throw new HttpException(404, 'Product not found.');
            }
            $images = DB::all('SELECT id, path, ext, width, height, bytes, alt FROM product_images WHERE product_id = ? ORDER BY sort_order, id', [$product['id']]);
            $variants = DB::all('SELECT size, color, sku, price, stock, status FROM product_variants WHERE product_id = ? ORDER BY id', [$product['id']]);
            $related = DB::all('SELECT p.id, p.name, p.sku FROM product_relations r JOIN products p ON p.id = r.related_id WHERE r.product_id = ? ORDER BY r.sort_order', [$product['id']]);
        }
        return $this->page('product-form', [
            'p' => $product, 'images' => $images, 'variants' => $variants, 'related' => $related, 'categories' => Category::options(),
        ], [
            'title' => $product ? 'Edit: ' . $product['name'] : 'Add product', 'nav' => 'products', 'page' => 'product-form',
            'scripts' => ['editor'], 'styles' => ['admin-editor'],
        ]);
    }

    public function save(Request $r): Response
    {
        $id = $r->int('id');
        $existing = $id ? Product::find($id) : null;
        if ($id && !$existing) {
            return $this->fail('Product not found.', 404);
        }
        $name = $r->str('name', 255);
        $slug = $r->str('slug', 191) ?: slugify($name);
        $slug = slugify($slug) === $slug ? $slug : slugify($slug);
        $this->validate(
            ['name' => $name, 'price' => en_digits((string)$r->input('price', '')), 'slug' => $slug],
            ['name' => 'required|max:255', 'price' => 'required|numeric|gte:0', 'slug' => 'required|slug'],
            ['name' => 'Product name', 'price' => 'Price', 'slug' => 'Slug']
        );
        $price = $this->money($r, 'price');
        $oldPrice = $this->money($r, 'old_price', null);
        if ($oldPrice !== null && $oldPrice <= $price) {
            $oldPrice = null; // old price must be higher to show a discount
        }
        $categoryId = $r->int('category_id') ?: null;
        $subId = $r->int('subcategory_id') ?: null;
        foreach ([$categoryId, $subId] as $cid) {
            if ($cid && !Category::find($cid)) {
                return $this->fail('Selected category does not exist.');
            }
        }

        $sizes = array_values(array_unique(array_filter(array_map(static fn($s) => mb_substr(trim(clean_text($s)), 0, 60), explode(',', $r->str('sizes', 500))), 'strlen')));
        $colors = [];
        foreach ((array)$r->input('color_name', []) as $i => $cn) {
            $cn = mb_substr(trim(clean_text((string)$cn)), 0, 60);
            $hex = (string)(((array)$r->input('color_hex', []))[$i] ?? '#cccccc');
            if ($cn !== '') {
                $colors[$cn] = ['name' => $cn, 'hex' => preg_match('/^#[0-9a-f]{6}$/i', $hex) ? $hex : '#cccccc'];
            }
        }
        $colors = array_values($colors);
        $specs = [];
        $labels = (array)$r->input('spec_label', []);
        foreach ($labels as $i => $label) {
            $label = mb_substr(trim(clean_text((string)$label)), 0, 100);
            $value = mb_substr(trim(clean_text((string)(((array)$r->input('spec_value', []))[$i] ?? ''))), 0, 300);
            if ($label !== '' && $value !== '') {
                $specs[] = ['label' => $label, 'value' => $value];
            }
        }
        $features = array_values(array_filter(array_map(static fn($l) => mb_substr(trim($l), 0, 200), preg_split('/\R/u', $r->str('features', 5000))), 'strlen'));

        $variants = $this->parseVariants($r, $sizes, array_column($colors, 'name'));
        $stock = $variants ? array_sum(array_column($variants, 'stock')) : $r->int('stock', 0);

        $data = [
            'name' => $name,
            'slug' => unique_slug('products', $slug, $id),
            'sku' => $this->strOrNull($r, 'sku', 80),
            'category_id' => $categoryId,
            'subcategory_id' => $subId,
            'short_description' => $this->strOrNull($r, 'short_description', 1000),
            'description' => HtmlSanitizer::clean((string)$r->input('description', '')) ?: null,
            'specifications' => json_encode($specs, JSON_UNESCAPED_UNICODE),
            'features' => json_encode($features, JSON_UNESCAPED_UNICODE),
            'tags' => $this->strOrNull($r, 'tags', 500),
            'price' => $price,
            'old_price' => $oldPrice,
            'stock' => $stock,
            'track_stock' => $r->bool('track_stock') ? 1 : 0,
            'allow_backorder' => $r->bool('allow_backorder') ? 1 : 0,
            'sizes' => json_encode($sizes, JSON_UNESCAPED_UNICODE),
            'colors' => json_encode($colors, JSON_UNESCAPED_UNICODE),
            'video_url' => preg_match('~^https://(www\.)?(youtube\.com|youtu\.be)/~i', $r->str('video_url', 255)) ? $r->str('video_url', 255) : null,
            'weight_grams' => max(0, $r->int('weight_grams', 500)),
            'is_free_delivery' => $r->bool('is_free_delivery') ? 1 : 0,
            'is_featured' => $r->bool('is_featured') ? 1 : 0,
            'is_flash_sale' => $r->bool('is_flash_sale') ? 1 : 0,
            'is_combo' => $r->bool('is_combo') ? 1 : 0,
            'status' => $r->str('status', 10) === 'draft' ? 'draft' : 'active',
            'sort_order' => $r->int('sort_order', 0),
            'seo_title' => $this->strOrNull($r, 'seo_title', 191),
            'seo_description' => $this->strOrNull($r, 'seo_description', 300),
        ];
        $related = array_slice(array_values(array_unique(array_filter(array_map('intval', (array)$r->input('related', []))))), 0, 12);

        $productId = DB::transaction(function () use ($id, $data, $variants, $related) {
            if ($id) {
                DB::update('products', $data, 'id = ?', [$id]);
            } else {
                $id = DB::insert('products', $data);
            }
            $this->syncVariants($id, $variants);
            DB::exec('DELETE FROM product_relations WHERE product_id = ?', [$id]);
            foreach ($related as $i => $rid) {
                if ($rid !== $id) {
                    DB::exec('INSERT IGNORE INTO product_relations (product_id, related_id, sort_order) SELECT ?, id, ? FROM products WHERE id = ?', [$id, $i, $rid]);
                }
            }
            return $id;
        });

        if ($meta = $r->file('meta_image')) {
            $path = ImageService::storeSingle($meta, 'site', 1200, 1.91);
            if ($existing && $existing['meta_image']) {
                ImageService::deleteVariants($existing['meta_image'], '', 'single');
            }
            DB::exec('UPDATE products SET meta_image = ? WHERE id = ?', [$path, $productId]);
        }
        $imageError = null;
        try {
            $this->storeUploadedImages($productId, $_FILES['images'] ?? null);
        } catch (HttpException $e) {
            $imageError = $e->getMessage(); // product is saved; report the image problem instead of failing the save
        }

        [$old, $new] = Audit::diff($existing ?? [], $data);
        Audit::log($existing ? 'product.update' : 'product.create', 'product', $productId, $old ?: null, $new ?: null);
        Cache::catalogChanged();
        $message = ($existing ? 'Product updated.' : 'Product created.') . ($imageError ? ' Image upload failed: ' . $imageError : '');
        return $this->done($message, $existing ? ['reload' => true] : ['redirect' => url('/admin/products/' . $productId . '/edit')]);
    }

    public function delete(Request $r, string $id): Response
    {
        return Trash::softDelete('product', (int)$id) ? $this->done('Moved to trash.') : $this->fail('Product not found.', 404);
    }

    public function stock(Request $r, string $id): Response
    {
        $p = Product::find((int)$id);
        if (!$p) {
            return $this->fail('Product not found.', 404);
        }
        if (DB::value('SELECT 1 FROM product_variants WHERE product_id = ? LIMIT 1', [$p['id']])) {
            return $this->fail('This product has variants — update stock per variant in the product editor.');
        }
        $stock = max(0, $r->int('stock', 0));
        DB::exec('UPDATE products SET stock = ? WHERE id = ?', [$stock, $p['id']]);
        Audit::log('product.stock', 'product', (int)$p['id'], ['stock' => $p['stock']], ['stock' => $stock]);
        Cache::catalogChanged();
        return $this->done('Stock updated to ' . $stock . '.');
    }

    public function uploadImages(Request $r, string $id): Response
    {
        if (!Product::find((int)$id)) {
            return $this->fail('Product not found.', 404);
        }
        $saved = $this->storeUploadedImages((int)$id, $_FILES['images'] ?? null);
        Cache::catalogChanged();
        return $this->done(count($saved) . ' image(s) uploaded & optimized.', ['images' => $saved]);
    }

    public function deleteImage(Request $r, string $id): Response
    {
        $img = DB::one('SELECT * FROM product_images WHERE id = ?', [(int)$id]);
        if (!$img) {
            return $this->fail('Image not found.', 404);
        }
        DB::exec('DELETE FROM product_images WHERE id = ?', [$img['id']]);
        ImageService::deleteVariants($img['path'], $img['ext'], 'product');
        Audit::log('product.image_delete', 'product', (int)$img['product_id']);
        Cache::catalogChanged();
        return $this->done('Image deleted.', []);
    }

    public function reorderImages(Request $r, string $id): Response
    {
        $order = array_map('intval', (array)$r->input('order', []));
        foreach ($order as $i => $imageId) {
            DB::exec('UPDATE product_images SET sort_order = ? WHERE id = ? AND product_id = ?', [$i, $imageId, (int)$id]);
        }
        Cache::catalogChanged();
        return $this->done('Image order saved.', []);
    }

    public function editorUpload(Request $r): Response
    {
        $file = $r->file('image');
        if (!$file) {
            return $this->fail('No image received.');
        }
        $path = ImageService::storeSingle($file, 'editor', 1400);
        return $this->done('Image uploaded.', ['url' => upload_url($path)]);
    }

    public function search(Request $r): Response
    {
        $q = '%' . str_replace(['%', '_'], ['\%', '\_'], trim((string)$r->get('q', ''))) . '%';
        $rows = DB::all('SELECT id, name, sku FROM products WHERE deleted_at IS NULL AND (name LIKE ? OR sku LIKE ?) ORDER BY id DESC LIMIT 10', [$q, $q]);
        return Response::success('OK', ['items' => $rows]);
    }

    // ------------------------------------------------------------------

    /** @return array<int, array{size:string,color:string,sku:?string,price:?float,stock:int}> */
    private function parseVariants(Request $r, array $sizes, array $colors): array
    {
        $rows = (array)$r->input('variants', []);
        $out = [];
        foreach ($rows as $v) {
            if (!is_array($v)) {
                continue;
            }
            $size = mb_substr(trim((string)($v['size'] ?? '')), 0, 60);
            $color = mb_substr(trim((string)($v['color'] ?? '')), 0, 60);
            if (($sizes && !in_array($size, $sizes, true)) || ($colors && !in_array($color, $colors, true))) {
                continue;
            }
            if (!$sizes) {
                $size = '';
            }
            if (!$colors) {
                $color = '';
            }
            if ($size === '' && $color === '') {
                continue;
            }
            $price = en_digits(trim((string)($v['price'] ?? '')));
            $out[$size . '|' . $color] = [
                'size' => $size, 'color' => $color,
                'sku' => mb_substr(trim((string)($v['sku'] ?? '')), 0, 80) ?: null,
                'price' => is_numeric($price) ? round((float)$price, 2) : null,
                'stock' => max(0, (int)en_digits((string)($v['stock'] ?? 0))),
            ];
        }
        return array_values($out);
    }

    private function syncVariants(int $productId, array $variants): void
    {
        $keep = [];
        foreach ($variants as $v) {
            DB::exec(
                'INSERT INTO product_variants (product_id, size, color, sku, price, stock, status) VALUES (?, ?, ?, ?, ?, ?, "active")
                 ON DUPLICATE KEY UPDATE sku = VALUES(sku), price = VALUES(price), stock = VALUES(stock), status = "active"',
                [$productId, $v['size'], $v['color'], $v['sku'], $v['price'], $v['stock']]
            );
            $keep[] = $v['size'] . '|' . $v['color'];
        }
        foreach (DB::all('SELECT id, size, color FROM product_variants WHERE product_id = ?', [$productId]) as $row) {
            if (!in_array($row['size'] . '|' . $row['color'], $keep, true)) {
                DB::exec('DELETE FROM product_variants WHERE id = ?', [$row['id']]);
            }
        }
    }

    /** Process a multi-file upload field → compressed variants + product_images rows. */
    private function storeUploadedImages(int $productId, ?array $files): array
    {
        if (!$files || !is_array($files['name'] ?? null)) {
            return [];
        }
        $saved = [];
        $next = (int)DB::value('SELECT COALESCE(MAX(sort_order), -1) + 1 FROM product_images WHERE product_id = ?', [$productId]);
        $count = min(12, count($files['name']));
        for ($i = 0; $i < $count; $i++) {
            if (($files['error'][$i] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) {
                continue;
            }
            $file = ['name' => $files['name'][$i], 'type' => $files['type'][$i], 'tmp_name' => $files['tmp_name'][$i], 'error' => $files['error'][$i], 'size' => $files['size'][$i]];
            $img = ImageService::storeVariants($file, 'product');
            $imageId = DB::insert('product_images', [
                'product_id' => $productId, 'path' => $img['path'], 'ext' => $img['ext'], 'width' => $img['width'], 'height' => $img['height'],
                'bytes' => $img['bytes'], 'sort_order' => $next++,
            ]);
            $saved[] = ['id' => $imageId, 'url' => image_url($img['path'], 'sm', $img['ext']), 'original' => $img['original_bytes'], 'bytes' => $img['bytes']];
        }
        return $saved;
    }
}

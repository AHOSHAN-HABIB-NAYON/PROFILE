<?php
/**
 * Delivery charges (inside/outside Dhaka), which districts count as "inside",
 * free-delivery rules and delivery time texts.
 */
final class AdminDeliveryController extends AdminController
{
    public function index(Request $r): Response
    {
        return $this->page('delivery', [
            'districts' => config('districts'),
            'inside' => array_map('trim', explode(',', (string)setting('inside_districts'))),
            'freeCategories' => DB::all('SELECT name FROM categories WHERE deleted_at IS NULL AND is_free_delivery = 1'),
            'freeProducts' => (int)DB::value('SELECT COUNT(*) FROM products WHERE deleted_at IS NULL AND is_free_delivery = 1'),
        ], ['title' => 'Delivery', 'nav' => 'delivery', 'page' => 'delivery']);
    }

    public function save(Request $r): Response
    {
        $inside = array_values(array_intersect((array)$r->input('inside_districts', []), config('districts')));
        if (!$inside) {
            return $this->fail('Select at least one district for “inside Dhaka”.');
        }
        $values = [
            'delivery_inside' => (string)$this->money($r, 'delivery_inside'),
            'delivery_outside' => (string)$this->money($r, 'delivery_outside'),
            'inside_districts' => implode(',', $inside),
            'free_delivery_enabled' => $r->bool('free_delivery_enabled') ? '1' : '0',
            'free_delivery_threshold' => (string)$this->money($r, 'free_delivery_threshold'),
            'delivery_time_inside' => $r->str('delivery_time_inside', 60),
            'delivery_time_outside' => $r->str('delivery_time_outside', 60),
            'order_min_amount' => (string)$this->money($r, 'order_min_amount'),
        ];
        $old = array_intersect_key(Setting::all(), $values);
        Setting::setMany($values);
        [$o, $n] = Audit::diff($old, $values);
        Audit::log('settings.delivery', 'settings', null, $o ?: null, $n ?: null);
        Cache::catalogChanged();
        return $this->done('Delivery settings saved.');
    }
}

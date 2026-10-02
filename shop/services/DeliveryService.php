<?php
final class DeliveryService
{
    public static function isDhaka(string $district): bool
    {
        $d = mb_strtolower(trim($district));
        if ($d === '') {
            return false;
        }
        foreach (array_filter(array_map('trim', explode(',', (string) setting('dhaka_keywords', 'ঢাকা,dhaka')))) as $kw) {
            if (str_contains($d, mb_strtolower($kw))) {
                return true;
            }
        }
        return false;
    }

    /** @return array{zone:string, charge:float, label:string} */
    public static function quote(string $district, bool $allFree): array
    {
        if (!Settings::on('delivery_enabled')) {
            return ['zone' => 'free', 'charge' => 0.0, 'label' => 'ডেলিভারি চার্জ নেই'];
        }
        if ($allFree) {
            return ['zone' => 'free', 'charge' => 0.0, 'label' => 'ফ্রি ডেলিভারি'];
        }
        if ($district === '') {
            return ['zone' => 'unknown', 'charge' => (float) setting('delivery_outside_dhaka'), 'label' => 'জেলা লিখলে চার্জ নির্ধারিত হবে'];
        }
        return self::isDhaka($district)
            ? ['zone' => 'inside', 'charge' => (float) setting('delivery_inside_dhaka'), 'label' => 'ঢাকার ভিতরে']
            : ['zone' => 'outside', 'charge' => (float) setting('delivery_outside_dhaka'), 'label' => 'ঢাকার বাইরে'];
    }
}

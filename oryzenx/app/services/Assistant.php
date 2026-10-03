<?php
/** AI assistant. API keys stay server-side; falls back to a local knowledge answer. */
final class Assistant
{
    public static function knowledge(): string
    {
        $cacheFile = STORAGE . '/cache/ai-knowledge-' . lang() . '.txt';
        if (is_file($cacheFile) && filemtime($cacheFile) > time() - 600) return (string)file_get_contents($cacheFile);

        $k = "COMPANY: " . setting('site_name') . ' — ' . sl('site_tagline') . "\n" . sl('site_description') . "\n";
        $k .= "WEBSITE: " . base_url() . "\n\nSERVICES (starting prices):\n";
        foreach (DB::all('SELECT s.*, c.name AS cat FROM services s LEFT JOIN service_categories c ON c.id = s.category_id WHERE s.is_active = 1 ORDER BY s.sort_order, s.id') as $s) {
            $f = DB::col('SELECT feature FROM service_features WHERE service_id = ? ORDER BY sort_order LIMIT 8', [$s['id']]);
            $k .= "- {$s['title']}" . ($s['title_bn'] ? " ({$s['title_bn']})" : '') . ': ' . ($s['currency'] === 'BDT' ? '৳' : '$') . (float)$s['price'] . ($s['price_plus'] ? '+' : '')
                . ($s['delivery_days'] ? ", delivery {$s['delivery_days']} days" : '') . '. ' . $s['short_desc'] . ($f ? ' Includes: ' . implode(', ', $f) : '')
                . ' URL: ' . url('/services/' . $s['slug']) . "\n";
        }
        $k .= "\nPAYMENT METHODS: ";
        $k .= implode(', ', array_column(DB::all('SELECT name FROM payment_methods WHERE is_active = 1 ORDER BY sort_order'), 'name'));
        $k .= ".\nOrder process: choose a service → Buy Now → choose payment method → send payment → submit transaction ID and screenshot → admin verifies (usually within a few hours) → status shown in profile.\n";
        $k .= "\nTEAM:\n";
        foreach (DB::all('SELECT name, role, skills FROM team_members WHERE is_active = 1 ORDER BY sort_order LIMIT 20') as $m) $k .= "- {$m['name']}: {$m['role']}" . ($m['skills'] ? " ({$m['skills']})" : '') . "\n";
        $k .= "\nCONTACT: Email " . setting('contact_email') . ', WhatsApp ' . setting('contact_whatsapp') . ', Telegram @' . setting('contact_telegram') . ', Hours: ' . sl('contact_hours') . ". Contact page: " . url('/contact') . "\n";
        $k .= "\nFAQ:\n";
        foreach (DB::all('SELECT question, answer FROM faqs WHERE is_active = 1 ORDER BY sort_order LIMIT 30') as $q) $k .= "Q: {$q['question']}\nA: " . strip_tags($q['answer']) . "\n";
        $k .= "\nPOLICY: " . setting('legal_notice') . "\n";
        $k .= "WEBSITE FEATURES: Bengali & English, dark mode, installable app (PWA), notifications, secure accounts with 2FA and passkeys.\n";
        @file_put_contents($cacheFile, $k, LOCK_EX);
        return $k;
    }

    public static function aiReady(): bool { return setting('ai_enabled') === '1' && setting('ai_api_key') !== ''; }

    /** @param array $history list of ['role'=>..., 'content'=>...] (oldest first) */
    public static function reply(array $history, ?string &$source = null): string
    {
        if (self::aiReady()) {
            try {
                $source = 'ai';
                return self::callProvider($history);
            } catch (Throwable $e) {
                ErrorHandler::log('ai', $e->getMessage());
            }
        }
        $source = 'local';
        return self::localAnswer((string)end($history)['content']);
    }

    public static function callProvider(array $history, ?string $overrideKey = null): string
    {
        $system = setting('ai_system_prompt') . "\n\nToday: " . date('Y-m-d') . '. Interface language: ' . (lang() === 'bn' ? 'Bengali' : 'English') . ".\n\nCOMPANY INFORMATION:\n" . self::knowledge();
        $messages = [['role' => 'system', 'content' => $system]];
        foreach (array_slice($history, -10) as $m) $messages[] = ['role' => $m['role'], 'content' => mb_substr($m['content'], 0, 2000)];
        $base = rtrim(setting('ai_base_url') ?: 'https://api.openai.com/v1', '/');
        $r = Http::json('POST', $base . '/chat/completions', [
            'model' => setting('ai_model') ?: 'gpt-4o-mini', 'messages' => $messages, 'temperature' => 0.4, 'max_tokens' => 500,
        ], ['Authorization' => 'Bearer ' . ($overrideKey ?? setting('ai_api_key'))], 40);
        $text = $r['json']['choices'][0]['message']['content'] ?? null;
        if ($r['status'] !== 200 || !is_string($text)) {
            throw new RuntimeException('AI provider error ' . $r['status'] . ': ' . mb_substr($r['json']['error']['message'] ?? $r['error'] ?? $r['body'], 0, 300));
        }
        return trim($text);
    }

    /** Keyword based answer from the database when no AI provider is configured. */
    public static function localAnswer(string $q): string
    {
        $ql = mb_strtolower($q);
        $bn = lang() === 'bn';
        $has = fn(array $words) => (bool)array_filter($words, fn($w) => str_contains($ql, $w));

        if ($has(['price', 'cost', 'দাম', 'মূল্য', 'কত', 'খরচ', 'service', 'সার্ভিস', 'সেবা'])) {
            $matches = [];
            foreach (DB::all('SELECT title, title_bn, slug, price, currency, price_plus FROM services WHERE is_active = 1 ORDER BY sort_order') as $s) {
                $words = array_filter(preg_split('/[\s.\/]+/u', mb_strtolower($s['title'] . ' ' . $s['title_bn'])), fn($w) => mb_strlen($w) > 2);
                foreach ($words as $w) if (str_contains($ql, $w)) { $matches[] = $s; break; }
            }
            $list = $matches ?: DB::all('SELECT title, title_bn, slug, price, currency, price_plus FROM services WHERE is_active = 1 AND is_featured = 1 ORDER BY sort_order LIMIT 6');
            $lines = array_map(fn($s) => '• ' . tr($s, 'title') . ' — ' . money($s['price'], $s['currency'], (bool)$s['price_plus']), array_slice($list, 0, 6));
            return ($bn ? "আমাদের সার্ভিসের শুরুর মূল্য:\n" : "Our starting prices:\n") . implode("\n", $lines) . ($bn ? "\n\nবিস্তারিত: সার্ভিস পেজ দেখুন।" : "\n\nSee the Services page for details.");
        }
        if ($has(['pay', 'bkash', 'বিকাশ', 'usdt', 'binance', 'পেমেন্ট', 'টাকা'])) {
            $m = implode(', ', array_column(DB::all('SELECT name FROM payment_methods WHERE is_active = 1 ORDER BY sort_order'), 'name'));
            return $bn ? "পেমেন্ট মাধ্যম: $m।\nসার্ভিস বেছে নিয়ে \"Buy Now\" চাপুন, পেমেন্ট পাঠিয়ে ট্রানজেকশন আইডি ও স্ক্রিনশট জমা দিন। অ্যাডমিন যাচাই করে অনুমোদন দেবেন।"
                : "Payment methods: $m.\nPick a service, tap \"Buy Now\", send the payment and submit the transaction ID and screenshot. An admin verifies and approves it.";
        }
        if ($has(['contact', 'whatsapp', 'email', 'যোগাযোগ', 'হোয়াটসঅ্যাপ', 'ইমেইল', 'support', 'সাপোর্ট'])) {
            return ($bn ? 'যোগাযোগ: ' : 'Contact us: ') . "\nWhatsApp: " . setting('contact_whatsapp') . "\nEmail: " . setting('contact_email') . "\nTelegram: @" . setting('contact_telegram');
        }
        if ($has(['team', 'টিম', 'developer', 'ডেভেলপার'])) {
            $t = array_map(fn($m) => "• {$m['name']} — {$m['role']}", DB::all('SELECT name, role FROM team_members WHERE is_active = 1 ORDER BY sort_order LIMIT 8'));
            return ($bn ? "আমাদের টিম:\n" : "Our team:\n") . implode("\n", $t);
        }
        foreach (DB::all('SELECT question, question_bn, answer, answer_bn FROM faqs WHERE is_active = 1') as $f) {
            $words = array_filter(preg_split('/\s+/u', mb_strtolower($f['question'] . ' ' . $f['question_bn'])), fn($w) => mb_strlen($w) > 3);
            $hits = count(array_filter($words, fn($w) => str_contains($ql, $w)));
            if ($hits >= 2) return strip_tags(tr($f, 'answer'));
        }
        return $bn ? "👋 আমি Oryzenx সহকারী। সার্ভিস, দাম, পেমেন্ট বা যোগাযোগ সম্পর্কে জিজ্ঞেস করুন। জরুরি হলে WhatsApp: " . setting('contact_whatsapp')
            : "👋 I'm the Oryzenx assistant. Ask me about services, prices, payments or contact details. For urgent help, WhatsApp: " . setting('contact_whatsapp');
    }
}

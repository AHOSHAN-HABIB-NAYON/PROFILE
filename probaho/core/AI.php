<?php
/**
 * AI Assistant. Answers are grounded in the site's own knowledge:
 * Admin knowledge base + FAQ + services + products + payment methods +
 * announcements + live support settings (never hard-coded).
 *
 * Providers (Admin → AI):
 *   local      — built-in retrieval answers, no external API needed
 *   anthropic  — Claude via the Messages API (key kept server-side)
 *   openai     — any OpenAI-compatible Chat Completions endpoint
 * Any provider error falls back to the local retrieval answer.
 */
declare(strict_types=1);

final class AI
{
    private const SYNONYMS = [
        'telegram' => ['টেলিগ্রাম'], 'টেলিগ্রাম' => ['telegram'],
        'whatsapp' => ['হোয়াটসঅ্যাপ', 'হোয়াটস'], 'হোয়াটসঅ্যাপ' => ['whatsapp'],
        'binance' => ['বাইন্যান্স', 'বিনান্স'], 'বাইন্যান্স' => ['binance'], 'বিনান্স' => ['binance'],
        'passkey' => ['পাসকি'], 'পাসকি' => ['passkey'],
        'deposit' => ['জমা'], 'জমা' => ['deposit'], 'withdraw' => ['উত্তোলন', 'তুলব', 'তোলা'], 'উত্তোলন' => ['withdraw'],
        'transfer' => ['ট্রান্সফার', 'পাঠাব', 'পাঠানো'], 'ট্রান্সফার' => ['transfer'],
        'support' => ['সাপোর্ট', 'যোগাযোগ', 'হেল্প'], 'সাপোর্ট' => ['support'], 'যোগাযোগ' => ['support', 'contact'],
        'install' => ['ইনস্টল'], 'ইনস্টল' => ['install', 'pwa'], 'অ্যাপ' => ['app', 'install'],
        'login' => ['লগইন'], 'লগইন' => ['login'], 'register' => ['রেজিস্টার', 'অ্যাকাউন্ট'], 'অ্যাকাউন্ট' => ['account', 'register'],
        'transaction' => ['লেনদেন'], 'লেনদেন' => ['transaction'], 'service' => ['সার্ভিস', 'সেবা'], 'সার্ভিস' => ['service'], 'সেবা' => ['service'],
        'report' => ['রিপোর্ট', 'অভিযোগ'], 'রিপোর্ট' => ['report'], 'payment' => ['পেমেন্ট'], 'পেমেন্ট' => ['payment'],
        'product' => ['প্রোডাক্ট', 'নতুন'], 'প্রোডাক্ট' => ['product'], 'fee' => ['ফি', 'চার্জ'], 'ফি' => ['fee'], 'চার্জ' => ['fee'],
    ];

    public static function enabled(): bool
    {
        return setting_on('ai_enabled');
    }

    // ------------------------------------------------------------- knowledge

    /** @return array<int, array{title:string, text:string, keywords:string, priority:int}> */
    public static function documents(): array
    {
        $docs = [];
        $add = static function (string $title, string $text, string $keywords = '', int $priority = 0) use (&$docs) {
            $text = trim($text);
            if ($text !== '') {
                $docs[] = ['title' => $title, 'text' => $text, 'keywords' => $keywords, 'priority' => $priority];
            }
        };
        $site = (string) setting('site_name', 'Probaho');

        $add('সাইট তথ্য', "{$site} (" . setting('site_name_bn') . '): ' . setting('site_description') . "\nইমেইল: " . setting('contact_email') . "\nফোন: " . setting('contact_phone') . "\nঠিকানা: " . setting('contact_address') . "\nওয়েবসাইট: " . abs_url('/'), 'site,about,contact,email,phone,ফোন,ইমেইল,ঠিকানা,address', 5);

        // Live support channels from Admin → Support (only enabled ones).
        $support = [];
        if (setting('support.telegram_enabled') == 1 && setting('support.telegram_url') !== '') {
            $support[] = 'Telegram: ' . setting('support.telegram_name') . ' (@' . ltrim((string) setting('support.telegram_username'), '@') . ') — ' . setting('support.telegram_url');
        }
        if (setting('support.whatsapp_enabled') == 1 && setting('support.whatsapp_url') !== '') {
            $support[] = 'WhatsApp: ' . setting('support.whatsapp_name') . ' (' . setting('support.whatsapp_number') . ') — ' . setting('support.whatsapp_url');
        }
        $add('হিউম্যান সাপোর্ট / যোগাযোগ', ($support ? implode("\n", $support) : 'এই মুহূর্তে সরাসরি চ্যাট সাপোর্ট বন্ধ আছে।') . "\nকাজের সময়: " . setting('support.working_hours') . "\n" . setting('support.response_message') . "\nসাপোর্ট পেজ: " . abs_url('/support'), 'support,telegram,whatsapp,help,contact,সাপোর্ট,যোগাযোগ,টেলিগ্রাম,হোয়াটসঅ্যাপ,human,মানুষ', 9);

        $logins = ['ইমেইল/মোবাইল ও পাসওয়ার্ড' => setting_on('auth_manual'), 'Google (Continue with Google)' => setting_on('auth_google'), 'Passkey (ফিঙ্গারপ্রিন্ট/ফেস/PIN)' => setting_on('auth_passkey')];
        $add('লগইন পদ্ধতি', 'চালু থাকা লগইন পদ্ধতি: ' . implode(', ', array_keys(array_filter($logins))) . '। Binance দিয়ে লগইন করা যায় না — Binance Pay শুধুমাত্র পেমেন্ট মেথড।', 'login,লগইন,google,passkey,password', 4);

        if (BinancePay::enabled()) {
            $binance = 'Binance Pay নির্দেশনা:' . "\n" . setting('binance_instructions') . "\nপেজ: " . abs_url('/payment/binance-pay') . "\nসর্বনিম্ন " . setting('binance_min') . ', সর্বোচ্চ ' . setting('binance_max') . ' ' . setting('binance_currency', 'USDT') . '।';
            if (BinancePay::mode() === 'manual' && setting('binance_pay_id') !== '') {
                $binance .= "\nআমাদের Binance Pay ID: " . setting('binance_pay_id') . (setting('binance_pay_name') !== '' ? ' (' . setting('binance_pay_name') . ')' : '');
            }
            $add('Binance Pay', $binance, 'binance,বাইন্যান্স,usdt,crypto,pay,deposit,জমা', 8);
        }

        foreach (db()->all('SELECT * FROM ai_knowledge WHERE is_active = 1 ORDER BY priority DESC, id') as $k) {
            $add($k['title'], $k['content'], (string) $k['keywords'] . ',' . $k['category'], (int) $k['priority']);
        }
        foreach (db()->all('SELECT question, answer FROM faqs WHERE is_active = 1 ORDER BY sort_order') as $f) {
            $add('FAQ: ' . $f['question'], $f['answer'], 'faq', 3);
        }
        $services = db()->all('SELECT title, subtitle, description, price, slug FROM services WHERE is_active = 1 ORDER BY sort_order');
        if ($services) {
            $lines = array_map(static fn ($s) => '• ' . $s['title'] . ($s['subtitle'] ? ' (' . $s['subtitle'] . ')' : '') . ': ' . $s['description'] . ((float) $s['price'] > 0 ? ' — মূল্য ' . money($s['price']) : ''), $services);
            $add('সার্ভিস তালিকা', "আমাদের সার্ভিসসমূহ (" . abs_url('/services') . "):\n" . implode("\n", $lines), 'service,সার্ভিস,সেবা,nid,sim,imei,recharge,bill,রিচার্জ,বিল', 4);
        }
        $methods = db()->all('SELECT name, description, direction, min_amount, max_amount, fee_percent, fee_fixed FROM payment_methods WHERE is_active = 1 ORDER BY sort_order');
        if ($methods) {
            $dirs = ['deposit' => 'জমা', 'withdraw' => 'উত্তোলন', 'both' => 'জমা ও উত্তোলন'];
            $lines = array_map(static fn ($m) => '• ' . $m['name'] . ' (' . $dirs[$m['direction']] . '): ' . $m['description'] . '। সীমা ' . money($m['min_amount']) . '–' . money($m['max_amount']) . ', ফি ' . (float) $m['fee_percent'] . '%' . ((float) $m['fee_fixed'] > 0 ? ' + ' . money($m['fee_fixed']) : ''), $methods);
            $add('পেমেন্ট মেথড ও ফি', implode("\n", $lines) . "\nট্রান্সফার ফি: " . (float) setting('transfer_fee_percent', '0') . '% + ' . money(setting('transfer_fee_fixed', '0')), 'payment,method,fee,ফি,চার্জ,deposit,withdraw,মেথড', 4);
        }
        foreach (db()->all("SELECT slug, title_bn, title_en, summary, description, release_date FROM products WHERE status = 'published' ORDER BY published_at DESC LIMIT 10") as $p) {
            $add('প্রোডাক্ট: ' . $p['title_bn'], $p['title_bn'] . ($p['title_en'] ? ' / ' . $p['title_en'] : '') . ' — রিলিজ: ' . bn_date($p['release_date'], false) . "\n" . ($p['summary'] ?: mb_substr((string) $p['description'], 0, 600)) . "\nলিংক: " . abs_url('/products/' . $p['slug']), 'product,প্রোডাক্ট,নতুন,release,রিলিজ', 2);
        }
        foreach (db()->all("SELECT title, body, created_at FROM product_posts WHERE status = 'published' ORDER BY is_pinned DESC, created_at DESC LIMIT 5") as $a) {
            $add('ঘোষণা: ' . $a['title'], $a['body'] . ' (' . bn_date($a['created_at'], false) . ')', 'announcement,ঘোষণা,news,নোটিশ', 2);
        }
        foreach (db()->all("SELECT slug, title, content FROM pages WHERE slug IN ('terms','privacy')") as $pg) {
            $add($pg['title'], mb_substr($pg['content'], 0, 1500) . "\nবিস্তারিত: " . abs_url('/' . $pg['slug']), $pg['slug'] . ',policy,নীতি,শর্ত', 1);
        }
        $add('অ্যাপ ইনস্টল', 'Android/Chrome: "অ্যাপ ইনস্টল করুন" বাটন বা ব্রাউজার মেনু → Add to Home Screen। iPhone Safari: Share → Add to Home Screen। Desktop: অ্যাড্রেস বারের ইনস্টল আইকন।', 'install,pwa,app,ইনস্টল,অ্যাপ', 1);
        return $docs;
    }

    private static function tokens(string $text): array
    {
        $text = mb_strtolower($text);
        $parts = preg_split('/[^\p{L}\p{M}\p{N}]+/u', $text, -1, PREG_SPLIT_NO_EMPTY) ?: [];
        $stop = ['কী', 'কি', 'কীভাবে', 'কিভাবে', 'আমি', 'আমার', 'করব', 'করবো', 'করে', 'আছে', 'কোথায়', 'the', 'how', 'what', 'is', 'a', 'to', 'do', 'i', 'can', 'my', 'and', 'আপনাদের', 'দিয়ে', 'দিয়ে', 'এর', 'ও', 'না'];
        $out = [];
        foreach ($parts as $p) {
            if (mb_strlen($p) < 2 || in_array($p, $stop, true)) {
                continue;
            }
            $out[] = $p;
            foreach (self::SYNONYMS[$p] ?? [] as $syn) {
                $out[] = $syn;
            }
        }
        return array_values(array_unique($out));
    }

    /** Rank documents for a question. */
    public static function search(string $question, int $limit = 5): array
    {
        $q = self::tokens($question);
        $scored = [];
        foreach (self::documents() as $doc) {
            $hayTitle = mb_strtolower($doc['title'] . ' ' . $doc['keywords']);
            $hayText = mb_strtolower($doc['text']);
            $score = 0.0;
            foreach ($q as $t) {
                if (mb_strpos($hayTitle, $t) !== false) {
                    $score += 3;
                }
                if (mb_strpos($hayText, $t) !== false) {
                    $score += 1;
                } elseif (mb_strlen($t) >= 4 && mb_strpos($hayText, mb_substr($t, 0, mb_strlen($t) - 1)) !== false) {
                    $score += 0.5;
                }
            }
            if ($score > 0) {
                $scored[] = $doc + ['score' => $score + $doc['priority'] * 0.05];
            }
        }
        usort($scored, static fn ($a, $b) => $b['score'] <=> $a['score']);
        return array_slice($scored, 0, $limit);
    }

    // ------------------------------------------------------------------ chat

    /** @return array{answer:string, source:string} */
    public static function reply(string $question, array $history): array
    {
        $hits = self::search($question, 6);
        $provider = (string) setting('ai_provider', 'local');
        if ($provider !== 'local' && setting('ai_api_key') !== '') {
            try {
                $answer = $provider === 'anthropic' ? self::anthropic($question, $history, $hits) : self::openai($question, $history, $hits);
                if ($answer !== '') {
                    return ['answer' => $answer, 'source' => $provider];
                }
            } catch (Throwable $e) {
                Logger::error($e);
            }
        }
        return ['answer' => self::localAnswer($question, $hits), 'source' => 'local'];
    }

    private static function localAnswer(string $question, array $hits): string
    {
        $q = mb_strtolower($question);
        if (preg_match('/^(hi|hello|hey|সালাম|আসসালামু|হ্যালো|হাই)/u', $q)) {
            return (string) setting('ai_welcome');
        }
        if (!$hits || $hits[0]['score'] < 2) {
            return "দুঃখিত, এই প্রশ্নের নির্দিষ্ট উত্তর আমার কাছে নেই। 🙏\n\n" . self::supportLine();
        }
        $best = $hits[0];
        $answer = $best['text'];
        if (isset($hits[1]) && $hits[1]['score'] >= $best['score'] * 0.8 && $hits[1]['title'] !== $best['title']) {
            $answer .= "\n\n— " . $hits[1]['title'] . ":\n" . $hits[1]['text'];
        }
        return mb_substr($answer, 0, 1800);
    }

    public static function supportLine(): string
    {
        $lines = [];
        if (setting('support.telegram_enabled') == 1 && setting('support.telegram_url') !== '') {
            $lines[] = 'Telegram: ' . setting('support.telegram_url');
        }
        if (setting('support.whatsapp_enabled') == 1 && setting('support.whatsapp_url') !== '') {
            $lines[] = 'WhatsApp: ' . setting('support.whatsapp_url');
        }
        return $lines ? "সরাসরি সাহায্যের জন্য আমাদের সাপোর্ট টিমের সাথে যোগাযোগ করুন:\n" . implode("\n", $lines) : 'সরাসরি সাহায্যের জন্য সাপোর্ট পেজ দেখুন: ' . abs_url('/support');
    }

    private static function systemPrompt(array $hits): string
    {
        $docs = $hits;
        // Always include support + site info so contact questions are grounded.
        foreach (self::documents() as $d) {
            if (in_array($d['title'], ['সাইট তথ্য', 'হিউম্যান সাপোর্ট / যোগাযোগ'], true) && !in_array($d['title'], array_column($docs, 'title'), true)) {
                $docs[] = $d;
            }
        }
        $kb = '';
        foreach ($docs as $i => $d) {
            $kb .= '<doc index="' . ($i + 1) . '" title="' . str_replace('"', "'", $d['title']) . "\">\n" . $d['text'] . "\n</doc>\n";
        }
        return trim((string) setting('ai_system_prompt')) . "\n\nAssistant name: " . setting('ai_name') . "\nSite: " . setting('site_name') . ' — ' . abs_url('/')
            . "\nToday: " . date('Y-m-d') . "\n\n<site_knowledge>\n" . $kb . "</site_knowledge>\n\n"
            . 'Use only facts from <site_knowledge>. Copy links, IDs and numbers exactly as written there. Keep answers under 120 words, plain text, no markdown tables.';
    }

    private static function anthropic(string $question, array $history, array $hits): string
    {
        $model = (string) (setting('ai_model') ?: 'claude-opus-5-5');
        $messages = [];
        foreach (array_slice($history, -8) as $h) {
            $messages[] = ['role' => $h['role'] === 'assistant' ? 'assistant' : 'user', 'content' => $h['content']];
        }
        $messages[] = ['role' => 'user', 'content' => $question];
        // The Messages API requires the first turn to be from the user.
        while ($messages && $messages[0]['role'] !== 'user') {
            array_shift($messages);
        }
        $body = [
            'model' => $model,
            'max_tokens' => 1024,
            'system' => self::systemPrompt($hits),
            'messages' => $messages,
        ];
        $headers = [
            'x-api-key: ' . setting('ai_api_key'),
            'anthropic-version: 2023-06-01',
        ];
        if (in_array($model, ['claude-opus-5-5', 'claude-opus-5', 'claude-fable-5-1', 'claude-sonnet-5-5'], true)) {
            // Short chat answers: low effort keeps latency and cost down.
            $body['output_config'] = ['effort' => 'low'];
            // Route safety-classifier refusals to a fallback model server-side.
            $body['fallbacks'] = 'default';
            $headers[] = 'anthropic-beta: server-side-fallback-2026-07-01';
        }
        $base = rtrim((string) (setting('ai_base_url') ?: 'https://api.anthropic.com'), '/');
        $res = Http::post($base . '/v1/messages', $body, $headers, true, 60);
        $json = $res['json'] ?? [];
        if ($res['status'] !== 200) {
            throw new RuntimeException('Anthropic API ' . $res['status'] . ': ' . mb_substr($res['body'], 0, 300));
        }
        if (($json['stop_reason'] ?? '') === 'refusal') {
            return '';
        }
        $text = '';
        foreach ($json['content'] ?? [] as $block) {
            if (($block['type'] ?? '') === 'text') {
                $text .= $block['text'];
            }
        }
        return trim($text);
    }

    private static function openai(string $question, array $history, array $hits): string
    {
        $messages = [['role' => 'system', 'content' => self::systemPrompt($hits)]];
        foreach (array_slice($history, -8) as $h) {
            $messages[] = ['role' => $h['role'] === 'assistant' ? 'assistant' : 'user', 'content' => $h['content']];
        }
        $messages[] = ['role' => 'user', 'content' => $question];
        $base = rtrim((string) (setting('ai_base_url') ?: 'https://api.openai.com/v1'), '/');
        $res = Http::post($base . '/chat/completions', [
            'model' => (string) setting('ai_model'),
            'messages' => $messages,
            'max_tokens' => 700,
        ], ['Authorization: Bearer ' . setting('ai_api_key')], true, 60);
        if ($res['status'] !== 200) {
            throw new RuntimeException('AI API ' . $res['status'] . ': ' . mb_substr($res['body'], 0, 300));
        }
        return trim((string) ($res['json']['choices'][0]['message']['content'] ?? ''));
    }
}

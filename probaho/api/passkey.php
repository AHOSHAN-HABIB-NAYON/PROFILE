<?php
/** /api/passkey/* — WebAuthn registration, login and management. */
declare(strict_types=1);

require_post();
if (!WebAuthn::enabled()) {
    fail('Passkey বর্তমানে বন্ধ আছে।');
}

switch ($action) {
    case 'login-options':
        if (!RateLimit::hit('pk-opt:' . client_ip(), 30, 300)) {
            fail('অনেকবার চেষ্টা হয়েছে। কিছুক্ষণ পর আবার চেষ্টা করুন।', 429);
        }
        ok(['options' => WebAuthn::loginOptions()]);
        break;

    case 'login':
        if (RateLimit::locked('passkey', client_ip())) {
            fail('অনেকবার ব্যর্থ চেষ্টা হয়েছে। কিছুক্ষণ পর আবার চেষ্টা করুন।', 429);
        }
        $cred = input('credential');
        if (!is_array($cred)) {
            fail('Passkey তথ্য পাওয়া যায়নি।');
        }
        try {
            $u = WebAuthn::authenticate($cred);
        } catch (DomainException $e) {
            RateLimit::record('passkey', client_ip(), false);
            fail('এই Passkey কোনো অ্যাকাউন্টের সাথে যুক্ত নেই। পাসওয়ার্ড দিয়ে লগইন করে Passkey যোগ করুন।');
        } catch (Throwable $e) {
            Logger::write('PASSKEY', $e->getMessage());
            RateLimit::record('passkey', client_ip(), false);
            fail('Passkey যাচাই করা যায়নি। আবার চেষ্টা করুন।');
        }
        if ($u['status'] !== 'active') {
            fail('আপনার অ্যাকাউন্ট স্থগিত করা হয়েছে।', 403);
        }
        // A passkey is already multi-factor (possession + biometric/PIN), so no TOTP step.
        Auth::login($u, input_bool('remember'), 'passkey');
        ok(['redirect' => url(safe_next((string) input('next', '')))], 'Passkey দিয়ে লগইন সফল');
        break;

    case 'register-options':
        $u = api_user();
        if ((int) db()->val('SELECT COUNT(*) FROM passkeys WHERE user_id = ?', [$u['id']]) >= 10) {
            fail('সর্বোচ্চ ১০টি Passkey রাখা যায়। পুরনো একটি মুছে নতুন যোগ করুন।');
        }
        ok(['options' => WebAuthn::registrationOptions($u)]);
        break;

    case 'register':
        $u = api_user();
        $cred = input('credential');
        if (!is_array($cred)) {
            fail('Passkey তথ্য পাওয়া যায়নি।');
        }
        try {
            $pk = WebAuthn::register($u, $cred, input_str('name', 100));
        } catch (Throwable $e) {
            Logger::write('PASSKEY', 'register: ' . $e->getMessage());
            fail('Passkey যোগ করা যায়নি। আবার চেষ্টা করুন।');
        }
        Notify::user((int) $u['id'], 'security', 'নতুন Passkey যোগ হয়েছে', '"' . $pk['name'] . '" Passkey আপনার অ্যাকাউন্টে যোগ হয়েছে।', '/settings#passkeys', [
            'email' => ['passkey_added', ['passkey' => $pk['name'], 'device' => $pk['device_info']]],
        ]);
        ok([], 'Passkey সফলভাবে যোগ হয়েছে ✓');
        break;

    case 'rename':
        $u = api_user();
        $name = input_str('name', 100);
        if ($name === '') {
            fail('একটি নাম দিন।');
        }
        db()->q('UPDATE passkeys SET name = ? WHERE id = ? AND user_id = ?', [$name, input_int('id'), $u['id']]);
        ok([], 'নাম পরিবর্তন হয়েছে');
        break;

    case 'delete':
        $u = api_user();
        $count = (int) db()->val('SELECT COUNT(*) FROM passkeys WHERE user_id = ?', [$u['id']]);
        if ($count <= 1 && !$u['password_hash'] && !$u['google_id']) {
            fail('এটি আপনার একমাত্র লগইন পদ্ধতি। আগে একটি পাসওয়ার্ড সেট করুন।');
        }
        $pk = db()->row('SELECT name FROM passkeys WHERE id = ? AND user_id = ?', [input_int('id'), $u['id']]);
        if (!$pk) {
            fail('Passkey পাওয়া যায়নি।', 404);
        }
        db()->q('DELETE FROM passkeys WHERE id = ? AND user_id = ?', [input_int('id'), $u['id']]);
        Notify::user((int) $u['id'], 'security', 'Passkey মুছে ফেলা হয়েছে', '"' . $pk['name'] . '" Passkey আপনার অ্যাকাউন্ট থেকে সরানো হয়েছে।', '/settings#passkeys', ['push' => false]);
        ok([], 'Passkey মুছে ফেলা হয়েছে');
        break;
}

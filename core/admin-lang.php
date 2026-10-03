<?php
/**
 * Bangla for the admin panel. Admin screens are written in English; when the
 * interface language is Bangla, admin_tr() swaps every UI string that exactly
 * matches an entry below (text nodes + placeholder/title/aria-label/confirm).
 * User content never matches whole-string UI labels, so it is left alone.
 */
defined('APP') || exit;

function admin_dict(): array
{
    static $d = null;
    if ($d !== null) return $d;
    return $d = [
        // chrome & menu
        'ADMIN' => 'অ্যাডমিন', 'Main' => 'মূল', 'Commerce' => 'কমার্স', 'Content' => 'কনটেন্ট', 'People' => 'ইউজার ও সাপোর্ট', 'System' => 'সিস্টেম', 'Account' => 'অ্যাকাউন্ট',
        'Dashboard' => 'ড্যাশবোর্ড', 'Analytics' => 'অ্যানালিটিক্স', 'Payments' => 'পেমেন্ট', 'Orders' => 'অর্ডার', 'Services' => 'সার্ভিস', 'Products' => 'প্রোডাক্ট',
        'News' => 'নিউজ', 'Team' => 'টিম', 'Media & Compressor' => 'মিডিয়া ও কম্প্রেসার', 'Users' => 'ইউজার', 'Support' => 'সাপোর্ট', 'Notifications' => 'নোটিফিকেশন',
        'AI Assistant' => 'AI অ্যাসিস্ট্যান্ট', 'Settings' => 'সেটিংস', 'Security & Audit' => 'সিকিউরিটি ও অডিট', 'View website' => 'ওয়েবসাইট দেখুন', 'View site' => 'সাইট দেখুন',
        'My security' => 'আমার সিকিউরিটি', 'Logout' => 'লগআউট', 'More' => 'আরও', 'Menu' => 'মেনু', 'Search' => 'সার্চ', 'Admin menu' => 'অ্যাডমিন মেনু', 'Admin navigation' => 'অ্যাডমিন নেভিগেশন',
        'Search users, orders, payments…' => 'ইউজার, অর্ডার, পেমেন্ট খুঁজুন…', 'Theme' => 'থিম', 'Language' => 'ভাষা', 'Payment methods' => 'পেমেন্ট মেথড', 'Social links' => 'সোশ্যাল লিংক',
        'Master control center' => 'মাস্টার কন্ট্রোল সেন্টার', 'Close' => 'বন্ধ', 'Notifications' => 'নোটিফিকেশন', 'Welcome back,' => 'আবার স্বাগতম,',
        // common actions
        'Save' => 'সেভ করুন', 'Add' => 'যোগ করুন', 'Edit' => 'এডিট', 'Delete' => 'ডিলিট', 'Remove' => 'রিমুভ', 'View' => 'দেখুন', 'Back' => 'ফিরে যান', 'Change' => 'পরিবর্তন',
        'Upload' => 'আপলোড', 'Download' => 'ডাউনলোড', 'Copy' => 'কপি', 'Preview' => 'প্রিভিউ', 'Send' => 'পাঠান', 'Reply' => 'উত্তর দিন', 'Approve' => 'অনুমোদন', 'Reject' => 'বাতিল করুন',
        'Restore' => 'রিস্টোর', 'Revoke' => 'রিভোক', 'Suspend' => 'সাসপেন্ড', 'Ban' => 'ব্যান', 'Activate' => 'অ্যাক্টিভ করুন', 'Manage' => 'ম্যানেজ', 'Mark read' => 'পড়া হয়েছে',
        'Move up' => 'উপরে', 'Move down' => 'নিচে', 'Run test' => 'টেস্ট চালান', 'Test AI' => 'AI টেস্ট', 'Save user' => 'ইউজার সেভ', 'Save to library' => 'লাইব্রেরিতে সেভ',
        'Logout all' => 'সব ডিভাইস থেকে লগআউট', 'Reset password' => 'পাসওয়ার্ড রিসেট', 'Verify email' => 'ইমেইল ভেরিফাই', 'Send notification' => 'নোটিফিকেশন পাঠান',
        'Send test email' => 'টেস্ট ইমেইল পাঠান', 'Generate VAPID keys' => 'VAPID কী তৈরি করুন', 'Restart countdown' => 'কাউন্টডাউন রিস্টার্ট', 'Compose' => 'লিখুন',
        'New post' => 'নতুন পোস্ট', 'View feed' => 'ফিড দেখুন', 'View page' => 'পেজ দেখুন', 'View payments' => 'পেমেন্ট দেখুন', 'Buy Now' => 'এখনই কিনুন', 'Customer view' => 'কাস্টমার ভিউ',
        // columns & labels
        'Amount' => 'পরিমাণ', 'Status' => 'স্ট্যাটাস', 'Method' => 'মেথড', 'Date' => 'তারিখ', 'Time' => 'সময়', 'Role' => 'রোল', 'Order' => 'অর্ডার', 'Device' => 'ডিভাইস',
        'Devices' => 'ডিভাইস', 'Balance' => 'ব্যালেন্স', 'Balance after' => 'পরের ব্যালেন্স', 'Type' => 'ধরন', 'Target' => 'টার্গেট', 'Result' => 'ফলাফল', 'Notify' => 'নোটিফাই',
        'Library' => 'লাইব্রেরি', 'Last seen' => 'শেষ দেখা', 'Last active' => 'শেষ সক্রিয়', 'Joined' => 'যোগদান', 'Email' => 'ইমেইল', 'Categories' => 'ক্যাটাগরি', 'Category' => 'ক্যাটাগরি',
        'All' => 'সব', 'Any' => 'যেকোনো', 'None' => 'কিছু না', 'User' => 'ইউজার', 'Customer' => 'কাস্টমার', 'Staff' => 'স্টাফ', 'Admin' => 'অ্যাডমিন', 'Name' => 'নাম', 'Phone' => 'ফোন',
        'Password' => 'পাসওয়ার্ড', 'Username' => 'ইউজারনেম', 'Description' => 'বিবরণ', 'Icon' => 'আইকন', 'Image' => 'ছবি', 'Logo' => 'লোগো', 'Favicon' => 'ফেভিকন', 'Badge' => 'ব্যাজ',
        'Label' => 'লেবেল', 'Slug' => 'স্লাগ', 'Slug (URL)' => 'স্লাগ (URL)', 'Keywords' => 'কিওয়ার্ড', 'Tags (comma separated)' => 'ট্যাগ (কমা দিয়ে)', 'Note' => 'নোট', 'Reason' => 'কারণ',
        'Created' => 'তৈরি', 'Submitted' => 'জমা', 'Reviewed' => 'রিভিউ', 'Approved' => 'অনুমোদিত', 'Pending' => 'পেন্ডিং', 'Sent' => 'পাঠানো', 'Read' => 'পড়া', 'Enabled' => 'চালু',
        'Visible' => 'দৃশ্যমান', 'Available' => 'অ্যাভেইলেবল', 'Verified' => 'ভেরিফায়েড', 'Primary' => 'প্রাইমারি', 'Soft' => 'সফট', 'Ghost' => 'গোস্ট', 'Original' => 'অরিজিনাল', 'Compressed' => 'কম্প্রেসড',
        'Product' => 'প্রোডাক্ট', 'Service' => 'সার্ভিস', 'Post' => 'পোস্ট', 'Posts' => 'পোস্ট', 'Profile' => 'প্রোফাইল', 'Spent' => 'খরচ', 'By' => 'দ্বারা', 'Action' => 'অ্যাকশন',
        'Notification' => 'নোটিফিকেশন', 'Recipients' => 'প্রাপক', 'Send to' => 'যাদের পাঠাবেন', 'Channels' => 'চ্যানেল', 'In-app' => 'অ্যাপের ভেতরে', 'Push' => 'পুশ', 'Web push' => 'ওয়েব পুশ',
        'Attachment' => 'অ্যাটাচমেন্ট', 'Admin note' => 'অ্যাডমিন নোট', 'User note' => 'ইউজার নোট', 'VIP user' => 'VIP ইউজার', 'Expected amount' => 'প্রত্যাশিত পরিমাণ', 'Payment method' => 'পেমেন্ট মেথড',
        'Title (English)' => 'টাইটেল (ইংরেজি)', 'Message (English)' => 'মেসেজ (ইংরেজি)', 'Link (optional)' => 'লিংক (ঐচ্ছিক)', 'Also send by email' => 'ইমেইলেও পাঠান', '…also email it' => '…ইমেইলও করুন',
        'Display name' => 'ডিসপ্লে নাম', 'Short name' => 'সংক্ষিপ্ত নাম', 'Profile photo' => 'প্রোফাইল ছবি', 'Team member' => 'টিম মেম্বার', 'Skills (comma separated)' => 'স্কিল (কমা দিয়ে)',
        'Website / portfolio' => 'ওয়েবসাইট / পোর্টফোলিও', 'CV (PDF, PNG or JPG)' => 'CV (PDF, PNG বা JPG)', 'Social link' => 'সোশ্যাল লিংক',
        'Price (USD)' => 'দাম (USD)', 'Price (BDT) — blank = auto from rate' => 'দাম (BDT) — খালি = রেট থেকে অটো', 'Discount %' => 'ডিসকাউন্ট %', 'Delivery time (days)' => 'ডেলিভারি সময় (দিন)',
        'Support period (months)' => 'সাপোর্ট সময় (মাস)', 'Demo URL' => 'ডেমো URL', 'Highlight as popular' => 'পপুলার হিসেবে দেখান', 'Featured on home page' => 'হোম পেজে ফিচার্ড',
        'Featured post' => 'ফিচার্ড পোস্ট', 'Featured image' => 'ফিচার্ড ছবি', 'Cover image' => 'কভার ছবি', 'Banner image' => 'ব্যানার ছবি', 'News category' => 'নিউজ ক্যাটাগরি',
        'Publish date (future = scheduled)' => 'প্রকাশের তারিখ (ভবিষ্যৎ = শিডিউল)', 'Emoji (shown in lists)' => 'ইমোজি (লিস্টে দেখাবে)', 'Icon (when no emoji)' => 'আইকন (ইমোজি না থাকলে)',
        'Font Awesome icon' => 'Font Awesome আইকন', 'Custom icon image (optional, replaces FA icon)' => 'কাস্টম আইকন ছবি (ঐচ্ছিক)', 'Starting price (USD, blank = from products)' => 'শুরুর দাম (USD, খালি = প্রোডাক্ট থেকে)',
        'Send notification to all users when published (push + in-app)' => 'প্রকাশ হলে সব ইউজারকে নোটিফিকেশন পাঠান (পুশ + অ্যাপ)', 'SEO title' => 'SEO টাইটেল', 'SEO description' => 'SEO বিবরণ', 'SEO keywords' => 'SEO কিওয়ার্ড',
        'Code (unique, e.g. bkash, usdt_trc20)' => 'কোড (ইউনিক, যেমন bkash, usdt_trc20)', 'Account number (bKash)' => 'অ্যাকাউন্ট নম্বর (বিকাশ)', 'Account type (Personal / Merchant / Agent)' => 'অ্যাকাউন্ট টাইপ (পার্সোনাল / মার্চেন্ট / এজেন্ট)',
        'Wallet address (crypto)' => 'ওয়ালেট অ্যাড্রেস (ক্রিপ্টো)', 'Network (e.g. TRON TRC20, BNB Smart Chain BEP20)' => 'নেটওয়ার্ক (যেমন TRON TRC20, BNB Smart Chain BEP20)', 'Binance Pay ID' => 'Binance Pay ID',
        'Binance Pay name' => 'Binance Pay নাম', 'QR code image' => 'QR কোড ছবি', 'Payment link (https)' => 'পেমেন্ট লিংক (https)', 'Currency the customer pays in' => 'কাস্টমার যে কারেন্সিতে পে করবে',
        'Official logo (optional)' => 'অফিসিয়াল লোগো (ঐচ্ছিক)', 'Estimated duration (minutes)' => 'আনুমানিক সময় (মিনিট)', 'Countdown ends at' => 'কাউন্টডাউন শেষ হবে',
        // dashboards & lists
        'Recent payments' => 'সাম্প্রতিক পেমেন্ট', 'Recent conversations' => 'সাম্প্রতিক কথোপকথন', 'Newest users' => 'নতুন ইউজার', 'Newest' => 'নতুন', 'Oldest' => 'পুরোনো',
        'Top pages' => 'টপ পেজ', 'Top services' => 'টপ সার্ভিস', 'Top news' => 'টপ নিউজ', 'Traffic sources' => 'ট্রাফিক সোর্স', 'Countries' => 'দেশ', 'Cities' => 'শহর', 'Browsers' => 'ব্রাউজার',
        'Operating systems' => 'অপারেটিং সিস্টেম', 'Bangladesh divisions' => 'বাংলাদেশের বিভাগ', 'Most viewed products (all time)' => 'সবচেয়ে বেশি দেখা প্রোডাক্ট',
        'All users' => 'সব ইউজার', 'All roles' => 'সব রোল', 'All methods' => 'সব মেথড', 'All statuses' => 'সব স্ট্যাটাস', 'All categories' => 'সব ক্যাটাগরি', 'All services' => 'সব সার্ভিস',
        'All conversations' => 'সব কথোপকথন', 'Live chat' => 'লাইভ চ্যাট', 'Contact messages' => 'কন্টাক্ট মেসেজ', 'Sent by staff' => 'স্টাফ পাঠিয়েছে', 'Login history' => 'লগইন হিস্ট্রি',
        'Active sessions (' => 'সক্রিয় সেশন (', 'Health checks' => 'হেলথ চেক', 'Environment' => 'এনভায়রনমেন্ট', 'Database' => 'ডাটাবেস', 'Configuration' => 'কনফিগারেশন', 'Encryption' => 'এনক্রিপশন',
        'Security settings' => 'সিকিউরিটি সেটিংস', 'Cron (recommended)' => 'Cron (প্রস্তাবিত)', 'App version' => 'অ্যাপ ভার্সন', 'Test the assistant' => 'অ্যাসিস্ট্যান্ট টেস্ট করুন',
        'Image compressor' => 'ইমেজ কম্প্রেসার', 'Media' => 'মিডিয়া', 'Minimum quality' => 'সর্বনিম্ন কোয়ালিটি', 'Output format' => 'আউটপুট ফরম্যাট', 'Keep original' => 'অরিজিনাল রাখুন',
        'WebP (best)' => 'WebP (সেরা)', 'Max width/height (px)' => 'সর্বোচ্চ প্রস্থ/উচ্চতা (px)', 'Drop images here or tap to upload' => 'ছবি এখানে ছাড়ুন বা ট্যাপ করে আপলোড করুন',
        'Choose an image (JPG, JPEG, PNG, WebP)' => 'একটি ছবি বেছে নিন (JPG, JPEG, PNG, WebP)', 'Target size (% of original, e.g. 10 → 5 MB ≈ 500 KB)' => 'টার্গেট সাইজ (অরিজিনালের %, যেমন 10 → 5 MB ≈ 500 KB)',
        'Never go below quality' => 'এর নিচে কোয়ালিটি নামবে না', 'One item per line.' => 'প্রতি লাইনে একটি।', 'Play sound' => 'সাউন্ড বাজান', 'Settings sections' => 'সেটিংস সেকশন',
        // empty states
        'No conversations yet.' => 'এখনো কোনো কথোপকথন নেই।', 'No balance changes.' => 'কোনো ব্যালেন্স পরিবর্তন নেই।', 'No contact messages.' => 'কোনো কন্টাক্ট মেসেজ নেই।',
        'No media yet.' => 'এখনো কোনো মিডিয়া নেই।', 'No orders found.' => 'কোনো অর্ডার পাওয়া যায়নি।', 'No orders.' => 'কোনো অর্ডার নেই।', 'No payments here.' => 'এখানে কোনো পেমেন্ট নেই।',
        'No payments yet.' => 'এখনো কোনো পেমেন্ট নেই।', 'No payments.' => 'কোনো পেমেন্ট নেই।', 'No recorded activity.' => 'কোনো অ্যাক্টিভিটি নেই।', 'No users match.' => 'কোনো ইউজার মেলেনি।',
        'Nothing here yet.' => 'এখানে এখনো কিছু নেই।', 'Nothing sent yet.' => 'এখনো কিছু পাঠানো হয়নি।',
        // search placeholders & confirms
        'Type a reply…' => 'উত্তর লিখুন…', 'Name, email, phone or ID' => 'নাম, ইমেইল, ফোন বা ID', 'Order code, product, customer…' => 'অর্ডার কোড, প্রোডাক্ট, কাস্টমার…',
        'TXID, order, user email…' => 'TXID, অর্ডার, ইউজার ইমেইল…', 'Search users by name or email…' => 'নাম বা ইমেইল দিয়ে ইউজার খুঁজুন…', 'Search file name or usage…' => 'ফাইলের নাম বা ব্যবহার খুঁজুন…',
        'Action, admin, IP, description…' => 'অ্যাকশন, অ্যাডমিন, IP, বিবরণ…',
        'Approve this payment and mark the order approved?' => 'এই পেমেন্ট অনুমোদন করে অর্ডারটি অনুমোদিত করবেন?', 'Ban this user? They will be logged out everywhere.' => 'এই ইউজারকে ব্যান করবেন? সব জায়গা থেকে লগআউট হয়ে যাবে।',
        'Delete this account? It can be restored later.' => 'এই অ্যাকাউন্ট ডিলিট করবেন? পরে রিস্টোর করা যাবে।', 'Delete this message?' => 'এই মেসেজটি ডিলিট করবেন?', 'End this session?' => 'এই সেশনটি শেষ করবেন?',
        'Log this user out of all devices?' => 'এই ইউজারকে সব ডিভাইস থেকে লগআউট করবেন?', 'Mark email as verified?' => 'ইমেইল ভেরিফায়েড হিসেবে চিহ্নিত করবেন?', 'Re-activate this account?' => 'অ্যাকাউন্টটি আবার চালু করবেন?',
        'Restart the countdown from now using the estimated duration?' => 'আনুমানিক সময় দিয়ে এখন থেকে কাউন্টডাউন রিস্টার্ট করবেন?', 'Restore this account?' => 'অ্যাকাউন্টটি রিস্টোর করবেন?', 'Send this notification now?' => 'নোটিফিকেশনটি এখনই পাঠাবেন?',
        'Add or replace the admin note (visible to the customer).' => 'অ্যাডমিন নোট যোগ বা পরিবর্তন করুন (কাস্টমার দেখতে পাবে)।',
        // settings groups
        'General' => 'সাধারণ', 'Home page' => 'হোম পেজ', 'Contact & Footer' => 'কন্টাক্ট ও ফুটার', 'Security' => 'সিকিউরিটি', 'SMTP / Email' => 'SMTP / ইমেইল', 'Maintenance' => 'মেইনটেন্যান্স',
        'Google Login' => 'Google লগইন', 'SEO' => 'SEO', 'PWA' => 'PWA', 'Sitemap' => 'সাইটম্যাপ',
        // settings fields
        'Site name' => 'সাইটের নাম', 'Site URL' => 'সাইট URL', 'Timezone' => 'টাইমজোন', 'Default language' => 'ডিফল্ট ভাষা', 'Default display currency' => 'ডিফল্ট কারেন্সি',
        'USD → BDT rate (used when a product has no BDT price)' => 'USD → BDT রেট (প্রোডাক্টে BDT দাম না থাকলে)', 'Contact email' => 'কন্টাক্ট ইমেইল', 'Support email' => 'সাপোর্ট ইমেইল',
        'WhatsApp number' => 'WhatsApp নম্বর', 'WhatsApp number (international, e.g. 8801XXXXXXXXX)' => 'WhatsApp নম্বর (আন্তর্জাতিক, যেমন 8801XXXXXXXXX)', 'Show contact buttons' => 'কন্টাক্ট বাটন দেখান',
        'Admin alert email (new payments, contact messages)' => 'অ্যাডমিন অ্যালার্ট ইমেইল (নতুন পেমেন্ট, মেসেজ)', 'Enable contact form' => 'কন্টাক্ট ফর্ম চালু', 'Orders enabled (Buy Now)' => 'অর্ডার চালু (এখনই কিনুন)',
        'Allow paying with account balance' => 'অ্যাকাউন্ট ব্যালেন্স দিয়ে পেমেন্ট', 'Reuse an unpaid order for the same product within (hours)' => 'একই প্রোডাক্টের অপরিশোধিত অর্ডার পুনরায় ব্যবহার (ঘণ্টা)',
        'Primary color' => 'প্রাইমারি কালার', 'Secondary color' => 'সেকেন্ডারি কালার', 'Accent color' => 'অ্যাকসেন্ট কালার', 'Primary (pressed)' => 'প্রাইমারি (চাপা)', 'Background (light)' => 'ব্যাকগ্রাউন্ড (লাইট)',
        'Card (light)' => 'কার্ড (লাইট)', 'Text (light)' => 'টেক্সট (লাইট)', 'Card radius (px)' => 'কার্ড রেডিয়াস (px)', 'Allow dark mode' => 'ডার্ক মোড চালু', 'Default mode' => 'ডিফল্ট মোড',
        'Enable animations' => 'অ্যানিমেশন চালু', 'VIP badge animation' => 'VIP ব্যাজ অ্যানিমেশন', 'Theme color' => 'থিম কালার', 'Splash background' => 'স্প্ল্যাশ ব্যাকগ্রাউন্ড',
        'Sections (visibility & order)' => 'সেকশন (দেখানো ও ক্রম)', 'Primary button link' => 'প্রাইমারি বাটন লিংক', 'Secondary button link' => 'সেকেন্ডারি বাটন লিংক', 'CTA link' => 'CTA লিংক',
        'About image' => 'অ্যাবাউট ছবি', 'Latest posts on home' => 'হোমে সর্বশেষ পোস্ট', 'Statistics — one per line: value | English label | Bangla label | icon' => 'পরিসংখ্যান — প্রতি লাইনে: মান | ইংরেজি লেবেল | বাংলা লেবেল | আইকন',
        'Platform slider — one per line: icon | label | link' => 'প্ল্যাটফর্ম স্লাইডার — প্রতি লাইনে: আইকন | লেবেল | লিংক', 'Why items — icon | English title | Bangla title | English text | Bangla text' => 'কেন আমরা — আইকন | ইংরেজি টাইটেল | বাংলা টাইটেল | ইংরেজি টেক্সট | বাংলা টেক্সট',
        'Allow new registrations' => 'নতুন রেজিস্ট্রেশন চালু', 'Require email verification before login' => 'লগইনের আগে ইমেইল ভেরিফিকেশন বাধ্যতামূলক', 'Minimum password length' => 'পাসওয়ার্ডের সর্বনিম্ন দৈর্ঘ্য',
        'Password must contain letters and numbers' => 'পাসওয়ার্ডে অক্ষর ও সংখ্যা থাকতে হবে', 'Max failed login attempts' => 'সর্বোচ্চ ভুল লগইন চেষ্টা', 'Lock duration (minutes)' => 'লক সময় (মিনিট)',
        'Session duration (days)' => 'সেশনের মেয়াদ (দিন)', 'Require 2FA for staff accounts' => 'স্টাফ অ্যাকাউন্টে 2FA বাধ্যতামূলক', 'Send login alert emails' => 'লগইন অ্যালার্ট ইমেইল পাঠান',
        'Email code when logging in from a new device' => 'নতুন ডিভাইস থেকে লগইনে ইমেইল কোড', 'Enable passkeys (WebAuthn)' => 'পাসকি চালু (WebAuthn)', 'Enable reCAPTCHA v3 (login, register, contact)' => 'reCAPTCHA v3 চালু (লগইন, রেজিস্টার, কন্টাক্ট)',
        'reCAPTCHA site key' => 'reCAPTCHA সাইট কী', 'reCAPTCHA secret key' => 'reCAPTCHA সিক্রেট কী', 'Minimum score (0.0 – 1.0)' => 'সর্বনিম্ন স্কোর (0.0 – 1.0)',
        'Maximum upload size (MB)' => 'সর্বোচ্চ আপলোড সাইজ (MB)', 'Allowed image types' => 'অনুমোদিত ছবির ধরন', 'Compress images automatically on upload' => 'আপলোডে ছবি অটো কম্প্রেস', 'Convert uploads to WebP' => 'আপলোড WebP তে রূপান্তর',
        'Max image width/height (px)' => 'ছবির সর্বোচ্চ প্রস্থ/উচ্চতা (px)', 'Thumbnail width (px)' => 'থাম্বনেইল প্রস্থ (px)', 'Host' => 'হোস্ট', 'Port' => 'পোর্ট', 'From email' => 'প্রেরকের ইমেইল', 'From name' => 'প্রেরকের নাম',
        'Email logo' => 'ইমেইল লোগো', 'Maintenance mode (admins can still browse)' => 'মেইনটেন্যান্স মোড (অ্যাডমিন ব্রাউজ করতে পারবে)', 'Enable Google login' => 'Google লগইন চালু', 'Client ID' => 'Client ID', 'Client secret' => 'Client secret',
        'Authorized redirect URI' => 'অনুমোদিত রিডাইরেক্ট URI', 'Enable AI chatbot' => 'AI চ্যাটবট চালু', 'Provider' => 'প্রোভাইডার', 'Model' => 'মডেল', 'API key (only for OpenAI / compatible)' => 'API কী (শুধু OpenAI / compatible এর জন্য)',
        'API base URL' => 'API বেস URL', 'Max tokens per reply' => 'প্রতি উত্তরে সর্বোচ্চ টোকেন', 'Temperature (blank = model default; some models ignore it)' => 'Temperature (খালি = মডেল ডিফল্ট)', 'Extra system prompt' => 'অতিরিক্ত সিস্টেম প্রম্পট',
        'Max AI replies per visitor' => 'ভিজিটর প্রতি সর্বোচ্চ AI উত্তর', '…per this many minutes' => '…এত মিনিটে', 'Show greeting hint bubble' => 'গ্রিটিং হিন্ট বাবল দেখান', 'Enable live customer chat' => 'লাইভ কাস্টমার চ্যাট চালু',
        '"Online" window (minutes)' => '"অনলাইন" সময় (মিনিট)', 'FAQ (English) — Question | Answer' => 'FAQ (ইংরেজি) — প্রশ্ন | উত্তর', 'Enable PWA (installable app + offline)' => 'PWA চালু (ইনস্টলযোগ্য অ্যাপ + অফলাইন)',
        'App name (blank = site name)' => 'অ্যাপের নাম (খালি = সাইটের নাম)', 'App icon (512×512)' => 'অ্যাপ আইকন (512×512)', 'Show install popup' => 'ইনস্টল পপআপ দেখান', 'Install popup delay (seconds)' => 'ইনস্টল পপআপ দেরি (সেকেন্ড)',
        'Web push notifications' => 'ওয়েব পুশ নোটিফিকেশন', 'VAPID public key' => 'VAPID পাবলিক কী', 'VAPID private key' => 'VAPID প্রাইভেট কী', 'Push contact (mailto: or https URL)' => 'পুশ কন্টাক্ট (mailto: বা https URL)',
        'Polling interval (seconds, while page is visible)' => 'পোলিং ইন্টারভাল (সেকেন্ড)', 'Notification sound (default for users)' => 'নোটিফিকেশন সাউন্ড (ইউজারদের ডিফল্ট)', 'Email notifications' => 'ইমেইল নোটিফিকেশন',
        'Welcome notification on registration' => 'রেজিস্ট্রেশনে স্বাগতম নোটিফিকেশন', 'Allow promotion notifications' => 'প্রমোশন নোটিফিকেশন চালু', 'Enable visitor analytics' => 'ভিজিটর অ্যানালিটিক্স চালু',
        'Keep page views for (days)' => 'পেজ ভিউ রাখুন (দিন)', 'Look up visitor location via ipapi.co when Cloudflare geo headers are absent (sends IP to a third party)' => 'Cloudflare জিও হেডার না থাকলে ipapi.co দিয়ে লোকেশন খুঁজুন (IP তৃতীয় পক্ষে যায়)',
        'Allow search engines to index the site' => 'সার্চ ইঞ্জিনে ইনডেক্স করার অনুমতি', 'Default OG / share image' => 'ডিফল্ট OG / শেয়ার ছবি', 'OG title (blank = meta title)' => 'OG টাইটেল (খালি = মেটা টাইটেল)', 'OG description' => 'OG বিবরণ',
        'X/Twitter @handle' => 'X/Twitter @হ্যান্ডেল', 'X/Twitter card' => 'X/Twitter কার্ড', 'Google site verification code' => 'Google সাইট ভেরিফিকেশন কোড', 'Bing site verification code' => 'Bing সাইট ভেরিফিকেশন কোড',
        'Output Organization structured data' => 'Organization structured data দেখান', 'Extra robots.txt rules' => 'অতিরিক্ত robots.txt রুল', 'Platform key' => 'প্ল্যাটফর্ম কী',
        // dashboards, statuses, validation
        'Account balance' => 'অ্যাকাউন্ট ব্যালেন্স',
        'Active products' => 'সক্রিয় প্রোডাক্ট',
        'Activity' => 'অ্যাক্টিভিটি',
        'Admin 2FA required' => 'অ্যাডমিন 2FA বাধ্যতামূলক',
        'Administrator' => 'অ্যাডমিনিস্ট্রেটর',
        'Approved payments' => 'অনুমোদিত পেমেন্ট',
        'Audit log' => 'অডিট লগ',
        'Balance history' => 'ব্যালেন্স হিস্ট্রি',
        'Built-in assistant (no API key)' => 'বিল্ট-ইন অ্যাসিস্ট্যান্ট (API কী লাগে না)',
        'Choose an option' => 'একটি বেছে নিন',
        'Deleted' => 'ডিলিটেড',
        'Direct' => 'সরাসরি',
        'Disabled' => 'বন্ধ',
        'Draft' => 'ড্রাফট',
        'Editor' => 'এডিটর',
        'Email unverified' => 'ইমেইল ভেরিফাই হয়নি',
        'Email verified' => 'ইমেইল ভেরিফায়েড',
        'English' => 'ইংরেজি',
        'Enter a title in at least one language.' => 'অন্তত একটি ভাষায় টাইটেল দিন।',
        'Errors are logged to storage/logs, never shown to visitors.' => 'এরর storage/logs এ লগ হয়, ভিজিটরকে কখনো দেখানো হয় না।',
        'Excerpt (optional)' => 'সংক্ষেপ (ঐচ্ছিক)',
        'External model' => 'এক্সটার্নাল মডেল',
        'Failed' => 'ব্যর্থ',
        'Featured' => 'ফিচার্ড',
        'Features (one per line)' => 'ফিচার (প্রতি লাইনে একটি)',
        'Full description' => 'পূর্ণ বিবরণ',
        'Generate VAPID keys to enable Web Push notifications.' => 'ওয়েব পুশ চালু করতে VAPID কী তৈরি করুন।',
        'Guest' => 'গেস্ট',
        'Install an SSL certificate and use https:// in config/env.php.' => 'SSL সার্টিফিকেট ইনস্টল করে config/env.php তে https:// ব্যবহার করুন।',
        'Installer locked' => 'ইনস্টলার লক',
        'Instructions' => 'নির্দেশনা',
        'Invalid date' => 'ভুল তারিখ',
        'Invalid email' => 'ভুল ইমেইল',
        'Login & IP' => 'লগইন ও IP',
        'Login attempts' => 'লগইন চেষ্টা',
        'Member' => 'মেম্বার',
        'Must be a number' => 'সংখ্যা হতে হবে',
        'Must start with https://' => 'https:// দিয়ে শুরু হতে হবে',
        'Needed for WebP conversion of uploads.' => 'আপলোড WebP তে রূপান্তরের জন্য দরকার।',
        'New users (7d)' => 'নতুন ইউজার (৭ দিন)',
        'New users (last 7 days)' => 'নতুন ইউজার (গত ৭ দিন)',
        'New visitors' => 'নতুন ভিজিটর',
        'News posts' => 'নিউজ পোস্ট',
        'No URL set' => 'URL দেওয়া নেই',
        'No data yet' => 'এখনো ডেটা নেই',
        'No division data yet (needs Cloudflare region headers or geo lookup).' => 'এখনো বিভাগের ডেটা নেই (Cloudflare হেডার বা জিও লুকআপ দরকার)।',
        'Not allowed' => 'অনুমতি নেই',
        'Not found' => 'পাওয়া যায়নি',
        'Not set' => 'সেট করা নেই',
        'Online now' => 'এখন অনলাইনে',
        'Open support chats' => 'খোলা সাপোর্ট চ্যাট',
        'Optional: force staff accounts to use 2FA.' => 'ঐচ্ছিক: স্টাফদের 2FA বাধ্যতামূলক করুন।',
        'Optional: protects login, registration, contact.' => 'ঐচ্ছিক: লগইন, রেজিস্ট্রেশন, কন্টাক্ট সুরক্ষিত করে।',
        'Page views' => 'পেজ ভিউ',
        'Page views today' => 'আজকের পেজ ভিউ',
        'Pending payments' => 'পেন্ডিং পেমেন্ট',
        'Please fix the highlighted fields.' => 'চিহ্নিত ঘরগুলো ঠিক করুন।',
        'Popular' => 'পপুলার',
        'Position' => 'পদবি',
        'Product name' => 'প্রোডাক্টের নাম',
        'Protect your admin account with two-factor authentication.' => 'টু-ফ্যাক্টর অথেন্টিকেশন দিয়ে অ্যাডমিন অ্যাকাউন্ট সুরক্ষিত করুন।',
        'Published' => 'প্রকাশিত',
        'Rejected' => 'বাতিল',
        'Rejected payments' => 'বাতিল পেমেন্ট',
        'Reopen' => 'আবার খুলুন',
        'Replies (30d)' => 'উত্তর (৩০ দিন)',
        'Replies today' => 'আজকের উত্তর',
        'Required' => 'আবশ্যক',
        'Returning visitors' => 'ফিরে আসা ভিজিটর',
        'Revenue' => 'আয়',
        'Saved successfully' => 'সফলভাবে সেভ হয়েছে',
        'Scheduled' => 'শিডিউলড',
        'Secrets (SMTP/API keys, 2FA seeds) are encrypted at rest.' => 'সিক্রেট (SMTP/API কী, 2FA) এনক্রিপ্ট করে রাখা হয়।',
        'Selected users' => 'নির্বাচিত ইউজার',
        'Short description' => 'সংক্ষিপ্ত বিবরণ',
        'Staff only' => 'শুধু স্টাফ',
        'Staff sessions' => 'স্টাফ সেশন',
        'Storage writable' => 'স্টোরেজ লেখার যোগ্য',
        'Success' => 'সফল',
        'Support agent' => 'সাপোর্ট এজেন্ট',
        'The installer is disabled after installation.' => 'ইনস্টলের পর ইনস্টলার বন্ধ থাকে।',
        'Title' => 'টাইটেল',
        'Today' => 'আজ',
        'Tokens (30d)' => 'টোকেন (৩০ দিন)',
        'Total orders' => 'মোট অর্ডার',
        'Total page views' => 'মোট পেজ ভিউ',
        'Total users' => 'মোট ইউজার',
        'Unique visitors' => 'ইউনিক ভিজিটর',
        'Unique visitors (30d)' => 'ইউনিক ভিজিটর (৩০ দিন)',
        'Unknown' => 'অজানা',
        'Updated' => 'আপডেটেড',
        'Users with pending payment' => 'পেন্ডিং পেমেন্টসহ ইউজার',
        'Users with unpaid orders' => 'অপরিশোধিত অর্ডারসহ ইউজার',
        'Verified users' => 'ভেরিফায়েড ইউজার',
        'Views / visitor' => 'ভিউ / ভিজিটর',
        'Visitors helped' => 'সাহায্যপ্রাপ্ত ভিজিটর',
        'You cannot change your own role.' => 'আপনি নিজের রোল পরিবর্তন করতে পারবেন না।',
        'SMTP is not configured — emails use PHP mail() and may land in spam.' => 'SMTP সেট করা নেই — ইমেইল PHP mail() দিয়ে যাবে, স্প্যামে যেতে পারে।',
        'No payment method is enabled yet — add your bKash / USDT / Binance Pay details.' => 'এখনো কোনো পেমেন্ট মেথড চালু নেই — বিকাশ / USDT / Binance Pay তথ্য যোগ করুন।',
        'Maintenance mode is ON — visitors see the maintenance page.' => 'মেইনটেন্যান্স মোড চালু — ভিজিটররা মেইনটেন্যান্স পেজ দেখছে।',
        'An external AI provider is selected but no API key is set — the built-in assistant answers instead.' => 'এক্সটার্নাল AI প্রোভাইডার সিলেক্ট করা কিন্তু API কী নেই — বিল্ট-ইন অ্যাসিস্ট্যান্ট উত্তর দিচ্ছে।',
        'Service category' => 'সার্ভিস ক্যাটাগরি',
        'Team members' => 'টিম মেম্বার',
        'Rich editor' => 'রিচ এডিটর',
        'Coin' => 'কয়েন',
        // admin API messages
        'A reason is required' => 'কারণ লিখুন',
        'Account activated' => 'অ্যাকাউন্ট চালু হয়েছে',
        'Balance cannot go below zero' => 'ব্যালেন্স শূন্যের নিচে যেতে পারবে না',
        'Built-in assistant responded' => 'বিল্ট-ইন অ্যাসিস্ট্যান্ট উত্তর দিয়েছে',
        'Could not send email — check SMTP settings' => 'ইমেইল পাঠানো যায়নি — SMTP সেটিংস দেখুন',
        'Countdown restarted' => 'কাউন্টডাউন রিস্টার্ট হয়েছে',
        'Email already used' => 'এই ইমেইল আগেই ব্যবহৃত',
        'Email failed — check SMTP settings' => 'ইমেইল ব্যর্থ — SMTP সেটিংস দেখুন',
        'Email marked verified' => 'ইমেইল ভেরিফায়েড করা হয়েছে',
        'Email sent' => 'ইমেইল পাঠানো হয়েছে',
        'Enter a title' => 'টাইটেল দিন',
        'Enter a valid amount' => 'সঠিক পরিমাণ দিন',
        'File missing on disk' => 'ফাইলটি সার্ভারে নেই',
        'Image replaced everywhere it was used' => 'ছবিটি সব জায়গায় পরিবর্তন হয়েছে',
        'Link must start with / or https://' => 'লিংক / অথবা https:// দিয়ে শুরু হতে হবে',
        'Name is too short' => 'নাম খুব ছোট',
        'Note saved' => 'নোট সেভ হয়েছে',
        'Notification sent' => 'নোটিফিকেশন পাঠানো হয়েছে',
        'Only administrators can change roles' => 'শুধু অ্যাডমিনিস্ট্রেটর রোল পরিবর্তন করতে পারে',
        'Order not found' => 'অর্ডার পাওয়া যায়নি',
        'Order updated' => 'অর্ডার আপডেট হয়েছে',
        'Payment not found' => 'পেমেন্ট পাওয়া যায়নি',
        'Promotion notifications are disabled in settings' => 'সেটিংসে প্রমোশন নোটিফিকেশন বন্ধ',
        'Reply sent' => 'উত্তর পাঠানো হয়েছে',
        'Select at least one user' => 'অন্তত একজন ইউজার বেছে নিন',
        'Session revoked' => 'সেশন বাতিল হয়েছে',
        'Settings saved' => 'সেটিংস সেভ হয়েছে',
        'This is the only active administrator.' => 'এটিই একমাত্র সক্রিয় অ্যাডমিনিস্ট্রেটর।',
        'This payment was already reviewed' => 'এই পেমেন্ট আগেই রিভিউ হয়েছে',
        'Title and message are required' => 'টাইটেল ও মেসেজ আবশ্যক',
        'User deleted (restorable)' => 'ইউজার ডিলিট হয়েছে (রিস্টোর করা যাবে)',
        'User not found' => 'ইউজার পাওয়া যায়নি',
        'User restored' => 'ইউজার রিস্টোর হয়েছে',
        'User saved' => 'ইউজার সেভ হয়েছে',
        'VAPID keys generated — push is ready' => 'VAPID কী তৈরি হয়েছে — পুশ প্রস্তুত',
        'Write a reply first' => 'আগে উত্তর লিখুন',
        'You cannot change your own role' => 'আপনি নিজের রোল পরিবর্তন করতে পারবেন না',
        'You cannot change your own status' => 'আপনি নিজের স্ট্যাটাস পরিবর্তন করতে পারবেন না',
        'You cannot delete yourself' => 'আপনি নিজেকে ডিলিট করতে পারবেন না',
    ];
}

/** "Add post" / "Search posts…" style labels built from a resource name. */
function at_add(string $thing): string { return lang() === 'bn' ? at($thing) . ' যোগ করুন' : 'Add ' . strtolower($thing); }
function at_search(string $thing): string { return lang() === 'bn' ? at($thing) . ' খুঁজুন…' : 'Search ' . strtolower($thing) . 's…'; }

/** Translate one admin UI string (English source). */
function at(string $en): string
{
    if (lang() !== 'bn') return $en;
    $d = admin_dict();
    if (isset($d[$en])) return $d[$en];
    return admin_tr_pattern($en, $d) ?? $en;
}

/** Composite labels: "Tagline (English)", "Content (বাংলা)", "Save general", "Title *". */
function admin_tr_pattern(string $k, array $d): ?string
{
    if (preg_match('~^(.+?) \((English|বাংলা)\)$~u', $k, $m)) {
        $base = $d[$m[1]] ?? (ADMIN_WORDS[$m[1]] ?? null);
        if ($base !== null) return $base . ($m[2] === 'English' ? ' (ইংরেজি)' : ' (বাংলা)');
    }
    if (preg_match('~^Save (.+)$~u', $k, $m)) {
        $x = $d[ucfirst($m[1])] ?? (ADMIN_WORDS[ucfirst($m[1])] ?? null);
        if ($x !== null) return $x . ' সেভ করুন';
    }
    return null;
}

/** Extra single words that mostly appear inside composite labels. */
const ADMIN_WORDS = [
    'Tagline' => 'ট্যাগলাইন', 'Short description' => 'সংক্ষিপ্ত বিবরণ', 'Content' => 'কনটেন্ট', 'Title' => 'টাইটেল', 'Excerpt' => 'সংক্ষেপ', 'Name' => 'নাম', 'Bio' => 'পরিচিতি',
    'Description' => 'বিবরণ', 'Full description' => 'পূর্ণ বিবরণ', 'Features (one per line)' => 'ফিচার (প্রতি লাইনে একটি)', 'Instructions' => 'নির্দেশনা', 'Message' => 'মেসেজ', 'Position' => 'পদবি',
    'Hero badge' => 'হিরো ব্যাজ', 'Hero title' => 'হিরো টাইটেল', 'Hero subtitle' => 'হিরো সাবটাইটেল', 'Primary button' => 'প্রাইমারি বাটন', 'Secondary button' => 'সেকেন্ডারি বাটন',
    'About title' => 'অ্যাবাউট টাইটেল', 'About text' => 'অ্যাবাউট টেক্সট', 'CTA title' => 'CTA টাইটেল', 'CTA text' => 'CTA টেক্সট', 'CTA button' => 'CTA বাটন', 'Why title' => 'কেন আমরা টাইটেল',
    'Meta title' => 'মেটা টাইটেল', 'Meta description' => 'মেটা বিবরণ', 'Footer text' => 'ফুটার টেক্সট', 'Address' => 'ঠিকানা', 'Disclaimer' => 'ডিসক্লেইমার', 'Maintenance message' => 'মেইনটেন্যান্স মেসেজ',
    'Greeting' => 'গ্রিটিং', 'Hint text' => 'হিন্ট টেক্সট', 'Welcome message' => 'স্বাগতম মেসেজ', 'Offline message' => 'অফলাইন মেসেজ', 'Category name' => 'ক্যাটাগরির নাম',
    'General' => 'সাধারণ', 'Theme' => 'থিম', 'Home page' => 'হোম পেজ', 'Home' => 'হোম পেজ', 'Seo' => 'SEO', 'Payments' => 'পেমেন্ট', 'Security' => 'সিকিউরিটি', 'Uploads' => 'আপলোড', 'Smtp' => 'SMTP',
    'Email' => 'ইমেইল', 'Maintenance' => 'মেইনটেন্যান্স', 'Google' => 'Google', 'Ai' => 'AI', 'Chat' => 'চ্যাট', 'Pwa' => 'PWA', 'Notifications' => 'নোটিফিকেশন', 'Analytics' => 'অ্যানালিটিক্স',
    'Copyright line' => 'কপিরাইট লাইন', 'Risk / disclaimer text' => 'ঝুঁকি / ডিসক্লেইমার টেক্সট', 'Primary button text' => 'প্রাইমারি বাটন টেক্সট', 'Secondary button text' => 'সেকেন্ডারি বাটন টেক্সট',
    '"Why choose us" title' => '"কেন আমাদের বেছে নেবেন" টাইটেল', 'Home meta title' => 'হোম মেটা টাইটেল', 'Default meta description' => 'ডিফল্ট মেটা বিবরণ', 'General payment instructions' => 'সাধারণ পেমেন্ট নির্দেশনা',
    'Welcome title' => 'স্বাগতম টাইটেল', 'Business address' => 'ব্যবসার ঠিকানা', 'Business hours' => 'ব্যবসার সময়',
    'Contact' => 'কন্টাক্ট', 'Social' => 'সোশ্যাল', 'Settings' => 'সেটিংস', 'Changes' => 'পরিবর্তন', 'Post' => 'পোস্ট', 'Service' => 'সার্ভিস', 'Product' => 'প্রোডাক্ট', 'User' => 'ইউজার',
];

/** Translate the UI strings of a rendered admin page. */
function admin_tr(string $html): string
{
    if (lang() !== 'bn' || $html === '') return $html;
    $d = admin_dict();
    $html = preg_replace_callback('~>(\s*)([^<>]{1,240}?)(\s*)<~u', function ($m) use ($d) {
        $k = html_entity_decode($m[2], ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $v = $d[$k] ?? (str_contains($k, ' ') ? admin_tr_pattern($k, $d) : null);
        return $v !== null ? '>' . $m[1] . e($v) . $m[3] . '<' : $m[0];
    }, $html) ?? $html;
    return preg_replace_callback('~\b(placeholder|title|aria-label|data-confirm)="([^"]{1,300})"~u', function ($m) use ($d) {
        $k = html_entity_decode($m[2], ENT_QUOTES | ENT_HTML5, 'UTF-8');
        return isset($d[$k]) ? $m[1] . '="' . e($d[$k]) . '"' : $m[0];
    }, $html) ?? $html;
}

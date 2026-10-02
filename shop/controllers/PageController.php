<?php
final class PageController
{
    public function contact(): void
    {
        View::page('pages/contact', [], Seo::forPage('contact', ['title' => 'যোগাযোগ ও সাপোর্ট', 'page' => 'contact', 'cacheable' => true, 'nav' => 'support']));
    }

    public function offline(): void
    {
        View::page('pages/offline', [], ['title' => 'অফলাইন', 'page' => 'offline', 'robots' => 'noindex']);
    }
}

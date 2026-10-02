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

    public function info(string $key): void
    {
        $pages = ['about' => ['আমাদের সম্পর্কে', 'info-circle'], 'privacy' => ['প্রাইভেসি পলিসি', 'shield'], 'terms' => ['শর্তাবলী', 'file-text-o']];
        [$title, $icon] = $pages[$key];
        View::page('pages/info', ['title' => $title, 'icon' => $icon, 'body' => (string) setting('page_' . $key)], [
            'title' => $title, 'page' => 'info', 'cacheable' => true, 'nav' => 'more',
        ]);
    }
}

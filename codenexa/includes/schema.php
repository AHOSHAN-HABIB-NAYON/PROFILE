<?php
/**
 * Database schema and demo content. Used by the installer.
 * Works on both MySQL/MariaDB and SQLite.
 */
declare(strict_types=1);

function schema_sql(string $driver): array
{
    $id  = $driver === 'sqlite' ? 'INTEGER PRIMARY KEY AUTOINCREMENT' : 'INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY';
    $eng = $driver === 'sqlite' ? '' : ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';

    return [
        "CREATE TABLE IF NOT EXISTS settings (
            k VARCHAR(64) NOT NULL PRIMARY KEY,
            v TEXT
        )$eng",
        "CREATE TABLE IF NOT EXISTS users (
            id $id,
            name VARCHAR(120) NOT NULL,
            email VARCHAR(190) NOT NULL UNIQUE,
            password VARCHAR(255) NOT NULL,
            created_at VARCHAR(19) NOT NULL
        )$eng",
        "CREATE TABLE IF NOT EXISTS services (
            id $id,
            title VARCHAR(150) NOT NULL,
            slug VARCHAR(160) NOT NULL UNIQUE,
            icon VARCHAR(80) NOT NULL DEFAULT 'fa-solid fa-code',
            color VARCHAR(20) NOT NULL DEFAULT '#6366f1',
            summary VARCHAR(255) NOT NULL DEFAULT '',
            body TEXT,
            features TEXT,
            sort INT NOT NULL DEFAULT 0,
            active INT NOT NULL DEFAULT 1
        )$eng",
        "CREATE TABLE IF NOT EXISTS projects (
            id $id,
            title VARCHAR(150) NOT NULL,
            category VARCHAR(20) NOT NULL DEFAULT 'web',
            label VARCHAR(80) NOT NULL DEFAULT '',
            color VARCHAR(20) NOT NULL DEFAULT '#6366f1',
            summary VARCHAR(255) NOT NULL DEFAULT '',
            link VARCHAR(255) NOT NULL DEFAULT '',
            sort INT NOT NULL DEFAULT 0,
            active INT NOT NULL DEFAULT 1
        )$eng",
        "CREATE TABLE IF NOT EXISTS pricing (
            id $id,
            name VARCHAR(80) NOT NULL,
            tagline VARCHAR(150) NOT NULL DEFAULT '',
            monthly INT NOT NULL DEFAULT 0,
            yearly INT NOT NULL DEFAULT 0,
            features TEXT,
            popular INT NOT NULL DEFAULT 0,
            sort INT NOT NULL DEFAULT 0
        )$eng",
        "CREATE TABLE IF NOT EXISTS team (
            id $id,
            name VARCHAR(120) NOT NULL,
            role VARCHAR(120) NOT NULL DEFAULT '',
            color VARCHAR(20) NOT NULL DEFAULT '#6366f1',
            sort INT NOT NULL DEFAULT 0
        )$eng",
        "CREATE TABLE IF NOT EXISTS messages (
            id $id,
            name VARCHAR(120) NOT NULL,
            email VARCHAR(190) NOT NULL,
            phone VARCHAR(40) NOT NULL DEFAULT '',
            message TEXT,
            is_read INT NOT NULL DEFAULT 0,
            ip VARCHAR(45) NOT NULL DEFAULT '',
            created_at VARCHAR(19) NOT NULL
        )$eng",
        "CREATE TABLE IF NOT EXISTS visits (
            day VARCHAR(10) NOT NULL PRIMARY KEY,
            hits INT NOT NULL DEFAULT 0
        )$eng",
    ];
}

function schema_install(PDO $pdo, string $driver, array $site, bool $demo): void
{
    foreach (schema_sql($driver) as $sql) {
        $pdo->exec($sql);
    }

    $set = $pdo->prepare($driver === 'sqlite'
        ? 'INSERT OR REPLACE INTO settings (k, v) VALUES (?, ?)'
        : 'REPLACE INTO settings (k, v) VALUES (?, ?)');
    $settings = [
        'site_name'        => $site['name'],
        'tagline'          => 'Smart IT Solutions for a Better Tomorrow',
        'meta_description' => 'We build modern websites, web apps, mobile apps and custom software solutions using PHP, Node.js and the latest technologies.',
        'email'            => $site['email'],
        'phone'            => '+880 1234 567890',
        'address'          => 'Dhaka, Bangladesh',
        'facebook'         => '#',
        'twitter'          => '#',
        'linkedin'         => '#',
        'youtube'          => '#',
        'github'           => '#',
        'hero_video'       => '',
        'stat_years'       => '5',
        'stat_projects'    => '80',
        'stat_clients'     => '150',
        'stat_satisfaction'=> '100',
    ];
    foreach ($settings as $k => $v) {
        $set->execute([$k, $v]);
    }

    $pdo->prepare('DELETE FROM users WHERE email = ?')->execute([$site['admin_email']]);
    $pdo->prepare('INSERT INTO users (name, email, password, created_at) VALUES (?, ?, ?, ?)')
        ->execute([$site['admin_name'], $site['admin_email'], password_hash($site['admin_pass'], PASSWORD_DEFAULT), date('Y-m-d H:i:s')]);

    if (!$demo || (int) $pdo->query('SELECT COUNT(*) FROM services')->fetchColumn() > 0) {
        return;
    }

    $services = [
        ['Web Development', 'web-development', 'fa-solid fa-display', '#06b6d4', 'Custom websites, eCommerce, landing pages and more.', "We create responsive, high-performance websites using the latest technologies.\nFrom business sites to complex web applications, we build solutions that grow with you.", "Responsive & Modern Design\nFast Loading Speed\nSEO Friendly\nSecure & Scalable"],
        ['Mobile App Development', 'mobile-app-development', 'fa-solid fa-mobile-screen-button', '#10b981', 'Android & iOS apps with modern technologies.', "Native and cross-platform mobile apps that your users will love.\nWe handle everything from idea and design to store publishing.", "Native & Cross-platform\nClean & Modern UI/UX\nFast Performance\nOngoing Support"],
        ['UI/UX Design', 'ui-ux-design', 'fa-solid fa-pen-ruler', '#d946ef', 'User-friendly and modern design for better experience.', "Beautiful, user-friendly design backed by research.\nWireframes, prototypes and complete design systems.", "User Research\nWireframes & Prototypes\nDesign Systems\nUsability Testing"],
        ['PHP Development', 'php-development', 'fa-brands fa-php', '#6366f1', 'Secure and scalable PHP solutions.', "Robust PHP & MySQL applications, APIs and admin panels.\nClean code that is easy to maintain and extend.", "Custom CMS & Admin Panels\nREST APIs\nMySQL Optimisation\nSecure Code"],
        ['Node.js Development', 'nodejs-development', 'fa-brands fa-node-js', '#22c55e', 'Fast and flexible backend solutions.', "Real-time, event-driven backends and APIs powered by Node.js.\nPerfect for chat, dashboards and high-traffic apps.", "Real-time Apps\nREST & GraphQL APIs\nMicroservices\nHigh Performance"],
        ['Software Development', 'software-development', 'fa-solid fa-code', '#f97316', 'Custom software for your unique needs.', "Tailor-made software that automates your business.\nERP, POS, CRM, inventory and more.", "Business Automation\nERP / POS / CRM\nCloud Ready\nLong-term Support"],
        ['Cloud & DevOps', 'cloud-devops', 'fa-solid fa-cloud', '#3b82f6', 'Secure and scalable cloud infrastructure.', "Deploy, scale and monitor your apps in the cloud.\nCI/CD pipelines, containers and server management.", "CI/CD Pipelines\nDocker & Containers\nServer Management\n24/7 Monitoring"],
        ['IT Support & Maintenance', 'it-support', 'fa-solid fa-headset', '#8b5cf6', '24/7 support to keep your system running smoothly.', "Proactive maintenance, backups and security updates.\nWe are always here to help.", "24/7 Support\nRegular Backups\nSecurity Updates\nPerformance Tuning"],
    ];
    $st = $pdo->prepare('INSERT INTO services (title, slug, icon, color, summary, body, features, sort, active) VALUES (?,?,?,?,?,?,?,?,1)');
    foreach ($services as $i => $s) {
        $st->execute(array_merge($s, [$i + 1]));
    }

    $projects = [
        ['E-Commerce Website', 'web', 'Web Development', '#6366f1', 'Multi-vendor store with payments and inventory.'],
        ['Fitness Mobile App', 'app', 'Mobile App', '#ec4899', 'Workout tracking with charts and reminders.'],
        ['Restaurant Website', 'web', 'Web Development', '#f97316', 'Online menu, reservations and ordering.'],
        ['Dashboard UI', 'uiux', 'UI/UX Design', '#06b6d4', 'Analytics dashboard design system.'],
        ['Task Management App', 'app', 'Mobile App', '#8b5cf6', 'Team tasks, boards and notifications.'],
        ['Business Website', 'web', 'Web Development', '#10b981', 'Corporate website with CMS.'],
    ];
    $st = $pdo->prepare('INSERT INTO projects (title, category, label, color, summary, link, sort, active) VALUES (?,?,?,?,?,\'\',?,1)');
    foreach ($projects as $i => $p) {
        $st->execute(array_merge($p, [$i + 1]));
    }

    $pricing = [
        ['Basic', 'For small business', 49, 470, "1 Website\nBasic SEO\nEmail Support", 0],
        ['Business', 'For growing companies', 99, 950, "5 Websites\nAdvanced SEO\nPriority Support", 1],
        ['Enterprise', 'For large businesses', 199, 1910, "Unlimited Websites\nCustom Features\n24/7 Support", 0],
    ];
    $st = $pdo->prepare('INSERT INTO pricing (name, tagline, monthly, yearly, features, popular, sort) VALUES (?,?,?,?,?,?,?)');
    foreach ($pricing as $i => $p) {
        $st->execute(array_merge($p, [$i + 1]));
    }

    $team = [
        ['Rakib Hasan', 'CEO & Founder', '#6366f1'],
        ['Sumaiya Akter', 'CTO & Lead Developer', '#ec4899'],
        ['Tanvir Islam', 'Senior Designer', '#10b981'],
        ['Nusrat Jahan', 'Project Manager', '#f97316'],
    ];
    $st = $pdo->prepare('INSERT INTO team (name, role, color, sort) VALUES (?,?,?,?)');
    foreach ($team as $i => $m) {
        $st->execute(array_merge($m, [$i + 1]));
    }

    $st = $pdo->prepare('INSERT INTO visits (day, hits) VALUES (?, ?)');
    for ($d = 6; $d >= 1; $d--) {
        $st->execute([date('Y-m-d', strtotime("-$d day")), random_int(40, 160)]);
    }
}

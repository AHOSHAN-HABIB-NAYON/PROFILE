<?php
/**
 * Database backup / download / restore (files kept in non-public storage/backups).
 */
final class AdminBackupController extends AdminController
{
    public function index(Request $r): Response
    {
        return $this->page('backup', ['files' => Backup::list()], ['title' => 'Backup', 'nav' => 'backup', 'page' => 'backup']);
    }

    public function create(Request $r): Response
    {
        $name = Backup::create();
        return $this->done('Backup created: ' . $name);
    }

    public function download(Request $r, string $name): Response
    {
        $path = Backup::path($name);
        if (!$path) {
            throw new HttpException(404, 'Backup not found.');
        }
        Audit::log('backup.download', null, null, null, ['file' => $name]);
        return new Response((string)file_get_contents($path), 200, [
            'Content-Type' => 'application/gzip',
            'Content-Disposition' => 'attachment; filename="' . $name . '"',
            'Content-Length' => (string)filesize($path),
            'Cache-Control' => 'no-store',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    public function restore(Request $r): Response
    {
        if ($r->str('confirm', 20) !== 'RESTORE') {
            return $this->fail('Type RESTORE to confirm.');
        }
        $file = $r->file('backup');
        if (!$file) {
            return $this->fail('Choose a backup file.');
        }
        $count = Backup::restore($file);
        return $this->done("Restore complete ($count statements). A safety backup was created first.");
    }

    public function delete(Request $r, string $name): Response
    {
        return Backup::delete($name) ? $this->done('Backup deleted.') : $this->fail('Backup not found.', 404);
    }
}

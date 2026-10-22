<?php
declare(strict_types=1);

namespace OryzenX\Controllers\Api\Admin;

use OryzenX\Controllers\Controller;
use OryzenX\Core\HttpException;
use OryzenX\Core\Request;
use OryzenX\Core\Response;
use OryzenX\Services\AdminDashboardService;
use OryzenX\Services\AuthService;
use OryzenX\Services\LedgerService;
use OryzenX\Services\NotificationService;
use OryzenX\Services\PortfolioService;
use OryzenX\Services\ReconciliationService;
use OryzenX\Services\UploadService;
use OryzenX\Services\UserAdminService;
use OryzenX\Services\VerificationService;

final class UsersController extends Controller
{
    public function __construct(
        private UserAdminService $users,
        private AdminDashboardService $dashboard,
        private VerificationService $verification,
        private PortfolioService $portfolio,
        private LedgerService $ledger,
        private NotificationService $notify,
        private ReconciliationService $recon,
        private AuthService $auth
    ) {
    }

    public function dashboardMetrics(Request $req): Response
    {
        return Response::ok($this->dashboard->metrics());
    }

    public function list(Request $req): Response
    {
        [$page, $per] = $this->paging($req, 25);
        [$rows, $total] = $this->users->list($this->filters($req, ['q', 'status', 'verified', 'identity', 'role']), $page, $per);
        return $this->paged($rows, $total, $page, $per);
    }

    /** Lightweight search used by user pickers in financial forms. */
    public function lookup(Request $req): Response
    {
        [$rows] = $this->users->list(['q' => $req->str('q'), 'status' => 'active'], 1, 10);
        return Response::ok(array_map(fn ($r) => ['id' => (int) $r['id'], 'full_name' => $r['full_name'], 'email' => $r['email'], 'identity_status' => $r['identity_status']], $rows));
    }

    public function show(Request $req): Response
    {
        $id = $this->id($req);
        $u = $this->users->detail($id);
        $u['portfolio'] = $this->portfolio->summary($id);
        $u['balances'] = $this->ledger->balances($id);
        $u['notification_preferences'] = $this->notify->preferences($id);
        $u['verification'] = $this->verification->status($id);
        return Response::ok($u);
    }

    public function update(Request $req): Response
    {
        return Response::ok($this->users->update($this->id($req), $req->json(), $this->uid($req)));
    }

    public function setStatus(Request $req): Response
    {
        $this->users->setStatus($this->id($req), $req->str('status'), $req->str('reason') ?: null, $this->uid($req));
        return Response::ok($this->users->detail($this->id($req)));
    }

    public function setRoles(Request $req): Response
    {
        $roles = $req->input('role_ids', []);
        $this->users->setRoles($this->id($req), is_array($roles) ? $roles : [], $this->uid($req));
        return Response::ok($this->users->detail($this->id($req)));
    }

    public function updateNotificationPrefs(Request $req): Response
    {
        return Response::ok($this->notify->updatePreferences($this->id($req), $req->json()));
    }

    public function resendVerification(Request $req): Response
    {
        $u = $this->auth->findUser($this->id($req));
        if (!$u) {
            throw HttpException::notFound();
        }
        $this->auth->sendVerification($u, true);
        return Response::ok(['message' => 'Verification email queued.']);
    }

    public function reconcile(Request $req): Response
    {
        return Response::ok($this->recon->run($this->id($req)));
    }

    // ---- roles
    public function roles(Request $req): Response
    {
        return Response::ok(['roles' => $this->users->roles(), 'permissions' => $this->users->permissions()]);
    }

    public function saveRole(Request $req): Response
    {
        $id = $this->id($req) ?: null;
        return Response::ok($this->users->saveRole($id, $req->json(), $this->uid($req)));
    }

    public function deleteRole(Request $req): Response
    {
        $this->users->deleteRole($this->id($req), $this->uid($req));
        return Response::ok(['deleted' => true]);
    }

    // ---- verification
    public function verifications(Request $req): Response
    {
        [$page, $per] = $this->paging($req, 25);
        [$rows, $total] = $this->verification->queue($this->filters($req, ['status', 'q']), $page, $per);
        return $this->paged($rows, $total, $page, $per);
    }

    public function review(Request $req): Response
    {
        return Response::ok($this->verification->review($this->id($req), $req->str('decision'), $req->str('review_note') ?: null, $req->str('user_message') ?: null, $this->uid($req)));
    }

    public function document(Request $req): Response
    {
        $side = ($req->params['side'] ?? 'front') === 'back' ? 'back' : 'front';
        [$abs, $mime] = $this->verification->documentFile($this->id($req), $side, $this->uid($req));
        return $this->file($abs, $mime);
    }
}

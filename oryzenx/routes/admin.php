<?php
// Admin API. Every route requires an authenticated administrator holding the listed permission.
// 'reauth' => true additionally requires the password to have been confirmed within the last 10 minutes.
use OryzenX\Controllers\Api\Admin\FinanceController as F;
use OryzenX\Controllers\Api\Admin\OperationsController as O;
use OryzenX\Controllers\Api\Admin\SystemController as S;
use OryzenX\Controllers\Api\Admin\UsersController as U;

$p = fn (string ...$perm) => ['perm' => $perm];
$pr = fn (string ...$perm) => ['perm' => $perm, 'reauth' => true];

$r->get('/api/admin/dashboard', [U::class, 'dashboardMetrics'], $p('dashboard.view'));

// users, roles, verification
$r->get('/api/admin/users', [U::class, 'list'], $p('users.view'));
$r->get('/api/admin/users/lookup', [U::class, 'lookup'], $p('users.view'));
$r->get('/api/admin/users/{id:\d+}', [U::class, 'show'], $p('users.view'));
$r->put('/api/admin/users/{id:\d+}', [U::class, 'update'], $p('users.manage'));
$r->post('/api/admin/users/{id:\d+}/status', [U::class, 'setStatus'], $pr('users.suspend'));
$r->post('/api/admin/users/{id:\d+}/roles', [U::class, 'setRoles'], $pr('roles.manage'));
$r->put('/api/admin/users/{id:\d+}/notification-preferences', [U::class, 'updateNotificationPrefs'], $p('users.manage'));
$r->post('/api/admin/users/{id:\d+}/resend-verification', [U::class, 'resendVerification'], $p('users.manage'));
$r->get('/api/admin/users/{id:\d+}/reconciliation', [U::class, 'reconcile'], $p('allocation.view'));
$r->get('/api/admin/users/{id:\d+}/payment-details', [O::class, 'userPaymentDetails'], $p('salary.view'));
$r->post('/api/admin/users/{id:\d+}/payment-details/{method:\d+}/reveal', [O::class, 'revealPaymentDetails'], $pr('salary.manage'));
$r->get('/api/admin/roles', [U::class, 'roles'], $p('roles.manage'));
$r->post('/api/admin/roles', [U::class, 'saveRole'], $pr('roles.manage'));
$r->put('/api/admin/roles/{id:\d+}', [U::class, 'saveRole'], $pr('roles.manage'));
$r->delete('/api/admin/roles/{id:\d+}', [U::class, 'deleteRole'], $pr('roles.manage'));
$r->get('/api/admin/verifications', [U::class, 'verifications'], $p('verification.view'));
$r->post('/api/admin/verifications/{id:\d+}/review', [U::class, 'review'], $p('verification.review'));
$r->get('/api/admin/verifications/{id:\d+}/document/{side:front|back}', [U::class, 'document'], $p('verification.view'));

// investments, trades, ledger, loans
$r->get('/api/admin/investments', [F::class, 'investments'], $p('finance.view'));
$r->post('/api/admin/investments', [F::class, 'addInvestment'], $p('finance.investments'));
$r->post('/api/admin/investments/{id:\d+}/reverse', [F::class, 'reverseInvestment'], $pr('finance.investments'));
$r->put('/api/admin/investments/{id:\d+}/notes', [F::class, 'investmentNotes'], $p('finance.investments'));
$r->post('/api/admin/investments/{id:\d+}/archive', [F::class, 'archiveInvestment'], $p('finance.investments'));
$r->get('/api/admin/investment-sales', [F::class, 'sales'], $p('finance.view'));
$r->post('/api/admin/investment-sales', [F::class, 'sell'], $p('finance.investments'));
$r->post('/api/admin/investment-sales/{id:\d+}/reverse', [F::class, 'reverseSale'], $pr('finance.investments'));
$r->get('/api/admin/trades', [F::class, 'trades'], $p('finance.view'));
$r->post('/api/admin/trades', [F::class, 'addTrade'], $p('finance.trades'));
$r->post('/api/admin/trades/{id:\d+}/close', [F::class, 'closeTrade'], $p('finance.trades'));
$r->post('/api/admin/trades/{id:\d+}/reverse', [F::class, 'reverseTrade'], $pr('finance.trades'));
$r->put('/api/admin/trades/{id:\d+}/notes', [F::class, 'tradeNotes'], $p('finance.trades'));
$r->get('/api/admin/trading-monitor', [F::class, 'tradingMonitor'], $p('finance.view'));
$r->get('/api/admin/ledger', [F::class, 'ledger'], $p('finance.view'));
$r->get('/api/admin/ledger/export', [F::class, 'exportLedger'], $p('finance.export'));
$r->get('/api/admin/ledger/{id:\d+}', [F::class, 'transaction'], $p('finance.view'));
$r->post('/api/admin/ledger/movements', [F::class, 'movement'], $p('finance.ledger'));
$r->post('/api/admin/ledger/{id:\d+}/reverse', [F::class, 'reverseMovement'], $pr('finance.ledger'));
$r->get('/api/admin/loans', [F::class, 'loans'], $p('finance.view'));
$r->post('/api/admin/loans', [F::class, 'addLoan'], $p('finance.loans'));
$r->get('/api/admin/loans/{id:\d+}', [F::class, 'loan'], $p('finance.view'));
$r->post('/api/admin/loans/{id:\d+}/repayments', [F::class, 'repayLoan'], $p('finance.loans'));
$r->post('/api/admin/loans/{id:\d+}/charges', [F::class, 'chargeLoan'], $p('finance.loans'));
$r->post('/api/admin/loans/{id:\d+}/reverse', [F::class, 'reverseLoan'], $pr('finance.loans'));
$r->post('/api/admin/loan-events/{id:\d+}/reverse', [F::class, 'reverseLoanEvent'], $pr('finance.loans'));

// allocation & reconciliation
$r->get('/api/admin/allocation/rules', [F::class, 'allocationRules'], $p('allocation.view'));
$r->put('/api/admin/allocation/rules', [F::class, 'saveAllocationRules'], $pr('allocation.configure'));
$r->get('/api/admin/allocation/preview', [F::class, 'allocationPreview'], $p('allocation.view'));
$r->post('/api/admin/allocation/run', [F::class, 'allocationRun'], $pr('allocation.run'));
$r->get('/api/admin/allocation/history', [F::class, 'allocationHistory'], $p('allocation.view'));
$r->post('/api/admin/allocation/{id:\d+}/reverse', [F::class, 'allocationReverse'], $pr('allocation.run'));
$r->get('/api/admin/reconciliation', [F::class, 'reconciliation'], $p('allocation.view'));

// salary & payment methods
$r->get('/api/admin/salary/schedules', [O::class, 'schedules'], $p('salary.view'));
$r->post('/api/admin/salary/schedules', [O::class, 'saveSchedule'], $p('salary.manage'));
$r->get('/api/admin/salary/records', [O::class, 'salaryRecords'], $p('salary.view'));
$r->get('/api/admin/salary/records/export', [O::class, 'exportSalary'], $p('salary.view', 'finance.export'));
$r->post('/api/admin/salary/generate', [O::class, 'generateSalary'], $p('salary.manage'));
$r->put('/api/admin/salary/records/{id:\d+}', [O::class, 'updateSalaryRecord'], $p('salary.manage'));
$r->get('/api/admin/payment-methods', [O::class, 'paymentMethods'], $p('salary.view'));
$r->put('/api/admin/payment-methods/{id:\d+}', [O::class, 'updatePaymentMethod'], $p('payment_methods.manage'));
$r->post('/api/admin/payment-methods/{id:\d+}/logo', [O::class, 'uploadPaymentLogo'], $p('payment_methods.manage'));

// assets & market
$r->get('/api/admin/assets', [O::class, 'assets'], $p('finance.view'));
$r->post('/api/admin/assets', [O::class, 'saveAsset'], $p('market.manage'));
$r->put('/api/admin/assets/{id:\d+}', [O::class, 'saveAsset'], $p('market.manage'));
$r->post('/api/admin/assets/{id:\d+}/logo', [O::class, 'uploadAssetLogo'], $p('market.manage'));
$r->post('/api/admin/market/refresh', [O::class, 'refreshPrices'], $p('market.manage'));

// notifications & support
$r->get('/api/admin/email-queue', [O::class, 'emailQueue'], $p('notifications.email'));
$r->get('/api/admin/email-queue/{id:\d+}/logs', [O::class, 'emailLogs'], $p('notifications.email'));
$r->post('/api/admin/email-queue/{id:\d+}/retry', [O::class, 'emailRetry'], $p('notifications.email'));
$r->post('/api/admin/email-queue/{id:\d+}/cancel', [O::class, 'emailCancel'], $p('notifications.email'));
$r->post('/api/admin/email-queue/process', [O::class, 'processQueue'], $p('notifications.email'));
$r->post('/api/admin/email/test', [O::class, 'testEmail'], $p('notifications.email'));
$r->get('/api/admin/push-logs', [O::class, 'pushLogs'], $p('notifications.push'));
$r->post('/api/admin/push/test', [O::class, 'testPush'], $p('notifications.push'));
$r->get('/api/admin/support', [O::class, 'supportList'], $p('support.view'));
$r->put('/api/admin/support/{id:\d+}', [O::class, 'supportUpdate'], $p('support.manage'));

// settings, content, security, system
$r->get('/api/admin/settings', [S::class, 'settings'], $p('settings.view'));
$r->put('/api/admin/settings/general', [S::class, 'saveGeneral'], $p('settings.manage'));
$r->put('/api/admin/settings/integrations', [S::class, 'saveIntegrations'], $pr('settings.integrations'));
$r->get('/api/admin/content/landing', [S::class, 'landingContent'], $p('content.manage'));
$r->put('/api/admin/content/landing', [S::class, 'saveLandingContent'], $p('content.manage'));
$r->get('/api/admin/content/translations', [S::class, 'translations'], $p('content.manage'));
$r->put('/api/admin/content/translations', [S::class, 'saveTranslations'], $p('content.manage'));
$r->get('/api/admin/audit', [S::class, 'audit'], $p('audit.view'));
$r->get('/api/admin/security/logins', [S::class, 'securityEvents'], $p('audit.view'));
$r->get('/api/admin/system/health', [S::class, 'health'], $p('system.health'));
$r->post('/api/admin/system/tasks', [S::class, 'runTask'], $p('system.health'));
$r->get('/api/admin/system/backups', [S::class, 'backups'], $p('system.backup'));
$r->post('/api/admin/system/backups', [S::class, 'createBackup'], $pr('system.backup'));
$r->get('/api/admin/system/backups/{file:[A-Za-z0-9._-]+}', [S::class, 'downloadBackup'], $pr('system.backup'));
$r->delete('/api/admin/system/backups/{file:[A-Za-z0-9._-]+}', [S::class, 'deleteBackup'], $pr('system.backup'));

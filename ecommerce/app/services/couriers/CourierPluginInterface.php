<?php
/**
 * Contract every courier integration implements. Add a new courier by creating
 * a class that extends AbstractCourier and registering it in CourierManager::CLASSES.
 */
interface CourierPluginInterface
{
    public const CAP_CREATE = 'create';
    public const CAP_STATUS = 'status';
    public const CAP_TRACK = 'track';
    public const CAP_FRAUD = 'fraud';
    public const CAP_BALANCE = 'balance';
    public const CAP_CANCEL = 'cancel';

    public function slug(): string;

    public function name(): string;

    public function icon(): string;

    public function description(): string;

    /** @return string[] subset of CAP_* constants */
    public function capabilities(): array;

    /** Secret credential fields: key => ['label' =>, 'placeholder' =>] */
    public function credentialFields(): array;

    /** Non-secret options: key => ['label' =>, 'placeholder' =>, 'default' =>] */
    public function settingFields(): array;

    public function configure(array $credentials, array $settings): void;

    public function testConnection(): CourierResult;

    /** $parcel: invoice, name, phone, address, district, amount, note, weight_kg, quantity, description */
    public function createOrder(array $parcel): CourierResult;

    public function checkStatus(array $courierOrder): CourierResult;

    public function trackingUrl(array $courierOrder): ?string;

    public function fraudCheck(string $phone): CourierResult;

    public function balance(): CourierResult;

    public function cancel(array $courierOrder): CourierResult;
}

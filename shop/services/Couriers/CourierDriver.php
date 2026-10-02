<?php
/** Contract every courier integration implements. Credentials come from courier_accounts (server-side only). */
interface CourierDriver
{
    /** @return array{ok:bool, message:string} */
    public function test(): array;

    /**
     * @param array $shipment name, phone, address, district, amount, note, invoice, items_count, weight
     * @return array{ok:bool, message:string, consignment_id?:string, tracking_code?:string, reference?:string, status?:string, raw?:array}
     */
    public function send(array $shipment): array;

    /** @return array{ok:bool, message:string, status?:string, raw?:array} */
    public function status(array $courierOrder): array;
}

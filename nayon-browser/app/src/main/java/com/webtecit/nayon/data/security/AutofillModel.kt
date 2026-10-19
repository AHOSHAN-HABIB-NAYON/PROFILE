package com.webtecit.nayon.data.security

import androidx.annotation.StringRes
import com.webtecit.nayon.R

/** Sections of "Autofill and passwords", as in Chrome. */
enum class AutofillGroup(@StringRes val title: Int, @StringRes val summary: Int, val kinds: List<AutofillKind>) {
    PAYMENTS(R.string.af_group_payments, R.string.af_group_payments_desc, listOf(AutofillKind.CARD, AutofillKind.IBAN, AutofillKind.LOYALTY)),
    CONTACT(R.string.af_group_contact, R.string.af_group_contact_desc, listOf(AutofillKind.ADDRESS)),
    IDENTITY(R.string.af_group_identity, R.string.af_group_identity_desc, listOf(AutofillKind.ID_DOC)),
    TRAVEL(R.string.af_group_travel, R.string.af_group_travel_desc, listOf(AutofillKind.TRAVEL_INFO, AutofillKind.VEHICLE)),
    ;

    /** Payments, identity and travel details need fingerprint / screen lock to open. */
    val locked: Boolean get() = this != CONTACT
}

enum class FieldInput { TEXT, NAME, NUMBER, CARD_NUMBER, EXPIRY, DATE, PHONE, EMAIL, CHOICE }

data class FieldDef(
    val key: String,
    @StringRes val label: Int,
    val input: FieldInput = FieldInput.TEXT,
    val required: Boolean = false,
    /** Masked in lists until revealed. */
    val secret: Boolean = false,
    val choices: List<Int> = emptyList(),
)

enum class AutofillKind(@StringRes val title: Int, @StringRes val addLabel: Int, val fields: List<FieldDef>) {
    CARD(
        R.string.af_kind_card, R.string.af_add_card,
        listOf(
            FieldDef("number", R.string.af_f_card_number, FieldInput.CARD_NUMBER, required = true, secret = true),
            FieldDef("name", R.string.af_f_name_on_card, FieldInput.NAME),
            FieldDef("exp", R.string.af_f_expiry, FieldInput.EXPIRY, required = true),
            FieldDef("nickname", R.string.af_f_nickname),
        ),
    ),
    IBAN(
        R.string.af_kind_iban, R.string.af_add_iban,
        listOf(
            FieldDef("iban", R.string.af_f_iban, required = true, secret = true),
            FieldDef("nickname", R.string.af_f_nickname),
        ),
    ),
    LOYALTY(
        R.string.af_kind_loyalty, R.string.af_add_loyalty,
        listOf(
            FieldDef("program", R.string.af_f_program, required = true),
            FieldDef("number", R.string.af_f_member_number, required = true, secret = true),
            FieldDef("name", R.string.af_f_name, FieldInput.NAME),
        ),
    ),
    ADDRESS(
        R.string.af_kind_address, R.string.af_add_address,
        listOf(
            FieldDef("name", R.string.af_f_full_name, FieldInput.NAME, required = true),
            FieldDef("organization", R.string.af_f_organization),
            FieldDef("street", R.string.af_f_street),
            FieldDef("city", R.string.af_f_city),
            FieldDef("state", R.string.af_f_state),
            FieldDef("postal", R.string.af_f_postal),
            FieldDef("country", R.string.af_f_country),
            FieldDef("phone", R.string.af_f_phone, FieldInput.PHONE),
            FieldDef("email", R.string.af_f_email, FieldInput.EMAIL),
        ),
    ),
    ID_DOC(
        R.string.af_kind_id_doc, R.string.af_add_id_doc,
        listOf(
            FieldDef("type", R.string.af_f_doc_type, FieldInput.CHOICE, required = true,
                choices = listOf(R.string.af_doc_driving, R.string.af_doc_id_card, R.string.af_doc_passport)),
            FieldDef("name", R.string.af_f_full_name, FieldInput.NAME),
            FieldDef("number", R.string.af_f_doc_number, required = true, secret = true),
            FieldDef("country", R.string.af_f_country),
            FieldDef("issued", R.string.af_f_issue_date, FieldInput.DATE),
            FieldDef("expires", R.string.af_f_expiry_date, FieldInput.DATE),
        ),
    ),
    TRAVEL_INFO(
        R.string.af_kind_travel, R.string.af_add_travel,
        listOf(
            FieldDef("type", R.string.af_f_travel_type, FieldInput.CHOICE, required = true,
                choices = listOf(R.string.af_travel_known_traveler, R.string.af_travel_redress, R.string.af_travel_frequent_flyer)),
            FieldDef("number", R.string.af_f_number, required = true, secret = true),
            FieldDef("program", R.string.af_f_airline_program),
            FieldDef("name", R.string.af_f_full_name, FieldInput.NAME),
        ),
    ),
    VEHICLE(
        R.string.af_kind_vehicle, R.string.af_add_vehicle,
        listOf(
            FieldDef("plate", R.string.af_f_plate, required = true),
            FieldDef("region", R.string.af_f_plate_region),
            FieldDef("make", R.string.af_f_make),
            FieldDef("model", R.string.af_f_model),
            FieldDef("year", R.string.af_f_year, FieldInput.NUMBER),
            FieldDef("vin", R.string.af_f_vin, secret = true),
            FieldDef("owner", R.string.af_f_owner, FieldInput.NAME),
        ),
    ),
    ;

    val group: AutofillGroup get() = AutofillGroup.entries.first { this in it.kinds }
}

/** A saved autofill item, decrypted. */
data class AutofillEntry(val id: Long, val kind: AutofillKind, val values: Map<String, String>, val updatedAt: Long) {
    operator fun get(key: String): String = values[key].orEmpty()
}

/** Card helpers: brand from the number, Luhn check, masking. */
object CardInfo {
    fun digits(number: String) = number.filter { it.isDigit() }

    fun brand(number: String): String {
        val d = digits(number)
        return when {
            d.startsWith("4") -> "Visa"
            d.length >= 2 && d.substring(0, 2).toIntOrNull() in 51..55 -> "Mastercard"
            d.length >= 4 && d.substring(0, 4).toIntOrNull() in 2221..2720 -> "Mastercard"
            d.startsWith("34") || d.startsWith("37") -> "American Express"
            d.startsWith("6011") || d.startsWith("65") -> "Discover"
            d.startsWith("62") -> "UnionPay"
            d.startsWith("35") -> "JCB"
            else -> "Card"
        }
    }

    fun luhnValid(number: String): Boolean {
        val d = digits(number)
        if (d.length !in 12..19) return false
        var sum = 0
        d.reversed().forEachIndexed { i, c ->
            var n = c - '0'
            if (i % 2 == 1) { n *= 2; if (n > 9) n -= 9 }
            sum += n
        }
        return sum % 10 == 0
    }

    fun last4(value: String): String = value.filter { it.isLetterOrDigit() }.takeLast(4)

    /** "MM/YY" from "MM/YY", "MM/YYYY", "MMYY". Returns null if it can't be read. */
    fun normaliseExpiry(raw: String): String? {
        val d = raw.filter { it.isDigit() }
        val (m, y) = when (d.length) {
            4 -> d.substring(0, 2) to d.substring(2)
            6 -> d.substring(0, 2) to d.substring(4)
            3 -> "0" + d.substring(0, 1) to d.substring(1)
            else -> return null
        }
        val month = m.toIntOrNull() ?: return null
        if (month !in 1..12) return null
        return "%02d/%s".format(month, y)
    }
}

package com.ahoshan.joma.data

import org.json.JSONObject

data class User(
    val id: Long,
    val name: String,
    val email: String,
    val avatarUrl: String?,
    val hasPassword: Boolean,
    val googleLinked: Boolean,
) {
    companion object {
        fun from(json: JSONObject) = User(
            id = json.getLong("id"),
            name = json.getString("name"),
            email = json.getString("email"),
            avatarUrl = json.optStringOrNull("avatar_url"),
            hasPassword = json.optBoolean("has_password"),
            googleLinked = json.optBoolean("google_linked"),
        )
    }
}

data class Summary(val balance: String, val monthIn: String, val monthOut: String) {
    companion object {
        fun from(json: JSONObject) = Summary(
            balance = json.getString("balance"),
            monthIn = json.getString("month_in"),
            monthOut = json.getString("month_out"),
        )
    }
}

data class Transaction(
    val id: Long,
    val type: String,
    val incoming: Boolean,
    val amount: String,
    val balanceAfter: String,
    val method: String?,
    val note: String?,
    val counterpartyName: String?,
    val createdAt: String,
) {
    companion object {
        fun from(json: JSONObject) = Transaction(
            id = json.getLong("id"),
            type = json.getString("type"),
            incoming = json.getString("direction") == "in",
            amount = json.getString("amount"),
            balanceAfter = json.getString("balance_after"),
            method = json.optStringOrNull("method"),
            note = json.optStringOrNull("note"),
            counterpartyName = json.optJSONObject("counterparty")?.optStringOrNull("name"),
            createdAt = json.getString("created_at"),
        )
    }
}

data class Passkey(val id: Long, val name: String, val createdAt: String, val lastUsedAt: String?) {
    companion object {
        fun from(json: JSONObject) = Passkey(
            id = json.getLong("id"),
            name = json.getString("name"),
            createdAt = json.getString("created_at"),
            lastUsedAt = json.optStringOrNull("last_used_at"),
        )
    }
}

/** JSONObject.optString returns "null" for JSON null; this returns a real null. */
fun JSONObject.optStringOrNull(key: String): String? =
    if (isNull(key)) null else optString(key).takeIf { it.isNotEmpty() }

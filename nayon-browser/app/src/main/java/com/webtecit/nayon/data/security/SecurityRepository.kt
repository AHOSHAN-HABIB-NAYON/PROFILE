package com.webtecit.nayon.data.security

import android.net.Uri
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext

/** Website permissions NAYON can grant. */
enum class SiteKind { CAMERA, MICROPHONE, LOCATION, PROTECTED_MEDIA }

/** A saved sign-in, decrypted for display. The password is only decrypted on request. */
data class SavedLogin(val id: Long, val origin: String, val username: String, val updatedAt: Long)

data class SitePermission(val origin: String, val kind: SiteKind, val allowed: Boolean)

/** What happened when a site's sign-in was offered for saving. */
enum class SaveCheck { NEW, UPDATE, SAME, NEVER }

/** Password vault and website permissions. All disk work runs off the main thread. */
class SecurityRepository(db: SecurityDatabase, private val crypto: VaultCrypto = VaultCrypto()) {
    private val credentials = db.credentials()
    private val permissions = db.sitePermissions()

    // ---- Passwords -----------------------------------------------------------------------

    val logins: Flow<List<SavedLogin>> = credentials.all().map { list -> list.mapNotNull { it.toLogin() } }

    val neverSaveSites: Flow<List<String>> = credentials.neverSave().map { list -> list.map { it.origin } }

    suspend fun loginsFor(origin: String): List<SavedLogin> = withContext(Dispatchers.IO) {
        credentials.forOrigin(origin).mapNotNull { it.toLogin() }
    }

    suspend fun password(id: Long): String? = withContext(Dispatchers.IO) {
        credentials.byId(id)?.let { runCatching { crypto.decrypt(it.passwordCipher) }.getOrNull() }
    }

    suspend fun check(origin: String, username: String, password: String): SaveCheck = withContext(Dispatchers.IO) {
        if (credentials.isNeverSave(origin) > 0) return@withContext SaveCheck.NEVER
        val same = credentials.forOrigin(origin).firstOrNull { decrypt(it.usernameCipher) == username }
            ?: return@withContext SaveCheck.NEW
        if (decrypt(same.passwordCipher) == password) SaveCheck.SAME else SaveCheck.UPDATE
    }

    /** Saves a sign-in, replacing the password of the same username on the same site. */
    suspend fun save(origin: String, username: String, password: String) = withContext(Dispatchers.IO) {
        val now = System.currentTimeMillis()
        val existing = credentials.forOrigin(origin).firstOrNull { decrypt(it.usernameCipher) == username }
        credentials.upsert(
            CredentialEntity(
                id = existing?.id ?: 0,
                origin = origin,
                usernameCipher = crypto.encrypt(username),
                passwordCipher = crypto.encrypt(password),
                createdAt = existing?.createdAt ?: now,
                updatedAt = now,
                lastUsedAt = existing?.lastUsedAt ?: 0,
            ),
        )
    }

    suspend fun markUsed(id: Long) = withContext(Dispatchers.IO) { credentials.markUsed(id, System.currentTimeMillis()) }
    suspend fun delete(id: Long) = withContext(Dispatchers.IO) { credentials.delete(id) }
    suspend fun neverSave(origin: String) = withContext(Dispatchers.IO) {
        credentials.addNeverSave(NeverSaveEntity(origin, System.currentTimeMillis()))
    }
    suspend fun allowSaving(origin: String) = withContext(Dispatchers.IO) { credentials.removeNeverSave(origin) }
    suspend fun hasLogins(origin: String): Boolean = withContext(Dispatchers.IO) { credentials.countFor(origin) > 0 }

    suspend fun deleteAllPasswords() = withContext(Dispatchers.IO) {
        credentials.clear()
        crypto.destroyKey()
    }

    private fun decrypt(cipher: String): String? = runCatching { crypto.decrypt(cipher) }.getOrNull()

    private fun CredentialEntity.toLogin(): SavedLogin? =
        decrypt(usernameCipher)?.let { SavedLogin(id, origin, it, updatedAt) }

    // ---- Website permissions -------------------------------------------------------------

    val sitePermissions: Flow<List<SitePermission>> = permissions.all().map { list ->
        list.mapNotNull { e -> runCatching { SitePermission(e.origin, SiteKind.valueOf(e.kind), e.allowed) }.getOrNull() }
    }

    /** The remembered decision for [kind] on [origin]: true = allowed, false = blocked, null = ask. */
    suspend fun decision(origin: String, kind: SiteKind): Boolean? = withContext(Dispatchers.IO) {
        permissions.forOrigin(origin).firstOrNull { it.kind == kind.name }?.allowed
    }

    suspend fun setDecision(origin: String, kind: SiteKind, allowed: Boolean?) = withContext(Dispatchers.IO) {
        if (allowed == null) permissions.remove(origin, kind.name)
        else permissions.set(SitePermissionEntity(origin, kind.name, allowed, System.currentTimeMillis()))
    }

    suspend fun resetSite(origin: String) = withContext(Dispatchers.IO) { permissions.removeOrigin(origin) }

    suspend fun resetAllPermissions() = withContext(Dispatchers.IO) { permissions.clear() }

    companion object {
        /** "https://host[:port]" for a page URL, or null for anything that isn't http(s). */
        fun originOf(url: String?): String? {
            val uri = runCatching { Uri.parse(url ?: return null) }.getOrNull() ?: return null
            val scheme = uri.scheme?.lowercase() ?: return null
            if (scheme != "https" && scheme != "http") return null
            val host = uri.host?.lowercase() ?: return null
            val port = if (uri.port != -1) ":${uri.port}" else ""
            return "$scheme://$host$port"
        }
    }
}

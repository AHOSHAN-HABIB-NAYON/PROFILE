package com.ahoshan.joma.ui

import android.app.Activity
import android.app.Application
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.ahoshan.joma.BuildConfig
import com.ahoshan.joma.auth.AuthException
import com.ahoshan.joma.auth.CancelledException
import com.ahoshan.joma.auth.CredentialAuth
import com.ahoshan.joma.data.ApiClient
import com.ahoshan.joma.data.ApiException
import com.ahoshan.joma.data.Passkey
import com.ahoshan.joma.data.SessionStore
import com.ahoshan.joma.data.Summary
import com.ahoshan.joma.data.Transaction
import com.ahoshan.joma.data.User
import kotlinx.coroutines.async
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.util.UUID

enum class Screen { Loading, Login, Main }

enum class MoneyAction(val path: String) { Deposit("deposit"), Send("transfer"), Withdraw("withdraw") }

data class UiState(
    val screen: Screen = Screen.Loading,
    val user: User? = null,
    val summary: Summary? = null,
    val transactions: List<Transaction> = emptyList(),
    val nextBefore: Long? = null,
    val passkeys: List<Passkey> = emptyList(),
    val busy: Boolean = false,
    val refreshing: Boolean = false,
    val loadingMore: Boolean = false,
    val message: String? = null,
)

class WalletViewModel(app: Application) : AndroidViewModel(app) {

    private val session = SessionStore(app)
    private val api = ApiClient(BuildConfig.BASE_URL) { session.token }

    var state by mutableStateOf(UiState())
        private set

    init {
        if (session.token == null) {
            state = state.copy(screen = Screen.Login)
        } else {
            viewModelScope.launch {
                try {
                    val user = User.from(api.get("me").getJSONObject("user"))
                    state = state.copy(screen = Screen.Main, user = user)
                    loadEverything()
                } catch (e: ApiException) {
                    if (e.status == 401) session.token = null
                    state = state.copy(screen = Screen.Login, message = if (e.status == 401) null else e.message)
                }
            }
        }
    }

    fun messageShown() {
        state = state.copy(message = null)
    }

    // ------------------------------------------------------------- sign-in

    fun login(email: String, password: String) = signIn {
        api.post("auth/login", JSONObject().put("email", email).put("password", password))
    }

    fun register(name: String, email: String, password: String) = signIn {
        api.post("auth/register", JSONObject().put("name", name).put("email", email).put("password", password))
    }

    fun loginWithGoogle(activity: Activity) = signIn {
        val idToken = CredentialAuth(activity).googleIdToken(activity, BuildConfig.GOOGLE_WEB_CLIENT_ID)
        api.post("auth/google", JSONObject().put("id_token", idToken))
    }

    fun loginWithPasskey(activity: Activity) = signIn {
        val options = api.post("auth/passkey/options")
        val response = CredentialAuth(activity).passkeySignIn(activity, options.getJSONObject("options").toString())
        api.post(
            "auth/passkey/verify",
            JSONObject()
                .put("challenge_id", options.getString("challenge_id"))
                .put("credential", JSONObject(response)),
        )
    }

    private fun signIn(call: suspend () -> JSONObject) {
        if (state.busy) return
        state = state.copy(busy = true)
        viewModelScope.launch {
            try {
                val result = call()
                session.token = result.getString("token")
                state = state.copy(screen = Screen.Main, user = User.from(result.getJSONObject("user")), busy = false)
                loadEverything()
            } catch (e: CancelledException) {
                state = state.copy(busy = false)
            } catch (e: Exception) {
                state = state.copy(busy = false, message = friendly(e))
            }
        }
    }

    fun logout() {
        viewModelScope.launch {
            runCatching { api.post("auth/logout") }
            session.token = null
            state = UiState(screen = Screen.Login)
        }
    }

    // --------------------------------------------------------------- wallet

    fun refresh() {
        state = state.copy(refreshing = true)
        viewModelScope.launch { loadEverything() }
    }

    private suspend fun loadEverything() {
        try {
            val summary = viewModelScope.async { api.get("wallet") }
            val history = viewModelScope.async { api.get("transactions") }
            val keys = viewModelScope.async { api.get("passkeys") }
            val page = history.await()
            state = state.copy(
                summary = Summary.from(summary.await()),
                transactions = page.getJSONArray("transactions").let { a -> List(a.length()) { Transaction.from(a.getJSONObject(it)) } },
                nextBefore = page.optLong("next_before").takeIf { !page.isNull("next_before") },
                passkeys = keys.await().getJSONArray("passkeys").let { a -> List(a.length()) { Passkey.from(a.getJSONObject(it)) } },
                refreshing = false,
            )
        } catch (e: Exception) {
            handleError(e)
            state = state.copy(refreshing = false)
        }
    }

    fun loadMore() {
        val before = state.nextBefore ?: return
        if (state.loadingMore) return
        state = state.copy(loadingMore = true)
        viewModelScope.launch {
            try {
                val page = api.get("transactions?before=$before")
                val more = page.getJSONArray("transactions").let { a -> List(a.length()) { Transaction.from(a.getJSONObject(it)) } }
                state = state.copy(
                    transactions = state.transactions + more,
                    nextBefore = page.optLong("next_before").takeIf { !page.isNull("next_before") },
                    loadingMore = false,
                )
            } catch (e: Exception) {
                handleError(e)
                state = state.copy(loadingMore = false)
            }
        }
    }

    /** A fresh idempotency key; the sheet keeps one per open, so a retry is not applied twice. */
    fun newRequestKey(): String = UUID.randomUUID().toString().replace("-", "")

    /**
     * Sends a deposit, transfer or withdrawal. Returns null on success,
     * or the message to show inside the form.
     */
    suspend fun submit(
        action: MoneyAction,
        amount: String,
        method: String,
        toEmail: String,
        note: String,
        requestKey: String,
    ): String? {
        val body = JSONObject()
            .put("amount", asciiDigits(amount).replace(",", "").trim())
            .put("idempotency_key", requestKey)
        if (action == MoneyAction.Send) {
            body.put("to_email", toEmail.trim()).put("note", note.trim())
        } else {
            body.put("method", method)
        }
        return try {
            val result = api.post("wallet/${action.path}", body)
            val tx = Transaction.from(result.getJSONObject("transaction"))
            state = state.copy(
                summary = state.summary?.copy(balance = result.getString("balance")),
                transactions = if (result.optBoolean("replayed")) state.transactions else listOf(tx) + state.transactions,
                message = when (action) {
                    MoneyAction.Deposit -> "৳${taka(tx.amount)} যোগ হয়েছে।"
                    MoneyAction.Withdraw -> "৳${taka(tx.amount)} তোলা হয়েছে।"
                    MoneyAction.Send -> "${tx.counterpartyName}-কে ৳${taka(tx.amount)} পাঠানো হয়েছে।"
                },
            )
            viewModelScope.launch { runCatching { state = state.copy(summary = Summary.from(api.get("wallet"))) } }
            null
        } catch (e: ApiException) {
            if (e.status == 401) handleError(e)
            e.message
        }
    }

    /** The recipient's name for an email, or an error message. */
    suspend fun lookup(email: String): Result<String> = try {
        Result.success(api.get("users/lookup?email=" + java.net.URLEncoder.encode(email.trim(), "UTF-8")).getString("name"))
    } catch (e: ApiException) {
        Result.failure(e)
    }

    // ------------------------------------------------------------- passkeys

    fun addPasskey(activity: Activity) {
        if (state.busy) return
        state = state.copy(busy = true)
        viewModelScope.launch {
            try {
                val options = api.post("passkeys/options")
                val response = CredentialAuth(activity).createPasskey(activity, options.getJSONObject("options").toString())
                api.post(
                    "passkeys",
                    JSONObject()
                        .put("challenge_id", options.getString("challenge_id"))
                        .put("credential", JSONObject(response))
                        .put("name", "${android.os.Build.MANUFACTURER.replaceFirstChar { it.uppercase() }} ${android.os.Build.MODEL}"),
                )
                val keys = api.get("passkeys").getJSONArray("passkeys")
                state = state.copy(
                    busy = false,
                    passkeys = List(keys.length()) { Passkey.from(keys.getJSONObject(it)) },
                    message = "পাসকি যোগ হয়েছে। এখন থেকে আঙুলের ছাপ বা ফেস দিয়েই লগইন করতে পারবেন।",
                )
            } catch (e: CancelledException) {
                state = state.copy(busy = false)
            } catch (e: Exception) {
                state = state.copy(busy = false)
                handleError(e)
            }
        }
    }

    fun deletePasskey(passkey: Passkey) {
        viewModelScope.launch {
            try {
                api.delete("passkeys/${passkey.id}")
                state = state.copy(passkeys = state.passkeys - passkey, message = "পাসকি মুছে ফেলা হয়েছে।")
            } catch (e: Exception) {
                handleError(e)
            }
        }
    }

    // -------------------------------------------------------------- helpers

    private fun handleError(e: Exception) {
        if (e is ApiException && e.status == 401) {
            session.token = null
            state = UiState(screen = Screen.Login, message = e.message)
        } else {
            state = state.copy(message = friendly(e))
        }
    }

    private fun friendly(e: Exception): String = when (e) {
        is ApiException, is AuthException -> e.message.orEmpty()
        else -> "কিছু একটা সমস্যা হয়েছে। আবার চেষ্টা করুন।"
    }
}

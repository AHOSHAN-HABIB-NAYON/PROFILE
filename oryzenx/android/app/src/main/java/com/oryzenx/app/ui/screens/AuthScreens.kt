package com.oryzenx.app.ui.screens

import android.content.Context
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.automirrored.filled.ShowChart
import androidx.compose.material.icons.filled.VerifiedUser
import androidx.compose.material3.Checkbox
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.navigation.NavHostController
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.oryzenx.app.OryzenApp
import com.oryzenx.app.data.Api
import com.oryzenx.app.data.ApiException
import com.oryzenx.app.data.I18n
import com.oryzenx.app.data.bool
import com.oryzenx.app.data.data
import com.oryzenx.app.data.obj
import com.oryzenx.app.data.str
import com.oryzenx.app.data.t
import com.oryzenx.app.push.PushRegistrar
import com.oryzenx.app.ui.AppState
import com.oryzenx.app.ui.components.Banner
import com.oryzenx.app.ui.components.OxTextField
import com.oryzenx.app.ui.components.PrimaryButton
import com.oryzenx.app.ui.components.SecondaryButton
import com.oryzenx.app.ui.theme.Ox
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject

@Composable
private fun AuthLayout(title: String, lead: String?, content: @Composable ColumnScope.() -> Unit) {
    Column(
        Modifier.fillMaxSize().statusBarsPadding().imePadding().verticalScroll(rememberScrollState()).padding(horizontal = 24.dp, vertical = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Column(Modifier.widthIn(max = 440.dp).fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text("Oryzen", fontWeight = FontWeight.Bold, fontSize = 22.sp)
                Text("X", fontWeight = FontWeight.Bold, fontSize = 22.sp, color = Ox.colors.primary)
                Spacer(Modifier.weight(1f))
                LanguageToggle()
            }
            Spacer(Modifier.height(8.dp))
            Text(title, style = MaterialTheme.typography.headlineSmall)
            if (lead != null) Text(lead, style = MaterialTheme.typography.bodyLarge, color = Ox.colors.text2)
            content()
        }
    }
}

@Composable
fun LanguageToggle() {
    val ctx = LocalContext.current
    val other = if (I18n.locale == "bn") "en" else "bn"
    TextButton(onClick = { switchLanguage(ctx, other) }) { Text(if (other == "bn") "বাংলা" else "English") }
}

fun switchLanguage(ctx: Context, loc: String) {
    val app = OryzenApp.instance
    app.session.locale = loc
    I18n.apply(ctx, loc)
}

/** Stores the session and routes to verification or home. */
private fun signedIn(nav: NavHostController, data: JsonObject?, context: Context) {
    val app = OryzenApp.instance
    data?.str("token")?.let { app.session.token = it }
    val user = data.obj("user") ?: return
    AppState.user = user
    user.str("locale")?.let { loc -> if (loc != I18n.locale) switchLanguage(context, loc) }
    PushRegistrar.register(context)
    val dest = if (user.obj("verification").bool("email_verified")) "home" else "verify"
    nav.navigate(dest) { popUpTo(0) }
}

@Composable
fun WelcomeScreen(nav: NavHostController) {
    AuthLayout(t("welcome_title"), t("welcome_lead")) {
        listOf(Icons.AutoMirrored.Filled.ShowChart to "welcome_point_1", Icons.Default.VerifiedUser to "welcome_point_2", Icons.Default.Notifications to "welcome_point_3").forEach { (icon, key) ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(icon, null, tint = Ox.colors.primary, modifier = Modifier.size(20.dp))
                Spacer(Modifier.size(12.dp))
                Text(t(key), color = Ox.colors.text2)
            }
        }
        Spacer(Modifier.height(8.dp))
        if (AppState.config?.bool("registration_open") != false) PrimaryButton(t("create_account"), { nav.navigate("register") })
        SecondaryButton(t("sign_in"), { nav.navigate("login") })
        Text(t("monitoring_disclaimer"), style = MaterialTheme.typography.bodySmall, color = Ox.colors.text3, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
    }
}

@Composable
fun LoginScreen(nav: NavHostController) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    AuthLayout(t("sign_in_title"), t("sign_in_lead")) {
        GoogleButton(nav)
        error?.let { Banner(it, "err") }
        OxTextField(email, { email = it.trim() }, t("email"), keyboardType = KeyboardType.Email)
        OxTextField(password, { password = it }, t("password"), password = true)
        PrimaryButton(t("sign_in"), {
            if (email.isBlank() || password.isBlank()) { error = t("err_check_form"); return@PrimaryButton }
            loading = true; error = null
            scope.launch {
                try {
                    val r = api.post("/api/auth/login", Api.body("email" to email, "password" to password, "client" to "android", "device_name" to android.os.Build.MODEL))
                    signedIn(nav, r.data(), ctx)
                } catch (e: ApiException) { error = e.message } finally { loading = false }
            }
        }, loading = loading)
        TextButton(onClick = { nav.navigate("forgot") }, modifier = Modifier.align(Alignment.CenterHorizontally)) { Text(t("forgot_password")) }
        TextButton(onClick = { nav.navigate("register") }, modifier = Modifier.align(Alignment.CenterHorizontally)) { Text(t("no_account") + " " + t("create_account")) }
    }
}

/** Google sign-in through Credential Manager; shown only when the server has a Google client ID configured. */
@Composable
private fun GoogleButton(nav: NavHostController) {
    val clientId = AppState.config?.str("google_client_id") ?: return
    if (AppState.config?.bool("google_enabled") != true) return
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var error by remember { mutableStateOf<String?>(null) }
    SecondaryButton("Google — " + t("sign_in"), {
        scope.launch {
            try {
                val option = GetGoogleIdOption.Builder().setServerClientId(clientId).setFilterByAuthorizedAccounts(false).build()
                val result = CredentialManager.create(ctx).getCredential(ctx, GetCredentialRequest.Builder().addCredentialOption(option).build())
                val cred = result.credential
                if (cred is CustomCredential && cred.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
                    val idToken = GoogleIdTokenCredential.createFrom(cred.data).idToken
                    val r = api.post("/api/auth/google", Api.body("id_token" to idToken, "client" to "android", "device_name" to android.os.Build.MODEL))
                    signedIn(nav, r.data(), ctx)
                }
            } catch (e: ApiException) {
                error = e.message
            } catch (e: Exception) {
                // user cancelled or no Google account on the device
            }
        }
    })
    error?.let { Banner(it, "err") }
}

@Composable
fun RegisterScreen(nav: NavHostController) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val f = remember { mutableStateMapOf("full_name" to "", "email" to "", "phone" to "", "password" to "", "password_confirmation" to "", "address" to "", "city" to "", "country" to "Bangladesh") }
    var accept by remember { mutableStateOf(false) }
    var errors by remember { mutableStateOf<Map<String, String>>(emptyMap()) }
    var loading by remember { mutableStateOf(false) }
    var banner by remember { mutableStateOf<String?>(null) }
    AuthLayout(t("register_title"), t("register_lead")) {
        banner?.let { Banner(it, "err") }
        OxTextField(f["full_name"]!!, { f["full_name"] = it }, t("full_name"), errors["full_name"])
        OxTextField(f["email"]!!, { f["email"] = it.trim() }, t("email"), errors["email"], keyboardType = KeyboardType.Email)
        OxTextField(f["phone"]!!, { f["phone"] = it }, t("phone") + " " + t("optional_paren"), errors["phone"], keyboardType = KeyboardType.Phone)
        OxTextField(f["password"]!!, { f["password"] = it }, t("password"), errors["password"], hint = t("password_rules"), password = true)
        OxTextField(f["password_confirmation"]!!, { f["password_confirmation"] = it }, t("confirm_password"), errors["password_confirmation"], password = true)
        OxTextField(f["address"]!!, { f["address"] = it }, t("address") + " " + t("optional_paren"))
        OxTextField(f["city"]!!, { f["city"] = it }, t("city") + " " + t("optional_paren"))
        OxTextField(f["country"]!!, { f["country"] = it }, t("country") + " " + t("optional_paren"))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Checkbox(checked = accept, onCheckedChange = { accept = it })
            Text(t("accept_terms_1") + " " + t("terms") + " " + t("and") + " " + t("privacy_policy") + t("accept_terms_2"), style = MaterialTheme.typography.bodySmall)
        }
        errors["accept_terms"]?.let { Text(it, color = Ox.colors.loss, style = MaterialTheme.typography.bodySmall) }
        PrimaryButton(t("create_account"), {
            if (f["password"] != f["password_confirmation"]) { errors = mapOf("password_confirmation" to t("v_password_match")); return@PrimaryButton }
            loading = true; banner = null
            scope.launch {
                try {
                    val pairs = f.map { it.key to it.value.takeIf { v -> v.isNotBlank() } }.toTypedArray()
                    val r = api.post("/api/auth/register", Api.body(*pairs, "accept_terms" to accept, "locale" to I18n.locale, "client" to "android", "device_name" to android.os.Build.MODEL))
                    signedIn(nav, r.data(), ctx)
                } catch (e: ApiException) {
                    errors = e.fields; banner = if (e.fields.isEmpty()) e.message else t("err_check_form")
                } finally { loading = false }
            }
        }, loading = loading)
        TextButton(onClick = { nav.navigate("login") }, modifier = Modifier.align(Alignment.CenterHorizontally)) { Text(t("have_account") + " " + t("sign_in")) }
    }
}

@Composable
fun VerifyEmailScreen(nav: NavHostController) {
    val scope = rememberCoroutineScope()
    var code by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }
    var msg by remember { mutableStateOf<Pair<String, String>?>(null) }
    val email = AppState.user?.str("email") ?: ""
    AuthLayout(t("verify_title"), t("verify_lead", "email" to email)) {
        msg?.let { Banner(it.second, it.first) }
        OxTextField(code, { code = it.filter(Char::isDigit).take(6) }, t("verification_code"), keyboardType = KeyboardType.NumberPassword)
        PrimaryButton(t("verify_email"), {
            loading = true
            scope.launch {
                try {
                    val r = api.post("/api/auth/verify-email", Api.body("code" to code))
                    AppState.user = r.data().obj("user")
                    nav.navigate("home") { popUpTo(0) }
                } catch (e: ApiException) { msg = "err" to e.message } finally { loading = false }
            }
        }, loading = loading, enabled = code.length == 6)
        SecondaryButton(t("resend_code"), {
            scope.launch {
                msg = try { api.post("/api/auth/resend-verification"); "ok" to t("code_sent") } catch (e: ApiException) { "err" to e.message }
            }
        })
        Banner(t("verify_hint"))
        TextButton(onClick = { signOut(nav) }, modifier = Modifier.align(Alignment.CenterHorizontally)) { Text(t("sign_out")) }
    }
}

@Composable
fun ForgotPasswordScreen(nav: NavHostController) {
    val scope = rememberCoroutineScope()
    var email by remember { mutableStateOf("") }
    var msg by remember { mutableStateOf<Pair<String, String>?>(null) }
    var loading by remember { mutableStateOf(false) }
    AuthLayout(t("forgot_title"), t("forgot_lead")) {
        msg?.let { Banner(it.second, it.first) }
        OxTextField(email, { email = it.trim() }, t("email"), keyboardType = KeyboardType.Email)
        PrimaryButton(t("send_reset_link"), {
            loading = true
            scope.launch {
                msg = try { api.post("/api/auth/forgot-password", Api.body("email" to email)); "ok" to t("reset_sent") } catch (e: ApiException) { "err" to e.message }
                loading = false
            }
        }, loading = loading)
        TextButton(onClick = { nav.popBackStack() }, modifier = Modifier.align(Alignment.CenterHorizontally)) { Text(t("back_to_sign_in")) }
    }
}

@Composable
fun ResetPasswordScreen(nav: NavHostController, token: String) {
    val scope = rememberCoroutineScope()
    var p1 by remember { mutableStateOf("") }
    var p2 by remember { mutableStateOf("") }
    var errors by remember { mutableStateOf<Map<String, String>>(emptyMap()) }
    var msg by remember { mutableStateOf<String?>(null) }
    AuthLayout(t("reset_title"), t("reset_lead")) {
        if (token.isBlank()) { Banner(t("reset_link_invalid"), "err"); return@AuthLayout }
        msg?.let { Banner(it, "err") }
        OxTextField(p1, { p1 = it }, t("new_password"), errors["password"], hint = t("password_rules"), password = true)
        OxTextField(p2, { p2 = it }, t("confirm_password"), errors["password_confirmation"], password = true)
        PrimaryButton(t("set_new_password"), {
            scope.launch {
                try {
                    api.post("/api/auth/reset-password", Api.body("token" to token, "password" to p1, "password_confirmation" to p2))
                    nav.navigate("login") { popUpTo(0) }
                } catch (e: ApiException) { errors = e.fields; msg = e.message }
            }
        })
    }
}

fun signOut(nav: NavHostController) {
    val app = OryzenApp.instance
    kotlinx.coroutines.MainScope().launch {
        runCatching { PushRegistrar.unregister() }
        runCatching { app.api.post("/api/auth/logout") }
        app.session.clear()
        AppState.user = null
        nav.navigate("welcome") { popUpTo(0) }
    }
}

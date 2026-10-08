package com.ahoshan.joma.auth

import android.app.Activity
import androidx.credentials.CreatePublicKeyCredentialRequest
import androidx.credentials.CreatePublicKeyCredentialResponse
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.GetPublicKeyCredentialOption
import androidx.credentials.PublicKeyCredential
import androidx.credentials.exceptions.CreateCredentialCancellationException
import androidx.credentials.exceptions.CreateCredentialException
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.NoCredentialException
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential

/** The person closed the system sheet; nothing to report. */
class CancelledException : Exception()

/** A sign-in problem with a message to show the person. */
class AuthException(message: String) : Exception(message)

/**
 * Google sign-in and passkeys through Android's Credential Manager. Both open
 * the phone's own bottom sheet (account picker, fingerprint or face prompt)
 * on top of the app, never a browser.
 */
class CredentialAuth(activity: Activity) {

    private val manager = CredentialManager.create(activity)

    /** Shows the Google account sheet and returns a Google ID token for the server. */
    suspend fun googleIdToken(activity: Activity, webClientId: String): String {
        if (webClientId.isBlank()) {
            throw AuthException("Google লগইন এখনো চালু করা হয়নি (wallet.properties)।")
        }
        val option = GetSignInWithGoogleOption.Builder(webClientId).build()
        val request = GetCredentialRequest.Builder().addCredentialOption(option).build()
        val credential = try {
            manager.getCredential(activity, request).credential
        } catch (e: GetCredentialCancellationException) {
            throw CancelledException()
        } catch (e: NoCredentialException) {
            throw AuthException("ফোনে কোনো Google অ্যাকাউন্ট পাওয়া যায়নি।")
        } catch (e: GetCredentialException) {
            throw AuthException("Google লগইন করা যায়নি। আবার চেষ্টা করুন।")
        }
        if (credential is CustomCredential &&
            credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL
        ) {
            return GoogleIdTokenCredential.createFrom(credential.data).idToken
        }
        throw AuthException("Google লগইন করা যায়নি। আবার চেষ্টা করুন।")
    }

    /** Asks for a saved passkey and returns the signed response JSON for the server. */
    suspend fun passkeySignIn(activity: Activity, requestJson: String): String {
        val request = GetCredentialRequest.Builder()
            .addCredentialOption(GetPublicKeyCredentialOption(requestJson))
            .build()
        val credential = try {
            manager.getCredential(activity, request).credential
        } catch (e: GetCredentialCancellationException) {
            throw CancelledException()
        } catch (e: NoCredentialException) {
            throw AuthException("এই ফোনে জমা ওয়ালেটের কোনো পাসকি নেই। আগে লগইন করে সেটিংস থেকে পাসকি যোগ করুন।")
        } catch (e: GetCredentialException) {
            throw AuthException("পাসকি দিয়ে লগইন করা যায়নি। আবার চেষ্টা করুন।")
        }
        return (credential as? PublicKeyCredential)?.authenticationResponseJson
            ?: throw AuthException("পাসকি দিয়ে লগইন করা যায়নি। আবার চেষ্টা করুন।")
    }

    /** Creates a new passkey (fingerprint, face or screen lock) and returns the registration JSON. */
    suspend fun createPasskey(activity: Activity, requestJson: String): String {
        val response = try {
            manager.createCredential(activity, CreatePublicKeyCredentialRequest(requestJson))
        } catch (e: CreateCredentialCancellationException) {
            throw CancelledException()
        } catch (e: CreateCredentialException) {
            throw AuthException("পাসকি তৈরি করা যায়নি। ফোনে স্ক্রিন লক চালু আছে কিনা দেখুন।")
        }
        return (response as? CreatePublicKeyCredentialResponse)?.registrationResponseJson
            ?: throw AuthException("পাসকি তৈরি করা যায়নি। আবার চেষ্টা করুন।")
    }
}

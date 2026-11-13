package com.webtecit.devicepilot.core.common

/**
 * Why a value could not be shown. Every screen uses these exact labels so the user
 * always knows whether a value is missing because of the device, Android or a permission.
 */
enum class UnavailableReason(val label: String) {
    NOT_SUPPORTED("Not Supported"),
    NOT_AVAILABLE("Not Available"),
    PERMISSION_REQUIRED("Permission Required"),
    RESTRICTED("Restricted by Android"),
}

/**
 * A value read from the device. Devicepilot never fabricates numbers: a value is either
 * measured by an Android API, estimated with a documented method, or unavailable.
 */
sealed interface Reading<out T> {
    data class Measured<T>(val value: T) : Reading<T>
    data class Estimated<T>(val value: T, val method: String) : Reading<T>
    data class Unavailable(val reason: UnavailableReason) : Reading<Nothing>

    val valueOrNull: T?
        get() = when (this) {
            is Measured -> value
            is Estimated -> value
            is Unavailable -> null
        }

    fun <R> map(transform: (T) -> R): Reading<R> = when (this) {
        is Measured -> Measured(transform(value))
        is Estimated -> Estimated(transform(value), method)
        is Unavailable -> this
    }

    fun display(format: (T) -> String): String = when (this) {
        is Measured -> format(value)
        is Estimated -> "${format(value)} (est.)"
        is Unavailable -> reason.label
    }

    companion object {
        fun <T> ofNullable(value: T?, reason: UnavailableReason = UnavailableReason.NOT_AVAILABLE): Reading<T> =
            if (value == null) Unavailable(reason) else Measured(value)
    }
}

/** Runs [block] and maps any failure (SecurityException, missing file, OEM quirk) to Unavailable. */
inline fun <T> safeReading(
    reasonOnError: UnavailableReason = UnavailableReason.NOT_AVAILABLE,
    block: () -> Reading<T>,
): Reading<T> = try {
    block()
} catch (e: SecurityException) {
    Reading.Unavailable(UnavailableReason.RESTRICTED)
} catch (e: Exception) {
    Reading.Unavailable(reasonOnError)
}

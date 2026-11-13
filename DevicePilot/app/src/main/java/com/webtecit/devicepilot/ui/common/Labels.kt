package com.webtecit.devicepilot.ui.common

import android.os.BatteryManager
import androidx.annotation.StringRes
import com.webtecit.devicepilot.R
import com.webtecit.devicepilot.data.ChargeState
import com.webtecit.devicepilot.domain.FactorStatus
import com.webtecit.devicepilot.domain.FindingStatus
import com.webtecit.devicepilot.domain.Pressure
import com.webtecit.devicepilot.domain.ThermalLevel
import com.webtecit.devicepilot.domain.Transport

@StringRes
fun thermalLabelRes(level: ThermalLevel): Int = when (level) {
    ThermalLevel.NONE -> R.string.thermal_none
    ThermalLevel.LIGHT -> R.string.thermal_light
    ThermalLevel.MODERATE -> R.string.thermal_moderate
    ThermalLevel.SEVERE -> R.string.thermal_severe
    ThermalLevel.CRITICAL -> R.string.thermal_critical
    ThermalLevel.EMERGENCY -> R.string.thermal_emergency
    ThermalLevel.SHUTDOWN -> R.string.thermal_shutdown
    ThermalLevel.UNKNOWN -> R.string.unavailable
}

fun thermalLevel(level: ThermalLevel): Level = when (level) {
    ThermalLevel.NONE -> Level.GOOD
    ThermalLevel.LIGHT, ThermalLevel.MODERATE -> Level.WARN
    ThermalLevel.UNKNOWN -> Level.NEUTRAL
    else -> Level.BAD
}

@StringRes
fun chargeStateRes(s: ChargeState): Int = when (s) {
    ChargeState.CHARGING -> R.string.battery_charging
    ChargeState.DISCHARGING -> R.string.battery_discharging
    ChargeState.FULL -> R.string.battery_full
    ChargeState.NOT_CHARGING -> R.string.battery_not_charging
    ChargeState.UNKNOWN -> R.string.unavailable
}

@StringRes
fun batteryHealthRes(h: Int?): Int = when (h) {
    BatteryManager.BATTERY_HEALTH_GOOD -> R.string.health_good
    BatteryManager.BATTERY_HEALTH_OVERHEAT -> R.string.health_overheat
    BatteryManager.BATTERY_HEALTH_DEAD -> R.string.health_dead
    BatteryManager.BATTERY_HEALTH_OVER_VOLTAGE -> R.string.health_over_voltage
    BatteryManager.BATTERY_HEALTH_COLD -> R.string.health_cold
    BatteryManager.BATTERY_HEALTH_UNSPECIFIED_FAILURE -> R.string.health_failure
    else -> R.string.unavailable
}

@StringRes
fun pressureRes(p: Pressure): Int = when (p) {
    Pressure.LOW -> R.string.pressure_low
    Pressure.MODERATE -> R.string.pressure_moderate
    Pressure.HIGH -> R.string.pressure_high
}

fun pressureLevel(p: Pressure): Level = when (p) {
    Pressure.LOW -> Level.GOOD
    Pressure.MODERATE -> Level.WARN
    Pressure.HIGH -> Level.BAD
}

@StringRes
fun transportRes(t: Transport): Int = when (t) {
    Transport.WIFI -> R.string.net_wifi
    Transport.MOBILE -> R.string.net_mobile
    Transport.OTHER -> R.string.net_other
    Transport.NONE -> R.string.net_none
}

fun factorLevel(s: FactorStatus): Level = when (s) {
    FactorStatus.GOOD -> Level.GOOD
    FactorStatus.WARNING -> Level.WARN
    FactorStatus.BAD -> Level.BAD
    FactorStatus.UNAVAILABLE -> Level.NEUTRAL
}

@StringRes
fun factorStatusRes(s: FactorStatus): Int = when (s) {
    FactorStatus.GOOD -> R.string.status_good
    FactorStatus.WARNING -> R.string.status_attention
    FactorStatus.BAD -> R.string.status_poor
    FactorStatus.UNAVAILABLE -> R.string.status_not_measured
}

fun findingLevel(s: FindingStatus): Level = when (s) {
    FindingStatus.OK -> Level.GOOD
    FindingStatus.SUGGESTION -> Level.WARN
    FindingStatus.NEEDS_APPROVAL -> Level.INFO
    FindingStatus.UNSUPPORTED -> Level.NEUTRAL
}

@StringRes
fun findingStatusRes(s: FindingStatus): Int = when (s) {
    FindingStatus.OK -> R.string.finding_ok
    FindingStatus.SUGGESTION -> R.string.finding_suggestion
    FindingStatus.NEEDS_APPROVAL -> R.string.finding_needs_approval
    FindingStatus.UNSUPPORTED -> R.string.finding_unsupported
}

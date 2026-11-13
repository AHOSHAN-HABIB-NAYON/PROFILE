package com.webtecit.devicepilot.domain

enum class Transport { WIFI, MOBILE, OTHER, NONE }

/** Per-app rule. Wi-Fi rule also applies to Ethernet and other non-cellular networks. */
data class AppRule(val packageName: String, val blockWifi: Boolean, val blockMobile: Boolean) {
    val isActive: Boolean get() = blockWifi || blockMobile
}

object FirewallRules {

    private const val SEP = '|'

    fun encode(rule: AppRule): String =
        "${rule.packageName}$SEP${if (rule.blockWifi) 1 else 0}$SEP${if (rule.blockMobile) 1 else 0}"

    fun decode(raw: String): AppRule? {
        val parts = raw.split(SEP)
        if (parts.size != 3 || parts[0].isBlank()) return null
        if (!isValidPackageName(parts[0])) return null
        return AppRule(parts[0], parts[1] == "1", parts[2] == "1")
    }

    fun decodeAll(raw: Set<String>): Map<String, AppRule> =
        raw.mapNotNull(::decode).filter { it.isActive }.associateBy { it.packageName }

    fun encodeAll(rules: Collection<AppRule>): Set<String> =
        rules.filter { it.isActive }.map(::encode).toSet()

    /** Packages whose traffic must be routed into (and dropped by) the local VPN. */
    fun packagesToBlock(rules: Collection<AppRule>, transport: Transport, ownPackage: String): Set<String> =
        rules.asSequence()
            .filter { it.packageName != ownPackage }
            .filter {
                when (transport) {
                    Transport.WIFI, Transport.OTHER -> it.blockWifi
                    Transport.MOBILE -> it.blockMobile
                    Transport.NONE -> it.blockWifi || it.blockMobile
                }
            }
            .map { it.packageName }
            .toSet()

    fun isValidPackageName(name: String): Boolean =
        Regex("^[A-Za-z][A-Za-z0-9_]*(\\.[A-Za-z0-9_]+)+$").matches(name)
}

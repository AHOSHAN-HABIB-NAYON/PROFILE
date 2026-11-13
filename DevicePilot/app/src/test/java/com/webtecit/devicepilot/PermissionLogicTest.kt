package com.webtecit.devicepilot

import com.webtecit.devicepilot.domain.PermissionLogic
import com.webtecit.devicepilot.domain.PermissionStatus
import org.junit.Assert.assertEquals
import org.junit.Test

class PermissionLogicTest {
    @Test fun usageAccess() {
        assertEquals(PermissionStatus.GRANTED, PermissionLogic.usageAccess(PermissionLogic.MODE_ALLOWED, false))
        assertEquals(PermissionStatus.GRANTED, PermissionLogic.usageAccess(PermissionLogic.MODE_DEFAULT, true))
        assertEquals(PermissionStatus.DENIED, PermissionLogic.usageAccess(PermissionLogic.MODE_DEFAULT, false))
        assertEquals(PermissionStatus.DENIED, PermissionLogic.usageAccess(PermissionLogic.MODE_IGNORED, true))
        assertEquals(PermissionStatus.DENIED, PermissionLogic.usageAccess(PermissionLogic.MODE_ERRORED, true))
    }
    @Test fun notifications() {
        assertEquals(PermissionStatus.NOT_REQUIRED, PermissionLogic.notifications(32, false))
        assertEquals(PermissionStatus.DENIED, PermissionLogic.notifications(33, false))
        assertEquals(PermissionStatus.GRANTED, PermissionLogic.notifications(36, true))
    }
    @Test fun installSources() {
        assertEquals(PermissionStatus.NOT_REQUIRED, PermissionLogic.installSources(25, false))
        assertEquals(PermissionStatus.DENIED, PermissionLogic.installSources(26, false))
        assertEquals(PermissionStatus.GRANTED, PermissionLogic.installSources(30, true))
    }
}

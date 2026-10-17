package com.filepilot.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import com.filepilot.app.ui.FilePilotRoot

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        // The system splash hands over to the in-app intro animation right away.
        val splash = installSplashScreen()
        super.onCreate(savedInstanceState)
        splash.setOnExitAnimationListener { provider ->
            provider.view.animate().alpha(0f).setDuration(180L).withEndAction { provider.remove() }.start()
        }
        enableEdgeToEdge()
        val container = (application as FilePilotApp).container
        // Re-check permissions every time the user comes back (they may have changed them in Settings).
        lifecycle.addObserver(object : DefaultLifecycleObserver {
            override fun onResume(owner: LifecycleOwner) {
                container.refreshAccess()
            }
        })
        setContent { FilePilotRoot(container, showIntro = savedInstanceState == null) }
    }
}

package com.ahoshan.joma

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import com.ahoshan.joma.ui.LoginScreen
import com.ahoshan.joma.ui.MainScreen
import com.ahoshan.joma.ui.Screen
import com.ahoshan.joma.ui.WalletViewModel
import com.ahoshan.joma.ui.theme.JomaTheme

class MainActivity : ComponentActivity() {

    private val vm: WalletViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            JomaTheme {
                val snackbar = remember { SnackbarHostState() }
                val message = vm.state.message
                LaunchedEffect(message) {
                    if (message != null) {
                        snackbar.showSnackbar(message)
                        vm.messageShown()
                    }
                }

                Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
                    when (vm.state.screen) {
                        Screen.Loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                            CircularProgressIndicator()
                        }
                        Screen.Login -> Box(Modifier.fillMaxSize()) {
                            LoginScreen(vm)
                            SnackbarHost(snackbar, Modifier.align(Alignment.BottomCenter).systemBarsPadding())
                        }
                        Screen.Main -> MainScreen(vm) { SnackbarHost(snackbar) }
                    }
                }
            }
        }
    }
}

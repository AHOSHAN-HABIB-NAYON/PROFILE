package com.webtecit.filepilot.feature.onboarding

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Android
import androidx.compose.material.icons.rounded.Code
import androidx.compose.material.icons.rounded.CleaningServices
import androidx.compose.material.icons.rounded.DonutLarge
import androidx.compose.material.icons.rounded.Folder
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.PhoneAndroid
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.webtecit.filepilot.core.designsystem.IconTile
import com.webtecit.filepilot.core.designsystem.LocalAnimationsEnabled
import com.webtecit.filepilot.core.designsystem.StatusPill
import com.webtecit.filepilot.core.preferences.PreferencesRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.launch

/**
 * One introduction page. [available] is false for tools that arrive in later updates, so the
 * introduction never presents unfinished features as ready.
 */
private data class IntroPage(
    val icon: ImageVector,
    val tint: Color,
    val title: String,
    val text: String,
    val available: Boolean,
)

@HiltViewModel
class OnboardingViewModel @Inject constructor(private val preferences: PreferencesRepository) : ViewModel() {
    fun finish(then: () -> Unit) {
        viewModelScope.launch {
            preferences.setOnboardingDone()
            then()
        }
    }
}

@Composable
fun OnboardingScreen(onFinished: () -> Unit, viewModel: OnboardingViewModel = hiltViewModel()) {
    val primary = MaterialTheme.colorScheme.primary
    val tertiary = MaterialTheme.colorScheme.tertiary
    val pages = listOf(
        IntroPage(Icons.Rounded.Folder, primary, "File Manager",
            "Browse internal storage, SD cards and USB drives. Copy, move, rename and organise thousands of files smoothly.", true),
        IntroPage(Icons.Rounded.Code, tertiary, "Code Studio",
            "Edit HTML, CSS, JavaScript and many other languages with syntax highlighting and tabs.", false),
        IntroPage(Icons.Rounded.PhoneAndroid, Color(0xFF7C3AED), "HTML Live Preview",
            "Run complete websites offline and preview them at mobile, tablet and desktop widths.", false),
        IntroPage(Icons.Rounded.Android, Color(0xFF16A34A), "APK Toolkit",
            "Inspect app packages: versions, permissions, signatures and resources.", false),
        IntroPage(Icons.Rounded.DonutLarge, Color(0xFFEA580C), "Storage Analyzer",
            "See which folders and file types use your space.", false),
        IntroPage(Icons.Rounded.CleaningServices, Color(0xFF0369A1), "Cleaner",
            "Find duplicates, large files and empty folders, and review everything before deleting.", false),
        IntroPage(Icons.Rounded.Lock, Color(0xFFDB2777), "Secure Folder",
            "Protect private files with encryption, a PIN and your fingerprint.", false),
    )
    val pager = rememberPagerState { pages.size }
    val scope = rememberCoroutineScope()
    val animations = LocalAnimationsEnabled.current
    val last = pager.currentPage == pages.lastIndex

    Column(
        Modifier
            .fillMaxSize()
            .statusBarsPadding()
            .navigationBarsPadding()
            .padding(horizontal = 24.dp, vertical = 16.dp),
    ) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
            if (!last) TextButton(onClick = { viewModel.finish(onFinished) }) { Text("Skip") }
            else Spacer(Modifier.height(48.dp))
        }
        HorizontalPager(state = pager, modifier = Modifier.weight(1f).fillMaxWidth().testTag("onboarding_pager")) { index ->
            val page = pages[index]
            Column(
                Modifier.fillMaxSize(),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                IconTile(page.icon, page.tint, size = 120.dp)
                Spacer(Modifier.height(32.dp))
                Text(page.title, style = MaterialTheme.typography.headlineMedium, textAlign = TextAlign.Center)
                Spacer(Modifier.height(12.dp))
                StatusPill(if (page.available) "Available now" else "Coming in a future update", positive = page.available)
                Spacer(Modifier.height(16.dp))
                Text(
                    page.text,
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.widthIn(max = 420.dp),
                )
            }
        }
        Row(Modifier.fillMaxWidth().padding(vertical = 16.dp), horizontalArrangement = Arrangement.Center) {
            pages.indices.forEach { i ->
                val selected = i == pager.currentPage
                val width by animateDpAsState(if (selected) 24.dp else 8.dp, label = "dot")
                val color by animateColorAsState(
                    if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant,
                    label = "dotColor",
                )
                Box(
                    Modifier
                        .padding(horizontal = 4.dp)
                        .size(width = width, height = 8.dp)
                        .background(color, CircleShape),
                )
            }
        }
        Button(
            onClick = {
                if (last) viewModel.finish(onFinished)
                else scope.launch {
                    if (animations) pager.animateScrollToPage(pager.currentPage + 1) else pager.scrollToPage(pager.currentPage + 1)
                }
            },
            modifier = Modifier.fillMaxWidth().height(52.dp),
        ) { Text(if (last) "Get started" else "Next") }
        Spacer(Modifier.width(1.dp))
    }
}

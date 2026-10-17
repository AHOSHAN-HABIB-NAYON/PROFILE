package com.webtecit.devicepilot.ui.onboarding

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.webtecit.devicepilot.R
import kotlinx.coroutines.launch

private data class Page(val image: Int, val title: Int, val text: Int)

private val pages = listOf(
    Page(R.drawable.ill_dashboard, R.string.onb_1_title, R.string.onb_1_text),
    Page(R.drawable.ill_apps, R.string.onb_2_title, R.string.onb_2_text),
    Page(R.drawable.ill_firewall, R.string.onb_3_title, R.string.onb_3_text),
    Page(R.drawable.ill_temperature, R.string.onb_4_title, R.string.onb_4_text),
    Page(R.drawable.ill_permission, R.string.onb_5_title, R.string.onb_5_text),
)

@Composable
fun OnboardingScreen(onFinish: () -> Unit) {
    val pager = rememberPagerState { pages.size }
    val scope = rememberCoroutineScope()
    val last = pager.currentPage == pages.lastIndex
    Column(
        Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).safeDrawingPadding().padding(20.dp),
    ) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(stringResource(R.string.app_name), style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.primary, modifier = Modifier.weight(1f))
            if (!last) TextButton(onClick = onFinish) { Text(stringResource(R.string.action_skip)) }
        }
        HorizontalPager(pager, Modifier.weight(1f).fillMaxWidth()) { i ->
            val p = pages[i]
            Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                Image(painterResource(p.image), null, Modifier.fillMaxWidth().height(200.dp))
                Spacer(Modifier.height(24.dp))
                Text(stringResource(p.title), style = MaterialTheme.typography.headlineSmall, textAlign = TextAlign.Center)
                Spacer(Modifier.height(10.dp))
                Text(stringResource(p.text), style = MaterialTheme.typography.bodyMedium, textAlign = TextAlign.Center,
                    color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(horizontal = 8.dp))
            }
        }
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Row(Modifier.weight(1f), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                pages.indices.forEach { i ->
                    val active = i == pager.currentPage
                    val w by animateDpAsState(if (active) 22.dp else 8.dp, label = "dot")
                    val color by animateColorAsState(
                        if (active) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant, label = "dotc")
                    Box(Modifier.height(8.dp).width(w).clip(RoundedCornerShape(50)).background(color))
                }
            }
            Button(onClick = { if (last) onFinish() else scope.launch { pager.animateScrollToPage(pager.currentPage + 1) } }) {
                Text(stringResource(if (last) R.string.action_get_started else R.string.action_next))
            }
        }
    }
}

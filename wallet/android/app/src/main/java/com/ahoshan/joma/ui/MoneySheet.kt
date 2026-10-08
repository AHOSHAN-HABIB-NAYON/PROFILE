@file:OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)

package com.ahoshan.joma.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.ahoshan.joma.ui.theme.MoneyIn
import kotlinx.coroutines.launch

/** Bottom sheet for adding, sending or withdrawing money. */
@Composable
fun MoneySheet(vm: WalletViewModel, action: MoneyAction, onDismiss: () -> Unit) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val scope = rememberCoroutineScope()
    // One key per opened sheet: pressing the button again after a network error
    // retries the same request instead of sending money twice.
    val requestKey = remember { vm.newRequestKey() }

    var amount by remember { mutableStateOf("") }
    var method by remember { mutableStateOf("bkash") }
    var email by remember { mutableStateOf("") }
    var note by remember { mutableStateOf("") }
    var recipient by remember { mutableStateOf<Result<String>?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var sending by remember { mutableStateOf(false) }

    val title = when (action) {
        MoneyAction.Deposit -> "টাকা যোগ করুন"
        MoneyAction.Send -> "টাকা পাঠান"
        MoneyAction.Withdraw -> "টাকা তুলুন"
    }
    val methods = if (action == MoneyAction.Withdraw) listOf("bkash", "nagad", "rocket", "bank") else listOf("bkash", "nagad", "rocket", "card")

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(
            Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .imePadding()
                .navigationBarsPadding()
                .padding(start = 20.dp, end = 20.dp, bottom = 20.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Text(title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)

            if (action == MoneyAction.Send) {
                OutlinedTextField(
                    value = email,
                    onValueChange = { email = it; recipient = null },
                    label = { Text("প্রাপকের ইমেইল") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Next),
                    supportingText = {
                        recipient?.let { r ->
                            r.fold(
                                onSuccess = { Text("✓ $it", color = MoneyIn, fontWeight = FontWeight.SemiBold) },
                                onFailure = { Text(it.message.orEmpty(), color = MaterialTheme.colorScheme.error) },
                            )
                        }
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .onFocusChanged { focus ->
                            if (!focus.isFocused && email.isNotBlank() && recipient == null) {
                                scope.launch { recipient = vm.lookup(email) }
                            }
                        },
                )
            }

            OutlinedTextField(
                value = amount,
                onValueChange = { amount = it.filter { c -> c.isDigit() || c == '.' } },
                label = { Text("পরিমাণ (টাকা)") },
                prefix = { Text("৳ ") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal, imeAction = ImeAction.Done),
                modifier = Modifier.fillMaxWidth(),
            )

            if (action == MoneyAction.Deposit) {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("500", "1000", "5000").forEach { quick ->
                        FilterChip(selected = amount == quick, onClick = { amount = quick }, label = { Text("৳" + taka(quick).removeSuffix(".০০")) })
                    }
                }
            }

            if (action == MoneyAction.Send) {
                OutlinedTextField(
                    value = note,
                    onValueChange = { if (it.length <= 120) note = it },
                    label = { Text("নোট (ঐচ্ছিক)") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
            } else {
                Text(if (action == MoneyAction.Deposit) "কোথা থেকে" else "কোথায় যাবে", fontWeight = FontWeight.SemiBold)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    methods.forEach { m ->
                        FilterChip(selected = method == m, onClick = { method = m }, label = { Text(methodNames.getValue(m)) })
                    }
                }
            }

            error?.let { Text(it, color = MaterialTheme.colorScheme.error) }

            Button(
                onClick = {
                    sending = true
                    error = null
                    scope.launch {
                        val problem = vm.submit(action, amount, method, email, note, requestKey)
                        sending = false
                        if (problem == null) {
                            sheetState.hide()
                            onDismiss()
                        } else {
                            error = problem
                        }
                    }
                },
                enabled = !sending && amount.isNotBlank() && (action != MoneyAction.Send || email.isNotBlank()),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(52.dp),
            ) {
                if (sending) {
                    CircularProgressIndicator(Modifier.size(22.dp), strokeWidth = 2.5.dp, color = MaterialTheme.colorScheme.onPrimary)
                } else {
                    Text(title, fontWeight = FontWeight.SemiBold)
                }
            }
        }
    }
}

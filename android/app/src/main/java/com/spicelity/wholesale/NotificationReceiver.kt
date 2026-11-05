package com.spicelity.wholesale

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class NotificationReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent?) {
        val pendingResult = goAsync()
        CoroutineScope(Dispatchers.IO).launch {
            try {
                NotificationHelper.checkAndNotify(context)
                // Schedule next alarm check in 60s
                NotificationHelper.scheduleNextAlarm(context)
            } finally {
                pendingResult.finish()
            }
        }
    }
}


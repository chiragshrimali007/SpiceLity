package com.spicelity.wholesale

import android.app.Application

class SpiceLityApp : Application() {

    override fun onCreate() {
        super.onCreate()
        NotificationHelper.createNotificationChannel(this)
        NotificationHelper.scheduleBackgroundSync(this)
    }
}


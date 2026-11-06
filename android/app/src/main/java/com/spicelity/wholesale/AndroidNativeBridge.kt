package com.spicelity.wholesale

import android.webkit.JavascriptInterface

class AndroidNativeBridge(private val activity: MainActivity) {

    @JavascriptInterface
    fun showNotification(title: String, message: String, targetPage: String?) {
        activity.runOnUiThread {
            val notifId = (System.currentTimeMillis() % 100000).toInt()
            NotificationHelper.showNotification(
                activity,
                notifId,
                title,
                message,
                targetPage
            )
        }
    }

    @JavascriptInterface
    fun requestPermission() {
        activity.runOnUiThread {
            activity.checkNotificationPermission()
        }
    }

    @JavascriptInterface
    fun setUserRole(role: String) {
        NotificationHelper.setUserRole(activity, role)
    }

    @JavascriptInterface
    fun requestLocationPermission() {
        activity.runOnUiThread {
            activity.checkAndRequestLocationPermission()
        }
    }

    @JavascriptInterface
    fun isLocationPermissionGranted(): Boolean {
        return activity.hasLocationPermission()
    }

    @JavascriptInterface
    fun isGpsEnabled(): Boolean {
        return activity.isGpsEnabled()
    }

    @JavascriptInterface
    fun promptEnableGps() {
        activity.runOnUiThread {
            activity.promptEnableGps()
        }
    }

    @JavascriptInterface
    fun setSwipeRefreshEnabled(enabled: Boolean) {
        activity.runOnUiThread {
            activity.setSwipeRefreshEnabled(enabled)
        }
    }

    @JavascriptInterface
    fun isNativeApp(): Boolean {
        return true
    }
}


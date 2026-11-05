package com.spicelity.wholesale

import android.Manifest
import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.work.*
import org.json.JSONArray
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.TimeUnit

object NotificationHelper {

    const val CHANNEL_ID = "spicelity_alerts_channel"
    private const val CHANNEL_NAME = "SpiceLity Wholesale Alerts"
    private const val TAG = "NotificationHelper"
    private const val PREFS_NAME = "spicelity_prefs"
    private const val PREF_LAST_NOTIF_ID = "last_seen_notif_id"
    private const val PREF_USER_ROLE = "user_role"

    fun createNotificationChannel(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            val soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
            val audioAttributes = AudioAttributes.Builder()
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                .build()

            val channel = NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Real-time alerts for wholesale spice mandi rates, new orders, and chat updates."
                enableLights(true)
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 300, 200, 300)
                setSound(soundUri, audioAttributes)
            }
            notificationManager.createNotificationChannel(channel)
        }
    }

    fun showNotification(
        context: Context,
        id: Int,
        title: String,
        message: String,
        targetUrl: String? = null
    ) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val permissionGranted = ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED
            if (!permissionGranted) {
                Log.w(TAG, "Notification permission not granted. Skipping notification display.")
                return
            }
        }

        createNotificationChannel(context)

        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            if (!targetUrl.isNullOrEmpty()) {
                putExtra("OPEN_TARGET", targetUrl)
            }
        }

        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        } else {
            PendingIntent.FLAG_UPDATE_CURRENT
        }

        val pendingIntent = PendingIntent.getActivity(
            context,
            id,
            intent,
            flags
        )

        val soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)

        val builder = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(message)
            .setStyle(NotificationCompat.BigTextStyle().bigText(message))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setSound(soundUri)
            .setVibrate(longArrayOf(0, 300, 200, 300))
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)

        val notificationManager = NotificationManagerCompat.from(context)
        try {
            notificationManager.notify(id, builder.build())
        } catch (e: SecurityException) {
            Log.e(TAG, "SecurityException while notifying: ${e.message}")
        }
    }

    fun setUserRole(context: Context, role: String) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit().putString(PREF_USER_ROLE, role).apply()
        Log.d(TAG, "Saved active user role: $role")
    }

    fun getUserRole(context: Context): String {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        return prefs.getString(PREF_USER_ROLE, "all") ?: "all"
    }

    fun checkAndNotify(context: Context) {
        try {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val currentRole = prefs.getString(PREF_USER_ROLE, "all") ?: "all"
            val lastSeenId = prefs.getInt(PREF_LAST_NOTIF_ID, -1)

            val apiUrl = "https://spicelity.onrender.com/api/notifications/all"
            val url = URL(apiUrl)
            val conn = (url.openConnection() as HttpURLConnection).apply {
                connectTimeout = 15000
                readTimeout = 15000
                requestMethod = "GET"
                setRequestProperty("Accept", "application/json")
                setRequestProperty("User-Agent", "SpiceLity-Android-Worker")
            }

            if (conn.responseCode == 200) {
                val jsonText = conn.inputStream.bufferedReader().use { it.readText() }
                val jsonArray = JSONArray(jsonText)

                if (lastSeenId == -1) {
                    var maxId = 0
                    for (i in 0 until jsonArray.length()) {
                        val item = jsonArray.getJSONObject(i)
                        val id = item.optInt("id", 0)
                        if (id > maxId) maxId = id
                    }
                    prefs.edit().putInt(PREF_LAST_NOTIF_ID, maxId).apply()
                    Log.d(TAG, "Initialized lastSeenId to $maxId")
                    return
                }

                var newMaxId = lastSeenId
                for (i in (jsonArray.length() - 1) downTo 0) {
                    val item = jsonArray.getJSONObject(i)
                    val id = item.optInt("id", 0)
                    val target = item.optString("target", "all")
                    val text = item.optString("text", "")

                    if (id > lastSeenId) {
                        val matchesRole = currentRole == "all" || target == "all" || target == currentRole
                        if (matchesRole && text.isNotBlank()) {
                            val title = when {
                                text.contains("order", ignoreCase = true) -> "📦 SpiceLity Order Alert"
                                text.contains("rate", ignoreCase = true) || text.contains("wholesale", ignoreCase = true) -> "🌶️ Mandi Rate Update"
                                text.contains("message", ignoreCase = true) || text.contains("💬") -> "💬 SpiceLity Chat"
                                else -> "🔔 SpiceLity Wholesale Alert"
                            }

                            val targetPage = when {
                                text.contains("order", ignoreCase = true) -> if (currentRole == "admin") "orders" else "orders"
                                text.contains("message", ignoreCase = true) -> "chat"
                                else -> "overview"
                            }

                            showNotification(context, id, title, text, targetPage)
                        }

                        if (id > newMaxId) {
                            newMaxId = id
                        }
                    }
                }

                if (newMaxId > lastSeenId) {
                    prefs.edit().putInt(PREF_LAST_NOTIF_ID, newMaxId).apply()
                    Log.d(TAG, "Updated lastSeenId to $newMaxId")
                }
            } else {
                Log.w(TAG, "HTTP fetch failed with response code: ${conn.responseCode}")
            }
            conn.disconnect()
        } catch (e: Exception) {
            Log.e(TAG, "Error in checkAndNotify: ${e.message}")
        }
    }

    fun scheduleNextAlarm(context: Context) {
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
        val intent = Intent(context, NotificationReceiver::class.java)
        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        } else {
            PendingIntent.FLAG_UPDATE_CURRENT
        }
        val pendingIntent = PendingIntent.getBroadcast(context, 101, intent, flags)

        val triggerAtMillis = System.currentTimeMillis() + 60 * 1000 // 60 seconds
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMillis, pendingIntent)
            } else {
                alarmManager.set(AlarmManager.RTC_WAKEUP, triggerAtMillis, pendingIntent)
            }
        } catch (e: Exception) {
            Log.w(TAG, "Could not set exact idle alarm: ${e.message}")
        }
    }

    fun scheduleBackgroundSync(context: Context) {
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()

        val periodicWork = PeriodicWorkRequestBuilder<NotificationSyncWorker>(
            15, TimeUnit.MINUTES
        )
            .setConstraints(constraints)
            .build()

        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            "SpiceLityPeriodicSync",
            ExistingPeriodicWorkPolicy.KEEP,
            periodicWork
        )

        scheduleNextAlarm(context)
    }
}

package com.theurbanbites.app

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.ContentResolver
import android.media.AudioAttributes
import android.net.Uri
import android.os.Build
import android.os.Bundle
import io.flutter.embedding.android.FlutterActivity

class MainActivity : FlutterActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        createChannels()
    }

    // Two notification channels. "orders" is the loud one for the shop and riders: a phone-style ring
    // that plays even when the app is closed. "updates" is for customers: order ready, on the way.
    // A channel's sound can't change after it is created, so the loud one carries a version in its id.
    private fun createChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = getSystemService(NotificationManager::class.java) ?: return
        val ring = Uri.parse("${ContentResolver.SCHEME_ANDROID_RESOURCE}://$packageName/raw/order_ring")
        val alarm = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()
        val orders = NotificationChannel("orders", "New orders", NotificationManager.IMPORTANCE_HIGH).apply {
            description = "Rings for every new order and cancel, even when the app is closed"
            setSound(ring, alarm)
            enableVibration(true)
            vibrationPattern = longArrayOf(0, 600, 300, 600, 300, 600)
            lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
        }
        val updates = NotificationChannel("updates", "Order updates", NotificationManager.IMPORTANCE_HIGH).apply {
            description = "When your order is being made, ready or on its way"
            enableVibration(true)
        }
        nm.createNotificationChannel(orders)
        nm.createNotificationChannel(updates)
    }
}

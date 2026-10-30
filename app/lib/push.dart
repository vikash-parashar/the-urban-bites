import 'dart:io' show Platform;

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

/// Phone notifications (Firebase Cloud Messaging), so a new order rings Manjeet's phone even when the
/// app is closed, a rider hears about a delivery that is ready, and a customer hears their order is ready.
///
/// The app only fetches a push token and hands it to the website (window.ubPushToken); the website
/// tells the server which login or order the phone belongs to, and the server sends the pushes.
/// Firebase settings come from --dart-define at build time; without them pushes are simply off.
class Push {
  static const _apiKey = String.fromEnvironment('FB_API_KEY');
  static const _appId = String.fromEnvironment('FB_APP_ID');
  static const _senderId = String.fromEnvironment('FB_SENDER_ID');
  static const _projectId = String.fromEnvironment('FB_PROJECT_ID');

  static bool get configured => _apiKey != '' && _appId != '' && _senderId != '' && _projectId != '';

  static bool _ready = false;

  /// Starts Firebase. Safe to call when it isn't configured, and never throws.
  static Future<void> init() async {
    if (!configured || !Platform.isAndroid) return; // iPhone pushes need a paid Apple account
    try {
      await Firebase.initializeApp(
        options: const FirebaseOptions(apiKey: _apiKey, appId: _appId, messagingSenderId: _senderId, projectId: _projectId),
      );
      _ready = true;
    } catch (e) {
      debugPrint('push init: $e');
    }
  }

  // getToken/onTokenRefresh give the registration token that the server's FCM HTTP v1 "token" field
  // expects. The newer register()/onRegistered API returns an installation ID for a different send
  // mode, so the classic calls stay on purpose.

  /// Asks for permission (Android 13+ shows a prompt once) and returns this phone's push token.
  static Future<String?> token() async {
    if (!_ready) return null;
    try {
      await FirebaseMessaging.instance.requestPermission();
      // ignore: deprecated_member_use
      return await FirebaseMessaging.instance.getToken();
    } catch (e) {
      debugPrint('push token: $e');
      return null;
    }
  }

  /// A renewed token (Firebase rotates them now and then).
  // ignore: deprecated_member_use
  static Stream<String> get tokenRefresh => _ready ? FirebaseMessaging.instance.onTokenRefresh : const Stream.empty();

  /// The page to open for a tapped notification ("#staff" for the shop and riders), if any.
  static Future<String?> openedFrom() async {
    if (!_ready) return null;
    final m = await FirebaseMessaging.instance.getInitialMessage();
    return m?.data['open'] as String?;
  }

  static Stream<String> get taps => _ready
      ? FirebaseMessaging.onMessageOpenedApp.map((m) => (m.data['open'] as String?) ?? '')
      : const Stream.empty();
}

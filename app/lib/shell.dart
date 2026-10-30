import 'dart:async';
import 'dart:io' show Platform;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:wakelock_plus/wakelock_plus.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';
import 'package:webview_flutter_wkwebview/webview_flutter_wkwebview.dart';

import 'push.dart';

const lastAreaStaffKey = 'ub-last-area-staff';

/// WebShell shows the live website full screen and handles everything around it.
class WebShell extends StatefulWidget {
  const WebShell({super.key, required this.site, required this.startOnStaff, required this.prefs});
  final String site;
  final bool startOnStaff;
  final SharedPreferences prefs;

  @override
  State<WebShell> createState() => _WebShellState();
}

class _WebShellState extends State<WebShell> with WidgetsBindingObserver {
  late final WebViewController _web;
  late final Uri _home = Uri.parse(widget.site);
  int _progress = 0;
  bool _offline = false;
  bool _onStaff = false;
  DateTime? _lastBack;
  String? _pushToken;
  final _subs = <StreamSubscription<String>>[];

  String get _start => widget.startOnStaff ? '${widget.site}/?app=staff#staff' : '${widget.site}/';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);

    // iPhone: let sounds and voice play without a tap, and inline (not full screen).
    final PlatformWebViewControllerCreationParams params = WebViewPlatform.instance is WebKitWebViewPlatform
        ? WebKitWebViewControllerCreationParams(allowsInlineMediaPlayback: true, mediaTypesRequiringUserAction: const <PlaybackMediaTypes>{})
        : const PlatformWebViewControllerCreationParams();

    _web = WebViewController.fromPlatformCreationParams(params, onPermissionRequest: _onWebPermission)
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(const Color(0xFF0A0A10))
      ..setNavigationDelegate(NavigationDelegate(
        onProgress: (p) => setState(() => _progress = p),
        onPageStarted: (_) => setState(() => _offline = false),
        onPageFinished: (_) => _sendPushToken(),
        onUrlChange: (c) => _onUrl(c.url),
        onNavigationRequest: _onNavigate,
        onWebResourceError: (e) {
          // Only a failed page load shows the offline screen; a failed image or font does not.
          if (e.isForMainFrame ?? false) setState(() => _offline = true);
        },
      ));

    _web.getUserAgent().then((ua) => _web.setUserAgent('${ua ?? ''} UrbanBitesApp/2.0'));

    final p = _web.platform;
    if (p is AndroidWebViewController) {
      // Android: the order bell and voice can ring without a first tap.
      p.setMediaPlaybackRequiresUserGesture(false);
      p.setGeolocationPermissionsPromptCallbacks(onShowPrompt: (req) async {
        final ok = await _ask(Permission.locationWhenInUse);
        return GeolocationPermissionsResponse(allow: ok, retain: ok);
      });
    }
    if (p is WebKitWebViewController) {
      p.setAllowsBackForwardNavigationGestures(true);
    }

    _web.loadRequest(Uri.parse(_start));
    _setupPush();
  }

  // Push: get this phone's token, hand it to the website, and open the right screen when a
  // notification is tapped while the app is in the background.
  Future<void> _setupPush() async {
    _subs.add(Push.tokenRefresh.listen((t) {
      _pushToken = t;
      _sendPushToken();
    }));
    _subs.add(Push.taps.listen((open) {
      _web.loadRequest(Uri.parse(open == '#staff' ? '${widget.site}/?app=staff#staff' : '${widget.site}/'));
    }));
    _pushToken = await Push.token();
    _sendPushToken();
  }

  void _sendPushToken() {
    final t = _pushToken;
    if (t == null || !RegExp(r'^[A-Za-z0-9_:\-]+$').hasMatch(t)) return;
    _web.runJavaScript("window.ubPushToken='$t';window.dispatchEvent(new Event('ub-push-token'));").catchError((_) {});
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    for (final s in _subs) {
      s.cancel();
    }
    WakelockPlus.disable();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Back from the background: re-check orders straight away instead of waiting for the next poll.
    if (state == AppLifecycleState.resumed && _onStaff) {
      _web.runJavaScript("window.dispatchEvent(new Event('focus'))");
    }
  }

  Future<bool> _ask(Permission perm) async {
    final s = await perm.request();
    return s.isGranted || s.isLimited;
  }

  // The website asks for the microphone (voice note to the kitchen) or the camera.
  Future<void> _onWebPermission(WebViewPermissionRequest req) async {
    // iPhone: WKWebView shows the system prompt itself (texts are in Info.plist).
    if (Platform.isIOS) return req.grant();
    var ok = true;
    for (final t in req.types) {
      if (t == WebViewPermissionResourceType.microphone) ok = ok && await _ask(Permission.microphone);
      if (t == WebViewPermissionResourceType.camera) ok = ok && await _ask(Permission.camera);
    }
    ok ? req.grant() : req.deny();
  }

  void _onUrl(String? url) {
    if (url == null) return;
    final staff = Uri.parse(url).fragment.startsWith('staff');
    if (staff == _onStaff) return;
    setState(() => _onStaff = staff);
    widget.prefs.setBool(lastAreaStaffKey, staff);
    // Keep the tablet screen on while the orders screen is open, so no order is missed.
    staff ? WakelockPlus.enable() : WakelockPlus.disable();
  }

  // Our own pages stay in the app; UPI, phone, WhatsApp, maps, Instagram and the rest open their apps.
  Future<NavigationDecision> _onNavigate(NavigationRequest req) async {
    final uri = Uri.tryParse(req.url);
    if (uri == null) return NavigationDecision.prevent;
    final ours = (uri.scheme == 'https' || uri.scheme == 'http') && (uri.host == _home.host || uri.host == 'www.${_home.host}');
    if (ours || !req.isMainFrame || uri.scheme == 'about' || uri.scheme == 'data' || uri.scheme == 'blob') {
      return NavigationDecision.navigate;
    }
    final opened = await launchUrl(uri, mode: LaunchMode.externalApplication).catchError((_) => false);
    if (!opened && mounted && uri.scheme == 'upi') {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('No UPI app found. Install GPay, PhonePe or Paytm, or scan the QR from another phone.')));
    }
    return NavigationDecision.prevent;
  }

  Future<void> _back() async {
    if (await _web.canGoBack()) {
      await _web.goBack();
      return;
    }
    // Press back twice to leave, so the orders screen isn't closed by accident.
    final now = DateTime.now();
    if (_lastBack != null && now.difference(_lastBack!) < const Duration(seconds: 2)) {
      SystemNavigator.pop();
      return;
    }
    _lastBack = now;
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Press back again to close the app'), duration: Duration(seconds: 2)));
    }
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) { if (!didPop) _back(); },
      child: Scaffold(
        body: SafeArea(
          bottom: false,
          child: Stack(children: [
            WebViewWidget(controller: _web),
            if (_progress < 100 && !_offline)
              Positioned(top: 0, left: 0, right: 0, child: LinearProgressIndicator(value: _progress / 100, minHeight: 3, color: const Color(0xFFF6B445), backgroundColor: Colors.transparent)),
            if (_offline) _Offline(onRetry: () { setState(() => _offline = false); _web.reload(); }),
          ]),
        ),
      ),
    );
  }
}

class _Offline extends StatelessWidget {
  const _Offline({required this.onRetry});
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Container(
      color: const Color(0xFF0A0A10),
      alignment: Alignment.center,
      padding: const EdgeInsets.all(28),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        const Text('📶', style: TextStyle(fontSize: 56)),
        const SizedBox(height: 12),
        const Text('No internet', style: TextStyle(fontFamily: 'Anton', fontSize: 30, color: Color(0xFFF7F0E1), letterSpacing: 1)),
        const SizedBox(height: 8),
        Text(
          Platform.isIOS ? 'Check Wi-Fi or mobile data, then try again.' : 'Check Wi-Fi or mobile data, then try again. Orders placed already are safe.',
          textAlign: TextAlign.center,
          style: const TextStyle(fontSize: 16, color: Color(0xFFA4ABD0)),
        ),
        const SizedBox(height: 20),
        FilledButton(
          onPressed: onRetry,
          style: FilledButton.styleFrom(backgroundColor: const Color(0xFFF6B445), foregroundColor: const Color(0xFF0B1033), padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 14)),
          child: const Text('Try again', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
        ),
      ]),
    );
  }
}

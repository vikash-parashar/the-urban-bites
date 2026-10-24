# Urban Bites app (Flutter, Android)

One app for everyone. It opens on the menu for customers, who can order and track (receipt icon). **Staff sign in** (top right) takes a staff email + password; after that the tablet opens straight into the dashboard:

- **Orders**: live list (refreshes every 10 s, rings on a new order). Tap an order, pick a prep time (5–45 min or custom), and the customer's website/app shows the countdown. Move it Cooking → Ready → Out for delivery → Done, mark paid, or cancel. Each order shows where it came from (website, app, counter), the delivery distance and fee, and the customer's badge ("5th order · Regular").
- **Walk-in**: record a counter sale by tapping items (or typing an amount). With the customer's phone it counts toward their badge; it always counts in earnings.
- **Offers**: post an offer of the day or of the month. Link a dish and set a price, and that price is charged automatically while it runs.
- **Menu**: change full/half prices, switch items on or off.
- **Shop**: pause online orders, set the minimum order, free-delivery amount and radius, delivery charge, and a notice for the website.
- **Earnings**: today / 7 days / 30 days, cash vs online, best sellers.
- **Staff** (admin only): add staff, reset passwords, switch accounts off.

Customers see the free-delivery rule and today's offers above the menu, offer prices on dishes, and the minimum order in the cart.

Checked with Flutter 3.47.8: `flutter analyze` reports no issues, and the screens were run as a web build against the local API. The Android APK itself has not been built here (no Android SDK in the build environment).

## Build

This folder holds `pubspec.yaml` and `lib/` only. Generate the Android shell once, then build:

```sh
cd app
flutter create --platforms=android --org com.theurbanbites .
flutter pub get
flutter build apk --release --dart-define=API_URL=https://api.theurbanbites.in --dart-define=SITE_URL=https://theurbanbites.in
```

Install `build/app/outputs/flutter-apk/app-release.apk` on the tablet. For local testing against `docker compose`, use `--dart-define=API_URL=http://10.0.2.2:8080` in the Android emulator.

Add `<uses-permission android:name="android.permission.INTERNET"/>` to `android/app/src/main/AndroidManifest.xml` if `flutter create` didn't, and `android:usesCleartextTraffic="true"` on `<application>` only for local http testing.

## Demo build (no server needed)

`flutter build apk --release --dart-define=DEMO=true` makes an APK that keeps a sample menu, orders,
offers and badges on the phone. Test logins (demo build only): owner `owner@demo.in`, admin
`admin@demo.in`, password `urban1234`. The login screen has "Fill owner login" and "Reset demo data".
Orders placed from the customer side appear in the owner's Orders tab on the same phone.

GitHub Actions (`.github/workflows/android-apk.yml`) builds this APK on every push to main and puts it
on the "Latest APK" release. Set the repository variable `API_URL` to also build the live APK.

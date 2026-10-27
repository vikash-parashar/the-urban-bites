# The Urban Bites app (Android + iPhone)

The app is the live website, https://theurbanbites.in, inside a small Flutter shell. Every
feature shipped on the website is in the app straight away; rebuild only when this shell changes.

What the shell adds:
- Opens on the staff orders screen for whoever used it last time (Manjeet's tablet), the menu otherwise.
- Order bells and voice play without a first tap.
- Location (delivery, cart location, rider map) and microphone (voice note) permissions.
- UPI, phone, WhatsApp, SMS, maps and Instagram links open their own apps.
- Keeps the screen on while the orders screen is open.
- Android back button goes back in the site; press twice to close. Offline screen with retry.

Builds: the "Apps" GitHub Action (.github/workflows/android-apk.yml) puts `urban-bites.apk` and
`urban-bites-ios-unsigned.ipa` on the "Latest APK" release. The iPhone file needs signing before it
installs: an Apple Developer account ($99/year), or a free Apple ID with Sideloadly/AltStore (7 days).

Change the site address with `--dart-define=SITE_URL=https://…` (repository variable SITE_URL).

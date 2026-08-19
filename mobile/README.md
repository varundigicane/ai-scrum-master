# AI Scrum Master — Mobile (Flutter)

Digicane-aligned light theme Flutter client for Android and iOS with a **collapsible top-left drawer**.

## API endpoint

The release app is hard-coded to the production Railway URL in `lib/config.dart`:

`https://web-production-9f45.up.railway.app`

There is **no API base URL field** on the login screen. Change `kApiBaseUrl` and rebuild if the host changes.

## Prerequisites

- Flutter SDK 3.47+ (`C:\Users\Varun\flutter` on the build machine, or any PATH install)
- Android SDK + JDK 17

## Run

```bash
cd mobile
flutter pub get
flutter run
```

## Build ready-to-use Android APK

```bash
cd mobile
flutter pub get
flutter build apk --release --android-skip-build-dependency-validation
```

Output:

`mobile/build/app/outputs/flutter-apk/app-release.apk`

Copy for sharing:

`mobile/dist/AI_Scrum_Master-release.apk`

Install:

```bash
adb install -r build/app/outputs/flutter-apk/app-release.apk
```

Or copy the APK to the device and open it (allow install from unknown sources if prompted).

## iOS

Open `mobile/ios` in Xcode on a Mac to archive. This Windows environment produces the Android APK.

## Features

- Email/password login via `/api/mobile/login` (does not change web NextAuth cookies)
- Role-based drawer menus from `/api/mobile/me`
- Overview KPIs, Projects list, Meeting Notes list/create
- Other menus open a connected placeholder pointing users to the web app for full editors

## Data safety

Mobile APIs are **additive**. They read/write the same Postgres tenant data as the web app and never drop existing tables.

# AI Scrum Master — Mobile (Flutter)

Digicane-aligned light theme Flutter client for Android and iOS with a **collapsible top-left drawer**.

## Prerequisites

- Flutter SDK 3.47+ (`C:\Users\Varun\flutter` on the build machine, or any PATH install)
- Android SDK + JDK 17
- Running AI Scrum Master API (`npm run dev` or Docker) with migrations applied

## Configure API URL

On the login screen set **API base URL**:

| Environment | Typical URL |
|-------------|-------------|
| Android emulator → host | `http://10.0.2.2:3000` |
| Physical device (LAN) | `http://<your-pc-ip>:3000` |
| Production | `https://your-host` |

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
flutter build apk --release
```

Output:

`mobile/build/app/outputs/flutter-apk/app-release.apk`

A copy for sharing is also placed at:

`mobile/dist/AI_Scrum_Master-release.apk`

If Gradle/Flutter version checks complain on this machine, rebuild with:

```bash
flutter build apk --release --android-skip-build-dependency-validation
```

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

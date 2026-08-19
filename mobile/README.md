# AI Scrum Master — Mobile (Flutter)

Digicane-aligned light theme Flutter client for Android and iOS with a **collapsible top-left drawer**.

## API endpoint

The release app is hard-coded to the production Railway URL in `lib/config.dart`:

`https://web-production-9f45.up.railway.app`

There is **no API base URL field** on the login screen. Change `kApiBaseUrl` and rebuild if the host changes.

## Prerequisites

- Flutter SDK 3.9+ (`C:\Users\Varun\flutter` on the build machine, or any PATH install)
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
- **Overview** KPIs and **Projects**
- **Meeting Notes** — rich notes editor (format toolbar), detail pipeline (summary → proposal → FRs → push backlog), schedule with date/hour/minute/timezone dropdowns and Meet/Teams auto-create or paste
- **Settings** — company Mail, MS Teams, AI, delivery, and meetings panels (same as web; secrets blank=keep)
- **All menus** — drawer lists live company data (accounts, resources, status, etc.); full editors remain on web where needed
- **Billing** — month totals by account/project/resource + working-days override
- **GTS Report** — generate/refresh month, edit header, view lines
- **AI Agent** — list jobs and Run now (when permitted)
- Other menus stay as lightweight placeholders pointing to the web app

## Data safety

Mobile APIs are **additive**. They read/write the same Postgres tenant data as the web app and never drop existing tables.

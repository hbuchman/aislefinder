# Chapter 9: Adding Android Support

Android support mirrors iOS (chapter 8) — same Capacitor model, different
toolchain. Read chapter 8 first; this chapter covers what's different.

## 9.1 The Android flavor of Capacitor

The `android/` directory is a generated **Gradle** project (Android's build
system, the counterpart of Xcode's project). The app is one Activity hosting
a full-screen **WebView** that loads the copied `build/` folder from the
`http://localhost` / `https://localhost` origin — also present in the Flask
CORS allowlist. Plugins bridge JavaScript to Kotlin/Java; the same
`storage.js` Preferences mirroring from chapter 8 lands in Android's
SharedPreferences.

The same `capacitor.config.json` drives both platforms — `com.aislefinder.app`
becomes the Android **applicationId** (the permanent identity on Google Play).

Key files inside `android/` you may eventually touch:

| File | What it controls |
|------|------------------|
| `app/build.gradle` | applicationId, versionCode/versionName, SDK levels |
| `app/src/main/AndroidManifest.xml` | permissions, app name, deep links |
| `app/src/main/res/` | icons, splash screens |
| `variables.gradle` | shared SDK/dependency versions |

## 9.2 The build loop

Identical shape to iOS:

```json
"android:build": "REACT_APP_API_URL=https://aislefinder3000.com react-scripts build && cap sync android",
"android:open": "cap open android"
```

```bash
# Run this — after any change to src/
npm run android:build   # build React, copy into android/, sync plugins
npm run android:open    # open the project in Android Studio
```

In Android Studio: let Gradle finish syncing (progress bar at the bottom),
create a virtual device if you don't have one (*Device Manager → Create
Device*), then press **▶ Run**.

Real devices are easier than iOS: enable Developer Options on the phone (tap
*Settings → About phone → Build number* seven times), turn on **USB
debugging**, plug in, and it appears in the run target dropdown — no signing
account needed for development (Android auto-signs with a local debug key).

Command-line alternative if you don't want the IDE open:

```bash
# Run this — from android/
./gradlew assembleDebug   # produces app/build/outputs/apk/debug/app-debug.apk
```

## 9.3 Release signing

For the Play Store you sign with your own key instead of the debug key:

```bash
# Run this — one time; keep the file and passwords somewhere safe!
keytool -genkey -v -keystore aislefinder-release.keystore \
  -alias aislefinder -keyalg RSA -keysize 2048 -validity 10000
```

Wire it into `android/app/build.gradle` as a `signingConfig` for the
`release` build type (keep the keystore and its passwords **out of git** —
reference them from `~/.gradle/gradle.properties` or environment variables).
Then build the upload bundle:

```bash
# Run this — from android/
./gradlew bundleRelease   # produces app/build/outputs/bundle/release/app-release.aab
```

Losing the keystore historically meant losing the ability to update your
app; with **Play App Signing** (the default for new apps), Google holds the
final signing key and your keystore is just the upload key — still, back it
up.

## TODOs to get this working

- [ ] **Install Android Studio** from https://developer.android.com/studio
      (bundles the Android SDK, an emulator, and a compatible JDK)
- [ ] **First launch**: let the setup wizard install the SDK + platform
      tools, and create one virtual device in Device Manager
- [ ] **Deploy the web app first** (chapter 7) — same production-API baking
      as iOS
- [ ] **Build + open** — `npm run android:build && npm run android:open`,
      wait for Gradle sync, press Run
- [ ] **For a real device**: enable Developer Options + USB debugging on the
      phone
- [ ] **For the Play Store**: create a Google Play Console developer account
      ($25 one-time) at https://play.google.com/console, generate a release
      keystore with `keytool` (back it up!), add the `signingConfig`, build
      the `.aab` with `./gradlew bundleRelease`, create the app listing, and
      upload

---

Next: [Chapter 10 — Adding AWS Logins](10-aws-logins.md)

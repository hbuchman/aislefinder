# Chapter 8: Adding iOS Support

Aisle Finder runs on iPhone without a rewrite, using **Capacitor**: the same
React build ships inside a native iOS app.

## 8.1 How Capacitor works

Capacitor wraps your web app in a native shell. The iOS app is a real Xcode
project whose main screen is a full-size **WKWebView** loading your `build/`
folder from disk (served at the `capacitor://localhost` origin — which is why
that origin is in the Flask CORS allowlist). When the web code needs
something native — storage, camera, push — it calls a Capacitor **plugin**
that bridges JavaScript to Swift.

The whole configuration is three lines (`capacitor.config.json`):

```json
{
  "appId": "com.aislefinder.app",
  "appName": "Aisle Finder",
  "webDir": "build"
}
```

- `appId` — the reverse-DNS bundle identifier; this is your app's permanent
  identity in the App Store. Don't change it after shipping.
- `webDir` — which folder gets copied into the native app (CRA's `build/`).

The `ios/` directory is the generated Xcode project. It's checked into git —
it contains real native config (Info.plist, icons, signing settings) that
you edit over time. It was created once with `npx cap add ios`; you won't
need to run that again.

## 8.2 The build loop

The key mental model: **the native app has a copy of your web build, not a
live link to it.** After any web change, you rebuild and re-sync:

```json
"ios:build": "REACT_APP_API_URL=https://aislefinder3000.com react-scripts build && cap sync ios",
"ios:open": "cap open ios"
```

```bash
# Run this — after any change to src/
npm run ios:build   # build React for production, copy into ios/, update plugins
npm run ios:open    # open the project in Xcode
```

Two things in `ios:build` worth understanding:

- `REACT_APP_API_URL=https://aislefinder3000.com` — the mobile app can't use
  relative `/api/...` URLs like the website does (there's no web server inside
  the app), so the API base is baked in as the production domain. This means
  **the mobile apps depend on chapter 7 being done.**
- `cap sync ios` — copies `build/` into the iOS project and installs/updates
  any native plugin code (via CocoaPods).

Then in Xcode: pick a simulator (or your plugged-in iPhone) from the device
dropdown and press **▶ Run** (Cmd-R).

## 8.3 Native storage: why `storage.js` exists

iOS can evict a WKWebView's localStorage when the device is low on space —
which would silently delete a user's grocery lists. `src/storage.js` guards
against this with the Capacitor **Preferences** plugin: every localStorage
write is mirrored (debounced) to native storage (UserDefaults on iOS), and
restored on launch if localStorage comes up empty. This is a good example of
the pattern for platform-specific behavior: the web code checks
`Capacitor.isNativePlatform()` and stays a no-op in the browser.

## 8.4 Signing and running on a real device

Running on the **simulator** needs nothing but Xcode. Running on a **real
iPhone** requires code signing:

1. In Xcode, select the `App` target → *Signing & Capabilities*.
2. Check *Automatically manage signing* and pick your **Team** (your Apple
   ID — a free account works for on-device development; builds expire after
   7 days).
3. Plug in the phone, select it as the run target, press Run. First time:
   on the phone, trust the developer cert under
   *Settings → General → VPN & Device Management*.

Distributing through the **App Store** additionally requires the paid Apple
Developer Program ($99/year), an app record in App Store Connect matching
`com.aislefinder.app`, icons/screenshots, and an archive upload
(*Product → Archive → Distribute App* in Xcode).

## TODOs to get this working

- [ ] **A Mac** — iOS builds only work on macOS
- [ ] **Install Xcode** from the Mac App Store (large download), then run it
      once to accept the license and install the iOS platform
- [ ] **Install CocoaPods** (Capacitor's iOS dependency manager) —
      `brew install cocoapods`
- [ ] **Deploy the web app first** (chapter 7) — the app calls the production
      API baked in via `REACT_APP_API_URL`
- [ ] **Build + open** — `npm run ios:build && npm run ios:open`, then Run on
      a simulator
- [ ] **For a real device**: sign in with your Apple ID in
      Xcode → Settings → Accounts, set the Team under Signing & Capabilities
- [ ] **For the App Store**: enroll in the Apple Developer Program
      ($99/year) at https://developer.apple.com, create the app record in
      App Store Connect, archive and upload from Xcode

---

Next: [Chapter 9 — Adding Android Support](09-android-support.md)

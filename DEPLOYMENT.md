# Deployment

## Production Topology

- Deploy the backend as a Node.js web service with PostgreSQL.
- Deploy the frontend as a static site.
- Point `REACT_APP_API_URL` at the backend public URL.

## Recommended Hosted Setup

1. Push this repository to GitHub.
2. Connect the repository to Render using `render.yaml`.
3. Provision a PostgreSQL database and copy its connection values into the backend environment.
4. Set `CORS_ORIGIN` on the backend to the frontend production URL.
5. Set `REACT_APP_API_URL` on the frontend to the backend production URL.
6. After the web deploy is healthy, run `npm --prefix frontend run cap:sync` and open the native projects for store builds.

## Verified Build State

- Backend TypeScript build succeeds.
- Frontend production build succeeds.
- Capacitor web asset copy and Android sync succeed.

## Environment Blockers On This Machine

- Java and CocoaPods are installed and working.
- Android Studio is installed, but the Android SDK is not configured yet.
- iOS native build is still blocked because full Xcode is not installed or selected, and `xcode-select` points to Command Line Tools.

## Native Build Commands

### Android

1. Open Android Studio and complete first-run setup.
2. Install the Android SDK, platform tools, and at least one platform image.
3. Set `ANDROID_HOME` or create `frontend/android/local.properties` with `sdk.dir=<path-to-sdk>`.
4. Set `JAVA_HOME` to Homebrew OpenJDK 17.
5. Run `npm --prefix frontend run cap:sync`.
6. Run `cd frontend/android && ./gradlew assembleDebug`.

### iOS

1. Install full Xcode from the App Store.
2. Run `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`.
3. Open Xcode once to accept the license and finish component installation.
4. CocoaPods is already installed on this machine, but if needed use `brew install cocoapods`.
5. Run `npm --prefix frontend run cap:sync`.
6. Run `cd frontend/ios/App && pod install`.
7. Build with `xcodebuild -workspace App.xcworkspace -scheme App -configuration Debug -sdk iphonesimulator build`.

## Local Helper

Run `scripts/check-native-setup.sh` to see the current native prerequisites and the exact next commands to execute.
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

- Android native build is blocked by a missing Java runtime.
- iOS native build is blocked because full Xcode and CocoaPods are not installed, and `xcode-select` points to Command Line Tools.

## Native Build Commands

### Android

1. Install a JDK and Android Studio.
2. Set `JAVA_HOME`.
3. Run `npm --prefix frontend run cap:sync`.
4. Run `cd frontend/android && ./gradlew assembleDebug`.

### iOS

1. Install full Xcode from the App Store.
2. Run `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`.
3. Install CocoaPods with `sudo gem install cocoapods` or `brew install cocoapods`.
4. Run `npm --prefix frontend run cap:sync`.
5. Run `cd frontend/ios/App && pod install`.
6. Build with `xcodebuild -workspace App.xcworkspace -scheme App -configuration Debug -sdk iphonesimulator build`.
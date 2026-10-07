# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   bun install --frozen-lockfile
   ```

2. Start the app

   ```bash
   bun run start
   ```

## Optional demo history

To pre-populate the app with 16 weeks of sample workout history and a friend
activity preview, copy `.env.example` to `.env` and set
`EXPO_PUBLIC_SEED_DEMO_DATA=true`. Restart the
Expo server after changing the flag. Set it to `false` (or remove it) and launch
the app once to remove only the generated demo workouts; any workouts you logged
yourself are kept.

## Account deletion release setup

- Configure Better Auth email verification, Resend, and MFA in the Worker. The
  in-app Profile flow deletes the identity and synchronized app data together.
- Apply the Worker migrations and set its `SUPPORT_EMAIL` to a monitored inbox.
- Set `EXPO_PUBLIC_API_URL` to the Worker origin (defaults to
  `https://api.lift.garrett.one`).
- Use `<EXPO_PUBLIC_API_URL>/delete-account` as the Google Play account
  deletion URL. The same host serves `/privacy`, `/terms`, and `/support`.

## iOS release: 1.3.4

The App Store version is `expo.version` in `app.json`; keep `package.json`'s
version aligned. `eas.json` uses `appVersionSource: "remote"` and production
`autoIncrement: true`, so EAS manages the iOS build number on each production
build. A rebuild of this release keeps version `1.3.4` and receives a new build
number. See [Expo version management](https://docs.expo.dev/build-reference/app-versions/).

### Prepare

- Use Bun `1.2.18`, an Expo account with access to owner `garrettp`, and a paid
  Apple Developer account with access to LIFT (`com.garrettp.lift`).
- Confirm production uses `EXPO_PUBLIC_API_URL=https://api.lift.garrett.one`
  (the app default) and demo seeding is disabled. Configure any overrides in
  the EAS production environment; local `.env` files are ignored by Git.
- Ensure the production Worker and required migrations are deployed using
  `../worker/README.md` before testing the release.

From the repository root:

```bash
cd mobile
bun install --frozen-lockfile
bun run check
bunx eas-cli login
```

### Build and upload

Build the signed production IPA in EAS, then upload that specific build using
the build ID shown in the completed build's output:

```bash
bunx eas-cli build --platform ios --profile production
bunx eas-cli submit --platform ios --profile production --id <BUILD_ID>
```

On first use, follow the Apple signing and submission credential prompts.
The production submission profile is currently empty, so supply the existing
LIFT App Store Connect app when prompted. For repeatable submissions, set
`submit.production.ios.ascAppId` in `eas.json` to the numeric Apple ID under
App Store Connect → LIFT → App Information.

Once credentials are configured, build and upload together with:

```bash
bunx eas-cli build --platform ios --profile production --auto-submit
```

These commands upload to App Store Connect/TestFlight. Follow
[Expo's iOS submission guide](https://docs.expo.dev/submit/ios/) for credential
setup.

### Submit for App Review

1. Wait for processing in [App Store Connect](https://appstoreconnect.apple.com/)
   and test the `1.3.4` build through TestFlight, including sign-in, workout
   logging, sync, rest notifications/Live Activities, and account deletion.
2. Open LIFT and create the iOS version `1.3.4`. Select the uploaded build with
   the matching version and build number.
3. Complete What's New, screenshots, privacy information, support URL, review
   contact/access details, and any export compliance questions. Choose the
   desired release option.
4. Click **Add for Review**, then open the draft submission and click
   **Submit for Review**. See
   [Apple's submission instructions](https://developer.apple.com/help/app-store-connect/manage-submissions-to-app-review/submit-an-app).

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
bun run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

### Other setup steps

- To run ESLint, use `bun run lint`, or follow our guide on ["Using ESLint and Prettier"](https://docs.expo.dev/guides/using-eslint/)
- If you'd like to set up unit testing, follow our guide on ["Unit Testing with Jest"](https://docs.expo.dev/develop/unit-testing/)
- Learn more about the TypeScript setup in this template in our guide on ["Using TypeScript"](https://docs.expo.dev/guides/typescript/)

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.

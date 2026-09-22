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

To pre-populate the app with 16 weeks of sample workout history, copy
`.env.example` to `.env` and set `EXPO_PUBLIC_SEED_DEMO_DATA=true`. Restart the
Expo server after changing the flag. Set it to `false` (or remove it) and launch
the app once to remove only the generated demo workouts; any workouts you logged
yourself are kept.

## Account deletion release setup

- Enable user self-deletion in the Clerk Dashboard so the in-app Profile flow
  can remove the Clerk identity after deleting D1 and local account data.
- Apply the Worker migrations and set its `SUPPORT_EMAIL` to a monitored inbox.
- Use `<EXPO_PUBLIC_SYNC_API_URL>/delete-account` as the Google Play account
  deletion URL. The same host serves `/privacy`, `/terms`, and `/support`.

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

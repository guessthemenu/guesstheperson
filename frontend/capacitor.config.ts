import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.guesstheperson.app',
  appName: 'GuessThePerson',
  webDir: 'build',
  plugins: {
    Contacts: {
      displayFormat: 'name',
    },
  },
  server: {
    androidScheme: 'https',
  },
};

export default config;

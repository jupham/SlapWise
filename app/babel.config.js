// babel-preset-expo, not React Native's own preset. Expo inlines EXPO_PUBLIC_*
// variables through this preset; with module:@react-native/babel-preset they
// were left as a runtime process.env read, which is empty on a phone, so
// src/config/amplify.ts fell back to dev and every EAS production build talked
// to the dev stack. It also adds the worklets/Reanimated plugin itself, so that
// is not listed here.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};

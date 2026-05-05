// babel.config.js
//
// IMPORTANT:
//   1. `react-native-worklets/plugin` MUST be the LAST plugin. V SDK 54 +
//      Reanimated 4 se workletizace přesunula z `react-native-reanimated/plugin`
//      do samostatného `react-native-worklets/plugin`. Pokud přidáváš další
//      plugin, vlož ho PŘED worklets, jinak dostaneš cryptické worklet errors
//      at runtime.
//   2. `module-resolver` musí matchnout path aliases v `tsconfig.json` —
//      jakákoliv divergence = "cannot resolve module" Metro errors.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { jsxImportSource: 'react' }]],
    plugins: [
      [
        'module-resolver',
        {
          root: ['./'],
          alias: {
            '@': './',
            '@theme': './src/theme',
            '@components': './src/components',
            '@api': './src/api',
            '@hooks': './src/hooks',
            '@utils': './src/utils',
          },
        },
      ],
      // Worklets plugin MUST be last (Reanimated 4+ peer dep).
      'react-native-worklets/plugin',
    ],
  };
};

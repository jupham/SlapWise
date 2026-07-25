#!/usr/bin/env node
/**
 * Patches node_modules CMakeLists.txt files to link c++_shared.
 * Required because NDK 27 with c++_shared STL needs explicit linking.
 * Run automatically via postinstall.
 */
const fs = require('fs');
const path = require('path');

const failures = [];

function patchFile(relPath, patchFn) {
  const filePath = path.join(__dirname, '..', relPath);
  if (!fs.existsSync(filePath)) {
    failures.push(`${relPath} — file not found (module removed, renamed, or moved?)`);
    console.error(`[patch] FAIL ${relPath} — not found`);
    return;
  }
  const original = fs.readFileSync(filePath, 'utf8');
  // Checked here rather than per-patch so "nothing to do" stays distinct from
  // "the pattern stopped matching", which is a silent build breakage.
  if (original.includes('c++_shared')) {
    console.log(`[patch] ${relPath} — already links c++_shared`);
    return;
  }
  const patched = patchFn(original);
  if (patched === original) {
    failures.push(`${relPath} — link pattern did not match; upstream file format likely changed`);
    console.error(`[patch] FAIL ${relPath} — pattern did not match`);
    return;
  }
  fs.writeFileSync(filePath, patched, 'utf8');
  console.log(`[patch] ${relPath} — patched OK`);
}

// react-native-reanimated: add c++_shared before react-native-worklets::worklets
patchFile(
  'node_modules/react-native-reanimated/android/CMakeLists.txt',
  (src) => {
    if (src.includes('c++_shared')) return src;
    return src.replace(
      'react-native-worklets::worklets)',
      'c++_shared\n  react-native-worklets::worklets)'
    );
  }
);

// react-native-worklets: add c++_shared after fbjni::fbjni
patchFile(
  'node_modules/react-native-worklets/android/CMakeLists.txt',
  (src) => {
    if (src.includes('c++_shared')) return src;
    return src.replace('fbjni::fbjni)', 'fbjni::fbjni c++_shared)');
  }
);

// react-native-svg: add c++_shared to the fbjni-only target_link_libraries block
patchFile(
  'node_modules/react-native-svg/android/src/main/jni/CMakeLists.txt',
  (src) => {
    if (src.includes('c++_shared')) return src;
    return src.replace(
      /target_link_libraries\(\s*react_codegen_rnsvg\s*fbjni\s*\)/,
      'target_link_libraries(\n  react_codegen_rnsvg\n  fbjni\n  c++_shared\n)'
    );
  }
);

// react-native-safe-area-context: add c++_shared to both MERGED_SO branches
patchFile(
  'node_modules/react-native-safe-area-context/android/src/main/jni/CMakeLists.txt',
  (src) => {
    if (src.includes('c++_shared')) return src;
    // Add to the REACTNATIVE_MERGED_SO branch (reactnative at end)
    src = src.replace(
      /target_link_libraries\(\s*\$\{LIB_TARGET_NAME\}\s*fbjni\s*jsi\s*reactnative\s*\)/,
      'target_link_libraries(\n          ${LIB_TARGET_NAME}\n          fbjni\n          jsi\n          reactnative\n          c++_shared\n  )'
    );
    // Add to the else branch (yoga at end)
    src = src.replace(
      /(\s*rrc_view\s*turbomodulejsijni\s*yoga\s*\))/,
      '\n          rrc_view\n          turbomodulejsijni\n          yoga\n          c++_shared\n  )'
    );
    return src;
  }
);

// react-native-screens jni: add c++_shared after fbjni::fbjni
patchFile(
  'node_modules/react-native-screens/android/src/main/jni/CMakeLists.txt',
  (src) => {
    if (src.includes('c++_shared')) return src;
    return src.replace(
      /target_link_libraries\(\s*\$\{LIB_TARGET_NAME\}\s*ReactAndroid::reactnative\s*ReactAndroid::jsi\s*fbjni::fbjni\s*\)/,
      'target_link_libraries(\n  ${LIB_TARGET_NAME}\n  ReactAndroid::reactnative\n  ReactAndroid::jsi\n  fbjni::fbjni\n  c++_shared\n)'
    );
  }
);

// react-native-screens android: add c++_shared to both new arch and old arch branches
patchFile(
  'node_modules/react-native-screens/android/CMakeLists.txt',
  (src) => {
    if (src.includes('c++_shared')) return src;
    // New arch branch ends with android)
    src = src.replace(
      /target_link_libraries\(rnscreens\s*ReactAndroid::reactnative\s*ReactAndroid::jsi\s*fbjni::fbjni\s*android\s*\)/,
      'target_link_libraries(rnscreens\n        ReactAndroid::reactnative\n        ReactAndroid::jsi\n        fbjni::fbjni\n        android\n        c++_shared\n    )'
    );
    // Old arch branch ends with android)
    src = src.replace(
      /target_link_libraries\(rnscreens\s*ReactAndroid::jsi\s*android\s*\)/,
      'target_link_libraries(rnscreens\n        ReactAndroid::jsi\n        android\n        c++_shared\n    )'
    );
    return src;
  }
);

// react-native-gesture-handler: add c++_shared after fbjni::fbjni
patchFile(
  'node_modules/react-native-gesture-handler/android/src/main/jni/CMakeLists.txt',
  (src) => {
    if (src.includes('c++_shared')) return src;
    return src.replace(
      /target_link_libraries\(\s*\$\{PACKAGE_NAME\}\s*ReactAndroid::reactnative\s*ReactAndroid::jsi\s*fbjni::fbjni\s*\)/,
      'target_link_libraries(\n  ${PACKAGE_NAME}\n  ReactAndroid::reactnative\n  ReactAndroid::jsi\n  fbjni::fbjni\n  c++_shared\n)'
    );
  }
);

// expo-modules-core: add c++_shared to the main target_link_libraries block
patchFile(
  'node_modules/expo-modules-core/android/cmake/main.cmake',
  (src) => {
    if (src.includes('c++_shared')) return src;
    return src.replace(
      '${NEW_ARCHITECTURE_DEPENDENCIES}\n  expo-modules-jsi\n)',
      '${NEW_ARCHITECTURE_DEPENDENCIES}\n  expo-modules-jsi\n  c++_shared\n)'
    );
  }
);

if (failures.length > 0) {
  console.error(`\n[patch] ${failures.length} of these patches did not apply:`);
  for (const f of failures) console.error(`  - ${f}`);
  console.error(
    '\nEach one adds c++_shared to a module\'s CMake link list. NDK 27 does not link\n' +
    'the STL implicitly, so without them the Android build fails at link time with\n' +
    'undefined std:: symbols. Update the patterns in this script before building.'
  );
  // Android-only concern, so don't fail an EAS iOS build over it.
  if (process.env.EAS_BUILD_PLATFORM === 'ios') {
    console.error('[patch] EAS iOS build — continuing anyway, these only affect Android.');
  } else {
    process.exit(1);
  }
} else {
  console.log('[patch] All patches applied.');
}

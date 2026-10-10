import { Amplify } from 'aws-amplify';

// One amplifyconfiguration.<stage>.json per deployed stack, written by
// infrastructure/scripts/generate-amplify-config.js after `cdk deploy` and
// committed — none of it is secret, it ships inside every binary anyway.
//
// EXPO_PUBLIC_STAGE picks which one this build talks to. EAS sets it per build
// profile in eas.json; local runs default to dev. Expo inlines EXPO_PUBLIC_*
// at bundle time, so the choice is fixed per build.
//
// Metro only bundles literal require paths, so every stage is listed here and
// each require sits in its own try: Metro treats a require inside try/catch as
// optional, so a stage that has never been deployed does not break the bundle
// for the others. Selecting a missing one fails loudly below instead.
type AmplifyConfig = {
  API: { REST: { SlapWiseRest: { endpoint: string } } };
} & Record<string, unknown>;

function load(stage: string): AmplifyConfig | undefined {
  try {
    switch (stage) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      case 'dev': return require('../../amplifyconfiguration.dev.json');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      case 'prod': return require('../../amplifyconfiguration.prod.json');
    }
  } catch {
    // fall through: not deployed yet
  }
  return undefined;
}

export const stage = process.env.EXPO_PUBLIC_STAGE ?? 'dev';

const loaded = load(stage);
if (!loaded) {
  throw new Error(
    `No amplifyconfiguration.${stage}.json. Deploy the ${stage} stack ` +
      `(npm --prefix infrastructure run deploy${stage === 'dev' ? '' : `:${stage}`}) and commit the file it writes.`,
  );
}
export const amplifyConfig: AmplifyConfig = loaded;

export function configureAmplify(): void {
  Amplify.configure(amplifyConfig);
}

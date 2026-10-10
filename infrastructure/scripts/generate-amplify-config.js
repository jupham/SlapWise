#!/usr/bin/env node
/**
 * Reads cdk-outputs.json (produced by `cdk deploy --outputs-file cdk-outputs.json`)
 * and writes app/amplifyconfiguration.<stage>.json so the React Native app can
 * call Amplify.configure() with the deployed resource values.
 *
 * The stage comes from the stack names themselves (`<stage>-SlapWise*Stack`),
 * not from an argument, so the file written always matches the stack that was
 * just deployed. Commit the result: the app picks a stage per EAS profile.
 */

const fs = require('fs');
const path = require('path');

const cdkOutputsPath = path.join(__dirname, '..', 'cdk-outputs.json');

if (!fs.existsSync(cdkOutputsPath)) {
  console.error('cdk-outputs.json not found. Run `cdk deploy --outputs-file cdk-outputs.json` first.');
  process.exit(1);
}

const outputs = JSON.parse(fs.readFileSync(cdkOutputsPath, 'utf8'));

const stages = new Set(Object.keys(outputs).map((name) => name.split('-SlapWise')[0]));
if (stages.size !== 1) {
  console.error(`cdk-outputs.json should hold exactly one stage's stacks, found: ${[...stages].join(', ') || 'none'}`);
  process.exit(1);
}
const [stage] = stages;
const amplifyConfigPath = path.join(__dirname, '..', '..', 'app', `amplifyconfiguration.${stage}.json`); // app/ is sibling of infrastructure/

// Flatten all stack outputs into a single map
const flat = {};
for (const stackOutputs of Object.values(outputs)) {
  Object.assign(flat, stackOutputs);
}

const amplifyConfig = {
  Auth: {
    Cognito: {
      userPoolId: flat.UserPoolId,
      userPoolClientId: flat.UserPoolClientId,
      identityPoolId: flat.IdentityPoolId,
      region: flat.UserPoolRegion,
      loginWith: {
        email: true,
      },
    },
  },
  API: {
    GraphQL: {
      endpoint: flat.AppSyncEndpoint,
      region: flat.AppSyncRegion,
      defaultAuthMode: 'userPool',
    },
    REST: {
      SlapWiseRest: {
        endpoint: flat.ApiGatewayEndpoint,
        region: flat.AppSyncRegion,
      },
    },
  },
  // No Notifications block. Push goes through Expo's push service, which needs
  // no Amplify config — the app gets its token from expo-notifications and
  // registers it with the REST API above.
};

fs.writeFileSync(amplifyConfigPath, JSON.stringify(amplifyConfig, null, 2) + '\n');
console.log(`${path.basename(amplifyConfigPath)} written to ${amplifyConfigPath} — commit it.`);

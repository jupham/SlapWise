#!/usr/bin/env node
/**
 * Reads cdk-outputs.json (produced by `cdk deploy --outputs-file cdk-outputs.json`)
 * and writes amplifyconfiguration.json to the app/ directory so the React Native
 * app can call Amplify.configure() with the deployed resource values.
 */

const fs = require('fs');
const path = require('path');

const cdkOutputsPath = path.join(__dirname, '..', 'cdk-outputs.json');
const amplifyConfigPath = path.join(__dirname, '..', '..', 'app', 'amplifyconfiguration.json'); // app/ is sibling of infrastructure/

if (!fs.existsSync(cdkOutputsPath)) {
  console.error('cdk-outputs.json not found. Run `cdk deploy --outputs-file cdk-outputs.json` first.');
  process.exit(1);
}

const outputs = JSON.parse(fs.readFileSync(cdkOutputsPath, 'utf8'));

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
      SlapTrackerRest: {
        endpoint: flat.ApiGatewayEndpoint,
        region: flat.AppSyncRegion,
      },
    },
  },
  Notifications: {
    PushNotification: {
      AWSPinpoint: {
        appId: flat.PinpointAppId,
        region: flat.AppSyncRegion,
      },
    },
  },
};

fs.writeFileSync(amplifyConfigPath, JSON.stringify(amplifyConfig, null, 2));
console.log(`amplifyconfiguration.json written to ${amplifyConfigPath}`);

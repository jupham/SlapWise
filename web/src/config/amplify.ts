import { Amplify } from 'aws-amplify';
import amplifyConfig from '../../amplifyconfiguration.json';

export function configureAmplify(): void {
  Amplify.configure(amplifyConfig as Parameters<typeof Amplify.configure>[0]);
}

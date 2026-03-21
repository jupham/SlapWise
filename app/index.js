import 'react-native-get-random-values';
import { AppRegistry } from 'react-native';
import App from './src/App';
import { name as appName } from './app.json';
import { configureAmplify } from './src/config/amplify';

configureAmplify();
AppRegistry.registerComponent(appName, () => App);

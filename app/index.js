import 'react-native-reanimated';
import 'react-native-get-random-values';
import { registerRootComponent } from 'expo';
import App from './src/App';
import { configureAmplify } from './src/config/amplify';

configureAmplify();
registerRootComponent(App);

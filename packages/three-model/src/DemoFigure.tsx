// Shared entry point of the exercise demo figure, for the same reason and in
// the same way as ./BodyModel.tsx.
import type { ComponentType } from 'react';
import { Platform } from 'react-native';

import type { DemoFigureProps } from './BodyModelTypes';

/* eslint-disable @typescript-eslint/no-require-imports */
const DemoFigure: ComponentType<DemoFigureProps> =
  Platform.OS === 'web'
    ? (require('./web/DemoFigure.web').default as ComponentType<DemoFigureProps>)
    : (require('./native/DemoFigure.native').default as ComponentType<DemoFigureProps>);
/* eslint-enable @typescript-eslint/no-require-imports */

export default DemoFigure;

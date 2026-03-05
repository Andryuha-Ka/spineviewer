import * as spine41 from '@pixi-spine/all-4.1'
import { BasePixi7Adapter } from '../BasePixi7Adapter'

export default class Spine41Adapter extends BasePixi7Adapter {
  readonly detectedVersion = '4.1'
  protected get spineModule() { return spine41 }
}

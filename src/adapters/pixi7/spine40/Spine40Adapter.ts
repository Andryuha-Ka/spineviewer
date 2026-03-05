import * as spine40 from '@pixi-spine/all-4.0'
import { BasePixi7Adapter } from '../BasePixi7Adapter'

export default class Spine40Adapter extends BasePixi7Adapter {
  readonly detectedVersion = '4.0'
  protected get spineModule() { return spine40 }
}

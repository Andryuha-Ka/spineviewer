import * as spine38 from '@pixi-spine/all-3.8'
import { BasePixi7Adapter } from '../BasePixi7Adapter'

export default class Spine38Adapter extends BasePixi7Adapter {
  readonly detectedVersion = '3.8'
  protected get spineModule() { return spine38 }
}

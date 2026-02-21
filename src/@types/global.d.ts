import { Log } from "chrome-har";
import { FrameResourceExtended } from "../cli-core/analysis";

export {};

declare global {
  var har: Log['log'];
  var resources: FrameResourceExtended[];
}

import type { SourceAdapter } from "./types.js";
import { RemoteOkSource } from "./remoteok.js";
import { ProgramathorSource } from "./programathor.js";
import { GeekHunterSource } from "./geekhunter.js";
import { GupySource } from "./gupy.js";
import { IndeedSource } from "./indeed.js";
import { RemotiveSource } from "./remotive.js";
import { JobicySource } from "./jobicy.js";

// Registro de fontes. Cada fonte e independente; falhas sao isoladas.
export const sources: SourceAdapter[] = [
  new RemoteOkSource(),
  new ProgramathorSource(),
  new GeekHunterSource(),
  new GupySource(),
  new IndeedSource(),
  new RemotiveSource(),
  new JobicySource(),
];

export function getEnabledSources(): SourceAdapter[] {
  return sources.filter((s) => s.enabled);
}

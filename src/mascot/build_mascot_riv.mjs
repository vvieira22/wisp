import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const { createRiv } = await import(
  pathToFileURL("C:/Users/Vitor/Projects/rive-mcp/dist/rivWriter.js").href
);

const scene = JSON.parse(
  readFileSync(new URL("./mascot.scene.json", import.meta.url), "utf8"),
);
for (const img of scene.images) {
  img.bytes = new Uint8Array(readFileSync(img.pngPath));
}
const { bytes, warnings } = createRiv(scene);
if (warnings.length) console.log("warnings:", warnings.slice(0, 12).join("; "));
const out = new URL("../mascot.riv", import.meta.url);
writeFileSync(out, Buffer.from(bytes));
console.log("wrote", out.pathname, bytes.length, "bytes");

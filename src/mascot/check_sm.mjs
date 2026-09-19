import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const D = (f) => pathToFileURL(`C:/Users/Vitor/Projects/rive-mcp/dist/${f}`).href;
const [{ RiveHost }, { PAGE_SCRIPT }] = await Promise.all([
  import(D("riveHost.js")),
  import(D("pageScript.js")),
]);

const host = new RiveHost(PAGE_SCRIPT);
const bytes = readFileSync("C:/Users/Vitor/Desktop/projects/wisp/src/mascot.riv");
const result = await host.playStateMachine(bytes, {
  stateMachine: "Pet",
  width: 248,
  steps: [
    { advance: 0.2, capture: true },
    { input: "thinking", value: true, advance: 0.2, capture: true },
    { advance: 1.8, capture: true },
    { input: "thinking", value: false, advance: 0 },
    { input: "talking", value: true, advance: 0.8, capture: true },
  ],
});
console.log(JSON.stringify(result.report, null, 2));
result.frames.forEach((frame, i) => {
  writeFileSync(
    `C:/Users/Vitor/Desktop/projects/wisp/src/mascot/chat/sm-${i}.png`,
    Buffer.from(frame, "base64"),
  );
});
await host.close();

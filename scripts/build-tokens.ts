/** `pnpm tokens` — regenerate src/design/tokens.generated.css and src/design/tokens.json from src/design/tokens.ts. */
import { writeFileSync } from "node:fs";
import { generateCss, generateDtcg } from "../src/design/generate";

writeFileSync("src/design/tokens.generated.css", generateCss());
writeFileSync("src/design/tokens.json", generateDtcg());
console.log("tokens → src/design/tokens.generated.css, src/design/tokens.json");

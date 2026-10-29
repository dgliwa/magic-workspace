#!/usr/bin/env node
import { projectMagicProxy } from "./proxy-publication.js";
function value(args, name) {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : undefined;
}
async function main() {
    const args = process.argv.slice(2);
    const root = value(args, "--root");
    const command = args.filter((arg, index) => !["--root"].includes(args[index - 1] ?? "") && arg !== "--root");
    if (!root || command.length !== 3 || command[0] !== "proxy" || command[1] !== "get") {
        console.error("Usage: publication-cli --root <proxy-root> proxy get <record-id>");
        process.exitCode = 2;
        return;
    }
    try {
        console.log(JSON.stringify(await projectMagicProxy(root, command[2])));
    }
    catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = /not found/i.test(error instanceof Error ? error.message : String(error)) ? 3 : 1;
    }
}
await main();

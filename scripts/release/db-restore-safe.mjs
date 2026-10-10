#!/usr/bin/env node
import { restore, recoveryCli } from "./lib/safe-recovery.mjs";
await recoveryCli(restore);
